import { BUS_L, BUS_RUNS, BUS_W, poseOf } from '../../shared/citybus.js';
import { CAR_L, CAR_W, drivePath, driveAt, driveEnd, type Body, type Drive } from '../../shared/waymo/drive.js';
import { FLEET_SIZE, WAYMO_SEATS, asDrive, destOf, initialsOf, waymoAt, type WaymoCar, type WaymoClientMsg, type WireDrive } from '../../shared/waymo/fleet.js';
import { KERB_SPOTS, kerbNear, laneKey, pathOf, pathPoint, placeAt, placeOn, route, type Place } from '../../shared/waymo/roads.js';

/*
 * The robotaxi fleet (flrnoh fork, see FORK.md "Waymo"): six of them, one fleet for the whole
 * building (the street's the same under every floor). The office plans every drive (where each car
 * will be every quarter second, shared/waymo/drive.ts) and tells everyone; the pages play them back.
 * A car with nothing to do cruises to somewhere across town and on again. Book one and the nearest
 * free car comes to the curb nearest you (on a lane no bus drives) with your initials on its dome and
 * waits; get in (your friends too), set off, and it takes you to the curb nearest where you said, and
 * waits for you all to get out before it cruises on.
 */

/** How long (s) it waits for you at the curb, and for you to get out at the end. */
const WAIT_PICKUP = 180;
const WAIT_ARRIVED = 90;
/** How long after the doors shut it pulls away (s). */
const DOORS = 1.5;
/** Somewhere across town to cruise to: at least this far (m). */
const CRUISE_MIN = 150;

export interface FleetDeps {
  /** The office's clock (s). */
  now(): number;
  /** A car changed: tell everyone. */
  changed(car: WaymoCar): void;
  /** Something for one person only (a warning). */
  warn(id: string, text: string): void;
  /** A car honked. */
  honked(car: number): void;
  /** Random numbers (the tests' own). */
  random?(): number;
}

export interface Rider {
  id: string;
  name: string;
  color: string;
}

export class Fleet {
  readonly cars: WaymoCar[] = [];
  private seq = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly random: () => number;

  constructor(private readonly deps: FleetDeps) {
    this.random = deps.random ?? Math.random;
    const t = deps.now();
    for (let i = 0; i < FLEET_SIZE; i++) {
      // Spread out round town, parked till their first cruise.
      const at = KERB_SPOTS[Math.floor(((i + 0.5) * KERB_SPOTS.length) / FLEET_SIZE)];
      this.cars.push({ id: i, mode: 'cruise', drive: this.parked(at, t), riders: WAYMO_SEATS.map(() => null) });
    }
    for (const c of this.cars) this.cruise(c, t + c.id * 3);
  }

  start(every = 1000) {
    this.timer ??= setInterval(() => this.tick(), every);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Standing at `at` from `t`. */
  private parked(at: Place, t: number): WireDrive {
    return { id: ++this.seq, from: at, nodes: [], to: at, t0: t, s: [0] };
  }

  /** What else is on the road at `t`, but car `except`: the buses and the other robotaxis. */
  private others(except: WaymoCar): (t: number) => Body[] {
    // Their drives laid out once, not every step.
    const cars = this.cars.filter((c) => c !== except).map((c) => ({ cur: asDrive(c.drive), prev: c.prev ? asDrive(c.prev) : null }));
    const out: Body[] = [];
    const pose = { x: 0, z: 0, yaw: 0, s: 0, doors: 0, stop: -1, speed: 0 };
    return (t) => {
      out.length = 0;
      for (const r of BUS_RUNS) {
        const p = poseOf(r, t, pose);
        out.push({ x: p.x, z: p.z, fx: Math.cos(p.yaw), fz: -Math.sin(p.yaw), l: BUS_L, w: BUS_W });
      }
      for (const c of cars) {
        const d = c.prev && t < c.cur.t0 ? c.prev : c.cur;
        const p = pathPoint(d.path, driveAt(d, t).s);
        out.push({ x: p.x, z: p.z, fx: Math.cos(p.yaw), fz: -Math.sin(p.yaw), l: CAR_L, w: CAR_W });
      }
      return out;
    };
  }

  /**
   * A drive for `car` from `from` at `t0` (going `v0`) to `to`: the first of a few tries that nothing
   * runs into (a little later each time, then another way round), or null.
   */
  private plan(car: WaymoCar, from: Place, t0: number, v0: number, to: Place, hold = t0): WireDrive | null {
    const others = this.others(car);
    const avoid = new Set<string>();
    for (let k = 0; k < 6; k++) {
      const nodes = route(from, to, avoid);
      if (!nodes) return null;
      const path = pathOf(from, nodes, to);
      const delay = k < 3 ? k * 4 : (k - 3) * 6;
      const r = drivePath(path, t0, others, k ? 0 : v0, hold + delay);
      if ('drive' in r) return { id: ++this.seq, from, nodes, to, t0, s: r.drive.s };
      // From the third try on, another way round where it went wrong.
      if (k >= 2) {
        const at = placeOn(path, nearestS(path, r.crash.x, r.crash.z));
        if (at) avoid.add(laneKey(at));
      }
    }
    return null;
  }

  /** Where car `c` can be given a new way from, soonest after `t`: a place on a straight bit of lane, when, and how fast. */
  private branch(c: WaymoCar, t: number): { from: Place; t: number; v: number } {
    const d = asDrive(c.drive);
    const end = driveEnd(d);
    for (let u = Math.max(t, d.t0); u < end; u += 0.5) {
      const at = driveAt(d, u);
      const p = placeOn(d.path, at.s);
      // Far enough from the next crossing to turn there, if it has to.
      if (p && p.along <= 56 - 14 && p.along >= 2) return { from: p, t: u, v: at.speed };
    }
    return { from: c.drive.to, t: Math.max(t, end), v: 0 };
  }

  /** Sets `c` off on a new drive from where it can branch after `t`; false if there's no way. */
  private redirect(c: WaymoCar, t: number, to: Place, hold?: number): boolean {
    const b = this.branch(c, t);
    const drive = this.plan(c, b.from, b.t, b.v, to, Math.max(b.t, hold ?? b.t));
    if (!drive) return false;
    // It finishes the bit of its old drive up to where the new one starts.
    c.prev = b.t > this.deps.now() && c.drive.t0 < b.t ? c.drive : undefined;
    c.drive = drive;
    return true;
  }

  /** Somewhere across town for `c` to cruise to, and on its way. */
  private cruise(c: WaymoCar, t: number) {
    const here = waymoAt(c, t);
    for (let k = 0; k < 8; k++) {
      const to = KERB_SPOTS[Math.floor(this.random() * KERB_SPOTS.length)];
      const at = placeAt(to);
      if (Math.hypot(at.x - here.x, at.z - here.z) < CRUISE_MIN) continue;
      if (this.redirect(c, t, to)) {
        c.mode = 'cruise';
        this.deps.changed(c);
        return;
      }
    }
    // Nowhere to go just now: it stays where it is, and tries again in a bit.
    c.mode = 'cruise';
    c.until = t + 5;
    this.deps.changed(c);
  }

  private clear(c: WaymoCar) {
    c.booker = undefined;
    c.initials = undefined;
    c.color = undefined;
    c.dest = undefined;
    c.until = undefined;
    c.riders = WAYMO_SEATS.map(() => null);
  }

  tick() {
    const t = this.deps.now();
    for (const c of this.cars) {
      const done = t >= driveEnd(asDrive(c.drive));
      if (c.prev && t >= c.drive.t0) c.prev = undefined;
      if (c.mode === 'cruise' && done && (c.until === undefined || t >= c.until)) {
        c.until = undefined;
        this.cruise(c, t);
      } else if (c.mode === 'coming' && done) {
        c.mode = 'waiting';
        c.until = t + WAIT_PICKUP;
        this.deps.changed(c);
      } else if (c.mode === 'waiting' && c.until !== undefined && t >= c.until && !c.riders.some(Boolean)) {
        if (c.booker) this.deps.warn(c.booker, '🚕 Dein Waymo hat zu lange gewartet und ist weitergefahren');
        this.clear(c);
        this.cruise(c, t);
      } else if (c.mode === 'riding' && done) {
        c.mode = 'arrived';
        c.until = t + WAIT_ARRIVED;
        this.deps.changed(c);
      } else if (c.mode === 'arrived' && (!c.riders.some(Boolean) || (c.until !== undefined && t >= c.until))) {
        this.clear(c);
        this.cruise(c, t);
      }
    }
  }

  /** The car `id` booked or sits in, if any. */
  private carOf(id: string): WaymoCar | undefined {
    return this.cars.find((c) => c.booker === id || c.riders.includes(id));
  }

  /** What someone may send. */
  message(who: Rider, msg: WaymoClientMsg) {
    const t = this.deps.now();
    const warn = (text: string) => this.deps.warn(who.id, text);
    const mine = this.carOf(who.id);
    switch (msg.t) {
      case 'waymo.book': {
        const dest = destOf(msg.dest);
        if (!dest || typeof msg.x !== 'number' || typeof msg.z !== 'number' || !Number.isFinite(msg.x) || !Number.isFinite(msg.z)) return;
        if (mine) return warn('🚕 Du hast schon ein Waymo');
        const pickup = kerbNear(msg.x, msg.z);
        const drop = kerbNear(dest.x, dest.z);
        if (laneKey(pickup) === laneKey(drop) && Math.abs(pickup.along - drop.along) < 30) return warn('🚕 Da bist du doch schon');
        // The free cars, nearest first; the first that can come, comes.
        const at = placeAt(pickup);
        const free = this.cars.filter((c) => c.mode === 'cruise').sort((a, b) => dist(waymoAt(a, t), at) - dist(waymoAt(b, t), at));
        // Of the nearest few, the one that gets there first (the nearest may be heading away).
        let best: { c: WaymoCar; drive: WireDrive; prev?: WireDrive; eta: number } | null = null;
        for (const c of free.slice(0, 4)) {
          const keep = { drive: c.drive, prev: c.prev };
          if (!this.redirect(c, t + 1, pickup)) continue;
          const eta = driveEnd(asDrive(c.drive));
          if (!best || eta < best.eta) best = { c, drive: c.drive, prev: c.prev, eta };
          c.drive = keep.drive;
          c.prev = keep.prev;
        }
        if (best) {
          const c = best.c;
          c.drive = best.drive;
          c.prev = best.prev;
          c.mode = 'coming';
          c.booker = who.id;
          c.initials = initialsOf(who.name);
          c.color = who.color;
          c.dest = dest;
          c.until = undefined;
          this.deps.changed(c);
          return;
        }
        return warn('🚕 Gerade ist kein Waymo frei, versuch es gleich nochmal');
      }
      case 'waymo.cancel': {
        if (!mine || mine.booker !== who.id || (mine.mode !== 'coming' && mine.mode !== 'waiting')) return;
        this.clear(mine);
        mine.mode = 'cruise';
        this.cruise(mine, t);
        this.deps.changed(mine);
        return;
      }
      case 'waymo.enter': {
        const c = this.cars[typeof msg.car === 'number' ? msg.car : -1];
        // Into the one you booked, or any that's waiting (a friend's); not into two.
        if (!c || (mine && (mine !== c || c.riders.includes(who.id)))) return;
        if (c.mode !== 'waiting') return warn('🚕 Dieses Waymo ist nicht für dich da');
        const seat = c.riders.indexOf(null);
        if (seat < 0) return warn('🚕 Alle Plätze sind besetzt');
        c.riders[seat] = who.id;
        c.until = t + WAIT_PICKUP;
        this.deps.changed(c);
        return;
      }
      case 'waymo.leave': {
        if (!mine) return;
        const seat = mine.riders.indexOf(who.id);
        if (seat < 0) return;
        if (mine.mode === 'riding') return warn('🚕 Während der Fahrt bleiben die Türen zu: „Rechts ran" hält an');
        mine.riders[seat] = null;
        this.deps.changed(mine);
        return;
      }
      case 'waymo.go': {
        if (!mine || mine.mode !== 'waiting' || !mine.riders.includes(who.id) || !mine.dest) return;
        if (!this.redirect(mine, t, kerbNear(mine.dest.x, mine.dest.z), t + DOORS)) return warn('🚕 Gerade kommt das Waymo nicht los, versuch es gleich nochmal');
        mine.mode = 'riding';
        mine.until = undefined;
        this.deps.changed(mine);
        return;
      }
      case 'waymo.pullover': {
        if (!mine || mine.mode !== 'riding' || !mine.riders.includes(who.id)) return;
        const here = waymoAt(mine, t + 6);
        if (!this.redirect(mine, t, kerbNear(here.x, here.z))) return warn('🚕 Hier kann es gerade nicht halten');
        mine.dest = { name: 'Rechts ran', x: here.x, z: here.z };
        this.deps.changed(mine);
        return;
      }
      case 'waymo.honk': {
        if (mine && mine.booker === who.id) this.deps.honked(mine.id);
        return;
      }
    }
  }

  /** Someone's gone (out of the office, or off their floor): out of their car, and their booking's off. */
  gone(id: string) {
    const t = this.deps.now();
    for (const c of this.cars) {
      const seat = c.riders.indexOf(id);
      if (seat >= 0) c.riders[seat] = null;
      if (c.booker === id && (c.mode === 'coming' || (c.mode === 'waiting' && !c.riders.some(Boolean)))) {
        this.clear(c);
        c.mode = 'cruise';
        this.cruise(c, t);
      }
      if (seat >= 0 || c.booker === id) this.deps.changed(c);
    }
  }
}

const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

/** How far along `path` the point nearest (x, z) is. */
function nearestS(path: { xs: Float64Array; zs: Float64Array }, x: number, z: number): number {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < path.xs.length; i++) {
    const d = (path.xs[i] - x) ** 2 + (path.zs[i] - z) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best * 0.5;
}

export type { Drive };
