import { useRef, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronLeft } from "@fortawesome/free-solid-svg-icons";
import { gsap } from "gsap";
import type { Screen } from "../types";
import logoUrl from "../../public/logo.png";

interface Props {
  screen: Screen;
  onBack?: () => void;
}

const TITLES: Record<Screen, string> = {
  search:     "bland2grand",
  results:    "Recipes",
  serving:    "Servings",
  dispensing: "Dispensing",
  complete:   "Ready",
  custom:     "Custom Blend",
};

const SUBTITLES: Record<Screen, string> = {
  search:     "Spice Dispensing System",
  results:    "Select your spice blend",
  serving:    "How many portions?",
  dispensing: "Measuring your spices",
  complete:   "Your blend is ready",
  custom:     "Build your own mix",
};

const BASE_TITLE_STYLE = {
  fontFamily: "Cormorant, serif",
  fontWeight: 600,
  fontStyle: "italic",
  color: "#EDE9E0",
  letterSpacing: "-0.025em",
  lineHeight: 1,
} as const;

export function Header({ screen, onBack }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const titleRef     = useRef<HTMLHeadingElement>(null);
  const subtitleRef  = useRef<HTMLParagraphElement>(null);
  const prevScreen   = useRef(screen);
  const isSearch     = screen === "search";

  useEffect(() => {
    if (prevScreen.current === screen) return;
    prevScreen.current = screen;
    gsap.timeline()
      .to([titleRef.current, subtitleRef.current], {
        y: -6, opacity: 0, duration: 0.15, stagger: 0.03, ease: "power2.in",
      })
      .fromTo(
        [titleRef.current, subtitleRef.current],
        { y: 8, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.25, stagger: 0.05, ease: "power3.out" },
      );
  }, [screen]);

  useEffect(() => {
    gsap.fromTo(containerRef.current,
      { y: -16, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.6, ease: "power3.out" },
    );
  }, []);

  return (
    <header
      ref={containerRef}
      className="flex items-center justify-between px-5 pt-safe pb-4"
      style={{ borderBottom: "1px solid rgba(37,34,32,0.6)" }}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {isSearch && (
          <img
            src={logoUrl}
            alt="Bland2Grand"
            width={64}
            height={64}
            style={{ objectFit: "contain", flexShrink: 0 }}
          />
        )}

        <div className="min-w-0">
          <h1
            ref={titleRef}
            style={{ ...BASE_TITLE_STYLE, fontSize: isSearch ? "1.5rem" : "1.6rem" }}
          >
            {isSearch ? (
              <>bland<span style={{ fontSize: "2.1rem" }}>2</span>grand</>
            ) : (
              TITLES[screen]
            )}
          </h1>
          <p
            ref={subtitleRef}
            className="font-body truncate"
            style={isSearch ? {
              fontSize: "0.52rem",
              fontWeight: 400,
              color: "#5a5652",
              letterSpacing: "0.34em",
              textTransform: "uppercase",
              marginTop: 5,
            } : {
              fontSize: 11,
              fontWeight: 300,
              color: "#6A6662",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              marginTop: 4,
            }}
          >
            {SUBTITLES[screen]}
          </p>
        </div>
      </div>

      {onBack && (
        <button
          onClick={onBack}
          className="ml-3 flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-2xl active:scale-90 transition-all duration-150"
          style={{ background: "#161411", border: "1px solid #252220" }}
          aria-label="Go back"
        >
          <FontAwesomeIcon icon={faChevronLeft} style={{ color: "#6A6662", fontSize: 13 }} />
        </button>
      )}
    </header>
  );
}