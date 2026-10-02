import type { AudioCore } from './core';
import { biquad, rand } from './dsp';
import type { Pos } from './places';

// ---- The church's bells and the sirens far off (flrnoh fork, see FORK.md "Sounds of the city") -----
// When they strike and go by is shared/citysound.ts, on the office's clock; this is how they sound.
// Both go out on the city's bus (sound/city.ts), so the setting silences them and glass muffles them.

/** A church bell's partials (hum, prime, tierce, quint, nominal), as ratios of the prime, with how loud and how long each rings. */
const PARTIALS: [number, number, number][] = [
  [0.5, 0.6, 5.5],
  [1, 1, 3.5],
  [1.19, 0.5, 2.6],
  [1.5, 0.3, 2],
  [2, 0.45, 1.6],
  [2.66, 0.18, 1],
];
/** The bell's prime, in Hz: a mid-sized bell, an F♯. */
const BELL_F = 370;
/** Between strikes, in seconds. */
const STRIKE_GAP = 2.4;

/** The bell in the church tower at `at` strikes `strikes` times, for the hour. */
export function bells(a: AudioCore, bus: AudioNode, at: Pos, strikes: number) {
  const ctx = a.ctx;
  if (!ctx || strikes < 1) return;
  a.count('churchBell');
  // Heard right across the town: a long reference distance and a gentle fall off.
  const pan = a.panner(at, 30, 0.8);
  // The far-off high end goes first.
  pan.connect(biquad(ctx, 'lowpass', 3500, 0.5)).connect(bus);
  const t0 = ctx.currentTime + 0.1;
  for (let k = 0; k < strikes; k++) {
    const t = t0 + k * STRIKE_GAP;
    a.count('churchStrike');
    // The clapper's knock, then the ring.
    for (const [ratio, level, decay] of PARTIALS) {
      const o = ctx.createOscillator();
      o.frequency.value = BELL_F * ratio * rand(0.998, 1.002);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.11 * level, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
      o.connect(g).connect(pan);
      o.start(t);
      o.stop(t + decay + 0.05);
    }
  }
}

/** A siren going by far off: where it is when it starts, which way it's going, and how fast. */
export interface SirenPass {
  from: Pos;
  vx: number;
  vz: number;
}

/** How long a siren's heard, rising and fading, in seconds. */
export const SIREN_LONG = 18;

/**
 * A siren far off, the two notes of a German Martinshorn: it swells as it comes nearer, its notes
 * dropping a little as it passes, and fades away again.
 */
export function siren(a: AudioCore, bus: AudioNode, pass: SirenPass) {
  const ctx = a.ctx;
  if (!ctx) return;
  a.count('citySiren');
  const t0 = ctx.currentTime + 0.05;
  const end = t0 + SIREN_LONG;
  const pan = a.panner(pass.from, 60, 1);
  if (pan.positionX) {
    pan.positionX.setValueAtTime(pass.from.x, t0);
    pan.positionZ.setValueAtTime(pass.from.z, t0);
    pan.positionX.linearRampToValueAtTime(pass.from.x + pass.vx * SIREN_LONG, end);
    pan.positionZ.linearRampToValueAtTime(pass.from.z + pass.vz * SIREN_LONG, end);
  }
  // Muffled by the buildings in between.
  pan.connect(biquad(ctx, 'lowpass', 1800, 0.6)).connect(bus);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.05, t0 + SIREN_LONG * 0.45);
  g.gain.setValueAtTime(0.05, t0 + SIREN_LONG * 0.55);
  g.gain.exponentialRampToValueAtTime(0.0001, end);
  g.connect(pan);
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  // Tatü-tata: A and D, back and forth, each note a little lower once it's passed.
  for (let t = 0, k = 0; t < SIREN_LONG; t += 0.62, k++) {
    const drop = t < SIREN_LONG / 2 ? 1.02 : 0.98;
    o.frequency.setValueAtTime((k % 2 ? 587 : 440) * drop, t0 + t);
  }
  o.connect(biquad(ctx, 'bandpass', 900, 0.9)).connect(g);
  o.start(t0);
  o.stop(end + 0.05);
}
