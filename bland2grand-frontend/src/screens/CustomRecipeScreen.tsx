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

// Spice densities g/ml — tsp = 4.92ml, tbsp = 14.79ml
const SPICE_DENSITY_G_PER_ML: Record<number, number> = {
  1: 0.90, // Cumin
  2: 0.95, // Paprika
  3: 0.50, // Garlic Powder (fluffy)
  4: 0.85, // Chili Powder
  5: 0.30, // Oregano (very fluffy)
  6: 0.55, // Onion Powder
  7: 1.05, // Black Pepper
  8: 0.95, // Cayenne
}

const TSP_ML = 4.92
const TBSP_ML = 14.79

type Unit = 'g' | 'tsp' | 'tbsp'

const UNIT_STEPS: Record<Unit, number> = { g: 0.5, tsp: 0.25, tbsp: 0.25 }
const UNIT_MAX: Record<Unit, number>   = { g: 10,  tsp: 3,    tbsp: 1    }

function toGrams(value: number, unit: Unit, slot: number): number {
  const density = SPICE_DENSITY_G_PER_ML[slot] ?? 0.85
  if (unit === 'g')    return value
  if (unit === 'tsp')  return Math.min(value * TSP_ML  * density, 10)
  return Math.min(value * TBSP_ML * density, 10)
}

function fmtVal(value: number): string {
  if (value === 0) return '0'
  if (value % 1 === 0) return value.toFixed(0)
  return value.toFixed(2).replace(/\.?0+$/, '')
}

interface SlotInputProps {
  slot: number
  unit: Unit
  value: number
  onChange: (slot: number, value: number) => void
}

function SlotInput({ slot, unit, value, onChange }: SlotInputProps) {
  const valRef  = useRef<HTMLSpanElement>(null)
  const color   = SPICE_COLORS[slot] ?? '#C8692A'
  const step    = UNIT_STEPS[unit]
  const max     = UNIT_MAX[unit]
  const isActive = value > 0

  const animateValue = (dir: number) => {
    if (!valRef.current) return
    gsap.fromTo(valRef.current,
      { y: dir > 0 ? 8 : -8, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.18, ease: 'back.out(2)' }
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

  const gramsEquiv = toGrams(value, unit, slot)

  return (
    <div className="flex items-center gap-3 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>

      {/* Color dot + name */}
      <div className="flex items-center gap-2.5" style={{ width: 130, flexShrink: 0 }}>
        <span className="rounded-full flex-shrink-0 transition-all duration-300" style={{
          width: 8, height: 8,
          backgroundColor: isActive ? color : '#3A3530',
          boxShadow: isActive ? `0 0 8px ${color}88` : 'none',
        }} />
        <span className="font-body truncate" style={{
          fontSize: 13,
          color: isActive ? '#EDE9E0' : '#8A8580',
        }}>
          {SPICE_LABELS[slot]}
        </span>
      </div>

      {/* Minus */}
      <button onClick={dec} disabled={value === 0}
        className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0
                   disabled:opacity-30 transition-colors duration-100 focus:outline-none"
        style={{ background: '#0F0E0C', border: '1px solid #2E2B27' }}>
        <FontAwesomeIcon icon={faMinus} style={{ fontSize: 10, color: '#A0A0A0' }} />
      </button>

      {/* Value display */}
      <div className="flex-1 flex items-center justify-center rounded-xl" style={{
        background: isActive ? 'rgba(200,105,42,0.1)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${isActive ? 'rgba(200,105,42,0.3)' : 'rgba(255,255,255,0.07)'}`,
        height: 36,
        minWidth: 60,
      }}>
        <span ref={valRef} className="font-body font-medium tabular-nums" style={{
          fontSize: 14,
          color: isActive ? color : '#6A6662',
        }}>
          {fmtVal(value)}
        </span>
        <span className="font-body ml-1" style={{
          fontSize: 11,
          color: isActive ? '#C8894A' : '#4A4642',
        }}>
          {unit}
        </span>
      </div>

      {/* Plus */}
      <button onClick={inc} disabled={value >= max}
        className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0
                   disabled:opacity-30 transition-colors duration-100 focus:outline-none"
        style={{ background: '#0F0E0C', border: '1px solid #2E2B27' }}>
        <FontAwesomeIcon icon={faPlus} style={{ fontSize: 10, color: '#A0A0A0' }} />
      </button>

      {/* Grams equivalent — shown when unit is tsp/tbsp */}
      <div style={{ width: 44, flexShrink: 0, textAlign: 'right' }}>
        <span className="font-body font-light tabular-nums" style={{
          fontSize: 11,
          color: isActive && unit !== 'g' ? '#8A8580' : 'transparent',
        }}>
          {gramsEquiv.toFixed(1)}g
        </span>
      </div>
    </div>
  )
}

interface Props {
  onSaved: (recipe: Recipe) => void
  onBack: () => void
}

export function CustomRecipeScreen({ onSaved, onBack: _onBack }: Props) {
  const [name, setName]               = useState('')
  const [description, setDescription] = useState('')
  const [unit, setUnit]               = useState<Unit>('tsp')
  const [values, setValues]           = useState<Record<number, number>>(
    Object.fromEntries(Object.keys(SPICE_LABELS).map((k) => [Number(k), 0]))
  )
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')
  const [saved, setSaved]     = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const nameRef      = useRef<HTMLInputElement>(null)
  const saveRef      = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const sections = el.querySelectorAll('[data-s]')
    gsap.fromTo(sections,
      { y: 22, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.45, stagger: 0.07, ease: 'power3.out' }
    )
  }, [])

  // Clear values when switching units so amounts don't carry over confusingly
  const handleUnitChange = (u: Unit) => {
    setUnit(u)
    setValues(Object.fromEntries(Object.keys(SPICE_LABELS).map((k) => [Number(k), 0])))
  }

  const handleSlotChange = (slot: number, value: number) => {
    setValues((prev) => ({ ...prev, [slot]: value }))
  }

  const totalGrams  = Object.entries(values).reduce((sum, [slot, val]) => sum + toGrams(val, unit, Number(slot)), 0)
  const activeCount = Object.values(values).filter((v) => v > 0).length
  const activeSpices = Object.entries(values)
    .filter(([, v]) => v > 0)
    .map(([slot, v]) => ({ slot: Number(slot), grams: toGrams(v, unit, Number(slot)) }))

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
      spicesInGrams[slot] = toGrams(val, unit, Number(slot))
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

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
      <div className="flex flex-col px-5 pb-safe gap-0">

        {/* ── Name + description ── */}
        <div data-s className="pt-2 pb-5">
          <p style={{ fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#C8692A', fontWeight: 600, fontFamily: 'Outfit, sans-serif', marginBottom: 8 }}>
            Blend Name
          </p>
          <input
            ref={nameRef}
            value={name}
            onChange={(e) => { setName(e.target.value); setError('') }}
            placeholder="e.g. Sunday Roast Blend"
            className="w-full font-display font-semibold bg-transparent focus:outline-none leading-tight"
            style={{ fontSize: '1.7rem', color: '#EDE9E0', caretColor: '#C8692A' }}
          />
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Short description (optional)"
            className="w-full font-body font-light bg-transparent mt-2 focus:outline-none"
            style={{ fontSize: 13, color: '#A09890', caretColor: '#C8692A' }}
          />
          <div className="h-px mt-3" style={{
            background: 'linear-gradient(90deg, rgba(200,105,42,0.4), transparent)'
          }} />
        </div>

        {/* ── Unit selector ── */}
        <div data-s className="pb-5">
          <p style={{ fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#B0ABA4', fontWeight: 600, fontFamily: 'Outfit, sans-serif', marginBottom: 12 }}>
            Measure in
          </p>
          <div className="flex gap-2">
            {(['tsp', 'tbsp', 'g'] as Unit[]).map((u) => (
              <button key={u} onClick={() => handleUnitChange(u)}
                className="flex-1 py-2.5 rounded-xl font-body font-medium text-sm
                           transition-all duration-150 focus:outline-none"
                style={{
                  background: unit === u ? 'rgba(200,105,42,0.15)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${unit === u ? 'rgba(200,105,42,0.45)' : 'rgba(255,255,255,0.08)'}`,
                  color: unit === u ? '#E8894A' : '#A09890',
                }}>
                {u === 'tsp' ? 'Teaspoon' : u === 'tbsp' ? 'Tablespoon' : 'Grams'}
              </button>
            ))}
          </div>
          {unit !== 'g' && (
            <p className="mt-2 font-body font-light" style={{ fontSize: 11, color: '#7A7570' }}>
              Amounts auto-convert to grams using spice density for precise dispensing.
            </p>
          )}
        </div>

        {/* ── Live spice bar preview ── */}
        {activeCount > 0 && (
          <div data-s className="mb-4">
            <div className="flex h-2 rounded-full overflow-hidden gap-px">
              {activeSpices.map(({ slot, grams }) => (
                <div key={slot} style={{
                  width: `${(grams / totalGrams) * 100}%`,
                  backgroundColor: SPICE_COLORS[slot],
                  minWidth: 3,
                  transition: 'width 0.3s ease',
                }} />
              ))}
            </div>
            <div className="flex justify-between mt-1.5">
              <span className="font-body font-light" style={{ fontSize: 10, color: '#7A7570' }}>
                {activeCount} spice{activeCount !== 1 ? 's' : ''}
              </span>
              <span className="font-body font-light" style={{ fontSize: 10, color: '#7A7570' }}>
                {totalGrams.toFixed(1)} g total
              </span>
            </div>
          </div>
        )}

        {/* ── Spice slot inputs ── */}
        <div data-s className="luxury-card px-4 py-1 mb-5">
          <div className="flex items-center justify-between py-3 mb-1"
               style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <p style={{ fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#B0ABA4', fontWeight: 600, fontFamily: 'Outfit, sans-serif' }}>
              Spice Amounts
            </p>
            {unit !== 'g' && (
              <p style={{ fontSize: 10, color: '#6A6662', fontFamily: 'Outfit, sans-serif', fontWeight: 300 }}>
                ≈ grams shown right
              </p>
            )}
          </div>
          {Object.keys(SPICE_LABELS).map((k) => (
            <SlotInput key={k} slot={Number(k)} unit={unit} value={values[Number(k)]} onChange={handleSlotChange} />
          ))}
        </div>

        {/* ── Error message ── */}
        {error && (
          <div data-s className="flex items-center gap-2 mb-4 px-4 py-3 rounded-xl"
               style={{ background: 'rgba(184,56,56,0.1)', border: '1px solid rgba(184,56,56,0.25)' }}>
            <FontAwesomeIcon icon={faTriangleExclamation} style={{ color: '#E05050', fontSize: 12 }} />
            <span className="font-body text-sm" style={{ color: '#E05050' }}>{error}</span>
          </div>
        )}

        {/* ── Info note ── */}
        <div data-s className="mb-6 px-4 py-3 rounded-xl"
             style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <p className="font-body font-light leading-relaxed" style={{ fontSize: 12, color: '#8A8580' }}>
            Place an empty bowl on the scale before dispensing — the machine will tare automatically.
          </p>
        </div>

        {/* ── Save button ── */}
        <div data-s className="pb-2">
          <button
            ref={saveRef}
            onClick={handleSave}
            disabled={saving || saved}
            className="w-full py-[18px] rounded-2xl font-body font-semibold text-[16px]
                       flex items-center justify-center gap-3
                       transition-all duration-150 focus:outline-none
                       disabled:opacity-60 disabled:cursor-not-allowed"
            style={{
              background: saved
                ? 'rgba(78,158,80,0.15)'
                : 'linear-gradient(135deg, #D4742E 0%, #B85C1E 100%)',
              border: saved ? '1px solid rgba(78,158,80,0.3)' : 'none',
              color: saved ? '#6EDC70' : '#fff',
              boxShadow: saved ? 'none' : '0 4px 24px rgba(200,105,42,0.3)',
            }}>
            <FontAwesomeIcon icon={saved ? faCircleCheck : faFloppyDisk} style={{ fontSize: 15 }} />
            {saved ? 'Saved!' : saving ? 'Saving…' : 'Save & Dispense'}
          </button>
        </div>

      </div>
    </div>
  )
}