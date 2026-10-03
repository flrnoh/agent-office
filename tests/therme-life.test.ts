import test from 'node:test';
import assert from 'node:assert/strict';
import { thermeFixtures } from '../src/shared/therme-all.js';
import { THERME_POOLS } from '../src/shared/therme-all.js';
import { BATHER_PLAN, NPC_LOUNGERS, batherAt } from '../src/shared/therme-bathers.js';
import { LOUNGERS } from '../src/shared/therme-paradies.js';
import { WAVES } from '../src/shared/therme-waves.js';
import { inPoolAt } from '../src/shared/swim.js';

// The thermal baths' other bathers (flrnoh fork, see FORK.md "The thermal baths", phase 8): thirty,
// where the office's clock puts them, the same on every page; the swimmers in the water, the walkers
// clear of everything, those on loungers on loungers.

const FX = thermeFixtures();
const BODY = 0.3;
const blocked = (x: number, y: number, z: number) => FX.some((f) => f.top > y + 0.05 && (f.bottom ?? 0) < y + 1.7 && x + BODY > f.minX && x - BODY < f.maxX && z + BODY > f.minZ && z - BODY < f.maxZ);

test('thirty of them, where the clock says, the same every time it\'s asked', () => {
  assert.equal(BATHER_PLAN.reduce((n, [, c]) => n + c, 0), 30);
  assert.deepEqual(batherAt('ring', 2, 3.4, 123_456_789), batherAt('ring', 2, 3.4, 123_456_789));
  assert.notDeepEqual(batherAt('ring', 2, 3.4, 0), batherAt('ring', 2, 3.4, 60_000), 'they move');
});

test('over a whole day: the swimmers in the water, the walkers on the deck clear of everything, the loungers\' on theirs', () => {
  const day = 24 * 3600_000;
  for (let now = 0; now < day; now += 977_000 + 13) {
    for (const t of [now, now + WAVES.run / 2]) {
      let n = 0;
      for (const [role, count] of BATHER_PLAN)
        for (let slot = 0; slot < count; slot++, n++) {
          const b = batherAt(role, slot, n * 1.7, t);
          if (role === 'walk' || role === 'lounge') {
            if (role === 'walk') assert.ok(!blocked(b.x, 0, b.z), `walker ${slot} in something at ${b.x.toFixed(1)}, ${b.z.toFixed(1)}`);
            continue;
          }
          assert.ok(THERME_POOLS.some((p) => inPoolAt(p, b.x, b.y, b.z)), `${role} ${slot} out of the water at ${b.x.toFixed(1)}, ${b.y.toFixed(2)}, ${b.z.toFixed(1)}`);
          assert.ok(!blocked(b.x, b.y, b.z), `${role} ${slot} swims into something at ${b.x.toFixed(1)}, ${b.z.toFixed(1)}`);
        }
    }
  }
  for (const id of NPC_LOUNGERS) assert.ok(LOUNGERS.some((l) => l.id === id));
  assert.equal(new Set(NPC_LOUNGERS).size, 6);
});
