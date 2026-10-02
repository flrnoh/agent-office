import test from 'node:test';
import assert from 'node:assert/strict';
import { LOT_PLANS, SHOPS, SHOP_KIND_BY_ID, WHOLE_KINDS, quarterOf, shopPoint } from '../src/shared/shops.js';
import { insideShop, shopRoom, stationAt } from '../src/shared/shop-rooms.js';
import { BELT_SPEED, beltOf, beltPoint, beltSlots, plateAt, plateOn, platePoint, SUSHI_PLATES } from '../src/shared/shop-rooms-food.js';
import { FLAVOURS, FOOD_ITEMS, iceId, iceScoops } from '../src/shared/shopwares-food.js';
import { MENUS, SHOP_ITEM_BY_ID } from '../src/shared/shopwares.js';
import { DRINK_BY_ID, ROOF } from '../src/shared/rooftop.js';
import { heldAnywhere, holdSeconds, isSnack } from '../src/shared/fridge.js';
import { heldDrink } from '../src/server/held.js';
import { MARKET_AISLES, MARKET_GOOD_BY_ID, TROLLEY_MAX, Trolleys, aisleGood, euros, receipt, trolleyItems } from '../src/shared/trolley.js';
import { GUEST_MSGS } from '../src/server/guests.js';
import { PARTY_MSGS, PARTY_SEES_MSGS } from '../src/server/party.js';

// flrnoh fork (see FORK.md "Shops to walk into", food round 2): the ice cream parlour, the sushi bar,
// the butcher's and the supermarket. (tests/shops.test.ts walks into every shop, these too.)

const NEW = ['eisdiele', 'sushi', 'metzgerei', 'supermarkt'] as const;

test('the four food kinds are in town, each with its keeper and its things to do', () => {
  for (const id of NEW) {
    const list = SHOPS.filter((s) => s.kind === id);
    assert.ok(list.length >= 6, `${id}: ${list.length}`);
    assert.ok(new Set(list.map((s) => quarterOf(s.ox, s.oz))).size >= 3, `${id} quarters`);
    assert.ok(SHOP_KIND_BY_ID.get(id)!.keeper.name);
    for (const s of list) {
      const at = shopRoom(s).stations.map((t) => t.at);
      assert.ok(at.includes('counter'), `${id} ${s.i} has no counter`);
      if (id === 'sushi') assert.ok(at.filter((a) => a === 'belt').length >= 2, `sushi ${s.i}: seats at the belt`);
      if (id === 'supermarkt') {
        assert.ok(at.includes('trolleys'), `supermarkt ${s.i}: no trolley bay`);
        const aisles = shopRoom(s).stations.filter((t) => t.at === 'aisle').map((t) => t.n);
        assert.ok(aisles.includes(0) && aisles.includes(1) && aisles.length >= 4, `supermarkt ${s.i}: aisles ${aisles}`);
        for (const n of aisles) assert.ok(MARKET_AISLES[n], `aisle ${n}`);
      }
      // Its aim boxes and stations are inside its room.
      for (const t of shopRoom(s).stations) {
        const w = stationAt(s, t);
        assert.ok(insideShop(s, w.x, w.z), `${id} ${s.i}: ${t.at} outside`);
        if (t.aim) {
          const a = shopPoint(s, t.aim.u, t.aim.v);
          assert.ok(insideShop(s, a.x, a.z), `${id} ${s.i}: ${t.at}'s aim outside`);
        }
      }
    }
  }
});

test('the supermarket takes a whole side of its building, two or three shops long', () => {
  assert.deepEqual(WHOLE_KINDS.map((k) => k.id), ['supermarkt']);
  for (const s of SHOPS.filter((x) => x.kind === 'supermarkt')) {
    const r = LOT_PLANS[s.lot].rooms[s.side]!;
    assert.ok(r.count >= 2 && r.count <= 3);
    assert.ok(Math.abs(s.len - (r.to - r.from)) < 1e-9, `supermarkt ${s.i} is ${s.len} of ${r.to - r.from}`);
    assert.equal(SHOPS.filter((o) => o.lot === s.lot && o.side === s.side).length, 1);
  }
  // One near the office: within a short walk.
  const d = Math.min(...SHOPS.filter((x) => x.kind === 'supermarkt').map((s) => Math.hypot(shopPoint(s, s.doorU, 0).x, shopPoint(s, s.doorU, 0).z)));
  assert.ok(d < 60, `nearest supermarket ${d.toFixed(0)} m`);
});

test('the sushi belt: the same plates for everyone, going round on the office clock', () => {
  const s = SHOPS.find((x) => x.kind === 'sushi')!;
  const bt = beltOf(shopRoom(s))!;
  assert.ok(bt && bt.len > 2);
  // The loop closes, and moves at its speed.
  const a = beltPoint(bt, 0);
  const b = beltPoint(bt, bt.len);
  assert.ok(Math.hypot(a.u - b.u, a.v - b.v) < 1e-9);
  const p0 = platePoint(bt, 3, 100);
  const p1 = platePoint(bt, 3, 101);
  assert.ok(Math.abs(Math.hypot(p1.u - p0.u, p1.v - p0.v) - BELT_SPEED) < 1e-6);
  // Over the counter, every slot, any time.
  const c = shopRoom(s).pieces.find((p) => p.what === 'beltcounter')!;
  for (let k = 0; k < beltSlots(bt); k++) {
    const p = platePoint(bt, k, 12345.6);
    assert.ok(p.u >= c.u0 && p.u <= c.u1 && p.v >= c.v0 && p.v <= c.v1, `plate ${k} off the counter`);
    const what = plateOn(s.i, k);
    if (what) assert.ok(DRINK_BY_ID.has(what));
  }
  // Every seat at the belt sees a plate come by now and then; what you get is what's in front of you.
  for (const t of shopRoom(s).stations.filter((x) => x.at === 'belt')) {
    let seen = 0;
    for (let time = 0; time < bt.len / BELT_SPEED; time += 0.5) {
      const got = plateAt(s.i, bt, t.u, time, 0.5);
      if (!got) continue;
      seen++;
      assert.equal(got.plate, plateOn(s.i, got.k));
      assert.ok(Math.abs(platePoint(bt, got.k, time).u - t.u) <= 0.5);
    }
    assert.ok(seen > 5, `seat ${t.n}: ${seen}`);
  }
  assert.deepEqual(plateAt(s.i, bt, shopRoom(s).stations[0].u, 77), plateAt(s.i, bt, shopRoom(s).stations[0].u, 77));
});

test('what the parlour, the belt and the butcher hand over is held anywhere, like the other shops’', () => {
  // (DRINK_BY_ID.get(id) is this very item: no other list has its id.)
  for (const d of FOOD_ITEMS) {
    assert.equal(DRINK_BY_ID.get(d.id), d, d.id);
    assert.equal(SHOP_ITEM_BY_ID.get(d.id), d);
    assert.ok(heldAnywhere(d.id));
    assert.equal(heldDrink(d.id, ROOF), d.id);
    assert.equal(holdSeconds(d), d.seconds);
    assert.equal(isSnack(d), d.bite);
  }
  // Two or three scoops of six flavours, in a cone or a cup: every choice is a thing of its own.
  assert.equal(FOOD_ITEMS.filter((d) => d.id.startsWith('eisw')).length, 21 + 56);
  assert.equal(iceId(true, ['s', 'v', 'e']), 'eiswesv');
  assert.ok(DRINK_BY_ID.has(iceId(false, ['p', 'p'])));
  assert.deepEqual(iceScoops('eisbcz'), [FLAVOURS[5].color, FLAVOURS[4].color]);
  assert.equal(iceScoops('eiskaffee'), null);
  assert.ok(FOOD_ITEMS.filter((d) => d.id.startsWith('eis')).every((d) => d.treat === 'brainfreeze'));
  for (const p of SUSHI_PLATES) assert.ok(MENUS.sushi.includes(p));
  for (const k of NEW) for (const id of MENUS[k]) assert.ok(DRINK_BY_ID.has(id), `${k}: ${id}`);
  assert.ok(MENUS.metzgerei.includes('leberkaessemmel'));
});

test('the trolley: what goes in, the receipt, the office keeping who pushes one', () => {
  assert.deepEqual(trolleyItems(['milch', 'nope', 3, 'aepfel']), ['milch', 'aepfel']);
  assert.equal(trolleyItems('milch'), null);
  assert.equal(trolleyItems(Array(30).fill('milch'))!.length, TROLLEY_MAX);
  // Each aisle hands its own goods round.
  for (let n = 0; n < MARKET_AISLES.length; n++) {
    const got = new Set([0, 1, 2, 3, 4, 5].map((k) => aisleGood(n, k).id));
    assert.deepEqual([...got].sort(), [...MARKET_AISLES[n].goods].sort());
  }
  const r = receipt(['milch', 'milch', 'aepfel', 'bogus']);
  assert.equal(r.lines.length, 2);
  assert.equal(r.cents, 2 * MARKET_GOOD_BY_ID.get('milch')!.cents + MARKET_GOOD_BY_ID.get('aepfel')!.cents);
  assert.equal(euros(1234), '12,34 €');
  assert.equal(euros(5), '0,05 €');

  const t = new Trolleys();
  assert.deepEqual(t.set('f1', 'ann', []), { t: 'trolley', id: 'ann', items: [] });
  assert.deepEqual(t.set('f1', 'ann', ['bier', 'x']), { t: 'trolley', id: 'ann', items: ['bier'] });
  t.set('f2', 'bob', ['milch']);
  assert.deepEqual(t.view('f1'), { ann: ['bier'] });
  assert.deepEqual(t.view('f2'), { bob: ['milch'] });
  assert.deepEqual(t.view(undefined), {});
  // Something that isn't a list lets go of it; letting go of none is no news.
  assert.deepEqual(t.set('f1', 'ann', 'garbage'), { t: 'trolley', id: 'ann', items: null });
  assert.equal(t.set('f1', 'ann', null), null);
  assert.deepEqual(t.leave('f2', 'bob'), { t: 'trolley', id: 'bob', items: null });
  assert.equal(t.leave('f2', 'bob'), null);
  assert.deepEqual(t.view('f2'), {});
  // It's play: guests and party guests may push one, and see everyone's.
  assert.ok(GUEST_MSGS.has('trolley.set') && PARTY_MSGS.has('trolley.set'));
  assert.ok(PARTY_SEES_MSGS.has('trolley'));
});
