import type { AudioCore } from '../../sound/core';
import { biquad, envelope, place } from '../../sound/dsp';
import type { Pos } from '../../sound/places';

// ---- The city bus (flrnoh fork, see FORK.md "Traffic lights and the city bus") ------------------------
// Each bus's diesel: a low sawtooth rumble with a little noise, idling at the stops and the lights and
// rising as it pulls away; its doors' hiss as they open and shut; inside, the gong before the next
// stop's called, the ding of a stop button and the clack of the validator. All synthesized, on the
// effects volume, from where the bus is.

interface Engine {
  osc: OscillatorNode;
  sub: OscillatorNode;
  tone: BiquadFilterNode;
  gain: GainNode;
  pan: PannerNode;
}

/** The buses' engines: one per bus, running while it's in earshot. */
export class BusEngines {
  private readonly runs = new Map<number, Engine>();

  constructor(private readonly a: AudioCore) {}

  /** Each frame: every bus close enough to hear (its id, where it is, how fast; `inside`: you're riding it), the rest off. */
  set(list: { id: number; at: Pos; speed: number; inside: boolean }[]) {
    const ctx = this.a.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    const seen = new Set<number>();
    for (const s of list) {
      seen.add(s.id);
      let r = this.runs.get(s.id);
      if (!r) {
        this.a.count('busEngine');
        const pan = this.a.panner(s.at, 6, 1.1);
        pan.connect(this.a.ambience);
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        const sub = ctx.createOscillator();
        sub.type = 'square';
        const tone = biquad(ctx, 'lowpass', 220, 1.2);
        const gain = ctx.createGain();
        gain.gain.value = 0;
        osc.connect(tone);
        sub.connect(tone);
        tone.connect(gain).connect(pan);
        osc.start(now);
        sub.start(now);
        r = { osc, sub, tone, gain, pan };
        this.runs.set(s.id, r);
      }
      place(r.pan, s.at.x, s.at.y, s.at.z);
      const v = Math.abs(s.speed);
      r.osc.frequency.setTargetAtTime(38 + v * 5.5, now, 0.3);
      r.sub.frequency.setTargetAtTime(19 + v * 2.75, now, 0.3);
      r.tone.frequency.setTargetAtTime(170 + v * 45, now, 0.3);
      r.gain.gain.setTargetAtTime((s.inside ? 0.05 : 0.09) + Math.min(0.08, v * 0.012), now, 0.25);
    }
    for (const [id, r] of this.runs) {
      if (seen.has(id)) continue;
      this.runs.delete(id);
      r.gain.gain.setTargetAtTime(0, now, 0.2);
      r.osc.stop(now + 1);
      r.sub.stop(now + 1);
    }
  }
}

export type BusSound = 'open' | 'shut' | 'gong' | 'ding' | 'stamp';

/** One of the bus's sounds at `at`. */
export function busSound(a: AudioCore, kind: BusSound, at: Pos) {
  if (kind === 'open' || kind === 'shut') return busDoorHiss(a, at, kind === 'open');
  const ctx = a.ctx;
  if (!ctx) return;
  a.count(`bus-${kind}`);
  const t = ctx.currentTime + 0.01;
  const pan = a.panner(at, 2, 1.2);
  pan.connect(a.ambience);
  /** A soft bell tone: a sine and its octave, struck and dying away. */
  const bell = (f: number, at0: number, len: number, level: number) => {
    for (const [mul, k] of [[1, 1], [2.01, 0.35], [3.02, 0.12]] as const) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f * mul;
      const g = ctx.createGain();
      envelope(g.gain, at0, [
        [0.008, level * k],
        [len, 0],
      ]);
      o.connect(g).connect(pan);
      o.start(at0);
      o.stop(at0 + len + 0.05);
    }
  };
  if (kind === 'gong') {
    // Ding-dong, before the next stop's called out.
    bell(784, t, 1.1, 0.09);
    bell(622, t + 0.45, 1.4, 0.09);
  } else if (kind === 'ding') {
    // Someone's pressed the stop button.
    bell(1318, t, 0.5, 0.08);
  } else {
    // The validator: a clack, and its little beep.
    const air = a.noise(a.buf.white);
    const g = ctx.createGain();
    envelope(g.gain, t, [
      [0.003, 0.25],
      [0.06, 0],
    ]);
    air.connect(biquad(ctx, 'bandpass', 1800, 2)).connect(g).connect(pan);
    air.start(t);
    air.stop(t + 0.1);
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = 2200;
    const k = ctx.createGain();
    envelope(k.gain, t + 0.08, [
      [0.005, 0.03],
      [0.12, 0.03],
      [0.13, 0],
    ]);
    o.connect(k).connect(pan);
    o.start(t + 0.08);
    o.stop(t + 0.25);
  }
}

/** The doors: a burst of air (opening, a sigh out; shutting, shorter, with a thump at the end). */
function busDoorHiss(a: AudioCore, at: Pos, opening: boolean) {
  const ctx = a.ctx;
  if (!ctx) return;
  a.count('busDoor');
  const t = ctx.currentTime + 0.01;
  const pan = a.panner(at, 3, 1.2);
  pan.connect(a.ambience);
  const air = a.noise(a.buf.white);
  const g = ctx.createGain();
  const len = opening ? 0.9 : 0.6;
  envelope(g.gain, t, [
    [0.04, 0.22],
    [len * 0.5, 0.12],
    [len, 0],
  ]);
  const band = biquad(ctx, 'bandpass', opening ? 3800 : 3000, 0.9);
  band.frequency.setValueAtTime(opening ? 4200 : 2800, t);
  band.frequency.linearRampToValueAtTime(opening ? 2200 : 3600, t + len);
  air.connect(band).connect(g).connect(pan);
  air.start(t);
  air.stop(t + len + 0.05);
  if (!opening) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(110, t + len);
    o.frequency.exponentialRampToValueAtTime(55, t + len + 0.12);
    const k = ctx.createGain();
    envelope(k.gain, t + len, [
      [0.005, 0.3],
      [0.15, 0],
    ]);
    o.connect(k).connect(pan);
    o.start(t + len);
    o.stop(t + len + 0.2);
  }
}
