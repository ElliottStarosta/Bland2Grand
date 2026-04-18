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
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const sections = el.querySelectorAll('[data-s]')
    gsap.fromTo(
      sections,
      { y: 16, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.4, stagger: 0.08, ease: 'power3.out' },
    )
  }, [])

  const activeSlot = session.slots.find(
    (s) => s.status === 'dispensing' || s.status === 'indexing',
  )

  const completedCount = session.slots.filter(
    (s) => s.status === 'done' || s.status === 'error',
  ).length
  const totalCount = session.slots.length
  const overallPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

  const phase =
    activeSlot?.status === 'indexing'
      ? 'Rotating…'
      : activeSlot?.status === 'dispensing'
      ? activeSlot.name
      : session.slots.every((s) => s.status === 'pending')
      ? 'Starting…'
      : 'Finishing…'

  const R = 13
  const CIRC = 2 * Math.PI * R
  const dash = (overallPct / 100) * CIRC

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto"
      style={{ WebkitOverflowScrolling: 'touch' }}
    >
      <div className="flex flex-col px-4 pb-safe gap-3">

        {/* ── Status bar ── */}
        <div data-s className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            {activeSlot?.status === 'indexing' && (
              <FontAwesomeIcon
                icon={faRotate}
                className="text-accent text-xs flex-shrink-0 animate-spin"
              />
            )}
            {activeSlot?.status === 'dispensing' && (
              <FontAwesomeIcon
                icon={faDroplet}
                className="text-accent text-xs flex-shrink-0"
              />
            )}
            <span className="text-sm text-txt font-body truncate">{phase}</span>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0 ml-3">
            <span className="text-xs text-muted font-body">{overallPct}%</span>
            <svg width="34" height="34" viewBox="0 0 34 34" className="-rotate-90">
              <circle
                cx="17" cy="17" r={R}
                fill="none"
                stroke="rgba(255,255,255,0.06)"
                strokeWidth="2.5"
              />
              <circle
                cx="17" cy="17" r={R}
                fill="none"
                stroke="#D4742E"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeDasharray={`${dash} ${CIRC - dash}`}
                style={{ transition: 'stroke-dasharray 0.5s ease' }}
              />
            </svg>
          </div>
        </div>

        {/* ── Bowl ── */}
        <div data-s className="glass-card px-3 pt-2 pb-2">
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

        {/* ── Slot rows ── */}
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
    </div>
  )
}
