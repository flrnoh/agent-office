// flrnoh fork (see FORK.md "The petrol station"): FLOGGE OIL on its block west of the office: its
// paving joins the streets and is paved for the garage's cars (the page's and the office's alike),
// nothing it builds stands in a driveway, a pump's lane or the wash's, the pumps and the wash's marking
// know a car standing at them, the wash's programme runs its course, the office's clock for both,
// and who may use it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CAR, CARS, carFits, onPavement, parked, paved, type CarState } from '../src/shared/garage.js';
import { onCityStreet } from '../src/shared/city.js';
import { onLoop } from '../src/shared/scenic.js';
import { landmarkBox } from '../src/shared/landmarks.js';
import { CANOPY, DRIVEWAYS, PUMPS, STATION, STATION_PAVED, WASH, inStation, inWashHall, onTankstelle, onWashBay, stationSolids } from '../src/shared/tankstelle.js';
import { FILL_MS, PROGRAMME, SHINE_MS, WASH_MS, fuelOf, gantryZ, litersAt, pumpFor, washAt } from '../src/shared/tankstelle-play.js';
import { TANK_ITEMS } from '../src/shared/tankshop.js';
import { heldAnywhere, holdSeconds, isSnack } from '../src/shared/fridge.js';
import { DRINK_BY_ID } from '../src/shared/rooftop.js';
import { Forecourt, Forecourts } from '../src/server/tankstelle.js';
import { Garage } from '../src/server/garage.js';
import { GUEST_MSGS, TEAM_ONLY_MSGS } from '../src/server/guests.js';
import { PARTY_MSGS, PARTY_SEES_MSGS } from '../src/server/party.js';

const solids = stationSolids();
const NORTH = Math.PI;
const SOUTH = 0;

/** Whether a car can drive from `a` to `b` in a straight line, nose along it: on the paving, clear of everything the station builds. */
function drivable(a: { x: number; z: number }, b: { x: number; z: number }) {
  const rotY = Math.atan2(b.x - a.x, b.z - a.z);
  const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.25);
  for (let i = 0; i <= n; i++) {
    const p = { x: a.x + ((b.x - a.x) * i) / n, z: a.z + ((b.z - a.z) * i) / n, rotY };
    assert.ok(onPavement(p), `paved at (${p.x.toFixed(1)}, ${p.z.toFixed(1)})`);
    assert.ok(carFits(p, solids), `nothing in the way at (${p.x.toFixed(1)}, ${p.z.toFixed(1)})`);
  }
}

test('the station stands on its own block, inside its sidewalks', () => {
  assert.deepEqual(STATION, landmarkBox('tankstelle'));
  for (const r of solids) assert.ok(inStation(r.minX, r.minZ) && inStation(r.maxX, r.maxZ), `${JSON.stringify(r)} on the block`);
  for (const r of STATION_PAVED.slice(0, 4)) assert.ok(inStation(r.minX, r.minZ, 0.01) && inStation(r.maxX, r.maxZ, 0.01));
  assert.ok(inStation(CANOPY.minX, CANOPY.minZ) && inStation(CANOPY.maxX, CANOPY.maxZ));
});

test('its paving is paved for the cars, on the page and on the office alike, and the green round it is not', () => {
  for (const r of STATION_PAVED) {
    const x = (r.minX + r.maxX) / 2;
    const z = (r.minZ + r.maxZ) / 2;
    assert.ok(onTankstelle(x, z) && paved(x, z), `(${x}, ${z})`);
  }
  // The grass strip along the east edge, the planter under the pylon, behind the shop.
  for (const [x, z] of [
    [-90.5, 0],
    [-93, 18],
    [-100, -22.5],
  ])
    assert.ok(!paved(x, z), `grass at (${x}, ${z})`);
  // The office drives a car there too: the server's garage takes a move onto the forecourt.
  const g = new Garage();
  assert.ok(g.enter('ann', 0, 'driver'));
  assert.ok(g.drive('ann', 0, { x: -101.4, z: 5, rotY: NORTH, speed: 0, steer: 0 }), 'onto the forecourt');
  assert.ok(g.drive('ann', 0, { x: -128, z: -10, rotY: NORTH, speed: 0, steer: 0 }), 'into the wash');
  assert.equal(g.drive('ann', 0, { x: -93, z: 18, rotY: NORTH, speed: 0, steer: 0 }), undefined, 'not onto the pylon’s planter');
});

test('each driveway joins a street: in off the office’s street, out of the wash onto the city’s', () => {
  const [entry, washIn, north] = DRIVEWAYS;
  const street = (x: number, z: number) => onLoop(x, z) || onCityStreet(x, z) || paved(x, z);
  for (const d of [entry, washIn]) {
    const x = (d.minX + d.maxX) / 2;
    // Its far end is the street's own asphalt, not just the driveway's.
    assert.ok(onLoop(x, 25) || (Math.abs(x) <= 110 && z27(x)), `driveway at x ${x} meets the street`);
    assert.ok(street(x, d.maxZ + 0.5));
  }
  const x = (north.minX + north.maxX) / 2;
  assert.ok(onCityStreet(x, north.minZ + 0.1) && onCityStreet(x, -29), 'the way out meets the north street');
});
const z27 = (x: number) => paved(x, 27) && paved(x, 24);

test('nothing the station builds stands in a driveway, a pump’s lane or the wash’s', () => {
  // In off the office's street to the pumps, along each lane past them, and out.
  drivable({ x: -101.5, z: 26 }, { x: -101.5, z: -2 });
  for (const x of [-116.6, -109, -101.4]) drivable({ x, z: 16 }, { x, z: -2 });
  // In off the street to the wash, along its lane, through the hall over the marking, and out north onto the city's street.
  drivable({ x: -117.5, z: 26 }, { x: -117.5, z: 15 });
  drivable({ x: WASH.lane, z: 16 }, { x: WASH.lane, z: -29 });
  // Round the forecourt in front of the shop.
  drivable({ x: -96, z: -2 }, { x: -119, z: -2 });
  // And none of the solids reaches into a driveway.
  for (const d of DRIVEWAYS) for (const r of solids) assert.ok(r.maxX <= d.minX || r.minX >= d.maxX || r.maxZ <= d.minZ || r.minZ >= d.maxZ, `${JSON.stringify(r)} clear of ${JSON.stringify(d)}`);
});

test('a car beside a pump is at that pump; anywhere else, at none', () => {
  assert.equal(pumpFor({ x: -101.4, z: 5.4, rotY: NORTH }), 2);
  assert.equal(pumpFor({ x: -101.4, z: 9.2, rotY: SOUTH }), 3);
  assert.equal(pumpFor({ x: -116.6, z: 5, rotY: NORTH }), 0);
  assert.equal(pumpFor({ x: -109.6, z: 9, rotY: NORTH }), 1, 'between the islands, the nearer one');
  assert.equal(pumpFor({ x: -101.4, z: 5.4, rotY: Math.PI / 2 }), undefined, 'not across the lane');
  assert.equal(pumpFor({ x: -101.4, z: 14, rotY: NORTH }), undefined, 'not past the island');
  assert.equal(pumpFor({ x: -95, z: 5, rotY: NORTH }), undefined, 'not two lanes over');
  for (const [i, p] of PUMPS.entries()) assert.equal(pumpFor({ x: p.x + 3.6, z: p.z, rotY: NORTH }), i);
  assert.equal(fuelOf(0).id, 'plus');
  assert.equal(fuelOf(CARS.findIndex((c) => c.kind === 'bulli')).id, 'super');
  assert.equal(litersAt(40, 0), 0);
  assert.ok(Math.abs(litersAt(40, FILL_MS) - 40) < 1e-9);
  assert.ok(litersAt(40, FILL_MS / 2) > 15 && litersAt(40, FILL_MS / 2) < 25);
});

test('the wash’s marking, and who’s in the hall', () => {
  assert.ok(onWashBay({ ...WASH.bay }));
  assert.ok(onWashBay({ x: WASH.bay.x + 0.5, z: WASH.bay.z - 1, rotY: SOUTH }), 'backed in counts');
  assert.ok(!onWashBay({ x: WASH.bay.x, z: WASH.bay.z + 3, rotY: NORTH }), 'short of it');
  assert.ok(!onWashBay({ x: WASH.bay.x, z: WASH.bay.z, rotY: Math.PI / 2 }), 'across it');
  assert.ok(inWashHall(WASH.lane + 3, WASH.bay.z));
  assert.ok(!inWashHall(WASH.lane, 5) && !inWashHall(-120, -10));
  // A car on the marking fits between the walls with room for the brushes.
  assert.ok(carFits({ ...WASH.bay }, solids));
  assert.ok(WASH.hall.maxX - WASH.hall.minX - 2 * WASH.wall > CAR.width + 4);
});

test('the wash runs its programme in order, the gantry along the car and back, and ends', () => {
  const seen: string[] = [];
  for (let ms = 0; ms < WASH_MS; ms += 100) {
    const m = washAt(ms);
    if (seen.at(-1) !== m.phase) seen.push(m.phase);
    assert.ok(m.gantry >= 0 && m.gantry <= 1 && m.k >= 0 && m.k < 1);
    const z = gantryZ(m);
    assert.ok(z >= WASH.from - 1e-9 && z <= WASH.to + 1e-9);
  }
  assert.deepEqual(seen, PROGRAMME.map((p) => p.phase));
  assert.equal(washAt(WASH_MS).phase, 'done');
  assert.ok(WASH_MS >= 20_000 && WASH_MS <= 30_000, `${WASH_MS} ms`);
  // The brushes go along the car and come back.
  const brushStart = PROGRAMME.slice(0, 2).reduce((s, p) => s + p.ms, 0);
  const brush = PROGRAMME[2].ms;
  assert.equal(washAt(brushStart).phase, 'brush');
  assert.ok(washAt(brushStart + brush / 2).gantry > 0.95);
  assert.ok(washAt(brushStart + brush - 10).gantry < 0.05);
  // The car under it all the while.
  assert.ok(WASH.from < WASH.bay.z - CAR.length / 2 && WASH.to > WASH.bay.z + CAR.length / 2);
});

/** A floor's cars, car 0 parked at `pose`. */
function cars(pose: Partial<CarState>): CarState[] {
  const all = parked();
  Object.assign(all[0], { speed: 0, steer: 0 }, pose);
  return all;
}

test('the office fills a car up: only one standing at the pump, asked from in it or beside the pump, and lets it go when it’s done', () => {
  let now = 1000;
  const f = new Forecourt(() => now, () => 0.5);
  const atPump = cars({ x: -101.4, z: 5.4, rotY: NORTH });
  assert.match(f.fill({ id: 'ann', x: 0, z: 0 }, 2, 0, atPump) ?? '', /Walk up/);
  assert.match(f.fill({ id: 'ann', inCar: 0, x: 0, z: 0 }, 0, 0, atPump) ?? '', /beside the pump/, 'the wrong pump');
  assert.match(f.fill({ id: 'ann', inCar: 0, x: 0, z: 0 }, 2, 0, cars({ x: -101.4, z: 5.4, rotY: NORTH, speed: 5 })) ?? '', /Stop/, 'still rolling');
  assert.equal(f.fill({ id: 'ann', inCar: 0, x: 0, z: 0 }, 2, 0, atPump), null);
  assert.ok(f.holds(0));
  assert.ok(!f.holds(1));
  assert.match(f.fill({ id: 'bob', x: -104, z: 5 }, 2, 0, atPump) ?? '', /busy/);
  const s = f.state();
  assert.equal(s.fills.length, 1);
  assert.deepEqual({ ...s.fills[0], liters: 0 }, { pump: 2, car: 0, liters: 0, elapsed: 0, by: 'ann' });
  assert.ok(s.fills[0].liters > 10 && s.fills[0].liters < 80);
  assert.equal(f.nextEnd(), FILL_MS);
  now += FILL_MS - 1;
  assert.ok(!f.settle());
  now += 1;
  assert.ok(f.settle());
  assert.ok(!f.holds(0));
  assert.deepEqual(f.state().fills, []);
  // Someone standing at the pump may fill a car that's there.
  assert.equal(f.fill({ id: 'bob', x: -103.5, z: 5 }, 2, 0, atPump), null);
});

test('the office washes a car on the marking: one at a time, held there for the programme, shiny after', () => {
  let now = 0;
  const f = new Forecourt(() => now);
  const inBay = cars({ ...WASH.bay });
  assert.match(f.wash({ id: 'ann', inCar: 0, x: 0, z: 0 }, 0, cars({ x: -101.4, z: 5.4, rotY: NORTH })) ?? '', /marking/);
  assert.match(f.wash({ id: 'ann', x: 0, z: 0 }, 0, inBay) ?? '', /Walk up/);
  assert.equal(f.wash({ id: 'ann', x: WASH.terminal.x + 1, z: WASH.terminal.z }, 0, inBay), null, 'from the terminal');
  assert.ok(f.holds(0));
  assert.match(f.wash({ id: 'bob', inCar: 1, x: 0, z: 0 }, 1, inBay) ?? '', /busy/);
  now = 12_000;
  assert.equal(f.state().wash?.elapsed, 12_000);
  assert.equal(washAt(f.state().wash!.elapsed).phase, 'brush');
  now = WASH_MS;
  assert.ok(f.settle());
  const s = f.state();
  assert.equal(s.wash, null);
  assert.deepEqual(s.shine, [{ car: 0, left: SHINE_MS }]);
  assert.ok(!f.holds(0));
  now += SHINE_MS;
  assert.deepEqual(f.state().shine, []);
});

test('each floor its own station, and a car held there takes no moves', () => {
  let now = 0;
  const changed: string[] = [];
  const all = new Forecourts((id) => changed.push(id), () => new Forecourt(() => now));
  const atPump = cars({ x: -101.4, z: 5.4, rotY: NORTH });
  const res = all.message('a', { id: 'ann', inCar: 0, x: 0, z: 0 }, { t: 'tank.fill', pump: 2, car: 0 }, atPump);
  assert.ok('ok' in res && res.ok.state.fills.length === 1);
  assert.ok(all.holds('a', 0));
  assert.ok(!all.holds('b', 0), 'not on another floor');
  assert.ok(!all.holds(undefined, 0));
  assert.equal(all.view('b'), undefined);
  assert.deepEqual('refused' in all.message('a', { id: 'bob', x: 0, z: 0 }, { t: 'tank.wash', car: 0 }, atPump) ? 'refused' : 'ok', 'refused');
  all.stop();
});

test('everyone may use it, guests and party guests too, and party guests see it', () => {
  for (const t of ['tank.fill', 'tank.wash']) {
    assert.ok(GUEST_MSGS.has(t) && PARTY_MSGS.has(t), t);
    assert.ok(!TEAM_ONLY_MSGS.has(t));
  }
  assert.ok(PARTY_SEES_MSGS.has('tankstelle'));
});

test('what the shop hands you is held like the fridge’s things, anywhere', () => {
  for (const d of TANK_ITEMS) {
    assert.ok(heldAnywhere(d.id), d.id);
    assert.equal(DRINK_BY_ID.get(d.id), d);
    assert.equal(holdSeconds(d), d.seconds);
    assert.equal(isSnack(d), d.bites);
  }
  assert.deepEqual(
    TANK_ITEMS.map((d) => d.id),
    ['tankkaffee', 'schokoriegel', 'tankchips', 'tankenergy', 'bockwurst', 'zeitung'],
  );
});
