import { BUS_L, BUS_RUNS, BUS_W, poseOf } from '../../shared/citybus.js';
import { CAR_L, CAR_W, SAMPLE, corners, drivePath, driveAt, driveEnd, overlaps, type Body, type Drive } from '../../shared/waymo/drive.js';
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
/** How long after the doors shut it pulls away (s), and how long it keeps trying if it can't (s). */
const DOORS = 1.5;
const GO_TRYING = 30;
/** A block's length (m), for how far round it's worth going. */
const PERIOD_M = 56;
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
  /** Where the last drive that didn't work out went wrong (for the tests and a look from the console). */
  lastCrash: { t: number; x: number; z: number; stuck?: boolean; delay: number } | null = null;
  /** Cars told to set off that couldn't straight away, and till when they keep trying. */
  private readonly going = new Map<number, number>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly random: () => number;
  /** In the middle of a change that's only kept if it holds up (attempt), and the cars it's changed. */
  private trying = false;
  private readonly touched = new Set<WaymoCar>();

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

  /** Car `c` changed: everyone's told now, or (in an attempt) once the change holds up. */
  private mark(c: WaymoCar) {
    if (this.trying) this.touched.add(c);
    else this.deps.changed(c);
  }

  /**
   * Runs `change` (new drives for one or more cars) and keeps what it did only if, afterwards, none of
   * the cars it touched runs into another robotaxi or a bus from now on; else everything's put back as
   * it was, and false. Within another attempt, the outer one checks.
   */
  private attempt(change: () => boolean): boolean {
    if (this.trying) return change();
    const saved = this.cars.map((c) => ({ ...c, riders: [...c.riders] }));
    this.trying = true;
    this.touched.clear();
    let ok = false;
    try {
      ok = change() && this.clean();
    } finally {
      this.trying = false;
    }
    if (!ok) {
      this.cars.forEach((c, i) => {
        const was = saved[i];
        for (const k of ['mode', 'drive', 'prev', 'booker', 'initials', 'color', 'dest', 'riders', 'until'] as const) (c as unknown as Record<string, unknown>)[k] = was[k];
      });
      this.touched.clear();
      return false;
    }
    for (const c of this.touched) this.deps.changed(c);
    this.touched.clear();
    return true;
  }

  /** Each car's drives laid out once, and till when it's on the road (see others). */
  private laidOut(cars: readonly WaymoCar[]) {
    return cars.map((c) => {
      const cur = asDrive(c.drive);
      const end = driveEnd(cur);
      // A cruising car stands at the end of its drive only a moment before it's given its next one
      // (which keeps out of everyone's way): past that it's nowhere. The others stand there till
      // someone's in or out, as long as they wait for them at most.
      const gone = c.mode === 'cruise' ? Math.max(end, c.until ?? 0) + 2 : c.mode === 'coming' ? end + WAIT_PICKUP : c.mode === 'riding' ? end + WAIT_ARRIVED : (c.until ?? end) + 2;
      return { c, cur, prev: c.prev ? asDrive(c.prev) : null, gone };
    });
  }

  /** Where a laid-out car is at `t`, or null if it's off the road by then. */
  private static bodyAt(l: ReturnType<Fleet['laidOut']>[number], t: number, soft = true): Body | null {
    if (t > l.gone) return null;
    const d = l.prev && t < l.cur.t0 ? l.prev : l.cur;
    const p = pathPoint(d.path, driveAt(d, t).s);
    return { x: p.x, z: p.z, fx: Math.cos(p.yaw), fz: -Math.sin(p.yaw), l: CAR_L, w: CAR_W, soft };
  }

  /** What else is on the road at `t`, but car `except`: the buses and the other robotaxis. */
  private others(except: WaymoCar): (t: number) => Body[] {
    const cars = this.laidOut(this.cars.filter((c) => c !== except));
    const out: Body[] = [];
    const pose = { x: 0, z: 0, yaw: 0, s: 0, doors: 0, stop: -1, speed: 0 };
    return (t) => {
      out.length = 0;
      for (const r of BUS_RUNS) {
        const p = poseOf(r, t, pose);
        out.push({ x: p.x, z: p.z, fx: Math.cos(p.yaw), fz: -Math.sin(p.yaw), l: BUS_L, w: BUS_W });
      }
      // The office gives a robotaxi a new way round this one if they'd meet (settle): kept out of the way of, no crash.
      for (const l of cars) {
        const b = Fleet.bodyAt(l, t);
        if (b) out.push(b);
      }
      return out;
    };
  }

  /** Whether the cars touched in this attempt keep clear of every other robotaxi and the buses from now on. */
  private clean(): boolean {
    const touched = [...this.touched];
    if (!touched.length) return true;
    const t = this.deps.now();
    const all = this.laidOut(this.cars);
    const mine = all.filter((l) => this.touched.has(l.c));
    const until = Math.min(t + 600, Math.max(...mine.map((l) => (Number.isFinite(l.gone) ? l.gone : driveEnd(l.cur)))));
    const pose = { x: 0, z: 0, yaw: 0, s: 0, doors: 0, stop: -1, speed: 0 };
    for (let u = t; u <= until; u += SAMPLE) {
      const bodies = all.map((l) => Fleet.bodyAt(l, u));
      const buses = BUS_RUNS.map((r): Body => {
        const p = poseOf(r, u, pose);
        return { x: p.x, z: p.z, fx: Math.cos(p.yaw), fz: -Math.sin(p.yaw), l: BUS_L, w: BUS_W };
      });
      for (const m of mine) {
        const a = bodies[all.indexOf(m)];
        if (!a) continue;
        const me = corners(a);
        for (const o of [...bodies, ...buses]) {
          if (!o || o === a || Math.abs(o.x - a.x) > CAR_L + BUS_L || Math.abs(o.z - a.z) > CAR_L + BUS_L) continue;
          if (overlaps(me, corners(o))) {
            this.lastCrash = { t: u, x: a.x, z: a.z, delay: -1 };
            return false;
          }
        }
      }
    }
    return true;
  }

  /**
   * A drive for `car` from `from` at `t0` (going `v0`) to `to`: the first of a few tries that no bus
   * runs into (a little later each time), or null.
   */
  private plan(car: WaymoCar, from: Place, t0: number, v0: number, to: Place, hold = t0): WireDrive | null {
    const others = this.others(car);
    // Round the lanes where another stands (or will) waiting for someone (but its own ends' lanes), if
    // there's a way round at all: there it'd only queue behind it a while.
    const avoid = new Set<string>(
      this.cars.filter((o) => o !== car && o.mode !== 'cruise').map((o) => laneKey(o.drive.to)).filter((k) => k !== laneKey(from) && k !== laneKey(to)),
    );
    const nodes = route(from, to, avoid, PERIOD_M * 10);
    if (!nodes) return null;
    const path = pathOf(from, nodes, to);
    // A few seconds later each time (the bus that'd have come up behind it at a light has gone by).
    for (const delay of [0, 2, 4, 7, 10, 14, 19, 25, 32, 40]) {
      const r = drivePath(path, t0, others, delay ? 0 : v0, hold + delay);
      if ('drive' in r) return { id: ++this.seq, from, nodes, to, t0, s: r.drive.s };
      this.lastCrash = { ...r.crash, delay };
    }
    return null;
  }

  /** Where car `c` can be given a new way from, soonest after `t`: a place on a straight bit of lane, when, and how fast. */
  private branch(c: WaymoCar, t: number): { from: Place; t: number; v: number } {
    // Still finishing its old drive up to where its new one starts: from there again (the bit before stays).
    if (c.prev && c.drive.t0 > t) return { from: c.drive.from, t: c.drive.t0, v: driveAt(asDrive(c.prev), c.drive.t0).speed };
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
    // It finishes the bit of its old drive up to where the new one starts (or the bit of the one before, still).
    if (!(c.prev && c.drive.t0 > t)) c.prev = b.t > this.deps.now() && c.drive.t0 < b.t ? c.drive : undefined;
    c.drive = drive;
    return true;
  }

  /**
   * After `c`'s been given a new drive (and stands at its end for as long as it waits there): every
   * other car whose drive would now run into it gets a new one to where it was going, round it (and
   * so on for those, a few steps deep). The attempt round it checks it all worked out.
   */
  private settle(c: WaymoCar, depth = 0) {
    const t = this.deps.now();
    const [mine] = this.laidOut([c]);
    for (const o of this.cars) {
      if (o === c) continue;
      const [l] = this.laidOut([o]);
      const end = Math.min(t + 600, driveEnd(l.cur));
      if (end <= t) continue;
      for (let u = t; u <= end; u += SAMPLE) {
        const a = Fleet.bodyAt(l, u);
        const b = Fleet.bodyAt(mine, u);
        if (!a || !b || Math.abs(a.x - b.x) > CAR_L + 1 || Math.abs(a.z - b.z) > CAR_L + 1) continue;
        if (!overlaps(corners(a), corners(b))) continue;
        if (this.redirect(o, t + 0.5, o.drive.to)) {
          this.mark(o);
          // Its new way may now meet a third: settle that too (a few steps deep at most).
          if (depth < 3) this.settle(o, depth + 1);
        }
        break;
      }
    }
  }

  /** Somewhere across town for `c` to cruise to, and on its way. */
  private cruise(c: WaymoCar, t: number) {
    const here = waymoAt(c, t);
    for (let k = 0; k < 8; k++) {
      const to = KERB_SPOTS[Math.floor(this.random() * KERB_SPOTS.length)];
      const at = placeAt(to);
      if (Math.hypot(at.x - here.x, at.z - here.z) < CRUISE_MIN) continue;
      const went = this.attempt(() => {
        if (!this.redirect(c, t, to)) return false;
        c.mode = 'cruise';
        c.until = undefined;
        this.mark(c);
        this.settle(c);
        return true;
      });
      if (went) return;
    }
    // Nowhere to go just now: it stays where it is (the others go round it), and tries again in a bit.
    c.mode = 'cruise';
    c.until = t + 5;
    if (!this.attempt(() => (this.mark(c), this.settle(c), true))) this.mark(c);
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
      const going = this.going.get(c.id);
      if (going !== undefined && c.mode === 'waiting') {
        if (this.setOff(c, t)) continue;
        if (t >= going) {
          this.going.delete(c.id);
          for (const r of c.riders) if (r) this.deps.warn(r, '🚕 Das Waymo kommt hier gerade nicht weg: steig aus und bestell ein neues');
        }
        continue;
      }
      if (c.mode === 'cruise' && done && (c.until === undefined || t >= c.until)) {
        c.until = undefined;
        this.cruise(c, t);
      } else if (c.mode === 'coming' && done) {
        c.mode = 'waiting';
        c.until = t + WAIT_PICKUP;
        this.mark(c);
      } else if (c.mode === 'waiting' && c.until !== undefined && t >= c.until && !c.riders.some(Boolean)) {
        if (c.booker) this.deps.warn(c.booker, '🚕 Dein Waymo hat zu lange gewartet und ist weitergefahren');
        this.clear(c);
        this.cruise(c, t);
      } else if (c.mode === 'riding' && done) {
        c.mode = 'arrived';
        c.until = t + WAIT_ARRIVED;
        this.mark(c);
      } else if (c.mode === 'arrived' && (!c.riders.some(Boolean) || (c.until !== undefined && t >= c.until))) {
        this.clear(c);
        this.cruise(c, t);
      }
    }
  }

  /** Sets `c` off from where it waits to where its riders want to go; false if it can't just now. */
  private setOff(c: WaymoCar, t: number): boolean {
    const dest = c.dest;
    if (!dest) return false;
    const went = this.attempt(() => {
      if (!this.redirect(c, t, this.kerb(dest.x, dest.z, c), t + DOORS)) return false;
      c.mode = 'riding';
      c.until = undefined;
      this.mark(c);
      this.settle(c);
      return true;
    });
    if (went) this.going.delete(c.id);
    return went;
  }

  /** The curb nearest (x, z) on a lane where no other car waits (or is on its way to wait), for `c`. */
  private kerb(x: number, z: number, c?: WaymoCar): Place {
    return kerbNear(x, z, new Set(this.cars.filter((o) => o !== c && o.mode !== 'cruise').map((o) => laneKey(o.drive.to))));
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
        const pickup = this.kerb(msg.x, msg.z);
        const drop = this.kerb(dest.x, dest.z);
        if (laneKey(pickup) === laneKey(drop) && Math.abs(pickup.along - drop.along) < 30) return warn('🚕 Da bist du doch schon');
        // The free cars, nearest first; of the nearest few, the one that gets there first comes (the nearest may be heading away).
        const at = placeAt(pickup);
        const free = this.cars.filter((c) => c.mode === 'cruise').sort((a, b) => dist(waymoAt(a, t), at) - dist(waymoAt(b, t), at));
        const tried: { c: WaymoCar; eta: number }[] = [];
        for (const c of free.slice(0, 4)) {
          const keep = { drive: c.drive, prev: c.prev };
          if (!this.redirect(c, t + 1, pickup)) continue;
          tried.push({ c, eta: driveEnd(asDrive(c.drive)) });
          c.drive = keep.drive;
          c.prev = keep.prev;
        }
        tried.sort((a, b) => a.eta - b.eta);
        for (const { c } of tried) {
          const came = this.attempt(() => {
            if (!this.redirect(c, t + 1, pickup)) return false;
            c.mode = 'coming';
            c.booker = who.id;
            c.initials = initialsOf(who.name);
            c.color = who.color;
            c.dest = dest;
            c.until = undefined;
            this.mark(c);
            this.settle(c);
            return true;
          });
          if (came) return;
        }
        return warn('🚕 Gerade ist kein Waymo frei, versuch es gleich nochmal');
      }
      case 'waymo.cancel': {
        if (!mine || mine.booker !== who.id || (mine.mode !== 'coming' && mine.mode !== 'waiting')) return;
        this.clear(mine);
        mine.mode = 'cruise';
        this.mark(mine);
        this.cruise(mine, t);
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
        this.mark(c);
        return;
      }
      case 'waymo.leave': {
        if (!mine) return;
        const seat = mine.riders.indexOf(who.id);
        if (seat < 0) return;
        if (mine.mode === 'riding') return warn('🚕 Während der Fahrt bleiben die Türen zu: „Rechts ran" hält an');
        mine.riders[seat] = null;
        this.mark(mine);
        return;
      }
      case 'waymo.go': {
        if (!mine || mine.mode !== 'waiting' || !mine.riders.includes(who.id) || !mine.dest) return;
        // If it can't set off this second (traffic), it keeps trying by itself.
        if (!this.setOff(mine, t)) this.going.set(mine.id, t + GO_TRYING);
        return;
      }
      case 'waymo.pullover': {
        if (!mine || mine.mode !== 'riding' || !mine.riders.includes(who.id)) return;
        const here = waymoAt(mine, t + 6);
        const stopped = this.attempt(() => {
          if (!this.redirect(mine, t, this.kerb(here.x, here.z, mine))) return false;
          mine.dest = { name: 'Rechts ran', x: here.x, z: here.z };
          this.mark(mine);
          this.settle(mine);
          return true;
        });
        if (!stopped) warn('🚕 Hier kann es gerade nicht halten');
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
      const booked = c.booker === id;
      if (booked && (c.mode === 'coming' || (c.mode === 'waiting' && !c.riders.some(Boolean)))) {
        this.clear(c);
        c.mode = 'cruise';
        this.cruise(c, t);
      }
      if (seat >= 0 || booked) this.mark(c);
    }
  }
}

const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

export type { Drive };

/** A robotaxi's outline where it is. */
const bodyOf = (p: { x: number; z: number; yaw: number }): Body => ({ x: p.x, z: p.z, fx: Math.cos(p.yaw), fz: -Math.sin(p.yaw), l: CAR_L, w: CAR_W });
