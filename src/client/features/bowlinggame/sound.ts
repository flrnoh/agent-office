import type { AudioCore } from '../../sound/core';
import { biquad, rand } from '../../sound/dsp';
import type { Pos } from '../../sound/places';

// ---- flrnoh fork: the bowling centre's lanes (features/bowlinggame) ---------------------------------

export type BowlSound =
  | 'pins' // a ball into the pins, or pins into each other: wooden clacks, more and louder the harder
  | 'strike' // the big crash of a full rack going down
  | 'down' // a pin landing on the deck
  | 'gutter' // the ball dropping into the gutter
  | 'pit' // into the pit, against the cushion
  | 'kick' // a pin off the kickback
  | 'release' // the ball laid down on the lane
  | 'pinsetter' // the machine waking up
  | 'sweep' // the bar raking the deadwood into the pit
  | 'set' // pins set down on the deck
  | 'pop' // the ball coming up the return, a puff of air
  | 'return' // and clunking onto the lip
  | 'foul' // the foul line's buzzer
  | 'yay-strike'
  | 'yay-spare'
  | 'yay-turkey'
  | 'yay-perfect'
  | 'aww-split'
  | 'aww-gutter';

/** A short wooden "tok": a band of noise and a couple of hollow partials, `level` loud. */
function tok(a: AudioCore, out: AudioNode, when: number, level: number, pitch = 1) {
  const ctx = a.ctx!;
  const src = a.noise(a.buf.white);
  const band = biquad(ctx, 'bandpass', rand(1500, 2600) * pitch, 2.2);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(level * 0.9, when + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.06);
  src.connect(band).connect(g).connect(out);
  src.start(when, rand(0, 1));
  src.stop(when + 0.08);
  a.blip(out, when, rand(780, 1150) * pitch, 0.92, 0.09, level * 0.35, 'triangle');
  a.blip(out, when, rand(1900, 2500) * pitch, 0.95, 0.05, level * 0.15, 'sine');
}

/** A soft low thump. */
function thump(a: AudioCore, out: AudioNode, when: number, freq: number, level: number, len = 0.18) {
  a.blip(out, when, freq, 0.55, len, level, 'sine');
}

/** A few notes in a row: `notes` as [semitones above `base`, at (s), length (s)]. */
function tune(a: AudioCore, out: AudioNode, t0: number, base: number, notes: [number, number, number][], type: OscillatorType, level: number) {
  for (const [st, at, len] of notes) {
    const f = base * Math.pow(2, st / 12);
    a.blip(out, t0 + at, f, 1, len, level, type);
    a.blip(out, t0 + at, f * 2, 1, len * 0.6, level * 0.25, 'sine');
  }
}

/** One of the lanes' sounds at `at`; `strength` 0..1 how hard (the pins' clatter grows with it). */
export function bowlSound(a: AudioCore, kind: BowlSound, at: Pos, strength = 1) {
  const ctx = a.ctx;
  if (!ctx) return;
  a.count(`bowl-${kind}`);
  const loud = kind.startsWith('yay') || kind.startsWith('aww') || kind === 'foul';
  const out = a.panner(at, loud ? 6 : 2.5, loud ? 0.6 : 1.1);
  out.connect(a.ambience);
  const t0 = ctx.currentTime + 0.005;
  const s = Math.max(0.05, Math.min(1, strength));
  switch (kind) {
    case 'pins': {
      const n = 1 + Math.round(s * 3);
      for (let i = 0; i < n; i++) tok(a, out, t0 + i * rand(0.008, 0.03), 0.18 + s * 0.3);
      break;
    }
    case 'strike': {
      // A wall of clacks over a deep boom, settling into a few late rattles.
      thump(a, out, t0, 95, 0.55, 0.35);
      for (let i = 0; i < 22; i++) tok(a, out, t0 + Math.pow(Math.random(), 1.6) * 0.55, 0.15 + Math.random() * 0.35, rand(0.85, 1.15));
      const rumble = a.noise(a.buf.brown);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.5, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.7);
      rumble.connect(biquad(ctx, 'lowpass', 600, 0.8)).connect(g).connect(out);
      rumble.start(t0, rand(0, 1));
      rumble.stop(t0 + 0.75);
      break;
    }
    case 'down':
      tok(a, out, t0, 0.12 + s * 0.12, 0.7);
      thump(a, out, t0, rand(150, 190), 0.1 * s, 0.08);
      break;
    case 'gutter':
      thump(a, out, t0, 130, 0.45, 0.2);
      a.clink(out, t0 + 0.01, rand(600, 750), 0.04);
      break;
    case 'pit':
      thump(a, out, t0, 70, 0.6, 0.3);
      thump(a, out, t0 + 0.12, 55, 0.3, 0.25);
      break;
    case 'kick':
      tok(a, out, t0, 0.3, 0.6);
      thump(a, out, t0, 210, 0.15, 0.1);
      break;
    case 'release':
      thump(a, out, t0, 85, 0.35 + s * 0.2, 0.22);
      break;
    case 'pinsetter': {
      // A motor spinning up: a low buzz rising, a clunk of the gearbox.
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(38, t0);
      o.frequency.linearRampToValueAtTime(62, t0 + 0.6);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.08, t0 + 0.15);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.2);
      o.connect(biquad(ctx, 'lowpass', 300, 1)).connect(g).connect(out);
      o.start(t0);
      o.stop(t0 + 2.3);
      thump(a, out, t0, 120, 0.25, 0.12);
      break;
    }
    case 'sweep':
      thump(a, out, t0, 140, 0.3, 0.12);
      for (let i = 0; i < 8; i++) tok(a, out, t0 + 0.15 + Math.random() * 0.45, 0.08 + Math.random() * 0.12, 0.8);
      break;
    case 'set':
      for (let i = 0; i < 4; i++) tok(a, out, t0 + i * 0.012, 0.12, 0.65);
      thump(a, out, t0, 160, 0.2, 0.1);
      break;
    case 'pop': {
      const src = a.noise(a.buf.white);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.45);
      src.connect(biquad(ctx, 'bandpass', 900, 0.6)).connect(g).connect(out);
      src.start(t0, rand(0, 1));
      src.stop(t0 + 0.5);
      break;
    }
    case 'return':
      thump(a, out, t0, 105, 0.55, 0.25);
      a.clink(out, t0 + 0.02, rand(420, 520), 0.05);
      thump(a, out, t0 + 0.22, 120, 0.2, 0.12);
      break;
    case 'foul':
      a.blip(out, t0, 220, 1, 0.55, 0.12, 'square');
      a.blip(out, t0, 233, 1, 0.55, 0.08, 'square');
      break;
    case 'yay-strike':
      tune(a, out, t0 + 0.25, 523, [[0, 0, 0.12], [4, 0.1, 0.12], [7, 0.2, 0.12], [12, 0.3, 0.45]], 'triangle', 0.08);
      break;
    case 'yay-turkey':
      // A gobble, and the fanfare.
      for (let i = 0; i < 6; i++) a.blip(out, t0 + 0.2 + i * 0.07, 520 + (i % 2) * 140, 0.8, 0.06, 0.07, 'square');
      tune(a, out, t0 + 0.7, 523, [[0, 0, 0.1], [4, 0.09, 0.1], [7, 0.18, 0.1], [12, 0.27, 0.1], [16, 0.36, 0.55]], 'triangle', 0.08);
      break;
    case 'yay-perfect':
      tune(a, out, t0 + 0.2, 523, [[0, 0, 0.14], [4, 0.14, 0.14], [7, 0.28, 0.14], [12, 0.42, 0.3], [7, 0.72, 0.14], [12, 0.86, 0.9]], 'triangle', 0.1);
      tune(a, out, t0 + 0.2, 262, [[0, 0, 0.42], [5, 0.42, 0.3], [7, 0.72, 1]], 'sine', 0.08);
      break;
    case 'yay-spare':
      tune(a, out, t0 + 0.2, 659, [[0, 0, 0.12], [5, 0.12, 0.3]], 'triangle', 0.07);
      break;
    case 'aww-split':
      tune(a, out, t0 + 0.2, 330, [[0, 0, 0.3], [-1, 0.3, 0.3], [-2, 0.6, 0.6]], 'sawtooth', 0.035);
      break;
    case 'aww-gutter':
      // Wah-wah.
      for (let i = 0; i < 2; i++) a.blip(out, t0 + 0.2 + i * 0.35, 300 - i * 30, 0.75, 0.32, 0.05, 'sawtooth');
      break;
  }
}

/**
 * The balls rolling down the lanes, each its own rumble (filtered noise and a low hum) that rises in
 * pitch and loudness with its speed, rattles when it's in the gutter, and follows it down the lane. It
 * needs keeping up every frame: left alone it fades away by itself.
 */
export class BallRolls {
  private rolls = new Map<number, { gain: GainNode; tone: BiquadFilterNode; hum: OscillatorNode; humGain: GainNode; pan: PannerNode }>();

  constructor(private readonly a: AudioCore) {}

  set(id: number, at: Pos, speed: number, gutter: boolean) {
    const a = this.a;
    const ctx = a.ctx;
    if (!ctx) return;
    let r = this.rolls.get(id);
    if (!r) {
      const src = a.noise(a.buf.brown, true);
      const tone = biquad(ctx, 'lowpass', 300, 1.2);
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const pan = a.panner(at, 2.5, 1.0);
      const hum = ctx.createOscillator();
      hum.type = 'sine';
      const humGain = ctx.createGain();
      humGain.gain.value = 0;
      src.connect(tone).connect(gain).connect(pan);
      hum.connect(humGain).connect(pan);
      pan.connect(a.ambience);
      src.start(0, rand(0, 2));
      hum.start();
      r = { gain, tone, hum, humGain, pan };
      this.rolls.set(id, r);
    }
    a.count('bowl-roll');
    const now = ctx.currentTime;
    const k = Math.max(0, Math.min(1, speed / 9));
    r.pan.positionX.value = at.x;
    r.pan.positionY.value = at.y;
    r.pan.positionZ.value = at.z;
    r.tone.frequency.setTargetAtTime(gutter ? 900 : 160 + 380 * k, now, 0.05);
    r.tone.Q.setTargetAtTime(gutter ? 4 : 1.2, now, 0.05);
    r.hum.frequency.setTargetAtTime(38 + 34 * k, now, 0.05);
    for (const [p, v] of [
      [r.gain.gain, (gutter ? 0.35 : 0.55) * (0.2 + 0.8 * k)],
      [r.humGain.gain, (gutter ? 0.05 : 0.22) * k],
    ] as const) {
      p.cancelScheduledValues(now);
      p.setTargetAtTime(v, now, 0.04);
      // Not kept up: gone in a moment.
      p.setTargetAtTime(0, now + 0.25, 0.08);
    }
  }
}
