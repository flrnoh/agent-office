import test from 'node:test';
import assert from 'node:assert/strict';
import { STAGE_HEIGHT, VENUE, VENUE_BOX, VENUE_DOOR, VENUE_DOOR_INSIDE, VENUE_ENTRY, VENUE_ROOM, VENUE_STREET_SPOT, WING_DOOR, ZONES, INSTRUMENT_SPOTS, type Zone } from '../src/shared/venue.js';
import {
  ANNOUNCE_COOLDOWN_MS,
  BACKSTAGE_DOOR,
  BAR_MENU,
  BAR_SPOT,
  BEER_GARDEN,
  DOCK,
  FX_COOLDOWN_MS,
  GARDEROBE_SPOT,
  KASSE_SPOT,
  LIGHTS_COOLDOWN_MS,
  MERCH_SPOT,
  MODE_COOLDOWN_MS,
  MODE_LIGHTS,
  RIDER_MENU,
  STAGE_STAIRS,
  STAIRS_LANDING,
  TOUR_BUS,
  YARD,
  houseSolids,
  sofaSeats,
  stairSteps,
  venueWhereabouts,
  walkways,
} from '../src/shared/venue-house.js';
import { BLOCKS, CROSSING_HALF, CROSSINGS, LOTS, PARK_TREES, STREETS, stretchRect } from '../src/shared/city.js';
import { FURNITURE, LAMPS } from '../src/shared/streetside.js';
import { SHOPS } from '../src/shared/shops.js';
import { BUS_LINES } from '../src/shared/citybus.js';
import { LIT } from '../src/shared/traffic-lights.js';
import { CASINO_BOX } from '../src/shared/casino.js';
import { HALL_BOX } from '../src/shared/hall.js';
import { SOCCER_BOX } from '../src/shared/soccer.js';
import { GYM_STREET_BOX } from '../src/shared/gym.js';
import { BOWLING_BOX } from '../src/shared/bowling.js';
import { ROAD } from '../src/shared/layout.js';
import { FARM, LOOP_PAVED, nearLoop } from '../src/shared/scenic.js';
import { LANDMARKS, landmarkBox } from '../src/shared/landmarks.js';
import { DRINK_BY_ID } from '../src/shared/rooftop.js';
import { heldAnywhere } from '../src/shared/fridge.js';
import { VenueHouse, backInVenue, venueView } from '../src/server/venue/place.js';
import { PLACES, backInPlace } from '../src/server/fork/office.js';
import { GUEST_MSGS } from '../src/server/guests.js';
import { PARTY_MSGS, PARTY_SEES_MSGS } from '../src/server/party.js';
import type { FloorView } from '../src/shared/protocol.js';

// flrnoh fork (see FORK.md "The Schallwerk"): the building's part: the house on its lot across the
// street, nothing of the city in it or against it, its doors on the street, the house inside in its
// zones with the ways clear, the place, concert or club and the light desk, the stamp, the cloakroom
// and the merch, guests and party guests.

const overlap = (a: Zone, b: Zone, pad = 0) => a.minX < b.maxX + pad && b.minX < a.maxX + pad && a.minZ < b.maxZ + pad && b.minZ < a.maxZ + pad;
const within = (a: Zone, b: Zone) => a.minX >= b.minX - 1e-9 && a.maxX <= b.maxX + 1e-9 && a.minZ >= b.minZ - 1e-9 && a.maxZ <= b.maxZ + 1e-9;
const inBox = (x: number, z: number, b: Zone, pad = 0) => x > b.minX - pad && x < b.maxX + pad && z > b.minZ - pad && z < b.maxZ + pad;
/** The house and everything of it outside: the beer garden, the bus, the dock. */
const LOT: Zone[] = [VENUE_BOX, ...YARD];

test('nothing of the city stands on its lot or against it', () => {
  for (const b of LOT) {
    for (const l of LOTS) assert.ok(!overlap({ minX: l.x - l.w / 2, maxX: l.x + l.w / 2, minZ: l.z - l.d / 2, maxZ: l.z + l.d / 2 }, b, 1), `a building of the city at (${l.x}, ${l.z})`);
    for (const s of SHOPS) assert.ok(!overlap(s.rect, b, 1), `shop ${s.i} on it`);
    for (const t of PARK_TREES) assert.ok(!inBox(t.x, t.z, b, 1), 'a park tree on it');
    for (const f of FURNITURE) assert.ok(!inBox(f.x, f.z, b, 1.4), `${f.kind} at (${f.x.toFixed(1)}, ${f.z.toFixed(1)})`);
    for (const l of LAMPS) assert.ok(!inBox(l.x, l.z, b, 0.5), `a street lamp at (${l.x}, ${l.z})`);
    for (const s of STREETS) assert.ok(!overlap(stretchRect(s), b), 'a street through it');
    for (const c of CROSSINGS) assert.ok(!inBox(c.x, c.z, b, CROSSING_HALF + 1), 'a crossing on it');
    for (const l of LIT) assert.ok(!inBox(l.c.x, l.c.z, b, CROSSING_HALF + 1), 'traffic lights in it');
    for (const line of BUS_LINES) for (let i = 0; i < line.xs.length; i++) assert.ok(!inBox(line.xs[i], line.zs[i], b, 1.5), `the ${line.no} drives through it`);
  }
  assert.ok(!BLOCKS.some((b) => b.kind === 'city' && Math.abs(b.x - (VENUE_BOX.minX + VENUE_BOX.maxX) / 2) < 28 && Math.abs(b.z - (VENUE_BOX.minZ + VENUE_BOX.maxZ) / 2) < 28), 'its block is no city block');
});

test('the house, its garden, bus and dock keep off the road, the loop, the farm and the other places', () => {
  for (const b of LOT) {
    assert.ok(b.minZ > ROAD.maxZ, 'off the office street');
    for (let x = b.minX; x <= b.maxX; x += 0.5)
      for (let z = b.minZ; z <= b.maxZ; z += 0.5) {
        const at = nearLoop(x, z);
        assert.ok(!at || at.off > LOOP_PAVED + 0.2, `on the loop's tarmac at (${x}, ${z})`);
      }
    for (const f of [...FARM.fields, FARM.pasture]) assert.ok(!overlap(b, f, 0.5), 'in the farm');
    assert.ok(Math.hypot(Math.max(0, FARM.barn.x - b.maxX), Math.max(0, b.minZ - FARM.barn.z, FARM.barn.z - b.maxZ)) > 8, 'against the barn');
    for (const [name, o] of [
      ['the casino', CASINO_BOX],
      ['the padel hall', HALL_BOX],
      ['the soccer hall', SOCCER_BOX],
      ['the gym', GYM_STREET_BOX],
      ['the bowling centre', BOWLING_BOX],
      ...LANDMARKS.map((l) => [l.id, landmarkBox(l.id)] as const),
    ] as const)
      assert.ok(!overlap(o as Zone, b, 1), `${name} overlaps it`);
  }
  // The garden, the bus and the dock against the house, not in it.
  assert.ok(BEER_GARDEN.maxZ <= VENUE_BOX.minZ && TOUR_BUS.maxZ <= VENUE_BOX.minZ && DOCK.minX >= VENUE_BOX.maxX);
});

test('its doors face the street, and you come out in front of them with nothing in the way', () => {
  assert.ok(VENUE_DOOR.x - VENUE_DOOR.width / 2 > VENUE_BOX.minX && VENUE_DOOR.x + VENUE_DOOR.width / 2 < VENUE_BOX.maxX);
  assert.ok(Math.abs(VENUE_STREET_SPOT.x - VENUE_DOOR.x) < 0.5);
  assert.ok(VENUE_STREET_SPOT.z < VENUE_BOX.minZ - 0.5 && VENUE_STREET_SPOT.z > ROAD.maxZ, 'in front of the house, off the road');
  assert.equal(VENUE_STREET_SPOT.rotY, Math.PI, 'facing the street');
  for (const y of YARD) assert.ok(!inBox(VENUE_STREET_SPOT.x, VENUE_STREET_SPOT.z, y, 1.5), 'the garden or the bus in front of the doors');
  for (const f of FURNITURE) assert.ok(Math.hypot(f.x - VENUE_STREET_SPOT.x, f.z - VENUE_STREET_SPOT.z) > 2, 'nothing in front of the doors');
});

test('inside, the house stands in its own zones, and the ways stay clear', () => {
  for (const s of houseSolids()) {
    assert.ok(within(s.box, ZONES[s.zone]), `${s.id} is outside the ${s.zone}`);
    for (const w of walkways()) assert.ok(!overlap(s.box, w.box), `${s.id} is in ${w.id}`);
    for (const sp of INSTRUMENT_SPOTS) assert.ok(!inBox(sp.x, sp.z, s.box, 0.5), `${s.id} is on the instrument spot ${sp.id}`);
  }
  for (const w of walkways()) assert.ok(within(w.box, VENUE_ROOM), `${w.id} is outside the room`);
  // Where you stand to be served is free floor.
  for (const spot of [KASSE_SPOT, GARDEROBE_SPOT, MERCH_SPOT, BAR_SPOT]) for (const s of houseSolids()) assert.ok(!inBox(spot.x, spot.z, s.box, 0.25), `${s.id} is where you stand at ${JSON.stringify(spot)}`);
  for (const seat of sofaSeats()) assert.ok(inBox(seat.x, seat.z, ZONES.backstage), `${seat.key} is backstage`);
  // The doors and the entrance.
  assert.ok(inBox(VENUE_DOOR_INSIDE.x, VENUE_DOOR_INSIDE.z, ZONES.foyer) && inBox(VENUE_ENTRY.x, VENUE_ENTRY.z, ZONES.foyer));
  // The wing's door into the foyer and the artists' door into backstage, both in the wing's wall.
  assert.equal(BACKSTAGE_DOOR.x, ZONES.wing.maxX);
  assert.ok(BACKSTAGE_DOOR.z - BACKSTAGE_DOOR.width / 2 > ZONES.backstage.minZ + 0.3 && BACKSTAGE_DOOR.z + BACKSTAGE_DOOR.width / 2 < ZONES.backstage.maxZ);
  assert.ok(Math.abs(BACKSTAGE_DOOR.z - WING_DOOR.z) > 10);
});

test('the stairs climb from backstage to the riser at the stage’s back edge, a step at a time', () => {
  const steps = stairSteps();
  assert.equal(steps.length, STAGE_STAIRS.steps - 1);
  let prev = 0;
  for (const s of steps) {
    assert.ok(s.top - prev <= 0.3 + 1e-9, 'a step too high to walk up');
    assert.ok(within(s, ZONES.backstage));
    prev = s.top;
  }
  assert.ok(STAIRS_LANDING.top - prev <= 0.3 + 1e-9);
  assert.equal(STAIRS_LANDING.top, STAGE_HEIGHT);
  assert.equal(STAIRS_LANDING.minZ, ZONES.stage.maxZ, 'the landing meets the riser');
  assert.ok(STAGE_STAIRS.minX > ZONES.stage.minX && STAGE_STAIRS.maxX < ZONES.stage.maxX, 'up onto the stage, not the DJ booth');
  // Clear of the stage's instruments at its back edge.
  for (const sp of INSTRUMENT_SPOTS) if (sp.room === 'hall') assert.ok(Math.hypot(Math.max(0, STAGE_STAIRS.minX - sp.x, sp.x - STAGE_STAIRS.maxX), ZONES.stage.maxZ - sp.z) > 1.5, `${sp.id} by the stairs`);
});

test('the bar and the rider serve what can be held anywhere: beer, mate, Spezi, longdrinks, a shot, water', () => {
  for (const id of [...BAR_MENU, ...RIDER_MENU]) {
    assert.ok(DRINK_BY_ID.has(id), `${id} is a drink`);
    assert.ok(heldAnywhere(id), `${id} is held anywhere`);
  }
  const strengths = BAR_MENU.map((id) => DRINK_BY_ID.get(id)!.strength);
  assert.ok(strengths.some((s) => s > 0.4), 'a shot');
  assert.ok(strengths.some((s) => s < 0), 'water');
  for (const id of ['zwickl', 'mate', 'spezi', 'gintonic', 'obstler', 'sprudel'] as const) assert.ok(BAR_MENU.includes(id), id);
});

test('it is a place: the view on arrival, and back in after a reload while there is a street', () => {
  assert.ok((PLACES as readonly string[]).includes(VENUE));
  assert.equal(venueView({ floor: 'x' } as FloorView).floor, VENUE);
  assert.equal(backInVenue(VENUE, 1), true);
  assert.equal(backInVenue(VENUE, 0), false);
  assert.equal(backInVenue('elsewhere', 2), false);
  assert.equal(backInPlace(VENUE, 2), VENUE);
  assert.equal(backInPlace(VENUE, 0), undefined);
});

test('the house: one mode for everyone, rate-limited; the light desk; the effects reload', () => {
  let now = 100_000;
  const house = new VenueHouse({ now: () => now });
  const ann = { id: 'a', owner: 'name:Ann', name: 'Ann', inside: true };
  assert.equal(house.state([]).mode, 'konzert');
  assert.equal(house.message({ ...ann, inside: false }, { t: 'venue.mode', mode: 'club' }), null, 'only from inside');
  assert.deepEqual(house.message(ann, { t: 'venue.mode', mode: 'club' }), { everyone: { t: 'venue.mode', mode: 'club', lights: MODE_LIGHTS.club, by: 'Ann' } });
  assert.equal(house.message(ann, { t: 'venue.mode', mode: 'club' }), null, 'already a club');
  now += MODE_COOLDOWN_MS / 2;
  assert.ok('warn' in (house.message(ann, { t: 'venue.mode', mode: 'konzert' }) ?? {}), 'not straight back');
  now += MODE_COOLDOWN_MS;
  assert.equal(house.current, 'club');
  assert.equal(house.message(ann, { t: 'venue.mode', mode: 'disco' as never }), null);
  // The light desk: a scene, the lasers; nothing that isn't one; not faster than its cooldown.
  assert.deepEqual(house.message(ann, { t: 'venue.lights', scene: 'rot' }), { inside: { t: 'venue.lights', lights: { scene: 'rot', laser: true, ball: true }, by: 'Ann' } });
  assert.equal(house.message(ann, { t: 'venue.lights', scene: 'rot' }), null);
  assert.ok('warn' in (house.message(ann, { t: 'venue.lights', laser: false }) ?? {}));
  now += LIGHTS_COOLDOWN_MS;
  assert.deepEqual(house.message(ann, { t: 'venue.lights', laser: false }), { inside: { t: 'venue.lights', lights: { scene: 'rot', laser: false, ball: true }, by: 'Ann' } });
  assert.equal(house.message(ann, { t: 'venue.lights', scene: 'disco' as never }), null);
  // Switching the mode puts the lights back to the mode's.
  now += MODE_COOLDOWN_MS;
  house.message(ann, { t: 'venue.mode', mode: 'konzert' });
  assert.deepEqual(house.state([]).lights, MODE_LIGHTS.konzert);
  // Effects: off once, then loading; a running one goes to whoever comes in.
  assert.deepEqual(house.message(ann, { t: 'venue.fx', fx: 'co2' }), { inside: { t: 'venue.fx', fx: 'co2', at: now, by: 'Ann' } });
  assert.ok('warn' in (house.message(ann, { t: 'venue.fx', fx: 'co2' }) ?? {}));
  assert.deepEqual(house.state([]).fx, [{ fx: 'co2', at: now }]);
  now += FX_COOLDOWN_MS.co2;
  assert.ok('inside' in (house.message(ann, { t: 'venue.fx', fx: 'co2' }) ?? {}));
  assert.equal(house.message(ann, { t: 'venue.fx', fx: 'feuer' as never }), null);
  // Announcements: one of the house's, one at a time.
  assert.deepEqual(house.message(ann, { t: 'venue.announce', n: 1 }), { inside: { t: 'venue.announce', text: 'Letzte Runde an der Bar!', by: 'Ann' } });
  assert.ok('warn' in (house.message(ann, { t: 'venue.announce', n: 2 }) ?? {}));
  now += ANNOUNCE_COOLDOWN_MS;
  assert.equal(house.message(ann, { t: 'venue.announce', n: 99 }), null);
});

test('the stamp, the cloakroom and the merch: kept per person, seen by everyone, back after a reload', () => {
  let now = 5_000_000;
  const house = new VenueHouse({ now: () => now });
  const ann = { id: 'a', owner: 'account:ann', name: 'Ann', inside: true };
  const ben = { id: 'b', owner: 'account:ben', name: 'Ben', inside: true };
  assert.equal(house.message({ ...ann, inside: false }, { t: 'venue.stamp' }), null);
  assert.deepEqual(house.message(ann, { t: 'venue.stamp' }), { everyone: { t: 'venue.wear', id: 'a', wear: { stamp: true } } });
  const coat = house.message(ann, { t: 'venue.coat', in: true });
  assert.ok(coat && 'everyone' in coat && coat.everyone.t === 'venue.wear' && typeof coat.everyone.wear.coat === 'number');
  assert.equal(house.message(ann, { t: 'venue.coat', in: true }), null, 'one coat each');
  const benCoat = house.message(ben, { t: 'venue.coat', in: true });
  assert.ok(benCoat && 'everyone' in benCoat && benCoat.everyone.t === 'venue.wear');
  assert.notEqual((benCoat.everyone as { wear: { coat?: number } }).wear.coat, (coat.everyone as { wear: { coat?: number } }).wear.coat, 'two tickets, two numbers');
  assert.deepEqual(house.message(ann, { t: 'venue.merch', item: 'hoodie' }), { everyone: { t: 'venue.wear', id: 'a', wear: { stamp: true, shirt: 'hoodie', coat: (coat.everyone as { wear: { coat?: number } }).wear.coat } } });
  assert.equal(house.message(ann, { t: 'venue.merch', item: 'cape' as never }), null);
  // A reload: a new peer id for the same person, and it's all still theirs.
  const wear = house.state([{ id: 'a2', owner: 'account:ann' }, { id: 'c', owner: 'name:Cem' }]).wear;
  assert.deepEqual(Object.keys(wear), ['a2']);
  assert.equal(wear.a2.shirt, 'hoodie');
  // The coat back, the shirt off; the stamp washes off after the night.
  assert.ok(house.message(ann, { t: 'venue.coat', in: false }));
  assert.ok(house.message(ann, { t: 'venue.merch', item: null }));
  assert.deepEqual(house.wearOf('account:ann'), { stamp: true });
  now += 9 * 3600_000;
  assert.deepEqual(house.wearOf('account:ann'), {});
});

test('guests and party guests may do all of it, and see it', () => {
  for (const t of ['venue.mode', 'venue.lights', 'venue.fx', 'venue.announce', 'venue.stamp', 'venue.coat', 'venue.merch', 'venue.hello']) {
    assert.ok(GUEST_MSGS.has(t), `${t} for guests`);
    assert.ok(PARTY_MSGS.has(t), `${t} for party guests`);
  }
  for (const t of ['venue.mode', 'venue.lights', 'venue.fx', 'venue.announce', 'venue.wear', 'venue.house']) assert.ok(PARTY_SEES_MSGS.has(t), `party guests see ${t}`);
});

test('where you are in there, in words', () => {
  assert.equal(venueWhereabouts(VENUE_ENTRY.x, 0, VENUE_ENTRY.z), '🎟️ im Foyer');
  assert.equal(venueWhereabouts(BAR_SPOT.x + 1, 0, BAR_SPOT.z), '🍺 an der Bar');
  assert.equal(venueWhereabouts(2, 0, 0), '🤘 vor der Bühne');
  assert.equal(venueWhereabouts(2, STAGE_HEIGHT, 8), '🎤 auf der Bühne');
  assert.equal(venueWhereabouts(0, 0, 14), '🛋️ Backstage');
  assert.equal(venueWhereabouts(-20, 0, -5), '🥁 im Proberaum 1');
  assert.equal(venueWhereabouts(-20, 0, 13), '🎙️ im Studio');
  assert.equal(venueWhereabouts(1, 0, -7.5), '🎛️ am Mischpult');
});

test('a gig starting turns the house into its kind, whatever the light desk’s cooldown', () => {
  let now = 50_000;
  const house = new VenueHouse({ now: () => now });
  const ann = { id: 'a', owner: 'name:Ann', name: 'Ann', inside: true };
  house.message(ann, { t: 'venue.mode', mode: 'club' });
  now += 100;
  assert.deepEqual(house.gigStarts('konzert', 'Kernel Panik'), { t: 'venue.mode', mode: 'konzert', lights: MODE_LIGHTS.konzert, by: 'Kernel Panik' });
  assert.equal(house.gigStarts('konzert', 'Again'), null, 'already a concert');
  assert.equal(house.current, 'konzert');
});
