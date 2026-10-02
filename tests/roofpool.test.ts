import test from 'node:test';
import assert from 'node:assert/strict';
import { DANCE_FLOOR, ELEVATOR, ELEVATOR_FRONT, FIRE_PIT, FLOOR, ROOF_BAR, ROOF_TABLES, SEATING, STAGE } from '../src/shared/layout.js';
import { TABLES, standSpot } from '../src/shared/tablegames/tables.js';
import { AXE_LANE, DARTBOARD } from '../src/shared/bargames.js';
import { BUNGEE } from '../src/shared/bungee.js';
import { POOL, POOL_DECK, POOL_SINK, POOL_STEPS, atPoolEdge, climbOutAt, floatAt, FLOATS, inPoolAt, overPool, poolDeck, poolSteps } from '../src/shared/roofpool.js';

// Pool party on the roof (flrnoh fork, see FORK.md).

type Box = { minX: number; maxX: number; minZ: number; maxZ: number };
/** The pool's whole footprint: its deck and its steps. */
const FOOT: Box = { minX: POOL_DECK.minX, maxX: POOL_DECK.maxX, minZ: POOL_DECK.minZ, maxZ: POOL_DECK.maxZ + POOL_STEPS.run * POOL_STEPS.count };
const apart = (a: Box, b: Box, gap: number) => a.maxX + gap <= b.minX || b.maxX + gap <= a.minX || a.maxZ + gap <= b.minZ || b.maxZ + gap <= a.minZ;
const around = (x: number, z: number, r: number): Box => ({ minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r });

test('the pool stands on the roof, clear of everything else up there, with room to walk round it', () => {
  assert.ok(FOOT.minX > FLOOR.minX && FOOT.maxX < FLOOR.maxX && FOOT.minZ > FLOOR.minZ && FOOT.maxZ < FLOOR.maxZ);
  const things: [string, Box, number][] = [
    ['the stage', STAGE, 1],
    ['the dance floor', DANCE_FLOOR, 1],
    ["the elevator's doors", { minX: ELEVATOR.x - ELEVATOR.width / 2, maxX: ELEVATOR.x + ELEVATOR.width / 2, minZ: FLOOR.minZ, maxZ: ELEVATOR_FRONT + 1 }, 0.4],
    ['the bar', { minX: ROOF_BAR.x - ROOF_BAR.depth / 2 - 0.9, maxX: FLOOR.maxX, minZ: ROOF_BAR.minZ - 0.8, maxZ: ROOF_BAR.maxZ + 0.8 }, 0.9],
    ['the fire pit', around(FIRE_PIT.x, FIRE_PIT.z, 3.5), 1],
    ['the axe lane', { minX: FLOOR.minX, maxX: AXE_LANE.maxX + 1, minZ: FLOOR.minZ, maxZ: FLOOR.minZ + AXE_LANE.depth + 1 }, 1],
    ['the dartboard', around(DARTBOARD.x + DARTBOARD.oche, DARTBOARD.z, 1), 1],
    ['the bungee jetty', { minX: BUNGEE.x - BUNGEE.halfWidth, maxX: BUNGEE.x + BUNGEE.halfWidth, minZ: FLOOR.maxZ - 2, maxZ: FLOOR.maxZ + 4 }, 1],
    ...ROOF_TABLES.map((t, i): [string, Box, number] => [`tall table ${i + 1}`, around(t.x, t.z, 0.3), 1]),
    ...Object.values(TABLES).flatMap((t): [string, Box, number][] => [
      [t.name, around(t.x, t.z, t.outerLength / 2 + 0.2), 1],
      ...([0, 1] as const).map((s): [string, Box, number] => [`${t.name}'s player`, around(standSpot(t, s).x, standSpot(t, s).z, 0.4), 0.6]),
    ]),
    ...SEATING.filter((s) => s.roof).map((s): [string, Box, number] => [s.label, around(s.x, s.z, 0.9), 0.6]),
  ];
  for (const [what, box, gap] of things) assert.ok(apart(FOOT, box, gap), `the pool is in the way of ${what}`);
});

test('the deck goes round the water, and up to it from the roof in steps you can walk', () => {
  const deck = poolDeck();
  for (const b of deck) assert.ok(!(b.minX < POOL.maxX && b.maxX > POOL.minX && b.minZ < POOL.maxZ && b.maxZ > POOL.minZ), 'no deck over the water');
  const steps = poolSteps();
  let y = 0;
  // From the lowest (furthest out) up to the deck.
  for (const s of [...steps].sort((a, b) => a.top - b.top)) {
    assert.ok(s.top - y <= 0.3 + 1e-9, `a step of ${s.top - y}`);
    y = s.top;
  }
  assert.ok(POOL_DECK.top - y <= 0.3 + 1e-9, 'the last step up onto the deck');
  assert.ok(POOL.surface < POOL_DECK.top);
});

test('in the water is where swimmers are; out over the nearest wall is on the deck', () => {
  const x = (POOL.minX + POOL.maxX) / 2;
  const z = (POOL.minZ + POOL.maxZ) / 2;
  assert.ok(inPoolAt(x, POOL.surface - POOL_SINK, z));
  assert.ok(!inPoolAt(x, POOL_DECK.top, z), 'jumping in, still over it');
  assert.ok(!inPoolAt(POOL.minX - 1, POOL.surface - POOL_SINK, z));
  assert.ok(!atPoolEdge(x, z));
  for (const [ex, ez] of [[POOL.minX + 0.3, z], [POOL.maxX - 0.3, z], [x, POOL.minZ + 0.3], [x, POOL.maxZ - 0.3]]) {
    assert.ok(atPoolEdge(ex, ez));
    const out = climbOutAt(ex, ez);
    assert.ok(!overPool(out.x, out.z), 'out of the water');
    assert.ok(poolDeck().some((b) => out.x > b.minX && out.x < b.maxX && out.z > b.minZ && out.z < b.maxZ), 'onto the deck');
  }
});

test('the floats stay on the water', () => {
  for (let i = 0; i < FLOATS.length; i++) {
    for (let t = 0; t < 4000; t += 7.3) {
      const at = floatAt(i, t);
      assert.ok(overPool(at.x, at.z, 0.5), `float ${i} at ${at.x.toFixed(2)},${at.z.toFixed(2)}`);
    }
  }
});
