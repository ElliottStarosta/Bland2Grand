// Map each carousel slot number to its voice line MP3.
// Files should live in: bland2grand-frontend/public/audio/
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

let currentAudio: HTMLAudioElement | null = null

export function playSlotVoiceLine(slot: number): void {
  const src = SLOT_AUDIO[slot]
  if (!src) return

  // Stop any currently playing voice line
  if (currentAudio) {
    currentAudio.pause()
    currentAudio.currentTime = 0
    currentAudio = null
  }

  const audio = new Audio(src)
  currentAudio = audio

  audio.play().catch((err) => {
    // Browsers block autoplay before user gesture -- after the first tap this should always succeed. Log quietly if it doesn't.
    console.warn('[SlotAudio] Could not play voice line for slot', slot, err)
  })
}