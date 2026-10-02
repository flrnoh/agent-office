import type { AudioCore } from '../../sound/core';
import { biquad, envelope, place } from '../../sound/dsp';
import { hiss } from '../../sound/hiss';
import type { Pos } from '../../sound/places';

// ---- The petrol station (flrnoh fork, see FORK.md) ---------------------------------------------------
// The nozzle going in, the pump's click when it's full, the shop's scanner and till, the wash's start
// chime; and what runs while it runs: the pumps humming and gurgling, the wash's water, brushes and
// dryer. Synthesized like everything else, on the effects volume.

export type TankSound = 'nozzle' | 'full' | 'beep' | 'till' | 'chime' | 'drip';

export function tankstelle(a: AudioCore, kind: TankSound, at: Pos) {
  const ctx = a.ctx;
  if (!ctx) return;
  a.count(`tank-${kind}`);
  const out = a.panner(at, kind === 'chime' ? 5 : 2, 1);
  out.connect(a.ambience);
  const t0 = ctx.currentTime + 0.01;
  switch (kind) {
    case 'nozzle':
      // Metal into the filler neck: a clunk and a scrape.
      a.blip(out, t0, 220, 0.5, 0.08, 0.2, 'square');
      hiss(a, out, t0 + 0.02, 3000, 1.5, [
        [0.01, 0.05],
        [0.12, 0],
      ]);
      return;
    case 'full':
      // The nozzle's automatic cut-off: a sharp clack.
      a.blip(out, t0, 900, 0.3, 0.04, 0.22, 'square');
      a.blip(out, t0 + 0.05, 300, 0.6, 0.06, 0.12, 'square');
      return;
    case 'beep':
      a.blip(out, t0, 2400, 1, 0.09, 0.06, 'square');
      return;
    case 'till':
      // The drawer springs open, and the bell: ka-ching.
      hiss(a, out, t0, 1800, 1, [
        [0.01, 0.08],
        [0.1, 0],
      ]);
      for (const [f, g] of [
        [2637, 0.07],
        [3951, 0.04],
      ])
        a.blip(out, t0 + 0.08, f, 0.998, 0.9, g, 'sine');
      return;
    case 'chime':
      // The wash says it's starting (or done): two notes up.
      a.blip(out, t0, 784, 1, 0.35, 0.09, 'triangle');
      a.blip(out, t0 + 0.22, 1175, 1, 0.5, 0.09, 'triangle');
      return;
    case 'drip':
      hiss(a, out, t0, 2600, 0.8, [
        [0.02, 0.1],
        [0.3, 0],
      ]);
      return;
  }
}

/** What's running at the station right now (see StationLoops.set). */
export interface StationNoise {
  /** The pumps filling a car, where. */
  pumps: Pos[];
  /** The car wash, if it's going: where, and how much of each of its sounds (0–1). */
  wash: { at: Pos; water: number; brush: number; dryer: number } | null;
}

interface Loop {
  src: AudioScheduledSourceNode[];
  gains: GainNode[];
  pan: PannerNode;
}

/** The pumps' hum and the wash's water, brushes and dryer, kept going while they run. */
export class StationLoops {
  private pumps = new Map<number, Loop>();
  private wash: Loop | null = null;

  constructor(private readonly a: AudioCore) {}

  set(n: StationNoise) {
    const ctx = this.a.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    n.pumps.forEach((at, i) => {
      let l = this.pumps.get(i);
      if (!l) this.pumps.set(i, (l = this.pump(at)));
      place(l.pan, at.x, at.y, at.z);
    });
    for (const [i, l] of this.pumps) {
      if (i < n.pumps.length) continue;
      this.pumps.delete(i);
      this.stop(l, now);
    }
    if (n.wash && !this.wash) this.wash = this.washing(n.wash.at);
    if (!n.wash && this.wash) {
      this.stop(this.wash, now);
      this.wash = null;
    }
    if (n.wash && this.wash) {
      place(this.wash.pan, n.wash.at.x, n.wash.at.y, n.wash.at.z);
      const [water, brush, dryer] = this.wash.gains;
      water.gain.setTargetAtTime(0.16 * n.wash.water, now, 0.25);
      brush.gain.setTargetAtTime(0.14 * n.wash.brush, now, 0.25);
      dryer.gain.setTargetAtTime(0.2 * n.wash.dryer, now, 0.3);
    }
  }

  private stop(l: Loop, now: number) {
    for (const g of l.gains) {
      g.gain.cancelScheduledValues(now);
      g.gain.setTargetAtTime(0, now, 0.12);
    }
    for (const s of l.src) s.stop(now + 0.8);
  }

  /** A pump running: its motor's hum and the fuel gurgling down the hose. */
  private pump(at: Pos): Loop {
    const ctx = this.a.ctx!;
    this.a.count('tank-pump');
    const now = ctx.currentTime;
    const pan = this.a.panner(at, 2, 1.2);
    pan.connect(this.a.ambience);
    const motor = ctx.createOscillator();
    motor.type = 'sawtooth';
    motor.frequency.value = 98;
    const hum = ctx.createGain();
    envelope(hum.gain, now, [
      [0.15, 0.035],
      [0.3, 0.025],
    ]);
    motor.connect(biquad(ctx, 'lowpass', 420, 1)).connect(hum).connect(pan);
    const flow = this.a.noise(this.a.buf.gurgle, true);
    const flowGain = ctx.createGain();
    envelope(flowGain.gain, now, [
      [0.4, 0.07],
      [0.5, 0.06],
    ]);
    flow.connect(biquad(ctx, 'bandpass', 600, 1.2)).connect(flowGain).connect(pan);
    motor.start(now);
    flow.start(now);
    return { src: [motor, flow], gains: [hum, flowGain], pan };
  }

  /** The car wash: water hissing, brushes slapping round, the dryer's roar, each faded in as it's needed. */
  private washing(at: Pos): Loop {
    const ctx = this.a.ctx!;
    this.a.count('tank-wash');
    const now = ctx.currentTime;
    const pan = this.a.panner(at, 4, 1);
    pan.connect(this.a.ambience);
    const mk = () => {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(pan);
      return g;
    };
    const water = mk();
    const w = this.a.noise(this.a.buf.white, true);
    w.connect(biquad(ctx, 'bandpass', 3200, 0.7)).connect(water);
    // The brushes: low noise thrumming at the rate they go round, and their motor.
    const brush = mk();
    const b = this.a.noise(this.a.buf.white, true);
    const thrum = ctx.createGain();
    thrum.gain.value = 0.6;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 7;
    const depth = ctx.createGain();
    depth.gain.value = 0.4;
    lfo.connect(depth).connect(thrum.gain);
    b.connect(biquad(ctx, 'lowpass', 700, 1.4)).connect(thrum).connect(brush);
    const whine = ctx.createOscillator();
    whine.type = 'triangle';
    whine.frequency.value = 180;
    const whineGain = ctx.createGain();
    whineGain.gain.value = 0.25;
    whine.connect(whineGain).connect(brush);
    // The dryer: a big fan, broad and loud.
    const dryer = mk();
    const d = this.a.noise(this.a.buf.white, true);
    d.connect(biquad(ctx, 'lowpass', 1600, 0.6)).connect(dryer);
    const fan = ctx.createOscillator();
    fan.type = 'sawtooth';
    fan.frequency.value = 62;
    const fanGain = ctx.createGain();
    fanGain.gain.value = 0.2;
    fan.connect(biquad(ctx, 'lowpass', 300, 1)).connect(fanGain).connect(dryer);
    const src = [w, b, lfo, whine, d, fan];
    for (const s of src) s.start(now);
    return { src, gains: [water, brush, dryer], pan };
  }
}
