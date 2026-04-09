import { useState, useRef, useEffect, useCallback } from 'react'
import { gsap } from 'gsap'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faMagnifyingGlass, faArrowRight, faWandMagicSparkles } from '@fortawesome/free-solid-svg-icons'
import { api } from '../lib/api'
import { useDebounce } from '../hooks/useDebounce'
import type { Recipe } from '../types'

interface Props {
  onResults: (recipes: Recipe[], query: string) => void
}

const SUGGESTIONS = [
  'Chicken Tikka Masala',
  'Cajun Blackening',
  'Tacos al Pastor',
  'Classic BBQ Rub',
  'Shakshuka',
  'Jerk Chicken',
]

export function SearchScreen({ onResults }: Props) {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const pillsRef = useRef<HTMLDivElement>(null)

  const debouncedQuery = useDebounce(query, 320)

  useEffect(() => {
    // Entrance animation
    const tl = gsap.timeline()
    tl.fromTo(
      cardRef.current,
      { y: 40, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.55, ease: 'power3.out' },
    ).fromTo(
      pillsRef.current,
      { y: 20, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.4, ease: 'power3.out' },
      '-=0.25',
    )
  }, [])

  const doSearch = useCallback(
    async (q: string) => {
      if (!q.trim()) return
      setLoading(true)
      setError('')
      try {
        const data = await api.search(q)
        if (data.results.length === 0) {
          setError('No recipes found. Try something else.')
        } else {
          onResults(data.results, q)
        }
      } catch (e) {
        setError('Connection error. Check that the server is running.')
      } finally {
        setLoading(false)
      }
    },
    [onResults],
  )

  const handleSubmit = () => doSearch(query)

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') doSearch(query)
  }

  const handleSuggestion = (s: string) => {
    setQuery(s)
    doSearch(s)
  }

  return (
    <div className="flex-1 overflow-y-auto px-5 pb-safe">
      {/* Search card */}
      <div ref={cardRef} className="mt-2">
        <div
          className="flex items-center gap-3 glass-card px-4 py-3.5
                     focus-within:border-accent/50 transition-colors duration-200"
        >
          <FontAwesomeIcon
            icon={loading ? faWandMagicSparkles : faMagnifyingGlass}
            className={`text-muted flex-shrink-0 text-base ${loading ? 'animate-pulse text-accent' : ''}`}
          />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder="tacos, butter chicken, jerk chicken…"
            className="flex-1 bg-transparent text-txt text-base font-body
                       placeholder-muted/50 min-w-0"
            autoComplete="off"
            autoCorrect="off"
            spellCheck="false"
            inputMode="search"
          />
          {query && (
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="w-8 h-8 rounded-full bg-accent flex items-center justify-center
                         active:scale-90 transition-transform duration-100 flex-shrink-0"
              aria-label="Search"
            >
              <FontAwesomeIcon icon={faArrowRight} className="text-white text-xs" />
            </button>
          )}
        </div>

        {error && (
          <p className="text-error text-sm mt-3 px-1 font-body font-light">{error}</p>
        )}
      </div>

      {/* Quick suggestions */}
      <div ref={pillsRef} className="mt-6">
        <p className="text-muted text-xs uppercase tracking-widest font-semibold mb-3 px-1 font-body">
          Popular
        </p>
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => handleSuggestion(s)}
              className="px-3.5 py-2 rounded-full border border-border text-sm text-muted
                         font-body font-light active:border-accent active:text-accent
                         bg-surface transition-colors duration-150"
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Decorative spice dots */}
      <div className="mt-10 flex justify-center gap-2 opacity-20">
        {[1,2,3,4,5,6,7,8].map((slot) => (
          <div
            key={slot}
            className="w-2 h-2 rounded-full"
            style={{
              backgroundColor: ['#8B6914','#C94020','#D4C57A','#7B1F1F','#4E7C55','#D4A870','#2C2C2C','#C63B0A'][slot-1],
            }}
          />
        ))}
      </div>
    </div>
  )
}