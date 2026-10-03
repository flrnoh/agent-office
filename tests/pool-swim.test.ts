import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { POOL_DEFAULTS, atEdge, climbOutAt, inPoolAt, overPool, poolAt, surfaceAt, wallTouched, type PoolDef } from '../src/shared/swim.js';
import { BASEMENT_FLOOR, LAP_POOL, LAP_SWIM, atLapEdge, basementFixtures, inLapPoolAt, lapClimbOut, overLapPool } from '../src/shared/gym-basement.js';
import { POOL, POOL_DECK, ROOF_SWIM, atPoolEdge, climbOutAt as roofClimbOut, inPoolAt as roofInPoolAt, overPool as roofOverPool, poolDeck } from '../src/shared/roofpool.js';
import { Swimmer, type SwimBody } from '../src/client/swim/index.js';
import type { Collider } from '../src/client/world/types.js';

// One swim controller for every pool (flrnoh fork, see FORK.md "Swimming"): pools as data
// (shared/swim.ts), the gym's lap pool and the roof's pool on it exactly as they were, and what the
// thermal baths' basins will need (freeform water, waves, a current).

const B = BASEMENT_FLOOR;

function body(x: number, y: number, z: number, colliders: Collider[]) {
  const keys = new Set<string>();
  const p: SwimBody = {
    pos: new THREE.Vector3(x, y, z),
    colliders,
    grounded: true,
    stepOffset: 0,
    vy: 0,
    view: 'first',
    camYaw: -Math.PI / 2, // D goes north (-z)… set per test
    facing: 0,
    moving: false,
    rig: null,
    seat: null,
    holding: (...codes: string[]) => codes.some((c) => keys.has(c)),
    stopWalking() {},
  };
  const run = (key: string, secs: number, until?: () => boolean) => {
    keys.add(key);
    for (let i = 0; i < secs * 20 && p.rig && !until?.(); i++) p.rig(0.05);
    keys.delete(key);
  };
  return { p, keys, run };
}

const gymWalls = (): Collider[] => basementFixtures().map(({ minX, maxX, minZ, maxZ, top, bottom }) => ({ minX, maxX, minZ, maxZ, top, bottom }));

test('the lap pool as data is the lap pool it was: over, in, at the edge, out', () => {
  for (let x = LAP_POOL.minX - 1; x <= LAP_POOL.maxX + 1; x += 0.37)
    for (let z = LAP_POOL.minZ - 1; z <= LAP_POOL.maxZ + 1; z += 0.29) {
      for (const slack of [0, 0.2, 0.75]) assert.equal(overPool(LAP_SWIM, x, z, slack), overLapPool(x, z, slack), `over at ${x}, ${z} (${slack})`);
      assert.equal(atEdge(LAP_SWIM, x, z), atLapEdge(x, z), `edge at ${x}, ${z}`);
      for (const y of [B, LAP_POOL.surface - 0.5, LAP_POOL.surface - 1.3, LAP_POOL.floor - 0.1, LAP_POOL.floor - 0.3]) assert.equal(inPoolAt(LAP_SWIM, x, y, z), inLapPoolAt(x, y, z), `in at ${x}, ${y}, ${z}`);
      if (overLapPool(x, z)) assert.deepEqual(climbOutAt(LAP_SWIM, x, z), lapClimbOut(x, z));
    }
  assert.equal(LAP_SWIM.speed, 1.6);
  assert.equal(LAP_SWIM.fast, 2.4);
});

test('the roof pool as data is the roof pool it was', () => {
  for (let x = POOL.minX - 1; x <= POOL.maxX + 1; x += 0.23)
    for (let z = POOL.minZ - 1; z <= POOL.maxZ + 1; z += 0.19) {
      for (const slack of [0, 0.2, 0.75]) assert.equal(overPool(ROOF_SWIM, x, z, slack), roofOverPool(x, z, slack));
      assert.equal(atEdge(ROOF_SWIM, x, z), atPoolEdge(x, z));
      for (const y of [0, POOL.surface - 0.5, POOL.surface - 1.5, POOL.surface - 1.9]) assert.equal(inPoolAt(ROOF_SWIM, x, y, z), roofInPoolAt(x, y, z), `in at ${x}, ${y}, ${z}`);
      if (roofOverPool(x, z)) assert.deepEqual(climbOutAt(ROOF_SWIM, x, z), roofClimbOut(x, z));
    }
});

// A freeform basin: an L of two rectangles meeting at x 10.
const ELL: PoolDef = { ...POOL_DEFAULTS, id: 'ell', rects: [{ minX: 0, maxX: 10, minZ: 0, maxZ: 4 }, { minX: 10, maxX: 14, minZ: 0, maxZ: 12 }], surface: -0.1, floor: -1.6, sink: 1.2, deck: 0 };

test('a freeform pool is the water over all its rectangles, its edge only where there is no more water', () => {
  assert.ok(overPool(ELL, 9.9, 2) && overPool(ELL, 10.1, 2), 'across the seam');
  assert.ok(overPool(ELL, 10, 2, 0.75), 'deep in the water at the seam, not at an edge');
  assert.ok(!atEdge(ELL, 10.05, 2), 'the seam is no wall');
  assert.ok(atEdge(ELL, 12, 11.6), 'the far end of the L is');
  assert.ok(atEdge(ELL, 9.5, 3.7), 'and its inner corner');
  assert.ok(!overPool(ELL, 5, 6), 'beside the L is dry');
  assert.equal(poolAt([LAP_SWIM, ELL], 12, 6)?.id, 'ell');
  // Climbing out always comes up on dry deck, by the nearest wall that has some.
  for (let x = 0.1; x < 14; x += 0.3)
    for (let z = 0.1; z < 12; z += 0.3) {
      if (!overPool(ELL, x, z)) continue;
      const at = climbOutAt(ELL, x, z);
      assert.ok(!overPool(ELL, at.x, at.z), `out at ${x}, ${z} lands in the water`);
      assert.ok(Math.hypot(at.x - x, at.z - z) < 7, `out at ${x}, ${z} goes a long way round`);
    }
  assert.deepEqual(climbOutAt(ELL, 10.2, 2), { x: 10.2, z: -0.45 }, 'not across the seam into more water');
});

test('lengths: wall to wall along their axis', () => {
  assert.equal(wallTouched(LAP_SWIM, LAP_POOL.minX + 0.3, 69), 'lo');
  assert.equal(wallTouched(LAP_SWIM, LAP_POOL.maxX - 0.3, 69), 'hi');
  assert.equal(wallTouched(LAP_SWIM, 20, 69), null);
  assert.equal(wallTouched(ELL, 0.2, 2), null, 'a pool without lengths');
});

test('in the lap pool: in from over the water, a timed length east, climbing out onto the deck', () => {
  const { p, run } = body(LAP_POOL.minX + 0.5, LAP_POOL.surface - 0.05, 69, gymWalls());
  const laps: string[] = [];
  let outs = 0;
  const s = new Swimmer(p, () => [LAP_SWIM], { stroke() {}, out: () => outs++, lap: (t) => laps.push(t) });
  s.tick(0.05);
  assert.ok(s.swimming && s.pool === LAP_SWIM && p.rig, 'in the water');
  p.camYaw = 0; // D goes east (+x)
  run('KeyD', 30, () => p.pos.x > LAP_POOL.maxX - 0.5);
  assert.ok(p.pos.x > LAP_POOL.maxX - 0.7 && p.pos.x < LAP_POOL.maxX, `at the east wall, still in (${p.pos.x})`);
  assert.ok(Math.abs(p.pos.y - (LAP_POOL.surface - LAP_SWIM.sink)) < 0.1, 'head at the surface');
  assert.equal(laps.length, 1);
  assert.match(laps[0], /^🏊 Length 1 · lane 3 · 25 m in [\d.]+ s/);
  run('KeyD', 2);
  assert.ok(p.pos.x < LAP_POOL.maxX, "the deck's edge keeps you in");
  assert.ok(s.atEdge);
  s.climbOut();
  assert.ok(!s.swimming && !p.rig && outs === 1);
  assert.deepEqual([p.pos.x, p.pos.y], [LAP_POOL.maxX + 0.45, B]);
});

test('a header from the deck lands over the water; nobody posed once out of it', () => {
  const { p } = body(20, B, LAP_POOL.minZ - 0.6, gymWalls());
  const s = new Swimmer(p, () => [LAP_SWIM], { stroke() {}, out() {} });
  s.jumpIn();
  assert.ok(overPool(LAP_SWIM, p.pos.x, p.pos.z, 0.9), 'toward the middle of the lane');
  assert.ok(p.pos.y > B && p.vy > 0, 'up and in');
});

test('on the roof the walls are tried just over its floor, and keep you in', () => {
  const deck = poolDeck().map((d) => ({ ...d, bottom: 0 }));
  const { p, run } = body((POOL.minX + POOL.maxX) / 2, POOL.surface - 0.2, (POOL.minZ + POOL.maxZ) / 2, deck);
  const s = new Swimmer(p, () => [ROOF_SWIM], { stroke() {}, out() {} });
  s.into(ROOF_SWIM, 1);
  p.camYaw = 0;
  run('KeyD', 8);
  assert.ok(p.pos.x < POOL.maxX && p.pos.x > POOL.maxX - 0.6, `against the east wall (${p.pos.x})`);
  assert.ok(Math.abs(p.pos.y - (POOL.surface - ROOF_SWIM.sink)) < 0.1);
  s.climbOut();
  assert.equal(p.pos.y, POOL_DECK.top);
});

test('waves lift you with the surface, a current carries you, and off its water you are on your feet', () => {
  let now = 0;
  const wavy: PoolDef = { ...ELL, id: 'wavy', swell: (_x, _z, t) => 0.5 * Math.sin(t / 1000), flow: () => ({ x: 0, z: 1.5 }) };
  assert.equal(surfaceAt(wavy, 1, 1, 0), wavy.surface);
  const { p } = body(12, wavy.surface - 0.1, 1, []);
  const s = new Swimmer(p, () => [wavy], { stroke() {}, out() {} }, () => now);
  s.tick(0.05);
  assert.ok(s.swimming);
  now = (Math.PI / 2) * 1000; // the crest
  for (let i = 0; i < 40; i++) p.rig?.(0.05);
  assert.ok(Math.abs(p.pos.y - (wavy.surface + 0.5 - wavy.sink)) < 0.12, `up on the crest (${p.pos.y})`);
  assert.ok(p.pos.z > 3.5, `carried along (${p.pos.z})`);
  for (let i = 0; i < 200 && s.swimming; i++) p.rig?.(0.05);
  assert.ok(!s.swimming && !p.rig, 'carried off the end of the water (no walls here): out of it');
});
