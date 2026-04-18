import { useRef, useEffect } from 'react'
import { gsap } from 'gsap'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChevronRight } from '@fortawesome/free-solid-svg-icons'
import type { Recipe } from '../types'
import { SPICE_COLORS } from '../types'

interface Props {
  recipe: Recipe
  servings?: number
  onSelect: (recipe: Recipe) => void
  delay?: number
}

const CATEGORY_MAP: Record<string, string> = {
  Mexican: 'MX',   Indian: 'IN',      Italian: 'IT',
  BBQ: 'BB',        Cajun: 'CJ',        Mediterranean: 'MD',
  'Middle Eastern': 'ME', American: 'AM', Caribbean: 'CB',
  Latin: 'LA',      Asian: 'AS',        Moroccan: 'MO',
  Seafood: 'SF',    Vegetarian: 'VG',   British: 'BR',
  Breakfast: 'BF',  Holiday: 'HD',      Turkish: 'TR',
  Levantine: 'LV',  'North African': 'NA', 'AI Generated': 'AI',
  Custom: 'CU',     General: 'GN',
}

export function SpiceCard({ recipe, servings = 1, onSelect, delay = 0 }: Props) {
  const cardRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    gsap.fromTo(
      cardRef.current,
      { y: 28, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.5, delay, ease: 'power3.out' },
    )
  }, [delay])

  const handlePress = () => {
    gsap.to(cardRef.current, {
      scale: 0.97,
      duration: 0.08,
      ease: 'power2.out',
      onComplete: () => {
        gsap.to(cardRef.current, {
          scale: 1,
          duration: 0.25,
          ease: 'back.out(2)',
          onComplete: () => onSelect(recipe),
        })
      },
    })
  }

  const label = CATEGORY_MAP[recipe.category] ?? 'GN'
  const activeSpices = recipe.spices.filter((s) => s.grams_per_serving > 0)
  const totalGrams = activeSpices.reduce((sum, s) => sum + s.grams_per_serving * servings, 0)

  return (
    <button
      ref={cardRef}
      onClick={handlePress}
      className="w-full text-left focus:outline-none"
      style={{ opacity: 0 }}
    >
      <div
        className="luxury-card p-4 transition-all duration-150 active:brightness-110"
        style={{ borderRadius: 20 }}
      >
        {/* Top row: badge + arrow */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="category-pill">
            <span>{label}</span>
            <span style={{ opacity: 0.4 }}>·</span>
            <span>{recipe.category}</span>
          </div>
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{
              background: 'rgba(200,105,42,0.1)',
              border: '1px solid rgba(200,105,42,0.2)',
            }}
          >
            <FontAwesomeIcon icon={faChevronRight} style={{ color: '#C8692A', fontSize: 11 }} />
          </div>
        </div>

        {/* Name */}
        <h3
          className="font-display font-semibold text-txt leading-tight mb-1"
          style={{ fontSize: 22 }}
        >
          {recipe.name}
        </h3>

        {/* Description */}
        {recipe.description && (
          <p
            className="font-body font-light leading-snug mb-4"
            style={{ fontSize: 12, color: '#6A6662' }}
          >
            {recipe.description}
          </p>
        )}

        {/* Spice bar visualization */}
        <div className="mb-3">
          <div className="flex h-1.5 rounded-full overflow-hidden gap-px">
            {activeSpices.map((sp) => {
              const pct = totalGrams > 0
                ? ((sp.grams_per_serving * servings) / totalGrams) * 100
                : 0
              return (
                <div
                  key={sp.slot}
                  style={{
                    width: `${pct}%`,
                    backgroundColor: SPICE_COLORS[sp.slot] ?? '#888',
                    minWidth: 2,
                  }}
                />
              )
            })}
          </div>
        </div>

        {/* Spice pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {activeSpices.map((sp) => {
            const grams = (sp.grams_per_serving * servings).toFixed(1)
            return (
              <span
                key={sp.slot}
                className="flex items-center gap-1 font-body"
                style={{
                  fontSize: 11,
                  color: '#6A6662',
                  padding: '3px 8px',
                  borderRadius: 100,
                  background: '#0F0E0C',
                  border: '1px solid #1E1B17',
                }}
              >
                <span
                  className="rounded-full flex-shrink-0"
                  style={{
                    width: 5,
                    height: 5,
                    backgroundColor: SPICE_COLORS[sp.slot] ?? '#888',
                  }}
                />
                {sp.name} {grams}g
              </span>
            )
          })}
        </div>
      </div>
    </button>
  )
}