import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faRotate,
  faDroplet,
  faTimes,
  faSpinner,
  faBowlFood,
} from "@fortawesome/free-solid-svg-icons";
import type { DispenseSession } from "../types";
import { Bowl } from "../components/Bowl";
import { SlotRow } from "../components/SlotRow";

interface Props {
  session: DispenseSession;
  onStop?: () => void;
}

export function DispensingScreen({ session, onStop }: Props) {
  const [stopping, setStopping] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const bowlPromptRef = useRef<HTMLDivElement>(null);
  const bowlSvgRef = useRef<HTMLDivElement>(null);
  const prevAwaitingBowl = useRef(true); // starts true — waiting on mount

  const handleStop = async () => {
    if (stopping) return;
    setStopping(true);
    try {
      await fetch("/api/stop", { method: "POST" });
    } catch {
      // session_error SSE will handle navigation regardless
    }
  };

  // Entrance animation for main sections (not the bowl area — handled separately)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const sections = el.querySelectorAll("[data-s]");
    gsap.fromTo(
      sections,
      { y: 16, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.4, stagger: 0.08, ease: "power3.out" },
    );

    if (session.awaitingBowl) {
      // Show prompt
      gsap.fromTo(
        bowlPromptRef.current,
        { opacity: 0, y: 16, scale: 0.96 },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 0.45,
          ease: "back.out(1.8)",
          delay: 0.2,
        },
      );
    } else {
      // Bowl already detected on mount — skip prompt, show SVG immediately
      gsap.set(bowlPromptRef.current, { display: "none" });
      gsap.set(bowlSvgRef.current, { display: "block" });
      gsap.fromTo(
        bowlSvgRef.current,
        { opacity: 0, y: 16, scale: 0.97 },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 0.4,
          ease: "back.out(1.6)",
          delay: 0.2,
        },
      );
    }

    // Sync the ref so the swap effect doesn't fire on first render
    prevAwaitingBowl.current = session.awaitingBowl;
  }, []);

  // Swap between prompt and bowl SVG when awaitingBowl changes
  useEffect(() => {
    const prompt = bowlPromptRef.current;
    const svg = bowlSvgRef.current;
    if (!prompt || !svg) return;

    // Skip the very first render — mount effect handles it
    if (prevAwaitingBowl.current === session.awaitingBowl) return;
    prevAwaitingBowl.current = session.awaitingBowl;

    if (session.awaitingBowl) {
      // Bowl removed — hide SVG, show prompt
      gsap.to(svg, {
        opacity: 0,
        y: -10,
        scale: 0.96,
        duration: 0.22,
        ease: "power2.in",
        onComplete: () => {
          gsap.set(svg, { display: "none" });
          gsap.set(prompt, { display: "flex" });
          gsap.fromTo(
            prompt,
            { opacity: 0, y: 16, scale: 0.96 },
            {
              opacity: 1,
              y: 0,
              scale: 1,
              duration: 0.4,
              ease: "back.out(1.8)",
            },
          );
        },
      });
    } else {
      // Bowl placed — hide prompt, show SVG
      gsap.to(prompt, {
        opacity: 0,
        y: -10,
        scale: 0.96,
        duration: 0.22,
        ease: "power2.in",
        onComplete: () => {
          gsap.set(prompt, { display: "none" });
          gsap.set(svg, { display: "block" });
          gsap.fromTo(
            svg,
            { opacity: 0, y: 16, scale: 0.97 },
            {
              opacity: 1,
              y: 0,
              scale: 1,
              duration: 0.4,
              ease: "back.out(1.6)",
            },
          );
        },
      });
    }
  }, [session.awaitingBowl]);

  const activeSlot = session.slots.find(
    (s) => s.status === "dispensing" || s.status === "indexing",
  );

  const completedCount = session.slots.filter(
    (s) => s.status === "done" || s.status === "error",
  ).length;
  const totalCount = session.slots.length;
  const overallPct =
    totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const phase = session.awaitingBowl
    ? "Waiting for bowl…"
    : activeSlot?.status === "indexing"
      ? "Rotating…"
      : activeSlot?.status === "dispensing"
        ? activeSlot.name
        : session.slots.every((s) => s.status === "pending")
          ? "Starting…"
          : "Finishing…";

  const R = 13;
  const CIRC = 2 * Math.PI * R;
  const dash = (overallPct / 100) * CIRC;

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto"
      style={{ WebkitOverflowScrolling: "touch" }}
    >
      <div className="flex flex-col px-4 pb-safe gap-3">
        {/* Status bar */}
        <div data-s className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            {session.awaitingBowl && (
              <FontAwesomeIcon
                icon={faBowlFood}
                className="text-accent text-xs flex-shrink-0"
                style={{ animation: "bowlPulse 1.4s ease-in-out infinite" }}
              />
            )}
            {!session.awaitingBowl && activeSlot?.status === "indexing" && (
              <FontAwesomeIcon
                icon={faRotate}
                className="text-accent text-xs flex-shrink-0 animate-spin"
              />
            )}
            {!session.awaitingBowl && activeSlot?.status === "dispensing" && (
              <FontAwesomeIcon
                icon={faDroplet}
                className="text-accent text-xs flex-shrink-0"
              />
            )}
            <span className="text-sm text-txt font-body truncate">{phase}</span>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0 ml-3">
            <span className="text-xs text-muted font-body">{overallPct}%</span>
            <svg
              width="34"
              height="34"
              viewBox="0 0 34 34"
              className="-rotate-90"
            >
              <circle
                cx="17"
                cy="17"
                r={R}
                fill="none"
                stroke="rgba(255,255,255,0.06)"
                strokeWidth="2.5"
              />
              <circle
                cx="17"
                cy="17"
                r={R}
                fill="none"
                stroke="#D4742E"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeDasharray={`${dash} ${CIRC - dash}`}
                style={{ transition: "stroke-dasharray 0.5s ease" }}
              />
            </svg>

            {/* Stop button */}
            {onStop && (
              <button
                onClick={handleStop}
                disabled={stopping}
                className="w-9 h-9 rounded-xl flex items-center justify-center
                           transition-all duration-150 active:scale-90 disabled:opacity-40 focus:outline-none"
                style={{
                  background: "rgba(184,56,56,0.12)",
                  border: "1px solid rgba(184,56,56,0.3)",
                }}
                aria-label="Stop dispensing"
              >
                <FontAwesomeIcon
                  icon={stopping ? faSpinner : faTimes}
                  className={stopping ? "animate-spin" : ""}
                  style={{ fontSize: 13, color: "#E07070" }}
                />
              </button>
            )}
          </div>
        </div>

        {/* Bowl prompt — shown while awaiting bowl, hidden once detected */}
        <div
          ref={bowlPromptRef}
          className="glass-card px-5 py-8 flex-col items-center gap-5 text-center"
          style={{
            display: "flex",
            opacity: 0,
            border: "1px solid rgba(200,105,42,0.35)",
          }}
        >
          {/* Pulsing icon */}
          <div style={{ position: "relative", width: 72, height: 72 }}>
            <div
              style={{
                position: "absolute",
                inset: -10,
                borderRadius: "50%",
                border: "1px solid rgba(200,105,42,0.2)",
                animation: "bowlRing 2s ease-out infinite",
              }}
            />
            <div
              style={{
                position: "absolute",
                inset: -4,
                borderRadius: "50%",
                border: "1px solid rgba(200,105,42,0.15)",
                animation: "bowlRing 2s ease-out 0.4s infinite",
              }}
            />
            <div
              className="w-full h-full rounded-full flex items-center justify-center"
              style={{
                background: "rgba(200,105,42,0.1)",
                border: "1px solid rgba(200,105,42,0.3)",
              }}
            >
              <FontAwesomeIcon
                icon={faBowlFood}
                style={{
                  fontSize: 30,
                  color: "#D4742E",
                  filter: "drop-shadow(0 0 12px rgba(212,116,46,0.55))",
                  animation: "bowlPulse 1.8s ease-in-out infinite",
                }}
              />
            </div>
          </div>

          {/* Text */}
          <div>
            <p
              className="font-display font-semibold text-txt"
              style={{ fontSize: 24 }}
            >
              Place your bowl
            </p>
            <p
              className="font-body font-light mt-2 leading-relaxed"
              style={{ fontSize: 13, color: "#6A6662" }}
            >
              Put a bowl on the scale to continue.
              <br />
              Dispensing will start automatically.
            </p>
          </div>

          {/* Waiting dots */}
          <div className="flex items-center gap-2.5">
            <div className="flex gap-1.5">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="rounded-full bg-accent"
                  style={{
                    width: 6,
                    height: 6,
                    display: "block",
                    animation: `bowlWait 1.1s ease-in-out ${i * 0.18}s infinite`,
                  }}
                />
              ))}
            </div>
            <span
              className="font-body font-light"
              style={{ fontSize: 12, color: "#6A6662" }}
            >
              Waiting for bowl…
            </span>
          </div>
        </div>

        {/* Bowl SVG — hidden until bowl is detected */}
        <div
          ref={bowlSvgRef}
          className="glass-card px-3 pt-2 pb-2"
          style={{ display: "none", opacity: 0 }}
        >
          <Bowl
            slots={session.slots}
            totalTarget={session.totalTarget}
            totalWeight={session.totalWeight}
            activeSlot={activeSlot?.slot}
          />
          <div className="mt-1">
            <div className="h-0.5 bg-surface rounded-full overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-all duration-500 ease-out"
                style={{
                  width: `${session.totalTarget > 0 ? Math.min((session.totalWeight / session.totalTarget) * 100, 100) : 0}%`,
                }}
              />
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[10px] text-muted font-body font-light">
                {session.totalWeight.toFixed(1)}g
              </span>
              <span className="text-[10px] text-muted font-body font-light">
                {session.totalTarget.toFixed(1)}g
              </span>
            </div>
          </div>
        </div>

        {/* Slot rows */}
        <div data-s className="glass-card px-3 py-1">
          <div className="divide-y divide-border">
            {session.slots.map((s) => (
              <SlotRow
                key={s.slot}
                slot={s}
                isActive={activeSlot?.slot === s.slot}
              />
            ))}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes bowlWait {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.35; }
          40% { transform: translateY(-5px); opacity: 1; }
        }
        @keyframes bowlPulse {
          0%, 100% { opacity: 0.7; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.12); }
        }
        @keyframes bowlRing {
          0% { transform: scale(1); opacity: 0.5; }
          100% { transform: scale(1.5); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
