import { useState, useRef, useEffect, useCallback } from "react";
import { gsap } from "gsap";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faMagnifyingGlass,
  faWandMagicSparkles,
  faFire,
  faLeaf,
  faDrumstickBite,
  faStar,
  faGlobe,
  faBowlFood,
  faSeedling,
  faFish,
  faSun,
  faMugHot,
  faChevronRight,
  faSlidersH,
} from "@fortawesome/free-solid-svg-icons";
import { useDebounce } from "../hooks/useDebounce";
import { SPICE_COLORS } from "../types";
import type { Recipe } from "../types";
import { api } from "./lib/api";

interface Props {
  onResults: (recipes: Recipe[], query: string) => void;
  onSelect: (recipe: Recipe) => void;
  onCustom: () => void;
}

const CATEGORIES = [
  { label: "Mexican", icon: faFire, query: "Mexican" },
  { label: "Indian", icon: faSun, query: "Indian" },
  { label: "Italian", icon: faLeaf, query: "Italian" },
  { label: "BBQ", icon: faFire, query: "BBQ" },
  { label: "Cajun", icon: faDrumstickBite, query: "Cajun" },
  { label: "Mediterranean", icon: faGlobe, query: "Mediterranean" },
  { label: "Vegetarian", icon: faSeedling, query: "Vegetarian" },
  { label: "Seafood", icon: faFish, query: "Seafood" },
  { label: "Breakfast", icon: faMugHot, query: "Breakfast" },
  { label: "Asian", icon: faBowlFood, query: "Asian" },
];

const FEATURED = [
  { name: "Tacos al Pastor", category: "Mexican", slots: [1, 2, 3, 4, 5, 6, 7, 8] },
  { name: "Cajun Blackening", category: "Cajun", slots: [2, 3, 5, 6, 7, 8] },
  { name: "Chicken Tikka Masala", category: "Indian", slots: [1, 2, 3, 6, 7, 8] },
  { name: "Classic BBQ Rub", category: "BBQ", slots: [1, 2, 3, 4, 5, 6, 7, 8] },
  { name: "Shakshuka", category: "Mid. East", slots: [1, 2, 3, 4, 6, 8] },
  { name: "Jerk Chicken", category: "Caribbean", slots: [2, 3, 4, 5, 7, 8] },
];

const AI_MESSAGES = [
  "Consulting the spice archives…",
  "Asking a culinary expert…",
  "Crafting your blend…",
  "Calibrating grams per serving…",
  "Almost there…",
];

function AiLoadingOverlay({ query }: { query: string }) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const dotsRef = useRef<(HTMLSpanElement | null)[]>([]);
  const msgRef = useRef<HTMLParagraphElement>(null);
  const msgIdx = useRef(0);

  useEffect(() => {
    gsap.fromTo(overlayRef.current, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.4, ease: "power3.out" });
    const dots = dotsRef.current.filter(Boolean);
    const tl = gsap.timeline({ repeat: -1 });
    dots.forEach((dot, i) => {
      tl.to(dot, { scale: 1.7, opacity: 1, duration: 0.25, ease: "back.out(2)", yoyo: true, repeat: 1 }, i * 0.11);
    });
    const interval = setInterval(() => {
      if (!msgRef.current) return;
      msgIdx.current = (msgIdx.current + 1) % AI_MESSAGES.length;
      gsap.to(msgRef.current, {
        opacity: 0, y: -5, duration: 0.18, ease: "power2.in",
        onComplete: () => {
          if (msgRef.current) {
            msgRef.current.textContent = AI_MESSAGES[msgIdx.current];
            gsap.fromTo(msgRef.current, { opacity: 0, y: 7 }, { opacity: 1, y: 0, duration: 0.22, ease: "power3.out" });
          }
        },
      });
    }, 2200);
    return () => { tl.kill(); clearInterval(interval); };
  }, []);

  return (
    <div ref={overlayRef} className="mt-5 glass-card p-6 flex flex-col items-center gap-4">
      <div className="flex items-center gap-2">
        {Object.keys(SPICE_COLORS).map((slot) => (
          <span key={slot} ref={(el) => { dotsRef.current[Number(slot) - 1] = el; }}
            className="w-2 h-2 rounded-full opacity-35 flex-shrink-0"
            style={{ backgroundColor: SPICE_COLORS[Number(slot)] }} />
        ))}
      </div>
      <div className="relative">
        <div className="w-14 h-14 rounded-full flex items-center justify-center"
          style={{ background: "rgba(212,116,46,0.12)", border: "1px solid rgba(212,116,46,0.25)" }}>
          <FontAwesomeIcon icon={faWandMagicSparkles} className="text-accent text-2xl"
            style={{ animation: "aiPulse 1.4s ease-in-out infinite" }} />
        </div>
        <div className="absolute inset-0 rounded-full border border-accent/20"
          style={{ animation: "aiSpin 3s linear infinite" }} />
      </div>
      <div className="text-center">
        <p className="text-xs text-muted font-body uppercase tracking-widest font-semibold mb-1">
          No match — generating blend for
        </p>
        <p className="font-display text-xl font-semibold text-txt">&ldquo;{query}&rdquo;</p>
      </div>
      <p ref={msgRef} className="text-sm text-muted font-body font-light">{AI_MESSAGES[0]}</p>
      <div className="w-full h-px rounded-full overflow-hidden bg-surface">
        <div className="h-full" style={{
          width: "100%",
          background: "linear-gradient(90deg, transparent, #D4742E, transparent)",
          backgroundSize: "200% 100%",
          animation: "aiShimmer 1.8s infinite",
        }} />
      </div>
    </div>
  );
}

function FeaturedCard({ name, category, slots, onClick, delay }: {
  name: string; category: string; slots: number[]; onClick: () => void; delay: number;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    gsap.fromTo(ref.current, { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, delay, ease: "power3.out" });
  }, [delay]);

  const handleClick = () => {
    if (!ref.current) return;
    gsap.to(ref.current, {
      scale: 0.95, duration: 0.08, ease: "power2.out",
      onComplete: () => {
        gsap.to(ref.current, { scale: 1, duration: 0.3, ease: "back.out(2.5)", onComplete: onClick });
      },
    });
  };

  return (
    <button ref={ref} onClick={handleClick}
      className="glass-card p-3 text-left flex-shrink-0 w-40 flex flex-col gap-2
                 active:border-accent/50 transition-colors duration-150 focus:outline-none">
      <div className="flex gap-1 flex-wrap">
        {slots.map((s) => (
          <span key={s} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: SPICE_COLORS[s] }} />
        ))}
      </div>
      <div>
        <p className="text-[10px] text-muted font-body uppercase tracking-wider font-semibold mb-0.5">{category}</p>
        <p className="font-display text-sm font-semibold text-txt leading-tight">{name}</p>
      </div>
      <div className="flex items-center gap-1 mt-auto">
        <span className="text-[10px] text-accent font-body font-medium uppercase tracking-wider">Dispense</span>
        <FontAwesomeIcon icon={faChevronRight} className="text-accent text-[9px]" />
      </div>
    </button>
  );
}

function CategoryCard({ label, icon, query, onSearch }: {
  label: string; icon: (typeof CATEGORIES)[number]["icon"]; query: string; onSearch: (q: string) => Promise<void>;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const handleClick = () => {
    if (!ref.current) return;
    gsap.to(ref.current, {
      scale: 0.95, duration: 0.08, ease: "power2.out",
      onComplete: () => {
        gsap.to(ref.current, {
          scale: 1, duration: 0.28, ease: "back.out(2.5)",
          onComplete: () => { void onSearch(query); },
        });
      },
    });
  };

  return (
    <button ref={ref} onClick={handleClick}
      className="focus:outline-none flex flex-col items-center gap-1.5 p-2 text-center w-full min-w-0 max-w-full
                 active:border-accent/50 transition-colors duration-150"
      style={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 16 }}>
      <div style={{
        width: 36, height: 36, borderRadius: 10, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(212,116,46,0.09)", border: "1px solid rgba(212,116,46,0.18)",
      }}>
        <FontAwesomeIcon icon={icon} className="text-accent" style={{ fontSize: 14 }} />
      </div>
      <span className="font-body font-medium text-txt text-[11px] leading-tight w-full break-words">{label}</span>
    </button>
  );
}

export function SearchScreen({ onResults, onSelect, onCustom }: Props) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState("");

  const searchRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const customBtnRef = useRef<HTMLButtonElement>(null);
  const debouncedQuery = useDebounce(query, 2500);

  useEffect(() => {
    const tl = gsap.timeline();
    tl.fromTo(searchRef.current, { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: "power3.out" })
      .fromTo(bodyRef.current, { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: "power3.out" }, "-=0.2");
  }, []);

  const doSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setLoading(true); setAiLoading(false); setError("");
    const aiTimer = setTimeout(() => setAiLoading(true), 600);
    try {
      const data = await api.search(trimmed);
      clearTimeout(aiTimer); setAiLoading(false);
      if (data.results.length === 0) { setError("No recipes found. Try something else."); }
      else { onResults(data.results, trimmed); }
    } catch {
      clearTimeout(aiTimer); setAiLoading(false);
      setError("Connection error. Check the server is running.");
    } finally { setLoading(false); }
  }, [onResults]);

  const doFeatured = useCallback(async (name: string) => {
    setLoading(true); setError("");
    try {
      const data = await api.search(name);
      if (data.results.length > 0) { onSelect(data.results[0]); }
      else { setError("Recipe not found."); }
    } catch { setError("Connection error."); }
    finally { setLoading(false); }
  }, [onSelect]);

  useEffect(() => {
    if (debouncedQuery.trim()) doSearch(debouncedQuery);
    else { setError(""); setAiLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery]);

  const handleKey = (e: React.KeyboardEvent) => { if (e.key === "Enter") doSearch(query); };
  const handleChange = (v: string) => {
    setQuery(v);
    if (!v.trim()) { setError(""); setAiLoading(false); setLoading(false); }
  };

  // Satisfying spring click — identical pattern to FeaturedCard / SpiceCard
  const handleCustomClick = () => {
    const btn = customBtnRef.current;
    if (!btn) return;
    gsap.to(btn, {
      scale: 0.97, duration: 0.08, ease: "power2.out",
      onComplete: () => {
        gsap.to(btn, { scale: 1, duration: 0.35, ease: "back.out(2.5)", onComplete: onCustom });
      },
    });
  };

  const isSearching = loading && !aiLoading;

  return (
    <div className="flex-1 overflow-y-auto min-w-0" style={{ WebkitOverflowScrolling: "touch" }}>
      <div className="flex flex-col px-5 pb-safe min-w-0 max-w-full">

        {/* Search bar */}
        <div ref={searchRef} className="pt-2 w-full min-w-0 max-w-full">
          <div className="flex items-center gap-3 glass-card px-3 py-3.5 w-full min-w-0 max-w-full
                          focus-within:border-accent/50 transition-colors duration-200">
            <FontAwesomeIcon icon={isSearching ? faWandMagicSparkles : faMagnifyingGlass}
              className={`flex-shrink-0 text-base transition-colors duration-200 ${isSearching ? "animate-pulse text-accent" : "text-muted"}`} />
            <input value={query} onChange={(e) => handleChange(e.target.value)} onKeyDown={handleKey}
              placeholder="tacos, butter chicken…"
              className="flex-1 min-w-0 w-0 bg-transparent text-txt text-base font-body placeholder-muted/50"
              autoComplete="off" autoCorrect="off" spellCheck={false} inputMode="search" />
            {isSearching && (
              <div className="flex items-center gap-0.5 flex-shrink-0">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="w-1 h-1 rounded-full bg-accent"
                    style={{ animation: `aiBounce 1s ease-in-out ${i * 0.15}s infinite` }} />
                ))}
              </div>
            )}
          </div>
          {error && !aiLoading && (
            <p className="text-error text-sm mt-2 font-body font-light">{error}</p>
          )}
        </div>

        {aiLoading && query.trim() && <AiLoadingOverlay query={query.trim()} />}

        {!aiLoading && (
          <div ref={bodyRef} className="flex flex-col gap-5 mt-5 w-full min-w-0 max-w-full">

            {/* Featured blends */}
            <section className="w-full min-w-0 max-w-full">
              <div className="flex items-center gap-2 mb-3">
                <FontAwesomeIcon icon={faStar} className="text-accent text-xs" />
                <p className="text-xs text-muted font-body uppercase tracking-widest font-semibold">Featured Blends</p>
              </div>
              <div className="flex gap-2.5 overflow-x-auto overflow-y-hidden pb-1 pr-5 w-full min-w-0 max-w-full"
                style={{ scrollbarWidth: "none" }}>
                {FEATURED.map((f, i) => (
                  <FeaturedCard key={f.name} name={f.name} category={f.category} slots={f.slots}
                    onClick={() => doFeatured(f.name)} delay={i * 0.06} />
                ))}
              </div>
            </section>

            {/* Browse by cuisine */}
            <section className="w-full min-w-0 max-w-full">
              <div className="flex items-center gap-2 mb-3">
                <FontAwesomeIcon icon={faGlobe} className="text-accent text-xs" />
                <p className="text-xs text-muted font-body uppercase tracking-widest font-semibold">Browse by Cuisine</p>
              </div>
              <div className="grid grid-cols-2 gap-2 w-full min-w-0 max-w-full">
                {CATEGORIES.map((cat) => (
                  <CategoryCard key={cat.label} label={cat.label} icon={cat.icon} query={cat.query} onSearch={doSearch} />
                ))}
              </div>
            </section>

            {/* Create custom blend */}
            <section className="w-full min-w-0 max-w-full pb-2">
              <button
                ref={customBtnRef}
                onClick={handleCustomClick}
                className="w-full glass-card p-4 flex items-center justify-between
                           transition-colors duration-150 focus:outline-none"
                style={{ borderRadius: 20 }}
              >
                <div className="flex items-center gap-3">
                  <div style={{
                    width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: "rgba(212,116,46,0.09)", border: "1px solid rgba(212,116,46,0.18)",
                  }}>
                    <FontAwesomeIcon icon={faSlidersH} className="text-accent" style={{ fontSize: 14 }} />
                  </div>
                  <div className="text-left">
                    <p className="font-body font-medium text-txt text-sm">Create Custom Blend</p>
                    <p className="font-body font-light text-[11px]" style={{ color: "#6A6662" }}>
                      Build your own spice mix
                    </p>
                  </div>
                </div>
                <FontAwesomeIcon icon={faChevronRight} className="text-accent text-xs flex-shrink-0" />
              </button>
            </section>

          </div>
        )}
      </div>

      <style>{`
        @keyframes aiBounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40% { transform: translateY(-4px); opacity: 1; }
        }
        @keyframes aiSpin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes aiPulse {
          0%, 100% { opacity: 0.7; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.08); }
        }
        @keyframes aiShimmer {
          0%   { background-position: -200% 0; }
          100% { background-position:  200% 0; }
        }
      `}</style>
    </div>
  );
}