import type { AudioCore } from './core';
import { biquad, envelope, place } from './dsp';
import { hiss } from './hiss';
import type { Pos } from './places';

// ---- DER BRECHER, the roller coaster round the tower (flrnoh fork, see client/coaster/ride.ts) ------
// All synthesized, on the effects volume: the wind past a rider's ears and the rails' rumble rising with
// the speed, the lift chains' clack-clack-clack, screams from the cars on the drop and the loop, the
// photo's flash, the station's bell and the brakes' hiss. Riding, it's in your own ears; otherwise it
// comes from the train, as far off as it is.

export type CoasterSoundKind = 'scream' | 'flash' | 'bell' | 'brakes' | 'bars' | 'count' | 'go';

export interface CoasterFrame {
  /** You're riding (in your own ears), or the train's at `at` (from there). */
  riding: boolean;
  at: Pos;
  /** How fast the train goes (m/s), and whether it's on a chain (clacking) or in the tube (echoing). */
  speed: number;
  chain: boolean;
  tube: boolean;
}

/** One-shots: a scream (pitch `pitch` 0..1, one voice of several), the flash, the bell, the brakes, the lap bars. */
export function coasterSound(a: AudioCore, kind: CoasterSoundKind, at?: Pos, pitch = 0.5) {
  const ctx = a.ctx;
  if (!ctx) return;
  a.count(`coaster.${kind}`);
  const out: AudioNode = at ? a.panner(at, 6, 1) : a.alerts;
  if (at) out.connect(a.alerts);
  const t0 = ctx.currentTime + 0.01;
  if (kind === 'scream') {
    // A voice: a buzzing source through the formants of an open "aaa", sliding up, wavering, falling away.
    const len = 1.3 + pitch * 0.9;
    const f0 = 380 + pitch * 420;
    const src = ctx.createOscillator();
    src.type = 'sawtooth';
    src.frequency.setValueAtTime(f0 * 0.85, t0);
    src.frequency.exponentialRampToValueAtTime(f0 * 1.15, t0 + 0.25);
    src.frequency.exponentialRampToValueAtTime(f0 * 0.7, t0 + len);
    const vib = ctx.createOscillator();
    vib.frequency.value = 5.5 + pitch * 2;
    const depth = ctx.createGain();
    depth.gain.value = f0 * 0.035;
    vib.connect(depth).connect(src.frequency);
    const g = ctx.createGain();
    envelope(g.gain, t0, [
      [0.08, 0.16],
      [len * 0.6, 0.12],
      [len, 0],
    ]);
    for (const [f, q, lvl] of [
      [820, 6, 1],
      [1220, 8, 0.6],
      [2850, 10, 0.25],
    ] as const) {
      const bp = biquad(ctx, 'bandpass', f * (0.9 + pitch * 0.25), q);
      const lg = ctx.createGain();
      lg.gain.value = lvl;
      src.connect(bp).connect(lg).connect(g);
    }
    g.connect(out);
    hiss(a, out, t0, 2600, 0.8, [
      [0.05, 0.03],
      [len, 0],
    ]);
    src.start(t0);
    vib.start(t0);
    src.stop(t0 + len + 0.05);
    vib.stop(t0 + len + 0.05);
  } else if (kind === 'flash') {
    // The flash's pop and its capacitor's whine winding back up.
    hiss(a, out, t0, 3200, 0.7, [
      [0.004, 0.5],
      [0.12, 0],
    ]);
    a.blip(out, t0 + 0.05, 1800, 3.2, 0.7, 0.03, 'sine');
  } else if (kind === 'bell') {
    // The station's two-tone bell: it's off.
    for (const [dt, f] of [
      [0, 1318],
      [0.22, 1046],
    ] as const) {
      a.blip(out, t0 + dt, f, 1, 0.7, 0.13, 'triangle');
      a.blip(out, t0 + dt, f * 2.76, 1, 0.3, 0.03, 'sine');
    }
  } else if (kind === 'brakes') {
    // The magnetic brakes' moan, and the air letting off.
    a.blip(out, t0, 220, 0.4, 1.4, 0.08, 'sawtooth');
    hiss(a, out, t0 + 0.4, 5000, 0.6, [
      [0.05, 0.12],
      [0.9, 0],
    ]);
  } else if (kind === 'bars') {
    // The lap bars locking: a row of clunks.
    for (let i = 0; i < 4; i++) {
      a.blip(out, t0 + i * 0.07, 140, 0.6, 0.12, 0.12, 'square');
      hiss(a, out, t0 + i * 0.07, 1800, 2, [
        [0.003, 0.08],
        [0.06, 0],
      ]);
    }
  } else if (kind === 'count') a.blip(out, t0, 740, 1, 0.12, 0.07, 'square');
  else a.blip(out, t0, 1110, 1, 0.45, 0.08, 'square');
}

/** What runs while the train moves: the wind, the rumble, the chain. */
export class CoasterLoops {
  private nodes: { wind: AudioBufferSourceNode; windBand: BiquadFilterNode; windGain: GainNode; rumble: AudioBufferSourceNode; rumbleLow: BiquadFilterNode; rumbleGain: GainNode; pan: PannerNode; direct: GainNode; far: GainNode } | null = null;
  private nextClack = 0;

  constructor(private readonly a: AudioCore) {}

  /** Each frame while the train's somewhere you'd hear it; null: quiet. */
  set(f: CoasterFrame | null) {
    const ctx = this.a.ctx;
    if (!ctx) return;
    if (!f) {
      if (this.nodes) {
        const n = this.nodes;
        const now = ctx.currentTime;
        n.windGain.gain.setTargetAtTime(0, now, 0.15);
        n.rumbleGain.gain.setTargetAtTime(0, now, 0.15);
        n.wind.stop(now + 0.8);
        n.rumble.stop(now + 0.8);
        this.nodes = null;
      }
      return;
    }
    if (!this.nodes) {
      this.a.count('coaster.loops');
      const wind = this.a.noise(this.a.buf.white, true);
      const windBand = biquad(ctx, 'bandpass', 500, 0.6);
      const windGain = ctx.createGain();
      windGain.gain.value = 0;
      const rumble = this.a.noise(this.a.buf.brown, true);
      const rumbleLow = biquad(ctx, 'lowpass', 160, 0.9);
      const rumbleGain = ctx.createGain();
      rumbleGain.gain.value = 0;
      const direct = ctx.createGain();
      const far = ctx.createGain();
      const pan = this.a.panner(f.at, 8, 1);
      wind.connect(windBand).connect(windGain).connect(direct);
      rumble.connect(rumbleLow).connect(rumbleGain);
      rumbleGain.connect(direct);
      rumbleGain.connect(far).connect(pan).connect(this.a.alerts);
      direct.connect(this.a.alerts);
      wind.start();
      rumble.start();
      this.nodes = { wind, windBand, windGain, rumble, rumbleLow, rumbleGain, pan, direct, far };
    }
    const n = this.nodes;
    const now = ctx.currentTime;
    const v = Math.max(0, Math.min(1, f.speed / 18));
    place(n.pan, f.at.x, f.at.y, f.at.z);
    n.direct.gain.setTargetAtTime(f.riding ? 1 : 0, now, 0.1);
    n.far.gain.setTargetAtTime(f.riding ? 0 : 1, now, 0.1);
    n.windGain.gain.setTargetAtTime(f.riding ? 0.3 * v * v : 0, now, 0.08);
    n.windBand.frequency.setTargetAtTime(280 + 1700 * v, now, 0.1);
    n.rumbleGain.gain.setTargetAtTime((f.riding ? 0.5 : 0.9) * Math.min(1, 0.15 + v) * (f.tube ? 1.4 : 1) * (f.speed > 0.3 ? 1 : 0), now, 0.1);
    n.rumbleLow.frequency.setTargetAtTime((f.tube ? 260 : 150) + 160 * v, now, 0.1);
    // The anti-rollback dogs on the lift: a clack every couple of links.
    if (f.chain && f.speed > 0.5) {
      if (now >= this.nextClack) {
        const out: AudioNode = f.riding ? this.a.alerts : this.a.panner(f.at, 5, 1.1);
        if (!f.riding) out.connect(this.a.alerts);
        this.a.blip(out, now, 210, 0.5, 0.05, f.riding ? 0.18 : 0.3, 'square');
        hiss(this.a, out, now, 2400, 3, [
          [0.002, f.riding ? 0.1 : 0.16],
          [0.04, 0],
        ]);
        this.nextClack = now + 0.55 / Math.max(0.5, f.speed);
      }
    } else this.nextClack = 0;
  }
}
