import test from 'node:test';
import assert from 'node:assert/strict';
import { thermeFixtures, thermeWater, outsideWater } from '../src/shared/therme-all.js';
import { THERME_POOLS } from '../src/shared/therme-all.js';
import { BATHER_PLAN, NPC_LAWN, NPC_LOUNGERS, ROUTES, batherAt, routePeriod, type BatherRole } from '../src/shared/therme-bathers.js';
import { LOUNGERS } from '../src/shared/therme-paradies.js';
import { dorfSeats } from '../src/shared/therme-dorf.js';
import { WAVES } from '../src/shared/therme-waves.js';
import { inPoolAt, overPool } from '../src/shared/swim.js';

// The thermal baths' other bathers (flrnoh fork, see FORK.md "The thermal baths", phase 8): where the
// office's clock puts them, the same on every page; the swimmers in the water, the walkers on dry
// floor (never over a pool, never through a wall, a sign or a lounger), those lying down on loungers.

const FX = thermeFixtures();
const BODY = 0.3;
const blocked = (x: number, y: number, z: number) => FX.some((f) => f.top > y + 0.05 && (f.bottom ?? 0) < y + 1.7 && x + BODY > f.minX && x - BODY < f.maxX && z + BODY > f.minZ && z - BODY < f.maxZ);
const WATER = [...thermeWater(), ...outsideWater()];
/** Whether a walker's feet (a body's width round them) are anywhere over water, the Kneipp trough too. */
const wet = (x: number, z: number) => WATER.some((r) => x + BODY > r.minX && x - BODY < r.maxX && z + BODY > r.minZ && z - BODY < r.maxZ);
const WALKERS: readonly BatherRole[] = ['walk', 'beach', 'garden'];
const SWIMMERS: readonly BatherRole[] = ['ring', 'waves', 'whirl', 'river', 'lagoon', 'tub', 'bar'];

test('every one of them where the clock says, the same every time it\'s asked, and they move', () => {
  assert.equal(BATHER_PLAN.reduce((n, [, c]) => n + c, 0), 38);
  assert.deepEqual(batherAt('ring', 2, 3.4, 123_456_789), batherAt('ring', 2, 3.4, 123_456_789));
  for (const r of WALKERS) assert.notDeepEqual(batherAt(r, 0, 0, 0), batherAt(r, 0, 0, 60_000), `${r} walks`);
});

test('the walkers walk every bit of their routes on dry floor: never over a pool, never into anything', () => {
  for (const role of WALKERS) {
    const period = routePeriod(role) * 1000;
    assert.ok(period > 0, role);
    for (let t = 0; t < period; t += 300) {
      const b = batherAt(role, 0, 0, t);
      assert.ok(!wet(b.x, b.z), `${role} walks over the water at ${b.x.toFixed(1)}, ${b.z.toFixed(1)}`);
      assert.ok(!blocked(b.x, 0, b.z), `${role} walks into something at ${b.x.toFixed(1)}, ${b.z.toFixed(1)}`);
    }
    // There and back: facing the way they walk both ways.
    const r = ROUTES[role]!;
    assert.equal(r.loop, false);
  }
});

test('over a whole day: the swimmers in the water, clear of what stands in it; the loungers\' on theirs', () => {
  const day = 24 * 3600_000;
  for (let now = 0; now < day; now += 177_000 + 13) {
    for (const t of [now, now + WAVES.run / 2]) {
      let n = 0;
      for (const [role, count] of BATHER_PLAN)
        for (let slot = 0; slot < count; slot++, n++) {
          const b = batherAt(role, slot, n * 1.7, t);
          if (!SWIMMERS.includes(role)) continue;
          const pool = THERME_POOLS.find((p) => inPoolAt(p, b.x, b.y, b.z));
          assert.ok(pool, `${role} ${slot} out of the water at ${b.x.toFixed(1)}, ${b.y.toFixed(2)}, ${b.z.toFixed(1)}`);
          // A body's width of water all round (no swimming half in a wall).
          for (const [dx, dz] of [[BODY, 0], [-BODY, 0], [0, BODY], [0, -BODY]]) assert.ok(overPool(pool!, b.x + dx, b.z + dz), `${role} ${slot} in the wall at ${b.x.toFixed(1)}, ${b.z.toFixed(1)}`);
          assert.ok(!blocked(b.x, b.y, b.z) || role === 'river' || role === 'bar', `${role} ${slot} swims into something at ${b.x.toFixed(1)}, ${b.z.toFixed(1)}`);
        }
    }
  }
  for (const id of NPC_LOUNGERS) assert.ok(LOUNGERS.some((l) => l.id === id));
  for (const id of NPC_LAWN) assert.ok(dorfSeats().some((l) => l.id === id && l.pose === 'lie'));
  assert.equal(new Set(NPC_LOUNGERS).size, 6);
});
