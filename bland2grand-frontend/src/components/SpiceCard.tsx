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

const CATEGORY_EMOJI_MAP: Record<string, string> = {
  Mexican: 'MX',
  Indian: 'IN',
  Italian: 'IT',
  BBQ: 'BB',
  Cajun: 'CJ',
  Mediterranean: 'MD',
  'Middle Eastern': 'ME',
  American: 'AM',
  Caribbean: 'CB',
  Latin: 'LA',
  Asian: 'AS',
  Moroccan: 'MO',
  Seafood: 'SF',
  Vegetarian: 'VG',
  British: 'BR',
  Breakfast: 'BF',
  Holiday: 'HD',
  Turkish: 'TR',
  Levantine: 'LV',
  'North African': 'NA',
  'AI Generated': 'AI',
  Custom: 'CU',
  General: 'GN',
}

export function SpiceCard({ recipe, servings = 1, onSelect, delay = 0 }: Props) {
  const cardRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    gsap.fromTo(
      cardRef.current,
      { y: 24, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.45, delay, ease: 'power3.out' },
    )
  }, [delay])

  const handlePress = () => {
    gsap.to(cardRef.current, {
      scale: 0.97,
      duration: 0.1,
      ease: 'power2.out',
      onComplete: () => {
        gsap.to(cardRef.current, {
          scale: 1,
          duration: 0.2,
          ease: 'back.out(2)',
          onComplete: () => onSelect(recipe),
        })
      },
    })
  }

  const label = CATEGORY_EMOJI_MAP[recipe.category] ?? 'GN'
  const activeSpices = recipe.spices.filter((s) => s.grams_per_serving > 0)

  return (
    <button
      ref={cardRef}
      onClick={handlePress}
      className="w-full text-left glass-card p-4 active:bg-card-hover
                 transition-colors duration-150 focus:outline-none"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Category badge */}
          <span className="inline-block text-[10px] font-semibold tracking-widest
                           text-accent px-2 py-0.5 rounded-full border border-accent/25
                           bg-accent/10 mb-2 uppercase font-body">
            {label} · {recipe.category}
          </span>

          {/* Name */}
          <h3 className="font-display text-xl font-semibold text-txt leading-tight">
            {recipe.name}
          </h3>

          {/* Description */}
          {recipe.description && (
            <p className="text-muted text-xs mt-0.5 font-body font-light leading-snug">
              {recipe.description}
            </p>
          )}

          {/* Spice dots */}
          <div className="flex items-center gap-1.5 mt-3 flex-wrap">
            {activeSpices.map((sp) => {
              const grams = (sp.grams_per_serving * servings).toFixed(1)
              return (
                <span
                  key={sp.slot}
                  className="flex items-center gap-1 text-[11px] font-body text-muted
                             px-2 py-0.5 rounded-full bg-surface border border-border"
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: SPICE_COLORS[sp.slot] ?? '#888' }}
                  />
                  {sp.name} · {grams}g
                </span>
              )
            })}
          </div>
        </div>

        {/* Arrow */}
        <div className="flex-shrink-0 mt-1">
          <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center">
            <FontAwesomeIcon icon={faChevronRight} className="text-accent text-xs" />
          </div>
        </div>
      </div>
    </button>
  )
}