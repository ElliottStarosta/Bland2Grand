// components/ui/OctagonDiagram.jsx
// Visual 8-slot carousel position indicator.
// Segments: pending (gray) | active (blue) | done (green)

import React from 'react';
import { SPICE_META, SPICE_KEYS } from '../../utils/spices';
import './OctagonDiagram.css';

const SIZE    = 200;
const CX      = SIZE / 2;
const CY      = SIZE / 2;
const R_OUTER = 88;
const R_INNER = 44;
const N       = 8;

/**
 * Build an SVG path for one wedge segment of the octagon.
 * Segments are rotated so slot 0 is at top (−90°).
 */
function wedgePath(index) {
  const step    = (2 * Math.PI) / N;
  const startA  = index * step - Math.PI / 2 - step / 2 + 0.04;
  const endA    = index * step - Math.PI / 2 + step / 2 - 0.04;

  const x1 = CX + R_INNER * Math.cos(startA);
  const y1 = CY + R_INNER * Math.sin(startA);
  const x2 = CX + R_OUTER * Math.cos(startA);
  const y2 = CY + R_OUTER * Math.sin(startA);
  const x3 = CX + R_OUTER * Math.cos(endA);
  const y3 = CY + R_OUTER * Math.sin(endA);
  const x4 = CX + R_INNER * Math.cos(endA);
  const y4 = CY + R_INNER * Math.sin(endA);

  return `M ${x1} ${y1} L ${x2} ${y2} A ${R_OUTER} ${R_OUTER} 0 0 1 ${x3} ${y3} L ${x4} ${y4} A ${R_INNER} ${R_INNER} 0 0 0 ${x1} ${y1} Z`;
}

function labelPosition(index) {
  const angle = index * (2 * Math.PI) / N - Math.PI / 2;
  const r     = (R_INNER + R_OUTER) / 2;
  return {
    x: CX + r * Math.cos(angle),
    y: CY + r * Math.sin(angle),
  };
}

/**
 * @param {number}   activeSlot   — 0-based index of currently dispensing slot
 * @param {number[]} doneSlots    — 0-based indices of completed slots
 * @param {string[]} spiceOrder   — ordered spice keys for this blend
 */
export default function OctagonDiagram({ activeSlot = -1, doneSlots = [], spiceOrder = [] }) {
  return (
    <div className="octagon-wrap" aria-label="Carousel position indicator">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="octagon-svg"
      >
        {/* Background ring */}
        <circle
          cx={CX} cy={CY} r={(R_INNER + R_OUTER) / 2}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth={R_OUTER - R_INNER}
          opacity={0.3}
        />

        {/* Segments */}
        {Array.from({ length: N }, (_, i) => {
          const isDone   = doneSlots.includes(i);
          const isActive = i === activeSlot;
          const hasSpice = spiceOrder[i] != null;
          const meta     = hasSpice ? SPICE_META[spiceOrder[i]] : null;

          let fill = 'var(--color-border)';
          let opacity = 0.4;

          if (isDone) {
            fill    = 'var(--color-success)';
            opacity = 1;
          } else if (isActive) {
            fill    = 'var(--color-accent)';
            opacity = 1;
          } else if (hasSpice) {
            fill    = meta?.color ?? 'var(--color-navy-light)';
            opacity = 0.35;
          }

          const pos = labelPosition(i);

          return (
            <g key={i}>
              <path
                d={wedgePath(i)}
                fill={fill}
                opacity={opacity}
                className={isActive ? 'octagon-segment--active' : ''}
              />
              {/* Slot number */}
              <text
                x={pos.x} y={pos.y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize="9"
                fontWeight="700"
                fontFamily="'JetBrains Mono', monospace"
                fill={isDone || isActive ? '#fff' : 'var(--color-text-muted)'}
                opacity={hasSpice || isDone || isActive ? 1 : 0.5}
              >
                {i + 1}
              </text>
            </g>
          );
        })}

        {/* Centre hub */}
        <circle cx={CX} cy={CY} r={R_INNER - 4}
          fill="var(--color-surface)"
          stroke="var(--color-border)"
          strokeWidth="1"
        />

        {/* Centre dot */}
        <circle cx={CX} cy={CY} r={6}
          fill={activeSlot >= 0 ? 'var(--color-accent)' : 'var(--color-border-strong)'}
        />
        {activeSlot >= 0 && (
          <circle cx={CX} cy={CY} r={6}
            fill="var(--color-accent)"
            opacity={0.4}
            className="octagon-pulse"
          />
        )}
      </svg>
    </div>
  );
}
