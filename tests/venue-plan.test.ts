import test from 'node:test';
import assert from 'node:assert/strict';
import { INSTRUMENT_SPOTS, REHEARSAL_ROOMS, STUDIO_REGIE_X, VENUE, VENUE_BOX, VENUE_DOOR_INSIDE, VENUE_ENTRY, VENUE_ROOM, WING_CORRIDOR, WING_DOOR, ZONES, venueRoomAt, type Zone } from '../src/shared/venue.js';
import { GYM_STREET_BOX } from '../src/shared/gym.js';
import { FARM, nearLoop } from '../src/shared/scenic.js';
import { ROAD } from '../src/shared/layout.js';
import { PLACES } from '../src/server/fork/office.js';

const inside = (z: Zone, r: Zone) => z.minX >= r.minX - 1e-9 && z.maxX <= r.maxX + 1e-9 && z.minZ >= r.minZ - 1e-9 && z.maxZ <= r.maxZ + 1e-9;
const overlap = (a: Zone, b: Zone, pad = 0) => a.minX < b.maxX + pad - 1e-9 && b.minX < a.maxX + pad - 1e-9 && a.minZ < b.maxZ + pad - 1e-9 && b.minZ < a.maxZ + pad - 1e-9;
const around = (x: number, z: number, r: number): Zone => ({ minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r });

test('the Schallwerk stands across the street east of the gym, clear of the farm and the loop', () => {
  assert.ok(VENUE_BOX.minX > GYM_STREET_BOX.maxX, 'east of the gym');
  assert.ok(VENUE_BOX.minZ > ROAD.maxZ + 2, 'off the road and its sidewalk');
  for (const f of [...FARM.fields, FARM.pasture, around(FARM.barn.x, FARM.barn.z, 8), around(FARM.silo.x, FARM.silo.z, 4), around(FARM.windmill.x, FARM.windmill.z, 8)]) assert.ok(!overlap(VENUE_BOX, f), `the farm's ${JSON.stringify(f)} is in it`);
  for (let x = VENUE_BOX.minX; x <= VENUE_BOX.maxX; x += 1)
    for (let z = VENUE_BOX.minZ; z <= VENUE_BOX.maxZ; z += 1) {
      const at = nearLoop(x, z);
      assert.ok(!at || at.off > 6, `the loop runs through it at ${x}, ${z}`);
    }
});

test('the farm no longer stands in the gym', () => {
  assert.ok(!overlap(GYM_STREET_BOX, FARM.pasture), 'the cows are in the gym');
  assert.ok(!overlap(GYM_STREET_BOX, around(FARM.barn.x, FARM.barn.z, 8)));
});

test('it is a place of its own', () => {
  assert.ok((PLACES as readonly string[]).includes(VENUE));
});

test('every zone is inside the room, and no two zones overlap', () => {
  const zones = Object.entries(ZONES);
  for (const [id, z] of zones) assert.ok(inside(z, VENUE_ROOM), `${id} is outside the room`);
  for (let i = 0; i < zones.length; i++) for (let j = i + 1; j < zones.length; j++) assert.ok(!overlap(zones[i][1], zones[j][1]), `${zones[i][0]} overlaps ${zones[j][0]}`);
});

test('the doors and where you come in are in the foyer, clear of its stands', () => {
  assert.ok(inside({ minX: VENUE_ENTRY.x - 0.5, maxX: VENUE_ENTRY.x + 0.5, minZ: VENUE_DOOR_INSIDE.z - 0.4, maxZ: VENUE_ENTRY.z + 0.5 }, ZONES.foyer));
});

test('the rehearsal rooms and their corridor are in the wing, apart, their doors on the corridor', () => {
  assert.ok(inside(WING_CORRIDOR, ZONES.wing));
  assert.ok(WING_DOOR.z - WING_DOOR.width / 2 > ZONES.wing.minZ && WING_DOOR.z + WING_DOOR.width / 2 < ZONES.foyer.maxZ, 'the wing door opens into the foyer');
  for (const r of REHEARSAL_ROOMS) {
    assert.ok(inside(r.box, ZONES.wing), `${r.id} is outside the wing`);
    assert.ok(!overlap(r.box, WING_CORRIDOR), `${r.id} is in the corridor`);
    assert.ok(r.box.maxX === WING_CORRIDOR.minX, `${r.id} doesn't reach the corridor`);
    assert.ok(r.door.z - r.door.width / 2 > r.box.minZ + 0.2 && r.door.z + r.door.width / 2 < r.box.maxZ - 0.2, `${r.id}'s door is off its wall`);
    assert.equal(venueRoomAt((r.box.minX + r.box.maxX) / 2, (r.box.minZ + r.box.maxZ) / 2), r.id);
  }
  for (let i = 0; i < REHEARSAL_ROOMS.length; i++) for (let j = i + 1; j < REHEARSAL_ROOMS.length; j++) assert.ok(!overlap(REHEARSAL_ROOMS[i].box, REHEARSAL_ROOMS[j].box));
  assert.equal(venueRoomAt(0, 0), 'hall');
});

test('every instrument stands in its room, the stage ones on the stage, apart from each other', () => {
  const ids = new Set<string>();
  for (const s of INSTRUMENT_SPOTS) {
    assert.ok(!ids.has(s.id), `${s.id} twice`);
    ids.add(s.id);
    assert.equal(venueRoomAt(s.x, s.z), s.room, `${s.id} isn't in ${s.room}`);
    const room = REHEARSAL_ROOMS.find((r) => r.id === s.room);
    const box = room ? room.box : ZONES.stage;
    assert.ok(inside(around(s.x, s.z, 0.7), box), `${s.id} is too close to its walls`);
    if (s.room === 'studio') assert.ok(s.x < STUDIO_REGIE_X - 0.7, `${s.id} is in the control room`);
  }
  for (const a of INSTRUMENT_SPOTS)
    for (const b of INSTRUMENT_SPOTS) if (a !== b && a.room === b.room) assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > 1.4, `${a.id} and ${b.id} stand in each other`);
  for (const r of ['probe1', 'probe2', 'probe3'])
    assert.deepEqual(
      INSTRUMENT_SPOTS.filter((s) => s.room === r)
        .map((s) => s.kind)
        .sort(),
      ['bass', 'drums', 'guitar', 'keys', 'mic'],
    );
});
