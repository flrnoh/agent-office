// The SCHALLWERK's house mix (flrnoh fork, see FORK.md "The show"): what the DJ booth plays by
// itself when nobody puts a set on, generated (no one's records), on the office's clock so every page
// in the house hears the same bar. Here is its shape: the tempo by style, where each bar is in its
// 64-bar cycle (an intro, a build, the drop, a breakdown), the drops the DJ calls, and the frame
// the lights and the crowd move to (the same shape as the roof DJ's, client/dnb.ts DjFrame). The
// sound itself is the page's (client/features/venueshow/music.ts).

import { HOUSE_STYLES, type HouseStyle } from './venueshow.js';

export type MixPart = 'intro' | 'build' | 'drop' | 'breakdown';

/** The mix's clock starts here (office time), so its numbers stay small. */
export const MIX_EPOCH = Date.UTC(2026, 0, 1);
/** A cycle's bars: the intro, the build, the drop, the breakdown. */
export const CYCLE: readonly [MixPart, number][] = [
  ['intro', 16],
  ['build', 8],
  ['drop', 32],
  ['breakdown', 8],
];
export const CYCLE_BARS = CYCLE.reduce((s, [, n]) => s + n, 0);
/** A drop the DJ calls: so many bars of build from the next bar, then so many of drop. */
export const CALLED_BUILD = 4;
export const CALLED_DROP = 16;

export interface MixPos {
  bpm: number;
  /** Seconds since the mix's epoch, and a beat's length. */
  at: number;
  beatLen: number;
  /** The bar (since the epoch) and the 16th within it (0..15), the 16th since the epoch. */
  bar: number;
  step: number;
  sixteenth: number;
  part: MixPart;
  /** The bar within its part, and how many bars the part has. */
  partBar: number;
  partBars: number;
  /** 0 → 1 through a build. */
  rise: number;
  /** Seconds since the drop landed (Infinity outside a drop). */
  sinceDrop: number;
  /** Which track of the mix (a new key every cycle). */
  track: number;
  /** Whether the DJ called this drop. */
  called: boolean;
}

/** Where the mix is at `officeMs`, playing `style`, with the DJ's last drop called at `dropAt` (0: none). */
export function mixAt(style: HouseStyle, dropAt: number, officeMs: number): MixPos {
  const bpm = HOUSE_STYLES[style].bpm;
  const beatLen = 60 / bpm;
  const barLen = beatLen * 4;
  const at = (officeMs - MIX_EPOCH) / 1000;
  const bars = at / barLen;
  const bar = Math.floor(bars);
  const sixteenth = Math.floor(at / (beatLen / 4));
  const step = ((sixteenth % 16) + 16) % 16;
  const frac = bars - bar;
  // A drop the DJ called: the build from the bar after the button, then the drop.
  if (dropAt > 0) {
    const from = Math.floor((dropAt - MIX_EPOCH) / 1000 / barLen) + 1;
    const into = bar - from;
    if (into >= 0 && into < CALLED_BUILD) return { bpm, at, beatLen, bar, step, sixteenth, part: 'build', partBar: into, partBars: CALLED_BUILD, rise: (into + frac) / CALLED_BUILD, sinceDrop: Infinity, track: trackOf(bar), called: true };
    if (into >= CALLED_BUILD && into < CALLED_BUILD + CALLED_DROP) {
      const sinceDrop = at - (from + CALLED_BUILD) * barLen;
      return { bpm, at, beatLen, bar, step, sixteenth, part: 'drop', partBar: into - CALLED_BUILD, partBars: CALLED_DROP, rise: 0, sinceDrop, track: trackOf(bar), called: true };
    }
  }
  let inCycle = ((bar % CYCLE_BARS) + CYCLE_BARS) % CYCLE_BARS;
  for (const [part, n] of CYCLE) {
    if (inCycle < n) {
      const sinceDrop = part === 'drop' ? (inCycle + frac) * barLen : Infinity;
      return { bpm, at, beatLen, bar, step, sixteenth, part, partBar: inCycle, partBars: n, rise: part === 'build' ? (inCycle + frac) / n : 0, sinceDrop, track: trackOf(bar), called: false };
    }
    inCycle -= n;
  }
  return { bpm, at, beatLen, bar, step, sixteenth, part: 'intro', partBar: 0, partBars: 16, rise: 0, sinceDrop: Infinity, track: trackOf(bar), called: false };
}

const trackOf = (bar: number) => Math.floor(bar / CYCLE_BARS);

/** The same 0..1 for the same two integers everywhere. */
export function mixHash(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

/** What a 16th of the mix has in it: how hard each drum hits (0: not), and whether the bass and the chords play. */
export interface MixStep {
  kick: number;
  clap: number;
  hat: number;
  openHat: number;
  bass: boolean;
  stab: boolean;
  pad: boolean;
  /** The build's snare roll. */
  roll: number;
  /** A crash on the drop's first beat. */
  crash: boolean;
}

/** The 16th `p` is in, for `style`. */
export function mixStep(style: HouseStyle, p: MixPos): MixStep {
  const s = p.step;
  const beat = s % 4 === 0;
  const off = s % 4 === 2;
  const out: MixStep = { kick: 0, clap: 0, hat: 0, openHat: 0, bass: false, stab: false, pad: false, roll: 0, crash: false };
  if (p.part === 'breakdown') {
    out.pad = s === 0;
    out.hat = p.partBar >= 4 && off ? 0.4 : 0;
    return out;
  }
  out.kick = beat ? 1 : 0;
  out.openHat = off ? (p.part === 'intro' && p.partBar < 4 ? 0 : 0.8) : 0;
  out.hat = style === 'techno' ? (s % 2 === 1 ? 0.55 : 0.3) : s % 2 === 1 ? 0.45 : 0;
  out.clap = (s === 4 || s === 12) && !(p.part === 'intro' && p.partBar < 8) ? 1 : 0;
  if (p.part === 'build') {
    // The roll: quarters, then eighths, then sixteenths into the drop; the bass drops out at the end.
    const k = p.rise;
    const every = k < 0.5 ? 4 : k < 0.75 ? 2 : 1;
    out.roll = s % every === 0 ? 0.35 + 0.6 * k : 0;
    out.bass = k < 0.75 && bassAt(style, s);
    out.stab = false;
    if (k > 0.9) out.kick = 0;
    return out;
  }
  out.bass = p.part === 'drop' || p.partBar >= 8 ? bassAt(style, s) : false;
  out.stab = p.part === 'drop' && stabAt(style, s, p.bar);
  out.pad = p.part === 'drop' && s === 0 && p.partBar % 4 === 0;
  out.crash = p.part === 'drop' && p.partBar === 0 && s === 0;
  return out;
}

function bassAt(style: HouseStyle, s: number): boolean {
  if (style === 'techno') return s % 4 !== 0; // rolling, round the kick
  if (style === 'disco') return s % 2 === 0; // octaves on the eighths
  return s % 4 === 2 || s === 7 || s === 15; // the offbeat, with a push
}

function stabAt(style: HouseStyle, s: number, bar: number): boolean {
  if (style === 'techno') return s === 3 || s === 10;
  if (style === 'disco') return s === 2 || s === 6 || s === 10 || s === 14;
  return bar % 2 === 0 ? s === 3 || s === 6 || s === 10 : s === 2 || s === 14;
}

/** The chord (a degree of the minor scale) of bar `bar`: one every two bars, the track's own run of four. */
export function chordOf(bar: number): number {
  const runs = [
    [0, 5, 3, 4],
    [0, 3, 6, 5],
    [5, 3, 0, 6],
    [0, 6, 5, 4],
  ];
  const t = trackOf(bar);
  const run = runs[Math.floor(mixHash(t, 7) * runs.length)];
  return run[Math.floor((((bar % CYCLE_BARS) + CYCLE_BARS) % CYCLE_BARS) / 2) % 4];
}
/** The key of a track: a MIDI root note. */
export const rootOf = (bar: number) => 33 + Math.floor(mixHash(trackOf(bar), 3) * 7);

/** What the lights and the crowd go by (client/dnb.ts DjFrame, plus the tempo). */
export interface MixFrame {
  beats: number;
  beat: number;
  kick: number;
  snare: number;
  energy: number;
  part: MixPart;
  rise: number;
  sinceDrop: number;
  track: number;
  hue: number;
  bpm: number;
}

/** The frame at `officeMs`. */
export function mixFrame(style: HouseStyle, dropAt: number, officeMs: number): MixFrame {
  const p = mixAt(style, dropAt, officeMs);
  const beats = p.at / p.beatLen;
  const frac = beats - Math.floor(beats);
  const since = frac * p.beatLen;
  const st = mixStep(style, { ...p, step: Math.floor(p.step / 4) * 4 });
  const kick = st.kick ? Math.exp(-since * 9) : 0;
  const odd = Math.floor(beats) % 2 === 1;
  const snare = st.clap || (p.part === 'drop' && odd) ? Math.exp(-since * 11) * (odd ? 1 : 0) : 0;
  const through = (p.partBar + (beats / 4 - Math.floor(beats / 4))) / p.partBars;
  const energy = p.part === 'drop' ? 1 : p.part === 'build' ? 0.45 + 0.5 * p.rise : p.part === 'intro' ? 0.35 + 0.25 * through : 0.2;
  return { beats, beat: (1 - frac) ** 3, kick, snare, energy, part: p.part, rise: p.rise, sinceDrop: p.sinceDrop, track: p.track, hue: mixHash(p.track, 11), bpm: p.bpm };
}
