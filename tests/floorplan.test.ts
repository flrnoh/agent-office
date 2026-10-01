import test from 'node:test';
import assert from 'node:assert/strict';
import { BALCONY_DOOR, DESKS, DESK_SIZE, FLOOR, floorPlan, GOLF_HOLE } from '../src/shared/layout.js';

// Each floor of the building has its own plan (see floorPlan): the same seats and fixtures, laid out
// its own way. These pin down what must hold for every floor, so no floor breaks the game.

const FLOORS = [0, 1, 2, 3, 5, 9, 17, 42];
/** How far either side of straight out you can aim a golf shot (world/golf.ts AIM_MAX). */
const AIM_MAX = 1.2;

test('a floor plan is pure: the same floor always comes out identical', () => {
  for (const i of FLOORS) {
    const a = floorPlan(i);
    assert.equal(floorPlan(i), a, `floor ${i} is cached, not rebuilt`);
    assert.deepEqual(
      floorPlan(i).desks.map((d) => [d.x, d.z, d.rotY]),
      a.desks.map((d) => [d.x, d.z, d.rotY]),
    );
  }
});

test('every floor has the same seats, by id and count, as floor 0', () => {
  const base = floorPlan(0);
  const ids = (ds: { id: string }[]) => ds.map((d) => d.id).sort();
  for (const i of FLOORS) {
    const plan = floorPlan(i);
    assert.deepEqual(ids(plan.desks), ids(base.desks), `floor ${i} desks`);
    assert.deepEqual(ids(plan.beanbags), ids(base.beanbags), `floor ${i} bean bags`);
    assert.deepEqual(ids(plan.stations), ids(base.stations), `floor ${i} stations`);
    assert.deepEqual(ids(plan.meetingSeats), ids(base.meetingSeats), `floor ${i} meeting seats`);
    assert.equal(plan.deskById.size, base.deskById.size, `floor ${i} has every place`);
  }
});

test('floor 0 is exactly the constants', () => {
  assert.deepEqual(
    floorPlan(0).desks.map((d) => [d.x, d.z, d.rotY]),
    DESKS.map((d) => [d.x, d.z, d.rotY]),
  );
});

test('every floor keeps its desks on the office floor, clear of the walls', () => {
  const hw = DESK_SIZE.width / 2;
  const hd = DESK_SIZE.depth / 2;
  for (const i of FLOORS) {
    for (const d of floorPlan(i).desks) {
      assert.ok(d.x - hw > FLOOR.minX && d.x + hw < FLOOR.maxX, `floor ${i} ${d.id} within x`);
      assert.ok(d.z - hd > FLOOR.minZ && d.z + hd < FLOOR.maxZ, `floor ${i} ${d.id} within z`);
    }
  }
});

test("every floor's balcony hangs from the fixed doors and covers what stands on it", () => {
  const door = BALCONY_DOOR.u;
  const base = floorPlan(0).balcony;
  for (const i of FLOORS) {
    const b = floorPlan(i).balcony;
    // The doors don't move (they're in the wall above), so every deck must reach under them…
    assert.ok(b.minX <= door - BALCONY_DOOR.width / 2, `floor ${i} deck reaches left of the doors`);
    assert.ok(b.maxX >= door + BALCONY_DOOR.width / 2, `floor ${i} deck reaches right of the doors`);
    // …and its depth is the same on every floor (it hangs off the south wall the same way).
    assert.equal(b.minZ, base.minZ);
    assert.equal(b.maxZ, base.maxZ);
    // The tee sits on the deck, and the pin stays within the aim you're allowed.
    const tee = floorPlan(i).golfTee.ball;
    assert.ok(tee.x > b.minX && tee.x < b.maxX, `floor ${i} tee on the deck`);
    assert.ok(Math.abs(Math.atan2(GOLF_HOLE.x - tee.x, GOLF_HOLE.z - tee.z)) < AIM_MAX, `floor ${i} pin reachable`);
  }
});
