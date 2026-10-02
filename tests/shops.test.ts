import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LOTS } from '../src/shared/city.js';
import { DEALT_KINDS, DOOR_W, FRONT_T, LOT_PLANS, SHOP_H, SHOP_KINDS, SHOPS, SIDES, doorLeaf, hasShops, lotPlan, lotSolids, shopLocal, shopPoint, shopRect, shopWalls, type Rect, type Shop, type Solid } from '../src/shared/shops.js';
import { insideShop, lotColliders, shopRoom, shopSeatHips, shopSeatKey, shopSeatOf, shopSolids, stationAt } from '../src/shared/shop-rooms.js';
import { MENUS, SHOP_ITEMS, TOYS, isShopItem, toyUse } from '../src/shared/shopwares.js';
import { RECORDS, crateDig } from '../src/shared/records.js';
import { DRINK_BY_ID, ROOF } from '../src/shared/rooftop.js';
import { CAFE_BY_ID } from '../src/shared/cafe.js';
import { heldAnywhere, holdSeconds, isSnack } from '../src/shared/fridge.js';
import { heldDrink, keepsHeld } from '../src/server/held.js';
import { GUEST_MSGS } from '../src/server/guests.js';
import { PARTY_MSGS, PARTY_SEES_MSGS } from '../src/server/party.js';
import { shopSeatHere } from '../src/server/fork/shops.js';
import { Booze } from '../src/client/features/bar/booze.js';

// flrnoh fork (see FORK.md "Shops to walk into"): the city's shops, to walk into.

const overlap = (a: Rect, b: Rect, pad = 0) => a.minX < b.maxX - pad && a.maxX > b.minX + pad && a.minZ < b.maxZ - pad && a.maxZ > b.minZ + pad;
const lotRect = (l: (typeof LOTS)[number]): Rect => ({ minX: l.x - l.w / 2, maxX: l.x + l.w / 2, minZ: l.z - l.d / 2, maxZ: l.z + l.d / 2 });

test('the shops are laid out once, the same every time, from the city alone', () => {
  assert.ok(SHOPS.length > 100, `${SHOPS.length} shops`);
  // The plans and the rooms come out the same however often they're worked out.
  LOTS.forEach((lot, i) => assert.deepEqual(lotPlan(lot), LOT_PLANS[i]));
  for (const s of SHOPS) assert.deepEqual(shopRoom(s), shopRoom({ ...s }), `shop ${s.i}`);
  // Only the buildings close by have shops, and every shop is a side of one facing a street.
  for (const s of SHOPS) {
    assert.ok(hasShops(LOTS[s.lot]));
    assert.ok(LOT_PLANS[s.lot].rooms[s.side]);
  }
  // The page draws exactly this layout: no kinds picked by a running counter any more.
  const drawn = readFileSync('src/client/world/town/shops.ts', 'utf8');
  assert.match(drawn, /for \(const s of SHOPS\)/);
  assert.doesNotMatch(drawn, /n\+\+\) % /);
  const built = readFileSync('src/client/world/town/buildings.ts', 'utf8');
  assert.match(built, /lotColliders\(li\)/);
});

test('every kind (14 and more) is all over the city, and the nearest shops are one of each', () => {
  assert.ok(SHOP_KINDS.length >= 14, `${SHOP_KINDS.length} kinds`);
  assert.equal(new Set(SHOP_KINDS.map((k) => k.id)).size, SHOP_KINDS.length);
  const byKind = new Map<string, Shop[]>();
  for (const s of SHOPS) byKind.set(s.kind, [...(byKind.get(s.kind) ?? []), s]);
  for (const k of SHOP_KINDS) {
    const list = byKind.get(k.id) ?? [];
    // 22 kinds over about 128 shops (the supermarkets take two or three each): at least five of every kind.
    assert.ok(list.length >= 5, `${k.id}: ${list.length}`);
    // In every quarter round the office.
    const quarters = new Set(list.map((s) => `${Math.sign(s.ox)}${Math.sign(s.oz - 27)}`));
    assert.ok(quarters.size >= 3, `${k.id} only in ${[...quarters]}`);
  }
  const door = (s: Shop) => shopPoint(s, s.doorU, 0);
  // The kinds dealt shop by shop: the nearest of those are one of each (a whole-side kind, the supermarket, has its own sides).
  const dealt = new Set(DEALT_KINDS.map((k) => k.id));
  const nearest = SHOPS.filter((s) => dealt.has(s.kind)).sort((a, b) => Math.hypot(door(a).x, door(a).z) - Math.hypot(door(b).x, door(b).z)).slice(0, DEALT_KINDS.length);
  assert.equal(new Set(nearest.map((s) => s.kind)).size, DEALT_KINDS.length);
});

test('every shop is inside its building, and no two shops share any floor', () => {
  for (const s of SHOPS) {
    const lot = lotRect(LOTS[s.lot]);
    const r = s.rect;
    assert.ok(r.minX >= lot.minX - 1e-6 && r.maxX <= lot.maxX + 1e-6 && r.minZ >= lot.minZ - 1e-6 && r.maxZ <= lot.maxZ + 1e-6, `shop ${s.i} sticks out of its building`);
    LOTS.forEach((l, li) => li !== s.lot && assert.ok(!overlap(r, lotRect(l)), `shop ${s.i} in lot ${li}`));
    for (const o of SHOPS) if (o.i > s.i) assert.ok(!overlap(r, o.rect, 1e-6), `shops ${s.i} and ${o.i} overlap`);
    const core = LOT_PLANS[s.lot].core;
    if (core) assert.ok(!overlap(r, core, 1e-6), `shop ${s.i} runs into the core of its building`);
    assert.ok(s.len >= 6 && s.depth >= 6, `shop ${s.i} is ${s.len} × ${s.depth}`);
  }
});

test('the building stays solid over the shops and behind them; without shops, all of it', () => {
  LOTS.forEach((lot, li) => {
    const solids = lotSolids(li);
    const all = lotRect(lot);
    if (!SHOPS.some((s) => s.lot === li)) return assert.deepEqual(solids, [{ ...all, bottom: 0, top: 400 }]);
    assert.ok(solids.some((c) => c.bottom === SHOP_H && c.top === 400 && c.minX === all.minX && c.maxZ === all.maxZ), 'the floors over the shops');
    // Every point of the ground floor is a shop's room or the solid core.
    for (let x = all.minX + 0.2; x < all.maxX; x += 0.7)
      for (let z = all.minZ + 0.2; z < all.maxZ; z += 0.7) {
        const core = LOT_PLANS[li].core;
        const inCore = !!core && x > core.minX && x < core.maxX && z > core.minZ && z < core.maxZ;
        const inShop = SHOPS.some((s) => s.lot === li && x >= s.rect.minX && x <= s.rect.maxX && z >= s.rect.minZ && z <= s.rect.maxZ);
        assert.ok(inCore || inShop, `lot ${li}: (${x.toFixed(1)}, ${z.toFixed(1)}) is neither`);
      }
  });
});

/** Can you walk (a circle of `r`) from `from` to within `reach` of `to` round `solids` (those up to head height)? A grid search. */
function walkable(solids: Solid[], from: { x: number; z: number }, to: { x: number; z: number }, area: Rect, reach = 0.15, r = 0.3, cell = 0.1): boolean {
  const low = solids.filter((c) => c.bottom < 1.8 && c.top > 0.2);
  const nx = Math.ceil((area.maxX - area.minX) / cell);
  const nz = Math.ceil((area.maxZ - area.minZ) / cell);
  const free = (i: number, j: number) => {
    const x = area.minX + (i + 0.5) * cell;
    const z = area.minZ + (j + 0.5) * cell;
    return !low.some((c) => x > c.minX - r && x < c.maxX + r && z > c.minZ - r && z < c.maxZ + r);
  };
  const idx = (p: { x: number; z: number }) => [Math.floor((p.x - area.minX) / cell), Math.floor((p.z - area.minZ) / cell)];
  const [si, sj] = idx(from);
  const [ti, tj] = idx(to);
  if (!free(si, sj)) return false;
  const seen = new Uint8Array(nx * nz);
  const queue = [[si, sj]];
  seen[sj * nx + si] = 1;
  while (queue.length) {
    const [i, j] = queue.shift()!;
    if (Math.hypot(i - ti, j - tj) * cell <= reach) return true;
    for (const [di, dj] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const a = i + di;
      const b = j + dj;
      if (a < 0 || b < 0 || a >= nx || b >= nz || seen[b * nx + a] || !free(a, b)) continue;
      seen[b * nx + a] = 1;
      queue.push([a, b]);
    }
  }
  return false;
}

test('every shop door is open from the sidewalk, and there is a clear way in to the counter and everything to use', () => {
  for (const s of SHOPS) {
    const solids = lotColliders(s.lot);
    // Nothing stands in the doorway, from the sidewalk to just inside, up to the top of the door.
    const doorway = shopRect(s, s.doorU - DOOR_W / 2 + 0.05, s.doorU + DOOR_W / 2 - 0.05, -0.6, FRONT_T + 0.6);
    for (const c of solids) assert.ok(!(overlap(c, doorway, 1e-6) && c.bottom < 2.2 && c.top > 0), `shop ${s.i}: something in the doorway`);
    // Out in front of the door is the sidewalk: no building there.
    const out = shopPoint(s, s.doorU, -0.8);
    assert.ok(!LOTS.some((l) => overlap(lotRect(l), { minX: out.x, maxX: out.x, minZ: out.z, maxZ: out.z }, -1e-6)), `shop ${s.i}: its door opens into a building`);
    const area = shopRect(s, -2, s.len + 2, -2, s.depth + 0.5);
    const room = shopRoom(s);
    const spot = shopPoint(s, room.spot.u, room.spot.v);
    assert.ok(walkable(solids, out, spot, area), `shop ${s.i} (${s.kind}): no way from the door to the counter`);
    for (const t of room.stations) {
      const at = stationAt(s, t);
      assert.ok(insideShop(s, at.x, at.z), `shop ${s.i}: ${t.at} ${t.n} isn't inside`);
      assert.ok(walkable(solids, out, at, area, 0.9), `shop ${s.i} (${s.kind}): no way to its ${t.at} ${t.n}`);
    }
    // The keeper stands behind the counter, inside.
    const k = shopPoint(s, room.keeper.u, room.keeper.v);
    assert.ok(insideShop(s, k.x, k.z));
  }
});

test('the walls have their door and nothing else open; the door leaf stands inside, clear of the gap', () => {
  for (const s of SHOPS) {
    const walls = shopWalls(s);
    const leaf = doorLeaf(s);
    assert.ok(leaf.v0 >= FRONT_T && leaf.u1 - leaf.u0 < 0.1);
    assert.ok(leaf.u1 <= s.doorU - DOOR_W / 2 + 1e-6 || leaf.u0 >= s.doorU + DOOR_W / 2 - 1e-6, `shop ${s.i}: the leaf hangs in the doorway`);
    assert.equal(walls.length, 7);
    // Local and world frames agree.
    const p = shopPoint(s, 1.2, 3.4);
    const l = shopLocal(s, p.x, p.z);
    assert.ok(Math.abs(l.u - 1.2) < 1e-9 && Math.abs(l.v - 3.4) < 1e-9);
    assert.ok(shopSolids(s).length > walls.length);
  }
});

test('each kind has something to do: a counter, and the barber’s and the tattoo studio’s chairs, the record shop’s crates and headphones', () => {
  for (const s of SHOPS) {
    const at = new Set(shopRoom(s).stations.map((t) => t.at));
    assert.ok(at.has('counter'));
    if (s.kind === 'friseur' || s.kind === 'tattoo') assert.ok(at.has('chair'), `${s.kind} ${s.i} has no chair`);
    if (s.kind === 'platten') assert.ok(at.has('listen'), `platten ${s.i} has no listening station`);
    if (s.kind === 'buchladen') assert.ok(at.has('shelf'));
  }
  assert.ok(SHOPS.some((s) => s.kind === 'platten' && shopRoom(s).stations.some((t) => t.at === 'crate')));
  // The chairs, the boutique's racks and the optician's glasses are those shops' menus; the Post writes postcards; the supermarket's counter is its checkout; the bike shop rents bikes.
  for (const k of SHOP_KINDS) if (!['friseur', 'tattoo', 'boutique', 'optiker', 'post', 'supermarkt', 'fahrrad'].includes(k.id)) assert.ok(MENUS[k.id].length > 0, k.id);
});

test('a shop chair is a seat: its key goes both ways, on an office floor only', () => {
  const s = SHOPS.find((x) => x.kind === 'friseur')!;
  const key = shopSeatKey(s.i, 0);
  const seat = shopSeatOf(key);
  assert.equal(seat?.shop.i, s.i);
  assert.equal(seat?.station.at, 'chair');
  assert.equal(shopSeatHips(key), seat?.station.seat?.hips);
  assert.equal(shopSeatOf('couch:0'), undefined);
  assert.equal(shopSeatOf(shopSeatKey(s.i, 9)), undefined);
  assert.equal(shopSeatHips('couch:0'), null);
  const ctx = (map: string) => ({ floors: new Map([['f1', {}]]), maps: { pick: () => map } }) as never;
  assert.equal(shopSeatHere(ctx('office'), { peer: { floor: 'f1' } } as never, key), true);
  assert.equal(shopSeatHere(ctx('office'), { peer: { floor: ROOF } } as never, key), false);
  assert.equal(shopSeatHere(ctx('castle'), { peer: { floor: 'f1' } } as never, key), false);
  assert.equal(shopSeatHere(ctx('office'), { peer: { floor: 'f1' } } as never, 'couch:0'), false);
});

test('what the shops hand over is held anywhere, like the fridge’s, and does what it says', () => {
  for (const d of SHOP_ITEMS) {
    assert.equal(DRINK_BY_ID.get(d.id), d, d.id);
    assert.ok(heldAnywhere(d.id) && keepsHeld(d.id));
    assert.equal(heldDrink(d.id, 'some-floor'), d.id);
    assert.equal(heldDrink(d.id, ROOF), d.id);
    assert.equal(holdSeconds(d), d.seconds);
    assert.equal(isSnack(d), d.bite);
  }
  // Every menu sells things that exist.
  for (const [kind, ids] of Object.entries(MENUS)) for (const id of ids) assert.ok(DRINK_BY_ID.has(id), `${kind}: ${id}`);
  // The café's coffees are the padel café's, with its buzz.
  assert.ok(MENUS.cafe.filter((id) => CAFE_BY_ID.get(id as never)?.coffee).length >= 3);
  // The bar's drinks go to your head; the headache pill clears it; the döner soaks some up.
  const booze = new Booze();
  booze.drink(DRINK_BY_ID.get('obstler')!, 0);
  booze.drink(DRINK_BY_ID.get('zwickl')!, 0);
  const drunk = booze.amount(10);
  assert.ok(drunk > 0.6, `${drunk}`);
  booze.drink(DRINK_BY_ID.get('kopfwehpille')!, 10);
  assert.ok(booze.amount(10) < drunk - 0.5, 'the pill sobers you up');
  assert.equal(booze.holding(10)?.id, 'kopfwehpille');
  booze.letGo();
  assert.equal(booze.holding(10), null);
  assert.ok(DRINK_BY_ID.get('doener')!.strength < 0);
  assert.ok(!isShopItem('beer'));
});

test('toys: only the one in your hand, sound numbers, clamped; sorted for guests and party guests', () => {
  for (const toy of TOYS) {
    const m = toyUse({ t: 'toy.use', toy, x: 1, y: 2, z: 3, yaw: 0.5, pitch: 9 }, toy, 'ann');
    assert.deepEqual(m, { t: 'toy.used', id: 'ann', toy, x: 1, y: 2, z: 3, yaw: 0.5, pitch: 1.6 });
  }
  assert.equal(toyUse({ t: 'toy.use', toy: 'yoyo', x: 1, y: 2, z: 3, yaw: 0, pitch: 0 }, 'teddy', 'ann'), null);
  assert.equal(toyUse({ t: 'toy.use', toy: 'yoyo', x: NaN, y: 2, z: 3, yaw: 0, pitch: 0 }, 'yoyo', 'ann'), null);
  assert.equal(toyUse({ t: 'toy.use', toy: 'beer' as never, x: 1, y: 2, z: 3, yaw: 0, pitch: 0 }, 'beer', 'ann'), null);
  assert.ok(GUEST_MSGS.has('toy.use') && PARTY_MSGS.has('toy.use'));
  assert.ok(PARTY_SEES_MSGS.has('toy.used'));
});

test('records: a dozen, each its own, the crates the same for everyone', () => {
  assert.equal(RECORDS.length, 12);
  assert.equal(new Set(RECORDS.map((r) => r.id)).size, 12);
  assert.equal(new Set(RECORDS.map((r) => r.title)).size, 12);
  const dig = crateDig(5, 1, 2);
  assert.deepEqual(dig, crateDig(5, 1, 2));
  assert.equal(new Set(dig.map((r) => r.id)).size, 4);
  assert.notDeepEqual(crateDig(5, 1, 3).map((r) => r.id), dig.map((r) => r.id));
});

test('the shops sides are named and SIDES covers them', () => {
  assert.deepEqual([...SIDES].sort(), ['nx', 'nz', 'px', 'pz']);
});

test('the boutique: cubicles to step into (short of the way across to the counter), racks, a mirror, a window for mannequins', () => {
  const shops = SHOPS.filter((s) => s.kind === 'boutique');
  assert.ok(shops.length >= 5);
  for (const s of shops) {
    const room = shopRoom(s);
    const solids = lotColliders(s.lot);
    const area = shopRect(s, -2, s.len + 2, -2, s.depth + 0.5);
    const out = shopPoint(s, s.doorU, -0.8);
    const cubicles = room.pieces.filter((p) => p.what === 'cubicle');
    assert.ok(cubicles.length >= 1 && cubicles.length <= 2, `boutique ${s.i}: ${cubicles.length} cubicles`);
    const inCubicles = room.stations.filter((t) => t.at === 'cubicle');
    assert.equal(inCubicles.length, cubicles.length);
    for (const t of inCubicles) {
      // You can walk all the way in, from the street.
      const p = cubicles[t.n];
      const mid = shopPoint(s, (p.u0 + p.u1) / 2, (p.v0 + p.v1) / 2);
      assert.ok(walkable(solids, out, mid, area), `boutique ${s.i}: can't step into cubicle ${t.n}`);
    }
    assert.ok(room.stations.some((t) => t.at === 'rack'), `boutique ${s.i} has no rack`);
    assert.ok(room.pieces.some((p) => p.what === 'display' && p.v0 <= FRONT_T + 0.2), 'a window for the mannequins');
  }
  assert.ok(shops.some((s) => shopRoom(s).pieces.some((p) => p.what === 'standmirror')));
});

test('the optician: a wall of glasses, an eye chart, the counter', () => {
  const shops = SHOPS.filter((s) => s.kind === 'optiker');
  assert.ok(shops.length >= 5);
  for (const s of shops) {
    const room = shopRoom(s);
    assert.ok(room.pieces.some((p) => p.what === 'glasswall'));
    assert.ok(room.pieces.some((p) => p.what === 'eyechart'));
    assert.ok(room.stations.some((t) => t.at === 'glasses'));
    assert.ok(room.stations.some((t) => t.at === 'counter'));
  }
  assert.ok(shops.some((s) => shopRoom(s).pieces.some((p) => p.what === 'standmirror')));
});
