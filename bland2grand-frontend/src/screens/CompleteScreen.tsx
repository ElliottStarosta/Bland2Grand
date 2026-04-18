import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faCircleCheck,
  faTriangleExclamation,
  faArrowRotateLeft,
} from '@fortawesome/free-solid-svg-icons'
import type { DispenseSession } from '../types'
import { SPICE_COLORS } from '../types'

interface Props {
  session: DispenseSession
  onReset: () => void
}

export function CompleteScreen({ session, onReset }: Props) {
  const iconRef    = useRef<HTMLDivElement>(null)
  const titleRef   = useRef<HTMLDivElement>(null)
  const cardRef    = useRef<HTMLDivElement>(null)
  const btnRef     = useRef<HTMLButtonElement>(null)

  const hasError = session.isError || session.slots.some((s) => s.status === 'error')

  useEffect(() => {
    gsap.set([iconRef.current, titleRef.current, cardRef.current, btnRef.current], {
      opacity: 0, y: 20,
    })

    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } })
    tl.to(iconRef.current,  { opacity: 1, y: 0, scale: 1, duration: 0.6, ease: 'back.out(2)' })
      .to(titleRef.current, { opacity: 1, y: 0, duration: 0.4 }, '-=0.25')
      .to(cardRef.current,  { opacity: 1, y: 0, duration: 0.4 }, '-=0.2')
      .to(btnRef.current,   { opacity: 1, y: 0, duration: 0.35 }, '-=0.15')

    if (!hasError) {
      gsap.to(iconRef.current, {
        scale: 1.05,
        duration: 1.2,
        yoyo: true,
        repeat: 2,
        ease: 'sine.inOut',
        delay: 0.8,
      })
    }
  }, [hasError])

  const completedSlots = session.slots.filter(
    (s) => s.status === 'done' || s.status === 'error',
  )
  const totalActual = completedSlots.reduce((sum, s) => sum + (s.actual ?? s.current), 0)

  return (
    <div className="flex-1 flex flex-col items-center px-5 pb-safe">

      {/*  Icon  */}
      <div
        ref={iconRef}
        className="mt-6 mb-4 flex flex-col items-center"
        style={{ transform: 'scale(0.8)' }}
      >
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center mb-3"
          style={{
            background: hasError ? 'rgba(184,56,56,0.1)' : 'rgba(78,158,80,0.1)',
            border: `1px solid ${hasError ? 'rgba(184,56,56,0.2)' : 'rgba(78,158,80,0.2)'}`,
            boxShadow: `0 0 40px ${hasError ? 'rgba(184,56,56,0.1)' : 'rgba(78,158,80,0.1)'}`,
          }}
        >
          <FontAwesomeIcon
            icon={hasError ? faTriangleExclamation : faCircleCheck}
            style={{
              fontSize: 36,
              color: hasError ? '#B83838' : '#4E9E50',
            }}
          />
        </div>
      </div>

      {/*  Title  */}
      <div ref={titleRef} className="text-center mb-5 w-full" style={{ opacity: 0 }}>
        <h2
          className="font-display font-semibold text-txt"
          style={{ fontSize: 32 }}
        >
          {hasError ? 'Incomplete' : 'Ready to cook'}
        </h2>
        <p
          className="font-body font-light mt-1"
          style={{ fontSize: 13, color: '#6A6662' }}
        >
          {hasError
            ? (session.errorMessage ?? 'One or more spices failed.')
            : `${session.recipeName} · ${session.servingCount} ${session.servingCount === 1 ? 'portion' : 'portions'}`}
        </p>
      </div>

      {/*  Summary card  */}
      <div ref={cardRef} className="w-full luxury-card p-5 mb-4" style={{ opacity: 0 }}>
        <p
          className="font-body font-semibold uppercase mb-4"
          style={{ fontSize: 10, letterSpacing: '0.18em', color: '#6A6662' }}
        >
          Dispensed
        </p>

        <div className="space-y-3">
          {completedSlots.map((s) => {
            const diff = Math.abs((s.actual ?? 0) - s.target)
            const ok   = s.status === 'done' && diff < 0.5
            const color = SPICE_COLORS[s.slot] ?? '#888'
            return (
              <div key={s.slot} className="flex items-center gap-3">
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span
                  className="font-body text-txt flex-1 truncate"
                  style={{ fontSize: 14 }}
                >
                  {s.name}
                </span>
                <span
                  className="font-body font-light"
                  style={{
                    fontSize: 13,
                    color: s.status === 'error' ? '#B83838' : ok ? '#4E9E50' : '#C8692A',
                  }}
                >
                  {(s.actual ?? 0).toFixed(1)}g
                </span>
                <span
                  className="font-body font-light w-10 text-right"
                  style={{ fontSize: 12, color: '#4A4642' }}
                >
                  /{s.target.toFixed(1)}g
                </span>
              </div>
            )
          })}
        </div>

        {/* Divider + total */}
        <div
          className="mt-4 pt-3 flex justify-between items-center"
          style={{ borderTop: '1px solid #1E1B17' }}
        >
          <span
            className="font-body font-semibold uppercase"
            style={{ fontSize: 10, letterSpacing: '0.15em', color: '#6A6662' }}
          >
            Total
          </span>
          <span
            className="font-body font-medium"
            style={{ fontSize: 16, color: '#B89848' }}
          >
            {totalActual.toFixed(1)} g
          </span>
        </div>
      </div>

      {/*  Reset button  */}
      <button
        ref={btnRef}
        onClick={onReset}
        className="w-full py-4 rounded-2xl font-body font-medium
                   flex items-center justify-center gap-3
                   active:brightness-110 transition-all duration-150"
        style={{
          fontSize: 15,
          color: '#6A6662',
          background: '#0F0E0C',
          border: '1px solid #252220',
          opacity: 0,
        }}
      >
        <FontAwesomeIcon icon={faArrowRotateLeft} style={{ fontSize: 14 }} />
        Start a new blend
      </button>
    </div>
  )
}