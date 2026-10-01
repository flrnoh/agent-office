import type { AudioCore } from './core';
import { pick, rand } from './dsp';
import { hiss } from './hiss';
import { FRIDGE } from './places';

// ---- The kitchen fridge (flrnoh fork, see ui/fridge.ts) ----------------------------------------------

/** The fridge door: the seal letting go and the bottles in the door clinking, or a soft thump shut. */
export function fridgeDoor(a: AudioCore, open: boolean) {
  const ctx = a.ctx;
  if (!ctx || a.hall) return;
  a.count(open ? 'fridgeOpen' : 'fridgeClose');
  const out = a.panner(FRIDGE, 1, 1.4);
  out.connect(a.indoors);
  const t0 = ctx.currentTime + 0.02;
  if (open) {
    hiss(a, out, t0, 900, 0.8, [
      [0.02, 0.12],
      [0.18, 0.03],
      [0.3, 0],
    ]);
    a.clink(out, t0 + 0.15, rand(2600, 3200), 0.03);
    a.clink(out, t0 + 0.23, rand(2900, 3600), 0.02);
  } else {
    a.play(pick(a.buf.steps), { gain: 0.5, rate: 0.5, dest: out });
    a.blip(out, t0, 110, 0.7, 0.08, 0.1);
    a.clink(out, t0 + 0.04, rand(2600, 3200), 0.02);
  }
}

/** Opening what you grabbed: a crown cap popped off with a fizz, a can's ring pull cracked, or a bite. */
export function opener(a: AudioCore, kind: 'bottle' | 'can' | 'bite') {
  const ctx = a.ctx;
  if (!ctx) return;
  a.count(kind === 'bite' ? 'bite' : 'opener');
  const t0 = ctx.currentTime + 0.02;
  if (kind === 'bite') {
    // A few crunches.
    for (let i = 0; i < 3; i++) {
      const t = t0 + i * rand(0.08, 0.13);
      hiss(a, a.ambience, t, rand(1600, 2600), 1.4, [
        [0.005, 0.1],
        [0.05, 0],
      ]);
    }
    return;
  }
  if (kind === 'bottle') {
    hiss(a, a.ambience, t0, 2400, 1, [
      [0.004, 0.16],
      [0.04, 0],
    ]);
    a.blip(a.ambience, t0, 620, 0.55, 0.09, 0.08);
    a.clink(a.ambience, t0 + 0.12, 4200, 0.02);
  } else {
    hiss(a, a.ambience, t0, 3200, 2, [
      [0.003, 0.18],
      [0.03, 0],
    ]);
  }
  // The fizz.
  hiss(a, a.ambience, t0 + 0.03, 6500, 0.7, [
    [0.03, 0.06],
    [0.5, 0.02],
    [0.9, 0],
  ]);
}
