import test from 'node:test';
import assert from 'node:assert/strict';
import { ASHTRAY, BALCONY, BALCONY_DOOR, BEANBAGS, BOARDS, BOOKSHELF, DESK_BY_ID, DESKS, DESK_SIZE, ELEVATOR, ELEVATOR_FRONT, EXIT_DOOR, EXIT_STAIRS, FLOOR, GOLF_TEE, JUKEBOX, LADDER, MACHINE_MONITOR, MEETING_ROOM, MEETING_SEATS, PARACHUTE, SEATING_BY_ID, STAIRS, STATIONS, TV, WALL_T, WINDOWS, WING, WING_DESKS } from '../src/shared/layout.js';
import { MAX_FLOORS } from '../src/shared/floors.js';
import { deskPoint, route, walkable, wayHome, wayIn, wayToBalcony, type Pt } from '../src/shared/nav.js';
import { BALCONY_SEATS, balconySeatAt, onBalcony, storeyDesks, storeyPlan } from '../src/shared/storey.js';
import { SPOTS, balconyAt, balconyAxes, balconyLocal, type BalconyRect } from '../src/shared/balconies.js';
import { aimWithin, insideDecks, teeSpot, wallSide } from '../src/shared/teespot.js';

// flrnoh fork: each storey of the building has its own cut (shared/storey.ts): the same seats and
// fixtures, laid out its own way, its balconies on walls of its own (shared/balconies.ts). These pin
// down what must hold for every floor, so no floor breaks the game. (The floor's signs and back
// office, which people change, are tests/floorplan.test.ts.)

const FLOORS = [0, 1, 2, 3, 5, 9, 17, 42];
/** Every floor a building can have, and a few past that. */
const STOREYS = Array.from({ length: MAX_FLOORS + 8 }, (_, i) => i);
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
  const at = (i: number) => JSON.stringify([storeyPlan(i).desks.map((d) => [d.x, d.z]), storeyPlan(i).balconies.map((b) => b.rect)]);
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
  const plan = storeyPlan(0);
  assert.deepEqual(plan.desks, DESKS);
  assert.deepEqual(plan.balcony, { ...BALCONY });
  assert.equal(plan.balconies.length, 1);
  assert.equal(plan.balconyDoor, BALCONY_DOOR);
  assert.equal(plan.windows, WINDOWS);
  assert.equal(plan.accent, null);
  assert.deepEqual(plan.podTurns, [0, 0, 0, 0]);
  assert.deepEqual(plan.ashtray, ASHTRAY);
  assert.deepEqual(plan.golfTee, { ...GOLF_TEE, turn: 0 });
  assert.deepEqual(plan.parachute.jump, PARACHUTE.jump);
  for (const id of BALCONY_SEATS) {
    const s = SEATING_BY_ID.get(id)!;
    assert.deepEqual(balconySeatAt(id, 0), { seatId: id, x: s.x, z: s.z, rotY: s.rotY });
  }
});

test('every floor keeps its desks on the office floor, clear of the walls, as back-to-back pairs', () => {
  for (const i of FLOORS) {
    const desks = storeyPlan(i).desks;
    for (const d of desks) {
      // Its corners, however it's turned (a storey turns a pod a quarter now and then).
      const corners = [-1, 1].flatMap((t) => [-1, 1].map((s) => deskPoint(d, (t * DESK_SIZE.width) / 2, (s * DESK_SIZE.depth) / 2)));
      for (const [x, z] of corners) assert.ok(x > FLOOR.minX && x < FLOOR.maxX && z > FLOOR.minZ && z < FLOOR.maxZ, `floor ${i} ${d.id} on the floor`);
      assert.ok(Math.abs(Math.sin(d.rotY)) < 1e-9 || Math.abs(Math.cos(d.rotY)) < 1e-9, `floor ${i} ${d.id} square to the walls`);
      // Its partner is right behind it, facing the other way (the signs hang back to back: world/desksigns.ts).
      const [bx, bz] = deskPoint(d, 0, -DESK_SIZE.depth);
      assert.ok(desks.some((e) => e !== d && Math.abs(e.x - bx) < 0.01 && Math.abs(e.z - bz) < 0.01 && Math.abs(Math.cos(e.rotY - d.rotY) + 1) < 1e-9), `floor ${i} ${d.id} has its partner`);
    }
  }
  assert.ok(STOREYS.some((i) => storeyPlan(i).podTurns.some((t) => t)), 'some storey turns a pod');
});

/** The building, walls included. */
const B = { minX: FLOOR.minX - WALL_T, maxX: FLOOR.maxX + WALL_T, minZ: FLOOR.minZ - WALL_T, maxZ: FLOOR.maxZ + WALL_T };
/** Inside, along each wall: what stands against it (u0..u1 along it), which no balcony's doors may open into. */
const AGAINST: Record<'south' | 'east' | 'west', [string, number, number][]> = {
  south: [
    ['kitchen', -17, -10.75],
    ['bookshelf', BOOKSHELF.x - BOOKSHELF.width / 2, BOOKSHELF.x + BOOKSHELF.width / 2],
    ['stairs to the loft', STAIRS.fromX, STAIRS.toX],
    ['meeting room', MEETING_ROOM.minX, FLOOR.maxX],
  ],
  east: [
    ['Services board', BOARDS.services.z - BOARDS.services.width / 2, BOARDS.services.z + BOARDS.services.width / 2],
    ['TV', TV.z - (TV.width + 0.3) / 2, TV.z + (TV.width + 0.3) / 2],
    ['jukebox', JUKEBOX.z - JUKEBOX.width / 2, JUKEBOX.z + JUKEBOX.width / 2],
    ['meeting room', MEETING_ROOM.minZ, FLOOR.maxZ],
  ],
  west: [
    ["machine's monitor", MACHINE_MONITOR.z - MACHINE_MONITOR.width / 2, MACHINE_MONITOR.z + MACHINE_MONITOR.width / 2],
    ['ladder', LADDER.hatch.minZ, LADDER.hatch.maxZ],
    ['exit door', EXIT_DOOR.u - EXIT_DOOR.width / 2, EXIT_DOOR.u + EXIT_DOOR.width / 2],
  ],
};
/** The fire escape: the landing outside the exit door and the steps down from it. */
const FIRE_ESCAPE = { minX: EXIT_STAIRS.minX, maxX: EXIT_STAIRS.maxX, minZ: EXIT_STAIRS.landingZ0, maxZ: EXIT_STAIRS.landingZ1 + EXIT_STAIRS.steps * EXIT_STAIRS.run };
const overlap = (a: BalconyRect, b: BalconyRect) => a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
const within = (p: { x: number; z: number }, r: BalconyRect, m = 0) => p.x > r.minX + m && p.x < r.maxX - m && p.z > r.minZ + m && p.z < r.maxZ - m;

test("every floor's balconies hang off a wall with room for their doors, clear of the fire escape and of each other", () => {
  for (const i of STOREYS) {
    const plan = storeyPlan(i);
    assert.ok(plan.balconies.length >= 1 && plan.balconies.length <= 2, `floor ${i} has one or two`);
    assert.ok(plan.balconies[0].furnished && plan.balconies.slice(1).every((b) => !b.furnished), `floor ${i} furnishes its first`);
    assert.equal(plan.balcony, plan.balconies[0].rect);
    assert.equal(plan.balconyDoor, plan.balconies[0].door);
    for (const b of plan.balconies) {
      const what = `floor ${i} ${b.spot}`;
      const { door, rect } = b;
      // Its doors are in the wall it hangs off, a door's height, and the deck's against that wall.
      assert.equal(door.wall, b.wall, `${what} doors in its wall`);
      assert.ok(door.y0 === 0 && door.y1 === BALCONY_DOOR.y1, `${what} doors down to the floor`);
      if (b.wall === 'south') assert.equal(rect.minZ, B.maxZ, `${what} against the south wall`);
      if (b.wall === 'east') assert.equal(rect.minX, B.maxX, `${what} against the east wall`);
      if (b.wall === 'west') assert.equal(rect.maxX, B.minX, `${what} against the west wall`);
      // It reaches past its doors either way, but no further than the building's corners.
      const [lo, hi] = b.wall === 'south' ? [rect.minX, rect.maxX] : [rect.minZ, rect.maxZ];
      assert.ok(lo < door.u - door.width / 2 && hi > door.u + door.width / 2, `${what} deck in front of its doors`);
      assert.ok(lo >= (b.wall === 'south' ? B.minX : B.minZ) - 1e-9 && hi <= (b.wall === 'south' ? B.maxX : B.maxZ) + 1e-9, `${what} within the corners`);
      // Inside, its doors open onto the floor, not into something against the wall…
      for (const [thing, u0, u1] of AGAINST[b.wall]) assert.ok(door.u + door.width / 2 <= u0 || door.u - door.width / 2 >= u1, `${what} doors clear of the ${thing}`);
      // …and no window's left where they are.
      for (const w of plan.windows) assert.ok(w.wall !== door.wall || w.y0 >= door.y1 || Math.abs(w.u - door.u) >= (w.width + door.width) / 2, `${what} no window in its doorway`);
      // Outside, it's clear of the steps down from the exit door.
      assert.ok(!overlap(rect, FIRE_ESCAPE), `${what} clear of the fire escape`);
      // The doors are where the deck's own frame has them: the bottom floor's, turned onto this wall.
      const mid = balconyAt(b, BALCONY_DOOR.u, FLOOR.maxZ + WALL_T / 2);
      assert.ok(Math.abs((b.wall === 'south' ? mid.x : mid.z) - door.u) < 1e-9, `${what} its frame's doors are its doors`);
      const back = balconyLocal(b, mid.x, mid.z);
      assert.ok(Math.abs(back.x - BALCONY_DOOR.u) < 1e-9 && Math.abs(back.z - FLOOR.maxZ - WALL_T / 2) < 1e-9, `${what} its frame goes both ways`);
    }
    if (plan.balconies.length === 2) {
      const [a, b] = plan.balconies;
      assert.notEqual(a.wall, b.wall, `floor ${i} its two on different walls`);
      assert.ok(!overlap(a.rect, b.rect), `floor ${i} its two apart`);
    }
  }
});

test('no two floors stacked one on the other have their balconies in the same place, and every spot gets used', () => {
  for (const i of STOREYS) if (i > 0) assert.notEqual(storeyPlan(i).balconies[0].spot, storeyPlan(i - 1).balconies[0].spot, `floor ${i} and the one below`);
  const used = new Set(STOREYS.map((i) => storeyPlan(i).balconies[0].spot));
  for (const s of SPOTS) assert.ok(used.has(s.id), `someone's balcony hangs at ${s.id}`);
  assert.ok(STOREYS.some((i) => storeyPlan(i).balconies.length === 2), 'a floor with two');
  assert.ok(STOREYS.some((i) => JSON.stringify(storeyPlan(i).windows) !== JSON.stringify(WINDOWS)), 'windows of their own');
});

test('everything on the furnished balcony stands on its deck, wherever it hangs', () => {
  for (const i of STOREYS) {
    const plan = storeyPlan(i);
    const b = plan.balconies[0];
    const deck = b.rect;
    for (const id of BALCONY_SEATS) assert.ok(within(balconySeatAt(id, i), deck, 0.2), `floor ${i} ${id} on the deck`);
    // A seat's turned with the balcony: the bench still has its back to the wall.
    const bench = balconySeatAt('bench', i);
    const { out } = balconyAxes(b);
    assert.ok(Math.abs(Math.sin(bench.rotY) - out.x) < 1e-9 && Math.abs(Math.cos(bench.rotY) - out.z) < 1e-9, `floor ${i} bench faces out`);
    assert.ok(within(plan.ashtray, deck, 0.2), `floor ${i} ashtray on the deck`);
    const tee = plan.golfTee;
    for (const p of [tee.ball, tee.bag, { x: tee.x - tee.size / 2, z: tee.z - tee.size / 2 }, { x: tee.x + tee.size / 2, z: tee.z + tee.size / 2 }]) assert.ok(within(p, deck, 0.05), `floor ${i} tee and bag on the deck`);
    assert.equal(tee.turn, b.turn);
    // Facing the street, the pin's within the aim you're allowed; round the side it's a driving range.
    const spot = teeSpot(i);
    if (b.wall === 'south') assert.ok(Math.abs(spot.pinYaw - spot.turn) < AIM_MAX, `floor ${i} pin reachable`);
    assert.ok(Math.abs(aimWithin(spot, spot.turn + 3, AIM_MAX) - spot.turn - AIM_MAX) < 1e-9, `floor ${i} aim kept out from the balcony`);
    // Off it by parachute: from the railing straight out from its doors, out away from its wall.
    const { jump, rail, dir } = plan.parachute;
    assert.ok(within(jump, deck), `floor ${i} jumps from its deck`);
    assert.deepEqual(dir, out);
    assert.ok((rail.x - jump.x) * dir.x + (rail.z - jump.z) * dir.z > 0.2, `floor ${i} the rail's further out`);
    assert.equal(onBalcony(jump.x, jump.z, i), b, `floor ${i} that's on its balcony`);
  }
});

test('a ball out on a balcony rattles round inside its railing, and bounces off the wall it hangs off', () => {
  const toWall = { south: ['z', -1], east: ['x', -1], west: ['x', 1] } as const;
  for (const i of STOREYS) {
    for (const { b, in: I } of insideDecks(i, 0.05)) {
      assert.ok(I.minX > b.rect.minX && I.maxX < b.rect.maxX && I.minZ > b.rect.minZ && I.maxZ < b.rect.maxZ, `floor ${i} ${b.spot} inside it`);
      const [axis, dir] = toWall[b.wall];
      const other = axis === 'x' ? 'z' : 'x';
      assert.ok(wallSide(b, axis, dir), `floor ${i} ${b.spot} its wall`);
      assert.ok(!wallSide(b, axis, -dir) && !wallSide(b, other, 1) && !wallSide(b, other, -1), `floor ${i} ${b.spot} railings on the rest`);
    }
  }
});

test('every floor but the bottom one has an accent wall and its own rug colors', () => {
  for (const i of STOREYS.filter((n) => n > 0)) {
    const { accent, rugShift } = storeyPlan(i);
    assert.ok(accent && ['north', 'south', 'east', 'west'].includes(accent.wall) && /^#[0-9a-f]{6}$/.test(accent.color), `floor ${i} accent`);
    assert.ok(rugShift > 0, `floor ${i} rugs`);
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
        const door = chute.findIndex(([x, z]) => z > FLOOR.maxZ || x > FLOOR.maxX || x < FLOOR.minX);
        assert.ok(door > 1, `${what} goes out onto the balcony`);
        clear(chute, 2, door - 1, i, wing, what);
        // Out through its doors, on whichever wall they are.
        const b = storeyPlan(i).balconies[0];
        for (const [x, z] of [chute[door - 1], chute[door]]) assert.ok(Math.abs((b.wall === 'south' ? x : z) - b.door.u) < b.door.width / 2 - 0.2, `${what} through the balcony doors`);
        const [jx, jz] = chute[chute.length - 1];
        assert.equal(onBalcony(jx, jz, i), b, `${what} jumps off its own balcony`);
      }
    }
    for (const seat of MEETING_SEATS) {
      const way = wayIn(seat, 0, i);
      clear(way, 1, way.length - 1, i, 0, `floor ${i} ${seat.id} walking in`);
    }
    // Every balcony's doors open onto floor you can get to from the elevator, round the furniture.
    for (const b of storeyPlan(i).balconies) {
      const inside = balconyAt(b, BALCONY_DOOR.u, FLOOR.maxZ - 0.8);
      assert.ok(walkable(inside.x, inside.z, 0, i), `floor ${i} ${b.spot} doorway clear`);
      const way = route([ELEVATOR.x, ELEVATOR_FRONT + 0.5], [inside.x, inside.z], 0, i);
      const [ex, ez] = way[way.length - 1];
      assert.ok(Math.hypot(ex - inside.x, ez - inside.z) < 0.01, `floor ${i} ${b.spot} reached`);
      clear(way, 1, way.length, i, 0, `floor ${i} out to ${b.spot}`);
    }
  }
});
