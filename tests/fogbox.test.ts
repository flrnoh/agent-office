import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OFFICE_ROOM, fogBoxUniforms, outdoorShare, segmentInBox, setFogRooms, wingRoom, type Box } from '../src/client/world/fogbox.js';
import { FLOOR, WALL_T, WING, wingMinZ } from '../src/shared/layout.js';

const unit: Box = { min: [0, 0, 0], max: [1, 1, 1] };
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);

test('a segment wholly inside a box is all in it', () => {
  near(segmentInBox([0.2, 0.5, 0.5], [0.8, 0.5, 0.5], unit), 1);
});

test('from inside out through a wall: the part up to the wall', () => {
  // From x 0.5 to x 2.5: 0.5 of 2 is inside.
  near(segmentInBox([0.5, 0.5, 0.5], [2.5, 0.5, 0.5], unit), 0.25);
});

test('from outside in, and right through', () => {
  near(segmentInBox([-1, 0.5, 0.5], [0.5, 0.5, 0.5], unit), 1 / 3);
  near(segmentInBox([-1, 0.5, 0.5], [2, 0.5, 0.5], unit), 1 / 3);
  near(segmentInBox([2, 0.5, 0.5], [-1, 0.5, 0.5], unit), 1 / 3);
});

test('a segment that misses the box, or stops short of it', () => {
  near(segmentInBox([-1, 2, 0.5], [2, 2, 0.5], unit), 0);
  near(segmentInBox([-2, 0.5, 0.5], [-1, 0.5, 0.5], unit), 0);
  // Parallel to a face, just outside it.
  near(segmentInBox([-1, 1.001, 0.5], [2, 1.001, 0.5], unit), 0);
});

test('diagonal through a corner region', () => {
  // From (−1,−1,0.5) to (2,2,0.5): inside for t in [1/3, 2/3].
  near(segmentInBox([-1, -1, 0.5], [2, 2, 0.5], unit), 1 / 3);
});

test('an empty (point) box holds nothing', () => {
  const nowhere: Box = { min: [0, -1e4, 0], max: [0, -1e4, 0] };
  near(segmentInBox([-5, -1e4, 0], [5, -1e4, 0], nowhere), 0);
});

test('in the office: its surfaces are fog-free, the street through a window is foggy for the way outdoors', () => {
  const eye = [0, 1.6, 0] as const;
  near(outdoorShare(eye, [5, 0, 5], [OFFICE_ROOM]), 0);
  near(outdoorShare(eye, [FLOOR.maxX - 0.5, 3, 2], [OFFICE_ROOM]), 0);
  // Out of the south wall (z 13.3) to 26.6: half the way is outdoors.
  const south = FLOOR.maxZ + WALL_T;
  near(outdoorShare([0, 1.6, 0], [0, 1.6, 2 * south], [OFFICE_ROOM]), 0.5);
});

test('outside (the balcony, the street, the garage) looking away from the building: all fog', () => {
  near(outdoorShare([0, 1.6, 20], [0, 1.6, 60], [OFFICE_ROOM]), 1);
  // Down in the garage, under the office's floor.
  near(outdoorShare([0, -3, 0], [10, -3, 5], [OFFICE_ROOM]), 1);
});

test('from the balcony into the office: only the stretch in front of the glass fogs', () => {
  const south = FLOOR.maxZ + WALL_T;
  near(outdoorShare([0, 1.6, south + 2], [0, 1.6, 0], [OFFICE_ROOM]), 2 / (south + 2));
});

test('the back office: clear once built, and sitting next to the office box without overlapping it', () => {
  assert.equal(wingRoom(0), null);
  const w = wingRoom(2)!;
  assert.ok(w.max[2] <= OFFICE_ROOM.min[2]);
  near(w.min[2], wingMinZ(2) - WALL_T);
  const eye = [(WING.minX + WING.maxX) / 2, 1.6, (wingMinZ(2) + FLOOR.minZ) / 2] as const;
  // From the back office through into the office: indoors all the way.
  near(outdoorShare(eye, [WING.maxX - 1, 1.6, 5], [OFFICE_ROOM, w]), 0);
  // Without the wing it would be foggy part of the way.
  assert.ok(outdoorShare(eye, [WING.maxX - 1, 1.6, 5], [OFFICE_ROOM]) > 0);
});

test('setFogRooms: off on the roof and other maps, the wing only when built', () => {
  setFogRooms(false, 2);
  assert.equal(fogBoxUniforms.skyFogRooms.value, 0);
  assert.ok(fogBoxUniforms.skyFogWingMin.value.equals(fogBoxUniforms.skyFogWingMax.value));
  setFogRooms(true, 1);
  assert.equal(fogBoxUniforms.skyFogRooms.value, 1);
  assert.equal(fogBoxUniforms.skyFogWingMin.value.z, wingMinZ(1) - WALL_T);
  setFogRooms(true, 0);
  assert.ok(fogBoxUniforms.skyFogWingMin.value.equals(fogBoxUniforms.skyFogWingMax.value));
});
