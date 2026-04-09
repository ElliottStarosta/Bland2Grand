import { useCallback, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { Header } from './components/Header'
import { SearchScreen } from './screens/SearchScreen'
import { ResultsScreen } from './screens/ResultsScreen'
import { ServingScreen } from './screens/ServingScreen'
import { DispensingScreen } from './screens/DispensingScreen'
import { CompleteScreen } from './screens/CompleteScreen'
import { api } from './lib/api'
import { useDispenseStream } from './hooks/useDispenseStream'
import type { Recipe, Screen } from './types'

export default function App() {
  const [screen, setScreen]       = useState<Screen>('search')
  const [results, setResults]     = useState<Recipe[]>([])
  const [query, setQuery]         = useState('')
  const [selected, setSelected]   = useState<Recipe | null>(null)
  const [dispLoading, setDispLoading] = useState(false)

  const { session, connect, reset: resetSession, setSession } = useDispenseStream()

  const contentRef = useRef<HTMLDivElement>(null)

  // ── Screen transition helper ──────────────────────────────────────────────
  const navigateTo = useCallback((next: Screen) => {
    const el = contentRef.current
    if (!el) { setScreen(next); return }

    gsap.to(el, {
      x: -20,
      opacity: 0,
      duration: 0.18,
      ease: 'power2.in',
      onComplete: () => {
        setScreen(next)
        gsap.fromTo(el, { x: 20, opacity: 0 }, { x: 0, opacity: 1, duration: 0.28, ease: 'power3.out' })
      },
    })
  }, [])

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleResults = useCallback(
    (recipes: Recipe[], q: string) => {
      setResults(recipes)
      setQuery(q)
      navigateTo('results')
    },
    [navigateTo],
  )

  const handleSelect = useCallback(
    (recipe: Recipe) => {
      setSelected(recipe)
      navigateTo('serving')
    },
    [navigateTo],
  )

  const handleDispense = useCallback(
    async (servings: number) => {
      if (!selected) return
      setDispLoading(true)

      // Tag the serving count on the session state for display
      setSession((prev) => ({ ...prev, servingCount: servings }))

      try {
        await api.dispense(selected.id, servings)
        connect()   // open SSE stream
        navigateTo('dispensing')
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to start dispense.'
        alert(msg)
      } finally {
        setDispLoading(false)
      }
    },
    [selected, connect, navigateTo, setSession],
  )

  const handleReset = useCallback(() => {
    resetSession()
    setResults([])
    setQuery('')
    setSelected(null)
    navigateTo('search')
  }, [resetSession, navigateTo])

  const handleBack = useCallback(() => {
    const backMap: Partial<Record<Screen, Screen>> = {
      results:  'search',
      serving:  'results',
    }
    const prev = backMap[screen]
    if (prev) navigateTo(prev)
  }, [screen, navigateTo])

  // Auto-navigate to complete when session finishes
  const prevComplete = useRef(false)
  if (
    (session.isComplete || session.isError) &&
    !prevComplete.current &&
    screen === 'dispensing'
  ) {
    prevComplete.current = true
    setTimeout(() => navigateTo('complete'), 600)
  }
  if (!session.isComplete && !session.isError) {
    prevComplete.current = false
  }

  const showBack = screen === 'results' || screen === 'serving'

  return (
    <div className="h-full flex flex-col max-w-md mx-auto overflow-hidden bg-bg">

      {/* Grain overlay */}
      <div
        className="pointer-events-none fixed inset-0 z-50 opacity-[0.025]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'repeat',
          backgroundSize: '128px 128px',
        }}
      />

      {/* Ambient glow top */}
      <div
        className="pointer-events-none fixed top-0 left-1/2 -translate-x-1/2 w-64 h-32 z-0 opacity-30"
        style={{
          background: 'radial-gradient(ellipse at 50% 0%, rgba(212,116,46,0.25) 0%, transparent 70%)',
        }}
      />

      {/* Header */}
      <Header
        screen={screen}
        onBack={showBack ? handleBack : undefined}
      />

      {/* Screen content */}
      <div ref={contentRef} className="flex-1 overflow-hidden flex flex-col min-h-0">
        {screen === 'search' && (
          <SearchScreen onResults={handleResults} />
        )}
        {screen === 'results' && (
          <ResultsScreen results={results} query={query} onSelect={handleSelect} />
        )}
        {screen === 'serving' && selected && (
          <ServingScreen
            recipe={selected}
            onDispense={handleDispense}
            loading={dispLoading}
          />
        )}
        {screen === 'dispensing' && (
          <DispensingScreen session={session} />
        )}
        {screen === 'complete' && (
          <CompleteScreen session={session} onReset={handleReset} />
        )}
      </div>
    </div>
  )
}
