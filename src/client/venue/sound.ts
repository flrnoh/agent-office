import type { AudioCore } from '../sound/core';
import { biquad, envelope, rand } from '../sound/dsp';
import { hiss } from '../sound/hiss';

// ---- flrnoh fork: the Schallwerk's sounds (see FORK.md "The Schallwerk") -----------------------------

export type VenueSoundKind =
  | 'door'
  | 'stamp'
  | 'coat'
  | 'merch'
  | 'shutter'
  | 'pour'
  | 'fridge'
  | 'till'
  | 'click'
  | 'club'
  | 'konzert'
  | 'co2'
  | 'konfetti'
  | 'funken'
  | 'nebel'
  | 'announce';

/** A low thump: a sine dropping fast. */
function thump(a: AudioCore, out: AudioNode, t0: number, from: number, to: number, len: number, gain: number) {
  const ctx = a.ctx!;
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(from, t0);
  o.frequency.exponentialRampToValueAtTime(to, t0 + len);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
  o.connect(g).connect(out);
  o.start(t0);
  o.stop(t0 + len + 0.05);
}

/** A tone gliding, shaped by `points`. */
function glide(a: AudioCore, out: AudioNode, t0: number, type: OscillatorType, from: number, to: number, points: [number, number][]) {
  const ctx = a.ctx!;
  const o = ctx.createOscillator();
  o.type = type;
  const end = points[points.length - 1][0];
  o.frequency.setValueAtTime(from, t0);
  o.frequency.exponentialRampToValueAtTime(to, t0 + end);
  const g = ctx.createGain();
  envelope(g.gain, t0, points);
  o.connect(g).connect(out);
  o.start(t0);
  o.stop(t0 + end + 0.05);
}

/**
 * The Schallwerk's: its heavy doors (a push bar's clack, the crowd's roar through them), the box
 * office's stamp, a coat on a hanger, a merch bag, the photo booth's shutter, a beer from the tap, the
 * rider fridge, the till, the light desk's buttons, the house switching to a club (a bass drop and a
 * riser) or a concert (a crowd's cheer swelling), the CO₂ jets' blast, the confetti cannons' pop and
 * flutter, the sparkler fountains' crackle, the haze machine's hiss, the PA's announcement chime.
 * On the effects' volume.
 */
export function venueSound(a: AudioCore, kind: VenueSoundKind) {
  a.unlock();
  const ctx = a.ctx;
  if (!ctx) return;
  a.count(`venue.${kind}`);
  const t0 = ctx.currentTime + 0.02;
  const out = ctx.createGain();
  out.connect(a.alerts);
  switch (kind) {
    case 'door':
      // The push bar, the door swinging, the hall's noise rushing out and cut off again.
      hiss(a, out, t0, 2400, 4, [
        [0.003, 0.14],
        [0.04, 0],
      ]);
      thump(a, out, t0 + 0.02, 160, 70, 0.25, 0.35);
      hiss(a, out, t0 + 0.08, 700, 0.6, [
        [0.15, 0.08],
        [0.6, 0.05],
        [0.9, 0],
      ]);
      thump(a, out, t0 + 0.85, 120, 55, 0.3, 0.4);
      return;
    case 'stamp':
      // The stamp on the pad, then on your hand.
      thump(a, out, t0, 300, 120, 0.08, 0.35);
      hiss(a, out, t0, 1800, 2, [
        [0.003, 0.08],
        [0.03, 0],
      ]);
      thump(a, out, t0 + 0.35, 220, 90, 0.1, 0.45);
      return;
    case 'coat':
      // Fabric, the hanger on the rail.
      hiss(a, out, t0, 3000, 0.8, [
        [0.08, 0.06],
        [0.35, 0],
      ]);
      a.clink(out, t0 + 0.35, 2400, 0.3);
      a.clink(out, t0 + 0.42, 3100, 0.2);
      return;
    case 'merch':
      // A plastic bag rustling, the card reader's beep.
      for (let i = 0; i < 6; i++)
        hiss(a, out, t0 + i * rand(0.04, 0.09), rand(3000, 6000), 2, [
          [0.01, 0.06],
          [0.06, 0],
        ]);
      a.blip(out, t0 + 0.55, 1760, 1, 0.12, 0.08, 'square');
      return;
    case 'shutter':
      hiss(a, out, t0, 4500, 3, [
        [0.002, 0.25],
        [0.02, 0],
      ]);
      hiss(a, out, t0 + 0.07, 3200, 3, [
        [0.002, 0.18],
        [0.03, 0],
      ]);
      a.blip(out, t0 + 0.12, 3200, 1.6, 0.4, 0.03, 'triangle');
      return;
    case 'pour':
      hiss(a, out, t0, 1500, 1.2, [
        [0.05, 0.07],
        [1.1, 0.05],
        [1.3, 0],
      ]);
      glide(a, out, t0, 'sine', 320, 720, [
        [0.1, 0.02],
        [1.1, 0.02],
        [1.3, 0],
      ]);
      a.clink(out, t0 + 1.35, 2800, 0.3);
      return;
    case 'fridge':
      // The seal letting go, the hum, a bottle clinking out.
      hiss(a, out, t0, 900, 1, [
        [0.02, 0.1],
        [0.15, 0],
      ]);
      glide(a, out, t0 + 0.05, 'square', 98, 100, [
        [0.2, 0.01],
        [0.9, 0.01],
        [1.1, 0],
      ]);
      a.clink(out, t0 + 0.4, 2200, 0.35);
      a.clink(out, t0 + 0.5, 1700, 0.25);
      return;
    case 'till':
      for (let i = 0; i < 3; i++)
        hiss(a, out, t0 + i * 0.08, 2600, 3, [
          [0.002, 0.1],
          [0.03, 0],
        ]);
      for (const f of [2093, 2637, 3136]) a.blip(out, t0 + 0.32, f, 1, 1.1, 0.04);
      return;
    case 'click':
      hiss(a, out, t0, 3800, 4, [
        [0.002, 0.12],
        [0.02, 0],
      ]);
      return;
    case 'club': {
      // The big switch, the bass dropping into the floor, a riser of white noise over it.
      hiss(a, out, t0, 3200, 2, [
        [0.003, 0.15],
        [0.04, 0],
      ]);
      const f = biquad(ctx, 'lowpass', 2200, 5);
      f.frequency.setValueAtTime(2200, t0 + 0.1);
      f.frequency.exponentialRampToValueAtTime(80, t0 + 1.6);
      const saw = ctx.createOscillator();
      saw.type = 'sawtooth';
      saw.frequency.setValueAtTime(180, t0 + 0.1);
      saw.frequency.exponentialRampToValueAtTime(36, t0 + 1.5);
      const g = ctx.createGain();
      envelope(g.gain, t0 + 0.1, [
        [0.03, 0.25],
        [1.0, 0.18],
        [1.8, 0],
      ]);
      saw.connect(f).connect(g).connect(out);
      saw.start(t0 + 0.1);
      saw.stop(t0 + 2);
      thump(a, out, t0 + 0.1, 95, 30, 1.6, 0.8);
      hiss(a, out, t0 + 0.8, 6000, 0.7, [
        [0.8, 0.06],
        [1.2, 0],
      ]);
      return;
    }
    case 'konzert':
      // The house lights coming down: a crowd's cheer swelling and settling.
      hiss(a, out, t0, 1100, 0.7, [
        [0.6, 0.12],
        [1.6, 0.09],
        [2.6, 0],
      ]);
      hiss(a, out, t0 + 0.2, 2600, 1.2, [
        [0.5, 0.06],
        [1.5, 0.04],
        [2.4, 0],
      ]);
      for (let i = 0; i < 6; i++) glide(a, out, t0 + rand(0.2, 1.2), 'triangle', rand(600, 900), rand(1000, 1400), [
          [0.05, 0.015],
          [0.35, 0],
        ]);
      return;
    case 'co2':
      // A pressurised blast, long and white.
      hiss(a, out, t0, 1800, 0.4, [
        [0.02, 0.35],
        [0.9, 0.22],
        [1.6, 0],
      ]);
      hiss(a, out, t0, 300, 0.6, [
        [0.03, 0.25],
        [1.2, 0],
      ]);
      return;
    case 'konfetti':
      thump(a, out, t0, 140, 50, 0.3, 0.7);
      hiss(a, out, t0, 1600, 0.8, [
        [0.005, 0.3],
        [0.12, 0],
      ]);
      // The paper fluttering down.
      for (let i = 0; i < 30; i++)
        hiss(a, out, t0 + 0.3 + rand(0, 4), rand(3500, 7000), 3, [
          [0.01, 0.025],
          [0.06, 0],
        ]);
      return;
    case 'funken':
      // The fountains firing: a fizzing hiss and crackles all through it.
      hiss(a, out, t0, 5200, 0.6, [
        [0.08, 0.12],
        [3.2, 0.1],
        [3.6, 0],
      ]);
      for (let i = 0; i < 40; i++)
        hiss(a, out, t0 + rand(0, 3.4), rand(2500, 7000), 5, [
          [0.002, 0.12],
          [0.012, 0],
        ]);
      return;
    case 'nebel':
      hiss(a, out, t0, 900, 0.5, [
        [0.2, 0.1],
        [2.5, 0.08],
        [3.5, 0],
      ]);
      return;
    case 'announce':
      // The PA's chime: ding-dong-ding.
      for (const [dt, f] of [
        [0, 784],
        [0.45, 659],
        [0.9, 523],
      ] as const)
        a.blip(out, t0 + dt, f, 1, 1.4, 0.09, 'sine');
  }
}

/**
 * The Schallwerk's air: a crowd talking (louder in the foyer, a hum of it in the hall), glasses
 * clinking at the bar now and then, and the hall's own room tone, a low hum of the PA and the air
 * conditioning. Kept up every frame while you're inside (set); without a call it fades away by itself.
 * `crowd` is how many people are in (0..1), `foyer` how close to the foyer you are, `bar` to the bar.
 */
export class VenueAmbience {
  private bus: { gain: GainNode; murmur: GainNode; hum: GainNode; bar: GainNode } | null = null;
  private nextClink = 0;
  private nextLaugh = 0;

  constructor(private readonly a: AudioCore) {}

  set(crowd: number, foyer: number, bar: number) {
    const a = this.a;
    const ctx = a.ctx;
    if (!ctx) return;
    if (!this.bus) {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(a.ambience);
      const murmur = ctx.createGain();
      murmur.gain.value = 0.05;
      const src = a.noise(a.buf.brown, true);
      const chatter = a.noise(a.buf.white, true);
      const chatterG = ctx.createGain();
      chatterG.gain.value = 0.1;
      const lump = a.noise(a.buf.gurgle, true);
      const lumpDepth = ctx.createGain();
      lumpDepth.gain.value = 0.08;
      lump.connect(lumpDepth).connect(chatterG.gain);
      chatter.connect(biquad(ctx, 'bandpass', 1200, 1.4)).connect(chatterG).connect(murmur);
      src.connect(biquad(ctx, 'bandpass', 420, 0.7)).connect(murmur);
      murmur.connect(gain);
      src.start();
      chatter.start();
      lump.start();
      // The room tone: the PA's hiss and the air handling's hum, quiet.
      const hum = ctx.createGain();
      hum.gain.value = 0.02;
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = 50;
      o.connect(hum);
      const air = a.noise(a.buf.brown, true);
      air.connect(biquad(ctx, 'lowpass', 160, 0.7)).connect(hum);
      o.start();
      air.start();
      hum.connect(gain);
      const barG = ctx.createGain();
      barG.gain.value = 0.5;
      barG.connect(gain);
      this.bus = { gain, murmur, hum, bar: barG };
    }
    a.count('venue-ambience');
    const now = ctx.currentTime;
    const g = this.bus.gain.gain;
    g.cancelScheduledValues(now);
    g.setTargetAtTime(1, now, 0.3);
    g.setTargetAtTime(0, now + 0.5, 0.4);
    this.bus.murmur.gain.setTargetAtTime(0.03 + crowd * 0.05 + foyer * 0.05, now, 0.6);
    this.bus.bar.gain.setTargetAtTime(0.15 + bar * 0.85, now, 0.6);
    if (now > this.nextClink) {
      this.nextClink = now + rand(1.2, 4);
      const f = rand(2000, 3400);
      this.a.clink(this.bus.bar, now + 0.05, f, rand(0.1, 0.25));
      if (Math.random() < 0.4) this.a.clink(this.bus.bar, now + 0.12, f * 1.2, rand(0.08, 0.18));
    }
    if (now > this.nextLaugh && crowd > 0.1) {
      // Someone laughing somewhere: a few short bursts.
      this.nextLaugh = now + rand(6, 16);
      for (let i = 0; i < 4; i++)
        glide(this.a, this.bus.murmur, now + 0.1 + i * 0.13, 'triangle', rand(380, 520), rand(300, 420), [
          [0.02, 0.04],
          [0.1, 0],
        ]);
    }
  }
}

/** What the office's sound hands the Schallwerk (sound/index.ts `venue`): its sounds, and its air. */
export class VenueSounds {
  private readonly air: VenueAmbience;

  constructor(private readonly a: AudioCore) {
    this.air = new VenueAmbience(a);
  }

  play(kind: VenueSoundKind) {
    venueSound(this.a, kind);
  }

  /** Every frame inside (see VenueAmbience.set). */
  ambience(crowd: number, foyer: number, bar: number) {
    this.air.set(crowd, foyer, bar);
  }
}
