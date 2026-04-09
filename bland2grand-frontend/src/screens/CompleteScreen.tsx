import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faCircleCheck,
  faTriangleExclamation,
  faArrowRotateLeft,
  faBowlFood,
} from '@fortawesome/free-solid-svg-icons'
import type { DispenseSession } from '../types'
import { SPICE_COLORS } from '../types'

interface Props {
  session: DispenseSession
  onReset: () => void
}

export function CompleteScreen({ session, onReset }: Props) {
  const iconRef  = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const btnRef   = useRef<HTMLButtonElement>(null)

  const hasError = session.isError || session.slots.some((s) => s.status === 'error')

  useEffect(() => {
    const tl = gsap.timeline()

    // Icon pop
    tl.fromTo(
      iconRef.current,
      { scale: 0, opacity: 0 },
      { scale: 1, opacity: 1, duration: 0.55, ease: 'back.out(2.5)' },
    )

    // Content slide up
    tl.fromTo(
      contentRef.current,
      { y: 30, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.45, ease: 'power3.out' },
      '-=0.2',
    )

    // Button fade in
    tl.fromTo(
      btnRef.current,
      { y: 20, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.35, ease: 'power3.out' },
      '-=0.1',
    )

    // Subtle pulse on icon if success
    if (!hasError) {
      gsap.to(iconRef.current, {
        scale: 1.06,
        duration: 0.9,
        yoyo: true,
        repeat: 3,
        ease: 'sine.inOut',
        delay: 0.6,
      })
    }
  }, [hasError])

  const completedSlots = session.slots.filter(
    (s) => s.status === 'done' || s.status === 'error',
  )
  const totalActual = completedSlots.reduce((sum, s) => sum + (s.actual ?? s.current), 0)

  return (
    <div className="flex-1 flex flex-col items-center px-5 pb-safe">

      {/* Icon */}
      <div ref={iconRef} className="mt-6 mb-4">
        <div
          className={`w-20 h-20 rounded-full flex items-center justify-center
                      ${hasError ? 'bg-error/15' : 'bg-success/15'}`}
        >
          <FontAwesomeIcon
            icon={hasError ? faTriangleExclamation : faCircleCheck}
            className={`text-4xl ${hasError ? 'text-error' : 'text-success'}`}
          />
        </div>
      </div>

      {/* Content */}
      <div ref={contentRef} className="w-full text-center mb-6">
        <h2 className="font-display text-3xl font-semibold text-txt">
          {hasError ? 'Incomplete' : 'Ready to cook!'}
        </h2>
        <p className="text-muted text-sm font-body font-light mt-1">
          {hasError
            ? session.errorMessage ?? 'One or more spices failed to dispense.'
            : `${session.recipeName} · ${session.servingCount} serving${session.servingCount !== 1 ? 's' : ''}`}
        </p>
      </div>

      {/* Summary card */}
      <div className="w-full glass-card p-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <FontAwesomeIcon icon={faBowlFood} className="text-muted text-sm" />
          <span className="text-xs text-muted font-body uppercase tracking-wider font-semibold">
            Dispensed
          </span>
        </div>

        <div className="space-y-2.5">
          {completedSlots.map((s) => {
            const diff = Math.abs((s.actual ?? 0) - s.target)
            const ok   = s.status === 'done' && diff < 0.5
            return (
              <div key={s.slot} className="flex items-center gap-2.5">
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: SPICE_COLORS[s.slot] ?? '#888' }}
                />
                <span className="text-sm font-body text-txt flex-1 truncate">{s.name}</span>
                <span className={`text-xs font-body font-light ${
                  s.status === 'error' ? 'text-error' : ok ? 'text-success' : 'text-accent'
                }`}>
                  {(s.actual ?? 0).toFixed(1)}g
                </span>
                <span className="text-xs text-muted font-body font-light w-12 text-right">
                  / {s.target.toFixed(1)}g
                </span>
              </div>
            )
          })}
        </div>

        <div className="mt-3 pt-3 border-t border-border flex justify-between">
          <span className="text-xs text-muted font-body uppercase tracking-wider font-semibold">Total</span>
          <span className="text-sm font-body text-accent-2 font-medium">
            {totalActual.toFixed(1)} g
          </span>
        </div>
      </div>

      {/* Reset button */}
      <button
        ref={btnRef}
        onClick={onReset}
        className="w-full py-4 rounded-2xl border border-border text-muted font-body
                   font-medium text-base flex items-center justify-center gap-3
                   active:border-accent active:text-accent transition-colors duration-150"
      >
        <FontAwesomeIcon icon={faArrowRotateLeft} />
        Start a new blend
      </button>
    </div>
  )
}
