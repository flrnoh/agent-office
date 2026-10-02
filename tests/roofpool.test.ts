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
    // Room all round the elevator, not just in front of its doors.
    ["the elevator", { minX: ELEVATOR.x - ELEVATOR.width / 2, maxX: ELEVATOR.x + ELEVATOR.width / 2, minZ: FLOOR.minZ, maxZ: ELEVATOR_FRONT + 1.5 }, 0.75],
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

test('the water slide ends in the water, with headroom over everywhere people walk, on the roof', async () => {
  const { SLIDE, SLIDE_ZONE, slideAt, slidingAt } = await import('../src/shared/roofpool.js');
  const R = 0.42; // the tube's radius round its line (features/roofpool/slide.ts)
  const end = slideAt(1);
  assert.ok(overPool(end.x, end.z, 0.8), 'it comes down well inside the water');
  assert.ok(end.y - POOL.surface < 0.2, 'right at the surface');
  const inBox = (x: number, z: number, b: { minX: number; maxX: number; minZ: number; maxZ: number }) => x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ;
  const tower = { minX: SLIDE.x - SLIDE.half - 0.1, maxX: SLIDE.x + SLIDE.half + 0.1, minZ: SLIDE.z - SLIDE.half - 0.1, maxZ: SLIDE.z + SLIDE.half + 0.1 };
  for (let s = 0; s <= 1; s += 0.01) {
    const p = slideAt(s);
    assert.ok(p.x + R < FLOOR.maxX && p.z - R > FLOOR.minZ, `over the roof's edge at ${p.x.toFixed(2)},${p.z.toFixed(2)}`);
    if (overPool(p.x, p.z) || inBox(p.x, p.z, SLIDE_ZONE) || inBox(p.x, p.z, tower)) continue;
    const floor = poolDeck().some((b) => inBox(p.x, p.z, b)) ? POOL_DECK.top : Math.max(0, ...poolSteps().filter((b) => inBox(p.x, p.z, b)).map((b) => b.top));
    assert.ok(p.y - R - floor >= 1.75, `only ${(p.y - R - floor).toFixed(2)} m over the floor at ${p.x.toFixed(2)},${p.z.toFixed(2)}`);
  }
  // Its ladder's foot is on the deck, and someone half way down is seen sliding.
  assert.ok(poolDeck().some((b) => inBox(SLIDE.foot.x, SLIDE.foot.z, b)));
  const mid = slideAt(0.5);
  assert.ok(slidingAt(mid.x, mid.y, mid.z));
  assert.ok(!slidingAt(mid.x, 0, mid.z), 'not someone walking under it');
  assert.ok(!slidingAt(SLIDE.foot.x, POOL_DECK.top, SLIDE.foot.z), 'not someone at the ladder');
  // Climbing out by the slide puts you somewhere you can stand, not under it.
  for (const [x, z] of [[9.2, POOL.maxZ - 0.3], [POOL.maxX - 0.3, POOL.maxZ - 0.3]]) {
    const out = climbOutAt(x, z);
    assert.ok(!inBox(out.x, out.z, SLIDE_ZONE) && !inBox(out.x, out.z, tower), `out at ${out.x},${out.z}`);
  }
});

test('the sky bar stands at the south end of the terrace, its pergola clear of the bungee jetty, the pool and its slide', async () => {
  const { BUNGEE } = await import('../src/shared/bungee.js');
  // The pergola over it (features/rooftop/world.ts): from just in front of the counter to the east edge, 0.8 past each end.
  const pergola = { minX: ROOF_BAR.x - ROOF_BAR.depth / 2 - 0.9 - 0.1, maxX: FLOOR.maxX, minZ: ROOF_BAR.minZ - 0.9, maxZ: ROOF_BAR.maxZ + 0.9 };
  const jetty = { minX: BUNGEE.x - BUNGEE.halfWidth, maxX: BUNGEE.x + BUNGEE.halfWidth, minZ: BUNGEE.startZ, maxZ: FLOOR.maxZ + 4 };
  assert.ok(apart(pergola, jetty, 0.2), 'clear of the bungee jetty');
  assert.ok(apart(pergola, FOOT, 1), 'clear of the pool');
  const { slideAt } = await import('../src/shared/roofpool.js');
  for (let s = 0; s <= 1; s += 0.02) {
    const p = slideAt(s);
    assert.ok(apart(pergola, around(p.x, p.z, 0.45), 0.3), `clear of the slide at ${p.x.toFixed(1)},${p.z.toFixed(1)}`);
  }
  // Its six stools along the counter, under the pergola.
  const stools = SEATING.filter((s) => s.bar);
  assert.equal(stools.length, 6);
  for (const s of stools) assert.ok(s.z > ROOF_BAR.minZ && s.z < ROOF_BAR.maxZ, `${s.id} along the counter`);
  assert.ok(ROOF_BAR.maxZ + 0.8 < BUNGEE.startZ, "the pergola's posts stop before the jetty starts");
});

test('the diving tower stands on the deck, its board out over the water, with a ladder you can reach', async () => {
  const { DIVE, diveFloors } = await import('../src/shared/roofpool.js');
  const [platform, board] = diveFloors();
  assert.ok(platform.minZ >= POOL_DECK.minZ && platform.minX > POOL_DECK.minX && platform.maxX < POOL_DECK.maxX, 'over the deck');
  assert.ok(overPool((board.minX + board.maxX) / 2, board.maxZ - 0.01, 0.5), 'its board ends well over the water');
  assert.ok(board.maxZ - POOL.minZ < (POOL.maxZ - POOL.minZ) / 2, 'with room to land in front of it');
  assert.ok(DIVE.top - POOL.surface > 3, 'high enough for a proper splash');
  // Its ladder's foot on the deck, clear of its legs; up top you come out on the platform.
  assert.ok(poolDeck().some((b) => DIVE.foot.x > b.minX + 0.3 && DIVE.foot.x < b.maxX && DIVE.foot.z > b.minZ + 0.3 && DIVE.foot.z < b.maxZ - 0.3));
  assert.ok(DIVE.foot.x + 0.32 < DIVE.minX - 0.12, "standing at the ladder isn't standing in the tower");
  assert.ok(DIVE.up.x > platform.minX + 0.3 && DIVE.up.x < platform.maxX - 0.3 && DIVE.up.z > platform.minZ + 0.3 && DIVE.up.z < platform.maxZ);
  // Climbing out under it puts you somewhere you can stand.
  const out = climbOutAt((DIVE.minX + DIVE.maxX) / 2, POOL.minZ + 0.3);
  assert.ok(!(out.x > DIVE.minX - 0.4 && out.x < DIVE.maxX + 0.4 && out.z < POOL.minZ), `out under the tower at ${out.x},${out.z}`);
});
