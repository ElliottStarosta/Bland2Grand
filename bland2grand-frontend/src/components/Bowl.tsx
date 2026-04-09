import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import type { SlotProgress } from '../types'
import { SPICE_COLORS } from '../types'

interface Props {
  slots: SlotProgress[]
  totalTarget: number
  totalWeight: number
  activeSlot?: number
}

const BOWL_W = 220
const BOWL_H = 130
const RX = 102  // horizontal radius of ellipse mouth
const RY = 18   // vertical radius of ellipse mouth
const DEPTH = 90

// Map a spice layer to an SVG clip path + colored fill
function buildLayerPath(
  filled: number,      // 0–1 fraction of bowl filled by this layer top
  fillEnd: number,     // 0–1 fraction of bowl filled by this layer bottom
  cx: number,
  cy: number,
): string {
  const topY  = cy + DEPTH * (1 - filled)
  const botY  = cy + DEPTH * (1 - fillEnd)
  // The bowl's bottom curves as an ellipse; approximate with a flat bottom for simplicity
  const topHalfW = RX * Math.sqrt(Math.max(0, 1 - Math.pow((topY - cy) / DEPTH - 1, 2)))
  const botHalfW = RX * Math.sqrt(Math.max(0, 1 - Math.pow((botY - cy) / DEPTH - 1, 2)))

  return [
    `M ${cx - topHalfW} ${topY}`,
    `A ${topHalfW} ${RY * 0.35} 0 0 0 ${cx + topHalfW} ${topY}`,
    `L ${cx + botHalfW} ${botY}`,
    `A ${botHalfW} ${RY * 0.35} 0 0 1 ${cx - botHalfW} ${botY}`,
    'Z',
  ].join(' ')
}

export function Bowl({ slots, totalTarget, totalWeight, activeSlot }: Props) {
  const cx = BOWL_W / 2
  const cy = 24  // top of bowl interior
  const svgRef = useRef<SVGSVGElement>(null)

  // Compute cumulative fill fractions per completed/active layer
  const layers: { slot: number; color: string; startFrac: number; endFrac: number }[] = []
  let cumulative = 0
  for (const s of slots) {
    if (s.current <= 0 && s.status === 'pending') continue
    const weight = s.current
    const frac = totalTarget > 0 ? weight / totalTarget : 0
    layers.push({
      slot: s.slot,
      color: SPICE_COLORS[s.slot] ?? '#888',
      startFrac: cumulative,
      endFrac: Math.min(cumulative + frac, 1),
    })
    cumulative = Math.min(cumulative + frac, 1)
  }

  // Animate a pour "drip" from the spout when dispensing
  const dripRef = useRef<SVGEllipseElement>(null)

  useEffect(() => {
    if (!activeSlot || !dripRef.current) return

    const color = SPICE_COLORS[activeSlot] ?? '#D4742E'
    dripRef.current.setAttribute('fill', color)

    const tl = gsap.timeline({ repeat: -1 })
    tl.fromTo(
      dripRef.current,
      { cy: cy - 20, ry: 5, rx: 3, opacity: 0.9 },
      {
        cy: cy + DEPTH * 0.7,
        ry: 2,
        rx: 1.5,
        opacity: 0,
        duration: 0.6,
        ease: 'power2.in',
      },
    ).set(dripRef.current, { opacity: 0 }, '+=0.1')

    return () => { tl.kill() }
  }, [activeSlot, cy])

  // No drip when not active
  useEffect(() => {
    if (!activeSlot && dripRef.current) {
      gsap.set(dripRef.current, { opacity: 0 })
    }
  }, [activeSlot])

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${BOWL_W} ${BOWL_H}`}
      className="w-full max-w-[260px] mx-auto drop-shadow-2xl"
      aria-hidden="true"
    >
      <defs>
        {/* Clip path: the bowl interior shape */}
        <clipPath id="bowl-clip">
          <ellipse cx={cx} cy={cy + DEPTH} rx={RX} ry={RY * 0.8} />
          <rect x={cx - RX} y={cy} width={RX * 2} height={DEPTH} />
          <ellipse cx={cx} cy={cy} rx={RX} ry={RY} />
        </clipPath>

        {/* Radial gradient for bowl rim sheen */}
        <radialGradient id="bowl-sheen" cx="40%" cy="30%" r="60%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.12)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </radialGradient>

        {/* Subtle inner shadow gradient */}
        <linearGradient id="inner-shadow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(0,0,0,0.35)" />
          <stop offset="40%" stopColor="rgba(0,0,0,0)" />
        </linearGradient>
      </defs>

      {/* ── Bowl base shape ── */}
      <ellipse
        cx={cx} cy={cy + DEPTH}
        rx={RX} ry={RY * 0.8}
        fill="#1a1814"
        stroke="#2e2a24"
        strokeWidth="1.5"
      />
      <rect
        x={cx - RX} y={cy}
        width={RX * 2} height={DEPTH}
        fill="#1a1814"
      />
      <ellipse
        cx={cx} cy={cy}
        rx={RX} ry={RY}
        fill="#201e19"
        stroke="#2e2a24"
        strokeWidth="1.5"
      />

      {/* ── Spice layers (inside clip) ── */}
      <g clipPath="url(#bowl-clip)">
        {/* Dark base fill */}
        <rect x={0} y={0} width={BOWL_W} height={BOWL_H} fill="#161410" />

        {/* Spice color layers */}
        {layers.map((layer) => {
          const topY  = cy + DEPTH * (1 - layer.endFrac)
          const botY  = cy + DEPTH
          return (
            <rect
              key={layer.slot}
              x={0}
              y={topY}
              width={BOWL_W}
              height={Math.max(0, botY - topY)}
              fill={layer.color}
              opacity={0.88}
            />
          )
        })}

        {/* Top surface texture overlay */}
        {layers.length > 0 && (
          <ellipse
            cx={cx}
            cy={cy + DEPTH * (1 - cumulative) + 3}
            rx={RX * 0.9}
            ry={RY * 0.5}
            fill={layers[layers.length - 1]?.color ?? '#888'}
            opacity={0.6}
          />
        )}

        {/* Inner shadow overlay */}
        <rect
          x={0} y={0} width={BOWL_W} height={BOWL_H}
          fill="url(#inner-shadow)"
        />
      </g>

      {/* ── Drip animation ── */}
      <ellipse
        ref={dripRef}
        cx={cx}
        cy={cy - 20}
        rx={3}
        ry={5}
        opacity={0}
      />

      {/* ── Bowl rim sheen ── */}
      <ellipse
        cx={cx} cy={cy}
        rx={RX} ry={RY}
        fill="url(#bowl-sheen)"
        stroke="#3a3530"
        strokeWidth="1.5"
      />

      {/* ── Weight label ── */}
      {totalWeight > 0 && (
        <text
          x={cx}
          y={cy + DEPTH + 20}
          textAnchor="middle"
          fontSize="11"
          fill="rgba(237,233,224,0.5)"
          fontFamily="Outfit, sans-serif"
          fontWeight="300"
        >
          {totalWeight.toFixed(1)} g
        </text>
      )}
    </svg>
  )
}