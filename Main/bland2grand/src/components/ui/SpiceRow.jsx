// components/ui/SpiceRow.jsx
// A single row in the spice breakdown table.
// Displays spice name, animated gram value, and an optional progress bar.

import React from 'react';
import { SPICE_META, formatGrams } from '../../utils/spices';
import './SpiceRow.css';

export default function SpiceRow({
  spiceKey,
  grams,
  target,
  actual,
  status = 'pending', // pending | active | done
  showBar = false,
}) {
  const meta     = SPICE_META[spiceKey] || {};
  const label    = meta.label ?? spiceKey;
  const progress = target > 0 ? Math.min((grams ?? 0) / target, 1) : 0;

  return (
    <div className={`spice-row spice-row--${status}`}>
      {/* Motor slot indicator */}
      <div
        className="spice-row__slot"
        style={{ background: status === 'done' ? 'var(--color-success)' : meta.color ?? 'var(--color-navy)' }}
      >
        {meta.motor}
      </div>

      {/* Name + bar */}
      <div className="spice-row__body">
        <div className="spice-row__top">
          <span className="spice-row__label">{label}</span>
          <span className="spice-row__value font-mono">
            {status === 'done' && actual != null
              ? formatGrams(actual)
              : formatGrams(target)}
          </span>
        </div>

        {showBar && (
          <div className="progress-bar" style={{ marginTop: 6 }}>
            <div
              className={`progress-bar__fill${status === 'done' ? ' progress-bar__fill--success' : ''}`}
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        )}
      </div>

      {/* State icon */}
      <div className="spice-row__icon">
        {status === 'done' && <CheckIcon />}
        {status === 'active' && <ActiveDot />}
        {status === 'pending' && <PendingRing />}
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <circle cx="9" cy="9" r="9" fill="var(--color-success)" />
      <polyline
        points="4.5,9 7.5,12 13.5,6"
        fill="none"
        stroke="#fff"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          strokeDasharray: 20,
          strokeDashoffset: 0,
          animation: 'draw-check 0.35s ease-out forwards',
        }}
      />
    </svg>
  );
}

function ActiveDot() {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 10,
        height: 10,
        borderRadius: '50%',
        background: 'var(--color-accent)',
        animation: 'pulse-dot 1.2s ease-in-out infinite',
      }}
      aria-label="Dispensing"
    />
  );
}

function PendingRing() {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 10,
        height: 10,
        borderRadius: '50%',
        border: '2px solid var(--color-border-strong)',
      }}
      aria-hidden="true"
    />
  );
}
