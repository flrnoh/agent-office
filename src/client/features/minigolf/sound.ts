import type { AudioCore } from '../../sound/core';
import { biquad, envelope, pick, rand } from '../../sound/dsp';
import type { Pos } from '../../sound/places';

// ---- The black-light mini golf (flrnoh fork, see FORK.md "Black-light mini golf") ------------------

export type MinigolfSound = 'putt' | 'rail' | 'wood' | 'bumper' | 'kick' | 'blade' | 'stone' | 'metal' | 'rubber' | 'cup' | 'lip' | 'land' | 'pipe' | 'loop' | 'sizzle' | 'splash' | 'whoosh' | 'holed' | 'ace' | 'take' | 'round';

/**
 * A mini golf sound at `at` (the room's coordinates as the ears have them): the putter's tick, the
 * ball off a rail or a wooden bank, a bumper's boing and the pinball mushrooms' kick, a sail's thwack,
 * the cup's plop and a lip-out's rattle, landing after a jump, the hollow run through a tunnel, the
 * loop's whoosh, into the lava or the reef, the windmill's sails going by, and the fanfares.
 * `strength` 0–1 how hard.
 */
export function minigolf(a: AudioCore, kind: MinigolfSound, at?: Pos, strength = 0.5) {
  const ctx = a.ctx;
  if (!ctx) return;
  a.count(`minigolf-${kind}`);
  const out = at ? a.panner(at, 1.6, 1.1) : ctx.createGain();
  out.connect(a.ambience);
  const t0 = ctx.currentTime + 0.004;
  const s = Math.max(0.05, Math.min(1, strength));
  switch (kind) {
    case 'putt':
      // A crisp tick of the putter's face, a little click under it.
      a.blip(out, t0, 2400, 0.7, 0.035, 0.12 + s * 0.2, 'triangle');
      a.blip(out, t0, 900, 0.9, 0.05, 0.06 + s * 0.08);
      break;
    case 'rail':
    case 'wood':
      a.blip(out, t0, kind === 'wood' ? rand(380, 430) : rand(650, 720), 0.8, 0.06, 0.05 + s * 0.2, 'triangle');
      a.play(pick(a.buf.steps), { gain: 0.08 + s * 0.25, rate: rand(2.2, 2.6), dest: out });
      break;
    case 'stone':
      a.play(pick(a.buf.steps), { gain: 0.1 + s * 0.3, rate: rand(1.6, 1.9), dest: out });
      break;
    case 'metal':
      a.clink(out, t0, rand(1500, 1700), 0.04 + s * 0.08);
      break;
    case 'rubber':
      a.blip(out, t0, rand(180, 220), 0.6, 0.12, 0.08 + s * 0.15);
      break;
    case 'bumper': {
      // Boing: a spring's wobble down in pitch.
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(520, t0);
      o.frequency.exponentialRampToValueAtTime(140, t0 + 0.35);
      const wob = ctx.createOscillator();
      wob.frequency.value = 22;
      const depth = ctx.createGain();
      depth.gain.value = 60;
      wob.connect(depth).connect(o.frequency);
      const g = ctx.createGain();
      envelope(g.gain, t0, [
        [0.01, 0.12 + s * 0.18],
        [0.4, 0],
      ]);
      o.connect(g).connect(out);
      o.start(t0);
      wob.start(t0);
      o.stop(t0 + 0.45);
      wob.stop(t0 + 0.45);
      break;
    }
    case 'kick':
      // The pinball mushroom: a pop and a bright zap.
      a.blip(out, t0, 160, 0.5, 0.08, 0.2, 'square');
      a.blip(out, t0 + 0.01, 1800, 2.2, 0.12, 0.08, 'sawtooth');
      a.blip(out, t0 + 0.05, 1320, 1, 0.1, 0.05, 'triangle');
      break;
    case 'blade':
      a.play(pick(a.buf.steps), { gain: 0.2 + s * 0.3, rate: 1.4, dest: out });
      a.blip(out, t0, 260, 0.7, 0.09, 0.1, 'triangle');
      break;
    case 'cup':
      // Plop, and a rattle round the bottom.
      a.blip(out, t0, 480, 0.55, 0.14, 0.18, 'triangle');
      for (let i = 1; i <= 4; i++) a.blip(out, t0 + 0.07 + i * 0.05, 1000 - i * 110, 0.8, 0.035, 0.05 / i);
      break;
    case 'lip':
      for (let i = 0; i < 3; i++) a.blip(out, t0 + i * 0.03, rand(900, 1200), 0.9, 0.03, 0.04);
      break;
    case 'land':
      a.play(pick(a.buf.steps), { gain: 0.1 + s * 0.3, rate: rand(1.3, 1.6), dest: out });
      break;
    case 'pipe': {
      // Down a hollow tube: a rumble that falls away.
      const n = a.noise(a.buf.brown);
      const f = biquad(ctx, 'bandpass', 300, 3);
      f.frequency.setValueAtTime(420, t0);
      f.frequency.exponentialRampToValueAtTime(140, t0 + 0.9);
      const g = ctx.createGain();
      envelope(g.gain, t0, [
        [0.05, 0.35],
        [0.9, 0],
      ]);
      n.connect(f).connect(g).connect(out);
      n.start(t0);
      n.stop(t0 + 1);
      break;
    }
    case 'loop':
    case 'whoosh': {
      const n = a.noise(a.buf.white);
      const f = biquad(ctx, 'bandpass', 700, 1.4);
      f.frequency.setValueAtTime(kind === 'loop' ? 500 : 900, t0);
      f.frequency.exponentialRampToValueAtTime(kind === 'loop' ? 2200 : 400, t0 + 0.5);
      const g = ctx.createGain();
      envelope(g.gain, t0, [
        [0.18, kind === 'loop' ? 0.1 : 0.05 * s + 0.02],
        [0.6, 0],
      ]);
      n.connect(f).connect(g).connect(out);
      n.start(t0);
      n.stop(t0 + 0.7);
      break;
    }
    case 'sizzle':
    case 'splash': {
      const n = a.noise(a.buf.white);
      const f = biquad(ctx, kind === 'sizzle' ? 'highpass' : 'lowpass', kind === 'sizzle' ? 3000 : 900, 0.7);
      const g = ctx.createGain();
      envelope(g.gain, t0, [
        [0.02, 0.18],
        [kind === 'sizzle' ? 0.9 : 0.4, 0],
      ]);
      n.connect(f).connect(g).connect(out);
      n.start(t0);
      n.stop(t0 + 1);
      if (kind === 'splash') a.blip(out, t0, 300, 2.5, 0.12, 0.08);
      break;
    }
    case 'holed':
      [784, 988, 1175].forEach((f, i) => a.blip(out, t0 + 0.2 + i * 0.09, f, 1, 0.25, 0.06, 'triangle'));
      break;
    case 'take':
      a.clink(out, t0, 1250, 0.05);
      a.blip(out, t0 + 0.05, 660, 1.5, 0.12, 0.05, 'triangle');
      break;
    case 'ace':
    case 'round': {
      // A spacey arpeggio up, a shimmer on top.
      const notes = kind === 'ace' ? [523, 659, 784, 1047, 1319, 1568] : [392, 523, 659, 784];
      notes.forEach((f, i) => {
        const when = t0 + 0.15 + i * 0.1;
        a.blip(out, when, f, 1, i === notes.length - 1 ? 1.2 : 0.3, 0.08, 'triangle');
        a.blip(out, when, f * 2.01, 1, 0.5, 0.025, 'sine');
      });
      break;
    }
  }
}

/**
 * The mini golf room's loops, kept up every frame while you're near it (`set`): a spacey pad (two
 * detuned chords breathing through a slow filter, a glassy shimmer now and then), and the felt under
 * the balls rolling (`roll` 0–1, its speed). Half a second without a call and both fade out.
 */
export class MinigolfLoops {
  private pad: { gain: GainNode; filter: BiquadFilterNode; oscs: OscillatorNode[] } | null = null;
  private roll: { gain: GainNode; tone: BiquadFilterNode; pan: PannerNode } | null = null;
  private chord = 0;
  private nextChord = 0;
  private nextShimmer = 0;

  constructor(private readonly a: AudioCore) {}

  set(ambient: number, roll: number, rollAt: Pos | null, rollSpeed: number) {
    const a = this.a;
    const ctx = a.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    if (!this.pad) {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const filter = biquad(ctx, 'lowpass', 700, 0.9);
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.07;
      const lfoDepth = ctx.createGain();
      lfoDepth.gain.value = 380;
      lfo.connect(lfoDepth).connect(filter.frequency);
      lfo.start();
      const oscs: OscillatorNode[] = [];
      for (let i = 0; i < 6; i++) {
        const o = ctx.createOscillator();
        o.type = i % 2 ? 'sawtooth' : 'triangle';
        o.detune.value = (i - 2.5) * 7;
        const g = ctx.createGain();
        g.gain.value = i % 2 ? 0.05 : 0.09;
        o.connect(g).connect(filter);
        o.start();
        oscs.push(o);
      }
      filter.connect(gain).connect(a.ambience);
      this.pad = { gain, filter, oscs };
      this.setChord(now);
    }
    if (now > this.nextChord) this.setChord(now);
    const g = this.pad.gain.gain;
    g.cancelScheduledValues(now);
    g.setTargetAtTime(0.11 * Math.max(0, Math.min(1, ambient)), now, 0.6);
    g.setTargetAtTime(0, now + 0.5, 0.5);
    if (ambient > 0.3 && now > this.nextShimmer) {
      this.nextShimmer = now + rand(5, 11);
      const out = ctx.createGain();
      out.gain.value = ambient;
      out.connect(a.ambience);
      const base = [1047, 1175, 1319, 1568, 1760][Math.floor(Math.random() * 5)];
      for (let i = 0; i < 4; i++) a.blip(out, now + i * 0.14, base * (1 + i * 0.25), 1, 1.4, 0.012, 'sine');
    }
    if (!this.roll) {
      const src = a.noise(a.buf.brown, true);
      const tone = biquad(ctx, 'bandpass', 600, 0.8);
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const pan = a.panner(rollAt ?? a.listener, 1.2, 1.2);
      src.connect(tone).connect(gain).connect(pan).connect(a.ambience);
      src.start();
      this.roll = { gain, tone, pan };
    }
    if (rollAt) {
      const p = this.roll.pan;
      if (p.positionX) {
        p.positionX.setTargetAtTime(rollAt.x, now, 0.03);
        p.positionY.setTargetAtTime(rollAt.y, now, 0.03);
        p.positionZ.setTargetAtTime(rollAt.z, now, 0.03);
      } else p.setPosition(rollAt.x, rollAt.y, rollAt.z);
    }
    const rg = this.roll.gain.gain;
    rg.cancelScheduledValues(now);
    rg.setTargetAtTime(0.22 * Math.max(0, Math.min(1, roll)), now, 0.05);
    rg.setTargetAtTime(0, now + 0.4, 0.15);
    this.roll.tone.frequency.setTargetAtTime(380 + Math.min(4, rollSpeed) * 260, now, 0.08);
  }

  /** On to the next chord of the pad's slow round of four. */
  private setChord(now: number) {
    const chords = [
      [110, 164.8, 220, 261.6, 329.6, 440],
      [98, 146.8, 196, 246.9, 293.7, 392],
      [87.3, 130.8, 174.6, 220, 261.6, 349.2],
      [92.5, 138.6, 185, 233.1, 277.2, 370],
    ];
    const c = chords[this.chord++ % chords.length];
    this.pad!.oscs.forEach((o, i) => o.frequency.setTargetAtTime(c[i], now, 1.5));
    this.nextChord = now + 9;
  }
}
