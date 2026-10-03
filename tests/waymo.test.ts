// flrnoh fork (see FORK.md "Waymo"): the robotaxis: the streets as they drive them, their drives
// keeping to the lights and out of everyone's way, and a ride from booking to getting out.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BUS_L, BUS_RUNS, BUS_W, poseOf } from '../src/shared/citybus.js';
import { onRoad } from '../src/shared/sidewalks.js';
import { lampAt } from '../src/shared/traffic-lights.js';
import { CAR_L, CAR_W, corners, driveAt, overlaps, type Body } from '../src/shared/waymo/drive.js';
import { asDrive, destOf, initialsOf, waymoAt, waymoEta, type WaymoCar } from '../src/shared/waymo/fleet.js';
import { BUS_LANES, KERB_SPOTS, LANES, kerbNear, laneKey, pathOf, placeAt, route } from '../src/shared/waymo/roads.js';
import { Fleet } from '../src/server/fork/waymo.js';

const T0 = 1_790_000_000;

test('the streets as a robotaxi drives them: on the road, every curb spot off the bus lanes, a way from anywhere to anywhere', () => {
  assert.ok(LANES.length > 100);
  assert.ok(KERB_SPOTS.length > 300);
  for (const p of KERB_SPOTS) assert.ok(!BUS_LANES.has(laneKey(p)), 'waiting on a bus lane');
  for (let i = 0; i < 80; i++) {
    const a = KERB_SPOTS[(i * 37) % KERB_SPOTS.length];
    const b = KERB_SPOTS[(i * 91 + 13) % KERB_SPOTS.length];
    const nodes = route(a, b);
    assert.ok(nodes, `no way from ${laneKey(a)} to ${laneKey(b)}`);
    const p = pathOf(a, nodes, b);
    for (let k = 0; k < p.xs.length; k += 2) assert.ok(onRoad(p.xs[k], p.zs[k]), `off the road at (${p.xs[k].toFixed(1)}, ${p.zs[k].toFixed(1)})`);
    // Its ends are where they should be.
    const s = placeAt(a);
    const e = placeAt(b);
    assert.ok(Math.hypot(p.xs[0] - s.x, p.zs[0] - s.z) < 0.3 && Math.hypot(p.xs[p.xs.length - 1] - e.x, p.zs[p.zs.length - 1] - e.z) < 0.3);
  }
  // The curb by the office is round the side of it, a short walk away.
  const near = placeAt(kerbNear(0, 22), 2);
  assert.ok(Math.hypot(near.x, near.z - 22) < 40, `the office's curb is ${Math.hypot(near.x, near.z - 22).toFixed(0)} m off`);
});

/** Someone to ride. */
const anna = { id: 'anna', name: 'Anna Berg', color: '#e05a3a' };
const ben = { id: 'ben', name: 'Ben', color: '#3a8ee0' };

function fleetAt(t: { now: number }) {
  const warned: string[] = [];
  let changes = 0;
  let seed = 7;
  const fleet = new Fleet({
    now: () => t.now,
    changed: () => changes++,
    warn: (_, text) => warned.push(text),
    honked: () => {},
    random: () => ((seed = (seed * 16807) % 2147483647) / 2147483647),
  });
  return { fleet, warned, changes: () => changes };
}

/** Runs the fleet's clock on to `until`, a tick a second. */
function run(t: { now: number }, fleet: Fleet, until: number) {
  while (t.now < until) {
    t.now += 1;
    fleet.tick();
  }
}

/** Where everything is at `t`: the buses and the robotaxis. */
function bodies(cars: WaymoCar[], t: number): { what: string; b: Body }[] {
  return [
    ...BUS_RUNS.map((r, i) => {
      const p = poseOf(r, t);
      return { what: `bus ${i}`, b: { x: p.x, z: p.z, fx: Math.cos(p.yaw), fz: -Math.sin(p.yaw), l: BUS_L, w: BUS_W } };
    }),
    ...cars.map((c) => {
      const p = waymoAt(c, t);
      return { what: `waymo ${c.id}`, b: { x: p.x, z: p.z, fx: Math.cos(p.yaw), fz: -Math.sin(p.yaw), l: CAR_L, w: CAR_W } };
    }),
  ];
}

test('the fleet cruises the town without running into a bus or each other, keeping to the lights', () => {
  const t = { now: T0 };
  const { fleet } = fleetAt(t);
  const from = t.now;
  const snaps: WaymoCar[][] = [];
  // Keep each car's drive as it was at each moment (they're replaced as they go).
  for (let k = 0; k < 600; k++) {
    run(t, fleet, t.now + 1);
    snaps.push(fleet.cars.map((c) => structuredClone(c)));
  }
  let moving = 0;
  for (let k = 0; k < snaps.length; k++) {
    for (let u = 0; u < 1; u += 0.25) {
      const at = from + k + 1 + u;
      const all = bodies(snaps[k], at);
      for (let i = BUS_RUNS.length; i < all.length; i++) {
        const me = corners(all[i].b);
        for (let j = 0; j < all.length; j++) {
          if (j === i || Math.hypot(all[j].b.x - all[i].b.x, all[j].b.z - all[i].b.z) > 12) continue;
          assert.ok(!overlaps(me, corners(all[j].b)), `${all[i].what} runs into ${all[j].what} at ${at - T0}`);
        }
      }
    }
    for (const c of snaps[k]) {
      const d = asDrive(c.drive);
      // Over a stop line only on green or amber.
      for (const g of d.path.gates) {
        const a = driveAt(d, from + k + 1).s + CAR_L / 2;
        const b = driveAt(d, from + k + 1.25).s + CAR_L / 2;
        if (a <= g.s && b > g.s + 0.01) {
          const lamp = lampAt(g.l, g.axis, from + k + 1.25);
          assert.ok(lamp === 'green' || lamp === 'amber', `waymo ${c.id} over a stop line on ${lamp}`);
        }
      }
      if (waymoAt(c, from + k + 1).speed > 1) moving++;
    }
  }
  assert.ok(moving > 1000, `they hardly move (${moving})`);
});

test('a ride: booked, it comes to the curb by you, you and a friend get in, it takes you there, you get out, it cruises on', () => {
  const t = { now: T0 + 5000 };
  const { fleet, warned } = fleetAt(t);
  run(t, fleet, t.now + 20);
  // Anna stands by the office and wants to go to the casino.
  fleet.message(anna, { t: 'waymo.book', x: 0, z: 22, dest: { name: 'Casino', x: -33, z: 36 } });
  const car = fleet.cars.find((c) => c.booker === 'anna');
  assert.ok(car, `nothing booked: ${warned.join(', ')}`);
  assert.equal(car.mode, 'coming');
  assert.equal(car.initials, 'AB');
  // A second booking of hers is refused.
  fleet.message(anna, { t: 'waymo.book', x: 0, z: 22, dest: { name: 'Kino', x: -56, z: -57 } });
  assert.match(warned.at(-1)!, /schon/);
  // It comes, and waits at the curb by the office.
  run(t, fleet, waymoEta(car) + 2);
  assert.equal(car.mode, 'waiting');
  const at = waymoAt(car, t.now);
  const kerb = placeAt(kerbNear(0, 22));
  assert.ok(Math.hypot(at.x - kerb.x, at.z - kerb.z) < 0.5, 'not where it said');
  assert.ok(at.speed === 0);
  // Ben gets in too; they set off.
  fleet.message(anna, { t: 'waymo.enter', car: car.id });
  fleet.message(ben, { t: 'waymo.enter', car: car.id });
  assert.deepEqual(car.riders.filter(Boolean), ['anna', 'ben']);
  fleet.message(ben, { t: 'waymo.go' });
  assert.equal(car.mode, 'riding');
  // No getting out on the way.
  fleet.message(ben, { t: 'waymo.leave' });
  assert.ok(car.riders.includes('ben'));
  run(t, fleet, waymoEta(car) + 2);
  assert.equal(car.mode, 'arrived');
  const end = waymoAt(car, t.now);
  const drop = placeAt(kerbNear(-33, 36));
  assert.ok(Math.hypot(end.x - drop.x, end.z - drop.z) < 0.5, 'not at the casino');
  // Out they get; it's off again.
  fleet.message(anna, { t: 'waymo.leave' });
  fleet.message(ben, { t: 'waymo.leave' });
  run(t, fleet, t.now + 2);
  assert.equal(car.mode, 'cruise');
  assert.equal(car.booker, undefined);
});

test('booking: cancelled, left waiting too long, gone from the office', () => {
  const t = { now: T0 + 9000 };
  const { fleet, warned } = fleetAt(t);
  fleet.message(anna, { t: 'waymo.book', x: -84, z: 60, dest: { name: 'Kino', x: -56, z: -57 } });
  const car = fleet.cars.find((c) => c.booker === 'anna')!;
  fleet.message(anna, { t: 'waymo.cancel' });
  assert.equal(car.mode, 'cruise');
  assert.equal(car.booker, undefined);
  fleet.message(anna, { t: 'waymo.book', x: -84, z: 60, dest: { name: 'Kino', x: -56, z: -57 } });
  const again = fleet.cars.find((c) => c.booker === 'anna')!;
  run(t, fleet, waymoEta(again) + 200);
  assert.equal(again.booker, undefined, 'still waiting after 3 minutes');
  assert.match(warned.at(-1)!, /gewartet/);
  fleet.message(ben, { t: 'waymo.book', x: 50, z: -60, dest: { name: 'Gym', x: 72, z: 36 } });
  fleet.gone('ben');
  assert.ok(!fleet.cars.some((c) => c.booker === 'ben'));
});

test('names, initials and destinations', () => {
  assert.equal(initialsOf('Florian Obermeier'), 'FO');
  assert.equal(initialsOf('flogge'), 'FL');
  assert.deepEqual(destOf({ name: 'Kino', x: 1, z: 2 }), { name: 'Kino', x: 1, z: 2 });
  for (const bad of [null, {}, { name: 1, x: 0, z: 0 }, { name: 'a', x: NaN, z: 0 }, { name: 'a', x: 5000, z: 0 }]) assert.equal(destOf(bad), null);
});
