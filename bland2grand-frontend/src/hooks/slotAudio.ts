const SLOT_AUDIO: Record<number, string> = {
  1: '/audio/slot1_cumin.mp3',
  2: '/audio/slot2_paprika.mp3',
  3: '/audio/slot3_garlic.mp3',
  4: '/audio/slot4_salt.mp3',
  5: '/audio/slot5_oregano.mp3',
  6: '/audio/slot6_onionpowder.mp3',
  7: '/audio/slot7_pepper.mp3',
  8: '/audio/slot8_cayenne.mp3',
}

const pool: Record<number, HTMLAudioElement> = {}
let current: HTMLAudioElement | null = null

// Call this inside the dispense button tap handler (synchronous gesture).
// Just instantiates + loads — no play(), so no sound on tap.
export function primeAudio(): void {
  for (const [slotStr, src] of Object.entries(SLOT_AUDIO)) {
    const slot = Number(slotStr)
    if (pool[slot]) continue  // already primed
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