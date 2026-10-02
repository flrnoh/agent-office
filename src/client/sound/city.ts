import { awningLevel, murmurLevel, nearestDoor, roadLevel, treesNear, type Ear } from '../../shared/citysound';
import type { AudioCore } from './core';
import { biquad, pick, rand, randInt } from './dsp';
import type { Pos } from './places';

// ---- The sounds of the city round the office (flrnoh fork, see FORK.md "Sounds of the city") -------
// The road's rumble, louder the nearer a street and the more cars about; a whoosh as a car goes by
// close; birds in the trees by day and crickets under them on warm nights; the murmur of people by the
// shops and a cup clinking at a café; the rain drumming on the shops' awnings. How loud each is where
// you are is shared/citysound.ts; this plays it, all on a bus of its own that the "Stadtgeräusche"
// setting turns off and that's muffled behind glass. The church's bells and the sirens are citybells.ts.

/** What the city's sound is told each frame (features/citysound). */
export interface CityScene {
  /** The setting's on, and you're in the office's world (not a castle). */
  on: boolean;
  /** Where the street is, in the frame your ears are in. */
  streetY: number;
  /** In a shop (glass round you, like the office's). */
  sheltered: boolean;
  /** Where the city's cars are now, by index (the same car at the same index every frame). */
  cars: readonly { x: number; z: number }[];
  /** Warm enough for crickets (shared/citysound.ts summerish). */
  summer: boolean;
}

/** What the levels came to last time, for quick checks from the console (window.__citySound). */
export interface CityLevels {
  road: number;
  murmur: number;
  awning: number;
  inside: boolean;
  up: number;
  trees: number;
}

/** How often the levels are worked out again (they ease anyway). */
const EVERY = 0.25;
/** The loops' gains at level 1. */
const ROAD_GAIN = 0.11;
const HISS_GAIN = 0.02;
const MURMUR_GAIN = 0.045;
const AWNING_GAIN = 0.05;

interface Loops {
  /** The whole city, on or off. */
  bus: GainNode;
  /** Muffled behind glass. */
  muffle: BiquadFilterNode;
  road: GainNode;
  hiss: GainNode;
  murmur: GainNode;
  awning: GainNode;
}

export class CitySound {
  private scene: CityScene | null = null;
  private loops: Loops | null = null;
  private next = 0;
  private nextBird = 0;
  private nextCricket = 0;
  private nextClink = 0;
  private nextDrop = 0;
  /** Each car's last position and when it last whooshed by. */
  private readonly seen: { x: number; z: number; t: number; whoosh: number }[] = [];
  private trees: { x: number; z: number }[] = [];
  readonly levels: CityLevels = { road: 0, murmur: 0, awning: 0, inside: false, up: 0, trees: 0 };

  constructor(private readonly a: AudioCore) {}

  /** The bus the city's sounds go out on (citybells.ts too). Only once audio's started. */
  get out(): AudioNode | null {
    return this.loops?.bus ?? null;
  }

  set(scene: CityScene | null) {
    this.scene = scene;
  }

  /** The levels, and what the loops' gains (and the muffling) actually are right now, for quick checks. */
  probe() {
    const L = this.loops;
    const v = (g: GainNode | undefined) => (g ? +g.gain.value.toFixed(5) : null);
    return { ...this.levels, gain: { bus: v(L?.bus), road: v(L?.road), hiss: v(L?.hiss), murmur: v(L?.murmur), awning: v(L?.awning) }, muffleHz: L ? Math.round(L.muffle.frequency.value) : null, played: this.a.played };
  }

  /** The loops, made once audio's going: they run all the time, at 0 until there's something to hear. */
  private build(ctx: AudioContext): Loops {
    const a = this.a;
    const bus = ctx.createGain();
    bus.gain.value = 0;
    const muffle = biquad(ctx, 'lowpass', 16000, 0.5);
    bus.connect(muffle).connect(a.ambience);
    const loop = (buffer: AudioBuffer, ...filters: BiquadFilterNode[]) => {
      const g = ctx.createGain();
      g.gain.value = 0;
      const src = a.noise(buffer, true);
      let at: AudioNode = src;
      for (const f of filters) at = at.connect(f);
      at.connect(g).connect(bus);
      src.start(ctx.currentTime, rand(0, 4));
      return g;
    };
    // The road: a low rumble of engines and tyres, and the tyres' hiss over it.
    const road = loop(a.buf.brown, biquad(ctx, 'lowpass', 380, 0.6));
    const hiss = loop(a.buf.white, biquad(ctx, 'bandpass', 1100, 0.6), biquad(ctx, 'lowpass', 2500, 0.5));
    // People talking, no words: noise through a voice's formants, each voice coming and going.
    const murmur = ctx.createGain();
    murmur.gain.value = 0;
    murmur.connect(bus);
    for (const [f1, f2, rate] of [
      [520, 1500, 0.9],
      [380, 2100, 1.3],
      [700, 1200, 0.7],
    ]) {
      const voice = ctx.createGain();
      voice.gain.value = 0;
      const src = a.noise(a.buf.white, true);
      for (const f of [f1, f2]) src.connect(biquad(ctx, 'bandpass', f, 4)).connect(voice);
      const swell = a.noise(a.buf.gurgle, true);
      swell.playbackRate.value = rate * 6;
      swell.connect(voice.gain);
      voice.connect(biquad(ctx, 'lowpass', 2400, 0.6)).connect(murmur);
      src.start(ctx.currentTime, rand(0, 4));
      swell.start(ctx.currentTime, rand(0, 3));
    }
    // Rain drumming on canvas: a bright patter.
    const awning = loop(a.buf.white, biquad(ctx, 'highpass', 1500, 0.6), biquad(ctx, 'bandpass', 3200, 0.7));
    return { bus, muffle, road, hiss, murmur, awning };
  }

  tick(now: number) {
    const ctx = this.a.ctx;
    if (!ctx) return;
    const s = this.scene;
    if (!this.loops) {
      if (!s?.on) return;
      this.loops = this.build(ctx);
    }
    const L = this.loops;
    if (!s?.on) {
      L.bus.gain.setTargetAtTime(0, now, 0.4);
      return;
    }
    const l = this.a.listener;
    const inside = !this.a.outdoors && (this.a.where() === 'office' || s.sheltered);
    const ear: Ear = { x: l.x, z: l.z, up: l.y - s.streetY, inside };
    const { rain, night } = this.a.weather;
    this.passing(now, s, ear);
    if (now >= this.next) {
      this.next = now + EVERY;
      L.bus.gain.setTargetAtTime(1, now, 0.4);
      // Behind glass the city's dull; the time constant's long, so walking in and out never clicks.
      L.muffle.frequency.setTargetAtTime(inside ? 650 : 16000, now, 0.25);
      const lv = this.levels;
      lv.road = roadLevel(ear, s.cars);
      lv.murmur = murmurLevel(ear, 1 - night, rain);
      lv.awning = awningLevel(ear, rain);
      lv.inside = inside;
      lv.up = ear.up;
      L.road.gain.setTargetAtTime(lv.road * ROAD_GAIN, now, 0.6);
      L.hiss.gain.setTargetAtTime(lv.road * lv.road * HISS_GAIN * (1 + rain * 1.5), now, 0.6);
      L.murmur.gain.setTargetAtTime(lv.murmur * MURMUR_GAIN, now, 0.8);
      L.awning.gain.setTargetAtTime(lv.awning * AWNING_GAIN, now, 0.8);
      // Birds and crickets only out of doors, where you're not far above the trees (the office's windows have their own, sound/ambience.ts).
      this.trees = inside || ear.up > 30 ? [] : treesNear(l.x, l.z, 40);
      lv.trees = this.trees.length;
    }
    this.nature(now, s, ear, rain, night);
    this.terrace(now, s, ear, rain, night);
  }

  /** A whoosh as a car goes by close: when one's about to pass you within a few metres. */
  private passing(now: number, s: CityScene, ear: Ear) {
    if (ear.up > 6) return;
    for (let i = 0; i < s.cars.length; i++) {
      const c = s.cars[i];
      const was = this.seen[i];
      if (!was) {
        this.seen[i] = { x: c.x, z: c.z, t: now, whoosh: 0 };
        continue;
      }
      const dt = now - was.t;
      if (dt < 0.05) continue;
      const vx = (c.x - was.x) / dt;
      const vz = (c.z - was.z) / dt;
      was.x = c.x;
      was.z = c.z;
      was.t = now;
      const v2 = vx * vx + vz * vz;
      if (v2 < 9 || v2 > 900 || now - was.whoosh < 4) continue;
      // When it's closest to you, and how close that is.
      const rx = c.x - ear.x;
      const rz = c.z - ear.z;
      const tca = -(rx * vx + rz * vz) / v2;
      if (tca < 0.1 || tca > 0.8) continue;
      const miss = Math.hypot(rx + vx * tca, rz + vz * tca, ear.up - 0.8);
      if (miss > 9) continue;
      was.whoosh = now;
      this.whoosh(now + tca, { x: c.x, y: s.streetY + 0.7, z: c.z }, vx, vz, Math.sqrt(v2), miss);
    }
  }

  /** A car going by: tyres and air, rising as it comes, dropping in pitch as it passes, and gone. */
  private whoosh(peak: number, from: Pos, vx: number, vz: number, speed: number, miss: number) {
    const ctx = this.a.ctx!;
    this.a.count('cityWhoosh');
    const t0 = ctx.currentTime;
    const end = peak + 1.4;
    const pan = this.a.panner(from, 3, 1.1);
    const p = pan.positionX ? pan : null;
    if (p) {
      p.positionX.setValueAtTime(from.x, t0);
      p.positionZ.setValueAtTime(from.z, t0);
      p.positionX.linearRampToValueAtTime(from.x + vx * (end - t0), end);
      p.positionZ.linearRampToValueAtTime(from.z + vz * (end - t0), end);
    }
    pan.connect(this.loops!.bus);
    const level = 0.09 * Math.min(1, speed / 12) * (1 / (1 + (miss / 5) ** 2) + 0.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(level, peak);
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    // The doppler-ish drop: the band slides down past the moment it's closest.
    const band = biquad(ctx, 'bandpass', 1300, 0.8);
    band.frequency.setValueAtTime(1300, t0);
    band.frequency.setValueAtTime(1300, Math.max(t0, peak - 0.15));
    band.frequency.exponentialRampToValueAtTime(650, peak + 0.4);
    const air = this.a.noise(this.a.buf.white);
    air.connect(band).connect(g);
    const rumble = this.a.noise(this.a.buf.brown);
    const rg = ctx.createGain();
    rg.gain.value = 1.6;
    rumble.connect(biquad(ctx, 'lowpass', 300, 0.7)).connect(rg).connect(g);
    g.connect(pan);
    air.start(t0, rand(0, 3));
    rumble.start(t0, rand(0, 4));
    air.stop(end + 0.05);
    rumble.stop(end + 0.05);
  }

  /** Birds in the trees round you by day, crickets under them on warm dry nights; neither in the rain. */
  private nature(now: number, s: CityScene, ear: Ear, rain: number, night: number) {
    if (!this.trees.length) return;
    if (now >= this.nextBird) {
      this.nextBird = now + (Math.random() < 0.3 ? rand(1.2, 3) : rand(4, 11));
      if (night < 0.5 && rain < 0.1) {
        const t = pick(this.trees);
        chirp(this.a, this.loops!.bus, { x: t.x, y: s.streetY + rand(3, 5), z: t.z });
      }
    }
    if (now >= this.nextCricket) {
      this.nextCricket = now + rand(2, 6);
      if (night > 0.6 && rain < 0.05 && s.summer) {
        const t = pick(this.trees);
        cricket(this.a, this.loops!.bus, { x: t.x + rand(-2, 2), y: s.streetY + 0.2, z: t.z + rand(-2, 2) });
      }
    }
  }

  /** A cup on a café's terrace by day; the rain dripping off an awning near you. */
  private terrace(now: number, s: CityScene, ear: Ear, rain: number, night: number) {
    const out = this.loops!.bus;
    if (now >= this.nextClink) {
      this.nextClink = now + rand(3, 10);
      const cafe = night < 0.6 && rain < 0.3 && ear.up < 8 ? nearestDoor(ear.x, ear.z, ['cafe', 'eisdiele']) : null;
      if (cafe && cafe.d < 22) {
        const ctx = this.a.ctx!;
        const pan = this.a.panner({ x: cafe.x, y: s.streetY + 1, z: cafe.z }, 2, 1.3);
        pan.connect(out);
        const t = ctx.currentTime + 0.02;
        for (let k = randInt(1, 3); k > 0; k--) this.a.clink(pan, t + k * rand(0.12, 0.3), rand(2300, 3300), 0.025);
        this.a.count('cityClink');
      }
    }
    if (this.levels.awning > 0.05 && now >= this.nextDrop) {
      this.nextDrop = now + rand(0.08, 0.35) / this.levels.awning;
      const door = nearestDoor(ear.x, ear.z);
      if (door) this.a.play(this.a.buf.drop, { at: { x: door.x + rand(-2, 2), y: s.streetY + 2.8, z: door.z + rand(-1, 1) }, gain: rand(0.06, 0.12), rate: rand(0.45, 0.7), ref: 1.5, rolloff: 1.3, dest: out });
    }
  }
}

/** A few chirps from a tree at `at`. */
function chirp(a: AudioCore, bus: AudioNode, at: Pos) {
  const ctx = a.ctx!;
  a.count('cityBirds');
  const out = a.panner(at, 2.5, 1.1);
  out.connect(bus);
  const base = rand(2400, 4400);
  const rising = Math.random() < 0.5;
  let t = ctx.currentTime + 0.05;
  for (let i = randInt(2, 6); i > 0; i--) {
    const len = rand(0.06, 0.14);
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(base * rand(0.9, 1.05), t);
    if (rising) {
      o.frequency.exponentialRampToValueAtTime(base * rand(1.25, 1.6), t + len * 0.6);
      o.frequency.exponentialRampToValueAtTime(base * rand(0.8, 1), t + len);
    } else o.frequency.exponentialRampToValueAtTime(base * rand(0.6, 0.75), t + len);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + len + 0.02);
    t += len + rand(0.04, 0.2);
  }
}

/** A cricket in the grass at `at`, chirping a few times. */
function cricket(a: AudioCore, bus: AudioNode, at: Pos) {
  const ctx = a.ctx!;
  a.count('cityCrickets');
  const out = a.panner(at, 2, 1.3);
  out.connect(bus);
  const freq = rand(4200, 5200);
  let t = ctx.currentTime + 0.05;
  for (let c = randInt(3, 7); c > 0; c--) {
    for (let p = 0; p < 3; p++) {
      const o = ctx.createOscillator();
      o.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.018, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.022);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.03);
      t += 0.035;
    }
    t += rand(0.35, 0.6);
  }
}
