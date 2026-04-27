import { useEffect, useRef, useCallback } from 'react'
import { gsap } from 'gsap'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faHandPointer } from '@fortawesome/free-solid-svg-icons'

// Types 

interface Props {
  onWake: () => void
}

// Ambient orb config 

const ORBS = [
  { color: '#C94020', size: 300, left: '10%',  top: '8%'  },
  { color: '#8B6914', size: 240, left: '85%',  top: '20%' },
  { color: '#D4742E', size: 200, left: '72%',  top: '65%' },
  { color: '#7B1F1F', size: 220, left: '8%',   top: '70%' },
  { color: '#C63B0A', size: 160, left: '50%',  top: '92%' },
]

const DOTS = [
  '#8B6914','#C94020','#D4C57A','#7B1F1F',
  '#4E7C55','#D4A870','#5a5650','#C63B0A',
]

// Hook: idle timer 
// Fires onIdle after timeoutMs of no interaction.
// Call the returned `wakeUp()` after dismissing the idle screen to restart the timer.

export function useIdleTimer(timeoutMs: number, onIdle: () => void) {
  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isIdleRef = useRef(false)
  const onIdleRef = useRef(onIdle)
  onIdleRef.current = onIdle

  const startTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      isIdleRef.current = true
      onIdleRef.current()
    }, timeoutMs)
  }, [timeoutMs])

  useEffect(() => {
    const reset = () => {
      if (isIdleRef.current) return // already idle -- don't restart until wakeUp()
      startTimer()
    }
    const EVENTS = ['mousemove', 'mousedown', 'touchstart', 'keydown', 'scroll', 'wheel']
    EVENTS.forEach((e) => window.addEventListener(e, reset, { passive: true }))
    startTimer()
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      EVENTS.forEach((e) => window.removeEventListener(e, reset))
    }
  }, [startTimer])

  // Call this after the user dismisses idle to re-enable the timer
  const wakeUp = useCallback(() => {
    isIdleRef.current = false
    startTimer()
  }, [startTimer])

  return { wakeUp }
}

// Ambient orbs (initialised once, no re-run) 

function AmbientOrbs() {
  const ref       = useRef<HTMLDivElement>(null)
  const initiated = useRef(false)

  useEffect(() => {
    if (initiated.current || !ref.current) return
    initiated.current = true
    const els = ref.current.querySelectorAll<HTMLElement>('.orb')
    els.forEach((el, i) => {
      gsap.fromTo(el, { opacity: 0 }, {
        opacity: 1, duration: 2.5, delay: i * 0.2, ease: 'power2.out',
      })
      gsap.to(el, {
        x: (Math.random() - 0.5) * 50,
        y: (Math.random() - 0.5) * 50,
        duration: 10 + Math.random() * 6,
        repeat: -1, yoyo: true,
        ease: 'sine.inOut',
        delay: Math.random() * 3,
      })
    })
  }, [])

  return (
    <div ref={ref} className="absolute inset-0 overflow-hidden pointer-events-none">
      {ORBS.map((orb, i) => (
        <div key={i} className="orb absolute rounded-full" style={{
          width: orb.size, height: orb.size,
          left: orb.left, top: orb.top,
          transform: 'translate(-50%, -50%)',
          background: `radial-gradient(circle at 38% 32%, ${orb.color}42 0%, transparent 68%)`,
          filter: 'blur(45px)',
        }} />
      ))}
    </div>
  )
}

// Logo (logo.png) 

function Logo() {
  const ref       = useRef<HTMLImageElement>(null)
  const initiated = useRef(false)

  useEffect(() => {
    if (initiated.current || !ref.current) return
    initiated.current = true
    gsap.fromTo(ref.current,
      { scale: 0.82, opacity: 0 },
      { scale: 1, opacity: 1, duration: 1.2, ease: 'back.out(1.8)', delay: 0.2 }
    )
    gsap.to(ref.current, {
      scale: 1.04,
      duration: 4, repeat: -1, yoyo: true,
      ease: 'sine.inOut', delay: 1.5,
    })
  }, [])

  return (
    <img
      ref={ref}
      src="/logo.png"
      alt="bland2grand"
      style={{
        width: 96,
        height: 96,
        objectFit: 'contain',
        filter: 'drop-shadow(0 0 36px rgba(212,116,46,0.4))',
      }}
    />
  )
}

// Wordmark 

function Wordmark() {
  const ref       = useRef<HTMLDivElement>(null)
  const initiated = useRef(false)

  useEffect(() => {
    if (initiated.current || !ref.current) return
    initiated.current = true
    gsap.fromTo(ref.current,
      { y: 14, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.9, ease: 'power3.out', delay: 0.55 }
    )
  }, [])

  return (
    <div ref={ref} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <span style={{
        fontFamily: '"Cormorant", serif',
        fontSize: '2.8rem',
        fontWeight: 600,
        fontStyle: 'italic',
        color: '#EDE9E0',
        letterSpacing: '-0.025em',
        lineHeight: 1,
      }}>
        bland2grand
      </span>
      <span style={{
        fontFamily: '"Outfit", sans-serif',
        fontSize: '0.62rem',
        fontWeight: 400,
        color: '#5a5652',
        letterSpacing: '0.34em',
        textTransform: 'uppercase',
      }}>
        Spice Dispensing System
      </span>
    </div>
  )
}

// Tap button (visual only -- whole screen is the tap target) 

function TapCue() {
  const wrapRef   = useRef<HTMLDivElement>(null)
  const ring1Ref  = useRef<HTMLDivElement>(null)
  const ring2Ref  = useRef<HTMLDivElement>(null)
  const labelRef  = useRef<HTMLSpanElement>(null)
  const initiated = useRef(false)

  useEffect(() => {
    if (initiated.current) return
    initiated.current = true

    gsap.fromTo(wrapRef.current,
      { scale: 0.88, opacity: 0 },
      { scale: 1, opacity: 1, duration: 0.8, ease: 'back.out(1.6)', delay: 0.9 }
    )

    gsap.set(ring1Ref.current, { scale: 1, opacity: 0.55 })
    gsap.to(ring1Ref.current, {
      scale: 1.75, opacity: 0,
      duration: 2, repeat: -1, ease: 'power2.out', delay: 1.8,
    })

    gsap.set(ring2Ref.current, { scale: 1, opacity: 0.3 })
    gsap.to(ring2Ref.current, {
      scale: 2.2, opacity: 0,
      duration: 2, repeat: -1, ease: 'power2.out', delay: 2.5,
    })

    gsap.to(labelRef.current, {
      opacity: 0.4,
      duration: 1.8, repeat: -1, yoyo: true,
      ease: 'sine.inOut', delay: 1.4,
    })
  }, [])

  return (
    <div ref={wrapRef} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22 }}>
      {/* Ring + circle */}
      <div style={{ position: 'relative', width: 82, height: 82, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div ref={ring2Ref} style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          border: '1px solid rgba(212,116,46,0.28)',
          pointerEvents: 'none',
        }} />
        <div ref={ring1Ref} style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          border: '1px solid rgba(212,116,46,0.48)',
          pointerEvents: 'none',
        }} />
        {/* Circle bg */}
        <div style={{
          width: 82, height: 82, borderRadius: '50%',
          background: 'rgba(212,116,46,0.09)',
          border: '1px solid rgba(212,116,46,0.28)',
          backdropFilter: 'blur(16px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <FontAwesomeIcon
            icon={faHandPointer}
            style={{
              fontSize: '1.5rem',
              color: '#D4742E',
              filter: 'drop-shadow(0 0 10px rgba(212,116,46,0.7))',
            }}
          />
        </div>
      </div>

      {/* Label */}
      <span ref={labelRef} style={{
        fontFamily: '"Outfit", sans-serif',
        fontSize: '0.68rem',
        fontWeight: 400,
        color: '#7A7672',
        letterSpacing: '0.28em',
        textTransform: 'uppercase',
        marginTop: 14,
      }}>
        Tap anywhere to continue
      </span>
    </div>
  )
}

// Spice dot strip 

function SpiceDots() {
  const ref       = useRef<HTMLDivElement>(null)
  const initiated = useRef(false)

  useEffect(() => {
    if (initiated.current || !ref.current) return
    initiated.current = true
    const dots = ref.current.querySelectorAll<HTMLElement>('.s-dot')
    dots.forEach((d, i) => {
      gsap.fromTo(d,
        { scale: 0, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.35, delay: 1.1 + i * 0.07, ease: 'back.out(2.5)' }
      )
    })
    const wave = () => dots.forEach((d, i) => {
      gsap.to(d, {
        opacity: 0.2, duration: 0.2, delay: i * 0.08, ease: 'power1.inOut',
        onComplete: () => { gsap.to(d, { opacity: 1, duration: 0.3, ease: 'power1.out' }) },
      })
    })
    const id = setInterval(wave, 5500)
    return () => clearInterval(id)
  }, [])
  return (
    <div ref={ref} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <div style={{ display: 'flex', gap: 10 }}>
        {DOTS.map((c, i) => (
          <div key={i} className="s-dot" style={{
            width: 7, height: 7, borderRadius: '50%',
            backgroundColor: c,
            boxShadow: `0 0 8px ${c}88`,
          }} />
        ))}
      </div>
      <span style={{
        fontFamily: '"Outfit", sans-serif',
        fontSize: '0.55rem',
        fontWeight: 300,
        color: '#3a3632',
        letterSpacing: '0.2em',
        textTransform: 'uppercase',
      }}>
        8 slots ready
      </span>
    </div>
  )
}

// Main idle screen 
// Clicking ANYWHERE on the screen wakes it up
// All child animations guard with `initiated` ref so they never re-run
// if the component remounts (e.g. user goes idle a second time)

export function IdleScreen({ onWake }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const waking       = useRef(false)

  // Fade the whole screen in on mount
  useEffect(() => {
    gsap.fromTo(containerRef.current,
      { opacity: 0 },
      { opacity: 1, duration: 0.85, ease: 'power2.out' }
    )
  }, [])

  const handleTap = useCallback(() => {
    if (waking.current) return
    waking.current = true
    gsap.to(containerRef.current, {
      opacity: 0,
      duration: 0.38,
      ease: 'power2.in',
      onComplete: () => {
        waking.current = false
        onWake()
      },
    })
  }, [onWake])

  return (
    <div
      ref={containerRef}
      onClick={handleTap}
      style={{
        position: 'fixed', inset: 0, zIndex: 40,
        background: '#0C0B09',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        cursor: 'pointer',
        // iPhone 13 Pro safe areas
        paddingTop:    'max(52px, env(safe-area-inset-top))',
        paddingBottom: 'max(36px, env(safe-area-inset-bottom))',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      {/* Background */}
      <AmbientOrbs />

      {/* Vignette */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 110% 80% at 50% 50%, transparent 25%, #0C0B09 88%)',
      }} />

      {/* Top hairline */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 1,
        background: 'linear-gradient(90deg, transparent, rgba(212,116,46,0.45), transparent)',
      }} />

      {/*  Three-zone layout  */}
      <div style={{
        position: 'relative', zIndex: 10,
        flex: 1,
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 44,
        paddingBottom: 34,
        gap: 34,
      }}>

        {/* TOP: Logo + wordmark */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
          <Logo />
          <Wordmark />
        </div>

        {/* MIDDLE: Tap cue */}
        <TapCue />

        {/* BOTTOM: Spice dots */}
        <SpiceDots />

      </div>

      {/* Bottom hairline */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 1,
        background: 'linear-gradient(90deg, transparent, rgba(212,116,46,0.2), transparent)',
      }} />
    </div>
  )
}