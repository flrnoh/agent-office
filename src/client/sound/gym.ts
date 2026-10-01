import type { AudioCore } from './core';
import { biquad, pick, rand } from './dsp';
import { hiss } from './hiss';
import type { Pos } from './places';

// ---- The gym (flrnoh fork, see client/gym.ts) --------------------------------------------------------

export type GymSound = 'rep' | 'clank' | 'run' | 'ding' | 'splash' | 'cheer' | 'sip' | 'whoosh' | 'buzzer' | 'hiss';
export type GymMachineSound = 'step' | 'whirr' | 'whoosh' | 'clank' | 'thud' | 'punch';

/** The gym: a rep's thud, plates clanking, a treadmill's patter, a set landing, water and a smoothie. */
export function gym(a: AudioCore, kind: GymSound) {
  a.unlock();
  const ctx = a.ctx;
  if (!ctx) return;
  a.count(`gym.${kind}`);
  const out = a.alerts;
  const t0 = ctx.currentTime + 0.01;
  if (kind === 'hiss') {
    // Fork: water on the sauna's stones: a sharp sizzle, then the long hiss of the steam rising.
    hiss(a, out, t0, 4200, 0.7, [
      [0.03, 0.12],
      [0.35, 0.05],
      [0.6, 0],
    ]);
    hiss(a, out, t0 + 0.05, 1800, 0.5, [
      [0.25, 0.08],
      [1.6, 0.05],
      [2.8, 0],
    ]);
    return;
  }
  if (kind === 'rep') a.blip(out, t0, 150, 0.7, 0.1, 0.16, 'triangle');
  else if (kind === 'clank') [1600, 2100].forEach((f, i) => a.blip(out, t0 + i * 0.04, f, 0.7, 0.05, 0.05, 'square'));
  else if (kind === 'run') for (let i = 0; i < 4; i++) a.blip(out, t0 + i * 0.06, 240, 0.5, 0.04, 0.06, 'triangle');
  else if (kind === 'ding') a.blip(out, t0, 1320, 0.9, 0.18, 0.1);
  else if (kind === 'splash') [520, 360, 240].forEach((f, i) => a.blip(out, t0 + i * 0.05, f, 0.8, 0.07, 0.07, 'sine'));
  else if (kind === 'sip') [1900, 2500].forEach((f, i) => a.blip(out, t0 + i * 0.05, f, 0.8, 0.05, 0.05));
  else if (kind === 'whoosh') [700, 500, 340].forEach((f, i) => a.blip(out, t0 + i * 0.05, f, 0.6, 0.08, 0.05, 'sine'));
  else if (kind === 'buzzer') [180, 150].forEach((f, i) => a.blip(out, t0 + i * 0.12, f, 0.95, 0.13, 0.09, 'sawtooth'));
  else [523, 659, 784, 1047].forEach((f, i) => a.blip(out, t0 + i * 0.08, f, 1.0, 0.15, 0.11, 'square')); // cheer
}

/** The gym's spa (client/gym.ts): a soft bed of air and trickling water under everything else. */
export class GymSpa {
  private bed: GainNode | null = null;
  private level = 0;

  constructor(private readonly a: AudioCore) {}

  /** Every frame: 0 outside it, up to 1 in the sauna or the steam room. Nothing until audio's on. */
  set(level: number) {
    const ctx = this.a.ctx;
    if (!ctx) return;
    if (!this.bed) {
      if (level <= 0) return;
      const g = ctx.createGain();
      g.gain.value = 0;
      const air = this.a.noise(this.a.buf.brown, true);
      air.connect(biquad(ctx, 'lowpass', 420, 0.7)).connect(g);
      const trickle = this.a.noise(this.a.buf.gurgle, true);
      const tg = ctx.createGain();
      tg.gain.value = 0.35;
      trickle.connect(biquad(ctx, 'bandpass', 1400, 0.8)).connect(tg).connect(g);
      g.connect(this.a.ambience);
      air.start();
      trickle.start();
      this.bed = g;
    }
    const target = Math.max(0, Math.min(1, level)) * 0.07;
    if (Math.abs(target - this.level) < 1e-4) return;
    this.level = target;
    this.bed.gain.setTargetAtTime(target, ctx.currentTime, 0.6);
  }
}

/**
 * The gym's machines at work, from where they stand (world/gym/equipment.ts): a footfall on a
 * treadmill belt, a flywheel's whirr, the rower's fan on the drive, a stack's plates clanking down,
 * a barbell's thud, a glove on the bag. Soft, and gone a few machines away.
 */
export function gymAt(a: AudioCore, kind: GymMachineSound, at: Pos) {
  const ctx = a.ctx;
  if (!ctx) return;
  a.count(`gymAt.${kind}`);
  if (kind === 'step') {
    a.play(pick(a.buf.steps), { at, gain: rand(0.2, 0.26), rate: rand(0.8, 0.95), ref: 1.2, rolloff: 1.6 });
    return;
  }
  const out = a.panner(at, 1.4, 1.5);
  out.connect(a.ambience);
  const t0 = ctx.currentTime + 0.01;
  if (kind === 'whirr')
    hiss(a, out, t0, 900, 2.5, [
      [0.08, 0.025],
      [0.3, 0.018],
      [0.45, 0],
    ]);
  else if (kind === 'whoosh')
    hiss(a, out, t0, 520, 1.2, [
      [0.12, 0.07],
      [0.45, 0.03],
      [0.8, 0],
    ]);
  else if (kind === 'clank') [1250, 1720].forEach((f, i) => a.blip(out, t0 + i * 0.035, f, 0.8, 0.07, 0.035, 'square'));
  else if (kind === 'thud') a.blip(out, t0, 110, 0.6, 0.14, 0.12, 'triangle');
  else {
    a.blip(out, t0, 160, 0.5, 0.08, 0.14, 'sine');
    hiss(a, out, t0, 1400, 0.8, [
      [0.01, 0.05],
      [0.06, 0],
    ]);
  }
}
