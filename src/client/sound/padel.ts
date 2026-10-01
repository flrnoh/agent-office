import type { AudioCore } from './core';
import { pick, rand } from './dsp';
import type { Pos } from './places';

// ---- flrnoh fork: padel in the hall (hall/padel.ts) --------------------------------------------------

export type PadelSound = 'hit' | 'smash' | 'serve' | 'bounce' | 'glass' | 'fence' | 'net' | 'point' | 'fault' | 'game' | 'win';

/** A padel ball off a racket, the floor, the glass or the fence, the net, and the umpire's chimes: quiet from far away. */
export function padel(a: AudioCore, kind: PadelSound, at: Pos) {
  const ctx = a.ctx;
  if (!ctx) return;
  a.count(`padel-${kind}`);
  const out = a.panner(at, 2, 1.6);
  out.connect(a.ambience);
  const t0 = ctx.currentTime + 0.005;
  switch (kind) {
    case 'hit':
    case 'serve':
      // The hollow pock of a padel racket.
      a.blip(out, t0, rand(620, 760), 0.55, 0.06, kind === 'serve' ? 0.12 : 0.18, 'triangle');
      a.play(pick(a.buf.steps), { gain: 0.22, rate: 2.5, dest: out });
      break;
    case 'smash':
      a.blip(out, t0, rand(420, 500), 0.5, 0.08, 0.24, 'triangle');
      a.play(pick(a.buf.steps), { gain: 0.4, rate: 1.9, dest: out });
      break;
    case 'bounce':
      a.blip(out, t0, rand(260, 320), 0.6, 0.05, 0.1, 'triangle');
      break;
    case 'glass':
      // A knock on the glass: low thump and a short ring.
      a.blip(out, t0, rand(140, 170), 0.7, 0.12, 0.2, 'sine');
      a.clink(out, t0, rand(1900, 2300), 0.035);
      break;
    case 'fence':
      // The wire rattles.
      for (let i = 0; i < 5; i++) a.clink(out, t0 + i * 0.03 + rand(0, 0.015), rand(2600, 3600), 0.03 * (1 - i / 6));
      a.play(pick(a.buf.steps), { gain: 0.12, rate: 3, dest: out });
      break;
    case 'net':
      a.play(pick(a.buf.steps), { gain: 0.16, rate: 1.6, dest: out });
      break;
    case 'point':
      [784, 988].forEach((f, i) => a.blip(out, t0 + i * 0.1, f, 1, 0.18, 0.06, 'triangle'));
      break;
    case 'fault':
      [330, 262].forEach((f, i) => a.blip(out, t0 + i * 0.13, f, 1, 0.16, 0.05, 'square'));
      break;
    case 'game':
      [659, 784, 1047].forEach((f, i) => a.blip(out, t0 + i * 0.11, f, 1, i === 2 ? 0.4 : 0.14, 0.07, 'triangle'));
      break;
    case 'win':
      [523, 659, 784, 1047].forEach((f, i) => {
        const when = t0 + 0.1 + i * 0.12;
        const len = i === 3 ? 0.8 : 0.18;
        a.blip(out, when, f, 1, len, 0.08, 'triangle');
        a.blip(out, when, f * 2, 1, len * 0.7, 0.025);
      });
      break;
  }
}
