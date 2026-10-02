import test from 'node:test';
import assert from 'node:assert/strict';
import { BOWLING, BOWLING_BOX, BOWLING_ROOM, BOWLING_DOOR_INSIDE, BOWLING_ENTRY, FOUL_LINE_Z, HEAD_PIN_Z, LANE_PITCH, LANE_X, MINIGOLF_DOOR, ZONES, type Zone } from '../src/shared/bowling.js';
import { blockAt, BLOCK_INNER } from '../src/shared/city.js';
import { PLACES } from '../src/server/fork/office.js';

const inside = (z: Zone, r: Zone) => z.minX >= r.minX - 1e-9 && z.maxX <= r.maxX + 1e-9 && z.minZ >= r.minZ - 1e-9 && z.maxZ <= r.maxZ + 1e-9;
const overlap = (a: Zone, b: Zone) => a.minX < b.maxX - 1e-9 && b.minX < a.maxX - 1e-9 && a.minZ < b.maxZ - 1e-9 && b.minZ < a.maxZ - 1e-9;

test('the bowling centre stands on block (1, 0), inside its sidewalks', () => {
  const b = blockAt(1, 0);
  const h = BLOCK_INNER / 2;
  assert.ok(inside(BOWLING_BOX, { minX: b.x - h, maxX: b.x + h, minZ: b.z - h, maxZ: b.z + h }));
});

test('it is a place of its own', () => {
  assert.ok((PLACES as readonly string[]).includes(BOWLING));
});

test('every zone is inside the room, and no two zones overlap', () => {
  const zones = Object.entries(ZONES);
  for (const [id, z] of zones) assert.ok(inside(z, BOWLING_ROOM), `${id} is outside the room`);
  for (let i = 0; i < zones.length; i++) for (let j = i + 1; j < zones.length; j++) assert.ok(!overlap(zones[i][1], zones[j][1]), `${zones[i][0]} overlaps ${zones[j][0]}`);
});

test('the doors and where you come in are in no one zone', () => {
  const spot = { minX: BOWLING_ENTRY.x - 0.5, maxX: BOWLING_ENTRY.x + 0.5, minZ: BOWLING_ENTRY.z - 0.5, maxZ: BOWLING_DOOR_INSIDE.z + 0.4 };
  for (const [id, z] of Object.entries(ZONES)) assert.ok(!overlap(spot, z), `the entrance is in ${id}`);
});

test('the lanes fit their zone, a full 18.29 m from foul line to head pin', () => {
  for (const x of LANE_X) assert.ok(x - LANE_PITCH / 2 >= ZONES.lanes.minX && x + LANE_PITCH / 2 <= ZONES.lanes.maxX);
  assert.ok(HEAD_PIN_Z - 1 > ZONES.lanes.minZ, 'room behind the pins for the deck and machines');
  assert.ok(FOUL_LINE_Z + 4.5 <= ZONES.lanes.maxZ, 'room for the approach');
});

test('the mini golf door is in its south wall', () => {
  assert.ok(MINIGOLF_DOOR.x - MINIGOLF_DOOR.width / 2 > ZONES.minigolf.minX && MINIGOLF_DOOR.x + MINIGOLF_DOOR.width / 2 < ZONES.minigolf.maxX);
});
