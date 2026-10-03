import test from 'node:test';
import assert from 'node:assert/strict';
import { DOORS, DORF_FENCE, THERME_ARRIVAL, THERME_BOX, ZONES, inT, thermeWalls, type TFixture, type TRect } from '../src/shared/therme.js';
import { THERME_POOLS, outsideWater, thermeFixtures, thermeWater, underSky } from '../src/shared/therme-all.js';
import { POOL_INFO, POOL_SIGNS, SHOWERS, depthOf, poolInfo, signWords } from '../src/shared/therme-pools.js';
import { LIFEGUARDS, PLANT_BEDS, STRANDBAR, furnitureFixtures } from '../src/shared/therme-furniture.js';
import { BUCKETS, DORF_PATHS, DORF_POOLS, DORF_TREES, GARDEN_TUB, ICE_FOUNTAIN, KNEIPP, KNEIPP_FLOOR, dorfWater, inKneipp } from '../src/shared/therme-dorf.js';
import { RIDE_POSE, SLIDES, SLIDE_RADIUS } from '../src/shared/therme-slides.js';
import { overPool } from '../src/shared/swim.js';

// The thermal baths' finishing (flrnoh fork, see FORK.md "The thermal baths"): every pool named on a
// sign by it, the signs, showers, beds and furniture on dry floor, solid and out of the way of every
// door and path; the sauna garden under the open sky, fenced, every water in it there to be used;
// the tubes ridden lying down.

const BODY = 0.32;
const STEP = 0.5;
const FX = thermeFixtures();
const GROUND = FX.filter((f) => f.top === 0 && (f.bottom ?? 0) < 0);
const WATER = [...thermeWater(), ...outsideWater()];
const onGround = (x: number, z: number) => GROUND.some((f) => inT(f, x, z, -1e-6)) || inT(KNEIPP, x, z);
const groundY = (x: number, z: number) => (inT(KNEIPP, x, z) ? KNEIPP_FLOOR : 0);
const freeAt = (x: number, z: number, y = groundY(x, z)) => !FX.some((f) => f.top > y + 0.05 && (f.bottom ?? 0) < y + 1.8 && x + BODY > f.minX && x - BODY < f.maxX && z + BODY > f.minZ && z - BODY < f.maxZ);
const overlap = (a: TRect, b: TRect, pad = 0) => a.minX < b.maxX + pad && b.minX < a.maxX + pad && a.minZ < b.maxZ + pad && b.minZ < a.maxZ + pad;

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
  return (x: number, z: number) => [0, STEP, -STEP].some((d) => seen[ix(x + d) + iz(z) * nx] || seen[ix(x) + iz(z + d) * nx]);
}
const walk = fill(THERME_ARRIVAL.x, THERME_ARRIVAL.z, (x, z) => onGround(x, z) && freeAt(x, z));

test('every pool has its name, warmth and depth, on a sign standing by its water', () => {
  for (const p of THERME_POOLS) {
    const info = poolInfo(p.id);
    assert.ok(info, `${p.id} has no name`);
    assert.ok(info!.temp > 5 && info!.temp < 45, p.id);
    assert.match(depthOf(p), /\d,\d+ m$/);
    if (p.id === 'therme-grotto') continue; // its sign is over its mouth
    const near = POOL_SIGNS.filter((s) => s.pool === p.id && p.rects.some((r) => overlap(r, { minX: s.x, maxX: s.x, minZ: s.z, maxZ: s.z }, 4.5)));
    assert.ok(near.length, `no sign by ${p.id}`);
  }
  assert.ok(POOL_SIGNS.some((s) => s.pool === 'kneipp' && overlap(KNEIPP, { minX: s.x, maxX: s.x, minZ: s.z, maxZ: s.z }, 2)), 'the Kneipp trough has one');
  const [big, small] = signWords('therme-thermal');
  assert.match(big, /THERMALBECKEN/);
  assert.match(small, /34 °C · 1,35 m tief/);
  assert.equal(Object.keys(POOL_INFO).length, THERME_POOLS.length);
});

test('the signs, showers, beds and furniture stand on dry floor, out of the water, clear of each other and of every way through', () => {
  const things: (TRect & { id: string })[] = [
    ...POOL_SIGNS.map((s, i) => ({ id: `sign ${i} (${s.pool})`, minX: s.x - 0.15, maxX: s.x + 0.15, minZ: s.z - 0.15, maxZ: s.z + 0.15 })),
    ...SHOWERS.map((s, i) => ({ id: `shower ${i}`, minX: s.x - 0.12, maxX: s.x + 0.12, minZ: s.z - 0.12, maxZ: s.z + 0.12 })),
    ...furnitureFixtures().filter((f) => (f.bottom ?? 0) < 1),
  ];
  const own = new Set(['pool-sign', 'shower', 'bed-', 'lifeguard', 'strandbar']);
  const others = FX.filter((f) => f.top > 0.05 && (f.bottom ?? 0) < 1.8 && ![...own].some((k) => f.id.startsWith(k)) && !GROUND.includes(f));
  for (const t of things) {
    for (const [x, z] of [[t.minX, t.minZ], [t.maxX, t.maxZ], [(t.minX + t.maxX) / 2, (t.minZ + t.maxZ) / 2]]) assert.ok(onGround(x, z) && !inT(KNEIPP, x, z), `${t.id} isn't on the floor`);
    assert.ok(!WATER.some((w) => overlap(w, t, 0.2)), `${t.id} stands in the water`);
    // (The palm island's palms grow out of its bed.)
    const hit = others.find((f) => overlap(f, t, -1e-6) && !(t.id.startsWith('bed-') && f.id.startsWith('palm-')));
    assert.ok(!hit, `${t.id} stands in ${hit?.id}`);
    // Not in a doorway, nor right in front of one.
    for (const d of DOORS) {
      const c = d.at + (d.shift ?? 0);
      const way = d.axis === 'x' ? { minX: d.from, maxX: d.to, minZ: c - 2, maxZ: c + 2 } : { minX: c - 2, maxX: c + 2, minZ: d.from, maxZ: d.to };
      assert.ok(!overlap(way, t, -1e-6), `${t.id} is in the ${d.id} door's way`);
    }
  }
  // The garden's paths are clear to walk.
  for (const p of DORF_PATHS) for (const t of things) assert.ok(!overlap(p, t, -1e-6), `${t.id} on a garden path`);
});

test('on foot from the passage: every shower, the beach bar, the lifeguards\' chairs, every bucket and the ice fountain, the hot tub and the Kneipp trough', () => {
  for (const [i, s] of SHOWERS.entries()) assert.ok(walk(s.x, s.z + 0.6), `shower ${i}`);
  assert.ok(walk(STRANDBAR.counter.minX - 0.7, (STRANDBAR.counter.minZ + STRANDBAR.counter.maxZ) / 2), 'up to the beach bar');
  for (const [i, l] of LIFEGUARDS.entries()) assert.ok(walk(l.x - Math.sin(l.rotY) * 0, l.z + 1) || walk(l.x, l.z - 1) || walk(l.x + 1, l.z) || walk(l.x - 1, l.z), `lifeguard ${i}`);
  for (const [i, b] of BUCKETS.entries()) assert.ok(walk(b.x, b.z), `under bucket ${i}`);
  assert.ok(walk(ICE_FOUNTAIN.x - 1, ICE_FOUNTAIN.z) || walk(ICE_FOUNTAIN.x, ICE_FOUNTAIN.z + 1), 'to the ice fountain');
  assert.ok(walk(GARDEN_TUB.minX - 0.6, (GARDEN_TUB.minZ + GARDEN_TUB.maxZ) / 2), 'up to the hot tub');
  assert.ok(walk((KNEIPP.minX + KNEIPP.maxX) / 2, (KNEIPP.minZ + KNEIPP.maxZ) / 2), 'through the Kneipp trough');
  for (const [i, b] of PLANT_BEDS.entries()) assert.ok(!walk((b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2) || b.maxX - b.minX < 1.2, `bed ${i} is walked through`);
});

test('the sauna garden is under the open sky, its fence round it, its trees standing in it', () => {
  const D = ZONES.dorf;
  for (let x = D.minX + 1; x < D.maxX; x += 3) for (let z = D.minZ + 1; z < D.maxZ; z += 3) assert.ok(underSky(x, z), `not open at ${x}, ${z}`);
  // Nothing over it but the huts' own roofs (no ceiling, no hall roof).
  const over = FX.filter((f) => (f.bottom ?? 0) > 3.5 && overlap(f, D, -1) && !/^(arena|finnisch|kelo|erd|dampf|salz|bio|ruhe)-roof$/.test(f.id) && !f.id.startsWith('grotto') && !f.id.startsWith('n-') && !f.id.startsWith('band-') && !f.id.startsWith('dorf-e') && !f.id.startsWith('w-band'));
  assert.deepEqual(over.map((f) => f.id), []);
  const fence = thermeWalls().filter((w) => w.id.startsWith('w-dorf') || w.id.startsWith('s-dorf'));
  assert.ok(fence.length >= 2 && fence.every((w) => w.top === DORF_FENCE), 'a fence along the west and south');
  for (const t of DORF_TREES) assert.ok(inT(D, t.x, t.z, 0.5) && !WATER.some((w) => inT(w, t.x, t.z, -1)), `a tree in the water at ${t.x}, ${t.z}`);
  assert.ok(!underSky(100, 50) && !underSky(170, 80), 'the dome and the slide hall are indoors');
});

test('every water in the sauna garden is for using: swum in, or waded through', () => {
  for (const w of dorfWater()) {
    const x = (w.minX + w.maxX) / 2;
    const z = (w.minZ + w.maxZ) / 2;
    const swum = DORF_POOLS.some((p) => overPool(p, x, z));
    const waded = w === KNEIPP && inKneipp(x, KNEIPP_FLOOR, z);
    assert.ok(swum || waded, `the water at ${x}, ${z} is for looking at`);
  }
  assert.ok(DORF_POOLS.some((p) => p.id === 'therme-gardentub'), 'the hot tub is a pool');
});

test('down a tube you lie in it, feet first; the open slides you sit, tyre or mat', () => {
  for (const s of SLIDES) {
    const pose = RIDE_POSE[s.id];
    if (s.kind !== 'open') assert.equal(pose, 'lie', `${s.id} is a tube: you lie in it`);
    else assert.notEqual(pose, undefined, s.id);
  }
  // Lying, your whole body fits inside the tube (hips 0.2 over its floor, a body some 0.4 thick, the head too).
  assert.ok(SLIDE_RADIUS * 2 * 0.92 > 0.2 + 0.45);
  assert.equal(RIDE_POSE.reifen, 'tyre');
  assert.equal(RIDE_POSE.racer, 'mat');
});

test('the planting beds stay off the pools and the doors', () => {
  for (const [i, b] of PLANT_BEDS.entries()) {
    assert.ok(!WATER.some((w) => overlap(w, b, 0.3)), `bed ${i} runs into the water`);
    for (const d of DOORS) {
      const c = d.at + (d.shift ?? 0);
      const way = d.axis === 'x' ? { minX: d.from - 0.5, maxX: d.to + 0.5, minZ: c - 2.5, maxZ: c + 2.5 } : { minX: c - 2.5, maxX: c + 2.5, minZ: d.from - 0.5, maxZ: d.to + 0.5 };
      assert.ok(!overlap(way, b, -1e-6), `bed ${i} is in the ${d.id} door's way`);
    }
  }
  const f: TFixture[] = furnitureFixtures();
  assert.ok(f.some((x) => x.id === 'strandbar-counter'));
});
