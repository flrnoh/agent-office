import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GYM_STREET_BOX, GYM_STREET_DOOR, GYM_STREET_SPOT } from '../src/shared/gym.js';
import { HALL_BOX } from '../src/shared/hall.js';
import { CASINO_BOX } from '../src/shared/casino.js';
import { ROAD } from '../src/shared/layout.js';
import { STREET_END } from '../src/shared/scenic.js';

type Box = { minX: number; maxX: number; minZ: number; maxZ: number };
const overlap = (a: Box, b: Box) => a.minX < b.maxX && b.minX < a.maxX && a.minZ < b.maxZ && b.minZ < a.maxZ;

// flrnoh fork: the gym and the padel hall were both planned on the lot east across the street; the
// gym moved next to the hall (shared/gym.ts GYM_SHIFT). They must never stand in each other again.
test('the gym stands beside the padel hall and the casino, not in them', () => {
  assert.ok(!overlap(GYM_STREET_BOX, HALL_BOX), 'gym and padel hall overlap');
  assert.ok(!overlap(GYM_STREET_BOX, CASINO_BOX), 'gym and casino overlap');
});

test("the gym's front is on the street, its door in its front, within the street's length", () => {
  assert.ok(GYM_STREET_BOX.minZ > ROAD.maxZ, 'the gym stands on the road');
  assert.ok(GYM_STREET_DOOR.x > GYM_STREET_BOX.minX && GYM_STREET_DOOR.x < GYM_STREET_BOX.maxX);
  assert.ok(GYM_STREET_SPOT.z < GYM_STREET_BOX.minZ && GYM_STREET_SPOT.z > ROAD.maxZ);
  assert.ok(GYM_STREET_BOX.maxX < STREET_END);
});
