// Search results list displaying recipe cards with staggered entrance animations.

import { useRef, useEffect } from 'react'
import { gsap } from 'gsap'
import { SpiceCard } from '../components/SpiceCard'
import type { Recipe } from '../types'

interface Props {
  results: Recipe[] // Array of matching recipes
  query: string // Search query string for the results header
  onSelect: (recipe: Recipe) => void // Callback when a recipe is selected
}

export function ResultsScreen({ results, query, onSelect }: Props) {
  const listRef = useRef<HTMLDivElement>(null)

  // Fade in the entire results container on mount
  useEffect(() => {
    gsap.fromTo(
      listRef.current,
      { opacity: 0 },
      { opacity: 1, duration: 0.3, ease: 'power2.out' },
    )
  }, [])

  return (
    <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto px-5 pb-safe">
      {/* Result count header */}
      <p className="text-muted text-xs mb-4 font-body font-light">
        {results.length} result{results.length !== 1 ? 's' : ''} for &ldquo;{query}&rdquo;
      </p>

      {/* Recipe cards with staggered delays */}
      <div className="flex flex-col gap-3">
        {results.map((recipe, i) => (
          <SpiceCard
            key={recipe.id}
            recipe={recipe}
            onSelect={onSelect}
            delay={i * 0.07} // Stagger entrance by 70ms per card
          />
        ))}
      </div>

      {/* Empty state */}
      {results.length === 0 && (
        <div className="text-center mt-16 text-muted font-body font-light">
          No results found
        </div>
      )}
    </div>
  )
}