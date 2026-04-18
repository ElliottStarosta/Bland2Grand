import { useState, useRef, useEffect } from 'react'
import { gsap } from 'gsap'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPlus, faMinus, faPlay } from '@fortawesome/free-solid-svg-icons'
import type { Recipe } from '../types'
import { SPICE_COLORS } from '../types'

interface Props {
  recipe: Recipe
  onDispense: (servings: number) => void
  loading?: boolean
}

export function ServingScreen({ recipe, onDispense, loading }: Props) {
  const [servings, setServings] = useState(1)
  const countRef    = useRef<HTMLSpanElement>(null)
  const minusRef    = useRef<HTMLButtonElement>(null)
  const plusRef     = useRef<HTMLButtonElement>(null)
  const btnRef      = useRef<HTMLButtonElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Entrance animation
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const sections = el.querySelectorAll('[data-s]')
    gsap.fromTo(sections,
      { y: 28, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.5, stagger: 0.09, ease: 'power3.out' },
    )
  }, [])

  const animateCount = (delta: number) => {
    if (!countRef.current) return
    gsap.fromTo(countRef.current,
      { y: delta > 0 ? 20 : -20, opacity: 0, scale: 0.8 },
      { y: 0, opacity: 1, scale: 1, duration: 0.22, ease: 'back.out(2.5)' },
    )
  }

  const changeServings = (delta: number) => {
    const next = Math.max(1, Math.min(20, servings + delta))
    if (next === servings) return
    setServings(next)
    animateCount(delta)
    const btn = delta > 0 ? plusRef.current : minusRef.current
    if (btn) gsap.fromTo(btn, { scale: 0.84 }, { scale: 1, duration: 0.22, ease: 'back.out(2.5)' })
  }

  const jumpTo = (n: number) => {
    if (n === servings) return
    setServings(n)
    animateCount(n > servings ? 1 : -1)
  }

  const handleDispense = () => {
    if (loading) return
    gsap.to(btnRef.current,
      { scale: 0.95, duration: 0.1, yoyo: true, repeat: 1,
        ease: 'power2.inOut', onComplete: () => onDispense(servings) },
    )
  }

  const activeSpices = recipe.spices.filter(s => s.grams_per_serving > 0)
  const totalGrams   = activeSpices.reduce((sum, s) => sum + s.grams_per_serving * servings, 0)

  return (
    /* Outer: full height, scrollable */
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto"
      style={{ WebkitOverflowScrolling: 'touch' }}
    >
      <div className="flex flex-col px-5 pb-safe gap-0">

        {/*  Recipe identity  */}
        <div data-s className="pt-2 pb-6">
          <span className="text-[10px] font-body font-semibold tracking-[0.2em] uppercase text-accent">
            {recipe.category}
          </span>
          <h2 className="font-display text-[2.1rem] font-semibold text-txt leading-[1.05] mt-0.5">
            {recipe.name}
          </h2>
          {recipe.description && (
            <p className="text-muted text-[13px] font-body font-light mt-2 leading-relaxed">
              {recipe.description}
            </p>
          )}
        </div>

        {/*  Serving counter — the hero  */}
        <div data-s>
          <p className="text-[10px] font-body font-semibold tracking-[0.2em] uppercase text-muted mb-4">
            How many servings?
          </p>

          {/* Big counter row */}
          <div className="flex items-center justify-between mb-5">
            {/* Minus button */}
            <button
              ref={minusRef}
              onClick={() => changeServings(-1)}
              disabled={servings === 1}
              aria-label="Fewer servings"
              className="w-14 h-14 rounded-2xl border border-border flex items-center justify-center
                         text-muted disabled:opacity-20 active:border-accent active:text-accent
                         transition-colors duration-100 focus:outline-none flex-shrink-0"
            >
              <FontAwesomeIcon icon={faMinus} className="text-lg" />
            </button>

            {/* Number centred absolutely between buttons */}
            <div className="flex-1 flex flex-col items-center gap-1">
              <span
                ref={countRef}
                className="font-display text-[5.5rem] font-semibold text-txt leading-none tabular-nums"
                style={{ display: 'block' }}
              >
                {servings}
              </span>
              <span className="font-body text-sm text-muted font-light">
                {servings === 1 ? 'serving' : 'servings'}
              </span>
            </div>

            {/* Plus button */}
            <button
              ref={plusRef}
              onClick={() => changeServings(1)}
              disabled={servings === 20}
              aria-label="More servings"
              className="w-14 h-14 rounded-2xl border border-border flex items-center justify-center
                         text-muted disabled:opacity-20 active:border-accent active:text-accent
                         transition-colors duration-100 focus:outline-none flex-shrink-0"
            >
              <FontAwesomeIcon icon={faPlus} className="text-lg" />
            </button>
          </div>

          {/* Quick-pick row */}
          <div className="grid grid-cols-5 gap-2 mb-8">
            {[1, 2, 4, 6, 8].map(n => (
              <button
                key={n}
                onClick={() => jumpTo(n)}
                className={`py-2.5 rounded-xl text-sm font-body font-medium border
                            transition-all duration-150 focus:outline-none
                            ${servings === n
                              ? 'border-accent text-accent bg-accent/10'
                              : 'border-border text-muted active:border-accent/40'
                            }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/*  Divider  */}
        <div data-s className="h-px bg-border mb-7" />

        {/*  Spice breakdown  */}
        <div data-s className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] font-body font-semibold tracking-[0.2em] uppercase text-muted">
              Spice amounts
            </p>
            <p className="text-[11px] font-body text-muted font-light">
              {totalGrams.toFixed(1)} g total
            </p>
          </div>

          <div className="flex flex-col gap-4">
            {activeSpices.map(sp => {
              const grams = sp.grams_per_serving * servings
              const pct   = totalGrams > 0 ? (grams / totalGrams) * 100 : 0
              const color = SPICE_COLORS[sp.slot] ?? '#888'
              return (
                <div key={sp.slot}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <span className="text-[15px] font-body text-txt truncate">
                        {sp.name}
                      </span>
                    </div>
                    <span className="text-[13px] font-body font-light flex-shrink-0 ml-3"
                          style={{ color }}>
                      {grams.toFixed(1)} g
                    </span>
                  </div>
                  <div className="h-[3px] rounded-full overflow-hidden"
                       style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <div
                      className="h-full rounded-full transition-all duration-400"
                      style={{ width: `${pct}%`, backgroundColor: color, opacity: 0.75 }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/*  Info note  */}
        <div data-s
          className="mb-6 px-4 py-3 rounded-xl border border-border"
          style={{ background: 'rgba(255,255,255,0.02)' }}
        >
          <p className="text-[12px] font-body font-light text-muted leading-relaxed">
            Place an empty bowl on the scale before dispensing — the machine will tare automatically.
          </p>
        </div>

        {/*  Dispense button  */}
        <div data-s className="pb-2">
          <button
            ref={btnRef}
            onClick={handleDispense}
            disabled={loading}
            className="w-full py-[18px] rounded-2xl bg-accent text-white
                       font-body font-semibold text-[16px] tracking-wide
                       flex items-center justify-center gap-3
                       active:bg-accent/85 transition-colors duration-150
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <FontAwesomeIcon icon={faPlay} className="animate-pulse text-sm" />
                Starting…
              </>
            ) : (
              <>
                <FontAwesomeIcon icon={faPlay} className="text-sm" />
                Dispense {servings} {servings === 1 ? 'serving' : 'servings'}
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  )
}