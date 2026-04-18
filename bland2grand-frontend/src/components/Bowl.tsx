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

function seededRand(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff
    return (s >>> 0) / 0xffffffff
  }
}

function darken(hex: string, ratio: number): string {
  const n = parseInt(hex.slice(1), 16)
  const r = Math.max(0, Math.floor(((n >> 16) & 0xff) * (1 - ratio)))
  const g = Math.max(0, Math.floor(((n >> 8) & 0xff) * (1 - ratio)))
  const b = Math.max(0, Math.floor((n & 0xff) * (1 - ratio)))
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`
}

function lighten(hex: string, ratio: number): string {
  const n = parseInt(hex.slice(1), 16)
  const r = Math.min(255, Math.floor(((n >> 16) & 0xff) + (255 - ((n >> 16) & 0xff)) * ratio))
  const g = Math.min(255, Math.floor(((n >> 8) & 0xff) + (255 - ((n >> 8) & 0xff)) * ratio))
  const b = Math.min(255, Math.floor((n & 0xff) + (255 - (n & 0xff)) * ratio))
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`
}

interface GrainProps {
  color: string
  yTop: number
  yBot: number
  W: number
  slot: number
  isTop: boolean
}

function GrainLayer({ color, yTop, yBot, W, slot, isTop }: GrainProps) {
  const bandH = yBot - yTop
  if (bandH < 0.5) return null

  const rand  = seededRand(slot * 1337 + Math.round(yTop * 17))
  const dark  = darken(color, 0.38)
  const light = lighten(color, 0.28)
  const mid   = darken(color, 0.15)
  const els: React.ReactNode[] = []

  const count = Math.min(Math.floor((W * bandH) / 10), 300)
  for (let i = 0; i < count; i++) {
    const gx = rand() * W
    const gy = yTop + rand() * bandH
    const r  = 0.5 + rand() * 1.5
    const v  = rand()
    const c  = v < 0.22 ? dark : v < 0.5 ? mid : v < 0.78 ? color : light
    els.push(<circle key={`g${i}`} cx={gx} cy={gy} r={r} fill={c} opacity={0.6 + rand() * 0.4} />)
  }

  const chunks = Math.min(Math.floor((W * bandH) / 55), 40)
  for (let i = 0; i < chunks; i++) {
    const gx  = rand() * W
    const gy  = yTop + rand() * bandH
    const rx  = 1.4 + rand() * 2.8
    const ry  = rx * (0.4 + rand() * 0.6)
    const ang = rand() * 180
    els.push(
      <ellipse key={`c${i}`} cx={gx} cy={gy} rx={rx} ry={ry}
        fill={rand() < 0.5 ? dark : mid}
        opacity={0.3 + rand() * 0.35}
        transform={`rotate(${ang} ${gx} ${gy})`} />
    )
  }

  if (isTop) {
    // Wavy powder surface
    const steps = Math.max(10, Math.ceil(W / 4))
    const pts: string[] = []
    for (let i = 0; i <= steps; i++) {
      const px    = (i / steps) * W
      const noise = rand() * 4 - 2
      pts.push(`${i === 0 ? 'M' : 'L'} ${px.toFixed(1)} ${(yTop + noise).toFixed(1)}`)
    }
    pts.push(`L ${W} ${yBot} L 0 ${yBot} Z`)
    els.push(<path key="surf" d={pts.join(' ')} fill={color} opacity={0.5} />)
    els.push(
      <rect key="sheen"
        x={W * 0.1} y={yTop - 1}
        width={W * 0.8} height={2} rx={1}
        fill={lighten(color, 0.6)} opacity={0.18} />
    )
  }

  return <g>{els}</g>
}

export function Bowl({ slots, totalTarget, totalWeight, activeSlot }: Props) {
  const dripRef   = useRef<SVGRectElement>(null)
  const dripTlRef = useRef<gsap.core.Timeline | null>(null)

  const W = 320
  // Increased height to give room for the weight label at the bottom
  const H = 172

  const cx = W / 2

  const mouthY  = 12
  const mouthHW = 148

  const baseY   = H - 40  // moved up a bit to give label padding below
  const baseHW  = 52

  const depth = baseY - mouthY

  // f=0 → baseY (floor), f=1 → mouthY (full to brim)
  const fracToY = (f: number) => baseY - f * depth

  //  Clip path 
  const clip = [
    `M ${cx - mouthHW} ${mouthY}`,
    `C ${cx - mouthHW + 10} ${mouthY + 50}  ${cx - baseHW - 8} ${baseY - 20}  ${cx - baseHW} ${baseY}`,
    `Q ${cx} ${baseY + 10}  ${cx + baseHW} ${baseY}`,
    `C ${cx + baseHW + 8} ${baseY - 20}  ${cx + mouthHW - 10} ${mouthY + 50}  ${cx + mouthHW} ${mouthY}`,
    'Z',
  ].join(' ')

  const outer = [
    `M ${cx - mouthHW} ${mouthY}`,
    `C ${cx - mouthHW + 8} ${mouthY + 52}  ${cx - baseHW - 10} ${baseY - 18}  ${cx - baseHW} ${baseY}`,
    `Q ${cx} ${baseY + 12}  ${cx + baseHW} ${baseY}`,
    `C ${cx + baseHW + 10} ${baseY - 18}  ${cx + mouthHW - 8} ${mouthY + 52}  ${cx + mouthHW} ${mouthY}`,
  ].join(' ')

  //  Layers 
  const layers: { slot: number; color: string; topFrac: number; botFrac: number }[] = []
  let cum = 0
  for (const s of slots) {
    if (s.current <= 0 && s.status === 'pending') continue
    const f = totalTarget > 0 ? Math.min(s.current / totalTarget, 1) : 0
    if (f < 0.001) continue
    layers.push({
      slot: s.slot,
      color: SPICE_COLORS[s.slot] ?? '#C8862A',
      botFrac: cum,
      topFrac: Math.min(cum + f, 1),
    })
    cum = Math.min(cum + f, 1)
  }

  //  Drip 
  useEffect(() => {
    dripTlRef.current?.kill()
    dripTlRef.current = null
    if (!activeSlot || !dripRef.current) {
      if (dripRef.current) gsap.set(dripRef.current, { opacity: 0 })
      return
    }
    gsap.set(dripRef.current, { fill: SPICE_COLORS[activeSlot] ?? '#D4742E' })
    const tl = gsap.timeline({ repeat: -1, repeatDelay: 0.1 })
    tl.fromTo(dripRef.current,
      { attr: { y: mouthY - 28, height: 14, width: 6, x: cx - 3, rx: 3 }, opacity: 1 },
      { attr: { y: mouthY + 4,  height: 4,  width: 4, x: cx - 2, rx: 2 }, opacity: 0.1,
        duration: 0.40, ease: 'power3.in' },
    )
    dripTlRef.current = tl
    return () => { tl.kill() }
  }, [activeSlot, mouthY, cx])

  useEffect(() => {
    if (!activeSlot && dripRef.current) gsap.set(dripRef.current, { opacity: 0 })
  }, [activeSlot])

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', display: 'block' }}
      aria-hidden="true"
    >
      <defs>
        <clipPath id="bowl-clip-v3">
          <path d={clip} />
        </clipPath>

        <linearGradient id="b-shadow-top" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor="rgba(0,0,0,0.6)" />
          <stop offset="25%" stopColor="rgba(0,0,0,0)" />
        </linearGradient>

        <linearGradient id="b-shadow-l" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="rgba(0,0,0,0.4)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </linearGradient>
        <linearGradient id="b-shadow-r" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="rgba(0,0,0,0)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.4)" />
        </linearGradient>
      </defs>

      {/* Exterior bowl body */}
      <path d={outer} fill="#141210" />

      {/*  Interior — all clipped  */}
      <g clipPath="url(#bowl-clip-v3)">
        {/* Empty base */}
        <rect x={0} y={0} width={W} height={H} fill="#090806" />

        {/* Spice layers */}
        {layers.map((layer, idx) => {
          const yTop  = fracToY(layer.topFrac)
          // For the bottom-most layer, extend the rect all the way to H so it
          // fills the curved bowl base completely — the clip path handles the shape.
          const yBot  = idx === 0 ? H : fracToY(layer.botFrac)
          const bandH = Math.max(0, yBot - yTop)
          if (bandH < 0.5) return null
          const isTop = idx === layers.length - 1

          return (
            <g key={layer.slot}>
              <rect x={0} y={yTop} width={W} height={bandH + 1}
                fill={layer.color} opacity={0.85} />
              <GrainLayer
                color={layer.color}
                yTop={yTop} yBot={yBot}
                W={W} slot={layer.slot} isTop={isTop} />
            </g>
          )
        })}

        {/* Depth overlays */}
        <rect x={0} y={0} width={W}       height={H} fill="url(#b-shadow-top)" />
        <rect x={0} y={0} width={cx * 0.5} height={H} fill="url(#b-shadow-l)" opacity={0.7} />
        <rect x={cx * 1.5} y={0} width={cx * 0.5} height={H} fill="url(#b-shadow-r)" opacity={0.7} />
      </g>

      {/* Rim stroke */}
      <path d={outer} fill="none" stroke="#2e2b24" strokeWidth="1.5" strokeLinecap="round" />

      {/* Rim top ellipse */}
      <ellipse cx={cx} cy={mouthY} rx={mouthHW} ry={6}
        fill="none" stroke="#3a3730" strokeWidth="1.5" />
      <ellipse cx={cx} cy={mouthY} rx={mouthHW * 0.5} ry={2.5}
        fill="rgba(255,255,255,0.05)" />
     

      {/* Drip */}
      <rect ref={dripRef}
        x={cx - 3} y={mouthY - 28}
        width={6} height={14} rx={3} opacity={0} />

      {/* Weight label — placed below the bowl with comfortable padding */}
      {totalWeight > 0 && (
        <text x={cx} y={H - 6}
          textAnchor="middle" fontSize="11"
          fill="rgba(237,233,224,0.3)"
          fontFamily="Outfit, sans-serif" fontWeight="300" letterSpacing="1.2">
          {totalWeight.toFixed(1)} g
        </text>
      )}
    </svg>
  )
}