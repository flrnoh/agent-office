import { BEAT_PARTS, beatTimes, fromBase64, type BeatPart, type DjBeats } from '../../../shared/djbeats';
import type { DjFrame } from '../../dnb';
import type { WallVideo } from '../rooftop/ledwall';

/*
 * The roof's frame for a DJ set someone put on (flrnoh fork, see FORK.md): the same DjFrame the house
 * DJ gives (client/dnb.ts), so the lights, the LED wall and the DJ move to the set as they do to it,
 * from what the office heard in it (shared/djbeats.ts), or from a tempo tapped at the booth, or,
 * until either, a steady groove at a house tempo.
 */

/** The frame, with the set's tempo, title and video for the LED wall (rooftop/ledwall.ts). */
export type SetFrame = DjFrame & { bpm: number; title?: string; video?: WallVideo };

/** A tempo when nothing better's known. */
const GUESS_BPM = 124;

const decay = (since: number, rate: number) => (since >= 0 ? Math.exp(-since * rate) : 0);

/** A color for a set, the same on every screen: from its link. */
export function setHue(url: string): number {
  let h = 2166136261;
  for (let i = 0; i < url.length; i++) h = Math.imul(h ^ url.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

/**
 * A steady grid of beats at `bpm`, one landing at `phase` seconds: thirty-two bars of groove, then
 * thirty-two of drop, and so on (nothing's known of the set's shape).
 */
export function gridFrame(at: number, bpm: number, phase: number, hue: number): SetFrame {
  const len = 60 / bpm;
  const beats = Math.max(0, (at - phase) / len + 256);
  const frac = beats - Math.floor(beats);
  const since = frac * len;
  const odd = Math.floor(beats) % 2 === 1;
  const bars = Math.floor(beats / 4);
  const drop = bars % 64 >= 32;
  const part: BeatPart = drop ? 'drop' : 'intro';
  return {
    beats,
    beat: (1 - frac) ** 3,
    kick: decay(since, 9),
    snare: odd ? decay(since, 11) : 0,
    energy: drop ? 0.9 : 0.6,
    part,
    rise: 0,
    sinceDrop: drop ? ((bars % 64) - 32) * 4 * len + since + (Math.floor(beats) % 4) * len : Infinity,
    track: Math.floor(bars / 64),
    hue: (hue + Math.floor(bars / 64) * 0.23) % 1,
    bpm,
  };
}

/** What the office heard in a set, ready to give a frame at any point in it. */
export class SetBeats {
  readonly url: string;
  readonly bpm: number;
  private times: Float64Array;
  private kick: Uint8Array;
  private hi: Uint8Array;
  private energy: Uint8Array;
  private downbeat: number;
  /** Each part's first beat, its part, its first beat's time, and which track (for the colors) it's in. */
  private parts: { from: number; part: BeatPart; at: number; track: number }[];
  /** The part last looked up, to start from next time. */
  private last = 0;

  constructor(b: DjBeats) {
    this.url = b.url;
    this.bpm = b.bpm;
    this.times = beatTimes(b);
    this.kick = fromBase64(b.kick);
    this.hi = fromBase64(b.hi);
    this.energy = fromBase64(b.energy);
    this.downbeat = b.downbeat;
    let track = 0;
    this.parts = b.sections.map(([from, p], i) => {
      const part = BEAT_PARTS[p] ?? 'intro';
      // A new color with each drop (and, in frame(), every sixty-four bars of the same part).
      if (i && part === 'drop') track++;
      return { from, part, at: this.times[Math.min(from, this.times.length - 1)] ?? 0, track };
    });
    if (!this.parts.length) this.parts.push({ from: 0, part: 'intro', at: 0, track: 0 });
  }

  /** Beat index (fractional) at `at` seconds; before the first and after the last, at their tempo. */
  private index(at: number): number {
    const t = this.times;
    const n = t.length;
    if (n < 2) return (at * this.bpm) / 60;
    if (at < t[0]) return (at - t[0]) / (t[1] - t[0]);
    if (at >= t[n - 1]) return n - 1 + (at - t[n - 1]) / (t[n - 1] - t[n - 2]);
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (t[mid] <= at) lo = mid;
      else hi = mid;
    }
    return lo + (at - t[lo]) / (t[lo + 1] - t[lo]);
  }

  private partAt(i: number): number {
    const p = this.parts;
    let k = Math.min(this.last, p.length - 1);
    while (k > 0 && p[k].from > i) k--;
    while (k + 1 < p.length && p[k + 1].from <= i) k++;
    return (this.last = k);
  }

  /** Where the set is at `at` seconds into it. */
  frame(at: number, hue: number): SetFrame {
    const idx = this.index(at);
    const n = this.times.length;
    const i = Math.max(0, Math.min(n - 1, Math.floor(idx)));
    const frac = idx - Math.floor(idx);
    const len = n > 1 ? (i + 1 < n ? this.times[i + 1] - this.times[i] : this.times[i] - this.times[i - 1]) : 60 / this.bpm;
    const since = frac * len;
    const k = this.partAt(i);
    const sec = this.parts[k];
    const next = this.parts[k + 1];
    const odd = (((i - this.downbeat) % 2) + 2) % 2 === 1;
    const hit = (this.hi[i] ?? 0) / 255;
    let energy = ((this.energy[i] ?? 0) * (1 - frac) + (this.energy[Math.min(n - 1, i + 1)] ?? 0) * frac) / 255;
    if (sec.part === 'drop') energy = Math.max(energy, 0.85);
    else if (sec.part === 'breakdown') energy = Math.min(energy, 0.3);
    else if (sec.part === 'intro') energy = Math.min(0.75, Math.max(0.4, energy));
    const end = next ? next.from : n;
    const bars = Math.floor((i - sec.from) / 4);
    const track = sec.track + Math.floor(bars / 64);
    return {
      // Counted from the bars' first beat, so "every four bars" starts where the music's does.
      beats: Math.max(0, idx - this.downbeat + 256),
      beat: (1 - frac) ** 3,
      kick: ((this.kick[i] ?? 0) / 255) * decay(since, 9),
      snare: (odd ? hit : hit * 0.3) * decay(since, 11),
      energy,
      part: sec.part,
      rise: sec.part === 'build' ? Math.min(1, (idx - sec.from) / Math.max(1, end - sec.from)) : 0,
      sinceDrop: sec.part === 'drop' ? Math.max(0, at - sec.at) : Infinity,
      track,
      hue: (hue + track * 0.23) % 1,
      bpm: this.bpm,
    };
  }
}
