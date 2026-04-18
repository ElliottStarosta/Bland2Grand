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

  const pct   = slot.target > 0 ? Math.min((slot.current / slot.target) * 100, 100) : 0
  const color = SPICE_COLORS[slot.slot] ?? '#C8692A'

  useEffect(() => {
    if (!barRef.current) return
    gsap.to(barRef.current, {
      width: `${pct}%`,
      duration: 0.4,
      ease: 'power2.out',
    })
  }, [pct])

  useEffect(() => {
    if (!isActive || !rowRef.current) return
    gsap.fromTo(
      rowRef.current,
      { backgroundColor: 'rgba(200,105,42,0.06)' },
      { backgroundColor: 'rgba(0,0,0,0)', duration: 1, ease: 'power2.out' },
    )
  }, [isActive])

  const icon =
    slot.status === 'done'       ? faCheck
    : slot.status === 'error'    ? faTriangleExclamation
    : slot.status === 'indexing' ? faRotate
    : slot.status === 'dispensing' ? faSpinner
    : faCircleDot

  const iconColor =
    slot.status === 'done'        ? '#4E9E50'
    : slot.status === 'error'     ? '#B83838'
    : slot.status === 'indexing' || slot.status === 'dispensing' ? '#C8692A'
    : '#3A3530'

  const spin = slot.status === 'dispensing' || slot.status === 'indexing'

  return (
    <div
      ref={rowRef}
      className="flex items-center gap-3 py-3"
    >
      {/* Status icon */}
      <div className="w-5 flex-shrink-0 flex items-center justify-center">
        <FontAwesomeIcon
          icon={icon}
          className={spin ? 'animate-spin' : ''}
          style={{ fontSize: 12, color: iconColor }}
        />
      </div>

      {/* Color dot + name */}
      <div className="flex items-center gap-2 flex-shrink-0" style={{ width: 120 }}>
        <span
          className="rounded-full flex-shrink-0"
          style={{ width: 6, height: 6, backgroundColor: color }}
        />
        <span
          className="font-body text-txt truncate"
          style={{ fontSize: 13 }}
        >
          {slot.name}
        </span>
      </div>

      {/* Progress bar */}
      <div className="flex-1 min-w-0">
        <div
          className="h-1 rounded-full overflow-hidden"
          style={{ background: '#0F0E0C', border: '1px solid #1E1B17' }}
        >
          <div
            ref={barRef}
            className="h-full rounded-full"
            style={{ width: '0%', backgroundColor: color }}
          />
        </div>
      </div>

      {/* Weight */}
      <div className="w-16 text-right flex-shrink-0">
        {slot.status === 'pending' ? (
          <span className="font-body font-light" style={{ fontSize: 11, color: '#3A3530' }}>
            {slot.target.toFixed(1)}g
          </span>
        ) : slot.status === 'done' || slot.status === 'error' ? (
          <span
            className="font-body font-light"
            style={{ fontSize: 11, color: slot.status === 'error' ? '#B83838' : '#6A6662' }}
          >
            {(slot.actual ?? slot.current).toFixed(1)}g
          </span>
        ) : (
          <span className="font-body font-light" style={{ fontSize: 11 }}>
            <span style={{ color: '#C8692A' }}>{slot.current.toFixed(1)}</span>
            <span style={{ color: '#3A3530' }}>/{slot.target.toFixed(1)}g</span>
          </span>
        )}
      </div>
    </div>
  )
}