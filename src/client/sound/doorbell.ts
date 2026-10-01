import type { AudioCore } from './core';

// ---- The doorbell (flrnoh fork, see client/doorbell.ts) ----------------------------------------------

/** Ding-dong: two soft bell tones a major third apart, each with a little shimmer on top. On the effects volume. */
export function doorbell(a: AudioCore) {
  const ctx = a.ctx;
  if (!ctx) return;
  a.count('doorbell');
  const out = a.alerts;
  const t0 = ctx.currentTime + 0.01;
  for (const [f, dt] of [
    [659.25, 0],
    [523.25, 0.55],
  ] as const) {
    a.blip(out, t0 + dt, f, 1, 1.4, 0.22);
    a.blip(out, t0 + dt, f * 2.01, 1, 0.7, 0.05);
    a.blip(out, t0 + dt, f * 3.02, 1, 0.35, 0.02);
  }
}
