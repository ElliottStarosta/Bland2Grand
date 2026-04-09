import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faRotate, faDroplet } from '@fortawesome/free-solid-svg-icons'
import type { DispenseSession } from '../types'
import { Bowl } from '../components/Bowl'
import { SlotRow } from '../components/SlotRow'

interface Props {
  session: DispenseSession
}

export function DispensingScreen({ session }: Props) {
  const headerRef = useRef<HTMLDivElement>(null)
  const bowlRef   = useRef<HTMLDivElement>(null)
  const listRef   = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const tl = gsap.timeline()
    tl.fromTo(headerRef.current, { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: 'power3.out' })
      .fromTo(bowlRef.current, { scale: 0.9, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, ease: 'back.out(1.4)' }, '-=0.2')
      .fromTo(listRef.current, { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: 'power3.out' }, '-=0.3')
  }, [])

  const activeSlot = session.slots.find(
    (s) => s.status === 'dispensing' || s.status === 'indexing',
  )

  const completedCount = session.slots.filter((s) => s.status === 'done' || s.status === 'error').length
  const totalCount     = session.slots.length
  const overallPct     = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

  const phase =
    activeSlot?.status === 'indexing' ? 'Rotating carousel…'
    : activeSlot?.status === 'dispensing' ? `Dispensing ${activeSlot.name}`
    : session.slots.every((s) => s.status === 'pending') ? 'Starting…'
    : 'Finishing…'

  return (
    <div className="flex-1 overflow-y-auto flex flex-col px-5 pb-safe gap-4">

      {/* Status header */}
      <div ref={headerRef} className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted font-body uppercase tracking-widest font-semibold">
            {overallPct}% complete
          </p>
          <p className="text-sm text-txt font-body font-light mt-0.5 flex items-center gap-1.5">
            {activeSlot?.status === 'indexing' ? (
              <FontAwesomeIcon icon={faRotate} className="text-accent text-xs animate-spin" />
            ) : activeSlot?.status === 'dispensing' ? (
              <FontAwesomeIcon icon={faDroplet} className="text-accent text-xs" />
            ) : null}
            {phase}
          </p>
        </div>

        {/* Mini overall progress ring */}
        <ProgressRing pct={overallPct} />
      </div>

      {/* Bowl visualization */}
      <div ref={bowlRef} className="glass-card p-5">
        <Bowl
          slots={session.slots}
          totalTarget={session.totalTarget}
          totalWeight={session.totalWeight}
          activeSlot={activeSlot?.slot}
        />
      </div>

      {/* Slot rows */}
      <div ref={listRef} className="glass-card px-4 py-2 divide-y divide-border">
        {session.slots.map((s) => (
          <SlotRow
            key={s.slot}
            slot={s}
            isActive={activeSlot?.slot === s.slot}
          />
        ))}
      </div>

      {/* Overall progress bar */}
      <div>
        <div className="h-1 bg-surface rounded-full overflow-hidden border border-border">
          <div
            className="h-full bg-accent rounded-full transition-all duration-500 ease-out"
            style={{ width: `${overallPct}%` }}
          />
        </div>
        <div className="flex justify-between mt-1.5">
          <span className="text-xs text-muted font-body font-light">
            {session.totalWeight.toFixed(1)} g dispensed
          </span>
          <span className="text-xs text-muted font-body font-light">
            {session.totalTarget.toFixed(1)} g total
          </span>
        </div>
      </div>
    </div>
  )
}

// ── Mini SVG progress ring ────────────────────────────────────────────────────

function ProgressRing({ pct }: { pct: number }) {
  const R = 16
  const CIRC = 2 * Math.PI * R
  const dash = (pct / 100) * CIRC

  return (
    <svg width="44" height="44" viewBox="0 0 44 44" className="-rotate-90">
      <circle cx="22" cy="22" r={R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
      <circle
        cx="22" cy="22" r={R}
        fill="none"
        stroke="#D4742E"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${CIRC - dash}`}
        style={{ transition: 'stroke-dasharray 0.5s ease' }}
      />
      <text
        x="22" y="22"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="9"
        fill="#EDE9E0"
        fontFamily="Outfit"
        fontWeight="500"
        transform="rotate(90 22 22)"
      >
        {pct}
      </text>
    </svg>
  )
}
