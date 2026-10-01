import type { AudioCore } from './core';
import { biquad, envelope } from './dsp';

// flrnoh fork (see FORK.md): a helper the fork's recipes share (casino.ts, gym.ts, soccer.ts and the rest).

/** A burst of filtered noise shaped by `points` (as envelope). */
export function hiss(a: AudioCore, out: AudioNode, t0: number, freq: number, q: number, points: [number, number][]) {
  const ctx = a.ctx!;
  const n = a.noise(a.buf.white);
  const g = ctx.createGain();
  envelope(g.gain, t0, points);
  n.connect(biquad(ctx, 'bandpass', freq, q)).connect(g).connect(out);
  n.start(t0);
  n.stop(t0 + points[points.length - 1][0] + 0.05);
}
