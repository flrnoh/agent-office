/*
 * flrnoh fork (see FORK.md "Hörkreise"): everyone in voice has a circle round them on the floor, as
 * big as they make it. Whoever stands in your circle hears you; outside it, nobody does. Not quieter:
 * your voice isn't even sent there, so two people with small circles can talk unter vier Augen.
 * The rules here are shared by the page (who to send to, how loud) and the office (what it keeps).
 */

/** The smallest circle: two people side by side. */
export const VOICE_RANGE_MIN = 1.5;
/** The biggest: across the whole floor and out on the street. */
export const VOICE_RANGE_MAX = 60;
/** Where everyone starts: a good part of the room. */
export const VOICE_RANGE_DEFAULT = 15;
/** One step of `,` or `.`: a quarter smaller or bigger. */
export const VOICE_RANGE_STEP = 1.25;

/** The steps the top bar's button goes through, smallest first. */
export const VOICE_RANGE_PRESETS = [2, 5, 15, 30, 60] as const;

/** Past the circle's edge the voice fades out over this many meters (no click as someone walks out). */
export const VOICE_RANGE_FADE = 1;
/** How far past the edge your voice is still sent, so walking along the edge doesn't cut in and out. */
export const VOICE_RANGE_SLACK = 1.5;

/** A circle someone asks for: a number in range, rounded to 10 cm; anything else is the default. */
export function voiceRangeOf(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return VOICE_RANGE_DEFAULT;
  return Math.round(Math.min(VOICE_RANGE_MAX, Math.max(VOICE_RANGE_MIN, v)) * 10) / 10;
}

/** A circle one step smaller (dir -1) or bigger (+1). */
export function stepVoiceRange(range: number, dir: -1 | 1): number {
  return voiceRangeOf(dir > 0 ? range * VOICE_RANGE_STEP : range / VOICE_RANGE_STEP);
}

/** The next preset up from `range`, round to the smallest after the biggest. */
export function nextVoicePreset(range: number): number {
  return VOICE_RANGE_PRESETS.find((p) => p > range + 0.05) ?? VOICE_RANGE_PRESETS[0];
}

/** How loud a speaker is `d` meters away with a circle of `range`: full nearby, a little softer to the edge, nothing past it. */
export function heardVolume(d: number, range: number | undefined): number {
  const r = voiceRangeOf(range);
  if (d >= r + VOICE_RANGE_FADE) return 0;
  // Full up to half the circle (at least 3 m), then down to 0.45 at the edge.
  const full = Math.min(r, Math.max(3, r / 2));
  const atEdge = 0.45;
  if (d <= full) return 1;
  if (d <= r) return 1 - (1 - atEdge) * ((d - full) / Math.max(0.001, r - full));
  return atEdge * (1 - (d - r) / VOICE_RANGE_FADE);
}

/** Whether your voice goes to someone `d` meters away when your circle is `range` (`sending`: it does now). */
export function sendsVoice(d: number, range: number, sending: boolean): boolean {
  return d <= voiceRangeOf(range) + (sending ? VOICE_RANGE_SLACK : VOICE_RANGE_FADE);
}

/** The circle in words, for the top bar and the toast. */
export function voiceRangeWord(range: number): string {
  const r = voiceRangeOf(range);
  const m = r < 10 ? r.toFixed(1).replace('.0', '').replace('.', ',') : String(Math.round(r));
  const what = r <= 2.5 ? 'Flüstern' : r <= 7 ? 'Gespräch' : r <= 20 ? 'Raum' : r < 45 ? 'Rufen' : 'Megafon';
  return `${what} · ${m} m`;
}

// ---- The messages ----------------------------------------------------------------------------------

export type VoiceRangeClientMsg =
  /** Your circle is this big now (meters, see voiceRangeOf). */
  { t: 'voice.range'; range: number };

export type VoiceRangeServerMsg =
  /** Someone's circle changed. */
  { t: 'voice.ranged'; id: string; range: number };
