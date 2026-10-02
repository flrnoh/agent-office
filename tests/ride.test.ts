import test from 'node:test';
import assert from 'node:assert/strict';
import { LOTS } from '../src/shared/city.js';
import { DRIVE, drive, type CarPose } from '../src/shared/garage.js';
import { SHOPS, SHOP_KINDS, shopAt, shopPoint } from '../src/shared/shops.js';
import { insideShop, lotColliders, shopRoom, shopSeatOf, shopSeatKey, stationAt } from '../src/shared/shop-rooms.js';
import { BIKES, BIKE_KINDS, ON_SHOULDER, WASH_SECONDS, bikeOf, busyMachine, isBikeKind, rideable } from '../src/shared/ride.js';
import { MENUS, SHOP_ITEM_BY_ID, isShopItem } from '../src/shared/shopwares.js';
import { DRINK_BY_ID } from '../src/shared/rooftop.js';
import { heldAnywhere } from '../src/shared/fridge.js';
import { heldDrink } from '../src/server/held.js';
import { rideMessage } from '../src/server/fork/ride.js';
import { GUEST_MSGS } from '../src/server/guests.js';
import { PARTY_MSGS, PARTY_SEES_MSGS } from '../src/server/party.js';

// flrnoh fork (see FORK.md "Shops to walk into"): the bike shop, the pet shop and the laundromat.

const RUN = 7.5;

test('the three new kinds are in the city, every one in several quarters', () => {
  for (const id of ['fahrrad', 'zoo', 'waschsalon'] as const) {
    assert.ok(SHOP_KINDS.some((k) => k.id === id), id);
    const list = SHOPS.filter((s) => s.kind === id);
    assert.ok(list.length >= 4, `${id}: ${list.length}`);
    assert.ok(new Set(list.map((s) => `${Math.sign(s.ox)}${Math.sign(s.oz - 27)}`)).size >= 3, id);
  }
});

test('bikes ride quicker than running and slower than the cars, and the BMX jumps highest', () => {
  for (const k of BIKE_KINDS) {
    const b = BIKES[k];
    assert.ok(b.tuning.top > RUN && b.tuning.top < DRIVE.top, k);
    // Pedalling flat out for a while gets you to its top speed and no further.
    let p: CarPose = { x: 0, z: 0, rotY: 0, speed: 0, steer: 0 };
    for (let i = 0; i < 600; i++) p = drive(p, { gas: 1, turn: 0, brake: false }, 1 / 60, b.tuning);
    assert.ok(Math.abs(p.speed - b.tuning.top) < 1e-6, `${k}: ${p.speed}`);
    assert.ok(p.z > 0 && Math.abs(p.x) < 1e-9, `${k} goes the way it faces`);
    // A and D turn it, and S brakes it to a stop.
    const turned = drive({ ...p }, { gas: 0, turn: 1, brake: false }, 0.5, b.tuning);
    assert.ok(turned.rotY !== p.rotY);
    let q = p;
    for (let i = 0; i < 300; i++) q = drive(q, { gas: -1, turn: 0, brake: false }, 1 / 60, b.tuning);
    assert.ok(q.speed <= 0 && q.speed >= -b.tuning.reverse);
  }
  assert.ok(BIKE_KINDS.every((k) => k === 'bmx' || BIKES[k].hop < BIKES.bmx.hop));
});

test('a bike goes on the street and the sidewalks, never into a shop; you get on it outside the bike shop’s door', () => {
  for (const s of SHOPS) {
    const mid = shopPoint(s, s.len / 2, s.depth / 2);
    assert.ok(!rideable(mid.x, mid.z), `shop ${s.i}`);
    const door = shopPoint(s, s.doorU, 0.4);
    assert.ok(!rideable(door.x, door.z), `shop ${s.i}'s doorway`);
  }
  for (const s of SHOPS.filter((x) => x.kind === 'fahrrad')) {
    const out = shopPoint(s, s.doorU, -1.6);
    assert.ok(rideable(out.x, out.z), `bike shop ${s.i}: you start on the sidewalk`);
    assert.ok(!shopAt(out.x, out.z));
    assert.ok(!LOTS.some((l) => Math.abs(out.x - l.x) < l.w / 2 && Math.abs(out.z - l.z) < l.d / 2), `bike shop ${s.i}: out front is inside a building`);
    // Nothing of the building stands where you get on.
    for (const c of lotColliders(s.lot)) assert.ok(!(out.x > c.minX - 0.35 && out.x < c.maxX + 0.35 && out.z > c.minZ - 0.35 && out.z < c.maxZ + 0.35 && c.bottom < 1.5), `bike shop ${s.i}: blocked out front`);
  }
  assert.ok(!rideable(NaN, 0));
});

test('which bike someone is on: only the shop’s, kept by the office and passed on; the bell only while riding', () => {
  assert.ok(BIKE_KINDS.every(isBikeKind));
  assert.equal(bikeOf('unicycle'), undefined);
  assert.equal(bikeOf(null), undefined);
  const sent: unknown[] = [];
  const ctx = { broadcast: (m: unknown) => sent.push(['all', m]), toNeighbors: (_c: unknown, m: unknown) => sent.push(['floor', m]) };
  const c = { id: 'a', peer: { id: 'a' } as { id: string; bike?: string }, throttles: new Map<string, number>() };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const send = (m: any) => rideMessage(ctx as any, c as any, m);
  send({ t: 'bike.bell' });
  assert.equal(sent.length, 0, 'no bell without a bike');
  send({ t: 'bike.ride', bike: 'bmx' });
  assert.equal(c.peer.bike, 'bmx');
  assert.deepEqual(sent.pop(), ['all', { t: 'bike.rode', id: 'a', bike: 'bmx' }]);
  send({ t: 'bike.ride', bike: 'bmx' });
  assert.equal(sent.length, 0, 'the same again says nothing');
  send({ t: 'bike.bell' });
  send({ t: 'bike.bell' });
  assert.deepEqual(sent, [['floor', { t: 'bike.bell', id: 'a' }]], 'rung, and not twice at once');
  sent.length = 0;
  send({ t: 'bike.ride', bike: 'tank' });
  assert.equal(c.peer.bike, undefined, 'anything else is off the bike');
  assert.deepEqual(sent.pop(), ['all', { t: 'bike.rode', id: 'a', bike: null }]);
  for (const t of ['bike.ride', 'bike.bell']) assert.ok(GUEST_MSGS.has(t) && PARTY_MSGS.has(t), t);
  for (const t of ['bike.rode', 'bike.bell']) assert.ok(PARTY_SEES_MSGS.has(t), t);
});

test('the pet shop: a goldfish in a bag and a budgie for the shoulder, held anywhere like everything from the shops', () => {
  assert.deepEqual([...MENUS.zoo], ['goldfisch', 'wellensittich']);
  for (const id of ['goldfisch', 'wellensittich', 'waschmittel', 'socke']) {
    assert.ok(isShopItem(id) && heldAnywhere(id), id);
    assert.equal(heldDrink(id, 'some-floor'), id);
    assert.equal(DRINK_BY_ID.get(id as never)?.id, id);
  }
  assert.equal(SHOP_ITEM_BY_ID.get('goldfisch')?.glass, 'fishbag');
  // What sits on a shoulder is something the shops hand over, held for a while and then gone.
  for (const id of ON_SHOULDER) assert.ok(isShopItem(id) && (SHOP_ITEM_BY_ID.get(id)?.seconds ?? 0) >= 60, id);
  assert.equal(heldDrink('elefant', 'some-floor'), undefined);
});

test('the laundromat: washing machines to start, chairs to sit and wait on, a vending machine, all within reach', () => {
  const salons = SHOPS.filter((s) => s.kind === 'waschsalon');
  for (const s of salons) {
    const room = shopRoom(s);
    const washers = room.stations.filter((t) => t.at === 'washer');
    assert.ok(washers.length >= 2, `salon ${s.i}: ${washers.length} washers`);
    assert.equal(washers.length, room.pieces.filter((p) => p.what === 'washer').length);
    for (const t of washers) {
      // Its E box is over its own machine, inside the room.
      const hit = t.hit!;
      const p = room.pieces.find((x) => x.what === 'washer' && hit.v > x.v0 && hit.v < x.v1)!;
      assert.ok(p && hit.u > p.u0 && hit.u < p.u1, `salon ${s.i}: washer ${t.n}'s hit box`);
    }
    const chairs = room.stations.filter((t) => t.at === 'chair');
    assert.ok(chairs.length >= 1);
    for (const t of chairs) {
      assert.equal(shopSeatOf(shopSeatKey(s.i, t.n))?.station, t);
      const seat = stationAt(s, t).seat!;
      assert.ok(insideShop(s, seat.x, seat.z));
    }
    assert.ok(room.stations.some((t) => t.at === 'vending'));
  }
  // Somebody's always washing, but never every machine at once; the same for everyone at the same time.
  const at = Date.UTC(2026, 9, 2, 12);
  for (let k = 0; k < 20; k++) {
    const ms = at + k * 90_000;
    const busy = [0, 1, 2, 3, 4, 5, 6, 7].map((n) => busyMachine(salons[0].i, n, ms));
    assert.ok(busy.some((b) => !b), 'a free machine');
    assert.deepEqual(busy, [0, 1, 2, 3, 4, 5, 6, 7].map((n) => busyMachine(salons[0].i, n, ms)));
  }
  assert.ok(WASH_SECONDS >= 30 && WASH_SECONDS <= 180);
});

test('the bike shop and the pet shop have their own things to look at, and a counter within reach', () => {
  for (const s of SHOPS.filter((x) => x.kind === 'fahrrad')) {
    const what = new Set(shopRoom(s).pieces.map((p) => p.what));
    for (const w of ['bikewall', 'tyres', 'repairstand'] as const) assert.ok(what.has(w), `bike shop ${s.i}: no ${w}`);
  }
  for (const s of SHOPS.filter((x) => x.kind === 'zoo')) {
    const what = new Set(shopRoom(s).pieces.map((p) => p.what));
    for (const w of ['aquarium', 'foodshelf', 'birdcage'] as const) assert.ok(what.has(w), `pet shop ${s.i}: no ${w}`);
  }
});
