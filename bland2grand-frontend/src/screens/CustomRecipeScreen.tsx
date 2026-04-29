import { useState, useRef, useEffect } from 'react'
import { gsap } from 'gsap'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faPlus,
  faMinus,
  faFloppyDisk,
  faTriangleExclamation,
  faCircleCheck,
} from '@fortawesome/free-solid-svg-icons'
import { SPICE_COLORS, SPICE_LABELS } from '../types'
import type { Recipe } from '../types'
import { api } from './lib/api'

// Imported from index.ts 
import {
  SPICE_DENSITY_G_PER_ML,
  TSP_ML,
  TBSP_ML,
  UNIT_STEPS,
  UNIT_MAX,
  UNIT_CYCLE,
} from '../types'
import type { Unit } from '../types'
// 

function toGrams(value: number, unit: Unit, slot: number): number {
  const density = SPICE_DENSITY_G_PER_ML[slot] ?? 0.85
  if (unit === 'g')   return value
  if (unit === 'tsp') return Math.min(value * TSP_ML  * density, 10)
  return Math.min(value * TBSP_ML * density, 10)
}

function fmtVal(value: number): string {
  if (value === 0) return '0'
  if (value % 1 === 0) return value.toFixed(0)
  return value.toFixed(2).replace(/\.?0+$/, '')
}

// Reusable spring-press button 
function PressButton({
  onClick, disabled = false, children, className = '', style = {},
}: {
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
}) {
  const ref = useRef<HTMLButtonElement>(null)

  const handleClick = () => {
    if (disabled || !ref.current) return
    gsap.to(ref.current, {
      scale: 0.88,
      duration: 0.08,
      ease: 'power2.out',
      onComplete: () => {
        gsap.to(ref.current, { scale: 1, duration: 0.3, ease: 'back.out(2.5)' })
      },
    })
    onClick()
  }

  return (
    <button
      ref={ref}
      onClick={handleClick}
      disabled={disabled}
      className={`flex items-center justify-center focus:outline-none transition-colors duration-150
                  disabled:opacity-30 disabled:cursor-not-allowed ${className}`}
      style={style}
    >
      {children}
    </button>
  )
}

// Bubble unit picker 
interface UnitPickerProps {
  unit: Unit
  isActive: boolean
  color: string
  onSelect: (u: Unit) => void
}

function UnitPicker({ unit, isActive, color, onSelect }: UnitPickerProps) {
  const [open, setOpen] = useState(false)
  const bubbleRefs = useRef<(HTMLButtonElement | null)[]>([])
  const triggerRef = useRef<HTMLButtonElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const otherUnits = UNIT_CYCLE.filter((u) => u !== unit)

  const openPicker = () => {
    if (open) return
    setOpen(true)

    // Trigger pill shrinks slightly then springs back
    if (triggerRef.current) {
      gsap.to(triggerRef.current, {
        scale: 0.85,
        duration: 0.08,
        ease: 'power2.out',
        onComplete: () => {
          gsap.to(triggerRef.current, { scale: 1, duration: 0.3, ease: 'back.out(3)' })
        },
      })
    }

    // Bubbles burst outward with stagger
    requestAnimationFrame(() => {
      bubbleRefs.current.forEach((el, i) => {
        if (!el) return
        gsap.fromTo(
          el,
          { scale: 0, opacity: 0, x: -8 },
          {
            scale: 1,
            opacity: 1,
            x: 0,
            duration: 0.38,
            delay: i * 0.06,
            ease: 'back.out(2.8)',
          }
        )
      })
    })
  }

  // Collapses bubbles in reverse order (outermost first → back to trigger),
  // then the trigger does a small "receive" spring, then fires the callback.
  const closePicker = (selected?: Unit) => {
    const els = [...bubbleRefs.current.filter(Boolean)] as HTMLButtonElement[]
    const reversed = [...els].reverse() // collapse from far → near

    gsap.to(reversed, {
      scale: 0,
      opacity: 0,
      x: -5,
      duration: 0.14,
      stagger: 0.05,
      ease: 'power2.in',
      onComplete: () => {
        // Trigger "receives" the choice with a little spring
        if (triggerRef.current) {
          gsap.fromTo(
            triggerRef.current,
            { scale: 0.88 },
            {
              scale: 1,
              duration: 0.35,
              ease: 'back.out(3)',
              onComplete: () => {
                setOpen(false)
                if (selected && selected !== unit) onSelect(selected)
              },
            }
          )
        } else {
          setOpen(false)
          if (selected && selected !== unit) onSelect(selected)
        }
      },
    })
  }

  const handleSelect = (u: Unit) => {
    const idx = otherUnits.indexOf(u)
    const el = bubbleRefs.current[idx]
    if (el) {
      // Chosen bubble pops slightly before the whole set collapses
      gsap.to(el, {
        scale: 1.18,
        duration: 0.1,
        ease: 'power2.out',
        onComplete: () => closePicker(u),
      })
    } else {
      closePicker(u)
    }
  }

  // Close on outside click (no selection)
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closePicker()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const pillBase: React.CSSProperties = {
    padding: '2px 8px',
    borderRadius: 6,
    fontSize: 11,
    fontFamily: 'Outfit, sans-serif',
    fontWeight: 600,
    letterSpacing: '0.04em',
    transition: 'background 0.15s, border-color 0.15s, color 0.15s',
    cursor: 'pointer',
    border: '1px solid transparent',
    lineHeight: '18px',
  }

  return (
    <div
      ref={containerRef}
      className="flex items-center gap-1.5"
      style={{ position: 'relative' }}
    >
      {/* Current unit trigger */}
      <button
        ref={triggerRef}
        onClick={openPicker}
        className="focus:outline-none"
        style={{
          ...pillBase,
          background: isActive ? `${color}20` : 'rgba(255,255,255,0.06)',
          border: `1px solid ${isActive ? `${color}40` : 'rgba(255,255,255,0.1)'}`,
          color: isActive ? color : '#7A7672',
        }}
      >
        {unit}
      </button>

      {/* Other-unit bubbles — rendered inline, animated via GSAP */}
      {open && otherUnits.map((u, i) => (
        <button
          key={u}
          ref={(el) => { bubbleRefs.current[i] = el }}
          onClick={() => handleSelect(u)}
          className="focus:outline-none"
          style={{
            ...pillBase,
            // start invisible; GSAP will animate in
            opacity: 0,
            scale: '0',
            background: isActive ? `${color}12` : 'rgba(255,255,255,0.08)',
            border: `1px solid ${isActive ? `${color}30` : 'rgba(255,255,255,0.14)'}`,
            color: isActive ? `${color}cc` : '#9A9590',
          }}
          onMouseEnter={(e) => {
            gsap.to(e.currentTarget, { scale: 1.1, duration: 0.15, ease: 'back.out(2)' })
          }}
          onMouseLeave={(e) => {
            gsap.to(e.currentTarget, { scale: 1, duration: 0.2, ease: 'power2.out' })
          }}
        >
          {u}
        </button>
      ))}
    </div>
  )
}

// Slot input 
interface SlotInputProps {
  slot: number
  unit: Unit
  value: number
  onChange: (slot: number, value: number) => void
  onUnitChange: (slot: number, unit: Unit) => void
}

function SlotInput({ slot, unit, value, onChange, onUnitChange }: SlotInputProps) {
  const valRef     = useRef<HTMLSpanElement>(null)
  const color      = SPICE_COLORS[slot] ?? '#C8692A'
  const step       = UNIT_STEPS[unit]
  const max        = UNIT_MAX[unit]
  const isActive   = value > 0
  const gramsEquiv = toGrams(value, unit, slot)

  const animateValue = (dir: number) => {
    if (!valRef.current) return
    gsap.fromTo(valRef.current,
      { y: dir > 0 ? 10 : -10, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.2, ease: 'back.out(2.5)' }
    )
  }

  const inc = () => {
    const next = Math.min(+(value + step).toFixed(2), max)
    if (next !== value) { onChange(slot, next); animateValue(1) }
  }
  const dec = () => {
    const next = Math.max(+(value - step).toFixed(2), 0)
    if (next !== value) { onChange(slot, next); animateValue(-1) }
  }

  const handleUnitSelect = (u: Unit) => {
    // Convert current value through grams → new unit, snapped to step
    const grams = toGrams(value, unit, slot)
    const density = SPICE_DENSITY_G_PER_ML[slot] ?? 0.85
    let converted = 0
    if (grams > 0) {
      if (u === 'g')    converted = grams
      if (u === 'tsp')  converted = grams / (TSP_ML  * density)
      if (u === 'tbsp') converted = grams / (TBSP_ML * density)
      const newStep = UNIT_STEPS[u]
      // snap to nearest step and clamp to max
      converted = Math.min(Math.round(converted / newStep) * newStep, UNIT_MAX[u])
      converted = +converted.toFixed(2)
    }
    // Number slides up as new value arrives
    if (valRef.current) {
      gsap.fromTo(valRef.current,
        { y: -12, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.28, ease: 'back.out(2.5)', delay: 0.05 }
      )
    }
    onUnitChange(slot, u)
    onChange(slot, converted)
  }

  return (
    <div
      className="py-4"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
    >
      {/* Row 1: dot + name + bubble unit picker */}
      <div className="flex items-center gap-2.5 mb-3">
        <span style={{
          width: 8, height: 8, borderRadius: '50%', flexShrink: 0, display: 'block',
          backgroundColor: isActive ? color : '#4A4642',
          boxShadow: isActive ? `0 0 8px ${color}88` : 'none',
          transition: 'all 0.3s',
        }} />
        <span className="font-body" style={{
          fontSize: 15,
          fontWeight: isActive ? 500 : 400,
          color: isActive ? '#EDE9E0' : '#9A9590',
        }}>
          {SPICE_LABELS[slot]}
        </span>

        <UnitPicker
          unit={unit}
          isActive={isActive}
          color={color}
          onSelect={handleUnitSelect}
        />
      </div>

      {/* Row 2: minus + value box + plus */}
      <div className="flex items-center gap-2.5">
        <PressButton
          onClick={dec}
          disabled={value === 0}
          className="rounded-xl flex-shrink-0"
          style={{ width: 40, height: 44, background: '#161411', border: '1px solid #3A3530' }}
        >
          <FontAwesomeIcon icon={faMinus} style={{ fontSize: 12, color: '#C4BFB4' }} />
        </PressButton>

        <div
          className="flex-1 flex items-center justify-between rounded-xl px-4"
          style={{
            height: 44,
            background: isActive ? `${color}14` : 'rgba(255,255,255,0.04)',
            border: `1px solid ${isActive ? `${color}45` : 'rgba(255,255,255,0.08)'}`,
            transition: 'all 0.2s',
          }}
        >
          <div className="flex items-baseline gap-1.5">
            <span ref={valRef} className="font-body font-semibold tabular-nums" style={{
              fontSize: 22,
              color: isActive ? color : '#7A7672',
            }}>
              {fmtVal(value)}
            </span>
            <span className="font-body" style={{
              fontSize: 13,
              color: isActive ? `${color}bb` : '#4A4642',
            }}>
              {unit}
            </span>
          </div>

          {isActive && unit !== 'g' && (
            <span className="font-body tabular-nums" style={{
              fontSize: 12,
              color: '#7A7672',
            }}>
              ≈ {gramsEquiv.toFixed(1)} g
            </span>
          )}
        </div>

        <PressButton
          onClick={inc}
          disabled={value >= max}
          className="rounded-xl flex-shrink-0"
          style={{ width: 40, height: 44, background: '#161411', border: '1px solid #3A3530' }}
        >
          <FontAwesomeIcon icon={faPlus} style={{ fontSize: 12, color: '#C4BFB4' }} />
        </PressButton>
      </div>
    </div>
  )
}

// Main screen 
interface Props {
  onSaved: (recipe: Recipe) => void
  onBack: () => void
}

export function CustomRecipeScreen({ onSaved, onBack: _onBack }: Props) {
  const [name, setName]               = useState('')
  const [description, setDescription] = useState('')
  const [units, setUnits]             = useState<Record<number, Unit>>(
    Object.fromEntries(Object.keys(SPICE_LABELS).map((k) => [Number(k), 'tsp' as Unit]))
  )
  const [values, setValues] = useState<Record<number, number>>(
    Object.fromEntries(Object.keys(SPICE_LABELS).map((k) => [Number(k), 0]))
  )
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const [saved, setSaved]   = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const nameRef      = useRef<HTMLInputElement>(null)
  const saveRef      = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const sections = containerRef.current?.querySelectorAll('[data-s]')
    if (!sections) return
    gsap.fromTo(sections,
      { y: 20, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.45, stagger: 0.07, ease: 'power3.out' }
    )
  }, [])

  const handleSlotChange = (slot: number, value: number) =>
    setValues((prev) => ({ ...prev, [slot]: value }))
  const handleUnitChange = (slot: number, unit: Unit) =>
    setUnits((prev) => ({ ...prev, [slot]: unit }))

  const totalGrams   = Object.entries(values).reduce(
    (sum, [slot, val]) => sum + toGrams(val, units[Number(slot)], Number(slot)), 0
  )
  const activeCount  = Object.values(values).filter((v) => v > 0).length
  const activeSpices = Object.entries(values)
    .filter(([, v]) => v > 0)
    .map(([slot, v]) => ({ slot: Number(slot), grams: toGrams(v, units[Number(slot)], Number(slot)) }))

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Give your blend a name.')
      nameRef.current?.focus()
      gsap.fromTo(nameRef.current, { x: -6 }, { x: 0, duration: 0.4, ease: 'elastic.out(3, 0.3)' })
      return
    }
    if (activeCount === 0) {
      setError('Add at least one spice.')
      return
    }
    const spicesInGrams: Record<string, number> = {}
    Object.entries(values).forEach(([slot, val]) => {
      spicesInGrams[slot] = toGrams(val, units[Number(slot)], Number(slot))
    })
    setSaving(true); setError('')
    try {
      const result = await api.createRecipe(name.trim(), spicesInGrams, description.trim())
      setSaved(true)
      gsap.to(saveRef.current, {
        scale: 1.04, duration: 0.15, yoyo: true, repeat: 1, ease: 'power2.inOut',
        onComplete: () => { setTimeout(() => onSaved(result.recipe), 600) },
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save recipe.')
      setSaving(false)
    }
  }

  const handleSaveClick = () => {
    if (saving || saved || !saveRef.current) return
    gsap.to(saveRef.current, {
      scale: 0.97, duration: 0.08, ease: 'power2.out',
      onComplete: () => {
        gsap.to(saveRef.current, {
          scale: 1, duration: 0.3, ease: 'back.out(2)',
          onComplete: () => { void handleSave() },
        })
      },
    })
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
      <div className="flex flex-col px-5 pb-safe">

        {/* Name + description */}
        <div data-s className="pt-3 pb-5">
          <p style={{
            fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase',
            color: '#C8692A', fontWeight: 600, fontFamily: 'Outfit, sans-serif', marginBottom: 8,
          }}>
            Blend Name
          </p>
          <input
            ref={nameRef}
            value={name}
            onChange={(e) => { setName(e.target.value); setError('') }}
            placeholder="e.g. Sunday Roast Blend"
            className="w-full font-display font-semibold bg-transparent focus:outline-none leading-tight"
            style={{ fontSize: '1.8rem', color: '#EDE9E0', caretColor: '#C8692A' }}
          />
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Short description (optional)"
            className="w-full font-body font-light bg-transparent mt-2 focus:outline-none"
            style={{ fontSize: 14, color: '#9A9590', caretColor: '#C8692A' }}
          />
          <div className="h-px mt-3" style={{
            background: 'linear-gradient(90deg, rgba(200,105,42,0.5), transparent)',
          }} />
        </div>

        {/* Spice bar preview */}
        {activeCount > 0 && (
          <div data-s className="mb-5">
            <div className="flex h-1.5 rounded-full overflow-hidden gap-px mb-2">
              {activeSpices.map(({ slot, grams }) => (
                <div key={slot} style={{
                  width: `${(grams / totalGrams) * 100}%`,
                  backgroundColor: SPICE_COLORS[slot],
                  minWidth: 3,
                  transition: 'width 0.3s ease',
                }} />
              ))}
            </div>
            <div className="flex justify-between">
              <span className="font-body" style={{ fontSize: 12, color: '#9A9590' }}>
                {activeCount} spice{activeCount !== 1 ? 's' : ''} selected
              </span>
              <span className="font-body font-medium" style={{ fontSize: 12, color: '#C4BFB4' }}>
                {totalGrams.toFixed(1)} g total
              </span>
            </div>
          </div>
        )}

        {/* Spice inputs */}
        <div data-s className="luxury-card px-4 py-1 mb-5">
          <div
            className="flex items-center justify-between py-3"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
          >
            <p style={{
              fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase',
              color: '#C4BFB4', fontWeight: 600, fontFamily: 'Outfit, sans-serif',
            }}>
              Spice Amounts
            </p>
            <p style={{ fontSize: 11, color: '#7A7672', fontFamily: 'Outfit, sans-serif' }}>
              tap unit to switch
            </p>
          </div>

          {Object.keys(SPICE_LABELS).map((k) => (
            <SlotInput
              key={k}
              slot={Number(k)}
              unit={units[Number(k)]}
              value={values[Number(k)]}
              onChange={handleSlotChange}
              onUnitChange={handleUnitChange}
            />
          ))}
        </div>

        {/* Error */}
        {error && (
          <div
            data-s
            className="flex items-center gap-2.5 mb-4 px-4 py-3 rounded-xl"
            style={{ background: 'rgba(184,56,56,0.12)', border: '1px solid rgba(184,56,56,0.35)' }}
          >
            <FontAwesomeIcon icon={faTriangleExclamation} style={{ color: '#E07070', fontSize: 13 }} />
            <span className="font-body" style={{ fontSize: 14, color: '#E07070' }}>{error}</span>
          </div>
        )}

        {/* Info note */}
        <div
          data-s
          className="mb-6 px-4 py-3.5 rounded-xl"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)' }}
        >
          <p className="font-body font-light leading-relaxed" style={{ fontSize: 13, color: '#9A9590' }}>
            Place an empty bowl on the scale before dispensing — the machine will tare automatically.
          </p>
        </div>

        {/* Save button */}
        <div data-s className="pb-2">
          <button
            ref={saveRef}
            onClick={handleSaveClick}
            disabled={saving || saved}
            className="w-full py-[18px] rounded-2xl font-body font-semibold
                       flex items-center justify-center gap-3
                       disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none"
            style={{
              fontSize: 16,
              background: saved
                ? 'rgba(78,158,80,0.15)'
                : 'linear-gradient(135deg, #D4742E 0%, #B85C1E 100%)',
              border: saved ? '1px solid rgba(78,158,80,0.35)' : 'none',
              color: saved ? '#6EDC70' : '#fff',
              boxShadow: saved ? 'none' : '0 4px 24px rgba(200,105,42,0.3)',
            }}
          >
            <FontAwesomeIcon icon={saved ? faCircleCheck : faFloppyDisk} style={{ fontSize: 15 }} />
            {saved ? 'Saved!' : saving ? 'Saving…' : 'Save & Dispense'}
          </button>
        </div>

      </div>
    </div>
  )
}