import type { InstrumentNote, InstrumentSpot, VenueRoomId } from '../../../../shared/venue';
import { JAM_ROOMS, isRelease, type Tone } from '../../../../shared/instruments';
import { DrumKit, PIECE_OF } from './drums';
import { damp, driveCurve, filter, gainNode, reverbIr } from './fx';
import { Keys, type KeysTone, type Voice } from './keys';
import { Strings } from './strings';

// ---- The instruments' mixing desk (flrnoh fork, see FORK.md "The instruments") -----------------------
// Every instrument plays into a chain of its own at its spot (the guitar's amp and cab, the bass's
// rig, the keyboard's tremolo and rotating speaker, the drums' bus compressor), out of a panner where
// it stands, into its room: the hall with a big reverb, a rehearsal room nearly dry. A room is heard
// only by whoever's in it (each frame the page says how much of each room reaches your ears: see
// heardIn in shared/instruments.ts), the hall muffled out in the wing's corridor.

interface RoomBus {
  input: GainNode;
  muffle: BiquadFilterNode;
  level: GainNode;
}

interface Chain {
  spot: InstrumentSpot;
  /** Where its notes go in. */
  input: AudioNode;
  /** The guitar's two channels, faded between (see tone). */
  drive?: GainNode;
  clean?: GainNode;
  /** The keyboard's tremolo depth, the rotating speaker's and the lead's vibrato LFO (cents). */
  trem?: GainNode;
  tremDepth?: GainNode;
  vib?: GainNode;
  tone: Tone | null;
  voices: Voice[];
}

/** The rooms' reverbs: how long they ring, the gap before, how bright, how much of it. */
const ROOM_VERB: Record<'hall' | 'probe' | 'studio', { secs: number; pre: number; bright: number; wet: number }> = {
  hall: { secs: 2.6, pre: 0.028, bright: 0.55, wet: 0.32 },
  probe: { secs: 0.55, pre: 0.006, bright: 0.45, wet: 0.14 },
  studio: { secs: 0.35, pre: 0.004, bright: 0.6, wet: 0.08 },
};
/** How loud each instrument sits in the mix. */
const LEVEL = { drums: 0.32, guitar: 0.75, bass: 0.3, keys: 1.1 } as const;
const MAX_VOICES = 24;
/** A string note this short (its `len`) is palm-muted: damped at the bridge, not just let go early. */
export const PALM_MUTE = 0.35;

export class Engine {
  readonly strings: Strings;
  readonly drums: DrumKit;
  readonly keys: Keys;
  private rooms = new Map<VenueRoomId, RoomBus>();
  private chains = new Map<string, Chain>();
  /** Straight to your ears (the click in your in-ear), not into a room. */
  readonly direct: GainNode;

  constructor(
    readonly ctx: BaseAudioContext,
    readonly out: AudioNode,
  ) {
    this.strings = new Strings(ctx);
    this.drums = new DrumKit(ctx);
    this.keys = new Keys(ctx);
    this.direct = gainNode(ctx, 1);
    this.direct.connect(out);
    for (const id of JAM_ROOMS) this.rooms.set(id, this.room(id));
  }

  private room(id: VenueRoomId): RoomBus {
    const ctx = this.ctx;
    const v = ROOM_VERB[id === 'hall' ? 'hall' : id === 'studio' ? 'studio' : 'probe'];
    const input = gainNode(ctx, 1);
    const mix = gainNode(ctx, 1);
    input.connect(mix);
    const send = gainNode(ctx, v.wet);
    const verb = ctx.createConvolver();
    verb.buffer = reverbIr(ctx, v.secs, v.pre, v.bright);
    // The tail without the lows (as a desk's reverb return is), so the hall doesn't boom.
    input.connect(send).connect(filter(ctx, 'highpass', 220, 0.6)).connect(verb).connect(mix);
    const muffle = filter(ctx, 'lowpass', 20000, 0.5);
    const level = gainNode(ctx, 0);
    mix.connect(muffle).connect(level).connect(this.out);
    return { input, muffle, level };
  }

  /** How much of `room` reaches you now (see heardIn), eased so walking through a door doesn't click. */
  hear(room: VenueRoomId, gain: number, muffled: boolean, now = this.ctx.currentTime) {
    const r = this.rooms.get(room);
    if (!r) return;
    r.level.gain.setTargetAtTime(gain, now, 0.06);
    r.muffle.frequency.setTargetAtTime(muffled ? 650 : 20000, now, 0.06);
  }

  /** The chain for an instrument at `spot`, made the first time it plays. */
  chain(spot: InstrumentSpot, pos = spot): Chain {
    const key = `${spot.id}@${pos.x.toFixed(1)},${pos.z.toFixed(1)}`;
    let c = this.chains.get(key);
    if (c) return c;
    const ctx = this.ctx;
    const room = this.rooms.get(spot.room)!;
    // Where it stands: on the stage it's the PA, loud all over the hall; in a rehearsal room the amp.
    const pan = ctx.createPanner();
    pan.panningModel = 'equalpower';
    pan.distanceModel = 'inverse';
    pan.refDistance = spot.room === 'hall' ? 9 : 2.2;
    pan.rolloffFactor = spot.room === 'hall' ? 0.55 : 0.8;
    if (pan.positionX) {
      pan.positionX.value = pos.x;
      pan.positionY.value = pos.y + 1.1;
      pan.positionZ.value = pos.z;
    } else pan.setPosition(pos.x, pos.y + 1.1, pos.z);
    const level = gainNode(ctx, spot.kind === 'mic' ? 0 : LEVEL[spot.kind]);
    level.connect(pan).connect(room.input);
    c = { spot, input: level, tone: null, voices: [] };
    if (spot.kind === 'guitar') this.guitarAmp(c, level);
    else if (spot.kind === 'bass') this.bassRig(c, level);
    else if (spot.kind === 'keys') this.keysRack(c, level);
    else if (spot.kind === 'drums') this.drumBus(c, level);
    this.chains.set(key, c);
    return c;
  }

  /** The guitar's amp: a tight boost into a cranked stage and a 4x12 cab, or a clean channel. */
  private guitarAmp(c: Chain, out: AudioNode) {
    const ctx = this.ctx;
    const input = gainNode(ctx, 1);
    // Drive: the low end tightened before it clips, the mids pushed, then the cab's curve.
    const pre = filter(ctx, 'highpass', 260, 0.6);
    const push = filter(ctx, 'peaking', 900, 0.8, 6);
    const boost = gainNode(ctx, 9);
    const shaper = ctx.createWaveShaper();
    shaper.curve = driveCurve(14);
    shaper.oversample = '4x';
    const post = gainNode(ctx, 0.5);
    const cab = [filter(ctx, 'highpass', 75, 0.7), filter(ctx, 'peaking', 115, 1, 5), filter(ctx, 'peaking', 480, 1, -4), filter(ctx, 'peaking', 2400, 1.2, 3.5), filter(ctx, 'lowpass', 4700, 1.1), filter(ctx, 'lowpass', 5200, 0.6)];
    input.connect(pre).connect(push).connect(boost).connect(shaper).connect(post);
    let n: AudioNode = post;
    for (const f of cab) n = n.connect(f);
    const drive = gainNode(ctx, 1);
    n.connect(drive).connect(out);
    // Clean: a little warmth and the same cab, a touch brighter.
    const warm = ctx.createWaveShaper();
    warm.curve = driveCurve(1.4);
    const cleanCab = filter(ctx, 'lowpass', 6500, 0.7);
    const cleanLow = filter(ctx, 'highpass', 70, 0.7);
    const clean = gainNode(ctx, 0);
    input.connect(gainNode(ctx, 2)).connect(warm).connect(cleanLow).connect(cleanCab).connect(clean).connect(out);
    c.input = input;
    c.drive = drive;
    c.clean = clean;
  }

  /** The bass rig: a fat low end, a little growl, the 8x10's top end rolled off, and a compressor. */
  private bassRig(c: Chain, out: AudioNode) {
    const ctx = this.ctx;
    const input = gainNode(ctx, 1);
    const low = filter(ctx, 'lowshelf', 90, 0.7, 5);
    const shaper = ctx.createWaveShaper();
    shaper.curve = driveCurve(2.2);
    const growl = filter(ctx, 'peaking', 750, 1, 3);
    const top = filter(ctx, 'lowpass', 3200, 0.8);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.ratio.value = 4;
    comp.attack.value = 0.01;
    comp.release.value = 0.15;
    input.connect(gainNode(ctx, 1.6)).connect(low).connect(shaper).connect(growl).connect(top).connect(comp).connect(gainNode(ctx, 0.75)).connect(out);
    c.input = input;
  }

  /** The keyboard: a tremolo (the e-piano's), a rotating speaker's wobble (the organ's), a vibrato LFO (the lead's). */
  private keysRack(c: Chain, out: AudioNode) {
    const ctx = this.ctx;
    const input = gainNode(ctx, 1);
    const trem = gainNode(ctx, 1);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.2;
    const tremDepth = gainNode(ctx, 0);
    lfo.connect(tremDepth).connect(trem.gain);
    const vib = gainNode(ctx, 0);
    lfo.connect(vib);
    lfo.start();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 3;
    input.connect(trem).connect(comp).connect(out);
    c.input = input;
    c.trem = trem;
    c.tremDepth = tremDepth;
    c.vib = vib;
  }

  /** The drums: a bus compressor for punch. */
  private drumBus(c: Chain, out: AudioNode) {
    const ctx = this.ctx;
    const input = gainNode(ctx, 1);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.knee.value = 6;
    comp.ratio.value = 3;
    comp.attack.value = 0.006;
    comp.release.value = 0.12;
    input.connect(comp).connect(gainNode(ctx, 1.1)).connect(out);
    c.input = input;
  }

  /** Puts a spot's instrument on `tone` (its amp channel, its patch's effects). */
  private setTone(c: Chain, tone: Tone, t: number) {
    if (c.tone === tone) return;
    c.tone = tone;
    if (c.drive && c.clean) {
      c.drive.gain.setTargetAtTime(tone === 'clean' ? 0 : 1, t, 0.02);
      c.clean.gain.setTargetAtTime(tone === 'clean' ? 1 : 0, t, 0.02);
    }
    if (c.tremDepth && c.vib && c.trem) {
      // The e-piano's tremolo is a gentle 5 Hz; the organ's rotor faster, with its pitch wobble; the lead's vibrato in cents.
      c.tremDepth.gain.setTargetAtTime(tone === 'epiano' ? 0.22 : tone === 'organ' ? 0.12 : 0, t, 0.05);
      c.vib.gain.setTargetAtTime(tone === 'organ' ? 9 : tone === 'lead' ? 14 : 0, t, 0.05);
    }
  }

  /**
   * Sounds a note on the instrument at `spot` (or a release, vel 0), at audio time `t`. `pos` where
   * it sounds from, when it isn't the spot (the studio's recorder playing a take back).
   */
  play(spot: InstrumentSpot, tone: Tone, note: InstrumentNote, t = this.ctx.currentTime, opts: { pos?: { x: number; y: number; z: number } } = {}) {
    if (spot.kind === 'mic' || note.kind !== spot.kind) return;
    const c = this.chain(spot, opts.pos ? { ...spot, ...opts.pos } : spot);
    this.setTone(c, tone, t);
    const now = this.ctx.currentTime;
    c.voices = c.voices.filter((v) => v.until > now);
    if (note.kind === 'drums') {
      const piece = PIECE_OF.get(note.pitch);
      if (piece) this.drums.play(c.input, piece, note.vel, t);
      return;
    }
    if (isRelease(note)) {
      for (const v of c.voices) if (v.pitch === note.pitch) v.stop(t);
      return;
    }
    let voice: Voice;
    if (note.kind === 'keys') voice = this.keys.start(c.input, tone as KeysTone, note.pitch, note.vel, t, c.vib!);
    else {
      // One guitar, one strum at a time: a new one damps what was still ringing from before (not
      // the strings of the same strum, which come in a few milliseconds apart).
      for (const v of c.voices) if (t - (v as StringVoice).t0 > 0.04) v.stop(t);
      voice = this.pluck(c, note, t, note.len !== undefined && note.len <= PALM_MUTE);
    }
    c.voices.push(voice);
    if (note.len !== undefined) voice.stop(t + note.len);
    while (c.voices.length > MAX_VOICES) c.voices.shift()!.stop(t);
  }

  /** A string picked: its buffer through a gain the release can damp. */
  private pluck(c: Chain, note: InstrumentNote, t: number, mute: boolean): StringVoice {
    const ctx = this.ctx;
    const kind = note.kind === 'bass' ? 'bass' : 'guitar';
    const src = ctx.createBufferSource();
    src.buffer = this.strings.buffer({ kind, pitch: note.pitch, mute, hard: note.vel > 0.8 });
    const g = gainNode(ctx, (0.25 + note.vel * 0.75) * (kind === 'bass' ? 1 : 0.55));
    src.connect(g).connect(c.input);
    src.start(t);
    let until = t + src.buffer.duration;
    return {
      pitch: note.pitch,
      t0: t,
      get until() {
        return until;
      },
      stop(at: number) {
        const when = Math.max(at, t + 0.01);
        damp(g.gain, when, 0.025);
        if (when + 0.2 < until) {
          until = when + 0.2;
          src.stop(until);
        }
      },
    };
  }

  /** The metronome's click, straight into your ear: higher on the one. */
  click(t: number, accent: boolean) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.frequency.value = accent ? 1760 : 1180;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(accent ? 0.22 : 0.14, t + 0.001);
    g.gain.setTargetAtTime(0, t + 0.002, 0.012);
    o.connect(g).connect(this.direct);
    o.start(t);
    o.stop(t + 0.1);
  }

  /** The drummer's sticks counting in, at the kit (heard in its room). */
  sticks(spot: InstrumentSpot, t: number, accent: boolean) {
    this.drums.sticks(this.chain(spot).input, t, accent);
  }

  /** Everything still ringing at `spot` damped (its player put it down). */
  silence(spotId: string, t = this.ctx.currentTime) {
    for (const [key, c] of this.chains) if (key.startsWith(`${spotId}@`)) for (const v of c.voices) v.stop(t);
  }
}

interface StringVoice extends Voice {
  t0: number;
}

/** What the office's sound (sound/index.ts) holds: the engine, made once audio has started, on the music bus. */
export class InstrumentSound {
  private engine: Engine | null = null;

  constructor(
    private readonly ctx: () => AudioContext | null,
    private readonly bus: () => AudioNode | null,
  ) {}

  /** The engine, or null while audio hasn't started (nothing to play into yet). */
  get(): Engine | null {
    if (this.engine) return this.engine;
    const ctx = this.ctx();
    const bus = this.bus();
    if (!ctx || !bus || ctx.state !== 'running') return null;
    this.engine = new Engine(ctx, bus);
    return this.engine;
  }
}
