import test from 'node:test';
import assert from 'node:assert/strict';
import { CITY_ROAD, CITY_X, CITY_Z, CROSSINGS, LOTS, PERIOD, onCityStreet } from '../src/shared/city.js';
import { LOT, SIDE_LOT } from '../src/shared/garage.js';
import { FLOOR, GOLF_HOLE, ROAD, WALL_T } from '../src/shared/layout.js';
import { STREET_END } from '../src/shared/scenic.js';
import { CASINO_BOX } from '../src/shared/casino.js';
import { GYM_STREET_BOX } from '../src/shared/gym.js';
import { HALL_BOX } from '../src/shared/hall.js';
import { SOCCER_BOX } from '../src/shared/soccer.js';
import { FURNITURE } from '../src/shared/streetside.js';
import { BAND_MIN, CORNERS, CURB_AT, WALKS, ZEBRA_AT, onRoad, shopFaces, walkCoords } from '../src/shared/sidewalks.js';
import { EPOCH, SLOTS, bodyAt, density, epochOf, planFor, type Body, type Plan } from '../src/shared/passersby.js';

// flrnoh fork (see FORK.md): the city's passers-by (shared/sidewalks.ts, shared/passersby.ts, drawn
// by client/world/town/people.ts).

type Rect = { minX: number; maxX: number; minZ: number; maxZ: number };
const inside = (r: Rect, x: number, z: number, pad = 0) => x > r.minX - pad && x < r.maxX + pad && z > r.minZ - pad && z < r.maxZ + pad;
const H = CITY_ROAD / 2;
const T0 = 1_790_000_000;

/** The road itself: a street's asphalt, but not the paved corners of a crossing, which are the sidewalks' corners. */
function roadway(x: number, z: number): boolean {
  if (!onRoad(x, z)) return false;
  const a = Math.round((x - CITY_X) / PERIOD);
  const b = Math.round((z - CITY_Z) / PERIOD);
  const dx = Math.abs(x - (CITY_X + PERIOD * a));
  const dz = Math.abs(z - (CITY_Z + PERIOD * b));
  return !(dx > H && dz > H);
}

/** Plans for every slot over a few epochs, by day and at night. */
/** The buildings' footprints, in 16 m squares, to look up the ones near (x, z). */
const LOT_GRID = new Map<string, Rect[]>();
for (const l of LOTS) {
  const r = { minX: l.x - l.w / 2, maxX: l.x + l.w / 2, minZ: l.z - l.d / 2, maxZ: l.z + l.d / 2 };
  for (let i = Math.floor(r.minX / 16); i <= Math.floor(r.maxX / 16); i++) for (let j = Math.floor(r.minZ / 16); j <= Math.floor(r.maxZ / 16); j++) LOT_GRID.set(`${i},${j}`, [...(LOT_GRID.get(`${i},${j}`) ?? []), r]);
}
const lotsNear = (x: number, z: number) => LOT_GRID.get(`${Math.floor(x / 16)},${Math.floor(z / 16)}`) ?? [];

const PLANS: Plan[] = [];
for (const day of [1, 0]) {
  for (const s of SLOTS) {
    for (let k = 0; k < 3; k++) {
      const { epoch } = epochOf(s, T0 + k * EPOCH);
      const p = planFor(s, epoch, day);
      if (p) PLANS.push(p);
    }
  }
}

/** Where everyone of `p` is, every quarter of a second of it. */
function* samples(p: Plan): Generator<[Body, 0 | 1 | 2, Plan['legs'][number]]> {
  const b = {} as Body;
  for (let t = p.start; t < p.end; t += 0.25) {
    const leg = p.legs.find((l) => l.t0 <= t && t < l.t1) ?? p.legs[p.legs.length - 1];
    for (const who of [0, 1, 2] as const) {
      if (who === 1 && p.company !== 'pair') continue;
      if (who === 2 && p.company !== 'dog') continue;
      if (bodyAt(p, t, who, b) && b.out) yield [b, who, leg];
    }
  }
}

test('there are sidewalks round the town, joined up at its corners, with benches, bus stops and shops', () => {
  assert.ok(WALKS.length > 80, `${WALKS.length} walks`);
  assert.ok(WALKS.filter((w) => w.main).length >= 4, "the office's street has its sidewalks");
  const spots = WALKS.flatMap((w) => w.spots);
  for (const k of ['bench', 'bus', 'stop', 'window', 'door'] as const) assert.ok(spots.some((s) => s.kind === k), `no ${k}`);
  for (const c of CORNERS) assert.ok(c.links.length > 0, `a corner at (${c.x}, ${c.z}) goes nowhere`);
  // Across a street only at a crossing, and never across the office's own street.
  for (const c of CORNERS) {
    for (const l of c.links) {
      if (l.kind !== 'cross') continue;
      const [[x0, z0], [x1, z1]] = l.path;
      const k = CROSSINGS.find((q) => q.a === c.a && q.b === c.b)!;
      const alongX = Math.abs(x1 - x0) > 1;
      assert.ok(alongX ? Math.abs(Math.abs(z0 - k.z) - ZEBRA_AT) < 1e-6 && Math.abs(Math.abs(x0 - k.x) - CURB_AT) < 1e-6 : Math.abs(Math.abs(x0 - k.x) - ZEBRA_AT) < 1e-6 && Math.abs(Math.abs(z0 - k.z) - CURB_AT) < 1e-6, `a crossing off its zebra at (${k.x}, ${k.z})`);
      assert.ok(!(k.b === 0 && !alongX), `across the office's street at x ${k.x}`);
    }
  }
});

test('the doors and shop windows they go to are on the shop fronts world/town/shops.ts draws', async () => {
  const { hasShops, streetSides } = await import('../src/client/world/town/shops.js');
  let faces = 0;
  for (const lot of LOTS) {
    if (!hasShops(lot)) continue;
    const sides = streetSides(lot);
    for (const f of shopFaces(lot)) {
      faces++;
      const on = f.n[1] > 0 ? sides.pz : f.n[1] < 0 ? sides.nz : f.n[0] > 0 ? sides.px : sides.nx;
      assert.ok(on, `a door on a side of the building at (${lot.x.toFixed(0)}, ${lot.z.toFixed(0)}) that's no shop front`);
    }
  }
  assert.ok(faces > 30, `${faces} shop fronts`);
});

test('everyone comes out of a shop door and goes into another', () => {
  assert.ok(PLANS.length > SLOTS.length, `${PLANS.length} walks`);
  for (const p of PLANS) {
    assert.equal(p.legs[0].act, 'door');
    assert.equal(p.legs[p.legs.length - 1].act, 'door');
    assert.ok(p.end - p.start <= EPOCH - 6, 'a walk longer than its epoch');
    const start = p.epoch * EPOCH - SLOTS[p.slot].phase;
    assert.ok(p.start >= start && p.end <= start + EPOCH, 'a walk outside its epoch');
    for (let k = 1; k < p.legs.length; k++) assert.ok(Math.abs(p.legs[k].t0 - p.legs[k - 1].t1) < 1e-6 && Math.hypot(p.legs[k].ax - p.legs[k - 1].bx, p.legs[k].az - p.legs[k - 1].bz) < 1e-6, 'a jump in a walk');
  }
});

test('they keep to the sidewalks: on the road only across a zebra, never in a building, a lot or the office', () => {
  const keepOut: Rect[] = [
    { minX: FLOOR.minX - WALL_T, maxX: FLOOR.maxX + WALL_T, minZ: FLOOR.minZ - WALL_T, maxZ: FLOOR.maxZ + WALL_T },
    LOT,
    SIDE_LOT,
    CASINO_BOX,
    HALL_BOX,
    SOCCER_BOX,
    GYM_STREET_BOX,
    // The golf hole's fairway and green across the street.
    { minX: GOLF_HOLE.fairway[0], maxX: GOLF_HOLE.fairway[1], minZ: ROAD.maxZ + 2.3, maxZ: GOLF_HOLE.z + GOLF_HOLE.green },
  ];
  let n = 0;
  let crossing = 0;
  for (const p of PLANS) {
    for (const [b, who, leg] of samples(p)) {
      n++;
      const pad = who === 2 ? 0.1 : 0.2;
      for (const r of keepOut) assert.ok(!inside(r, b.x, b.z), `someone at (${b.x.toFixed(1)}, ${b.z.toFixed(1)}) on the office's ground or across the street (${leg.act})`);
      for (const l of lotsNear(b.x, b.z)) assert.ok(!inside(l, b.x, b.z, -pad - 0.15), `someone (${who}, ${leg.act}) in a building at (${b.x.toFixed(2)}, ${b.z.toFixed(2)})`);
      if (roadway(b.x, b.z)) {
        crossing++;
        assert.ok(leg.act === 'cross' || leg.act === 'walk', `someone ${leg.act} in the road at (${b.x.toFixed(1)}, ${b.z.toFixed(1)})`);
        // Out on the road only on a zebra (or, on the office's street, straight over a side street's mouth).
        const near = CROSSINGS.some((c) => Math.abs(b.x - c.x) < H + CITY_ROAD && Math.abs(b.z - c.z) < H + CITY_ROAD);
        assert.ok(near, `someone in the road away from a crossing at (${b.x.toFixed(1)}, ${b.z.toFixed(1)})`);
      }
      // Along a sidewalk: within it, and round the lamps, bollards, trees and the bus stops' poles.
      // (The dog trails a step behind, on the leg they were on then.)
      if (leg.walk >= 0 && who < 2) {
        const w = WALKS[leg.walk];
        const [, off] = walkCoords(w, b.x, b.z);
        assert.ok(off >= BAND_MIN - 1e-6 && off <= w.bandMax + 1e-6, `off the sidewalk at (${b.x.toFixed(1)}, ${b.z.toFixed(1)}): ${off.toFixed(2)}`);
        for (const post of w.posts) {
          const [a] = walkCoords(w, b.x, b.z);
          const d = Math.hypot(a - post.at, off - post.off);
          assert.ok(d >= post.r + (who === 2 ? 0.12 : 0.2), `someone walks into a post at (${b.x.toFixed(1)}, ${b.z.toFixed(1)}): ${d.toFixed(2)}`);
        }
      }
    }
  }
  assert.ok(n > 100_000, `${n} samples`);
  assert.ok(crossing > 100, 'nobody crosses a street');
});

test('they walk round the benches, trees and bus stops on the strip', () => {
  // What stands on the strip, as world/town/furniture.ts draws it: [x, z, radius].
  const solid: [number, number, number][] = [];
  const local = (f: (typeof FURNITURE)[number], lx: number, lz: number): [number, number] => [f.x + lx * Math.cos(f.yaw) + lz * Math.sin(f.yaw), f.z - lx * Math.sin(f.yaw) + lz * Math.cos(f.yaw)];
  for (const f of FURNITURE) {
    if (f.kind === 'tree') solid.push([f.x, f.z, 0.2 * f.k]);
    if (f.kind === 'bench' || f.kind === 'bin') solid.push([...local(f, f.kind === 'bench' ? 1.35 : 0, 0), 0.28]);
    if (f.kind === 'bus') for (const [lx, lz, r] of [[2.1, 0.5, 0.05], [-1.4, -0.6, 0.06], [1.4, -0.6, 0.06]]) solid.push([...local(f, lx, lz), r]);
  }
  // In 4 m squares, to look up what's near.
  const grid = new Map<string, [number, number, number][]>();
  for (const s of solid) {
    const k = `${Math.floor(s[0] / 4)},${Math.floor(s[1] / 4)}`;
    grid.set(k, [...(grid.get(k) ?? []), s]);
  }
  const near = (x: number, z: number) => {
    const out: [number, number, number][] = [];
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) out.push(...(grid.get(`${Math.floor(x / 4) + i},${Math.floor(z / 4) + j}`) ?? []));
    return out;
  };
  for (const p of PLANS) {
    for (const [b, , leg] of samples(p)) {
      if (leg.act === 'sit') continue;
      for (const [x, z, r] of near(b.x, b.z)) assert.ok(Math.hypot(b.x - x, b.z - z) > r + 0.12, `someone walks through street furniture at (${b.x.toFixed(1)}, ${b.z.toFixed(1)})`);
    }
  }
});

test('the same time gives the same people at the same places', () => {
  for (const s of SLOTS.filter((_, i) => i % 7 === 0)) {
    for (const t of [T0, T0 + 61.5, T0 + 777.25]) {
      const { epoch } = epochOf(s, t);
      const a = planFor(s, epoch, 0.8);
      const b = planFor(s, epoch, 0.8);
      assert.deepEqual(a, b);
      if (!a) continue;
      for (const who of [0, 1, 2] as const) assert.deepEqual(bodyAt(a, t, who), bodyAt(b!, t, who));
    }
  }
  // And not the same people every epoch.
  const s = SLOTS.find((q) => planFor(q, 0, 1) && planFor(q, 1, 1))!;
  const plans = Array.from({ length: 12 }, (_, k) => planFor(s, k, 1));
  assert.ok(new Set(plans.map((p) => p && `${p.seed},${p.end - p.start}`)).size > 6);
});

test('plenty out by day round the office, fewer at night', () => {
  const count = (px: number, pz: number, day: number) => {
    let total = 0;
    const N = 24;
    for (let k = 0; k < N; k++) {
      const t = T0 + k * 41.7;
      for (const s of SLOTS) {
        if (Math.hypot(s.x - px, s.z - pz) > 260) continue;
        const p = planFor(s, epochOf(s, t).epoch, day);
        if (!p) continue;
        const b = bodyAt(p, t, 0);
        if (b && b.out && Math.hypot(b.x - px, b.z - pz) < 120) total += p.company === 'pair' ? 2 : 1;
      }
    }
    return total / N;
  };
  const day = count(0, 27, 1);
  const night = count(0, 27, 0);
  assert.ok(day >= 60 && day <= 150, `${day.toFixed(0)} out by day round the office`);
  assert.ok(night < day / 2 && night > 10, `${night.toFixed(0)} out at night, ${day.toFixed(0)} by day`);
  assert.ok(density(0.5) > density(0) && density(1) > density(0.5));
  // Out in the town too, a couple of blocks off.
  assert.ok(count(-84, -29, 1) >= 60, 'a couple of blocks off');
});

test('nobody is on the road outside town or on the scenic loop', () => {
  for (const p of PLANS.slice(0, 600)) for (const [b] of samples(p)) assert.ok(Math.abs(b.x) < STREET_END + 260 && (onCityStreet(b.x, b.z) || !roadway(b.x, b.z)));
});
