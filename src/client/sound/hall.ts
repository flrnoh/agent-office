import type { AudioCore } from './core';
import { biquad, envelope } from './dsp';
import { hiss } from './hiss';
import type { Pos } from './places';

// ---- The padel hall (flrnoh fork, see client/hall.ts) ------------------------------------------------

/** The espresso machine on the padel hall café's counter (hall coordinates, see shared/hall-building.ts). */
const CAFE_MACHINE: Pos = { x: -7.8, y: 4.9, z: -15.9 };

export type PadelHallSound = 'door' | 'espresso' | 'pour' | 'plate';

/**
 * The padel hall's: its glass doors sliding (a soft whoosh and a chime), and up at the café the
 * espresso machine (the grinder, then the steam wand's hiss), a pour, or a plate set down.
 */
export function padelHall(a: AudioCore, kind: PadelHallSound) {
  a.unlock();
  const ctx = a.ctx;
  if (!ctx) return;
  a.count(`hall.${kind}`);
  const t0 = ctx.currentTime + 0.02;
  if (kind === 'door') {
    const out = a.alerts;
    hiss(a, out, t0, 700, 0.7, [
      [0.05, 0.05],
      [0.35, 0.02],
      [0.5, 0],
    ]);
    [880, 1175].forEach((f, i) => a.blip(out, t0 + 0.08 + i * 0.12, f, 1, 0.3, 0.05));
    return;
  }
  const out = a.panner(CAFE_MACHINE, 1.4, 1);
  out.connect(a.ambience);
  if (kind === 'espresso') {
    // The grinder's buzz, then the shot, then the steam wand hissing into the milk.
    const motor = ctx.createOscillator();
    motor.type = 'sawtooth';
    motor.frequency.setValueAtTime(90, t0);
    motor.frequency.linearRampToValueAtTime(125, t0 + 0.2);
    const g = ctx.createGain();
    envelope(g.gain, t0, [
      [0.05, 0.05],
      [0.7, 0.05],
      [0.8, 0],
    ]);
    motor.connect(biquad(ctx, 'lowpass', 1000, 0.8)).connect(g).connect(out);
    motor.start(t0);
    motor.stop(t0 + 0.85);
    hiss(a, out, t0 + 0.9, 380, 0.9, [
      [0.1, 0.08],
      [1.1, 0.07],
      [1.3, 0],
    ]);
    hiss(a, out, t0 + 2.3, 5200, 0.6, [
      [0.05, 0.16],
      [1.2, 0.12],
      [1.6, 0.03],
      [1.8, 0],
    ]);
    return;
  }
  if (kind === 'pour') {
    hiss(a, out, t0, 1600, 1.4, [
      [0.05, 0.08],
      [0.9, 0.06],
      [1.1, 0],
    ]);
    return;
  }
  // A plate on the counter: a china clink.
  [2100, 3300].forEach((f, i) => a.blip(out, t0 + i * 0.03, f, 0.98, 0.18, 0.07, 'triangle'));
}
