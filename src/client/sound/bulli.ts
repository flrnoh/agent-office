import type { AudioCore } from './core';
import { biquad } from './dsp';
import type { Pos } from './places';

// ---- flrnoh fork: Flogge's Bulli (see FORK.md) ------------------------------------------------------

/**
 * The Bulli's horn: an old electric one, a single buzzy, slightly sour note (a reed rattling on a
 * coil, not a chord), twice, "möp möp", with a wobble in it as the contact chatters.
 */
export function bulliHorn(a: AudioCore, at: Pos) {
  const ctx = a.ctx;
  if (!ctx) return;
  a.count('honk');
  const out = a.panner(at, 4, 0.9);
  out.connect(a.ambience);
  const t0 = ctx.currentTime + 0.005;
  const tone = biquad(ctx, 'bandpass', 900, 1.4);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t0);
  for (const [start, len] of [
    [0, 0.17],
    [0.24, 0.3],
  ]) {
    g.gain.setValueAtTime(0, t0 + start);
    g.gain.linearRampToValueAtTime(0.16, t0 + start + 0.015);
    g.gain.setValueAtTime(0.14, t0 + start + len - 0.03);
    g.gain.linearRampToValueAtTime(0, t0 + start + len);
  }
  tone.connect(g).connect(out);
  const wobble = ctx.createOscillator();
  wobble.frequency.value = 23;
  const depth = ctx.createGain();
  depth.gain.value = 6;
  wobble.connect(depth);
  for (const [f, type] of [
    [311, 'sawtooth'],
    [318, 'square'],
  ] as const) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    depth.connect(o.frequency);
    o.connect(tone);
    o.start(t0);
    o.stop(t0 + 0.6);
  }
  wobble.start(t0);
  wobble.stop(t0 + 0.6);
}
