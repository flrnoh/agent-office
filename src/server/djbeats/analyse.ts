import { BEAT_PARTS, toBase64, type BeatPart, type DjBeats } from '../../shared/djbeats.js';

/*
 * Hearing a DJ set (flrnoh fork, see FORK.md): from its audio, mono at RATE, where the beats are,
 * how hard each one hits, and where the breakdowns, builds and drops are (shared/djbeats.ts).
 *
 * The audio goes through three bands (the kick's, the claps' and hats', and all of it) in short hops.
 * Where the bass and the highs jump is where something hit (the onsets); the tempo is how far apart
 * those come most often, window by window; the beats are an Ellis-style dynamic-programming path
 * through the onsets at that tempo. Per bar, no kick and little bass is a breakdown, its last bars
 * before the kick's back are the build, and the kick's coming back is a drop.
 */

/** The audio's sample rate, mono. */
export const RATE = 11025;
/** Samples per hop: about 11.6 ms. */
const HOP = 128;
const FPS = RATE / HOP;
/** The tempos it looks for; a set slower or quicker is heard at double or half. */
const MIN_BPM = 66;
const MAX_BPM = 196;
/** The tempo it leans to when two read about as well (a set at 87 or 174, say). */
const LIKELY_BPM = 125;
/** How hard the beat path holds to the tempo (Ellis' tightness). */
const TIGHT = 120;

/** An RBJ biquad filter. */
class Biquad {
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;
  private constructor(
    private b0: number,
    private b1: number,
    private b2: number,
    private a1: number,
    private a2: number,
  ) {}

  static make(kind: 'low' | 'high', freq: number, q = Math.SQRT1_2): Biquad {
    const w = (2 * Math.PI * freq) / RATE;
    const cos = Math.cos(w);
    const alpha = Math.sin(w) / (2 * q);
    const a0 = 1 + alpha;
    const b1 = kind === 'low' ? 1 - cos : -(1 + cos);
    const b0 = kind === 'low' ? (1 - cos) / 2 : (1 + cos) / 2;
    return new Biquad(b0 / a0, b1 / a0, b0 / a0, (-2 * cos) / a0, (1 - alpha) / a0);
  }

  run(x: number): number {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

/** A Float32Array that grows. */
class Grow {
  arr = new Float32Array(1 << 16);
  len = 0;
  push(v: number) {
    if (this.len === this.arr.length) {
      const next = new Float32Array(this.arr.length * 2);
      next.set(this.arr);
      this.arr = next;
    }
    this.arr[this.len++] = v;
  }
  done(): Float32Array {
    return this.arr.subarray(0, this.len);
  }
}

/** Each hop's energy in the three bands. */
export interface Features {
  low: Float32Array;
  high: Float32Array;
  full: Float32Array;
}

/** Takes the audio as it comes (16-bit mono at RATE), a chunk at a time, so a three-hour set never sits in memory whole. */
export class FeatureStream {
  private lp1 = Biquad.make('low', 140);
  private lp2 = Biquad.make('low', 140);
  private hp1 = Biquad.make('high', 2500);
  private hp2 = Biquad.make('high', 2500);
  private low = new Grow();
  private high = new Grow();
  private full = new Grow();
  private l = 0;
  private h = 0;
  private f = 0;
  private n = 0;
  /** A byte left over from the last chunk (they needn't split on a sample). */
  private odd: number | null = null;

  /** Raw little-endian 16-bit samples. */
  pushBytes(buf: Uint8Array) {
    let i = 0;
    if (this.odd !== null && buf.length) {
      this.sample(((buf[0] << 8) | this.odd) << 16 >> 16);
      this.odd = null;
      i = 1;
    }
    for (; i + 1 < buf.length; i += 2) this.sample(((buf[i + 1] << 8) | buf[i]) << 16 >> 16);
    if (i < buf.length) this.odd = buf[i];
  }

  pushSamples(s: Int16Array | Float32Array) {
    const scale = s instanceof Int16Array ? 1 : 32768;
    for (let i = 0; i < s.length; i++) this.sample(s[i] * scale);
  }

  private sample(v: number) {
    const x = v / 32768;
    const lo = this.lp2.run(this.lp1.run(x));
    const hi = this.hp2.run(this.hp1.run(x));
    this.l += lo * lo;
    this.h += hi * hi;
    this.f += x * x;
    if (++this.n === HOP) {
      this.low.push(this.l / HOP);
      this.high.push(this.h / HOP);
      this.full.push(this.f / HOP);
      this.l = this.h = this.f = this.n = 0;
    }
  }

  /** Seconds heard so far. */
  seconds(): number {
    return (this.low.len * HOP) / RATE;
  }

  finish(): Features {
    return { low: this.low.done(), high: this.high.done(), full: this.full.done() };
  }
}

// ---- Helpers ---------------------------------------------------------------------------------------

function percentile(a: ArrayLike<number>, p: number): number {
  if (!a.length) return 0;
  const s = Float32Array.from(a).sort();
  return s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))];
}

function median(a: number[]): number {
  return percentile(a, 0.5);
}

/** Log energy, with a floor so near-silence doesn't read as huge jumps. */
function logOf(e: Float32Array): Float32Array {
  const floor = Math.max(1e-10, percentile(e, 0.3) * 0.05);
  return e.map((v) => Math.log10(v + floor));
}

/** Positive jumps, less the local average (about a second), over their spread. */
function onsets(log: Float32Array): Float32Array {
  const n = log.length;
  const d = new Float32Array(n);
  for (let t = 1; t < n; t++) d[t] = Math.max(0, log[t] - log[t - 1]);
  const win = Math.round(FPS);
  const out = new Float32Array(n);
  let sum = 0;
  for (let t = 0; t < n; t++) {
    sum += d[t];
    if (t >= win) sum -= d[t - win];
    const mean = sum / Math.min(t + 1, win);
    out[t] = Math.max(0, d[t] - mean);
  }
  let sq = 0;
  for (let t = 0; t < n; t++) sq += out[t] * out[t];
  const sd = Math.sqrt(sq / Math.max(1, n)) || 1;
  for (let t = 0; t < n; t++) out[t] /= sd;
  return out;
}

const norm = (v: number, lo: number, hi: number) => Math.min(1, Math.max(0, (v - lo) / (hi - lo || 1)));

// ---- Tempo -----------------------------------------------------------------------------------------

/** The beat period (in hops) at each hop, window by window, smoothed over the set. */
function periods(o: Float32Array): { period: Float32Array; bpm: number } {
  const n = o.length;
  const W = 1024;
  const STEP = 512;
  const minLag = Math.floor((60 * FPS) / MAX_BPM);
  const maxLag = Math.ceil((60 * FPS) / MIN_BPM);
  const centers: number[] = [];
  const lags: number[] = [];
  const confs: number[] = [];
  const r = new Float64Array(maxLag * 2 + 2);
  for (let start = 0; start + W <= n || (start === 0 && n > maxLag * 3); start += STEP) {
    const end = Math.min(n, start + W);
    let mean = 0;
    for (let t = start; t < end; t++) mean += o[t];
    mean /= end - start;
    for (let lag = 0; lag < r.length; lag++) {
      let s = 0;
      for (let t = start; t + lag < end; t++) s += (o[t] - mean) * (o[t + lag] - mean);
      r[lag] = s / (end - start - lag);
    }
    let best = -Infinity;
    let bestLag = 0;
    for (let lag = minLag; lag <= maxLag; lag++) {
      const bpm = (60 * FPS) / lag;
      const prior = Math.exp(-0.5 * (Math.log2(bpm / LIKELY_BPM) / 0.7) ** 2);
      const s = (r[lag] + 0.5 * r[lag * 2]) * prior;
      if (s > best) {
        best = s;
        bestLag = lag;
      }
    }
    // Between the hops: where the peak would be.
    const [a, b, c] = [r[bestLag - 1], r[bestLag], r[bestLag + 1]];
    const shift = a - 2 * b + c < 0 ? (0.5 * (a - c)) / (a - 2 * b + c) : 0;
    centers.push((start + end) / 2);
    lags.push(bestLag + Math.max(-0.5, Math.min(0.5, shift)));
    confs.push(r[0] > 0 ? b / r[0] : 0);
    if (end === n) break;
  }
  if (!lags.length) return { period: new Float32Array(n).fill((60 * FPS) / LIKELY_BPM), bpm: LIKELY_BPM };
  // The windows it heard clearly; a breakdown's goes by its neighbours'.
  const okConf = percentile(confs, 0.3);
  const overall = median(lags.filter((_, i) => confs[i] >= okConf));
  // A window at about double or half the set's tempo is the same tempo, heard wrong.
  const fixed = lags.map((l) => {
    for (const k of [2, 0.5, 1.5, 2 / 3]) if (Math.abs(l * k - overall) / overall < 0.06) return l * k;
    return l;
  });
  const smooth = fixed.map((_, i) => {
    const near: number[] = [];
    for (let j = Math.max(0, i - 6); j <= Math.min(fixed.length - 1, i + 6); j++) if (confs[j] >= okConf) near.push(fixed[j]);
    return near.length ? median(near) : overall;
  });
  const period = new Float32Array(n);
  let w = 0;
  for (let t = 0; t < n; t++) {
    while (w + 1 < centers.length && centers[w + 1] <= t) w++;
    const next = Math.min(centers.length - 1, w + 1);
    const span = centers[next] - centers[w];
    const k = span > 0 ? Math.min(1, Math.max(0, (t - centers[w]) / span)) : 0;
    period[t] = smooth[w] + (smooth[next] - smooth[w]) * k;
  }
  return { period, bpm: (60 * FPS) / median(smooth) };
}

// ---- Beats ----------------------------------------------------------------------------------------

/** The beats, in hops: the path through the onsets that lands on the most of them, keeping to the tempo. */
function track(o: Float32Array, period: Float32Array): number[] {
  const n = o.length;
  if (!n) return [];
  const score = new Float32Array(n);
  const back = new Int32Array(n).fill(-1);
  for (let t = 0; t < n; t++) {
    const p = period[t];
    const lo = Math.max(0, t - Math.round(2 * p));
    const hi = t - Math.round(p / 2);
    let best = -Infinity;
    let arg = -1;
    for (let prev = lo; prev <= hi; prev++) {
      const x = Math.log((t - prev) / p);
      const c = score[prev] - TIGHT * x * x;
      if (c > best) {
        best = c;
        arg = prev;
      }
    }
    score[t] = o[t] + (arg >= 0 ? Math.max(0, best) : 0);
    back[t] = arg >= 0 && best > 0 ? arg : -1;
  }
  // Ends on the best-scoring hop within the last beat.
  let end = n - 1;
  for (let t = Math.max(0, n - Math.round(period[n - 1])); t < n; t++) if (score[t] > score[end]) end = t;
  const out: number[] = [];
  for (let t = end; t >= 0; t = back[t]) out.push(t);
  out.reverse();
  // Before the path starts (a quiet intro), and after it ends: on at the tempo.
  while (out.length && out[0] - period[out[0]] >= 0) out.unshift(Math.round(out[0] - period[out[0]]));
  return out;
}

// ---- The set's shape ------------------------------------------------------------------------------

const PART = (p: BeatPart) => BEAT_PARTS.indexOf(p);

/** Parts per bar, from how much kick, bass and loudness there is in each. */
function sections(kick: Float32Array, bass: Float32Array, energy: Float32Array, downbeat: number): [number, number][] {
  const beats = kick.length;
  const bars = Math.max(1, Math.ceil((beats - downbeat) / 4));
  const K = new Float32Array(bars);
  const B = new Float32Array(bars);
  const E = new Float32Array(bars);
  for (let b = 0; b < bars; b++) {
    let n = 0;
    for (let i = downbeat + b * 4; i < Math.min(beats, downbeat + b * 4 + 4); i++, n++) {
      K[b] += kick[i];
      B[b] += bass[i];
      E[b] += energy[i];
    }
    if (n) {
      K[b] /= n;
      B[b] /= n;
      E[b] /= n;
    }
  }
  // A bar without the kick and with the bass gone (or nearly all quiet) is quiet; four of those in a
  // row are a breakdown (fewer are a fill, or a gap between tracks).
  const quiet = (b: number) => (K[b] < 0.3 && B[b] < 0.55) || B[b] < 0.22 || E[b] < 0.12;
  const down = new Uint8Array(bars);
  for (let b = 0; b < bars; ) {
    let end = b;
    while (end < bars && quiet(end)) end++;
    if (end - b >= 4) down.fill(1, b, end);
    b = Math.max(end, b + 1);
  }
  // The rest is the groove, or (where it's at its loudest, over eight bars or so) a drop.
  const smooth = new Float32Array(bars);
  for (let b = 0; b < bars; b++) {
    let s = 0;
    let n = 0;
    for (let k = Math.max(0, b - 4); k <= Math.min(bars - 1, b + 4); k++) if (!down[k]) (s += E[k]), n++;
    smooth[b] = n ? s / n : 0;
  }
  const loud = percentile(smooth.filter((_, b) => !down[b]), 0.55);
  const raw: BeatPart[] = [];
  for (let b = 0; b < bars; b++) raw.push(down[b] ? 'breakdown' : smooth[b] >= loud ? 'drop' : 'intro');
  // No groove or drop shorter than eight bars: it takes the part before it.
  for (let b = 1; b < bars; ) {
    let end = b;
    while (end < bars && raw[end] === raw[b]) end++;
    if (raw[b] !== 'breakdown' && raw[b - 1] !== 'breakdown' && end - b < 8) raw.fill(raw[b - 1], b, end);
    b = end;
  }
  // A breakdown's last bars (up to eight) build to the kick coming back, and that's a drop: at least sixteen bars of it.
  for (let b = 0; b < bars; ) {
    if (raw[b] !== 'breakdown') {
      b++;
      continue;
    }
    let end = b;
    while (end < bars && raw[end] === 'breakdown') end++;
    if (end < bars) {
      const build = Math.min(8, Math.floor((end - b) / 2));
      for (let k = end - build; k < end; k++) raw[k] = 'build';
      for (let k = end; k < Math.min(bars, end + 16) && raw[k] !== 'breakdown'; k++) raw[k] = 'drop';
    }
    b = end;
  }
  const out: [number, number][] = [];
  for (let b = 0; b < bars; b++) {
    const p = raw[b];
    if (!out.length || out[out.length - 1][1] !== PART(p)) out.push([b === 0 ? 0 : downbeat + b * 4, PART(p)]);
  }
  return out;
}

/**
 * Everything about a set's audio the roof needs, from its features (FeatureStream.finish). `url` is
 * the set's link, kept with it so a stale one is never taken for the set that's on now.
 */
export function analyse(f: Features, url: string): DjBeats {
  const L = logOf(f.low);
  const H = logOf(f.high);
  const F = logOf(f.full);
  const oL = onsets(L);
  const oH = onsets(H);
  const o = new Float32Array(oL.length);
  for (let t = 0; t < o.length; t++) o[t] = oL[t] + 0.5 * oH[t];
  const { period, bpm } = periods(o);
  const hops = track(o, period);
  const n = hops.length;
  const kickRaw = new Float32Array(n);
  const hiRaw = new Float32Array(n);
  const eRaw = new Float32Array(n);
  const bRaw = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = hops[i];
    for (let k = Math.max(0, t - 2); k <= Math.min(o.length - 1, t + 2); k++) {
      kickRaw[i] = Math.max(kickRaw[i], oL[k]);
      hiRaw[i] = Math.max(hiRaw[i], oH[k]);
    }
    const end = i + 1 < n ? hops[i + 1] : Math.min(F.length, t + Math.round(period[t] || 40));
    let e = 0;
    let b = 0;
    for (let k = t; k < end; k++) {
      e += F[k];
      b += L[k];
    }
    eRaw[i] = e / Math.max(1, end - t);
    bRaw[i] = b / Math.max(1, end - t);
  }
  const kTop = percentile(kickRaw, 0.9) || 1;
  const hTop = percentile(hiRaw, 0.9) || 1;
  const [eLo, eHi] = [percentile(eRaw, 0.05), percentile(eRaw, 0.97)];
  const [bLo, bHi] = [percentile(bRaw, 0.05), percentile(bRaw, 0.97)];
  const kick = kickRaw.map((v) => Math.min(1, v / kTop));
  const hi = hiRaw.map((v) => Math.min(1, v / hTop));
  const energy = eRaw.map((v) => norm(v, eLo, eHi));
  const bass = bRaw.map((v) => norm(v, bLo, bHi));

  // Which beat the bars start on: claps and snares come on the 2 and the 4, and the music changes
  // (the bass dropping out or coming back) on a bar's first beat.
  let odd = 0;
  let even = 0;
  for (let i = 0; i < n; i++) (i % 2 ? (odd += hi[i]) : (even += hi[i]));
  const first = odd >= even ? 0 : 1;
  const change = [0, 0];
  for (let i = 1; i < n; i++) {
    const d = Math.abs(bass[i] - bass[i - 1]) + Math.abs(kick[i] - kick[i - 1]);
    for (const k of [0, 1]) if ((i - (first + 2 * k)) % 4 === 0) change[k] += d;
  }
  const downbeat = first + (change[1] > change[0] ? 2 : 0);

  // A hop is about 12 ms, a fair bit of a beat: where the beats around one keep the tempo, it goes
  // between them, so the lights don't stutter.
  const at = hops.map((t) => ((t + 0.5) * HOP) / RATE);
  const ms = at.map((t, i) => {
    if (i === 0 || i + 1 === at.length) return Math.round(t * 1000);
    const a = t - at[i - 1];
    const b = at[i + 1] - t;
    return Math.round((Math.abs(a - b) / (a + b) < 0.08 ? (at[i - 1] + 2 * t + at[i + 1]) / 4 : t) * 1000);
  });
  const toBytes = (a: Float32Array) => toBase64(Uint8Array.from(a, (v) => Math.round(v * 255)));
  return {
    v: 1,
    url,
    duration: Math.round((F.length * HOP) / RATE),
    bpm: Math.round(bpm * 10) / 10,
    beats: ms.map((v, i) => (i ? v - ms[i - 1] : v)),
    downbeat,
    kick: toBytes(kick),
    hi: toBytes(hi),
    energy: toBytes(energy),
    sections: sections(kick, bass, energy, downbeat),
  };
}
