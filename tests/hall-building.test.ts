import test from 'node:test';
import assert from 'node:assert/strict';
import { COURT, COURTS, COURT_MARGIN, GALLERY, HALL, HALL_BOX, HALL_DOOR, HALL_DOOR_INSIDE, HALL_ENTRY, HALL_ROOM, HALL_STREET_SPOT } from '../src/shared/hall.js';
import { CAFE_COUNTER, CAFE_ORDER, CAFE_TABLES, COURT_KEEP_OUT, DOOR_BENCH, GALLERY_PILLARS, HALL_SEATING, HALL_STAIRS, HALL_STAND, LOCKERS, RECEPTION, STAIR_RISE, onCourt, stairStep } from '../src/shared/hall-building.js';
import { CASINO_BOX } from '../src/shared/casino.js';
import { GOLF_HOLE, ROAD, SEATING_BY_ID, seatHere } from '../src/shared/layout.js';
import { PAVEMENT } from '../src/shared/garage.js';
import { STREET_END } from '../src/shared/scenic.js';
import { OFFICE_PLAN, seatHereOn } from '../src/shared/maps/index.js';
import { neighbourBoxes } from '../src/client/world/outside.js';
import { hallView, backInHall, HALL_ARRIVAL } from '../src/server/hall.js';
import { GUEST_MSGS } from '../src/server/guests.js';

// The padel hall's building (flrnoh fork, see FORK.md "The padel hall"): where it stands on the
// street, where you come and go, and the furniture inside kept off the courts.

type Box = { minX: number; maxX: number; minZ: number; maxZ: number };
const overlap = (a: Box, b: Box) => a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
const inside = (x: number, z: number, b: Box) => x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ;

test('the hall stands on a lot of its own across the street, east, clear of the road, the neighbours and the casino', () => {
  // Across the road (and its far sidewalk), to the east of the office's street, the casino's counterpart.
  assert.ok(HALL_BOX.minZ > ROAD.maxZ + 2);
  assert.ok(HALL_BOX.minX > 0 && CASINO_BOX.maxX < 0);
  assert.ok(!overlap(HALL_BOX, CASINO_BOX));
  // Off the golf hole's fairway and green.
  assert.ok(HALL_BOX.minX > GOLF_HOLE.fairway[1] + GOLF_HOLE.green);
  // Nowhere cars go: the lots, the street, the garage.
  for (const p of PAVEMENT) assert.ok(!overlap(HALL_BOX, p), `the hall's on the pavement ${JSON.stringify(p)}`);
  // And well inside the street's ends, where the scenic loop takes over.
  assert.ok(HALL_BOX.maxX < STREET_END - 20);
  // The neighbours: none stands where it does (it's in the list itself, for golf balls and trees).
  const others = neighbourBoxes().filter((b) => !(b.minX === HALL_BOX.minX && b.maxZ === HALL_BOX.maxZ));
  assert.equal(others.length, neighbourBoxes().length - 1);
  for (const b of others) assert.ok(!overlap(HALL_BOX, b), `a neighbour stands on the hall's lot: ${JSON.stringify(b)}`);
});

test('the doors are on its street side, and coming out you land on the sidewalk in front of them', () => {
  assert.ok(HALL_DOOR.x - HALL_DOOR.width / 2 > HALL_BOX.minX && HALL_DOOR.x + HALL_DOOR.width / 2 < HALL_BOX.maxX);
  assert.equal(HALL_STREET_SPOT.x, HALL_DOOR.x);
  assert.ok(HALL_STREET_SPOT.z < HALL_BOX.minZ && HALL_STREET_SPOT.z > ROAD.maxZ);
  assert.ok(Math.abs(Math.cos(HALL_STREET_SPOT.rotY) + 1) < 1e-9, 'facing the street');
  for (const b of neighbourBoxes()) assert.ok(!inside(HALL_STREET_SPOT.x, HALL_STREET_SPOT.z, b));
  // Inside: you come in just inside the doors, facing into the hall, clear of the way back out.
  assert.ok(inside(HALL_ENTRY.x, HALL_ENTRY.z, HALL_ROOM));
  assert.ok(HALL_ENTRY.z < HALL_DOOR_INSIDE.z);
  assert.ok(Math.abs(Math.cos(HALL_ENTRY.rotY) + 1) < 1e-9, 'facing the courts (-z)');
  assert.deepEqual(HALL_ARRIVAL, { x: HALL_ENTRY.x, y: 0, z: HALL_ENTRY.z, rotY: HALL_ENTRY.rotY });
});

test('the server: arriving gets the hall as your floor, and a reload puts you back in only with a building', () => {
  const view = hallView({ floor: null } as never);
  assert.equal(view.floor, HALL);
  assert.ok(backInHall(HALL, 2));
  assert.ok(!backInHall(HALL, 0));
  assert.ok(!backInHall('my-project', 2));
  assert.ok(!backInHall(null, 2));
  // Going in and out is floor.go, sitting is sit, a café item is act: nothing new for guests to sort.
  for (const t of ['floor.go', 'sit', 'act']) assert.ok(GUEST_MSGS.has(t as never), t);
});

test('the courts and their run-out stay clear: nothing of the building stands on the ground in there', () => {
  // The keep-out is each court plus COURT_MARGIN all round, inside the room.
  assert.equal(COURT_KEEP_OUT.length, COURTS.length);
  for (const [i, c] of COURTS.entries()) {
    const k = COURT_KEEP_OUT[i];
    assert.ok(Math.abs(k.maxX - k.minX - (COURT.width + 2 * COURT_MARGIN)) < 1e-9);
    assert.ok(Math.abs(k.maxZ - k.minZ - (COURT.length + 2 * COURT_MARGIN)) < 1e-9);
    assert.ok(k.minX >= HALL_ROOM.minX && k.maxX <= HALL_ROOM.maxX && k.minZ >= HALL_ROOM.minZ && k.maxZ <= HALL_ROOM.maxZ, c.id);
    assert.ok(k.minZ >= GALLERY.maxZ - 0.21, 'the gallery hangs over the north end, just short of the run-out');
  }
  const ground: [string, Box][] = [
    ...Array.from({ length: HALL_STAIRS.steps }, (_, i) => [`step ${i + 1}`, stairStep(i + 1)] as [string, Box]),
    ...GALLERY_PILLARS.map((p, i) => [`pillar ${i}`, { minX: p.x - 0.15, maxX: p.x + 0.15, minZ: p.z - 0.15, maxZ: p.z + 0.15 }] as [string, Box]),
    ...HALL_STAND.risers.map((r, i) => [`riser ${i}`, { minX: HALL_STAND.minX, maxX: HALL_STAND.maxX, minZ: r.minZ, maxZ: r.maxZ }] as [string, Box]),
    ...HALL_STAND.rows.flatMap((row, r) => HALL_STAND.benchXs.map((x) => [`bench ${r}`, { minX: x - HALL_STAND.benchLength / 2, maxX: x + HALL_STAND.benchLength / 2, minZ: row.z - 0.25, maxZ: row.z + 0.25 }] as [string, Box])),
    ['reception', { minX: RECEPTION.x - RECEPTION.length / 2, maxX: RECEPTION.x + RECEPTION.length / 2, minZ: RECEPTION.z - RECEPTION.depth / 2, maxZ: RECEPTION.z + RECEPTION.depth / 2 }],
    ['lockers', { minX: LOCKERS.minX, maxX: LOCKERS.maxX, minZ: LOCKERS.z - LOCKERS.depth, maxZ: HALL_ROOM.maxZ }],
    ['door bench', { minX: DOOR_BENCH.x - DOOR_BENCH.length / 2, maxX: DOOR_BENCH.x + DOOR_BENCH.length / 2, minZ: DOOR_BENCH.z - 0.3, maxZ: DOOR_BENCH.z + 0.3 }],
  ];
  for (const [name, b] of ground) {
    assert.ok(!onCourt(b), `${name} stands on a court or its run-out`);
    assert.ok(b.minX >= HALL_ROOM.minX && b.maxX <= HALL_ROOM.maxX && b.minZ >= HALL_ROOM.minZ && b.maxZ <= HALL_ROOM.maxZ, `${name} is outside the room`);
  }
  // Every seat on the ground, and where you step off it, is off the courts too.
  for (const s of HALL_SEATING.filter((s) => s.y < GALLERY.y)) {
    for (const along of s.places) {
      const x = s.x + Math.cos(s.rotY) * along;
      const z = s.z - Math.sin(s.rotY) * along;
      assert.ok(!onCourt({ minX: x - 0.3, maxX: x + 0.3, minZ: z - 0.3, maxZ: z + 0.3 }), s.id);
      const ox = x + Math.sin(s.rotY) * s.out;
      const oz = z + Math.cos(s.rotY) * s.out;
      assert.ok(!onCourt({ minX: ox - 0.3, maxX: ox + 0.3, minZ: oz - 0.3, maxZ: oz + 0.3 }), `${s.id} steps off onto a court`);
    }
  }
  // The door, the way in and the reception's front stay walkable.
  assert.ok(!onCourt({ minX: HALL_ENTRY.x - 0.4, maxX: HALL_ENTRY.x + 0.4, minZ: HALL_ENTRY.z - 0.4, maxZ: HALL_ENTRY.z + 0.4 }));
});

test('the stairs climb to the gallery a step at a time, and end at its edge', () => {
  assert.ok(STAIR_RISE <= 0.3, 'a step the player walks up without jumping');
  const top = stairStep(HALL_STAIRS.steps);
  assert.ok(Math.abs(top.top - GALLERY.y) < 1e-9);
  assert.ok(Math.abs(top.minZ - GALLERY.maxZ) < 1e-9);
  for (let i = 2; i <= HALL_STAIRS.steps; i++) assert.ok(Math.abs(stairStep(i).maxZ - stairStep(i - 1).minZ) < 1e-9);
  assert.ok(HALL_STAIRS.maxX <= HALL_ROOM.maxX && HALL_STAIRS.maxX - HALL_STAIRS.minX >= 1.2, 'wide enough for two to pass');
});

test('the café is up on the gallery: the counter, the tables and their chairs on its floor', () => {
  const g = { minX: GALLERY.minX, maxX: GALLERY.maxX, minZ: GALLERY.minZ, maxZ: GALLERY.maxZ };
  assert.ok(CAFE_COUNTER.minX >= g.minX && CAFE_COUNTER.maxX <= g.maxX && CAFE_COUNTER.z > g.minZ && CAFE_COUNTER.z < g.maxZ);
  assert.ok(inside(CAFE_ORDER.x, CAFE_ORDER.z, g));
  assert.ok(CAFE_TABLES.length >= 4 && CAFE_TABLES.length <= 6);
  for (const t of CAFE_TABLES) {
    assert.ok(t.x - 1.2 > g.minX && t.x + 1.2 < Math.min(g.maxX, HALL_STAIRS.minX) && t.z - 0.5 > g.minZ && t.z + 0.5 < g.maxZ, `table at ${t.x}, ${t.z}`);
    assert.ok(Math.abs(t.z - CAFE_COUNTER.z) > 1.5 || Math.abs(t.x - (CAFE_COUNTER.minX + CAFE_COUNTER.maxX) / 2) > 5, 'clear of the queue at the counter');
  }
  const chairs = HALL_SEATING.filter((s) => s.id.startsWith('cafe-chair-'));
  assert.equal(chairs.length, CAFE_TABLES.length * 2);
  for (const c of chairs) assert.equal(c.y, GALLERY.y);
});

test('the hall’s seats are in SEATING, and only count in the hall', () => {
  assert.ok(HALL_SEATING.length > 0);
  for (const s of HALL_SEATING) {
    assert.equal(SEATING_BY_ID.get(s.id), s);
    assert.ok(s.hall);
    const key = `${s.id}:0`;
    assert.ok(seatHere(key, false, true), `${key} in the hall`);
    assert.ok(!seatHere(key, false), `${key} isn't on an office floor`);
    assert.ok(!seatHere(key, true), `${key} isn't on the roof`);
    assert.ok(seatHereOn(OFFICE_PLAN, key, false, true));
    assert.ok(!seatHereOn(OFFICE_PLAN, key, false, false));
  }
  // …and the office's aren't in the hall.
  assert.ok(seatHere('couch:0', false));
  assert.ok(!seatHere('couch:0', false, true));
  assert.equal(new Set(HALL_SEATING.map((s) => s.id)).size, HALL_SEATING.length);
});
