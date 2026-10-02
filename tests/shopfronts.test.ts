import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DOOR_W, SHOPS, SHOP_KINDS, shopPoint, shopRect, type Rect } from '../src/shared/shops.ts';
import { DEFAULT_FRONT, FRONT_STYLES, frontStyle, neonLevel, opensAt, shopOpen, skyHour } from '../src/shared/shopfronts.ts';
import { OUTSIDE, OUTSIDE_SEATS, outsideRect, outsideSolids } from '../src/shared/shop-outside.ts';
import { BAND_MIN, OUTER, WALKS, walkCoords, walkPoint } from '../src/shared/sidewalks.ts';
import { FURNITURE } from '../src/shared/streetside.ts';
import { EPOCH, SLOTS, planFor } from '../src/shared/passersby.ts';
import { LOTS } from '../src/shared/city.ts';

// flrnoh fork (FORK.md "Shop fronts"): the shops from outside: each kind's look and hours, what stands
// out in front, and the passers-by keeping out of shut shops.

const overlaps = (a: Rect, b: Rect, pad = 0) => a.minX < b.maxX + pad && a.maxX > b.minX - pad && a.minZ < b.maxZ + pad && a.maxZ > b.minZ - pad;
const inRect = (r: Rect, x: number, z: number, pad = 0) => x > r.minX - pad && x < r.maxX + pad && z > r.minZ - pad && z < r.maxZ + pad;

test('every kind of shop has a front of its own, and a kind still to come gets the default', () => {
  // The fourteen first kinds have rows of their own; any kind added since gets one or the default.
  for (const id of ['baeckerei', 'cafe', 'pizza', 'apotheke', 'blumen', 'buchladen', 'kiosk', 'bar', 'spaeti', 'friseur', 'tattoo', 'doener', 'spielzeug', 'platten']) assert.ok(FRONT_STYLES[id], `${id} has a front style`);
  for (const k of SHOP_KINDS) assert.ok(frontStyle(k.id).close > frontStyle(k.id).open, `${k.id} has a front, its own or the default`);
  assert.equal(frontStyle('gibtsnochnicht'), DEFAULT_FRONT);
  assert.equal(frontStyle('cafe'), FRONT_STYLES.cafe);
  for (const [id, s] of Object.entries(FRONT_STYLES)) {
    assert.ok(s.close > s.open && s.close - s.open <= 24, `${id}: sensible hours`);
    if (s.sign !== 'neon') assert.ok(!s.flicker, `${id}: only neon flickers`);
  }
});

test('closing times are on the office clock, the same every time', () => {
  for (const id of ['baeckerei', 'apotheke', 'blumen', 'buchladen']) {
    assert.ok(shopOpen(id, 12) && shopOpen(id, 19.99), `${id} open by day`);
    assert.ok(!shopOpen(id, 20) && !shopOpen(id, 23.5) && !shopOpen(id, 3), `${id} shut at night`);
  }
  for (const id of ['bar', 'doener', 'spaeti', 'kiosk']) assert.ok(shopOpen(id, 23.5) && shopOpen(id, 0.5), `${id} open late`);
  assert.ok(shopOpen('spaeti', 4.5), 'the Späti never shuts');
  assert.ok(!shopOpen('bar', 5) && shopOpen('bar', 13), 'the bar shuts in the early morning');
  assert.equal(opensAt('apotheke'), '8:00');
  assert.equal(opensAt('somethingnew'), `${DEFAULT_FRONT.open}:00`);
  // The hour is the sky's: a whole day every real hour, the same for the same moment.
  const ms = Date.UTC(2026, 9, 2, 10, 0, 0);
  assert.equal(skyHour(ms, 120), skyHour(ms, 120));
  const quarter = skyHour(ms + 15 * 60_000, 120) - skyHour(ms, 120);
  assert.ok(Math.abs(((quarter + 24) % 24) - 6) < 1e-6, 'a quarter of an hour is six hours of the office day');
});

test('neon flickers on the clock alone: the same at the same moment, steady where it does not flicker', () => {
  let dips = 0;
  for (let t = 0; t < 600; t += 0.05) {
    const a = neonLevel('tattoo', 0, t);
    assert.equal(a, neonLevel('tattoo', 0, t));
    if (a < 1) dips++;
    assert.equal(neonLevel('bar', 0, t), 1);
  }
  assert.ok(dips > 20 && dips < 6000, `the tattoo sign stutters now and then (${dips})`);
});

test('nothing outside a shop is on the walking band, in front of a door, or on the street furniture', () => {
  const pieces = OUTSIDE.flat();
  assert.ok(pieces.some((p) => p.what === 'tables') && pieces.some((p) => p.what === 'crates') && pieces.some((p) => p.what === 'flowers'));
  assert.ok(OUTSIDE_SEATS.length >= 8, 'café chairs to sit on');
  for (const p of pieces) {
    const r = outsideRect(p);
    // Off every sidewalk's band.
    for (const w of WALKS) {
      for (const [x, z] of [[r.minX, r.minZ], [r.maxX, r.minZ], [r.minX, r.maxZ], [r.maxX, r.maxZ], [(r.minX + r.maxX) / 2, (r.minZ + r.maxZ) / 2]]) {
        const [a, off] = walkCoords(w, x, z);
        assert.ok(!(a > w.from && a < w.to && off >= BAND_MIN && off <= w.bandMax), `${p.what} at shop ${p.shop} stands on walk ${w.id}'s band`);
      }
    }
    // Clear of every door, and of every building.
    for (const s of SHOPS) assert.ok(!overlaps(r, shopRect(s, s.doorU - DOOR_W / 2 - 0.3, s.doorU + DOOR_W / 2 + 0.3, -3, 0.2)), `${p.what} at shop ${p.shop} blocks shop ${s.i}'s door`);
    for (const l of LOTS) assert.ok(!overlaps(r, { minX: l.x - l.w / 2, maxX: l.x + l.w / 2, minZ: l.z - l.d / 2, maxZ: l.z + l.d / 2 }, -0.01), `${p.what} inside a building`);
    for (const f of FURNITURE) assert.ok(!inRect(r, f.x, f.z, 0.9), `${p.what} at shop ${p.shop} on a ${f.kind}`);
  }
});

test("the passers-by's ways to their spots stay clear of what's outside", () => {
  const solids = outsideSolids();
  for (const w of WALKS) {
    for (const s of w.spots) {
      const [tx, tz] = s.solo ?? [s.x, s.z];
      const [ax, az] = walkPoint(w, s.along, OUTER);
      for (let k = 0; k <= 20; k++) {
        const x = ax + ((tx - ax) * k) / 20;
        const z = az + ((tz - az) * k) / 20;
        for (const r of solids) {
          // A café's own table is what its sitters go to.
          if (s.kind === 'cafe' && r.shop === s.shop) continue;
          assert.ok(!inRect(r, x, z, 0.15), `the way to a ${s.kind} spot on walk ${w.id} runs into something outside shop ${r.shop}`);
        }
      }
    }
  }
});

test('passers-by never go into a shut shop or sit at its tables', () => {
  const doorShop = (fx: number, fz: number) => SHOPS.find((s) => {
    const d = shopPoint(s, s.doorU, 0);
    return Math.hypot(d.x - fx, d.z - fz) < 0.05;
  });
  for (const night of [23, 3]) {
    let inside = 0;
    let cafes = 0;
    for (const slot of SLOTS.slice(0, 160)) {
      for (let e = 0; e < 8; e++) {
        const plan = planFor(slot, 5000 + e, 1, () => night);
        if (!plan) continue;
        for (const l of plan.legs) {
          if (l.door) {
            const s = doorShop(l.door[0], l.door[1]);
            assert.ok(s, 'a door leg is at a shop door');
            assert.ok(shopOpen(s.kind, night), `${s.kind} is shut at ${night}:00 but someone goes through its door`);
            inside++;
          }
          if (l.act === 'sit') {
            const seat = OUTSIDE_SEATS.find((c) => Math.hypot(c.x - l.ax, c.z - l.az) < 0.7);
            if (seat) {
              cafes++;
              assert.ok(shopOpen(SHOPS[seat.shop].kind, night), 'nobody sits at a shut café');
            }
          }
        }
      }
    }
    assert.ok(inside > 50, `still out and about at ${night}:00 (${inside} doors)`);
    void cafes;
  }
  // By day, some sit outside at a café.
  let sat = 0;
  for (const slot of SLOTS) for (let e = 0; e < 6; e++) for (const l of planFor(slot, 7000 + e, 1, () => 13)?.legs ?? []) if (l.act === 'sit' && OUTSIDE_SEATS.some((c) => Math.hypot(c.x - l.ax, c.z - l.az) < 0.7)) sat++;
  assert.ok(sat > 0, 'someone sits outside a café by day');
  assert.ok(EPOCH > 0);
});
