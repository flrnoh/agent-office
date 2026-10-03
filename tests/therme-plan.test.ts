import test from 'node:test';
import assert from 'node:assert/strict';
import { DOME, DOORS, GYM_DOOR, GYM_FROM_THERME, NORTH_BAND_Z, ROOFS, THERME, THERME_ARRIVAL, THERME_BOX, WELLENBAD, ZONES, domeHeight, inTherme, thermeWhereabouts, zoneAt, type TRect } from '../src/shared/therme.js';
import { thermeFixtures } from '../src/shared/therme-all.js';
import { BASEMENT_FLOOR, THERME_PASSAGE, basementFixtures, inB } from '../src/shared/gym-basement.js';
import { GYM } from '../src/shared/gym.js';
import { PLACES, backInPlace, placeSpotFrom } from '../src/server/fork/office.js';
import { thermeDoorSpot, thermeView } from '../src/server/therme/place.js';

const inside = (z: TRect, r: TRect) => z.minX >= r.minX - 1e-9 && z.maxX <= r.maxX + 1e-9 && z.minZ >= r.minZ - 1e-9 && z.maxZ <= r.maxZ + 1e-9;
const overlap = (a: TRect, b: TRect) => a.minX < b.maxX - 1e-9 && b.minX < a.maxX - 1e-9 && a.minZ < b.maxZ - 1e-9 && b.minZ < a.maxZ - 1e-9;

/** How wide someone is (half), and how tall: what a fixture in the way has to clear. */
const BODY = 0.3;
const HEAD = 1.8;
const STEP = 0.5;

/** Everything you can walk to on the floor from where you come in, on a STEP grid. */
function walkable() {
  const fx = thermeFixtures().filter((f) => f.top > 0.05 && (f.bottom ?? 0) < HEAD);
  const x0 = THERME_BOX.minX - 2;
  const z0 = THERME_BOX.minZ - 2;
  const nx = Math.ceil((THERME_BOX.maxX - x0 + 2) / STEP);
  const nz = Math.ceil((ZONES.lagune.maxZ - z0 + 2) / STEP);
  const free = (x: number, z: number) => !fx.some((f) => x + BODY > f.minX && x - BODY < f.maxX && z + BODY > f.minZ && z - BODY < f.maxZ);
  // Only on the floor: inside the building (its slabs, a little past the walls' faces; not over the water).
  const slabs = thermeFixtures().filter((f) => f.id.startsWith('floor') || f.id.startsWith('out-ground'));
  const seen = new Uint8Array(nx * nz);
  const ix = (x: number) => Math.round((x - x0) / STEP);
  const iz = (z: number) => Math.round((z - z0) / STEP);
  const queue: number[] = [ix(THERME_ARRIVAL.x) + iz(THERME_ARRIVAL.z) * nx];
  seen[queue[0]] = 1;
  while (queue.length) {
    const k = queue.pop()!;
    const i = k % nx;
    const j = (k - i) / nx;
    for (const [di, dj] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const a = i + di;
      const b = j + dj;
      if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
      const n = a + b * nx;
      if (seen[n]) continue;
      const x = x0 + a * STEP;
      const z = z0 + b * STEP;
      if (!slabs.some((f) => inB(f, x, z, -1e-6)) || !free(x, z)) continue;
      seen[n] = 1;
      queue.push(n);
    }
  }
  return (x: number, z: number) => !!seen[ix(x) + iz(z) * nx];
}

test('it is a place of its own, with a view of its own, and you come back in after a reload', () => {
  assert.ok((PLACES as readonly string[]).includes(THERME));
  assert.equal(THERME, '@therme');
  assert.equal(backInPlace(THERME, 2), THERME);
  assert.equal(backInPlace(THERME, 0), undefined, 'no building, no gym, no baths');
  assert.equal(thermeView({ floor: 'x' } as never).floor, THERME);
});

test('the zones: the parts side by side under one roof, the wave pool in the paradise, the lagoon outside', () => {
  const parts = [ZONES.dorf, ZONES.paradies, ZONES.rutschen];
  for (const z of parts) assert.ok(inside(z, THERME_BOX));
  for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) assert.ok(!overlap(parts[i], parts[j]), `${i} overlaps ${j}`);
  for (const z of [ZONES.gang, ZONES.lobby]) {
    assert.ok(inside(z, { ...THERME_BOX, maxZ: NORTH_BAND_Z }), 'in the north band');
    for (const q of parts) assert.ok(!overlap(z, q));
  }
  assert.ok(!overlap(ZONES.gang, ZONES.lobby));
  assert.ok(inside(WELLENBAD, ZONES.paradies), 'the wave pool is in the Thermenparadies');
  assert.ok(ZONES.lagune.minZ >= THERME_BOX.maxZ, 'the lagoon is outside, past the south wall');
  assert.ok(ROOFS.rutschen >= 30 + 2, 'the slide tower fits under its roof');
});

test('the dome rises from the eaves to its crown over the middle of the Thermenparadies', () => {
  assert.equal(domeHeight(DOME.cx, DOME.cz), DOME.top);
  assert.equal(domeHeight(ZONES.paradies.minX + 0.01, DOME.cz), DOME.spring + (DOME.top - DOME.spring) * Math.sqrt(1 - ((ZONES.paradies.minX + 0.01 - DOME.cx) / DOME.rx) ** 2));
  assert.equal(domeHeight(ZONES.paradies.minX, ZONES.paradies.minZ), ROOFS.paradies, 'the corners are under the eaves');
  assert.ok(domeHeight(DOME.cx, DOME.cz) < ROOFS.rutschen + 1e-9);
});

test('every door is in a wall: a gap in it, with a lintel over it', () => {
  const fx = thermeFixtures();
  for (const d of DOORS) {
    const c = d.at + (d.shift ?? 0);
    const mid = (d.from + d.to) / 2;
    const [x, z] = d.axis === 'x' ? [mid, c] : [c, mid];
    const solid = fx.filter((f) => !f.id.startsWith('floor') && !f.id.startsWith('shut-') && f.id !== 'gym-door' && inB(f, x, z, -1e-6));
    assert.ok(solid.length > 0, `${d.id} has a lintel over it`);
    for (const f of solid) assert.ok((f.bottom ?? 0) >= d.height - 1e-6, `${d.id}: ${f.id} stands in the opening`);
  }
});

test('from the door you come in by you can walk through the passage into the hall, everywhere that is built, and no further', () => {
  const reach = walkable();
  const P = ZONES.paradies;
  const R = ZONES.rutschen;
  const spots: [string, number, number][] = [
    ['where you come in', THERME_ARRIVAL.x, THERME_ARRIVAL.z],
    ['in front of the door back to the gym', GYM_DOOR.x, GYM_DOOR.z + 0.6],
    ['down the passage', ZONES.gang.minX + 1, NORTH_BAND_Z - 1],
    ['out of the passage into the hall', (ZONES.gang.minX + ZONES.gang.maxX) / 2, NORTH_BAND_Z + 2],
    ['under the dome', DOME.cx, DOME.cz],
    ['the Thermenparadies by the sauna village', P.minX + 1, (P.minZ + P.maxZ) / 2],
    ['the top of the wave pool\'s beach', (WELLENBAD.minX + WELLENBAD.maxX) / 2, WELLENBAD.minZ - 0.8],
    ['the slide world', (R.minX + R.maxX) / 2, (R.minZ + R.maxZ) / 2],
    ['the slide world, by the board', 179.5, 93.5],
    ['through the door into the Saunadorf', ZONES.dorf.maxX - 1.5, 74],
    ['out through the glass doors onto the lagoon\'s beach', 97.5, 143.5],
  ];
  for (const [what, x, z] of spots) assert.ok(reach(x, z), `you can walk to ${what}`);
  // In front of each shut door, from the hall's side.
  for (const d of DOORS.filter((d) => d.shut)) {
    const c = d.at + (d.shift ?? 0);
    const mid = (d.from + d.to) / 2;
    const [x, z] = d.axis === 'x' ? [mid, d.id === 'lobby' ? c + 1 : c - 1] : [c + 1, mid];
    assert.ok(reach(x, z), `you can walk up to the ${d.id} door`);
  }
  const shut: [string, number, number][] = [
    ['the entrance hall', (ZONES.lobby.minX + ZONES.lobby.maxX) / 2, NORTH_BAND_Z / 2],
    ['the plant rooms', 50, NORTH_BAND_Z / 2],
    ['through the door back to the gym', GYM_DOOR.x, THERME_BOX.minZ - 1],
  ];
  for (const [what, x, z] of shut) assert.ok(!reach(x, z), `${what} is shut for now`);
});

test('the door between the gym and the baths: the office lands you by it on either side', () => {
  assert.deepEqual(thermeDoorSpot(THERME, GYM), THERME_ARRIVAL);
  assert.deepEqual(thermeDoorSpot(GYM, THERME), GYM_FROM_THERME);
  assert.equal(thermeDoorSpot(GYM, 'some-floor'), null, 'into the gym from the street is its front door');
  assert.equal(thermeDoorSpot('@casino', THERME), null);
  // In the baths: in the passage, facing down it, clear of everything.
  assert.equal(zoneAt(THERME_ARRIVAL.x, THERME_ARRIVAL.z), 'gang');
  assert.equal(THERME_ARRIVAL.rotY, 0);
  for (const f of thermeFixtures()) if (f.top > 0.05 && (f.bottom ?? 0) < HEAD) assert.ok(!inB(f, THERME_ARRIVAL.x, THERME_ARRIVAL.z, -BODY), `${f.id} is where you come in`);
  // In the gym: down in the basement's passage, in front of its door, clear of everything there.
  assert.equal(GYM_FROM_THERME.y, BASEMENT_FLOOR);
  assert.ok(inB(THERME_PASSAGE, GYM_FROM_THERME.x, GYM_FROM_THERME.z, BODY));
  assert.ok(GYM_FROM_THERME.z < THERME_PASSAGE.door - 0.5);
  for (const f of basementFixtures()) if (f.top > BASEMENT_FLOOR + 0.05 && (f.bottom ?? BASEMENT_FLOOR) < BASEMENT_FLOOR + HEAD) assert.ok(!inB(f, GYM_FROM_THERME.x, GYM_FROM_THERME.z, -BODY), `${f.id} is where you come back to the gym`);
  // The two doors are as wide as each other.
  assert.equal(GYM_DOOR.width, THERME_PASSAGE.maxX - THERME_PASSAGE.minX);
});

test('where someone is in there, in words', () => {
  assert.equal(thermeWhereabouts(THERME_ARRIVAL.x, THERME_ARRIVAL.z), '🚪 im Gang zur Therme');
  assert.equal(thermeWhereabouts(DOME.cx, 40), '🌴 im Thermenparadies');
  assert.equal(thermeWhereabouts((WELLENBAD.minX + WELLENBAD.maxX) / 2, 100), '🌊 am Wellenbad');
  assert.equal(thermeWhereabouts(170, 80), '🛝 in der Rutschenwelt');
  assert.ok(inTherme(DOME.cx, DOME.cz));
  assert.ok(!inTherme(-5, -5));
});

test('a reload keeps you where you stood, all over the baths and down in the gym basement (wider than a floor)', () => {
  const q = (x: number, y: number, z: number) => new URLSearchParams({ x: String(x), y: String(y), z: String(z), rotY: '1' });
  assert.deepEqual(placeSpotFrom(THERME, q(170, 0, 120)), { x: 170, y: 0, z: 120, rotY: 1 });
  assert.deepEqual(placeSpotFrom(THERME, q(100, 0, 185)), { x: 100, y: 0, z: 185, rotY: 1 }, 'out at the lagoon');
  assert.deepEqual(placeSpotFrom(THERME, q(9999, 999, -9999)), { x: THERME_BOX.maxX + 1, y: 40, z: THERME_BOX.minZ - 1, rotY: 1 }, 'but not anywhere at all');
  assert.deepEqual(placeSpotFrom(GYM, q(20, BASEMENT_FLOOR, 86)), { x: 20, y: BASEMENT_FLOOR, z: 86, rotY: 1 }, 'in front of the door to the baths');
  assert.equal(placeSpotFrom(GYM, new URLSearchParams()), undefined);
  assert.deepEqual(placeSpotFrom('@casino', q(100, 0, 100)), { x: 60, y: 0, z: 60, rotY: 1 }, 'the other places keep a floor\'s bounds');
});
