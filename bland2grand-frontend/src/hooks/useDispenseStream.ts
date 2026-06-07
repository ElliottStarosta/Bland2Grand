// SSE hook: opens /api/status/stream and folds events into dispense session state.
// connectAndDispense waits for the 'connected' ack before POSTing so we don't miss events.

import { useCallback, useEffect, useRef, useState } from "react";
import type { DispenseSession, SlotProgress, SSEEvent } from "../types";
import { playSlotVoiceLine } from "./slotAudio";

// Default session shape before Flask sends session_start.
const IDLE: DispenseSession = {
  recipeName: "",
  servingCount: 1,
  slots: [],
  activeSlotIndex: -1,
  isComplete: false,
  isError: false,
  totalWeight: 0,
  totalTarget: 0,
  lastCompletedSlot: 1,
  awaitingBowl: true,
};

// Module-level audio scheduler — defers slot voice lines so they don't overlap indexing SFX.
let audioPlayAt: number | null = null;
let audioPendingSlot: number | null = null;
let pollInterval: ReturnType<typeof setInterval> | null = null;

function startAudioPoller() {
  if (pollInterval) return;
  pollInterval = setInterval(() => {
    if (audioPlayAt === null || audioPendingSlot === null) return;
    if (Date.now() >= audioPlayAt) {
      console.log(`[Audio] playing slot ${audioPendingSlot}`);
      playSlotVoiceLine(audioPendingSlot);
      audioPlayAt = null;
      audioPendingSlot = null;
    }
  }, 250);
}

function stopAudioPoller() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

function cancelAudio() {
  audioPlayAt = null;
  audioPendingSlot = null;
}

export function useDispenseStream() {
  const [session, setSession] = useState<DispenseSession>(IDLE);
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const activeRef = useRef(false);

  // Pure reducer: map each SSE payload to the next DispenseSession snapshot.
  const handleMessage = useCallback((e: MessageEvent) => {
    if (!activeRef.current) return;
    let event: SSEEvent;
    try {
      event = JSON.parse(e.data) as SSEEvent;
    } catch {
      return;
    }

    setSession((prev) => {
      switch (event.type) {
        case "connected":
        case "heartbeat":
          return prev;
        case "no_bowl":
            return { ...prev, awaitingBowl: true };

        case "bowl_detected":
            return { ...prev, awaitingBowl: false };

        case "session_start": {
          const slots: SlotProgress[] = event.slots.map((s) => ({
            slot: s.slot,
            name: s.name,
            target: s.target,
            current: 0,
            status: "pending",
          }));
          return {
            ...IDLE,
            recipeName: event.recipe_name,
            servingCount: prev.servingCount,
            slots,
            activeSlotIndex: -1,
            lastCompletedSlot: 1,
            totalTarget: slots.reduce((sum, s) => sum + s.target, 0),
            totalWeight: 0,
          };
        }

        case "indexing": {
          cancelAudio();
          const slots = prev.slots.map((s) =>
            s.slot === event.slot ? { ...s, status: "indexing" as const } : s,
          );
          return { ...prev, slots, activeSlotIndex: event.slot_index };
        }

        case "nearly_there": {
          if (!prev.isComplete && !prev.isError && prev.slots.length > 0) {
            playSlotVoiceLine(event.slot);
          }
          return prev;
        }

        case "dispensing_start": {
          const slots = prev.slots.map((s) =>
            s.slot === event.slot
              ? {
                  ...s,
                  status: "dispensing" as const,
                  target: event.target_weight,
                  current: 0,
                }
              : s,
          );
          return { ...prev, slots, activeSlotIndex: event.slot_index };
        }

        case "weight_update": {
          const slots = prev.slots.map((s) =>
            s.slot !== event.slot ? s : { ...s, current: event.current_weight },
          );
          const totalWeight = slots.reduce((sum, s) => sum + s.current, 0);
          return { ...prev, slots, totalWeight };
        }

        case "spice_complete": {
          const slots = prev.slots.map((s) =>
            s.slot === event.slot
              ? {
                  ...s,
                  current: event.actual,
                  actual: event.actual,
                  status:
                    event.status === "done"
                      ? ("done" as const)
                      : ("error" as const),
                }
              : s,
          );
          const totalWeight = slots.reduce((sum, s) => sum + s.current, 0);
          return { ...prev, slots, totalWeight, lastCompletedSlot: event.slot };
        }

        case "session_complete":
          stopAudioPoller();
          return { ...prev, isComplete: true, activeSlotIndex: -1 };

        case "session_error":
          stopAudioPoller();
          return {
            ...prev,
            isError: true,
            errorMessage: event.message,
            activeSlotIndex: -1,
          };

        default:
          return prev;
      }
    });
  }, []);

  // Open SSE only (caller POSTs dispense separately).
  const connect = useCallback(() => {
    if (esRef.current) esRef.current.close();

    const es = new EventSource("/api/status/stream");
    esRef.current = es;
    activeRef.current = true;

    es.onopen = () => {
      console.log("[SSE] connected");
      setConnected(true);
    };
    es.onmessage = handleMessage;
    es.onerror = () => {
      console.log("[SSE] error");
      setConnected(false);
    };

    return es;
  }, [handleMessage]);

  // Open SSE first, wait for connected, then POST /api/dispense so no events are dropped.
  const connectAndDispense = useCallback(
    (recipeId: number, servingCount: number): Promise<void> => {
      return new Promise((resolve, reject) => {
        if (esRef.current) esRef.current.close();

        const es = new EventSource("/api/status/stream");
        esRef.current = es;
        activeRef.current = true;

        let dispatchedDispense = false;

        es.onopen = () => setConnected(true);

        es.onerror = () => {
          setConnected(false);
          if (!dispatchedDispense)
            reject(
              new Error("SSE connection failed before dispense could start."),
            );
        };

        es.onmessage = (e: MessageEvent) => {
          console.log("[SSE raw]", e.data);
          if (!activeRef.current) return;

          let event: SSEEvent;
          try {
            event = JSON.parse(e.data) as SSEEvent;
          } catch {
            return;
          }

          if (event.type === "connected" && !dispatchedDispense) {
            dispatchedDispense = true;
            fetch("/api/dispense", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                recipe_id: recipeId,
                serving_count: servingCount,
              }),
            })
              .then(async (r) => {
                if (!r.ok) {
                  const body = await r
                    .json()
                    .catch(() => ({ error: "Unknown error" }));
                  reject(new Error(body.error ?? `HTTP ${r.status}`));
                } else {
                  resolve();
                }
              })
              .catch((err: unknown) => {
                reject(err instanceof Error ? err : new Error(String(err)));
              });
          }

          handleMessage(e);
        };
      });
    },
    [handleMessage],
  );

  const disconnect = useCallback(() => {
    activeRef.current = false;
    esRef.current?.close();
    esRef.current = null;
    setConnected(false);
  }, []);

  const reset = useCallback(() => {
    disconnect();
    stopAudioPoller();
    cancelAudio();
    setSession(IDLE);
  }, [disconnect]);

  useEffect(() => {
    startAudioPoller();
    return () => {
      activeRef.current = false;
      esRef.current?.close();
      stopAudioPoller();
    };
  }, []);

  return {
    session,
    connected,
    connect,
    connectAndDispense,
    disconnect,
    reset,
    setSession,
  };
}
