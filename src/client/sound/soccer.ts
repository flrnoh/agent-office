import type { AudioCore } from './core';
import { envelope, pick, rand } from './dsp';
import { hiss } from './hiss';
import type { Pos } from './places';

// ---- flrnoh fork: the soccer hall (soccer/place.ts) --------------------------------------------------

export type SoccerSound = 'door' | 'kick' | 'board' | 'post' | 'net' | 'whistle' | 'final' | 'cheer';

/**
 * The soccer hall: a kick's thump, the ball off the boards (a bang and a rattle), a post's clang, the
 * net's swish, the referee's whistle (short, or the final whistle's three), the crowd's cheer for a
 * goal; the doors. `strength` 0..1 (how hard it was hit). On the effects' volume, quiet from far off.
 */
export function soccer(a: AudioCore, kind: SoccerSound, at: Pos, strength = 1) {
  const ctx = a.ctx;
  if (!ctx) return;
  a.count(`soccer-${kind}`);
  const s = Math.max(0.05, Math.min(1, strength));
  const t0 = ctx.currentTime + 0.005;
  if (kind === 'door') {
    hiss(a, a.alerts, t0, 700, 0.7, [
      [0.05, 0.05],
      [0.35, 0.02],
      [0.5, 0],
    ]);
    return;
  }
  const out = a.panner(at, kind === 'cheer' || kind === 'whistle' || kind === 'final' ? 8 : 2, 1.2);
  out.connect(a.ambience);
  const whistle = (when: number, len: number, gain: number) => {
    // A pea whistle: a high tone warbling fast as the pea rattles round.
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = 2750;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 34;
    const depth = ctx.createGain();
    depth.gain.value = 140;
    lfo.connect(depth).connect(o.frequency);
    const g = ctx.createGain();
    envelope(g.gain, when, [
      [0.02, gain],
      [len - 0.04, gain * 0.9],
      [len, 0],
    ]);
    o.connect(g).connect(out);
    for (const n of [o, lfo]) {
      n.start(when);
      n.stop(when + len + 0.05);
    }
  };
  switch (kind) {
    case 'kick':
      a.blip(out, t0, 120, 0.45, 0.14, 0.4 * s);
      a.play(pick(a.buf.steps), { gain: 0.5 * s, rate: 1.25, dest: out });
      break;
    case 'board':
      a.blip(out, t0, rand(80, 100), 0.7, 0.25, 0.32 * s, 'triangle');
      a.play(pick(a.buf.steps), { gain: 0.55 * s, rate: 0.7, dest: out });
      a.clink(out, t0 + 0.01, rand(650, 850), 0.03 * s);
      break;
    case 'post':
      a.clink(out, t0, rand(1150, 1350), 0.09 * s);
      a.blip(out, t0, 520, 0.98, 0.7, 0.07 * s, 'triangle');
      break;
    case 'net':
      hiss(a, out, t0, 2400, 0.8, [
        [0.03, 0.07 * s],
        [0.35, 0],
      ]);
      break;
    case 'whistle':
      whistle(t0, 0.45, 0.07);
      break;
    case 'final':
      whistle(t0, 0.35, 0.07);
      whistle(t0 + 0.5, 0.35, 0.07);
      whistle(t0 + 1.0, 1.1, 0.07);
      break;
    case 'cheer': {
      // The crowd: a swell of voices (noise, bandpassed like a room full of people), with a low roar under it.
      for (const [f, q, g] of [
        [900, 0.7, 0.09],
        [2200, 1.2, 0.04],
        [300, 0.8, 0.06],
      ] as const) {
        hiss(a, out, t0, f, q, [
          [0.25, g],
          [1.4, g * 0.85],
          [2.6, 0],
        ]);
      }
      break;
    }
  }
}
