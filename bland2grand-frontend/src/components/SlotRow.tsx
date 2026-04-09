import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faCheck,
  faSpinner,
  faCircleDot,
  faTriangleExclamation,
  faRotate,
} from '@fortawesome/free-solid-svg-icons'
import type { SlotProgress } from '../types'
import { SPICE_COLORS } from '../types'

interface Props {
  slot: SlotProgress
  isActive: boolean
}

export function SlotRow({ slot, isActive }: Props) {
  const barRef = useRef<HTMLDivElement>(null)
  const rowRef = useRef<HTMLDivElement>(null)
  const prevWidth = useRef(0)

  const pct = slot.target > 0 ? Math.min((slot.current / slot.target) * 100, 100) : 0
  const color = SPICE_COLORS[slot.slot] ?? '#D4742E'

  // Animate bar width
  useEffect(() => {
    if (!barRef.current) return
    gsap.to(barRef.current, {
      width: `${pct}%`,
      duration: 0.4,
      ease: 'power2.out',
    })
    prevWidth.current = pct
  }, [pct])

  // Animate row entrance when it becomes active
  useEffect(() => {
    if (!isActive || !rowRef.current) return
    gsap.fromTo(
      rowRef.current,
      { backgroundColor: 'rgba(212,116,46,0.08)' },
      { backgroundColor: 'rgba(212,116,46,0)', duration: 0.8, ease: 'power2.out' },
    )
  }, [isActive])

  const icon =
    slot.status === 'done' ? faCheck
    : slot.status === 'error' ? faTriangleExclamation
    : slot.status === 'indexing' ? faRotate
    : slot.status === 'dispensing' ? faSpinner
    : faCircleDot

  const iconColor =
    slot.status === 'done' ? 'text-success'
    : slot.status === 'error' ? 'text-error'
    : slot.status === 'indexing' || slot.status === 'dispensing' ? 'text-accent'
    : 'text-border'

  const spin = slot.status === 'dispensing' || slot.status === 'indexing'

  return (
    <div
      ref={rowRef}
      className="flex items-center gap-3 py-2.5 px-0 rounded-xl transition-all duration-200"
    >
      {/* Status icon */}
      <div className="w-6 flex-shrink-0 flex items-center justify-center">
        <FontAwesomeIcon
          icon={icon}
          className={`text-sm ${iconColor} ${spin ? 'animate-spin' : ''}`}
        />
      </div>

      {/* Spice dot + name */}
      <div className="flex items-center gap-2 w-32 flex-shrink-0">
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: color }}
        />
        <span className="text-sm font-body text-txt leading-none truncate">
          {slot.name}
        </span>
      </div>

      {/* Progress bar */}
      <div className="flex-1 min-w-0">
        <div className="h-1.5 bg-surface rounded-full overflow-hidden border border-border">
          <div
            ref={barRef}
            className="h-full rounded-full"
            style={{ width: '0%', backgroundColor: color }}
          />
        </div>
      </div>

      {/* Weight */}
      <div className="w-14 text-right flex-shrink-0">
        <span className="text-xs font-body font-light">
          {slot.status === 'pending' ? (
            <span className="text-border">{slot.target.toFixed(1)}g</span>
          ) : slot.status === 'done' || slot.status === 'error' ? (
            <span className={slot.status === 'error' ? 'text-error' : 'text-muted'}>
              {(slot.actual ?? slot.current).toFixed(1)}g
            </span>
          ) : (
            <span className="text-accent">
              {slot.current.toFixed(1)}<span className="text-border">/{slot.target.toFixed(1)}g</span>
            </span>
          )}
        </span>
      </div>
    </div>
  )
}