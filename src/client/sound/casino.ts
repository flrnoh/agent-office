import type { AudioCore } from './core';

// ---- The casino (flrnoh fork, see client/casino.ts) --------------------------------------------------

export type CasinoSound = 'spin' | 'reel' | 'win' | 'jackpot' | 'lose' | 'chip';

/** The slot machines and the tables: reels whirring, each one clunking to a stop, a win's jingle, chips. */
export function casino(a: AudioCore, kind: CasinoSound) {
  a.unlock();
  const ctx = a.ctx;
  if (!ctx) return;
  a.count(`casino.${kind}`);
  const out = a.alerts;
  const t0 = ctx.currentTime + 0.01;
  if (kind === 'spin') for (let i = 0; i < 10; i++) a.blip(out, t0 + i * 0.05, 700 + (i % 3) * 90, 0.8, 0.035, 0.05, 'square');
  else if (kind === 'reel') a.blip(out, t0, 190, 0.6, 0.09, 0.18, 'triangle');
  else if (kind === 'chip') [2400, 3100].forEach((f, i) => a.blip(out, t0 + i * 0.05, f, 0.9, 0.05, 0.06));
  else if (kind === 'lose') [330, 262].forEach((f, i) => a.blip(out, t0 + i * 0.14, f, 0.97, 0.14, 0.08, 'triangle'));
  else {
    const notes = kind === 'jackpot' ? [523, 659, 784, 1047, 784, 1047, 1319, 1568] : [659, 784, 1047];
    notes.forEach((f, i) => a.blip(out, t0 + i * 0.09, f, 1.01, 0.16, 0.12, 'square'));
  }
}
