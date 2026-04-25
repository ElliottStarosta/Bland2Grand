import { useRef, useEffect } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChevronLeft } from '@fortawesome/free-solid-svg-icons'
import { gsap } from 'gsap'
import type { Screen } from '../types'
import logoUrl from '../../public/logo.png'

interface Props {
  screen: Screen
  onBack?: () => void
}

const TITLES: Record<Screen, string> = {
  search:     'bland2grand',
  results:    'recipes',
  serving:    'servings',
  dispensing: 'dispensing',
  complete:   'ready',
  custom:     'custom blend',
}

const SUBTITLES: Record<Screen, string> = {
  search:     'what are you making tonight?',
  results:    'select your spice blend',
  serving:    'how many portions?',
  dispensing: 'measuring your spices',
  complete:   'your blend is ready',
  custom:     'build your own mix',
}

function B2GLogo() {
  return (
    <img src={logoUrl} alt="Bland2Grand" width={22} height={22} style={{ objectFit: 'contain' }} />
  )
}

export function Header({ screen, onBack }: Props) {
  const containerRef  = useRef<HTMLDivElement>(null)
  const titleRef      = useRef<HTMLHeadingElement>(null)
  const subtitleRef   = useRef<HTMLParagraphElement>(null)
  const prevScreen    = useRef(screen)

  useEffect(() => {
    if (prevScreen.current === screen) return
    prevScreen.current = screen

    const tl = gsap.timeline()
    tl.to([titleRef.current, subtitleRef.current], {
      y: -6,
      opacity: 0,
      duration: 0.15,
      stagger: 0.03,
      ease: 'power2.in',
    }).fromTo(
      [titleRef.current, subtitleRef.current],
      { y: 8, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.25, stagger: 0.05, ease: 'power3.out' },
    )
  }, [screen])

  useEffect(() => {
    gsap.fromTo(
      containerRef.current,
      { y: -16, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.6, ease: 'power3.out' },
    )
  }, [])

  return (
    <header
      ref={containerRef}
      className="flex items-center justify-between px-5 pt-safe pb-4"
      style={{ borderBottom: '1px solid rgba(37,34,32,0.6)' }}
    >
      {/* Logo mark */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {screen === 'search' && (
          <div className="flex-shrink-0">
            <B2GLogo />
          </div>
        )}
        <div className="min-w-0">
          <h1
            ref={titleRef}
            className="font-display leading-none text-txt"
            style={{
              fontSize: screen === 'search' ? 32 : 26,
              fontWeight: 600,
              fontStyle: screen === 'search' ? 'italic' : 'normal',
              letterSpacing: screen === 'search' ? '-0.01em' : '0',
            }}
          >
            {TITLES[screen]}
          </h1>
          <p
            ref={subtitleRef}
            className="font-body font-light truncate mt-0.5"
            style={{ fontSize: 12, color: '#6A6662', letterSpacing: '0.01em' }}
          >
            {SUBTITLES[screen]}
          </p>
        </div>
      </div>

      {/* Back button */}
      {onBack && (
        <button
          onClick={onBack}
          className="ml-3 flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-2xl
                     active:scale-90 transition-all duration-150"
          style={{
            background: '#161411',
            border: '1px solid #252220',
          }}
          aria-label="Go back"
        >
          <FontAwesomeIcon icon={faChevronLeft} style={{ color: '#6A6662', fontSize: 13 }} />
        </button>
      )}
    </header>
  )
}