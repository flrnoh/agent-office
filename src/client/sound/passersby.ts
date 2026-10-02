import type { AudioCore } from './core';
import { biquad, envelope, pick, rand, randInt } from './dsp';
import type { Pos } from './places';

// ---- The city's passers-by (flrnoh fork, see world/town/people.ts) -----------------------------------

/** A passer-by's footstep on the sidewalk: softer than someone in the office's, and gone a few meters off. */
export function passerbyStep(a: AudioCore, at: Pos) {
  if (!a.ctx) return;
  a.play(pick(a.buf.steps), { at, gain: rand(0.12, 0.17), rate: rand(0.95, 1.2), ref: 1.2, rolloff: 1.8 });
  a.count('passerbyStep');
}

/**
 * Two people talking as they go by: a few muffled syllables, no words, a voice's buzz through a
 * vowel's two formants, rising and falling. Quiet, and only close by.
 */
export function passerbyChat(a: AudioCore, at: Pos) {
  const ctx = a.ctx;
  if (!ctx) return;
  a.count('passerbyChat');
  const pan = a.panner(at, 1.5, 1.6);
  const out = ctx.createGain();
  out.gain.value = 0.05;
  out.connect(pan).connect(a.ambience);
  const pitch = rand(110, 230);
  let t = ctx.currentTime + 0.02;
  const n = randInt(3, 7);
  for (let k = 0; k < n; k++) {
    const len = rand(0.08, 0.2);
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(pitch * rand(0.9, 1.15), t);
    o.frequency.linearRampToValueAtTime(pitch * rand(0.85, 1.2), t + len);
    const [f1, f2] = pick([
      [700, 1200],
      [400, 2000],
      [300, 870],
      [550, 1700],
      [350, 2300],
    ]);
    const g = ctx.createGain();
    envelope(g.gain, t, [
      [len * 0.25, 1],
      [len, 0],
    ]);
    const lo = biquad(ctx, 'lowpass', 2600, 0.7);
    for (const f of [f1, f2]) o.connect(biquad(ctx, 'bandpass', f, 6)).connect(g);
    g.connect(lo).connect(out);
    o.start(t);
    o.stop(t + len + 0.02);
    t += len + rand(0.03, 0.12);
  }
}
