// Preloaded MP3 voice lines per slot (public/audio/{spice}.mp3).

import { SPICE_SLOTS } from '../slotConfig'

function toAudioSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '')
}

function buildSlotAudio(): Record<number, string> {
  const result: Record<number, string> = {}
  for (const [slot, name] of Object.entries(SPICE_SLOTS)) {
    result[Number(slot)] = `/audio/${toAudioSlug(name)}.mp3`
  }
  return result
}

const SLOT_AUDIO = buildSlotAudio()

const pool: Record<number, HTMLAudioElement> = {}
let current: HTMLAudioElement | null = null

export function primeAudio(): void {
  for (const [slotStr, src] of Object.entries(SLOT_AUDIO)) {
    const slot = Number(slotStr)
    if (pool[slot]) continue
    const audio = new Audio(src)
    audio.preload = 'auto'
    audio.load()
    pool[slot] = audio
  }
}

export function playSlotVoiceLine(slot: number): void {
  const audio = pool[slot]
  if (!audio) return

  if (current && current !== audio) {
    current.pause()
    current.currentTime = 0
  }

  audio.currentTime = 0
  audio.play().catch((err) => {
    console.warn('[SlotAudio] play failed for slot', slot, err)
  })
  current = audio
}