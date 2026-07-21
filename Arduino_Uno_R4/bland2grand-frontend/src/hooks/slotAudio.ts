// Preloaded MP3 voice lines per spice slot. Audio files are loaded from public/audio/{spice}.mp3 and played when a spice is being dispensed.

import { SPICE_SLOTS } from "../slotConfig";

// Convert spice name to filename slug (e.g., "Cumin" -> "cumin")
function toAudioSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "");
}

// Build a lookup mapping slot number to audio file path
function buildSlotAudio(): Record<number, string> {
  const result: Record<number, string> = {};
  for (const [slot, name] of Object.entries(SPICE_SLOTS)) {
    result[Number(slot)] = `/audio/${toAudioSlug(name)}.mp3`;
  }
  return result;
}

const SLOT_AUDIO = buildSlotAudio();

// Audio pool to keep loaded audio instances ready for playback
const pool: Record<number, HTMLAudioElement> = {};
let current: HTMLAudioElement | null = null; // Currently playing audio

// Preload all audio files so they're ready when needed
export function primeAudio(): void {
  for (const [slotStr, src] of Object.entries(SLOT_AUDIO)) {
    const slot = Number(slotStr);
    if (pool[slot]) continue;
    const audio = new Audio(src);
    audio.preload = "auto";
    audio.load();
    pool[slot] = audio;
  }
}

// Play voice line for a specific spice slot, and stops any currently playing audio before starting the new one
export function playSlotVoiceLine(slot: number): void {
  const audio = pool[slot];
  if (!audio) return;

  // Stop current audio if different
  if (current && current !== audio) {
    current.pause();
    current.currentTime = 0;
  }

  audio.currentTime = 0;
  audio.play().catch((err) => {
    console.warn("[SlotAudio] play failed for slot", slot, err);
  });
  current = audio;
}