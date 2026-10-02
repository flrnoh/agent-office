import { CROSSINGS } from './city.js';
import { mulberry32 } from './rng.js';
import { CORNERS, END_IN, INNER, OUTER, WALKS, detour, walkCoords, walkPoint, type Corner, type Spot, type Walk } from './sidewalks.js';
import { SHOPS } from './shops.js';
import { shopOpen } from './shopfronts.js';
import './shop-outside.js'; // fork: the café tables' spots, on the walks before anyone plans a walk

// flrnoh fork (see FORK.md): the city's passers-by, the same for everyone. Nothing about them goes over
// the wire: each is a slot at a crossing, and what a slot does is worked out from the office's clock
// alone. Time is cut into epochs (EPOCH seconds, each slot's own phase); in each, a slot may be out:
// someone steps out of a shop door near its crossing, walks the sidewalks for a while (round corners,
// across the zebras, now and then sitting on a bench, waiting at a bus stop or looking into a shop
// window), and goes into another shop. Alone, two together, or with a dog. Fewer at night. The same
// slot, epoch and hour give the same walk on every page (see planFor), so everyone sees the same people
// at the same places; client/world/town/people.ts draws them and lets them step aside for you.

/** One outing's window: a slot's walk fits in it. */
export const EPOCH = 200;
/** How many slots wait at each crossing, and how far out from the office the crossings with slots go. */
export const SLOTS_PER_CROSSING = 12;
export const HOME_RADIUS = 250;
/** How far a walk strays from its crossing before it heads back. */
const STRAY = 110;
/** How many corners at most a walk goes round. */
const MAX_STEPS = 14;

/** Out for a walk this epoch, by how light it is (`day` 0 at night, 1 by day). */
export const density = (day: number) => 0.28 + 0.66 * Math.min(1, Math.max(0, day));

export interface Slot {
  id: number;
  /** The corner it starts out from, and where that is. */
  home: number;
  x: number;
  z: number;
  phase: number;
  seed: number;
}

/** What someone is doing on a leg of their walk. */
export type Act = 'walk' | 'cross' | 'wait' | 'sit' | 'look' | 'door';
export type Company = 'alone' | 'pair' | 'dog';

/** A stretch of a walk: from (ax, az) to (bx, bz) between t0 and t1 (or staying put, facing `yaw`). */
export interface Leg {
  t0: number;
  t1: number;
  ax: number;
  az: number;
  bx: number;
  bz: number;
  act: Act;
  /** Along a sidewalk: the walk it's on (for going round what stands there), or -1. */
  walk: number;
  yaw: number;
  /** Two together stand this far either side of the middle (a bench's two seats); 0: one behind the other. */
  spread: number;
  /** Through a door: the shop front's point and its way out. */
  door?: [number, number, number, number];
}

export interface Plan {
  slot: number;
  epoch: number;
  start: number;
  end: number;
  company: Company;
  /** For who they are: their looks, clothes and size are drawn from this (see world/town/people.ts). */
  seed: number;
  speed: number;
  /** Coming out of the shop with a bag. */
  bag: boolean;
  legs: Leg[];
}

const mix = (a: number, b: number) => {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b | 0, 0x27d4eb2f);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
};

function laySlots(): Slot[] {
  const slots: Slot[] = [];
  for (const c of CROSSINGS) {
    if (Math.hypot(c.x, c.z) > HOME_RADIUS) continue;
    const homes = CORNERS.filter((k) => k.a === c.a && k.b === c.b && k.links.some((l) => l.kind === 'walk'));
    if (!homes.length) continue;
    for (let k = 0; k < SLOTS_PER_CROSSING; k++) {
      const seed = mix(mix(c.a + 1000, c.b + 1000), k);
      const home = homes[k % homes.length];
      slots.push({ id: slots.length, home: home.id, x: home.x, z: home.z, phase: (seed % 10007) / 10007 * EPOCH, seed });
    }
  }
  return slots;
}

/** Every slot, at the crossings round the office. */
export const SLOTS: readonly Slot[] = laySlots();

/** The epoch `slot` is in at `t` (seconds on the office's clock), and when it started. */
export function epochOf(slot: Slot, t: number): { epoch: number; start: number } {
  const epoch = Math.floor((t + slot.phase) / EPOCH);
  return { epoch, start: epoch * EPOCH - slot.phase };
}

/** The lane someone going `dir` along `w` keeps to: on the right, the curb's or the shops' side. */
function laneOf(w: Walk, dir: number, company: Company): number {
  const curb = w.alongX ? dir === -w.side : dir === w.side;
  if (company === 'pair') return curb ? INNER + 0.15 : OUTER - 0.15;
  return curb ? INNER : OUTER;
}

/** How many corners from each corner to the nearest walk with a shop door (for heading home). */
const DOOR_HOPS: number[] = (() => {
  const hasDoor = (w: Walk) => w.spots.some((s) => s.kind === 'door');
  const dist = CORNERS.map((c) => (c.links.some((l) => l.kind === 'walk' && hasDoor(WALKS[l.walk])) ? 0 : Infinity));
  const queue = CORNERS.filter((_, i) => dist[i] === 0).map((c) => c.id);
  for (let q = 0; q < queue.length; q++) {
    const c = CORNERS[queue[q]];
    for (const n of neighbours(c)) {
      if (dist[n] !== Infinity) continue;
      dist[n] = dist[c.id] + 1;
      queue.push(n);
    }
  }
  return dist;
})();

/** The corners one link or one walk away. */
function neighbours(c: Corner): number[] {
  const out: number[] = [];
  for (const l of c.links) {
    if (l.kind === 'walk') {
      const other = WALKS[l.walk].ends[l.end === 0 ? 1 : 0];
      if (other >= 0) out.push(other);
    } else out.push(l.to);
  }
  return out;
}

/** Puts a walk together a leg at a time, from t = 0. */
class Route {
  legs: Leg[] = [];
  t = 0;
  constructor(
    public x: number,
    public z: number,
    private speed: number,
  ) {}
  to(x: number, z: number, act: Act, walk = -1, pace = 1, spread = 0.3) {
    const d = Math.hypot(x - this.x, z - this.z);
    if (d < 0.01) return;
    const dt = d / (this.speed * pace);
    this.legs.push({ t0: this.t, t1: this.t + dt, ax: this.x, az: this.z, bx: x, bz: z, act, walk, yaw: Math.atan2(x - this.x, z - this.z), spread });
    this.t += dt;
    this.x = x;
    this.z = z;
  }
  stay(dt: number, act: Act, yaw: number, spread: number) {
    this.legs.push({ t0: this.t, t1: this.t + dt, ax: this.x, az: this.z, bx: this.x, bz: this.z, act, walk: -1, yaw, spread });
    this.t += dt;
  }
  door(s: Spot, out: boolean) {
    const n: [number, number] = [-Math.sin(s.yaw), -Math.cos(s.yaw)];
    const fx = s.x - n[0] * 0.55;
    const fz = s.z - n[1] * 0.55;
    const inside = s.inside!;
    if (out) {
      this.x = inside.x;
      this.z = inside.z;
      this.to(s.x, s.z, 'door');
    } else this.to(inside.x, inside.z, 'door');
    this.legs[this.legs.length - 1].door = [fx, fz, n[0], n[1]];
  }
}

/** Someone's walk out of `start` (a shop door) round `steps` corners, and into another shop, or null if it doesn't fit. */
function walkFrom(r: () => number, slot: Slot, start: Spot, steps: number, company: Company, speed: number, shut: (s: Spot) => boolean): Route | null {
  const route = new Route(0, 0, speed);
  route.door(start, true);
  let w = WALKS[start.walk];
  let dir = r() < 0.5 ? 1 : -1;
  let lane = laneOf(w, dir, company);
  let along = start.along;
  route.to(...walkPoint(w, along, lane), 'walk');
  let stops = company === 'dog' ? 1 : 2;
  const home = CORNERS[slot.home];
  /** Along `w` to `to`, stopping at what's on the way now and then. */
  const walkAlong = (to: number, seek: boolean) => {
    for (const s of w.spots) {
      if ((s.along - along) * dir <= 0.5 || (to - s.along) * dir <= 0.5 || shut(s)) continue;
      if (seek && s.kind === 'door') return s;
      if (stops <= 0 || s.kind === 'door') continue;
      const p = { bench: 0.2, bus: 0.35, stop: 0.18, window: 0.1, cafe: 0.3 }[s.kind];
      if (r() >= p) continue;
      stops--;
      route.to(...walkPoint(w, s.along, lane), 'walk', w.id);
      // At a café table, someone alone takes the one chair; two take both (see Spot.solo).
      const [sx, sz] = s.solo && company !== 'pair' ? s.solo : [s.x, s.z];
      route.to(sx, sz, 'walk');
      const sit = s.kind === 'bench' || s.kind === 'bus' || s.kind === 'cafe';
      const dt = s.kind === 'window' ? 4 + r() * 6 : s.kind === 'stop' ? 12 + r() * 25 : s.kind === 'cafe' ? 25 + r() * 40 : sit ? 14 + r() * 30 : 0;
      route.stay(dt, sit ? 'sit' : s.kind === 'stop' ? 'wait' : 'look', s.yaw, s.spread);
      route.to(...walkPoint(w, s.along, lane), 'walk');
      along = s.along;
    }
    route.to(...walkPoint(w, to, lane), 'walk', w.id);
    along = to;
    return null;
  };
  for (let step = 0; step < MAX_STEPS; step++) {
    const seek = step >= steps;
    const end = dir > 0 ? w.to - END_IN : w.from + END_IN;
    const door = walkAlong(end, seek);
    if (door) {
      route.to(...walkPoint(w, door.along, lane), 'walk', w.id);
      route.to(door.x, door.z, 'walk');
      route.door(door, false);
      return route;
    }
    const cid = w.ends[dir > 0 ? 1 : 0];
    if (cid < 0) {
      // The sidewalk stops here: back the other way.
      dir = -dir;
      lane = laneOf(w, dir, company);
      route.to(...walkPoint(w, along, lane), 'walk');
      continue;
    }
    // Round the corner: onto another walk from here, or across (or on) to the next corner and onto one from there.
    const c = CORNERS[cid];
    const options: { w: Walk; at: Corner; via?: (typeof c.links)[number]; weight: number }[] = [];
    const add = (at: Corner, via?: (typeof c.links)[number]) => {
      for (const l of at.links) {
        if (l.kind !== 'walk' || l.walk === w.id) continue;
        const next = WALKS[l.walk];
        const far = next.ends[l.end === 0 ? 1 : 0];
        const mid = walkPoint(next, (next.from + next.to) / 2, 5);
        let weight = via && via.kind !== 'walk' && via.road ? 0.9 : 1;
        if (Math.hypot(mid[0] - home.x, mid[1] - home.z) > STRAY) weight *= 0.12;
        if (seek) weight = next.spots.some((s) => s.kind === 'door' && !shut(s)) ? 50 : far >= 0 ? 1 / (1 + DOOR_HOPS[far] * 4) : 0.05;
        options.push({ w: next, at, via, weight });
      }
    };
    add(c);
    for (const l of c.links) if (l.kind !== 'walk') add(CORNERS[l.to], l);
    if (!options.length) {
      dir = -dir;
      lane = laneOf(w, dir, company);
      route.to(...walkPoint(w, along, lane), 'walk');
      continue;
    }
    let pick = r() * options.reduce((s, o) => s + o.weight, 0);
    const o = options.find((p) => (pick -= p.weight) <= 0) ?? options[options.length - 1];
    route.to(c.x, c.z, 'walk');
    if (o.via && o.via.kind !== 'walk') {
      const path = o.via.path;
      if (o.via.road) {
        route.to(path[0][0], path[0][1], 'walk');
        // At the curb: a look either way first, now and then.
        const across = Math.atan2(path[1][0] - path[0][0], path[1][1] - path[0][1]);
        if (r() < 0.6) route.stay(0.6 + r() * 2.4, 'wait', across, 0.3);
        route.to(path[1][0], path[1][1], 'cross', -1, 1.12);
      }
      route.to(o.at.x, o.at.z, 'walk');
    }
    // Onto the next walk at the end by this corner, going away from it.
    const next = o.w;
    const atStart = next.ends[0] === o.at.id;
    w = next;
    dir = atStart ? 1 : -1;
    lane = laneOf(w, dir, company);
    along = atStart ? w.from + END_IN : w.to - END_IN;
    route.to(...walkPoint(w, along, lane), 'walk');
  }
  return null;
}

/**
 * What `slot` does in `epoch`, out on a day as light as `day` (0–1), or null if it stays in. The same
 * numbers on every page, so the same walk. `hourAt` (seconds on the office's clock → the hour of its
 * day, see shopfronts.ts skyHour) keeps them out of shops that are shut at either end of the epoch,
 * and off their café tables; without it every shop is open.
 */
export function planFor(slot: Slot, epoch: number, day: number, hourAt?: (t: number) => number): Plan | null {
  const r = mulberry32(mix(slot.seed, epoch));
  if (r() >= density(day)) return null;
  const seed = mix(slot.seed ^ 0x5bd1e995, epoch);
  const roll = r();
  const company: Company = roll < 0.2 ? 'pair' : roll < 0.32 ? 'dog' : 'alone';
  const speed = company === 'pair' ? 1 + r() * 0.25 : company === 'dog' ? 1 + r() * 0.35 : r() < 0.15 ? 0.75 + r() * 0.2 : 1.05 + r() * 0.55;
  const home = CORNERS[slot.home];
  // Out of a shop door near its crossing: on a walk from its corner, or one across the street from it.
  const near = new Set<number>();
  for (const l of home.links) {
    if (l.kind === 'walk') near.add(l.walk);
    else for (const m of CORNERS[l.to].links) if (m.kind === 'walk') near.add(m.walk);
  }
  const t0 = epoch * EPOCH - slot.phase;
  const h0 = hourAt?.(t0);
  const h1 = hourAt?.(t0 + EPOCH);
  const shut = (s: Spot) => s.shop !== undefined && h0 !== undefined && h1 !== undefined && !(shopOpen(SHOPS[s.shop].kind, h0) && shopOpen(SHOPS[s.shop].kind, h1));
  const doors = [...near].flatMap((id) => WALKS[id].spots.filter((s) => s.kind === 'door' && !shut(s)));
  if (!doors.length) return null;
  const start = doors[Math.floor(r() * doors.length)];
  const bag = r() < 0.3;
  const want = 1 + Math.floor(r() * 5);
  for (let steps = want; steps >= 0; steps--) {
    const route = walkFrom(mulberry32(mix(seed, steps)), slot, start, steps, company, speed, shut);
    if (!route || route.t > EPOCH - 6) continue;
    const at = t0 + 2 + r() * (EPOCH - 4 - route.t);
    for (const l of route.legs) {
      l.t0 += at;
      l.t1 += at;
    }
    return { slot: slot.id, epoch, start: at, end: at + route.t, company, seed, speed, bag, legs: route.legs };
  }
  return null;
}

/** Where one of the party is at `t`: the walker (0), the one beside them (1), or the dog (2). */
export interface Body {
  x: number;
  z: number;
  /** Which way they face (their forward is +z turned by `yaw`). */
  yaw: number;
  act: Act;
  /** Walking, and how fast. */
  speed: number;
  /** Out of the shop: not behind its front. */
  out: boolean;
  /** The walk they're on (a sidewalk, to step aside within), or -1. */
  walk: number;
}

/** The leg of `plan` under way at `t` (within it), and where on it the middle of the party is. */
function legAt(plan: Plan, t: number): { l: Leg; x: number; z: number } {
  const legs = plan.legs;
  let lo = 0;
  let hi = legs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (legs[mid].t0 <= t) lo = mid;
    else hi = mid - 1;
  }
  const l = legs[lo];
  const f = l.t1 > l.t0 ? Math.min(1, Math.max(0, (t - l.t0) / (l.t1 - l.t0))) : 1;
  return { l, x: l.ax + (l.bx - l.ax) * f, z: l.az + (l.bz - l.az) * f };
}

const moves = (l: Leg) => l.act === 'walk' || l.act === 'cross' || l.act === 'door';

/** Where `who` of `plan`'s party is at `t`, or null when they're not out. */
export function bodyAt(plan: Plan, t: number, who: 0 | 1 | 2, into?: Body): Body | null {
  if (t < plan.start || t >= plan.end) return null;
  const now = legAt(plan, t);
  const moving = moves(now.l);
  // The dog trails along where they've just been, on its lead; while they stop, it sits by them.
  const at = who === 2 && moving ? legAt(plan, Math.max(plan.start, t - 0.55)) : now;
  const l = at.l;
  let { x, z } = at;
  const yaw = l.yaw;
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  // Their right hand: forward turned a quarter to the right.
  const rx = -fz;
  const rz = fx;
  if (plan.company === 'pair' && who < 2) {
    const s = (who === 0 ? 1 : -1) * l.spread;
    x += rx * s;
    z += rz * s;
  }
  if (who === 2) {
    if (!moving) {
      // In front of them on a bench, beside them at a shop window, behind them at the curb or the stop.
      const [ox, oz] = l.act === 'sit' ? [fx * 0.6, fz * 0.6] : l.act === 'look' ? [rx * 0.55, rz * 0.55] : [-fx * 0.55, -fz * 0.55];
      x += ox;
      z += oz;
    } else if (l.walk >= 0) {
      // Beside them, toward the middle of the sidewalk from the lane they keep to.
      const w = WALKS[l.walk];
      const [a, off] = walkCoords(w, x, z);
      [x, z] = walkPoint(w, a, off + (off < (INNER + OUTER) / 2 ? 0.45 : -0.45));
    }
  }
  if (l.walk >= 0) {
    const w = WALKS[l.walk];
    const [a, off] = walkCoords(w, x, z);
    [x, z] = walkPoint(w, a, detour(w, a, off, who === 2 ? 0.18 : 0.26));
  }
  let out = true;
  if (l.door) {
    const [px, pz, nx, nz] = l.door;
    out = (x - px) * nx + (z - pz) * nz > (who === 2 ? -0.12 : -0.3);
  }
  const b = into ?? ({} as Body);
  b.x = x;
  b.z = z;
  b.yaw = yaw;
  b.act = now.l.act;
  b.speed = moving ? plan.speed * (now.l.act === 'cross' ? 1.12 : 1) : 0;
  b.out = out;
  b.walk = l.walk;
  return b;
}
