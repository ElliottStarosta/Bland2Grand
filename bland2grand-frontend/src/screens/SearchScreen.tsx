import { useState, useRef, useEffect, useCallback } from 'react'
import { gsap } from 'gsap'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faMagnifyingGlass,
  faWandMagicSparkles,
  faFire,
  faLeaf,
  faDrumstickBite,
  faStar,
  faGlobe,
  faBowlFood,
  faBurn,
  faSeedling,
  faFish,
  faSun,
  faMugHot,
  faChevronRight,
} from '@fortawesome/free-solid-svg-icons'
import { api } from '../lib/api'
import { useDebounce } from '../hooks/useDebounce'
import { SPICE_COLORS, SPICE_LABELS } from '../types'
import type { Recipe } from '../types'

interface Props {
  onResults: (recipes: Recipe[], query: string) => void
  onSelect:  (recipe: Recipe) => void
}

const CATEGORIES = [
  { label: 'Mexican',       icon: faBurn,         query: 'Mexican'       },
  { label: 'Indian',        icon: faSun,           query: 'Indian'        },
  { label: 'Italian',       icon: faLeaf,          query: 'Italian'       },
  { label: 'BBQ',           icon: faFire,          query: 'BBQ'           },
  { label: 'Cajun',         icon: faDrumstickBite, query: 'Cajun'         },
  { label: 'Mediterranean', icon: faGlobe,         query: 'Mediterranean' },
  { label: 'Vegetarian',    icon: faSeedling,      query: 'Vegetarian'    },
  { label: 'Seafood',       icon: faFish,          query: 'Seafood'       },
  { label: 'Breakfast',     icon: faMugHot,        query: 'Breakfast'     },
  { label: 'Asian',         icon: faBowlFood,      query: 'Asian'         },
]

const FEATURED = [
  { name: 'Tacos al Pastor',      category: 'Mexican',   slots: [1,2,3,4,5,6,7,8] },
  { name: 'Cajun Blackening',     category: 'Cajun',     slots: [2,3,5,6,7,8]     },
  { name: 'Chicken Tikka Masala', category: 'Indian',    slots: [1,2,3,6,7,8]     },
  { name: 'Classic BBQ Rub',      category: 'BBQ',       slots: [1,2,3,4,5,6,7,8] },
  { name: 'Shakshuka',            category: 'Mid. East', slots: [1,2,3,4,6,8]     },
  { name: 'Jerk Chicken',         category: 'Caribbean', slots: [2,3,4,5,7,8]     },
]

const AI_MESSAGES = [
  'Consulting the spice archives…',
  'Asking a culinary expert…',
  'Crafting your blend…',
  'Calibrating grams per serving…',
  'Almost there…',
]

function AiLoadingOverlay({ query }: { query: string }) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const dotsRef    = useRef<(HTMLSpanElement | null)[]>([])
  const msgRef     = useRef<HTMLParagraphElement>(null)
  const msgIdx     = useRef(0)

  useEffect(() => {
    gsap.fromTo(overlayRef.current, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.4, ease: 'power3.out' })

    const dots = dotsRef.current.filter(Boolean)
    const tl = gsap.timeline({ repeat: -1 })
    dots.forEach((dot, i) => {
      tl.to(dot, { scale: 1.7, opacity: 1, duration: 0.25, ease: 'back.out(2)', yoyo: true, repeat: 1 }, i * 0.11)
    })

    const interval = setInterval(() => {
      if (!msgRef.current) return
      msgIdx.current = (msgIdx.current + 1) % AI_MESSAGES.length
      gsap.to(msgRef.current, {
        opacity: 0, y: -5, duration: 0.18, ease: 'power2.in',
        onComplete: () => {
          if (msgRef.current) {
            msgRef.current.textContent = AI_MESSAGES[msgIdx.current]
            gsap.fromTo(msgRef.current, { opacity: 0, y: 7 }, { opacity: 1, y: 0, duration: 0.22, ease: 'power3.out' })
          }
        },
      })
    }, 2200)

    return () => { tl.kill(); clearInterval(interval) }
  }, [])

  return (
    <div ref={overlayRef} className="mt-5 glass-card p-6 flex flex-col items-center gap-4">
      <div className="flex items-center gap-2">
        {Object.keys(SPICE_COLORS).map((slot) => (
          <span
            key={slot}
            ref={(el) => { dotsRef.current[Number(slot) - 1] = el }}
            className="w-2 h-2 rounded-full opacity-35 flex-shrink-0"
            style={{ backgroundColor: SPICE_COLORS[Number(slot)] }}
          />
        ))}
      </div>
      <div className="relative">
        <div className="w-14 h-14 rounded-full flex items-center justify-center"
          style={{ background: 'rgba(212,116,46,0.12)', border: '1px solid rgba(212,116,46,0.25)' }}>
          <FontAwesomeIcon icon={faWandMagicSparkles} className="text-accent text-2xl"
            style={{ animation: 'aiPulse 1.4s ease-in-out infinite' }} />
        </div>
        <div className="absolute inset-0 rounded-full border border-accent/20"
          style={{ animation: 'aiSpin 3s linear infinite' }} />
      </div>
      <div className="text-center">
        <p className="text-xs text-muted font-body uppercase tracking-widest font-semibold mb-1">
          No match — generating blend for
        </p>
        <p className="font-display text-xl font-semibold text-txt">&ldquo;{query}&rdquo;</p>
      </div>
      <p ref={msgRef} className="text-sm text-muted font-body font-light">{AI_MESSAGES[0]}</p>
      <div className="w-full h-px rounded-full overflow-hidden bg-surface">
        <div className="h-full" style={{
          width: '100%',
          background: 'linear-gradient(90deg, transparent, #D4742E, transparent)',
          backgroundSize: '200% 100%',
          animation: 'aiShimmer 1.8s infinite',
        }} />
      </div>
    </div>
  )
}

function FeaturedCard({
  name, category, slots, onClick, delay,
}: {
  name: string; category: string; slots: number[]; onClick: () => void; delay: number
}) {
  const ref = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    gsap.fromTo(ref.current, { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, delay, ease: 'power3.out' })
  }, [delay])

  return (
    <button
      ref={ref}
      onClick={onClick}
      className="glass-card p-3 text-left flex-shrink-0 w-40 flex flex-col gap-2
                 active:border-accent/50 transition-colors duration-150 focus:outline-none"
    >
      <div className="flex gap-1 flex-wrap">
        {slots.map((s) => (
          <span key={s} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: SPICE_COLORS[s] }} />
        ))}
      </div>
      <div>
        <p className="text-[10px] text-muted font-body uppercase tracking-wider font-semibold mb-0.5">{category}</p>
        <p className="font-display text-sm font-semibold text-txt leading-tight">{name}</p>
      </div>
      <div className="flex items-center gap-1 mt-auto">
        <span className="text-[10px] text-accent font-body font-medium uppercase tracking-wider">Dispense</span>
        <FontAwesomeIcon icon={faChevronRight} className="text-accent text-[9px]" />
      </div>
    </button>
  )
}

export function SearchScreen({ onResults, onSelect }: Props) {
  const [query, setQuery]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [error, setError]         = useState('')

  const searchRef = useRef<HTMLDivElement>(null)
  const bodyRef   = useRef<HTMLDivElement>(null)

  const debouncedQuery = useDebounce(query, 2500)

  useEffect(() => {
    const tl = gsap.timeline()
    tl.fromTo(searchRef.current, { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: 'power3.out' })
      .fromTo(bodyRef.current,   { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: 'power3.out' }, '-=0.2')
  }, [])

  const doSearch = useCallback(async (q: string) => {
    const trimmed = q.trim()
    if (!trimmed) return
    setLoading(true)
    setAiLoading(false)
    setError('')
    const aiTimer = setTimeout(() => setAiLoading(true), 600)
    try {
      const data = await api.search(trimmed)
      clearTimeout(aiTimer)
      setAiLoading(false)
      if (data.results.length === 0) {
        setError('No recipes found. Try something else.')
      } else {
        onResults(data.results, trimmed)
      }
    } catch {
      clearTimeout(aiTimer)
      setAiLoading(false)
      setError('Connection error. Check the server is running.')
    } finally {
      setLoading(false)
    }
  }, [onResults])

  // Featured card: fetch the recipe directly and jump straight to serving screen
  const doFeatured = useCallback(async (name: string) => {
    setLoading(true)
    setError('')
    try {
      const data = await api.search(name)
      if (data.results.length > 0) {
        onSelect(data.results[0])
      } else {
        setError('Recipe not found.')
      }
    } catch {
      setError('Connection error.')
    } finally {
      setLoading(false)
    }
  }, [onSelect])

  useEffect(() => {
    if (debouncedQuery.trim()) doSearch(debouncedQuery)
    else { setError(''); setAiLoading(false) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery])

  const handleKey    = (e: React.KeyboardEvent) => { if (e.key === 'Enter') doSearch(query) }
  const handleChange = (v: string) => {
    setQuery(v)
    if (!v.trim()) { setError(''); setAiLoading(false); setLoading(false) }
  }

  const isSearching = loading && !aiLoading

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden pb-5" style={{ paddingLeft: '1rem', paddingRight: '1rem', boxSizing: 'border-box', width: '100%' }}>

      {/* Search bar */}
      <div ref={searchRef} className="mt-2" style={{ width: '100%' }}>
        <div className="flex items-center gap-3 glass-card px-3 py-3.5
                        focus-within:border-accent/50 transition-colors duration-200"
             style={{ width: '100%', boxSizing: 'border-box' }}>
          <FontAwesomeIcon
            icon={isSearching ? faWandMagicSparkles : faMagnifyingGlass}
            className={`flex-shrink-0 text-base transition-colors duration-200 ${isSearching ? 'animate-pulse text-accent' : 'text-muted'}`}
          />
          <input
            value={query}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={handleKey}
            placeholder="tacos, butter chicken…"
            className="flex-1 bg-transparent text-txt text-base font-body placeholder-muted/50 min-w-0"
            autoComplete="off" autoCorrect="off" spellCheck={false} inputMode="search"
            style={{ minWidth: 0 }}
          />
          {isSearching && (
            <div className="flex items-center gap-0.5 flex-shrink-0">
              {[0,1,2].map((i) => (
                <span key={i} className="w-1 h-1 rounded-full bg-accent"
                  style={{ animation: `aiBounce 1s ease-in-out ${i * 0.15}s infinite` }} />
              ))}
            </div>
          )}
        </div>
        {error && !aiLoading && (
          <p className="text-error text-sm mt-2 font-body font-light">{error}</p>
        )}
      </div>

      {aiLoading && query.trim() && <AiLoadingOverlay query={query.trim()} />}

      {!aiLoading && (
        <div ref={bodyRef} className="flex flex-col gap-5 mt-5" style={{ width: '100%' }}>

          {/* Featured blends */}
          <section style={{ width: '100%' }}>
            <div className="flex items-center gap-2 mb-3">
              <FontAwesomeIcon icon={faStar} className="text-accent text-xs" />
              <p className="text-xs text-muted font-body uppercase tracking-widest font-semibold">Featured Blends</p>
            </div>
            <div className="flex gap-2.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
              {FEATURED.map((f, i) => (
                <FeaturedCard
                  key={f.name}
                  name={f.name}
                  category={f.category}
                  slots={f.slots}
                  onClick={() => doFeatured(f.name)}
                  delay={i * 0.06}
                />
              ))}
            </div>
          </section>

          {/* Browse by cuisine */}
          <section style={{ width: '100%', boxSizing: 'border-box' }}>
            <div className="flex items-center gap-2 mb-3">
              <FontAwesomeIcon icon={faGlobe} className="text-accent text-xs" />
              <p className="text-xs text-muted font-body uppercase tracking-widest font-semibold">Browse by Cuisine</p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%', boxSizing: 'border-box' }}>
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.label}
                  onClick={() => { setQuery(cat.label); doSearch(cat.query) }}
                  style={{ width: '100%', boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.625rem 0.875rem', background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: '1rem', cursor: 'pointer' }}
                >
                  <div style={{ width: '2rem', height: '2rem', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: 'rgba(212,116,46,0.09)', border: '1px solid rgba(212,116,46,0.18)' }}>
                    <FontAwesomeIcon icon={cat.icon} className="text-accent text-sm" />
                  </div>
                  <span className="text-sm font-body text-txt font-medium" style={{ flex: 1, textAlign: 'left' }}>{cat.label}</span>
                  <FontAwesomeIcon icon={faChevronRight} className="text-muted text-xs" style={{ flexShrink: 0 }} />
                </button>
              ))}
            </div>
          </section>

          {/* Spice slots legend */}
          <section style={{ width: '100%', boxSizing: 'border-box', background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: '1rem', padding: '1rem', marginBottom: '0.25rem' }}>
            <div className="flex items-center gap-2 mb-3">
              <FontAwesomeIcon icon={faBowlFood} className="text-accent text-xs" />
              <p className="text-xs text-muted font-body uppercase tracking-widest font-semibold">Spice Slots</p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.625rem 0.75rem', width: '100%', boxSizing: 'border-box' }}>
              {Object.entries(SPICE_LABELS).map(([slot, label]) => (
                <div key={slot} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                  <span style={{ width: '0.625rem', height: '0.625rem', borderRadius: '50%', flexShrink: 0, backgroundColor: SPICE_COLORS[Number(slot)] }} />
                  <span className="font-body text-muted font-light" style={{ fontSize: '0.7rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <span className="text-txt font-semibold">{slot}</span>
                    <span style={{ margin: '0 3px', color: 'var(--color-border)' }}>·</span>
                    {label}
                  </span>
                </div>
              ))}
            </div>
          </section>

        </div>
      )}

      <style>{`
        @keyframes aiBounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40% { transform: translateY(-4px); opacity: 1; }
        }
        @keyframes aiSpin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes aiPulse {
          0%, 100% { opacity: 0.7; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.08); }
        }
        @keyframes aiShimmer {
          0%   { background-position: -200% 0; }
          100% { background-position:  200% 0; }
        }
      `}</style>
    </div>
  )
}