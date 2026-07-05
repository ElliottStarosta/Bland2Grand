// SSE hook: connects to /api/status/stream for real-time dispense updates.

import { useCallback, useEffect, useRef, useState } from "react";
import type { DispenseSession, SlotProgress, SSEEvent } from "../types";
import { playSlotVoiceLine } from "./slotAudio";

// Default idle state before any session_start event is received
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

// Module-level audio scheduling prevents voice lines from overlapping with indexing SFX
let audioPlayAt: number | null = null;
let audioPendingSlot: number | null = null;
let pollInterval: ReturnType<typeof setInterval> | null = null;

// Polling loop checks for scheduled audio playback
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

  // Handles incoming SSE events and updates session state accordingly
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
          cancelAudio(); // Cancel voice audio when indexing starts
          const slots = prev.slots.map((s) =>
            s.slot === event.slot ? { ...s, status: "indexing" } : s,
          );
          return { ...prev, slots, activeSlotIndex: event.slot_index };
        }

        case "nearly_there": {
          // Play voice cue for the spice being dispensed
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
                  status: "dispensing",
                  target: event.target_weight,
                  current: 0,
                }
              : s,
          );
          return { ...prev, slots, activeSlotIndex: event.slot_index };
        }

        case "weight_update": {
          const slots = prev.slots.map((s) =>
            s.slot !== event.slot
              ? s
              : {
                  ...s,
                  current: Math.max(s.current, event.current_weight), // Prevent visual regression
                },
          );
          const totalWeight = slots.reduce((sum, s) => sum + s.current, 0);
          return { ...prev, slots, totalWeight };
        }

        case "spice_complete": {
          const slots = prev.slots.map((s) =>
            s.slot === event.slot
              ? {
                  ...s,
                  current: Math.max(s.current, event.actual),
                  actual: Math.max(s.current, event.actual),
                  status: event.status === "done" ? "done" : "error",
                }
              : s,
          );
          const totalWeight = slots.reduce((sum, s) => sum + s.current, 0);
          return {
            ...prev,
            slots,
            totalWeight,
            lastCompletedSlot: event.slot,
          };
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

  // Opens SSE connection without POSTing
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

  // Opens SSE, waits for 'connected' ack, then POSTs to /api/dispense
  // Critical: ensures no backend events are missed between connection and dispense start
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
          if (!dispatchedDispense) {
            reject(
              new Error("SSE connection failed before dispense could start."),
            );
          }
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

          // Once connected, trigger dispense
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

  // Initialize audio poller on mount
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