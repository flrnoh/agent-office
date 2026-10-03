import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BULLI_DRIVE, BULLI_HEIGHT, BULLI_SEATS, mayTake } from '../src/shared/bulli.js';
import { CAR, CARS, DRIVE, carFits, carPoint, drive, heightOf, hipsOf, onPavement, overlaps, seatsOf, steerLimit, tuningOf, type Box, type CarPose, type DriveTuning, type Pedals } from '../src/shared/garage.js';
import { DESTINATIONS, destinationAt, reachable } from '../src/shared/destinations.js';
import { FLOOR, WALL_T } from '../src/shared/layout.js';
import { Garage } from '../src/server/garage.js';
import { CarKeys } from '../src/server/carkeys.js';

const BULLI = CARS.findIndex((c) => c.kind === 'bulli');
const def = CARS[BULLI];

function tmp(t: TestContext): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ao-carkeys-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** What the server does with a car.enter (server.ts): the keys first, then a free seat. */
function enter(g: Garage, keys: CarKeys, who: { id: string; account?: string; admin: boolean }, car: number, seat: 'driver' | 'passenger'): boolean {
  if (!mayTake(CARS[car], seat, keys.mayDrive(who.account, who.admin))) return false;
  return g.enter(who.id, car, seat);
}

test("there's exactly one Bulli, owned, with FLOGGE on its plates", () => {
  assert.ok(BULLI >= 0);
  assert.equal(CARS.filter((c) => c.kind === 'bulli').length, 1);
  assert.equal(def.owned, true);
  assert.equal(def.plate, 'FLOGGE');
  assert.equal(def.name, "Flogge's Bulli");
  assert.ok(CARS.filter((c) => c.kind !== 'bulli').every((c) => !c.owned), "the supercars stay anyone's");
});

test("only keyholders take an owned car's wheel; anyone rides along, and any other car is anyone's", () => {
  assert.ok(mayTake(def, 'driver', true));
  assert.ok(!mayTake(def, 'driver', false));
  assert.ok(mayTake(def, 'passenger', false));
  assert.ok(mayTake(CARS[0], 'driver', false));
  assert.ok(mayTake(undefined, 'driver', false), 'no such car: the garage says no to that itself');
});

test('the keys: every admin (and the shared password) by default, else only the accounts named', (t) => {
  const dir = tmp(t);
  const keys = new CarKeys(dir);
  assert.deepEqual(keys.list(), []);
  assert.ok(keys.mayDrive('flo', true), 'an admin');
  assert.ok(keys.mayDrive(undefined, true), 'the shared office password');
  assert.ok(!keys.mayDrive('ann', false), 'a member');
  keys.set(['flo']);
  assert.ok(keys.mayDrive('flo', true));
  assert.ok(keys.mayDrive('flo', false), 'even made a member, they keep their keys');
  assert.ok(!keys.mayDrive('boss', true), 'another admin no longer');
  assert.ok(!keys.mayDrive(undefined, true), 'nor the shared password');
  // `agent-office car keys` writes the file while the office runs: the office's copy sees it.
  new CarKeys(dir).set(['ann', 'bob']);
  assert.deepEqual(keys.list(), ['ann', 'bob']);
  keys.set([]);
  assert.ok(keys.mayDrive('boss', true), 'back to the admins');
  writeFileSync(path.join(dir, 'car-keys.json'), '{ broken');
  assert.ok(keys.mayDrive('boss', true) && !keys.mayDrive('ann', false), 'an unreadable file falls back to the admins, not to anyone');
});

test('the office: the owner drives the Bulli, a member is refused the wheel but may ride along', (t) => {
  const keys = new CarKeys(tmp(t));
  keys.set(['flo']);
  const g = new Garage();
  const ann = { id: 'c-ann', account: 'ann', admin: false };
  const flo = { id: 'c-flo', account: 'flo', admin: true };
  assert.ok(!enter(g, keys, ann, BULLI, 'driver'), 'not her Bulli');
  assert.equal(g.state()[BULLI].driver, undefined);
  assert.ok(enter(g, keys, ann, BULLI, 'passenger'), 'but she can wait in it');
  assert.ok(enter(g, keys, flo, BULLI, 'driver'));
  const pose = { x: def.x, z: 0, rotY: 0, speed: 99, steer: 0 };
  assert.equal(g.drive('c-flo', BULLI, pose)?.speed, BULLI_DRIVE.top, 'no faster than a Bulli goes');
  assert.equal(g.drive('c-ann', BULLI, pose), undefined, "the passenger doesn't steer");
  // Flo gets out: Ann still can't slide over behind the wheel.
  g.leave('c-flo');
  assert.ok(!enter(g, keys, ann, BULLI, 'driver'));
  assert.ok(enter(g, keys, ann, 0, 'driver'), "the Lambos are anyone's");
});

/** The garage's columns and walls, as world/outside.ts puts them up. */
function garageSolids(): Box[] {
  const B = { minX: FLOOR.minX - WALL_T, maxX: FLOOR.maxX + WALL_T, minZ: FLOOR.minZ - WALL_T, maxZ: FLOOR.maxZ + WALL_T };
  const cols: [number, number][] = [];
  for (const x of [B.maxX - 0.25, -9.6, 0, 9.6]) cols.push([x, B.maxZ - 0.25], [x, 0]);
  cols.push([B.maxX - 0.25, -6.5], [B.maxX - 0.25, 6.5], [B.maxX - 0.25, B.minZ + 0.25]);
  return [
    { minX: B.minX, maxX: B.maxX, minZ: B.minZ, maxZ: B.minZ + WALL_T },
    { minX: B.minX, maxX: B.minX + WALL_T, minZ: B.minZ, maxZ: B.maxZ },
    ...cols.map(([x, z]) => ({ minX: x - 0.25, maxX: x + 0.25, minZ: z - 0.25, maxZ: z + 0.25 })),
  ];
}

/** Car `i`'s footprint where it's parked, as a box round it. */
function footprint(i: number): Box {
  const c = CARS[i];
  const a = carPoint(c, -CAR.width / 2, -CAR.length / 2);
  const b = carPoint(c, CAR.width / 2, CAR.length / 2);
  return { minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minZ: Math.min(a.z, b.z), maxZ: Math.max(a.z, b.z) };
}

test('its spot: in the garage, clear of every other car, the walls and the columns, and it can drive straight out', () => {
  const others = CARS.map((_, i) => i).filter((i) => i !== BULLI).map(footprint);
  const solids = [...garageSolids(), ...others];
  assert.ok(onPavement(def));
  assert.ok(def.x > FLOOR.minX && def.x < FLOOR.maxX && def.z > FLOOR.minZ && def.z < FLOOR.maxZ, 'under the building');
  assert.ok(carFits(def, solids), 'room to park');
  for (const i of CARS.keys()) if (i !== BULLI) assert.ok(!overlaps(CARS[i], footprint(BULLI)), `clear of the ${CARS[i].name}`);
  // Nose out to the aisle down the middle, with room to turn there.
  for (let z = def.z; z <= -3; z += 0.25) assert.ok(carFits({ ...def, z }, solids), `out at z ${z}`);
  assert.equal(def.rotY, 0, 'backed in, facing the street: its front plate and V to the aisle');
});

test('its seats are in it, up front and high; it stands tall', () => {
  for (const s of Object.values(seatsOf(BULLI))) {
    assert.ok(Math.abs(s.x) < CAR.width / 2 && Math.abs(s.z) < CAR.length / 2);
    assert.ok(s.z > 0.5, 'in the cab over the front wheels');
  }
  assert.equal(seatsOf(BULLI), BULLI_SEATS);
  assert.ok(hipsOf(BULLI) > hipsOf(0));
  assert.ok(heightOf(BULLI).roof > heightOf(0).roof + 0.5);
  assert.ok(BULLI_HEIGHT.roof < 3.3 - 0.9, 'under the garage ceiling with room to spare');
});

const GAS: Pedals = { gas: 1, turn: 0, brake: false };
function run(p: CarPose, pedals: Pedals, seconds: number, t: DriveTuning): CarPose {
  for (let s = 0; s < seconds; s += 1 / 60) p = drive(p, pedals, 1 / 60, t);
  return p;
}
const still = (): CarPose => ({ x: 0, z: 0, rotY: 0, speed: 0, steer: 0 });

test('it drives like a Bulli: slower off the line than the supercars, then on to 200 km/h, and it turns', () => {
  assert.equal(tuningOf(BULLI), BULLI_DRIVE);
  assert.equal(tuningOf(0), DRIVE);
  for (const k of ['reverse', 'accel', 'brake', 'steerRate'] as const) assert.ok(BULLI_DRIVE[k] < DRIVE[k], `${k} is gentler`);
  assert.ok(Object.values(BULLI_DRIVE).every((v) => Number.isFinite(v) && v > 0));
  const bulli = run(still(), GAS, 2, BULLI_DRIVE);
  const lambo = run(still(), GAS, 2, DRIVE);
  assert.ok(bulli.speed > 3 && bulli.speed < lambo.speed, `slower off the line (${bulli.speed.toFixed(1)} m/s after 2 s)`);
  assert.equal(run(still(), GAS, 20, BULLI_DRIVE).speed, BULLI_DRIVE.top, 'up to its top speed, and no more');
  assert.equal(Math.round(BULLI_DRIVE.top * 3.6), 200, '200 km/h flat out');
  assert.equal(run({ ...still(), speed: BULLI_DRIVE.top }, { ...GAS, brake: true }, 4, BULLI_DRIVE).speed, 0, 'the brakes stop it');
  const radius = (speed: number) => BULLI_DRIVE.wheelbase / Math.tan(steerLimit(speed, BULLI_DRIVE));
  assert.ok(radius(3) < 7, `turns round in the garage (${radius(3).toFixed(1)} m)`);
  assert.ok(radius(BULLI_DRIVE.top) > 60, `no flicking it round flat out (${radius(BULLI_DRIVE.top).toFixed(0)} m)`);
  const left = run({ ...still(), speed: 5 }, { gas: 0.3, turn: 1, brake: false }, 1, BULLI_DRIVE);
  assert.ok(left.rotY > 0.1, 'A turns it left');
});

test('destinations: none yet, and any added must be somewhere a car can get to', () => {
  for (const d of DESTINATIONS) assert.ok(reachable(d), `${d.name} is paved`);
  assert.equal(destinationAt(def.x, def.z), undefined);
});
