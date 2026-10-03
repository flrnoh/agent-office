import test from 'node:test';
import assert from 'node:assert/strict';
import { THERME_ARRIVAL, THERME_BOX, WELLENBAD, ZONES, inT, type TFixture, type TRect } from '../src/shared/therme.js';
import { THERME_POOLS, thermeFixtures, thermeWhereabouts } from '../src/shared/therme-all.js';
import { BAMBOO, BAR_COUNTER, BAR_FLOOR, BAR_STOOLS, GROTTO, GROTTO_MOUTH, GROTTO_POOL, ISLAND, LOUNGERS, PALMS, PARADIES_POOLS, THERMAL_POOL, WATERFALL, WHIRLPOOLS } from '../src/shared/therme-paradies.js';
import { climbOutWays, overPool, poolEdges, type PoolDef } from '../src/shared/swim.js';

// The Thermenparadies (flrnoh fork, see FORK.md "The thermal baths", phase 2): its pools, the island,
// the swim-up bar, the grotto, the loungers and palms, all where you can get to them.

const BODY = 0.32;
const HEAD = 1.8;
const STEP = 0.5;
const FX = thermeFixtures();
const SLABS = FX.filter((f) => f.id.startsWith('floor'));
const blocks = (f: TFixture, y: number) => f.top > y + 0.05 && (f.bottom ?? 0) < y + HEAD;
const freeAt = (x: number, z: number, y = 0) => !FX.some((f) => blocks(f, y) && x + BODY > f.minX && x - BODY < f.maxX && z + BODY > f.minZ && z - BODY < f.maxZ);
const onSlab = (x: number, z: number) => SLABS.some((f) => inT(f, x, z, -1e-6));
const overlap = (a: TRect, b: TRect) => a.minX < b.maxX - 1e-9 && b.minX < a.maxX - 1e-9 && a.minZ < b.maxZ - 1e-9 && b.minZ < a.maxZ - 1e-9;

/** A flood fill on a STEP grid from (x, z), stepping where `ok`. */
function fill(x0: number, z0: number, ok: (x: number, z: number) => boolean) {
  const ox = THERME_BOX.minX - 2;
  const oz = THERME_BOX.minZ - 2;
  const nx = Math.ceil((THERME_BOX.maxX - ox + 2) / STEP);
  const nz = Math.ceil((ZONES.lagune.maxZ - oz + 2) / STEP);
  const seen = new Uint8Array(nx * nz);
  const ix = (x: number) => Math.round((x - ox) / STEP);
  const iz = (z: number) => Math.round((z - oz) / STEP);
  const start = ix(x0) + iz(z0) * nx;
  seen[start] = 1;
  const q = [start];
  while (q.length) {
    const k = q.pop()!;
    const i = k % nx;
    const j = (k - i) / nx;
    for (const [a, b] of [
      [i + 1, j],
      [i - 1, j],
      [i, j + 1],
      [i, j - 1],
    ]) {
      if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
      const n = a + b * nx;
      if (seen[n] || !ok(ox + a * STEP, oz + b * STEP)) continue;
      seen[n] = 1;
      q.push(n);
    }
  }
  return (x: number, z: number) => !!seen[ix(x) + iz(z) * nx];
}

const walk = fill(THERME_ARRIVAL.x, THERME_ARRIVAL.z, (x, z) => onSlab(x, z) && freeAt(x, z));
/** On the island, from its middle. */
const island = fill(ISLAND.minX + 1.5, (ISLAND.minZ + ISLAND.maxZ) / 2, (x, z) => onSlab(x, z) && freeAt(x, z));

test('the pools are in the Thermenparadies, apart from each other and from the wave pool, with the floor open over them', () => {
  const P = ZONES.paradies;
  for (const pool of PARADIES_POOLS)
    for (const r of pool.rects) {
      assert.ok(r.minX >= P.minX && r.maxX <= P.maxX && r.minZ >= P.minZ && r.maxZ <= P.maxZ, `${pool.id} is outside the paradise`);
      assert.ok(!overlap(r, WELLENBAD), `${pool.id} is in the wave pool's plot`);
      assert.ok(!onSlab((r.minX + r.maxX) / 2, (r.minZ + r.maxZ) / 2), `${pool.id} has floor over it`);
      for (const other of PARADIES_POOLS) if (other !== pool) for (const o of other.rects) assert.ok(!overlap(r, o), `${pool.id} overlaps ${other.id}`);
    }
  assert.equal(WHIRLPOOLS.length, 4);
  for (const pool of PARADIES_POOLS) assert.ok(pool.floor < pool.surface - pool.sink, `${pool.id}: a swimmer's feet hang clear of its floor`);
});

test('every pool has walls only where its water meets the deck', () => {
  for (const pool of THERME_POOLS)
    for (const e of poolEdges(pool)) {
      const m = (e.from + e.to) / 2;
      const [x, z] = e.axis === 'x' ? [m, e.at + e.out * 0.05] : [e.at + e.out * 0.05, m];
      assert.ok(!overPool(pool, x, z), `${pool.id}: water past its wall at ${x}, ${z}`);
    }
  // The ring has no wall across its arms' seams.
  assert.ok(!poolEdges(THERMAL_POOL).some((e) => e.axis === 'z' && e.at === ISLAND.minX && e.from < ISLAND.minZ - 1));
});

test('on foot from the passage: every lounger, the grotto and its water, the whirlpools, round the bar; not the island', () => {
  for (const l of LOUNGERS) {
    assert.ok(onSlab(l.x, l.z) && !THERME_POOLS.some((p) => overPool(p, l.x, l.z, -0.4)), `${l.id} is by the water, not in it`);
    // You lie down from beside it: there's room to walk up (on the island, once you've swum over and climbed out).
    const reach = inT(ISLAND, l.x, l.z) ? island : walk;
    assert.ok([-1, 1].some((s) => reach(l.x + s * 1, l.z) || reach(l.x, l.z + s * 1.4)), `${l.id} can't be walked up to`);
  }
  assert.ok(walk(GROTTO.maxX - 2, (GROTTO_MOUTH.minZ + GROTTO_MOUTH.maxZ) / 2), 'into the grotto');
  assert.ok(walk(GROTTO_POOL.maxX + 0.8, (GROTTO_POOL.minZ + GROTTO_POOL.maxZ) / 2), "to the grotto's basin");
  for (const w of WHIRLPOOLS) assert.ok(walk(w.rects[0].maxX + 0.8, (w.rects[0].minZ + w.rects[0].maxZ) / 2), `up to ${w.id}`);
  assert.ok(walk(128, 53), 'along the deck behind the bar');
  assert.ok(walk(97.5, 32.5) && walk(97.5, 74), 'all round the thermal pool');
  assert.ok(!walk((ISLAND.minX + ISLAND.maxX) / 2, (ISLAND.minZ + ISLAND.maxZ) / 2), 'the island is swum to');
  for (const [i, b] of BAMBOO.entries()) assert.ok(!walk(b.x, b.z), `bamboo ${i} stands in the way`);
});

test('swimming: all of the thermal pool is one stretch of water, the bar at its east arm, the island and bar floor climbed onto', () => {
  const swimY = THERMAL_POOL.surface - THERMAL_POOL.sink;
  const start = THERMAL_POOL.rects[0];
  const swim = fill((start.minX + start.maxX) / 2, (start.minZ + start.maxZ) / 2, (x, z) => overPool(THERMAL_POOL, x, z, BODY - 0.01) && freeAt(x, z, swimY));
  for (const r of THERMAL_POOL.rects) assert.ok(swim((r.minX + r.maxX) / 2, (r.minZ + r.maxZ) / 2), `the arm at ${JSON.stringify(r)} is cut off`);
  for (const s of BAR_STOOLS) assert.ok(overPool(THERMAL_POOL, s.x, s.z, 0.3), 'the stools stand in the water');
  assert.ok(swim(BAR_COUNTER.minX - 0.6, (BAR_COUNTER.minZ + BAR_COUNTER.maxZ) / 2), 'you swim up to the counter');
  assert.ok(overPool(THERMAL_POOL, BAR_COUNTER.minX - 0.3, (BAR_COUNTER.minZ + BAR_COUNTER.maxZ) / 2) && !overPool(THERMAL_POOL, (BAR_FLOOR.minX + BAR_FLOOR.maxX) / 2, 53), 'the counter stands in the water, the bar floor behind it is dry');
  assert.ok(swim((WATERFALL.minX + WATERFALL.maxX) / 2, WATERFALL.z + 1), 'under the waterfall');
});

test('climbing out, anywhere along any wall, lands on dry floor with room to stand', () => {
  for (const pool of PARADIES_POOLS)
    for (const e of poolEdges(pool))
      for (let s = e.from + 0.6; s < e.to - 0.6; s += 1.7) {
        const [x, z] = e.axis === 'x' ? [s, e.at - e.out * 0.5] : [e.at - e.out * 0.5, s];
        if (!freeAt(x, z, pool.surface - pool.sink)) continue; // a stool or the counter there
        const ways = climbOutWays(pool, x, z);
        const at = ways.find((w) => freeAt(w.x, w.z, pool.deck));
        assert.ok(at, `${pool.id}: no way out at ${x.toFixed(1)}, ${z.toFixed(1)}`);
        assert.ok(onSlab(at.x, at.z), `${pool.id}: out at ${x.toFixed(1)}, ${z.toFixed(1)} lands off the floor`);
      }
});

test('the palms stand on dry ground, the island ones on the island', () => {
  for (const p of PALMS) assert.ok(onSlab(p.x, p.z), `a palm at ${p.x}, ${p.z} is in the water`);
  assert.ok(PALMS.filter((p) => inT(ISLAND, p.x, p.z)).length >= 4);
});

test('where you are, in words, pool by pool', () => {
  const swim = (p: PoolDef) => p.surface - p.sink;
  assert.equal(thermeWhereabouts(80, swim(THERMAL_POOL), 40), '🌊 im Thermalbecken');
  assert.equal(thermeWhereabouts(BAR_COUNTER.minX - 1, swim(THERMAL_POOL), 53), '🍹 an der Schwimmbar');
  const w = WHIRLPOOLS[1].rects[0];
  assert.equal(thermeWhereabouts((w.minX + w.maxX) / 2, swim(WHIRLPOOLS[1]), (w.minZ + w.maxZ) / 2), '🫧 im Whirlpool');
  assert.equal(thermeWhereabouts(72, 0, 24), '💎 in der Tropfsteingrotte');
  assert.equal(thermeWhereabouts(97.5, 0, 53), '🌴 auf der Palmeninsel');
  assert.equal(thermeWhereabouts(97.5, 0, 20), '🌴 im Thermenparadies');
});
