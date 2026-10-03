import test from 'node:test';
import assert from 'node:assert/strict';
import { STREET_DOOR, THERME, ZONES, inT, type TRect } from '../src/shared/therme.js';
import { thermeFixtures } from '../src/shared/therme-all.js';
import { GATES, KASSE, LOBBY_ARRIVAL, STREET_TOWER, THERME_STREET_BOX, THERME_STREET_DOOR, THERME_STREET_HALL, THERME_STREET_SPOT, TURNSTILE_Z } from '../src/shared/therme-street.js';
import { GYM_STREET_BOX } from '../src/shared/gym.js';
import { VENUE_BOX } from '../src/shared/venue.js';
import { HALL_BOX } from '../src/shared/hall.js';
import { CASINO_BOX } from '../src/shared/casino.js';
import { SOCCER_BOX } from '../src/shared/soccer.js';
import { FARM, nearLoop } from '../src/shared/scenic.js';
import { paved } from '../src/shared/garage.js';
import { LOTS } from '../src/shared/city.js';
import { thermeDoorSpot } from '../src/server/therme/place.js';
import { PLACES_ON_MAP, placeSpot } from '../src/client/features/minimap/pois.js';

// The thermal baths on the street (flrnoh fork, see FORK.md "The thermal baths", phase 7): their
// house south of the gym, clear of everything there, its doors on the side street, and the entrance
// hall inside from the doors through the turnstiles into the baths.

const overlap = (a: TRect, b: TRect, pad = 0) => a.minX < b.maxX + pad && b.minX < a.maxX + pad && a.minZ < b.maxZ + pad && b.minZ < a.maxZ + pad;
const around = (x: number, z: number, r: number): TRect => ({ minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r });

test('the house stands south of the gym, clear of its neighbours, the farm, the town\'s buildings, the roads and the loop', () => {
  const B = THERME_STREET_BOX;
  assert.ok(B.minZ > GYM_STREET_BOX.maxZ + 10, 'behind the gym');
  for (const [what, r] of [
    ['gym', GYM_STREET_BOX],
    ['Schallwerk', VENUE_BOX],
    ['padel hall', HALL_BOX],
    ['casino', CASINO_BOX],
    ['soccer hall', SOCCER_BOX],
    ...FARM.fields.map((f, i) => [`field ${i}`, f] as const),
    ['pasture', FARM.pasture],
    ['barn', around(FARM.barn.x, FARM.barn.z, 8)],
    ['silo', around(FARM.silo.x, FARM.silo.z, 4)],
  ] as const)
    assert.ok(!overlap(B, r, 1), `it stands on the ${what}`);
  for (const l of LOTS) assert.ok(!overlap(B, { minX: l.x - l.w / 2, maxX: l.x + l.w / 2, minZ: l.z - l.d / 2, maxZ: l.z + l.d / 2 }, 1), `it stands on a building of the town at ${l.x}, ${l.z}`);
  for (let x = B.minX; x <= B.maxX; x += 1)
    for (let z = B.minZ; z <= B.maxZ; z += 1) {
      assert.ok(!paved(x, z), `a road runs through it at ${x}, ${z}`);
      const at = nearLoop(x, z);
      assert.ok(!at || at.off > 6, `the loop runs through it at ${x}, ${z}`);
    }
  assert.ok(inT(B, STREET_TOWER.x, STREET_TOWER.z, STREET_TOWER.half) && !inT(THERME_STREET_HALL, STREET_TOWER.x, STREET_TOWER.z, -STREET_TOWER.half), 'the slide tower stands on the lot, outside the hall');
});

test('its doors face the side street: in front of them the sidewalk, the road beyond', () => {
  const D = THERME_STREET_DOOR;
  assert.equal(D.x, THERME_STREET_BOX.minX);
  assert.ok(!inT(THERME_STREET_BOX, THERME_STREET_SPOT.x, THERME_STREET_SPOT.z), 'you come out in front of it');
  let road = false;
  for (let x = D.x - 1; x > D.x - 12; x -= 0.5) if (paved(x, D.z)) road = true;
  assert.ok(road, 'a road within a few metres of its doors');
  assert.equal(THERME_STREET_SPOT.rotY, -Math.PI / 2, 'facing the street (west)');
});

test('it\'s on the map, and those inside are shown at it', () => {
  assert.equal(PLACES_ON_MAP.filter((p) => p.id === THERME).length, 1);
  const s = placeSpot(THERME)!;
  assert.ok(inT(THERME_STREET_BOX, s.x, s.z));
});

test('in off the street you land at the box office; through a turnstile into the baths', () => {
  const at = thermeDoorSpot(THERME, 'floor-1')!;
  assert.deepEqual(at, LOBBY_ARRIVAL);
  assert.ok(inT(ZONES.lobby, at.x, at.z, 0.5));
  const FX = thermeFixtures().filter((f) => f.top > 0.05 && (f.bottom ?? 0) < 1.7);
  const free = (x: number, z: number) => !FX.some((f) => x + 0.3 > f.minX && x - 0.3 < f.maxX && z + 0.3 > f.minZ && z - 0.3 < f.maxZ);
  assert.ok(free(at.x, at.z), 'room where you come in');
  for (const g of GATES) assert.ok(free(g, TURNSTILE_Z), `through gate ${g}`);
  assert.ok(!free((KASSE.minX + KASSE.maxX) / 2, (KASSE.minZ + KASSE.maxZ) / 2), 'the counter is solid');
  assert.ok(free(KASSE.maxX + 0.6, (KASSE.minZ + KASSE.maxZ) / 2), 'room in front of the counter');
  assert.ok(!free(STREET_DOOR.x, -0.1), 'the street doors are shut (E goes out)');
});
