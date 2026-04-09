import { useState, useRef, useEffect } from 'react'
import { gsap } from 'gsap'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPlus, faMinus, faPlay, faCircleInfo } from '@fortawesome/free-solid-svg-icons'
import type { Recipe } from '../types'
import { SPICE_COLORS } from '../types'

interface Props {
  recipe: Recipe
  onDispense: (servings: number) => void
  loading?: boolean
}

export function ServingScreen({ recipe, onDispense, loading }: Props) {
  const [servings, setServings] = useState(1)
  const countRef = useRef<HTMLSpanElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const tl = gsap.timeline()
    tl.fromTo(cardRef.current, { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: 'power3.out' })
  }, [])

  const changeServings = (delta: number) => {
    const next = Math.max(1, Math.min(20, servings + delta))
    if (next === servings) return
    setServings(next)
    gsap.fromTo(
      countRef.current,
      { y: delta > 0 ? 10 : -10, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.22, ease: 'power3.out' },
    )
  }

  const handleDispense = () => {
    if (loading) return
    gsap.to(btnRef.current, {
      scale: 0.96,
      duration: 0.1,
      yoyo: true,
      repeat: 1,
      ease: 'power2.inOut',
      onComplete: () => onDispense(servings),
    })
  }

  const activeSpices = recipe.spices.filter((s) => s.grams_per_serving > 0)
  const totalGrams = activeSpices.reduce((sum, s) => sum + s.grams_per_serving * servings, 0)

  return (
    <div className="flex-1 overflow-y-auto px-5 pb-safe flex flex-col gap-4">
      {/* Recipe summary card */}
      <div ref={cardRef} className="glass-card p-4">
        <h2 className="font-display text-2xl font-semibold text-txt leading-tight mb-0.5">
          {recipe.name}
        </h2>
        <p className="text-muted text-sm font-body font-light">{recipe.category}</p>

        {/* Spice list */}
        <div className="mt-4 space-y-2">
          {activeSpices.map((sp) => {
            const grams = sp.grams_per_serving * servings
            const pct = (grams / totalGrams) * 100
            return (
              <div key={sp.slot} className="flex items-center gap-2.5">
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: SPICE_COLORS[sp.slot] ?? '#888' }}
                />
                <span className="text-sm font-body text-txt w-32 truncate">{sp.name}</span>
                <div className="flex-1 h-1 bg-surface rounded-full overflow-hidden border border-border">
                  <div
                    className="h-full rounded-full transition-all duration-400"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: SPICE_COLORS[sp.slot] ?? '#888',
                    }}
                  />
                </div>
                <span className="text-xs text-muted font-body w-10 text-right font-light">
                  {grams.toFixed(1)}g
                </span>
              </div>
            )
          })}
        </div>

        {/* Total */}
        <div className="mt-3 pt-3 border-t border-border flex justify-between items-center">
          <span className="text-xs text-muted font-body uppercase tracking-wider font-semibold">
            Total
          </span>
          <span className="text-sm font-body text-accent-2 font-medium">
            {totalGrams.toFixed(1)} g
          </span>
        </div>
      </div>

      {/* Serving counter */}
      <div className="glass-card p-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs text-muted font-body uppercase tracking-wider font-semibold mb-0.5">
            Servings
          </p>
          <p className="text-xs text-muted font-body font-light">
            1 – 20 portions
          </p>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={() => changeServings(-1)}
            disabled={servings === 1}
            className="w-10 h-10 rounded-full border border-border flex items-center justify-center
                       text-muted disabled:opacity-30 active:scale-90 transition-all duration-100
                       active:border-accent active:text-accent"
          >
            <FontAwesomeIcon icon={faMinus} className="text-sm" />
          </button>

          <span
            ref={countRef}
            className="font-display text-4xl font-semibold text-txt w-10 text-center"
          >
            {servings}
          </span>

          <button
            onClick={() => changeServings(1)}
            disabled={servings === 20}
            className="w-10 h-10 rounded-full border border-border flex items-center justify-center
                       text-muted disabled:opacity-30 active:scale-90 transition-all duration-100
                       active:border-accent active:text-accent"
          >
            <FontAwesomeIcon icon={faPlus} className="text-sm" />
          </button>
        </div>
      </div>

      {/* Info note */}
      <div className="flex items-start gap-2 px-1">
        <FontAwesomeIcon icon={faCircleInfo} className="text-muted text-xs mt-0.5 flex-shrink-0" />
        <p className="text-muted text-xs font-body font-light leading-relaxed">
          Place an empty bowl on the scale before dispensing. The machine will tare automatically.
        </p>
      </div>

      {/* Dispense button */}
      <button
        ref={btnRef}
        onClick={handleDispense}
        disabled={loading}
        className="w-full mt-auto py-4 rounded-2xl bg-accent text-white font-body font-semibold
                   text-base flex items-center justify-center gap-3
                   active:bg-accent/90 transition-colors duration-150
                   disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {loading ? (
          <>
            <FontAwesomeIcon icon={faPlay} className="animate-pulse" />
            Starting…
          </>
        ) : (
          <>
            <FontAwesomeIcon icon={faPlay} />
            Dispense {servings} serving{servings !== 1 ? 's' : ''}
          </>
        )}
      </button>
    </div>
  )
}
