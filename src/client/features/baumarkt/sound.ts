import type { AudioCore } from '../../sound/core';
import { biquad, envelope, place, rand } from '../../sound/dsp';
import { hiss } from '../../sound/hiss';
import type { Pos } from '../../sound/places';

// ---- The Baumarkt (flrnoh fork, see FORK.md) ---------------------------------------------------
// The tools (a drill's whirr, a screwdriver's ratchet, a hammer's knock, a chainsaw's rasp), the paint
// shaker rattling a can, the forklift's reversing beep, its horn and its forks' hydraulics, a pallet
// set down, the checkout's scanner, the anti-theft gate and the PA's ding-dong. All synthesized; on
// the effects volume. The forklift's electric motor runs on its own (ForkliftHum).

export type BaumarktSound = 'drill' | 'screwdriver' | 'hammer' | 'chainsaw' | 'shake' | 'beep' | 'horn' | 'clunk' | 'scan' | 'gate' | 'chime' | 'rattle' | 'door';

const osc = (a: AudioCore, type: OscillatorType, f: number, t0: number, len: number) => {
  const o = a.ctx!.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t0);
  o.start(t0);
  o.stop(t0 + len + 0.05);
  return o;
};

/** One of the Baumarkt's sounds at `at`; `strength` 0..1. */
export function baumarktSound(a: AudioCore, kind: BaumarktSound, at: Pos, strength = 1) {
  const ctx = a.ctx;
  if (!ctx) return;
  a.count(`baumarkt-${kind}`);
  const loud = kind === 'chainsaw' || kind === 'shake' || kind === 'chime' || kind === 'horn';
  const out = a.panner(at, loud ? 5 : 2.2, 1);
  out.connect(a.ambience);
  const t0 = ctx.currentTime + 0.01;
  switch (kind) {
    case 'drill':
    case 'screwdriver': {
      // A motor spinning up, holding, and winding down; the drill higher and harder.
      const drill = kind === 'drill';
      const len = drill ? 1.1 : 0.7;
      const o = osc(a, 'sawtooth', 120, t0, len);
      o.frequency.linearRampToValueAtTime(drill ? 520 : 330, t0 + 0.18);
      o.frequency.setValueAtTime(drill ? 520 : 330, t0 + len - 0.25);
      o.frequency.exponentialRampToValueAtTime(90, t0 + len);
      const g = ctx.createGain();
      envelope(g.gain, t0, [
        [0.04, drill ? 0.09 : 0.06],
        [len - 0.2, drill ? 0.08 : 0.05],
        [len, 0],
      ]);
      o.connect(biquad(ctx, 'bandpass', drill ? 1400 : 900, 1.2)).connect(g).connect(out);
      hiss(a, out, t0, drill ? 3200 : 2200, 1.5, [
        [0.05, 0.03],
        [len - 0.2, 0.025],
        [len, 0],
      ]);
      // The screwdriver's clutch ratchets at the end.
      if (!drill) for (let i = 0; i < 6; i++) a.blip(out, t0 + len - 0.25 + i * 0.045, 2400, 0.6, 0.02, 0.04, 'square');
      return;
    }
    case 'hammer':
      // A knock on wood: a low thud and a crack on top.
      a.blip(out, t0, 190, 0.5, 0.12, 0.35 * strength);
      hiss(a, out, t0, 2600, 2, [
        [0.003, 0.18 * strength],
        [0.06, 0],
      ]);
      a.blip(out, t0, 1200, 0.8, 0.03, 0.08 * strength, 'triangle');
      return;
    case 'chainsaw': {
      // A two-stroke: a rasping saw tooth, chopped fast, revving up and back.
      const len = 1.6;
      const o = osc(a, 'sawtooth', 70, t0, len);
      o.frequency.linearRampToValueAtTime(140, t0 + 0.35);
      o.frequency.setValueAtTime(140, t0 + 1.1);
      o.frequency.linearRampToValueAtTime(65, t0 + len);
      const chop = ctx.createGain();
      const lfo = osc(a, 'square', 38, t0, len);
      const depth = ctx.createGain();
      depth.gain.value = 0.5;
      lfo.connect(depth).connect(chop.gain);
      chop.gain.value = 0.5;
      const g = ctx.createGain();
      envelope(g.gain, t0, [
        [0.05, 0.16],
        [1.2, 0.15],
        [len, 0],
      ]);
      o.connect(biquad(ctx, 'lowpass', 2200, 1)).connect(chop).connect(g).connect(out);
      hiss(a, out, t0, 4000, 0.8, [
        [0.1, 0.06],
        [1.2, 0.05],
        [len, 0],
      ]);
      return;
    }
    case 'shake': {
      // The paint shaker: a can clattering in its clamp, fast and loud, for as long as it mixes.
      const len = 4;
      const n = a.noise(a.buf.white, true);
      const chop = ctx.createGain();
      const lfo = osc(a, 'square', 14, t0, len);
      const depth = ctx.createGain();
      depth.gain.value = 0.5;
      lfo.connect(depth).connect(chop.gain);
      chop.gain.value = 0.5;
      const g = ctx.createGain();
      envelope(g.gain, t0, [
        [0.15, 0.22],
        [len - 0.3, 0.2],
        [len, 0],
      ]);
      n.connect(biquad(ctx, 'bandpass', 900, 0.8)).connect(chop).connect(g).connect(out);
      n.start(t0);
      n.stop(t0 + len + 0.05);
      const hum = osc(a, 'sawtooth', 55, t0, len);
      const hg = ctx.createGain();
      envelope(hg.gain, t0, [
        [0.2, 0.05],
        [len - 0.3, 0.05],
        [len, 0],
      ]);
      hum.connect(biquad(ctx, 'lowpass', 300, 1)).connect(hg).connect(out);
      for (let i = 0; i < 40; i++) a.clink(out, t0 + rand(0.1, len - 0.3), rand(700, 1400), 0.012);
      return;
    }
    case 'beep':
      // The reversing beeper: one beep (the forklift's tick repeats it).
      a.blip(out, t0, 1650, 1, 0.22, 0.06, 'square');
      return;
    case 'horn': {
      const g = ctx.createGain();
      envelope(g.gain, t0, [
        [0.01, 0.08],
        [0.3, 0.08],
        [0.33, 0],
      ]);
      const tone = biquad(ctx, 'lowpass', 2000, 0.8);
      tone.connect(g).connect(out);
      for (const f of [440, 554]) osc(a, 'square', f, t0, 0.35).connect(tone);
      return;
    }
    case 'clunk':
      // Wood on concrete: a pallet set down (or lifted off the floor).
      a.blip(out, t0, 110, 0.6, 0.18, 0.3 * strength);
      hiss(a, out, t0, 700, 1, [
        [0.005, 0.12 * strength],
        [0.15, 0],
      ]);
      return;
    case 'scan':
      a.blip(out, t0, 2700, 1, 0.09, 0.05, 'square');
      return;
    case 'gate':
      // The anti-theft gate: a shrill two-tone, three times.
      for (let i = 0; i < 6; i++) a.blip(out, t0 + i * 0.16, i % 2 ? 2100 : 2800, 1, 0.15, 0.06, 'square');
      return;
    case 'chime':
      // The PA's ding-dong-ding before an announcement.
      [784, 659, 523].forEach((f, i) => {
        a.blip(out, t0 + i * 0.42, f, 1, 1.1, 0.09, 'sine');
        a.blip(out, t0 + i * 0.42, f * 2, 1, 0.6, 0.02, 'sine');
      });
      return;
    case 'rattle':
      // A trolley's wheels over a seam, its basket rattling.
      for (let i = 0; i < 3; i++) a.clink(out, t0 + i * 0.05 + rand(0, 0.02), rand(900, 1600), 0.02 * strength);
      hiss(a, out, t0, 1800, 2, [
        [0.01, 0.025 * strength],
        [0.15, 0],
      ]);
      return;
    case 'door':
      hiss(a, out, t0, 600, 0.7, [
        [0.15, 0.04],
        [0.9, 0],
      ]);
      return;
  }
}

/** The forklift's electric motor whining with its speed, and its hydraulics while the forks move. */
export class ForkliftHum {
  private run: { motor: OscillatorNode; tone: BiquadFilterNode; gain: GainNode; pump: AudioBufferSourceNode; pumpGain: GainNode; pan: PannerNode } | null = null;

  constructor(private readonly a: AudioCore) {}

  /** Each frame: where it is, how fast (m/s) and how hard the forks are moving (0–1); null shuts it off. */
  set(s: { at: Pos; speed: number; lifting: number } | null) {
    const ctx = this.a.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    if (!s) {
      if (!this.run) return;
      const r = this.run;
      this.run = null;
      r.gain.gain.setTargetAtTime(0, now, 0.1);
      r.pumpGain.gain.setTargetAtTime(0, now, 0.1);
      r.motor.stop(now + 0.6);
      r.pump.stop(now + 0.6);
      return;
    }
    if (!this.run) {
      this.a.count('forklift');
      const pan = this.a.panner(s.at, 3, 1);
      pan.connect(this.a.ambience);
      const motor = ctx.createOscillator();
      motor.type = 'sawtooth';
      motor.frequency.value = 180;
      const tone = biquad(ctx, 'bandpass', 900, 3);
      const gain = ctx.createGain();
      gain.gain.value = 0;
      motor.connect(tone).connect(gain).connect(pan);
      motor.start(now);
      const pump = this.a.noise(this.a.buf.white, true);
      const pumpGain = ctx.createGain();
      pumpGain.gain.value = 0;
      pump.connect(biquad(ctx, 'bandpass', 420, 2)).connect(pumpGain).connect(pan);
      pump.start(now);
      this.run = { motor, tone, gain, pump, pumpGain, pan };
    }
    const r = this.run;
    place(r.pan, s.at.x, s.at.y, s.at.z);
    const v = Math.abs(s.speed);
    r.motor.frequency.setTargetAtTime(160 + v * 120, now, 0.1);
    r.tone.frequency.setTargetAtTime(700 + v * 500, now, 0.1);
    r.gain.gain.setTargetAtTime(0.008 + Math.min(0.03, v * 0.008), now, 0.12);
    r.pumpGain.gain.setTargetAtTime(0.05 * s.lifting, now, 0.06);
  }
}
