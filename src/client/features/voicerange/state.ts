/*
 * flrnoh fork (see FORK.md "Hörkreise"): how far your own voice carries, kept in this browser so it's
 * the same next time. The top bar's button (hud.ts) and the feature (index.ts) share it.
 */
import { VOICE_RANGE_DEFAULT, voiceRangeOf } from '../../../shared/voicerange';

const KEY = 'voice-range';

let range = VOICE_RANGE_DEFAULT;
try {
  const saved = localStorage.getItem(KEY);
  if (saved) range = voiceRangeOf(Number(saved));
} catch {
  // no storage: the default
}

const listeners = new Set<(range: number) => void>();

/** Your Hörkreis now, in meters. */
export function myVoiceRange(): number {
  return range;
}

/** A new Hörkreis: kept, and everyone listening told. */
export function setMyVoiceRange(next: number) {
  const r = voiceRangeOf(next);
  if (r === range) return;
  range = r;
  try {
    localStorage.setItem(KEY, String(r));
  } catch {
    // kept for this visit only
  }
  listeners.forEach((fn) => fn(r));
}

export function onMyVoiceRange(fn: (range: number) => void) {
  listeners.add(fn);
}

/** Who's in your circle and hears you now (names), as the feature last worked it out. */
export const hearers: { names: string[] } = { names: [] };
