import test from 'node:test';
import assert from 'node:assert/strict';
import { BLOCKS, CITY_ROAD, CITY_WALK, CROSSINGS, LOTS, PARK_TREES, PERIOD, RUNS, STREETS, inTown, lineX, lineZ, onCityStreet, stretchRect } from '../src/shared/city.js';
import { paved } from '../src/shared/garage.js';
import { FLOOR, ROAD, WALL_T } from '../src/shared/layout.js';
import { FARM, LOOP_PAVED, STREET_END, STREET_Z, nearLoop } from '../src/shared/scenic.js';
import { CASINO_BOX } from '../src/shared/casino.js';
import { HALL_BOX } from '../src/shared/hall.js';
import { SOCCER_BOX } from '../src/shared/soccer.js';
import { GYM_STREET_BOX } from '../src/shared/gym.js';

// flrnoh fork (see FORK.md): the one city round the office (shared/city.ts, drawn by world/town/).

type Rect = { minX: number; maxX: number; minZ: number; maxZ: number };
const overlap = (a: Rect, b: Rect, pad = 0) => a.minX < b.maxX + pad && a.maxX > b.minX - pad && a.minZ < b.maxZ + pad && a.maxZ > b.minZ - pad;
const lotRect = (l: (typeof LOTS)[number]): Rect => ({ minX: l.x - l.w / 2, maxX: l.x + l.w / 2, minZ: l.z - l.d / 2, maxZ: l.z + l.d / 2 });
const BUILDING: Rect = { minX: FLOOR.minX - WALL_T, maxX: FLOOR.maxX + WALL_T, minZ: FLOOR.minZ - WALL_T, maxZ: FLOOR.maxZ + WALL_T };

test('there is a city: streets, crossings, blocks of buildings, parks and traffic', () => {
  assert.ok(STREETS.length > 40, `${STREETS.length} streets`);
  assert.ok(CROSSINGS.length > 20, `${CROSSINGS.length} crossings`);
  assert.ok(LOTS.length > 100, `${LOTS.length} buildings`);
  assert.ok(PARK_TREES.length > 0 && BLOCKS.some((b) => b.kind === 'park'));
  assert.ok(RUNS.length > 5, `${RUNS.length} runs of traffic`);
  // Right next to the office, not only far off: a building within a block of it on either side.
  assert.ok(LOTS.some((l) => Math.hypot(l.x, l.z) < 90), 'buildings close by');
});

test('no building stands in a street, on its sidewalk, or on another building', () => {
  for (const s of STREETS) {
    const r = stretchRect(s);
    const walk = s.alongX ? { ...r, minZ: r.minZ - CITY_WALK, maxZ: r.maxZ + CITY_WALK } : { ...r, minX: r.minX - CITY_WALK, maxX: r.maxX + CITY_WALK };
    for (const l of LOTS) assert.ok(!overlap(lotRect(l), walk), `a building at (${l.x.toFixed(0)}, ${l.z.toFixed(0)}) in the street ${JSON.stringify(s)}`);
  }
  // Nor in the office's own street, its sidewalks included.
  const street: Rect = { minX: -STREET_END, maxX: STREET_END, minZ: ROAD.minZ - 3, maxZ: ROAD.maxZ + 3 };
  for (const l of LOTS) assert.ok(!overlap(lotRect(l), street), `a building at (${l.x.toFixed(0)}, ${l.z.toFixed(0)}) in the office's street`);
  for (let i = 0; i < LOTS.length; i++) for (let j = i + 1; j < LOTS.length; j++) assert.ok(!overlap(lotRect(LOTS[i]), lotRect(LOTS[j])), `buildings ${i} and ${j} overlap`);
});

test('the city keeps clear of the office, the row across the street, the farm and the country road', () => {
  const keepOut: Rect[] = [BUILDING, CASINO_BOX, HALL_BOX, SOCCER_BOX, GYM_STREET_BOX, ...FARM.fields, FARM.pasture];
  for (const l of LOTS) {
    for (const k of keepOut) assert.ok(!overlap(lotRect(l), k), `a building at (${l.x.toFixed(0)}, ${l.z.toFixed(0)}) on ${JSON.stringify(k)}`);
    for (const [x, z] of [[l.x - l.w / 2, l.z - l.d / 2], [l.x + l.w / 2, l.z - l.d / 2], [l.x - l.w / 2, l.z + l.d / 2], [l.x + l.w / 2, l.z + l.d / 2], [l.x, l.z]]) {
      const at = nearLoop(x, z);
      assert.ok(!at || at.off > LOOP_PAVED + 2, `a building at (${l.x.toFixed(0)}, ${l.z.toFixed(0)}) on the loop`);
    }
  }
  assert.ok(!inTown(0, 0) || BLOCKS.some((b) => b.kind === 'office' && b.i === 0 && b.j === 0), "the office's block is the office's");
  for (const t of PARK_TREES) assert.ok(!onCityStreet(t.x, t.z), `a park tree in the street at (${t.x.toFixed(0)}, ${t.z.toFixed(0)})`);
});

test('every city street and crossing is paved for the garage cars, and the blocks are not', () => {
  for (const s of STREETS) {
    const r = stretchRect(s);
    for (let k = 0; k <= 8; k++) {
      const x = s.alongX ? r.minX + ((r.maxX - r.minX) * k) / 8 : (r.minX + r.maxX) / 2;
      const z = s.alongX ? (r.minZ + r.maxZ) / 2 : r.minZ + ((r.maxZ - r.minZ) * k) / 8;
      for (const off of [-CITY_ROAD / 2 + 0.3, 0, CITY_ROAD / 2 - 0.3]) {
        const px = s.alongX ? x : x + off;
        const pz = s.alongX ? z + off : z;
        assert.ok(paved(px, pz) && onCityStreet(px, pz), `the street ${JSON.stringify(s)} at (${px.toFixed(1)}, ${pz.toFixed(1)})`);
      }
    }
  }
  for (const c of CROSSINGS) assert.ok(paved(c.x, c.z), `the crossing at (${c.x}, ${c.z})`);
  for (const l of LOTS) assert.ok(!paved(l.x, l.z), `the building at (${l.x.toFixed(0)}, ${l.z.toFixed(0)}) is paved`);
});

test("the streets all hang together, and the office's street gets you onto them", () => {
  // The crossings, joined by the stretches; the office's street joins up every crossing on it.
  const key = (a: number, b: number) => `${a},${b}`;
  const next = new Map<string, string[]>();
  const link = (p: string, q: string) => {
    next.set(p, [...(next.get(p) ?? []), q]);
    next.set(q, [...(next.get(q) ?? []), p]);
  };
  for (const s of STREETS) link(key(s.a, s.b), s.alongX ? key(s.a + 1, s.b) : key(s.a, s.b + 1));
  const MAIN = 'main';
  for (const c of CROSSINGS) if (c.b === 0 && Math.abs(c.x) <= STREET_END) link(MAIN, key(c.a, c.b));
  const seen = new Set([MAIN]);
  const todo = [MAIN];
  while (todo.length) for (const q of next.get(todo.pop()!) ?? []) if (!seen.has(q)) (seen.add(q), todo.push(q));
  for (const s of STREETS) assert.ok(seen.has(key(s.a, s.b)), `the street ${JSON.stringify(s)} can't be reached from the office's`);
});

test("out in the country no city street meets the loop: it runs on unbroken, edges and all", () => {
  for (const s of STREETS) {
    const r = stretchRect(s);
    const ends = s.alongX ? [[r.minX, lineZ(s.b)], [r.maxX, lineZ(s.b)]] : [[lineX(s.a), r.minZ], [lineX(s.a), r.maxZ]];
    for (const [x, z] of ends) {
      const at = nearLoop(x, z);
      if (!at || at.off > LOOP_PAVED + CITY_ROAD) continue;
      assert.ok(Math.abs(z - STREET_Z) < CITY_ROAD && Math.abs(x) <= STREET_END, `the street ${JSON.stringify(s)} meets the loop at (${x}, ${z})`);
    }
  }
});

test("the city's cars drive on its streets", () => {
  for (const run of RUNS) {
    for (let at = run.from + 2; at < run.to - 2; at += 4) {
      for (const lane of [-CITY_ROAD / 4, CITY_ROAD / 4]) {
        const x = run.alongX ? at : run.line + lane;
        const z = run.alongX ? run.line + lane : at;
        assert.ok(onCityStreet(x, z), `a run off its street at (${x.toFixed(0)}, ${z.toFixed(0)})`);
      }
    }
  }
});
