// flrnoh fork (see FORK.md "The minimap"): what the minimap and the big map name, and where.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BOUNDS } from '../src/client/features/minimap/atlas.js';
import { ALL_POIS, HOME, PLACES_ON_MAP, SHOPS_ON_MAP, compassWord, distanceWord, placeSpot } from '../src/client/features/minimap/pois.js';
import { CASINO } from '../src/shared/casino.js';
import { GYM } from '../src/shared/gym.js';
import { HALL } from '../src/shared/hall.js';
import { EXIT_STAIRS, FLOOR, ROAD } from '../src/shared/layout.js';
import { ROOF } from '../src/shared/rooftop.js';
import { SHOPS } from '../src/shared/shops.js';
import { SOCCER } from '../src/shared/soccer.js';
import { BOWLING } from '../src/shared/bowling.js';
import { VENUE } from '../src/shared/venue.js';

test('every place and shop is on the map, once', () => {
  const ids = ALL_POIS.map((p) => p.id);
  assert.deepEqual(
    ids.filter((id, i) => ids.indexOf(id) !== i),
    [],
  );
  for (const p of ALL_POIS) {
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.z), `${p.name} has a spot`);
    assert.ok(p.x > BOUNDS.minX && p.x < BOUNDS.maxX && p.z > BOUNDS.minZ && p.z < BOUNDS.maxZ, `${p.name} (${p.x.toFixed(0)}, ${p.z.toFixed(0)}) is inside the drawn map`);
    assert.ok(p.icon && p.name, `${p.id} has an icon and a name`);
  }
  assert.equal(SHOPS_ON_MAP.length, SHOPS.length, 'one mark for each shop');
  for (const id of ['tankstelle', 'kino', 'baumarkt', CASINO, GYM, HALL, SOCCER, BOWLING, VENUE, 'beach']) assert.ok(PLACES_ON_MAP.some((p) => p.id === id), `${id} is on the map`);
});

test('the way home ends at the foot of the steps up to the office door, off the street', () => {
  assert.ok(HOME.x < FLOOR.minX && HOME.x > EXIT_STAIRS.minX - 1, 'beside the west wall, where the steps are');
  assert.ok(HOME.z > EXIT_STAIRS.landingZ1 && HOME.z < ROAD.minZ, 'between the landing and the street');
});

test('inside a place of its own you show up at its building; on a floor or the roof, where you stand', () => {
  for (const id of [CASINO, GYM, HALL, SOCCER, BOWLING, VENUE]) {
    const at = placeSpot(id);
    const door = PLACES_ON_MAP.find((p) => p.id === id)!;
    assert.ok(at, `${id} has a spot on the map`);
    assert.ok(Math.hypot(at.x - door.x, at.z - door.z) < 40, `${id}: its building is by its door`);
  }
  assert.equal(placeSpot(ROOF), null);
  assert.equal(placeSpot('some-floor'), null);
  assert.equal(placeSpot(null), null);
});

test('directions and distances in words', () => {
  assert.equal(compassWord(0), 'N');
  assert.equal(compassWord(Math.PI / 2), 'O');
  assert.equal(compassWord(Math.PI), 'S');
  assert.equal(compassWord(-Math.PI / 2), 'W');
  assert.equal(compassWord(-Math.PI / 4), 'NW');
  assert.equal(compassWord(4 * Math.PI + 0.1), 'N');
  assert.equal(distanceWord(87), '85 m');
  assert.equal(distanceWord(1234), '1,2 km');
});
