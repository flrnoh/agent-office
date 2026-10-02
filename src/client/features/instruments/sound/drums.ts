import { DRUM_PIECES } from '../../../../shared/venue';
import type { DrumPiece } from '../../../../shared/instruments-play';
import { filter, hit, metalBuffer, noiseBuffer } from './fx';

// ---- The drum kit (flrnoh fork, see FORK.md "The instruments") ----------------------------------------
// Every piece synthesized when it's hit: the kick a sine diving from a punch down to its boom with the
// beater's click on top, the snare its two shell modes and the wires' hiss, the toms a falling sine
// with a thud, the hats, crash and ride cut from cymbal metal (inharmonic squares) through a band of
// highs, each with its own decay. The open hat is choked by the closed one, as a foot on the pedal
// does. How hard (`vel`) sets how loud and how bright.

export const PIECE_OF: ReadonlyMap<number, DrumPiece> = new Map((Object.entries(DRUM_PIECES) as [DrumPiece, number][]).map(([k, v]) => [v, k]));

export class DrumKit {
  private readonly noise: AudioBuffer;
  private readonly metal: AudioBuffer;
  /** The open hat ringing on each kit (by its output), to choke. */
  private openHat = new WeakMap<AudioNode, GainNode>();

  constructor(private readonly ctx: BaseAudioContext) {
    this.noise = noiseBuffer(ctx, 2);
    this.metal = metalBuffer(ctx);
  }

  /** Plays `piece` into `out` at `t`, `vel` 0..1. */
  play(out: AudioNode, piece: DrumPiece, vel: number, t: number) {
    const v = Math.max(0.05, Math.min(1, vel));
    switch (piece) {
      case 'kick':
        return this.kick(out, v, t);
      case 'snare':
        return this.snare(out, v, t);
      case 'hihat':
        return this.hat(out, v, t, false);
      case 'openhat':
        return this.hat(out, v, t, true);
      case 'tomHi':
        return this.tom(out, v, t, 196, 0.32);
      case 'tomMid':
        return this.tom(out, v, t, 147, 0.4);
      case 'tomLow':
        return this.tom(out, v, t, 98, 0.55);
      case 'crash':
        return this.crash(out, v, t);
      case 'ride':
        return this.ride(out, v, t);
    }
  }

  /** The drummer's sticks clicked together (a count-in). */
  sticks(out: AudioNode, t: number, accent: boolean) {
    const g = hit(this.ctx, t, accent ? 0.55 : 0.4, 0.0008, 0.018);
    const bp = filter(this.ctx, 'bandpass', accent ? 2600 : 2300, 3.5);
    this.noiseAt(t, 0.12, bp);
    bp.connect(g).connect(out);
    const ping = this.ctx.createOscillator();
    ping.frequency.value = accent ? 1850 : 1650;
    const pg = hit(this.ctx, t, 0.18, 0.0005, 0.012);
    ping.connect(pg).connect(out);
    ping.start(t);
    ping.stop(t + 0.1);
  }

  private noiseAt(t: number, len: number, dest: AudioNode, buf = this.noise) {
    const n = this.ctx.createBufferSource();
    n.buffer = buf;
    n.connect(dest);
    n.start(t, Math.random() * (buf.duration - len - 0.05), len);
    return n;
  }

  private osc(type: OscillatorType, f: number, t: number, len: number, dest: AudioNode) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    o.connect(dest);
    o.start(t);
    o.stop(t + len);
    return o;
  }

  private kick(out: AudioNode, v: number, t: number) {
    const ctx = this.ctx;
    // The boom: a sine falling from the punch to the shell's note.
    const body = hit(ctx, t, 1.05 * v, 0.0015, 0.16 + v * 0.06);
    const o = this.osc('sine', 165 + v * 40, t, 0.9, body);
    o.frequency.exponentialRampToValueAtTime(62, t + 0.035);
    o.frequency.exponentialRampToValueAtTime(46, t + 0.32);
    // A touch of saturation, as a miked kick through the desk has.
    const sat = ctx.createWaveShaper();
    const curve = new Float32Array(new ArrayBuffer(1024 * 4));
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      curve[i] = Math.tanh(x * 1.8) / Math.tanh(1.8);
    }
    sat.curve = curve;
    body.connect(sat).connect(out);
    // The beater on the head: a click and a slap.
    const click = hit(ctx, t, 0.35 * v * v + 0.05, 0.0004, 0.004);
    const hp = filter(ctx, 'highpass', 1400, 0.7);
    this.noiseAt(t, 0.04, hp);
    hp.connect(click).connect(out);
    const slap = hit(ctx, t, 0.25 * v, 0.0005, 0.012);
    this.osc('triangle', 380, t, 0.06, slap).frequency.exponentialRampToValueAtTime(140, t + 0.03);
    slap.connect(out);
  }

  private snare(out: AudioNode, v: number, t: number) {
    const ctx = this.ctx;
    // The shell: two modes of the drum, the lower falling a little as the head settles.
    const b1 = hit(ctx, t, 0.5 * v, 0.001, 0.045 + v * 0.03);
    this.osc('triangle', 190, t, 0.3, b1).frequency.exponentialRampToValueAtTime(168, t + 0.06);
    b1.connect(out);
    const b2 = hit(ctx, t, 0.22 * v, 0.001, 0.03);
    this.osc('sine', 335, t, 0.2, b2);
    b2.connect(out);
    // The wires: bright hiss with a body, longer the harder it's hit.
    const wires = hit(ctx, t, 0.62 * v, 0.0012, 0.05 + v * 0.07);
    const hp = filter(ctx, 'highpass', 1200, 0.6);
    const peak = filter(ctx, 'peaking', 4800, 0.9, 5);
    const air = filter(ctx, 'lowpass', 6000 + v * 7000, 0.5);
    this.noiseAt(t, 0.6, hp);
    hp.connect(peak).connect(air).connect(wires).connect(out);
    // The stick on the rim, hit hard.
    if (v > 0.85) {
      const crack = hit(ctx, t, 0.3, 0.0004, 0.008);
      this.osc('square', 900, t, 0.05, filter(ctx, 'bandpass', 1800, 2)).connect(crack);
      crack.connect(out);
    }
  }

  private tom(out: AudioNode, v: number, t: number, f: number, decay: number) {
    const ctx = this.ctx;
    const body = hit(ctx, t, 0.85 * v, 0.0015, decay * (0.75 + v * 0.35));
    const o = this.osc('sine', f * 1.45, t, decay * 5, body);
    o.frequency.exponentialRampToValueAtTime(f * 1.08, t + 0.03);
    o.frequency.exponentialRampToValueAtTime(f, t + decay);
    body.connect(out);
    // The second mode, and the stick's thud on the head.
    const over = hit(ctx, t, 0.18 * v, 0.001, decay * 0.35);
    this.osc('sine', f * 2.3, t, decay * 2, over);
    over.connect(out);
    const thud = hit(ctx, t, 0.3 * v, 0.0008, 0.02);
    const lp = filter(ctx, 'bandpass', f * 6, 1.2);
    this.noiseAt(t, 0.1, lp);
    lp.connect(thud).connect(out);
  }

  private hat(out: AudioNode, v: number, t: number, open: boolean) {
    const ctx = this.ctx;
    // A closed hat (or the pedal coming down) chokes the open one.
    const ringing = this.openHat.get(out);
    if (ringing) {
      ringing.gain.cancelScheduledValues(t);
      ringing.gain.setTargetAtTime(0, t, 0.012);
      this.openHat.delete(out);
    }
    const g = hit(ctx, t, (open ? 0.32 : 0.36) * v, 0.0008, open ? 0.32 : 0.022 + v * 0.018);
    const bp = filter(ctx, 'bandpass', 9500, 0.9);
    const hp = filter(ctx, 'highpass', 6800 - v * 1200, 0.7);
    this.noiseAt(t, open ? 1.6 : 0.25, bp, this.metal);
    bp.connect(hp).connect(g).connect(out);
    // The stick's tick on the top cymbal.
    const tick = hit(ctx, t, 0.12 * v, 0.0004, 0.004);
    const th = filter(ctx, 'highpass', 5000);
    this.noiseAt(t, 0.03, th);
    th.connect(tick).connect(out);
    if (open) this.openHat.set(out, g);
  }

  private crash(out: AudioNode, v: number, t: number) {
    const ctx = this.ctx;
    const g = hit(ctx, t, 0.36 * v, 0.002, 0.75 + v * 0.5);
    const hp = filter(ctx, 'highpass', 3600, 0.6);
    const shimmer = filter(ctx, 'peaking', 8500, 0.8, 4);
    this.noiseAt(t, 2.9, hp, this.metal);
    hp.connect(shimmer).connect(g).connect(out);
    // The wash: noise on top, its highs going first.
    const wash = hit(ctx, t, 0.22 * v, 0.003, 0.9);
    const wf = filter(ctx, 'lowpass', 12000, 0.5);
    wf.frequency.setTargetAtTime(5000, t, 0.6);
    const wh = filter(ctx, 'highpass', 2500);
    this.noiseAt(t, 1.9, wh);
    wh.connect(wf).connect(wash).connect(out);
  }

  private ride(out: AudioNode, v: number, t: number) {
    const ctx = this.ctx;
    // The ping: the stick's tip on the bow, a bell-like tone over the metal's wash.
    const ping = hit(ctx, t, 0.16 * v, 0.0008, 0.09);
    for (const [f, a] of [
      [3150, 1],
      [4720, 0.6],
      [6280, 0.35],
    ] as const) {
      const pg = ctx.createGain();
      pg.gain.value = a;
      this.osc('sine', f, t, 0.6, pg);
      pg.connect(ping);
    }
    ping.connect(out);
    const g = hit(ctx, t, 0.2 * v, 0.0015, 0.6 + v * 0.3);
    const bp = filter(ctx, 'bandpass', 7200, 0.7);
    this.noiseAt(t, 2.2, bp, this.metal);
    bp.connect(g).connect(out);
  }
}
