import type { AudioCore } from '../../sound/core';
import { hiss } from '../../sound/hiss';
import type { Pos } from '../../sound/places';

// ---- The cinema (flrnoh fork, see FORK.md "The cinema") ---------------------------------------------
// The popcorn machine popping, the bell on the counter, the gong before a film. Synthesized like
// everything else; on the effects volume.

export type KinoSound = 'pop' | 'bell' | 'gong' | 'pour';

export function kino(a: AudioCore, kind: KinoSound, at: Pos) {
  const ctx = a.ctx;
  if (!ctx) return;
  a.count(`kino-${kind}`);
  const out = a.panner(at, kind === 'gong' ? 8 : 1.5, 1.2);
  const t0 = ctx.currentTime + 0.01;
  switch (kind) {
    case 'pop':
      // A kernel going off: a tiny click with a puff behind it.
      a.blip(out, t0, 1400 + Math.random() * 900, 0.5, 0.03, 0.05, 'triangle');
      hiss(a, out, t0, 3000 + Math.random() * 1500, 1.2, [
        [0.004, 0.03],
        [0.05, 0],
      ]);
      return;
    case 'bell':
      for (const [f, g] of [
        [1975, 0.07],
        [4980, 0.02],
      ])
        a.blip(out, t0, f, 0.995, 1.0, g, 'sine');
      return;
    case 'gong':
      // Three soft notes going up: the film's about to start.
      [523.25, 659.25, 783.99].forEach((f, i) => {
        a.blip(out, t0 + i * 0.45, f, 0.998, 1.6, 0.06, 'sine');
        a.blip(out, t0 + i * 0.45, f * 2, 0.998, 0.9, 0.015, 'sine');
      });
      return;
    case 'pour':
      // Cola out of the tap, ice rattling.
      hiss(a, out, t0, 1800, 0.8, [
        [0.08, 0.06],
        [0.9, 0.05],
        [1.2, 0],
      ]);
      for (let i = 0; i < 5; i++) a.blip(out, t0 + 0.1 + i * 0.12, 2400 + i * 180, 0.7, 0.04, 0.02, 'square');
      return;
  }
}
