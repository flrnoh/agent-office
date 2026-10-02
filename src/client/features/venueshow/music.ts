import { chordOf, mixAt, mixStep, rootOf, type MixPos } from '../../../shared/venueshow-mix';
import type { HouseStyle } from '../../../shared/venueshow';
import { biquad } from '../../sound/dsp';
import { buffers, mtof } from '../../sound/music';

// The SCHALLWERK's house mix, played (flrnoh fork, see FORK.md "The show"): what the DJ booth plays
// by itself when nobody puts a set on, synthesized like the roof's house DJ (client/dnb.ts), in one
// of three styles: a deep house groove with its offbeat bass and minor-seventh stabs, a rolling
// techno one, a nu disco one with octave bass and strings. Where it is comes from the office's clock
// (shared/venueshow-mix.ts), so everyone in the house hears the same bar and the crowd and the lights
// move on it. No one's records: every note is worked out here.

const LOOKAHEAD = 0.3;
/** The minor scale's steps from the root. */
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const scale = (root: number, degree: number) => root + MINOR[((degree % 7) + 7) % 7] + 12 * Math.floor(degree / 7);

export class HouseMix {
  /** Audio-clock time minus mix time. */
  private offset = NaN;
  private next = -1;
  private readonly out: GainNode;
  private readonly master: DynamicsCompressorNode;
  private readonly drums: GainNode;
  private readonly synths: BiquadFilterNode;
  private readonly duck: GainNode;
  private readonly room: ConvolverNode;
  private readonly echo: DelayNode;
  private stopped = false;
  /** How many notes so far, for quick checks from the console. */
  notes = 0;

  constructor(
    private readonly ctx: AudioContext,
    dest: AudioNode,
  ) {
    this.out = ctx.createGain();
    this.out.gain.setValueAtTime(0, ctx.currentTime);
    this.out.gain.linearRampToValueAtTime(0.85, ctx.currentTime + 1.5);
    this.out.connect(dest);
    this.master = ctx.createDynamicsCompressor();
    this.master.threshold.value = -14;
    this.master.ratio.value = 4;
    this.master.attack.value = 0.004;
    this.master.release.value = 0.15;
    this.master.connect(this.out);
    this.room = ctx.createConvolver();
    this.room.buffer = buffers(ctx).room;
    const wet = ctx.createGain();
    wet.gain.value = 0.35;
    this.room.connect(wet).connect(this.master);
    this.drums = ctx.createGain();
    this.drums.gain.value = 0.9;
    this.drums.connect(this.master);
    // The synths go through a filter that opens in the builds, and duck under every kick.
    this.duck = ctx.createGain();
    this.duck.connect(this.master);
    this.synths = biquad(ctx, 'lowpass', 2400, 0.9);
    this.synths.connect(this.duck);
    this.synths.connect(this.room);
    this.echo = ctx.createDelay(1.5);
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    const echoLevel = ctx.createGain();
    echoLevel.gain.value = 0.3;
    this.echo.connect(fb).connect(this.echo);
    this.echo.connect(echoLevel).connect(this.synths);
  }

  /** Schedules what's coming up, at office time `officeMs`. */
  tick(style: HouseStyle, dropAt: number, officeMs: number) {
    const ctx = this.ctx;
    if (this.stopped || ctx.state !== 'running') return;
    const p0 = mixAt(style, dropAt, officeMs);
    const sx = p0.beatLen / 4;
    const at = p0.at;
    const offset = ctx.currentTime - at;
    if (!(Math.abs(offset - this.offset) < 0.03)) {
      if (!(Math.abs(offset - this.offset) < 0.5)) this.next = -1;
      this.offset = offset;
    }
    if (this.next < 0 || Math.abs(this.next * sx - at) > 2) this.next = Math.ceil(at / sx);
    this.echo.delayTime.value = sx * 3;
    for (; this.next * sx < at + LOOKAHEAD; this.next++) {
      const t = this.next * sx;
      if (t < at - 0.02) continue;
      const when = Math.max(ctx.currentTime, t + this.offset);
      const p = mixAt(style, dropAt, officeMs + (t - at) * 1000);
      this.play(style, p, when);
    }
  }

  private play(style: HouseStyle, p: MixPos, when: number) {
    const st = mixStep(style, p);
    const sx = p.beatLen / 4;
    if (p.step === 0) {
      // The synths' filter: closed in the intro, opening through a build, wide in the drop, dark in the breakdown.
      const f = p.part === 'drop' ? 5200 : p.part === 'build' ? 600 + 5000 * p.rise ** 2 : p.part === 'breakdown' ? 900 : 700 + 1600 * (p.partBar / p.partBars);
      this.synths.frequency.setTargetAtTime(f, when, 0.25);
    }
    if (st.kick) this.kick(when, st.kick, style);
    if (st.clap) this.clap(when, st.clap);
    if (st.hat) this.hat(when, st.hat, false);
    if (st.openHat) this.hat(when, st.openHat, true);
    if (st.roll) this.snare(when, st.roll);
    if (st.crash) this.crash(when);
    const root = rootOf(p.bar);
    const chord = chordOf(p.bar);
    if (st.bass) {
      const oct = style === 'disco' && p.step % 4 === 2 ? 12 : 0;
      const note = scale(root, chord) + oct + (style === 'techno' && p.step % 8 === 7 ? 7 : 0);
      this.bass(when, note, style === 'techno' ? sx * 0.8 : sx * 1.6, style);
    }
    if (st.stab) this.stab(when, [0, 2, 4, 6].map((i) => scale(root + 24, chord + i)), style === 'disco' ? sx * 1.5 : sx * 0.9, style);
    if (st.pad) this.pad(when, [0, 2, 4, 6].map((i) => scale(root + 24, chord + i)), p.beatLen * (p.part === 'breakdown' ? 8 : 4));
    if (p.part === 'build' && p.step === 0 && p.partBar === 0) this.riser(when, p.beatLen * 4 * p.partBars);
  }

  // ---- The voices ------------------------------------------------------------------------------------

  private kick(when: number, v: number, style: HouseStyle) {
    const c = this.ctx;
    const o = c.createOscillator();
    const g = c.createGain();
    const len = style === 'techno' ? 0.42 : 0.32;
    o.frequency.setValueAtTime(style === 'techno' ? 170 : 140, when);
    o.frequency.exponentialRampToValueAtTime(46, when + 0.09);
    o.frequency.exponentialRampToValueAtTime(40, when + len);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(0.95 * v, when + 0.004);
    g.gain.exponentialRampToValueAtTime(0.001, when + len);
    o.connect(g).connect(this.drums);
    o.start(when);
    o.stop(when + len + 0.02);
    // Everything else ducks under it.
    this.duck.gain.cancelScheduledValues(when);
    this.duck.gain.setValueAtTime(0.35, when);
    this.duck.gain.linearRampToValueAtTime(1, when + 0.2);
    this.notes++;
  }

  private noise(when: number, len: number, type: BiquadFilterType, freq: number, q: number, level: number, dest: AudioNode = this.drums, decay = len) {
    const c = this.ctx;
    const n = c.createBufferSource();
    n.buffer = buffers(c).noise;
    const f = biquad(c, type, freq, q);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(level, when + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0008, when + decay);
    n.connect(f).connect(g).connect(dest);
    n.start(when, Math.random() * 2);
    n.stop(when + len + 0.02);
  }

  private clap(when: number, v: number) {
    // Three hands not quite together, and the room's tail.
    for (const d of [0, 0.011, 0.022]) this.noise(when + d, 0.03, 'bandpass', 1300, 1.2, 0.35 * v);
    this.noise(when + 0.03, 0.2, 'bandpass', 1200, 0.9, 0.22 * v, this.drums, 0.18);
    this.noise(when + 0.03, 0.2, 'bandpass', 1200, 0.9, 0.12 * v, this.room, 0.2);
  }

  private hat(when: number, v: number, open: boolean) {
    this.noise(when, open ? 0.22 : 0.05, 'highpass', open ? 7500 : 9000, 0.8, (open ? 0.12 : 0.09) * v, this.drums, open ? 0.2 : 0.04);
  }

  private snare(when: number, v: number) {
    this.noise(when, 0.12, 'bandpass', 1900, 0.8, 0.26 * v, this.drums, 0.11);
  }

  private crash(when: number) {
    this.noise(when, 2.2, 'highpass', 5000, 0.5, 0.16, this.drums, 2.0);
    this.noise(when, 2.2, 'highpass', 5000, 0.5, 0.08, this.room, 2.0);
  }

  private riser(when: number, len: number) {
    const c = this.ctx;
    const n = c.createBufferSource();
    n.buffer = buffers(c).noise;
    n.loop = true;
    const f = biquad(c, 'bandpass', 400, 2.5);
    f.frequency.setValueAtTime(400, when);
    f.frequency.exponentialRampToValueAtTime(7000, when + len);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(0.12, when + len * 0.95);
    g.gain.linearRampToValueAtTime(0, when + len);
    n.connect(f).connect(g).connect(this.master);
    n.start(when);
    n.stop(when + len + 0.05);
  }

  private bass(when: number, note: number, len: number, style: HouseStyle) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = style === 'disco' ? 'square' : 'sawtooth';
    o.frequency.value = mtof(note);
    const f = biquad(c, 'lowpass', style === 'techno' ? 700 : 520, style === 'techno' ? 6 : 3);
    f.frequency.setValueAtTime(style === 'techno' ? 1600 : 1100, when);
    f.frequency.exponentialRampToValueAtTime(220, when + len);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(0.32, when + 0.006);
    g.gain.exponentialRampToValueAtTime(0.001, when + len);
    o.connect(f).connect(g).connect(this.duck);
    o.start(when);
    o.stop(when + len + 0.02);
    this.notes++;
  }

  private stab(when: number, notes: number[], len: number, style: HouseStyle) {
    const c = this.ctx;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(style === 'disco' ? 0.05 : 0.07, when + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, when + len);
    g.connect(this.synths);
    if (style === 'techno') g.connect(this.echo);
    for (const n of style === 'techno' ? notes.slice(0, 1) : notes) {
      for (const det of [-9, 9]) {
        const o = c.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = mtof(n + (style === 'techno' ? 12 : 0));
        o.detune.value = det;
        o.connect(g);
        o.start(when);
        o.stop(when + len + 0.02);
      }
    }
    this.notes++;
  }

  private pad(when: number, notes: number[], len: number) {
    const c = this.ctx;
    const g = c.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(0.035, when + len * 0.3);
    g.gain.linearRampToValueAtTime(0, when + len);
    g.connect(this.synths);
    g.connect(this.room);
    for (const n of notes) {
      for (const det of [-6, 7]) {
        const o = c.createOscillator();
        o.type = 'triangle';
        o.frequency.value = mtof(n);
        o.detune.value = det;
        o.connect(g);
        o.start(when);
        o.stop(when + len + 0.05);
      }
    }
  }

  /** Fades out and lets go. */
  stop() {
    if (this.stopped) return;
    this.stopped = true;
    const now = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(now);
    this.out.gain.setValueAtTime(this.out.gain.value, now);
    this.out.gain.linearRampToValueAtTime(0, now + 0.8);
    setTimeout(() => this.out.disconnect(), 1500);
  }
}
