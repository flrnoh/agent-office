import test from 'node:test';
import assert from 'node:assert/strict';
import { BENCHES, BOARD, GOAL, JOIN_SPOTS, PITCH, SOCCER_BOX, SOCCER_DOOR, SOCCER_DOOR_INSIDE, SOCCER_ENTRY, SOCCER_ROOM, SOCCER_STREET_SPOT, STAND, onPitch } from '../src/shared/soccer.js';
import { HALL_BOX } from '../src/shared/hall.js';
import { CASINO_BOX } from '../src/shared/casino.js';
import { GOLF_HOLE, ROAD } from '../src/shared/layout.js';
import { PAVEMENT } from '../src/shared/garage.js';
import { STREET_END } from '../src/shared/scenic.js';
import { neighbourBoxes } from '../src/client/world/outside.js';

// The soccer hall's building (flrnoh fork, see FORK.md "The soccer hall"): its lot on the street and
// what stands where inside.

type Box = { minX: number; maxX: number; minZ: number; maxZ: number };
const overlap = (a: Box, b: Box) => a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;

test('the soccer hall stands across the street between the golf hole and the padel hall, clear of both', () => {
  assert.ok(SOCCER_BOX.minZ > ROAD.maxZ + 2);
  // At least a metre from the padel hall, and from the golf green (with its fringe) and fairway.
  assert.ok(HALL_BOX.minX - SOCCER_BOX.maxX >= 1);
  assert.ok(SOCCER_BOX.minX - (GOLF_HOLE.x + GOLF_HOLE.green + 0.7) >= 1);
  assert.ok(SOCCER_BOX.minX > GOLF_HOLE.fairway[1] + 1);
  assert.ok(!overlap(SOCCER_BOX, CASINO_BOX) && !overlap(SOCCER_BOX, HALL_BOX));
  for (const p of PAVEMENT) assert.ok(!overlap(SOCCER_BOX, p));
  assert.ok(SOCCER_BOX.maxX < STREET_END - 20);
  // In the neighbours' list (for golf balls and trees), and no neighbour on its lot.
  const mine = neighbourBoxes().filter((b) => b.minX === SOCCER_BOX.minX && b.maxZ === SOCCER_BOX.maxZ);
  assert.equal(mine.length, 1);
  for (const b of neighbourBoxes()) if (!(b.minX === SOCCER_BOX.minX && b.maxZ === SOCCER_BOX.maxZ)) assert.ok(!overlap(SOCCER_BOX, b), JSON.stringify(b));
  // Long north–south, its doors in the north face, landing on the sidewalk side coming out.
  assert.ok(SOCCER_BOX.maxZ - SOCCER_BOX.minZ > SOCCER_BOX.maxX - SOCCER_BOX.minX);
  assert.ok(SOCCER_DOOR.x - SOCCER_DOOR.width / 2 > SOCCER_BOX.minX && SOCCER_DOOR.x + SOCCER_DOOR.width / 2 < SOCCER_BOX.maxX);
  assert.ok(SOCCER_STREET_SPOT.z < SOCCER_BOX.minZ && SOCCER_STREET_SPOT.z > ROAD.maxZ);
});

test('inside: a 27 × 14 pitch with its goals, the stand, benches, doors and joining spots off it', () => {
  const room = SOCCER_ROOM;
  assert.equal(PITCH.maxZ - PITCH.minZ, 27);
  assert.equal(PITCH.maxX - PITCH.minX, 14);
  // The pitch, its boards and the goals' nets fit in the room with room to walk round.
  assert.ok(PITCH.minX - BOARD.thick - room.minX >= 1.2 && room.maxX - PITCH.maxX - BOARD.thick >= 1.2);
  assert.ok(PITCH.minZ - GOAL.depth - room.minZ >= 2.5);
  assert.ok(STAND.minZ - (PITCH.maxZ + GOAL.depth) >= 0.5 && STAND.maxZ <= room.maxZ);
  for (const b of BENCHES) assert.ok(b.x > room.minX && b.x < PITCH.minX - BOARD.thick && !onPitch(b.x, b.z0));
  // Coming in, you stand inside the doors, off the pitch.
  assert.ok(!onPitch(SOCCER_ENTRY.x, SOCCER_ENTRY.z, 1));
  assert.ok(SOCCER_ENTRY.z > room.minZ && SOCCER_DOOR_INSIDE.z > room.minZ && SOCCER_DOOR_INSIDE.z < SOCCER_ENTRY.z);
  // The joining spots are on the boards at the halfway line, one each side.
  assert.deepEqual(JOIN_SPOTS.map((s) => Math.sign(s.x)), [-1, 1]);
  for (const s of JOIN_SPOTS) assert.equal(s.z, 0);
});
