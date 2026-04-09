import { useRef, useEffect } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChevronLeft } from '@fortawesome/free-solid-svg-icons'
import { gsap } from 'gsap'
import type { Screen } from '../types'

interface Props {
  screen: Screen
  onBack?: () => void
}

const TITLES: Record<Screen, string> = {
  search: 'bland2grand',
  results: 'recipes',
  serving: 'servings',
  dispensing: 'dispensing',
  complete: 'done',
}

const SUBTITLES: Record<Screen, string> = {
  search: 'what are you cooking tonight?',
  results: 'choose your blend',
  serving: 'how many are you cooking for?',
  dispensing: 'your spices are being measured',
  complete: 'everything is ready',
}

export function Header({ screen, onBack }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const subtitleRef = useRef<HTMLParagraphElement>(null)
  const prevScreen = useRef(screen)

  useEffect(() => {
    if (prevScreen.current === screen) return
    prevScreen.current = screen

    const tl = gsap.timeline()
    tl.to([titleRef.current, subtitleRef.current], {
      y: -8,
      opacity: 0,
      duration: 0.18,
      stagger: 0.04,
      ease: 'power2.in',
    }).fromTo(
      [titleRef.current, subtitleRef.current],
      { y: 10, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.28, stagger: 0.06, ease: 'power3.out' },
    )
  }, [screen])

  useEffect(() => {
    gsap.fromTo(
      containerRef.current,
      { y: -20, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.5, ease: 'power3.out' },
    )
  }, [])

  return (
    <header
      ref={containerRef}
      className="flex items-start justify-between px-5 pt-safe pb-3"
    >
      <div className="flex-1 min-w-0">
        <h1
          ref={titleRef}
          className="font-display text-3xl font-semibold tracking-tight leading-none text-txt"
          style={{ fontStyle: screen === 'search' ? 'italic' : 'normal' }}
        >
          {TITLES[screen]}
        </h1>
        <p ref={subtitleRef} className="text-muted text-sm mt-1 font-body font-light truncate">
          {SUBTITLES[screen]}
        </p>
      </div>

      {onBack && (
        <button
          onClick={onBack}
          className="ml-4 mt-0.5 w-9 h-9 flex items-center justify-center rounded-xl
                     bg-card border border-border text-muted active:scale-90
                     transition-all duration-150"
          aria-label="Go back"
        >
          <FontAwesomeIcon icon={faChevronLeft} className="text-sm" />
        </button>
      )}
    </header>
  )
}