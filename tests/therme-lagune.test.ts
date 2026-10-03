import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ZONES, inT, type TFixture } from '../src/shared/therme.js';
import { THERME_POOLS, thermeFixtures, thermeWhereabouts } from '../src/shared/therme-all.js';
import { BRIDGE, ISLE, LAGOON, LAGUNE_DOOR, OUTSIDE_Z, RIVER, RIVER_SPEED, SUN_LOUNGERS, outside, riverFlow } from '../src/shared/therme-lagune.js';
import { overPool } from '../src/shared/swim.js';
import { Swimmer, type SwimBody } from '../src/client/swim/index.js';

// The outdoor lagoon (flrnoh fork, see FORK.md "The thermal baths", phase 6): the beach, the
// lagoon, the lazy river round its island and its current, the bridge, the weather outside.

const FX = thermeFixtures();
const BODY = 0.3;
const blocks = (f: TFixture, y: number) => f.top > y + 0.31 && (f.bottom ?? 0) < y + 1.7; // a ledge up to a step high you step up onto
const free = (x: number, z: number, y: number) => !FX.some((f) => blocks(f, y) && x + BODY > f.minX && x - BODY < f.maxX && z + BODY > f.minZ && z - BODY < f.maxZ);
const ground = (x: number, z: number) => Math.max(-9, ...FX.filter((f) => inT(f, x, z, -1e-6) && f.top <= 0.65).map((f) => f.top));

/** On foot from just inside the lagoon's door, stepping no more than 0.3 m. */
const walk = (() => {
  const S = 0.25;
  const seen = new Map<string, number>();
  const k = (x: number, z: number) => `${Math.round(x / S)},${Math.round(z / S)}`;
  const start: [number, number] = [(LAGUNE_DOOR.from + LAGUNE_DOOR.to) / 2, LAGUNE_DOOR.at - 1];
  seen.set(k(...start), 0);
  const q = [start];
  while (q.length) {
    const [x, z] = q.pop()!;
    const y0 = seen.get(k(x, z))!;
    for (const [dx, dz] of [[S, 0], [-S, 0], [0, S], [0, -S]]) {
      const nx = x + dx;
      const nz = z + dz;
      if (nz < LAGUNE_DOOR.at - 3 || nz > ZONES.lagune.maxZ + 1 || nx < ZONES.lagune.minX - 1 || nx > ZONES.lagune.maxX + 1 || seen.has(k(nx, nz))) continue;
      const y = ground(nx, nz);
      if (y < -0.5 || Math.abs(y - y0) > 0.31 || !free(nx, nz, Math.max(y, y0))) continue;
      seen.set(k(nx, nz), y);
      q.push([nx, nz]);
    }
  }
  return (x: number, z: number) => seen.has(k(x, z));
})();

test('the lagoon and the river are outside, apart, the island between the river\'s arms', () => {
  for (const pool of [LAGOON, RIVER])
    for (const r of pool.rects) assert.ok(r.minZ >= OUTSIDE_Z && r.maxZ <= ZONES.lagune.maxZ && r.minX >= ZONES.lagune.minX && r.maxX <= ZONES.lagune.maxX, `${pool.id} isn't outside`);
  for (const r of LAGOON.rects) for (const q of RIVER.rects) assert.ok(r.maxX < q.minX || q.maxX < r.minX || r.maxZ < q.minZ || q.maxZ < r.minZ);
  assert.ok(!overPool(RIVER, (ISLE.minX + ISLE.maxX) / 2, (ISLE.minZ + ISLE.maxZ) / 2), 'the island is dry');
  assert.ok(THERME_POOLS.includes(LAGOON) && THERME_POOLS.includes(RIVER));
  assert.ok(outside(97, 145) && !outside(97, 130), 'the weather falls outside, not under the dome');
});

test('the current runs clockwise round the island, all the way, at its speed', () => {
  const cx = (ISLE.minX + ISLE.maxX) / 2;
  const cz = (ISLE.minZ + ISLE.maxZ) / 2;
  for (const r of RIVER.rects)
    for (let x = r.minX + 0.5; x < r.maxX; x += 2)
      for (let z = r.minZ + 0.5; z < r.maxZ; z += 2) {
        const f = riverFlow(x, z);
        assert.ok(Math.abs(Math.hypot(f.x, f.z) - RIVER_SPEED) < 1e-6, `at ${x}, ${z}`);
        // Clockwise seen from above with z south: the cross of (out from the middle) and the flow points down (-y), i.e. dz*fx - dx*fz < 0.
        assert.ok((z - cz) * f.x - (x - cx) * f.z < 0, `against the stream at ${x}, ${z}`);
      }
});

test('let go in the river, it carries you right round the island and never into a wall', () => {
  const colliders = FX.map(({ minX, maxX, minZ, maxZ, top, bottom }) => ({ minX, maxX, minZ, maxZ, top, bottom }));
  const p: SwimBody = { pos: new THREE.Vector3(130, RIVER.surface - 0.2, (RIVER.rects[0].minZ + RIVER.rects[0].maxZ) / 2), colliders, grounded: false, stepOffset: 0, vy: 0, view: 'first', camYaw: 0, facing: 0, moving: false, rig: null, seat: null, holding: () => false, stopWalking() {} };
  const s = new Swimmer(p, () => [RIVER], { stroke() {}, out() {} }, () => 0);
  s.tick(0.05);
  assert.ok(s.swimming);
  const cx = (ISLE.minX + ISLE.maxX) / 2;
  const cz = (ISLE.minZ + ISLE.maxZ) / 2;
  let turned = 0;
  let a0 = Math.atan2(p.pos.z - cz, p.pos.x - cx);
  for (let i = 0; i < 20 * 260 && s.swimming; i++) {
    p.rig?.(0.05);
    const a = Math.atan2(p.pos.z - cz, p.pos.x - cx);
    let d = a - a0;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    turned += d;
    a0 = a;
  }
  assert.ok(s.swimming, 'still in the water');
  assert.ok(turned > Math.PI * 2, `carried right round (${(turned / Math.PI / 2).toFixed(2)} turns in 260 s)`);
});

test('on foot from the door: the beach, every lounger, over the bridge onto the island, round the lagoon', () => {
  for (const l of SUN_LOUNGERS) assert.ok([-1, 1].some((s) => walk(l.x + s, l.z) || walk(l.x, l.z + s * 1.4)), `${l.id} can't be walked up to`);
  assert.ok(walk((BRIDGE.minX + BRIDGE.maxX) / 2, (BRIDGE.minZ + BRIDGE.maxZ) / 2), 'onto the bridge');
  assert.ok(walk((ISLE.minX + ISLE.maxX) / 2, (ISLE.minZ + ISLE.maxZ) / 2 + 3), 'onto the island');
  assert.ok(walk(LAGOON.rects[0].minX - 1, 165) && walk(LAGOON.rects[0].maxX + 1, 160), 'round the lagoon');
  assert.ok(!walk(ZONES.lagune.maxX + 1.5, 160), 'not through the hedge');
  // Swimmers pass under the bridge: its underside is over their heads.
  const swimHead = RIVER.surface - RIVER.sink + 1.7;
  assert.ok(BRIDGE.bottom >= swimHead, `the bridge at ${BRIDGE.bottom} m, heads at ${swimHead.toFixed(2)} m`);
});

test('where you are outside, in words', () => {
  assert.equal(thermeWhereabouts(140, RIVER.surface - RIVER.sink, 152), '🌀 im Strömungskanal');
  assert.equal(thermeWhereabouts(60, LAGOON.surface - LAGOON.sink, 160), '🏝️ in der Außenlagune');
  assert.equal(thermeWhereabouts(147, 0, 168), '🌴 auf der Laguneninsel');
  assert.equal(thermeWhereabouts(45, 0, 144), '🏝️ an der Außenlagune');
});
