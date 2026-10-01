import test from 'node:test';
import assert from 'node:assert/strict';
import { ASHTRAY, BALCONY, BALCONY_DOOR, BEANBAGS, DESK_BY_ID, DESKS, DESK_SIZE, FLOOR, GOLF_HOLE, GOLF_TEE, MEETING_SEATS, PARACHUTE, SEATING_BY_ID, STATIONS, WING, WING_DESKS } from '../src/shared/layout.js';
import { walkable, wayHome, wayIn, wayToBalcony, type Pt } from '../src/shared/nav.js';
import { storeyDesks, storeyPlan } from '../src/shared/storey.js';

// flrnoh fork: each storey of the building has its own cut (shared/storey.ts): the same seats and
// fixtures, laid out its own way. These pin down what must hold for every floor, so no floor breaks
// the game. (The floor's signs and back office, which people change, are tests/floorplan.test.ts.)

const FLOORS = [0, 1, 2, 3, 5, 9, 17, 42];
/** How far either side of straight out you can aim a golf shot (features/golf/world.ts AIM_MAX). */
const AIM_MAX = 1.2;

test('a storey plan is pure: the same floor always comes out identical', () => {
  for (const i of FLOORS) {
    const a = storeyPlan(i);
    assert.equal(storeyPlan(i), a, `floor ${i} is kept, not worked out again`);
    assert.deepEqual(
      storeyPlan(i).desks.map((d) => [d.x, d.z, d.rotY]),
      a.desks.map((d) => [d.x, d.z, d.rotY]),
    );
  }
  assert.equal(storeyPlan(-1), storeyPlan(0), 'no floor (the roof, the lobby) is the bottom one');
});

test('the floors above the bottom one are laid out their own way', () => {
  const at = (i: number) => JSON.stringify([storeyPlan(i).desks.map((d) => [d.x, d.z]), storeyPlan(i).balcony]);
  const cuts = new Set(FLOORS.map(at));
  assert.equal(cuts.size, FLOORS.length, 'no two of them alike');
});

test('every floor has the same places, by id and count, as the bottom one', () => {
  const ids = (ds: { id: string }[]) => ds.map((d) => d.id).sort();
  for (const i of FLOORS) {
    const plan = storeyPlan(i);
    assert.deepEqual(ids(plan.desks), ids(DESKS), `floor ${i} desks`);
    assert.deepEqual([...plan.deskById.keys()].sort(), [...DESK_BY_ID.keys()].sort(), `floor ${i} has every place`);
    // Only the room's desks move: the bean bags, kiosks, meeting chairs, back office and boss desk are where they always are.
    for (const d of [...BEANBAGS, ...STATIONS, ...MEETING_SEATS, ...WING_DESKS]) assert.equal(plan.deskById.get(d.id), d, `floor ${i} ${d.id}`);
    assert.deepEqual(ids(storeyDesks(i, WING.rows)), ids([...DESKS, ...WING_DESKS]), `floor ${i} built out`);
  }
});

test('the bottom floor is exactly the constants', () => {
  assert.deepEqual(storeyPlan(0).desks, DESKS);
  assert.deepEqual(storeyPlan(0).balcony, { ...BALCONY });
});

test('every floor keeps its desks on the office floor, clear of the walls, as back-to-back pairs', () => {
  const hw = DESK_SIZE.width / 2;
  const hd = DESK_SIZE.depth / 2;
  for (const i of FLOORS) {
    const desks = storeyPlan(i).desks;
    for (const d of desks) {
      assert.ok(d.x - hw > FLOOR.minX && d.x + hw < FLOOR.maxX, `floor ${i} ${d.id} within x`);
      assert.ok(d.z - hd > FLOOR.minZ && d.z + hd < FLOOR.maxZ, `floor ${i} ${d.id} within z`);
      // Its partner across the pair is still right behind it (the signs hang back to back: world/desksigns.ts).
      assert.ok(desks.some((e) => e !== d && Math.abs(e.x - d.x) < 0.01 && Math.abs(Math.abs(e.z - d.z) - DESK_SIZE.depth) < 0.01), `floor ${i} ${d.id} has its partner`);
    }
  }
});

test("every floor's balcony hangs from the same doors and covers what stands on it", () => {
  const door = BALCONY_DOOR.u;
  for (const i of FLOORS) {
    const b = storeyPlan(i).balcony;
    // The doors don't move (they're in the wall above), so every deck reaches under them…
    assert.ok(b.minX <= door - BALCONY_DOOR.width / 2 && b.maxX >= door + BALCONY_DOOR.width / 2, `floor ${i} deck under the doors`);
    // …its depth is the same on every floor…
    assert.equal(b.minZ, BALCONY.minZ);
    assert.equal(b.maxZ, BALCONY.maxZ);
    // …and it reaches at least as far as the bottom floor's, so the bench, the stools, the ashtray, the
    // lamp poles and the tee all stand on it (world/office/balcony.ts builds them once).
    assert.ok(b.minX <= BALCONY.minX && b.maxX >= BALCONY.maxX, `floor ${i} deck covers the bottom floor's`);
    for (const id of ['bench', 'stool-1', 'stool-2']) {
      const s = SEATING_BY_ID.get(id)!;
      assert.ok(s.x > b.minX && s.x < b.maxX, `floor ${i} ${id} on the deck`);
    }
    assert.ok(ASHTRAY.x > b.minX && ASHTRAY.x < b.maxX, `floor ${i} ashtray on the deck`);
    // The tee sits on the deck, and the pin is within the aim you're allowed.
    const tee = storeyPlan(i).golfTee;
    assert.ok(tee.x - tee.size / 2 > b.minX && tee.x + tee.size / 2 < b.maxX, `floor ${i} tee on the deck`);
    assert.ok(Math.abs(Math.atan2(GOLF_HOLE.x - tee.ball.x, GOLF_HOLE.z - tee.ball.z)) < AIM_MAX, `floor ${i} pin reachable`);
    assert.equal(tee, GOLF_TEE);
    assert.equal(storeyPlan(i).parachute, PARACHUTE);
  }
});

/** Every step along `way` from point `from` on is on open floor on storey `index`. */
function clear(way: Pt[], from: number, to: number, index: number, wing: number, what: string) {
  for (let i = from; i < to; i++) {
    const [[x0, z0], [x1, z1]] = [way[i - 1], way[i]];
    const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.2);
    for (let k = 0; k <= n; k++) {
      const x = x0 + ((x1 - x0) * k) / n;
      const z = z0 + ((z1 - z0) * k) / n;
      assert.ok(walkable(x, z, wing, index), `${what} walks into something at (${x.toFixed(2)}, ${z.toFixed(2)})`);
    }
  }
}

test('on every floor, workers get from their desks to the exit or the balcony, and in to a meeting, round its own furniture', () => {
  for (const i of FLOORS) {
    for (const wing of [0, WING.rows]) {
      for (const seat of storeyDesks(i, wing)) {
        const what = `floor ${i} ${seat.id} (built out ${wing})`;
        // The seat as the bottom floor has it: the way out starts from where this floor has it.
        const home = wayHome(DESK_BY_ID.get(seat.id)!, wing, i);
        assert.ok(Math.hypot(home[0][0] - seat.x, home[0][1] - seat.z) < 1.2, `${what} hops down beside its seat`);
        const out = home.findIndex(([x]) => x < FLOOR.minX);
        assert.ok(out > 1, `${what} leaves by the exit`);
        clear(home, 2, out, i, wing, what);
        const chute = wayToBalcony(DESK_BY_ID.get(seat.id)!, wing, i);
        const door = chute.findIndex(([, z]) => z > FLOOR.maxZ);
        assert.ok(door > 1, `${what} goes out onto the balcony`);
        clear(chute, 2, door - 1, i, wing, what);
        const [jx, jz] = chute[chute.length - 1];
        assert.ok(jx > storeyPlan(i).balcony.minX && jx < storeyPlan(i).balcony.maxX && jz < BALCONY.maxZ, `${what} jumps off its own balcony`);
      }
    }
    for (const seat of MEETING_SEATS) {
      const way = wayIn(seat, 0, i);
      clear(way, 1, way.length - 1, i, 0, `floor ${i} ${seat.id} walking in`);
    }
  }
});
