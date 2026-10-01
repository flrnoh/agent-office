import type { AudioCore } from './core';
import { pick, rand } from './dsp';
import type { Pos } from './places';

// ---- Fork: the table games on the roof (flrnoh fork, see tablegames/) --------------------------------

export type TableGameSound = 'hit' | 'rail' | 'bounce' | 'net' | 'kick' | 'clack' | 'pocket' | 'cue' | 'goal' | 'foul' | 'win';

/**
 * A table game, heard from `at`: a paddle or a mallet on the ball (`hit`), the puck or a ball off a
 * rail (`rail`), a table tennis ball bouncing (`bounce`) or into the net (`net`), a kicker kick
 * (`kick`), pool balls clacking (`clack`), one dropping in a pocket (`pocket`), the cue striking
 * (`cue`), a goal or a point (`goal`), a foul (`foul`) and the match won (`win`).
 */
export function tableGame(a: AudioCore, kind: TableGameSound, at: Pos) {
  const ctx = a.ctx;
  if (!ctx) return;
  a.count(`table-${kind}`);
  const out = a.panner(at, 2, 1.1);
  out.connect(a.ambience);
  const t0 = ctx.currentTime + 0.005;
  switch (kind) {
    case 'hit':
      a.blip(out, t0, rand(900, 1100), 0.6, 0.05, 0.14, 'triangle');
      a.play(pick(a.buf.steps), { gain: 0.2, rate: 2.8, dest: out });
      break;
    case 'rail':
      a.blip(out, t0, rand(520, 620), 0.7, 0.05, 0.08, 'triangle');
      break;
    case 'bounce':
      a.blip(out, t0, rand(1500, 1700), 0.5, 0.035, 0.1);
      break;
    case 'net':
      a.play(pick(a.buf.steps), { gain: 0.15, rate: 2.2, dest: out });
      break;
    case 'kick':
      a.blip(out, t0, rand(300, 360), 0.6, 0.06, 0.14, 'triangle');
      a.play(pick(a.buf.steps), { gain: 0.3, rate: 2, dest: out });
      break;
    case 'clack':
      a.clink(out, t0, rand(2400, 2900), 0.07);
      a.blip(out, t0, rand(1700, 1900), 0.8, 0.02, 0.05, 'triangle');
      break;
    case 'pocket':
      a.play(pick(a.buf.steps), { gain: 0.35, rate: 1.2, dest: out });
      a.blip(out, t0 + 0.06, 220, 0.7, 0.12, 0.08, 'triangle');
      break;
    case 'cue':
      a.blip(out, t0, 700, 0.5, 0.04, 0.1, 'triangle');
      a.play(pick(a.buf.steps), { gain: 0.25, rate: 2.4, dest: out });
      break;
    case 'goal':
      [660, 880].forEach((f, i) => a.blip(out, t0 + i * 0.09, f, 1, 0.16, 0.08, 'triangle'));
      break;
    case 'foul':
      [330, 247].forEach((f, i) => a.blip(out, t0 + i * 0.14, f, 1, 0.2, 0.07, 'square'));
      break;
    case 'win':
      [523, 659, 784, 1047].forEach((f, i) => {
        const when = t0 + 0.1 + i * 0.12;
        const len = i === 3 ? 0.8 : 0.18;
        a.blip(out, when, f, 1, len, 0.1, 'triangle');
        a.blip(out, when, f * 2, 1, len * 0.7, 0.03);
      });
      break;
  }
}
