// OFFICE GP (flrnoh fork, see FORK.md): the racing game on the lounge's racing rig. An arcade racer in
// the old pseudo-3D style: a road of short segments, each bending a little and rising or falling a
// little, with the camera riding just behind your car. Everything here is pure (no DOM), so the page
// that drives (client/ui/rig.ts), the pages that watch and the tests all run the same race.
//
// Units: the road is SEG long per segment and 2 × ROAD_W wide; a car's `x` is across the road, -1 and
// 1 being its edges, and `dist` is how far it has come from the start line (laps and all).

/** One segment of road, this long. */
export const SEG = 200;
/** Half the road's width: x = ±1 is its edge. */
export const ROAD_W = 2000;
/** Laps in a race. */
export const LAPS = 3;
/** Flat out, a segment every 60th of a second. */
export const MAX_SPEED = SEG * 60;
/** Flat out on the boost. */
export const BOOST_SPEED = MAX_SPEED * 1.22;
/** 3, 2, 1, GO: this long (ms) before the lights go green. */
export const COUNTDOWN_MS = 3000;
/** How wide a car is across the road, and how long along it. */
export const CAR_W = 0.3;
export const CAR_LEN = 320;
/** The CPU cars in the race. */
export const RIVALS = [
  { name: 'CLAUDE', color: '#ff8a5b', top: 0.96 },
  { name: 'CODEX', color: '#06d6a0', top: 0.92 },
  { name: 'GROK', color: '#b388eb', top: 0.88 },
  { name: 'GEMINI', color: '#4cc9f0', top: 0.85 },
  { name: 'OPENCODE', color: '#ffd166', top: 0.81 },
] as const;

const ACCEL = MAX_SPEED / 4.5;
const BRAKING = MAX_SPEED / 1.3;
const DECEL = MAX_SPEED / 6;
/** Off the road you slow hard, down to this. */
const OFF_DECEL = MAX_SPEED / 1.4;
export const OFF_LIMIT = MAX_SPEED / 3.2;
/** How hard a bend pushes you out toward its outside. */
const CENTRIFUGAL = 0.3;
/** The walls either side of the grass. */
export const WALL = 2.4;
/** The boost meter: how fast it empties while you hold it, and fills again while you don't (per second). */
const BOOST_USE = 0.32;
const BOOST_FILL = 0.075;

// ---- The track ---------------------------------------------------------------------------------

export type SceneryKind = 'tree' | 'bush' | 'palm' | 'lamp' | 'sign' | 'cone';

/** Something at the side of the road: what, how far out (in x, the other side for negative), and a sign's words. */
export interface Scenery {
  kind: SceneryKind;
  offset: number;
  text?: string;
}

export interface Segment {
  index: number;
  /** How hard it bends: negative left, positive right. */
  curve: number;
  /** The road's height at its near end and its far end. */
  y1: number;
  y2: number;
  scenery: Scenery[];
}

export interface Track {
  segments: Segment[];
  /** One lap. */
  length: number;
  /** Each segment's bends so far, summed: how far the skyline has turned by there. */
  turned: number[];
}

/** Words on the billboards along the way. */
const BILLBOARDS = ['AGENT OFFICE', 'SHIP IT', 'LGTM', 'MERGE ME', 'NO BUGS', 'TESTS PASS', 'OFFICE GP', 'BREZN', 'SPEZI', 'PR #1'];

const easeIn = (a: number, b: number, p: number) => a + (b - a) * p * p;
const easeInOut = (a: number, b: number, p: number) => a + (b - a) * (-Math.cos(p * Math.PI) / 2 + 0.5);

/** A small seeded random, so the scenery is the same on every page. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The circuit: out of the start, over a crest, a sweeper, the esses, a long hill, the hairpin, and home. */
export function buildTrack(): Track {
  const segs: Segment[] = [];
  const lastY = () => (segs.length ? segs[segs.length - 1].y2 : 0);
  const add = (curve: number, y: number) => segs.push({ index: segs.length, curve, y1: lastY(), y2: y, scenery: [] });
  /** Into a bend of `curve` over `enter` segments, round it for `hold`, out of it over `leave`, climbing `hill` segments' worth on the way. */
  const road = (enter: number, hold: number, leave: number, curve: number, hill: number) => {
    const y0 = lastY();
    const y1 = y0 + hill * SEG;
    const total = enter + hold + leave;
    for (let n = 0; n < enter; n++) add(easeIn(0, curve, n / enter), easeInOut(y0, y1, (n + 1) / total));
    for (let n = 0; n < hold; n++) add(curve, easeInOut(y0, y1, (enter + n + 1) / total));
    for (let n = 0; n < leave; n++) add(easeInOut(curve, 0, n / leave), easeInOut(y0, y1, (enter + hold + n + 1) / total));
  };
  road(0, 60, 0, 0, 0); // the grid and the start straight
  road(40, 40, 40, 0, 25); // over a crest
  road(40, 70, 40, 3, -10); // a long right-hander
  road(25, 25, 25, 0, 0);
  road(25, 30, 25, -4, 0); // the esses
  road(25, 30, 25, 4, 10);
  road(25, 30, 25, -4, -10);
  road(40, 80, 40, 0, 40); // up the long hill
  road(30, 40, 30, 2, 0);
  road(50, 60, 50, -6, -30); // down into the hairpin
  road(30, 60, 30, 0, 15);
  road(40, 50, 40, 5, 0); // the fast right
  road(25, 25, 25, -2, -10);
  road(30, 30, 30, 3, 0);
  // Home: down the last hill to the start's height, straight.
  const drop = -lastY() / SEG;
  road(60, 60, 60, 0, drop);
  road(0, 40, 0, 0, 0);
  const last = segs[segs.length - 1];
  last.y2 = 0;

  // Scenery, the same every time.
  const rand = seeded(7);
  const trees: SceneryKind[] = ['tree', 'tree', 'bush', 'palm'];
  for (const s of segs) {
    if (s.index < 8) continue;
    if (s.index % 6 === 0) s.scenery.push({ kind: trees[Math.floor(rand() * trees.length)], offset: -(1.35 + rand() * 1.1) });
    if (s.index % 6 === 3) s.scenery.push({ kind: trees[Math.floor(rand() * trees.length)], offset: 1.35 + rand() * 1.1 });
    if (s.index % 20 === 10) s.scenery.push({ kind: 'lamp', offset: s.index % 40 === 10 ? -1.15 : 1.15 });
    if (s.index % 90 === 45) s.scenery.push({ kind: 'sign', offset: s.curve > 0 ? -1.4 : 1.4, text: BILLBOARDS[Math.floor(s.index / 90) % BILLBOARDS.length] });
    if (Math.abs(s.curve) >= 4 && s.index % 4 === 0) s.scenery.push({ kind: 'cone', offset: s.curve > 0 ? -1.08 : 1.08 });
  }
  const turned: number[] = [];
  let sum = 0;
  for (const s of segs) {
    turned.push(sum);
    sum += s.curve;
  }
  return { segments: segs, length: segs.length * SEG, turned };
}

export const TRACK: Track = buildTrack();

/** `n` wrapped into 0..m. */
export const wrap = (n: number, m: number) => ((n % m) + m) % m;

/** The segment `dist` is on (any lap). */
export function segmentAt(track: Track, dist: number): Segment {
  return track.segments[Math.floor(wrap(dist, track.length) / SEG) % track.segments.length];
}

/** How high the road is at `dist`. */
export function heightAt(track: Track, dist: number): number {
  const s = segmentAt(track, dist);
  const p = wrap(dist, SEG) / SEG;
  return s.y1 + (s.y2 - s.y1) * p;
}

/** The quickest a lap can possibly go (ms): all of it flat out on the boost. The office turns down anything quicker. */
export const MIN_LAP_MS = Math.floor((TRACK.length / BOOST_SPEED) * 1000);

// ---- The race ----------------------------------------------------------------------------------

/** How you're driving: steer -1 (left) to 1, gas and brake 0 to 1, and the boost held down. */
export interface Controls {
  steer: number;
  gas: number;
  brake: number;
  boost: boolean;
}

export const NO_CONTROLS: Controls = { steer: 0, gas: 0, brake: 0, boost: false };

export interface Rival {
  name: string;
  color: string;
  dist: number;
  x: number;
  speed: number;
  /** Its own top speed. */
  top: number;
  /** The line it keeps to when nobody's in its way. */
  lane: number;
}

export type Phase = 'count' | 'race' | 'done';

/** Something to hear (or show): a countdown light, the green, a lap done, the flag, a knock into someone, a wheel off the road. */
export type RaceEvent = 'count' | 'go' | 'lap' | 'best' | 'finish' | 'bump' | 'wall';

export class Race {
  phase: Phase = 'count';
  /** ms since the green (negative while the lights count down). */
  t = -COUNTDOWN_MS;
  dist = 0;
  x = 0;
  speed = 0;
  steer = 0;
  /** The boost meter, 0 to 1, and whether it's firing. */
  boost = 1;
  boosting = false;
  /** Each lap done, in ms. */
  laps: number[] = [];
  /** Where you are in the race, 1 to 6. */
  place = RIVALS.length + 1;
  rivals: Rival[];
  /** What happened since the page last looked (see drain). */
  private events: RaceEvent[] = [];
  private lapStart = 0;

  constructor(readonly track: Track = TRACK) {
    // You start at the back of the grid, the rivals two by two in front.
    this.rivals = RIVALS.map((r, i) => {
      const lane = i % 2 ? 0.45 : -0.45;
      return { name: r.name, color: r.color, dist: (RIVALS.length - i) * 2.5 * SEG, x: lane, speed: 0, top: r.top * MAX_SPEED, lane };
    });
    this.x = RIVALS.length % 2 ? 0.45 : -0.45;
    this.events.push('count');
  }

  /** The lap you're on, 1 to LAPS. */
  get lap(): number {
    return Math.min(LAPS, this.laps.length + 1);
  }

  /** Your best lap so far (ms), or 0. */
  get best(): number {
    return this.laps.length ? Math.min(...this.laps) : 0;
  }

  /** The whole race (ms), once it's done. */
  get total(): number {
    return this.laps.reduce((a, b) => a + b, 0);
  }

  /** What happened since you last asked. */
  drain(): RaceEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  /** Moves the race on `dt` seconds, with you driving like `c`. */
  step(dt: number, c: Controls = NO_CONTROLS) {
    if (dt <= 0) return;
    if (this.phase === 'count') {
      const was = this.t;
      this.t += dt * 1000;
      // A beep at each light: at -2000 and -1000, then the green.
      for (const at of [-2000, -1000]) if (was < at && this.t >= at) this.events.push('count');
      if (this.t < 0) return;
      this.phase = 'race';
      this.events.push('go');
      dt = this.t / 1000;
      this.t = 0;
      if (dt <= 0) return;
    }
    if (this.phase === 'race') this.t += dt * 1000;
    this.drive(dt, this.phase === 'race' ? c : NO_CONTROLS);
    this.moveRivals(dt);
    if (this.phase === 'race') this.place = 1 + this.rivals.filter((r) => r.dist > this.dist).length;
  }

  private drive(dt: number, c: Controls) {
    const L = this.track.length;
    const seg = segmentAt(this.track, this.dist);
    const ratio = this.speed / MAX_SPEED;
    const steer = Math.max(-1, Math.min(1, c.steer || 0));
    const gas = Math.max(0, Math.min(1, c.gas || 0));
    const brake = Math.max(0, Math.min(1, c.brake || 0));
    this.steer = steer;
    const dx = dt * 2 * ratio;
    this.x += dx * steer;
    this.x -= dx * ratio * seg.curve * CENTRIFUGAL;

    this.boosting = c.boost && this.boost > 0 && gas > 0;
    this.boost = this.boosting ? Math.max(0, this.boost - dt * BOOST_USE) : Math.min(1, this.boost + dt * BOOST_FILL);
    const top = this.boosting ? BOOST_SPEED : MAX_SPEED;
    if (gas > 0) this.speed = Math.min(Math.max(this.speed, top), this.speed + ACCEL * (this.boosting ? 1.8 : 1) * gas * dt);
    if (brake > 0) this.speed -= BRAKING * brake * dt;
    if (!gas && !brake) this.speed -= DECEL * dt;
    // Past the top (the boost ran out): back down to it, gently.
    if (this.speed > top) this.speed = Math.max(top, this.speed - DECEL * 2 * dt);
    if (Math.abs(this.x) > 1 && this.speed > OFF_LIMIT) this.speed = Math.max(OFF_LIMIT, this.speed - OFF_DECEL * dt);
    if (Math.abs(this.x) >= WALL) {
      if (this.speed > OFF_LIMIT / 2) this.events.push('wall');
      this.x = Math.sign(this.x) * WALL;
      this.speed = Math.min(this.speed, OFF_LIMIT / 2);
    }
    this.speed = Math.max(0, this.speed);

    // Into the back of a rival: you bounce off it, down to less than its speed.
    for (const r of this.rivals) {
      let gap = wrap(r.dist - this.dist, L);
      if (gap > L / 2) gap -= L;
      if (gap > 0 && gap < CAR_LEN && this.speed > r.speed && Math.abs(this.x - r.x) < CAR_W) {
        this.speed = r.speed * 0.8;
        this.dist -= CAR_LEN - gap;
        this.x += this.x < r.x ? -0.08 : 0.08;
        this.events.push('bump');
      }
    }

    const from = this.dist;
    this.dist += this.speed * dt;
    if (this.phase !== 'race') return;
    // Over the line: a lap done, timed to when the nose crossed it within this step.
    while (this.dist >= (this.laps.length + 1) * L) {
      const line = (this.laps.length + 1) * L;
      const over = this.speed > 0 ? ((this.dist - line) / this.speed) * 1000 : 0;
      const at = Math.max(this.lapStart, this.t - Math.min(over, dt * 1000));
      const lap = Math.round(at - this.lapStart);
      const best = this.best;
      this.laps.push(lap);
      this.lapStart = at;
      if (this.laps.length >= LAPS) {
        this.phase = 'done';
        this.t = this.total;
        this.place = 1 + this.rivals.filter((r) => r.dist > line).length;
        this.events.push('finish');
        return;
      }
      this.events.push(best && lap < best ? 'best' : 'lap');
    }
  }

  private moveRivals(dt: number) {
    if (this.phase === 'count') return;
    const L = this.track.length;
    const others = [...this.rivals.map((r) => ({ dist: r.dist, x: r.x, speed: r.speed, me: r as Rival | null })), { dist: this.dist, x: this.x, speed: this.speed, me: null }];
    for (const r of this.rivals) {
      const seg = segmentAt(this.track, r.dist + SEG * 4);
      // Slower into the bends, and a little rubber band to keep the race close.
      const lead = r.dist - this.dist;
      const band = lead > L * 0.2 ? 0.94 : lead < -L * 0.2 ? 1.07 : 1;
      const want = r.top * (1 - 0.03 * Math.abs(seg.curve)) * band;
      const dv = want - r.speed;
      r.speed += Math.max(-BRAKING * 0.5 * dt, Math.min(ACCEL * 0.9 * dt, dv));
      // Whoever's just ahead on its line: go round them, or sit behind if there's no way round.
      let blocked: (typeof others)[number] | null = null;
      for (const o of others) {
        if (o.me === r) continue;
        let gap = wrap(o.dist - r.dist, L);
        if (gap > L / 2) gap -= L;
        if (gap > 0 && gap < SEG * 6 && Math.abs(o.x - r.x) < CAR_W * 1.3 && o.speed < r.speed + 400 && (!blocked || gap < blocked.dist - r.dist)) blocked = o;
      }
      if (blocked) {
        const dir = blocked.x > r.x ? -1 : 1;
        const room = r.x + dir * 0.4;
        r.x += (Math.abs(room) < 0.85 ? dir : -dir) * dt * 1.4;
        let gap = wrap(blocked.dist - r.dist, L);
        if (gap > L / 2) gap -= L;
        if (gap < CAR_LEN * 1.2 && Math.abs(blocked.x - r.x) < CAR_W) r.speed = Math.min(r.speed, blocked.speed);
      } else {
        r.x += (r.lane - r.x) * Math.min(1, dt * 0.4);
      }
      r.x = Math.max(-0.85, Math.min(0.85, r.x));
      r.dist += r.speed * dt;
    }
  }

  /** The race as it looks now, for everyone watching (see RigFrame in shared/rig.ts). */
  frame(): RaceFrame {
    const r1 = (n: number) => Math.round(n);
    const r3 = (n: number) => Math.round(n * 1000) / 1000 || 0;
    return {
      phase: this.phase,
      t: r1(this.t),
      dist: r1(this.dist),
      x: r3(this.x),
      speed: r1(this.speed),
      steer: r3(this.steer),
      boost: r3(this.boost),
      boosting: this.boosting,
      laps: [...this.laps],
      place: this.place,
      cars: this.rivals.flatMap((r) => [r1(r.dist), r3(r.x), r1(r.speed)]),
    };
  }
}

/** A race as it looks at one moment: enough to draw it (see client/ui/rigscreen.ts). */
export interface RaceFrame {
  phase: Phase;
  t: number;
  dist: number;
  x: number;
  speed: number;
  steer: number;
  boost: number;
  boosting: boolean;
  /** Each lap done, in ms. */
  laps: number[];
  place: number;
  /** Each rival's dist, x and speed, in RIVALS' order. */
  cars: number[];
}

/** 1:23.45 */
export function lapText(ms: number): string {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const cs = Math.floor((ms % 1000) / 10);
  return `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

/** 1st, 2nd, 3rd, 4th… */
export function ordinal(n: number): string {
  return `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;
}

/**
 * A driver that gets round on its own: keeps to the middle of the road and lifts for the bends. The
 * screen's attract mode, and the tests' way of finishing a race.
 */
export function autopilot(race: Race, aim = 0): Controls {
  const seg = segmentAt(race.track, race.dist + SEG * 3);
  const ratio = race.speed / MAX_SPEED;
  const push = ratio * seg.curve * CENTRIFUGAL;
  const steer = Math.max(-1, Math.min(1, (aim - race.x) * 3 + push * 1.2));
  const slow = Math.abs(seg.curve) >= 5 && ratio > 0.85;
  return { steer, gas: slow ? 0 : 1, brake: 0, boost: false };
}
