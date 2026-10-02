import type { AudioCore } from '../../sound/core';
import { biquad, envelope, pick, rand } from '../../sound/dsp';
import type { Pos } from '../../sound/places';

// ---- The rehearsal wing (flrnoh fork, see FORK.md "The rehearsal wing") ---------------------------

export type ProberaumSound = 'knock' | 'open' | 'shut' | 'coin' | 'vend' | 'locker' | 'pin' | 'marker' | 'click' | 'clickhi' | 'thump' | 'tone' | 'recstart' | 'recstop' | 'denied' | 'dice' | 'kicker';

/**
 * A sound in the rehearsal wing at `at` (or in your own ears): knocking on a heavy door, the door's
 * latch and its seal sucking shut, a coin in the jar, the machines dropping something, a locker, a
 * pin, a marker, the click track (`clickhi` the bar's first beat), what a rehearsal room sounds like
 * through its walls (`thump` a drum, `tone` anything with a pitch: `strength` 0..1, `pitch` a MIDI
 * note), the recorder's beeps, a "no" buzz, dice. `delay` seconds from now (the click track's beats).
 */
export function proberaumSound(a: AudioCore, kind: ProberaumSound, at?: Pos, strength = 0.6, delay = 0, pitch = 48) {
  const ctx = a.ctx;
  if (!ctx) return;
  a.count(`proberaum-${kind}`);
  const out = at ? a.panner(at, 1.6, 1.1) : ctx.createGain();
  out.connect(a.ambience);
  const t0 = ctx.currentTime + 0.004 + Math.max(0, delay);
  const s = Math.max(0.05, Math.min(1, strength));
  switch (kind) {
    case 'knock':
      // Three knuckles on a padded steel door: dull, a little ring.
      for (let i = 0; i < 3; i++) {
        const t = t0 + i * 0.19 + rand(-0.01, 0.01);
        a.blip(out, t, rand(150, 175), 0.6, 0.09, 0.32 * s, 'triangle');
        a.play(pick(a.buf.steps), { gain: 0.35 * s, rate: rand(0.8, 0.95), dest: out, when: t });
      }
      break;
    case 'open':
      // The lever, the latch, the seal letting go.
      a.blip(out, t0, 900, 0.7, 0.05, 0.08, 'square');
      a.blip(out, t0 + 0.06, 420, 0.5, 0.08, 0.12, 'triangle');
      hiss(a, out, t0 + 0.1, 0.25, 0.05, 900);
      break;
    case 'shut':
      // Heavy and sealed: a deep thud and the latch.
      a.blip(out, t0, 95, 0.5, 0.25, 0.4, 'sine');
      a.play(pick(a.buf.steps), { gain: 0.5, rate: 0.6, dest: out, when: t0 });
      a.blip(out, t0 + 0.05, 1200, 0.8, 0.03, 0.06, 'square');
      break;
    case 'coin':
      a.clink(out, t0, rand(2100, 2400), 0.12);
      a.clink(out, t0 + 0.09, rand(2600, 2900), 0.08);
      a.clink(out, t0 + 0.16, rand(1900, 2100), 0.05);
      break;
    case 'vend':
      // The coil turning, the drop, the flap.
      for (let i = 0; i < 6; i++) a.blip(out, t0 + i * 0.07, 70, 1, 0.05, 0.08, 'sawtooth');
      a.blip(out, t0 + 0.55, 120, 0.5, 0.2, 0.35, 'triangle');
      a.play(pick(a.buf.steps), { gain: 0.4, rate: 0.7, dest: out, when: t0 + 0.55 });
      a.blip(out, t0 + 0.8, 600, 0.8, 0.05, 0.06, 'square');
      break;
    case 'locker':
      a.blip(out, t0, 300, 0.7, 0.12, 0.2, 'square');
      a.clink(out, t0 + 0.02, 780, 0.1);
      a.clink(out, t0 + 0.05, 1130, 0.06);
      break;
    case 'pin':
      a.play(pick(a.buf.steps), { gain: 0.25, rate: 2.4, dest: out, when: t0 });
      a.blip(out, t0, 1800, 0.9, 0.03, 0.05, 'triangle');
      break;
    case 'marker':
      hiss(a, out, t0, 0.35, 0.05, 3500);
      hiss(a, out, t0 + 0.4, 0.2, 0.04, 3200);
      break;
    case 'click':
    case 'clickhi':
      // A woodblock click, the bar's first one higher.
      a.blip(out, t0, kind === 'clickhi' ? 1760 : 1180, 0.9, 0.035, 0.22 * s, 'triangle');
      a.blip(out, t0, kind === 'clickhi' ? 3520 : 2360, 0.9, 0.012, 0.06 * s, 'square');
      break;
    case 'thump': {
      // A drum through a wall: all low end.
      const lp = biquad(ctx, 'lowpass', 180, 0.7);
      lp.connect(out);
      a.blip(lp, t0, 85 + pitch * 0.4, 0.55, 0.22, 0.6 * s, 'sine');
      break;
    }
    case 'tone': {
      const lp = biquad(ctx, 'lowpass', 260, 0.6);
      lp.connect(out);
      const f = 440 * 2 ** ((pitch - 69) / 12);
      a.blip(lp, t0, Math.max(40, Math.min(400, f)), 1, 0.3, 0.25 * s, 'sawtooth');
      break;
    }
    case 'recstart':
      a.blip(out, t0, 880, 1, 0.08, 0.12, 'sine');
      a.blip(out, t0 + 0.1, 1320, 1, 0.12, 0.12, 'sine');
      break;
    case 'recstop':
      a.blip(out, t0, 1320, 1, 0.08, 0.12, 'sine');
      a.blip(out, t0 + 0.1, 660, 1, 0.14, 0.12, 'sine');
      break;
    case 'denied':
      a.blip(out, t0, 160, 1, 0.18, 0.15, 'square');
      break;
    case 'kicker':
      // The rod spun, the ball off a player, off the side, into the goal.
      a.blip(out, t0, 220, 0.6, 0.06, 0.2, 'square');
      a.play(pick(a.buf.steps), { gain: 0.35, rate: 2.2, dest: out, when: t0 + 0.12 });
      a.play(pick(a.buf.steps), { gain: 0.25, rate: 2.6, dest: out, when: t0 + 0.3 });
      a.blip(out, t0 + 0.42, 140, 0.5, 0.15, 0.3, 'triangle');
      break;
    case 'dice':
      for (let i = 0; i < 5; i++) a.play(pick(a.buf.steps), { gain: 0.2, rate: rand(2.6, 3.2), dest: out, when: t0 + i * 0.06 + rand(0, 0.03) });
      break;
  }
}

/** A breath of filtered noise (a seal letting go, a marker on a board). */
function hiss(a: AudioCore, out: AudioNode, t0: number, len: number, level: number, freq: number) {
  const ctx = a.ctx!;
  const n = a.noise(a.buf.white);
  const f = biquad(ctx, 'bandpass', freq, 1.2);
  const g = ctx.createGain();
  envelope(g.gain, t0, [
    [0.02, level],
    [len, 0],
  ]);
  n.connect(f).connect(g).connect(out);
  n.start(t0);
  n.stop(t0 + len + 0.05);
}
