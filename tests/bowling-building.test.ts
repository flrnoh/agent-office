import test from 'node:test';
import assert from 'node:assert/strict';
import { BOWLING, BOWLING_BOX, BOWLING_DOOR, BOWLING_DOOR_INSIDE, BOWLING_ENTRY, BOWLING_STREET_SPOT, ZONES, type Zone } from '../src/shared/bowling.js';
import { ARCADES, BOWLING_MENU, COSMIC_SWITCH, GOLF_WAY, LIGHTS_COOLDOWN_MS, ORDER_SPOT, SHOE_SIZES, SHOE_SPOT, bowlingWhereabouts, houseSolids, sofaSeats } from '../src/shared/bowling-house.js';
import { LANDMARKS, landmarkBox } from '../src/shared/landmarks.js';
import { BLOCKS, CROSSING_HALF, CROSSINGS, LOTS, PARK_TREES, STREETS, stretchRect } from '../src/shared/city.js';
import { FURNITURE, LAMPS } from '../src/shared/streetside.js';
import { SHOPS } from '../src/shared/shops.js';
import { BUS_LINES } from '../src/shared/citybus.js';
import { LIT } from '../src/shared/traffic-lights.js';
import { CASINO_BOX } from '../src/shared/casino.js';
import { HALL_BOX } from '../src/shared/hall.js';
import { SOCCER_BOX } from '../src/shared/soccer.js';
import { GYM_STREET_BOX } from '../src/shared/gym.js';
import { LOT, SIDE_LOT } from '../src/shared/garage.js';
import { FLOOR, ROAD } from '../src/shared/layout.js';
import { CHURCH } from '../src/shared/church.js';
import { BUNGEE } from '../src/shared/bungee.js';
import { DRINK_BY_ID } from '../src/shared/rooftop.js';
import { heldAnywhere } from '../src/shared/fridge.js';
import { BowlingHouse, backInBowling, bowlingView } from '../src/server/bowling/place.js';
import { PLACES, backInPlace } from '../src/server/fork/office.js';
import { GUEST_MSGS } from '../src/server/guests.js';
import { PARTY_MSGS, PARTY_SEES_MSGS } from '../src/server/party.js';
import type { FloorView } from '../src/shared/protocol.js';

// flrnoh fork (see FORK.md "The bowling centre"): the building's half: the house on its block, its
// doors, the place, the counter and the lounge in their zones, the lights and the rental shoes.

const overlap = (a: Zone, b: Zone, pad = 0) => a.minX < b.maxX + pad && b.minX < a.maxX + pad && a.minZ < b.maxZ + pad && b.minZ < a.maxZ + pad;
const within = (a: Zone, b: Zone) => a.minX >= b.minX - 1e-9 && a.maxX <= b.maxX + 1e-9 && a.minZ >= b.minZ - 1e-9 && a.maxZ <= b.maxZ + 1e-9;
const inBox = (x: number, z: number, b: Zone, pad = 0) => x > b.minX - pad && x < b.maxX + pad && z > b.minZ - pad && z < b.maxZ + pad;

test('the bowling centre is a landmark: its block is its own, nothing of the city stands on it', () => {
  assert.ok(LANDMARKS.some((l) => l.id === 'bowling' && l.i === 1 && l.j === 0));
  assert.equal(BLOCKS.find((b) => b.i === 1 && b.j === 0)?.kind, 'landmark');
  const block = landmarkBox('bowling');
  assert.ok(within(BOWLING_BOX, block), 'the house inside its block');
  for (const l of LOTS) assert.ok(!overlap({ minX: l.x - l.w / 2, maxX: l.x + l.w / 2, minZ: l.z - l.d / 2, maxZ: l.z + l.d / 2 }, block), 'no building of the city on its block');
  for (const s of SHOPS) assert.ok(!overlap(s.rect, block), `no shop on its block (shop ${s.i})`);
  for (const t of PARK_TREES) assert.ok(!inBox(t.x, t.z, block), 'no park tree on its block');
});

test('nothing else stands in it or right against it', () => {
  // The street's furniture (trees, benches, Litfaßsäulen) keeps clear of its walls; the lamps stand on the sidewalks.
  for (const f of FURNITURE) assert.ok(!inBox(f.x, f.z, BOWLING_BOX, 1.4), `${f.kind} at (${f.x.toFixed(1)}, ${f.z.toFixed(1)})`);
  for (const l of LAMPS) assert.ok(!inBox(l.x, l.z, BOWLING_BOX, 0.5), `a street lamp at (${l.x}, ${l.z})`);
  // The streets, their crossings and traffic lights, the bus routes.
  for (const s of STREETS) assert.ok(!overlap(stretchRect(s), BOWLING_BOX), 'a street through it');
  for (const c of CROSSINGS) assert.ok(!inBox(c.x, c.z, BOWLING_BOX, CROSSING_HALF + 1), 'a crossing on it');
  for (const l of LIT) assert.ok(!inBox(l.c.x, l.c.z, BOWLING_BOX, CROSSING_HALF + 1), 'traffic lights in it');
  for (const line of BUS_LINES) for (let i = 0; i < line.xs.length; i++) assert.ok(!inBox(line.xs[i], line.zs[i], BOWLING_BOX, 1.5), `the ${line.no} drives through it`);
  assert.ok(BOWLING_BOX.maxZ < ROAD.minZ - 1, 'the office street stays clear');
  // The office, its garage's lots, the bungee jetty over the street, the places across the street, the other landmarks, the church.
  for (const [name, b] of [
    ['the office', FLOOR],
    ['the garage lot', LOT],
    ['the side lot', SIDE_LOT],
    ['the casino', CASINO_BOX],
    ['the padel hall', HALL_BOX],
    ['the soccer hall', SOCCER_BOX],
    ['the gym', GYM_STREET_BOX],
    ...LANDMARKS.filter((l) => l.id !== 'bowling').map((l) => [l.id, landmarkBox(l.id)] as const),
    ...(CHURCH ? CHURCH.solids.map((s, i) => [`the church ${i}`, s] as const) : []),
  ] as const)
    assert.ok(!overlap(b as Zone, BOWLING_BOX, 1), `${name} overlaps it`);
  assert.ok(!inBox(BUNGEE.x, BUNGEE.edgeZ, BOWLING_BOX, 3), 'the bungee jump comes down far from it');
});

test('its doors face the office street, and you come out on the sidewalk in front of them', () => {
  assert.ok(BOWLING_DOOR.x - BOWLING_DOOR.width / 2 > BOWLING_BOX.minX && BOWLING_DOOR.x + BOWLING_DOOR.width / 2 < BOWLING_BOX.maxX);
  assert.ok(Math.abs(BOWLING_STREET_SPOT.x - BOWLING_DOOR.x) < 0.5);
  assert.ok(BOWLING_STREET_SPOT.z > BOWLING_BOX.maxZ + 0.5 && BOWLING_STREET_SPOT.z < ROAD.minZ, 'on the sidewalk, not in the road');
  assert.equal(BOWLING_STREET_SPOT.rotY, 0, 'facing the street');
  for (const f of FURNITURE) assert.ok(Math.hypot(f.x - BOWLING_STREET_SPOT.x, f.z - BOWLING_STREET_SPOT.z) > 2, 'nothing in front of the doors');
  for (const l of LAMPS) assert.ok(Math.hypot(l.x - BOWLING_STREET_SPOT.x, l.z - BOWLING_STREET_SPOT.z) > 2, 'no lamp in front of the doors');
});

test('inside, the house stands in its own zones, and the ways stay clear', () => {
  for (const s of houseSolids()) assert.ok(within(s.box, ZONES[s.zone]), `${s.id} is outside the ${s.zone}`);
  for (const s of houseSolids()) assert.ok(!overlap(s.box, GOLF_WAY), `${s.id} is in the way to the mini golf`);
  const entrance = { minX: BOWLING_ENTRY.x - 0.6, maxX: BOWLING_ENTRY.x + 0.6, minZ: BOWLING_ENTRY.z - 0.6, maxZ: BOWLING_DOOR_INSIDE.z + 0.4 };
  for (const s of houseSolids()) assert.ok(!overlap(s.box, entrance), `${s.id} is in the entrance`);
  // Where you stand to order and to rent shoes is free floor.
  for (const spot of [ORDER_SPOT, SHOE_SPOT]) for (const s of houseSolids()) assert.ok(!inBox(spot.x, spot.z, s.box, 0.25), `${s.id} is where you stand at the counter`);
  for (const seat of sofaSeats()) assert.ok(inBox(seat.x, seat.z, ZONES.lounge), `${seat.key} is in the lounge`);
  assert.ok(inBox(COSMIC_SWITCH.x, COSMIC_SWITCH.z, ZONES.lounge));
  assert.equal(ARCADES.length, 2);
});

test('the counter serves what can be held anywhere, and every size of shoe', () => {
  for (const id of BOWLING_MENU) {
    assert.ok(DRINK_BY_ID.has(id), `${id} is a drink`);
    assert.ok(heldAnywhere(id), `${id} is held anywhere (like the fridge's)`);
  }
  assert.ok(BOWLING_MENU.includes('zwickl') && BOWLING_MENU.includes('pommes'), 'beer and fries');
  assert.deepEqual([SHOE_SIZES[0], SHOE_SIZES[SHOE_SIZES.length - 1]], [36, 47]);
});

test('it is a place: the view on arrival, and back in after a reload while there is a street', () => {
  assert.ok((PLACES as readonly string[]).includes(BOWLING));
  assert.equal(bowlingView({ floor: 'x' } as FloorView).floor, BOWLING);
  assert.equal(backInBowling(BOWLING, 1), true);
  assert.equal(backInBowling(BOWLING, 0), false);
  assert.equal(backInBowling('elsewhere', 2), false);
  assert.equal(backInPlace(BOWLING, 2), BOWLING);
  assert.equal(backInPlace(BOWLING, 0), undefined);
});

test('the house: one cosmic switch for everyone inside, rental shoes going back on leaving', () => {
  let now = 10_000;
  const house = new BowlingHouse(() => now);
  const ann = { id: 'a', name: 'Ann', inside: true };
  assert.deepEqual(house.state(), { t: 'bowling.house', lights: 'normal', shoes: {} });
  assert.equal(house.message({ ...ann, inside: false }, { t: 'bowling.lights', lights: 'cosmic' }), null, 'only from inside');
  assert.deepEqual(house.message(ann, { t: 'bowling.lights', lights: 'cosmic' }), { all: { t: 'bowling.lights', lights: 'cosmic', by: 'Ann' } });
  assert.equal(house.message(ann, { t: 'bowling.lights', lights: 'cosmic' }), null, 'already cosmic');
  now += LIGHTS_COOLDOWN_MS / 2;
  assert.ok('warn' in (house.message(ann, { t: 'bowling.lights', lights: 'normal' }) ?? {}), 'not straight back');
  now += LIGHTS_COOLDOWN_MS;
  assert.deepEqual(house.message(ann, { t: 'bowling.lights', lights: 'normal' }), { all: { t: 'bowling.lights', lights: 'normal', by: 'Ann' } });
  assert.equal(house.message(ann, { t: 'bowling.lights', lights: 'strobe' as never }), null);
  // Shoes: a size on the shelf only, changed, given back, taken back on leaving.
  assert.equal(house.message(ann, { t: 'bowling.shoes', size: 52 }), null);
  assert.deepEqual(house.message(ann, { t: 'bowling.shoes', size: 42 }), { all: { t: 'bowling.shoes', id: 'a', size: 42 } });
  assert.equal(house.message(ann, { t: 'bowling.shoes', size: 42 }), null);
  assert.deepEqual(house.message(ann, { t: 'bowling.shoes', size: 43 }), { all: { t: 'bowling.shoes', id: 'a', size: 43 } });
  assert.deepEqual(house.state().shoes, { a: 43 });
  assert.deepEqual(house.leave('a'), { t: 'bowling.shoes', id: 'a', size: null });
  assert.equal(house.leave('a'), null);
  assert.deepEqual(house.message(ann, { t: 'bowling.shoes', size: 40 }), { all: { t: 'bowling.shoes', id: 'a', size: 40 } });
  assert.deepEqual(house.message(ann, { t: 'bowling.shoes', size: null }), { all: { t: 'bowling.shoes', id: 'a', size: null } });
});

test('guests and party guests may do all of it, and see it', () => {
  for (const t of ['bowling.lights', 'bowling.shoes']) {
    assert.ok(GUEST_MSGS.has(t), `${t} for guests`);
    assert.ok(PARTY_MSGS.has(t), `${t} for party guests`);
  }
  for (const t of ['bowling.lights', 'bowling.shoes', 'bowling.house']) assert.ok(PARTY_SEES_MSGS.has(t), `party guests see ${t}`);
});

test('where you are in there, in words', () => {
  assert.equal(bowlingWhereabouts(ORDER_SPOT.x, ORDER_SPOT.z), '🍟 at the bowling counter');
  assert.equal(bowlingWhereabouts(-2, 6), '🛋️ in the bowling lounge');
  assert.equal(bowlingWhereabouts(BOWLING_ENTRY.x, BOWLING_ENTRY.z), '🎳 in the bowling centre');
});
