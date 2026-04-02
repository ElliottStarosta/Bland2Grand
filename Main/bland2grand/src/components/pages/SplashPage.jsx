// pages/SplashPage.jsx
import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { gsap } from 'gsap';
import Button from '../ui/Button';
import { faArrowRight } from '@fortawesome/free-solid-svg-icons';
import './SplashPage.css';

export default function SplashPage() {
  const navigate    = useNavigate();
  const containerRef = useRef(null);
  const logoRef      = useRef(null);
  const subRef       = useRef(null);
  const illustRef    = useRef(null);
  const ctaRef       = useRef(null);
  const hintRef      = useRef(null);

  useEffect(() => {
    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

    tl.from(logoRef.current, { opacity: 0, y: 32, duration: 0.7 })
      .from(subRef.current,  { opacity: 0, y: 16, duration: 0.5 }, '-=0.3')
      .from(illustRef.current, { opacity: 0, scale: 0.88, duration: 0.65 }, '-=0.3')
      .from(ctaRef.current,  { opacity: 0, y: 20, duration: 0.5 }, '-=0.2')
      .from(hintRef.current, { opacity: 0, duration: 0.4 }, '-=0.2');

    return () => tl.kill();
  }, []);

  return (
    <div className="splash" ref={containerRef}>
      {/* Background grid texture */}
      <div className="splash__grid" aria-hidden="true" />

      <div className="splash__content">
        <header className="splash__header">
          <div className="splash__wordmark" ref={logoRef}>
            <span className="splash__bland">Bland</span>
            <span className="splash__separator">2</span>
            <span className="splash__grand">Grand</span>
          </div>
          <p className="splash__tagline" ref={subRef}>
            Smart Spice Dispensing
          </p>
        </header>

        {/* Carousel illustration — SVG */}
        <div className="splash__illust" ref={illustRef} aria-hidden="true">
          <CarouselSVG />
        </div>

        <div className="splash__cta" ref={ctaRef}>
          <Button
            variant="primary"
            size="lg"
            full
            iconRight={faArrowRight}
            onClick={() => navigate('/search')}
          >
            Get Started
          </Button>
        </div>

        <p className="splash__hint" ref={hintRef}>
          Place your bowl on the scale before continuing
        </p>
      </div>
    </div>
  );
}

// ── Inline SVG carousel illustration ──────────────────────
function CarouselSVG() {
  return (
    <svg
      viewBox="0 0 240 220"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="splash__svg"
      aria-label="Octagonal carousel diagram"
    >
      {/* Outer ring */}
      <circle cx="120" cy="108" r="88" stroke="rgba(255,255,255,0.12)" strokeWidth="1.5" strokeDasharray="4 4" />
      {/* Platform */}
      <polygon
        points="120,28 186,64 186,152 120,188 54,152 54,64"
        fill="rgba(255,255,255,0.06)"
        stroke="rgba(255,255,255,0.20)"
        strokeWidth="1.5"
      />
      {/* Centre hub */}
      <circle cx="120" cy="108" r="18" fill="rgba(45,125,210,0.25)" stroke="var(--color-accent)" strokeWidth="1.5" />
      <circle cx="120" cy="108" r="6"  fill="var(--color-accent)" />

      {/* 8 container nodes around the carousel */}
      {[0,1,2,3,4,5,6,7].map((i) => {
        const angle = (i * 45 - 90) * (Math.PI / 180);
        const r = 72;
        const cx = 120 + r * Math.cos(angle);
        const cy = 108 + r * Math.sin(angle);
        const active = i === 0;
        return (
          <g key={i}>
            <rect
              x={cx - 12} y={cy - 12}
              width={24} height={24}
              rx={4}
              fill={active ? 'var(--color-accent)' : 'rgba(255,255,255,0.10)'}
              stroke={active ? 'var(--color-accent)' : 'rgba(255,255,255,0.20)'}
              strokeWidth="1.2"
            />
            {active && (
              <circle cx={cx} cy={cy} r={5} fill="#fff" opacity={0.9} />
            )}
          </g>
        );
      })}

      {/* Scale platform at bottom */}
      <rect x="82" y="186" width="76" height="12" rx="4"
        fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.25)" strokeWidth="1.2" />
      <rect x="104" y="198" width="32" height="6" rx="2"
        fill="rgba(255,255,255,0.08)" />
    </svg>
  );
}
