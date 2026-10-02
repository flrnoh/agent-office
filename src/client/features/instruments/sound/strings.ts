import { hz } from './fx';

// ---- Plucked strings (flrnoh fork, see FORK.md "The instruments") ------------------------------------
// The guitars and the basses are Karplus-Strong strings: a burst of noise (the pick) running round a
// delay line one period long, each trip through a gentle lowpass, so the highs die first and the
// note rings down as a real string does. Tuned to the cent with an allpass for the fraction of a
// sample the period doesn't fill; the pick's place on the string (near the bridge: bright and
// nasal) is a comb in the burst; a palm mute damps the loop hard. Rendered once per pitch, kind
// and touch into a small buffer at a low sample rate (the cab cuts everything over 5 kHz anyway) and
// kept, so a chord costs a few buffer sources.

export type StringKind = 'guitar' | 'bass';
export interface Pluck {
  kind: StringKind;
  pitch: number;
  /** Damped with the side of the picking hand. */
  mute: boolean;
  /** Picked hard (a brighter burst). */
  hard: boolean;
}

const RATE = 22050;
/** How long each rings at most (s), and a palm-muted one. */
const RING: Record<StringKind, number> = { guitar: 3.2, bass: 3.6 };
const MUTED = 0.32;
const CACHE_MAX = 72;

export class Strings {
  private cache = new Map<string, AudioBuffer>();

  constructor(private readonly ctx: BaseAudioContext) {}

  /** The string's buffer, rendered the first time it's asked for. */
  buffer(p: Pluck): AudioBuffer {
    const key = `${p.kind}|${p.pitch}|${p.mute ? 1 : 0}|${p.hard ? 1 : 0}`;
    let b = this.cache.get(key);
    if (b) {
      // Most recently used last, so the oldest goes first.
      this.cache.delete(key);
      this.cache.set(key, b);
      return b;
    }
    b = this.render(p);
    this.cache.set(key, b);
    if (this.cache.size > CACHE_MAX) this.cache.delete(this.cache.keys().next().value!);
    return b;
  }

  private render(p: Pluck): AudioBuffer {
    const f = hz(p.pitch);
    const secs = p.mute ? MUTED : RING[p.kind];
    const n = Math.ceil(RATE * secs);
    const buf = this.ctx.createBuffer(1, n, RATE);
    pluck(buf.getChannelData(0), RATE, f, p);
    return buf;
  }
}

/** Renders a plucked string at `f` Hz into `out` (sample rate `sr`). Exported for the tests. */
export function pluck(out: Float32Array, sr: number, f: number, p: Pick<Pluck, 'kind' | 'mute' | 'hard'>) {
  const period = sr / f;
  // The loop's averaging filter delays half a sample; the allpass takes up the fraction left.
  const len = Math.max(2, Math.floor(period - 0.5));
  const frac = period - 0.5 - len;
  const c = (1 - frac) / (1 + frac);
  const line = new Float32Array(len);
  // The pick: a noise burst, brighter picked hard, a bass's rounder (thumb or fingers).
  const bright = p.kind === 'bass' ? (p.hard ? 0.55 : 0.35) : p.hard ? 0.92 : 0.7;
  let lp = 0;
  for (let i = 0; i < len; i++) {
    lp = lp * (1 - bright) + (Math.random() * 2 - 1) * bright;
    line[i] = lp;
  }
  // Picked near the bridge (an eighth of the way along for a guitar, a fifth for the bass's fingers).
  const at = Math.max(1, Math.round(len * (p.kind === 'bass' ? 0.2 : 0.12)));
  const burst = Float32Array.from(line);
  for (let i = 0; i < len; i++) line[i] = burst[i] - 0.9 * burst[(i + at) % len];
  // Take out any DC, and scale the burst to ±1.
  let mean = 0;
  for (const v of line) mean += v;
  mean /= len;
  let peak = 0;
  for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs((line[i] -= mean)));
  for (let i = 0; i < len; i++) line[i] /= peak || 1;
  // Loss per trip round the loop, for the string to fall 60 dB in its time (low strings ring longer).
  const t60 = p.mute ? 0.12 : p.kind === 'bass' ? 3.4 : Math.max(1.2, 4.2 - (f - 82) / 260);
  const loss = Math.pow(10, -3 / (f * t60));
  // A palm mute damps the highs too: an extra lowpass in the loop.
  const muteA = p.mute ? (p.kind === 'bass' ? 0.55 : 0.45) : 0;
  let prev = 0;
  let apX = 0;
  let apY = 0;
  let m = 0;
  let idx = 0;
  for (let i = 0; i < out.length; i++) {
    const cur = line[idx];
    out[i] = cur;
    let v = 0.5 * (cur + prev) * loss;
    prev = cur;
    if (muteA) v = m = m * muteA + v * (1 - muteA);
    // Fractional delay (first-order allpass).
    const y = c * v + apX - c * apY;
    apX = v;
    apY = y;
    line[idx] = y;
    idx = idx + 1 === len ? 0 : idx + 1;
  }
  // The very start: the pick leaving the string, a few milliseconds in.
  const fade = Math.min(out.length, Math.floor(sr * 0.0015));
  for (let i = 0; i < fade; i++) out[i] *= i / fade;
  // The end: faded out, so a buffer that runs out never clicks.
  const tail = Math.min(out.length, Math.floor(sr * 0.05));
  for (let i = 0; i < tail; i++) out[out.length - 1 - i] *= i / tail;
}
