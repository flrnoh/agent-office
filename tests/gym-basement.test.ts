import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { GYM_ROOM, GYM_STATIONS, type GymServerMsg } from '../src/shared/gym.js';
import {
  BASEMENT_ARRIVAL,
  BASEMENT_FLOOR as B,
  BASEMENT_ROOMS,
  BASEMENT_SEATING,
  BLOCKS,
  BSHOWERS,
  GROTTO_POOL,
  GYM_UNDER,
  KNEIPP,
  LAP_POOL,
  REST,
  SALT,
  SALT_ROOM,
  STAIR,
  STAIRWELL,
  STAIR_FOOT_Z,
  SWIM_SINK,
  THERME_PASSAGE,
  atLapEdge,
  basementFixtures,
  basementRoomAt,
  cutOut,
  gymFloorSlabs,
  inB,
  lapClimbOut,
  laneAt,
  laneZ,
  overLapPool,
  stairSteps,
  type BFixture,
} from '../src/shared/gym-basement.js';
import { WALK_IN_BY_STATION, gymFixtures, walkInAt } from '../src/shared/gym-rooms.js';
import { GYM_CHANNELS, GYM_DEFAULT_CHANNEL, GYM_DEFAULT_VOLUME, GYM_RADIO, GYM_RADIO_COOLDOWN_MS, GYM_VOLUME_MAX, type GymRadioView } from '../src/shared/gym-radio.js';
import { TOWEL_SHELF } from '../src/shared/gym-rooms.js';
import { WELLNESS_SPOTS, type WellnessView } from '../src/shared/gym-wellness.js';
import { SEATING_BY_ID, seatHere, seatPlace } from '../src/shared/layout.js';
import { Gym, type GymPlayer } from '../src/server/gym/index.js';

// The gym's basement (flrnoh fork): a stair down from the spa through a hole in the floor, a foyer, a
// quiet room, a salt grotto, a Kneipp room, and a pool hall with a lap pool and a whirlpool grotto.
// The plan is walkable from the stair's foot, its rooms know who's in them by where (and how far down)
// they are, and Gym FM changes station for everyone.

const RADIUS = 0.32; // client/player: how wide you are
const STEP = 0.3; // the tallest ledge you walk up or down
const HEIGHT = 1.7;

const touches = (f: BFixture, x: number, z: number, r = RADIUS) => {
  const nx = Math.min(Math.max(x, f.minX), f.maxX);
  const nz = Math.min(Math.max(z, f.minZ), f.maxZ);
  return (x - nx) ** 2 + (z - nz) ** 2 < r * r;
};

/** Down in the basement: the floor under (x, z), as the highest walkable surface whose top is near the basement's floor. */
function groundAt(fixtures: BFixture[], x: number, z: number): number | null {
  let g: number | null = null;
  for (const f of fixtures) {
    if (f.top > B + 0.65 || f.top < B - 1.0) continue;
    if (x < f.minX || x > f.maxX || z < f.minZ || z > f.maxZ) continue;
    if (g === null || f.top > g) g = f.top;
  }
  return g;
}

/** Whether you fit standing at (x, z) on `ground`: nothing taller than a step in the way at your height. */
function fits(fixtures: BFixture[], x: number, z: number, ground: number): boolean {
  return !fixtures.some((f) => f.top > ground + STEP + 0.01 && (f.bottom ?? B) < ground + HEIGHT && touches(f, x, z));
}

/** Everywhere you can walk to from the stair's foot, on a 10 cm grid. */
function walkable(): (x: number, z: number) => boolean {
  const fx = basementFixtures();
  const box = { minX: 3.5, maxX: 40.5, minZ: 39.5, maxZ: 88.5 };
  const step = 0.1;
  const nx = Math.ceil((box.maxX - box.minX) / step);
  const nz = Math.ceil((box.maxZ - box.minZ) / step);
  const cell = (x: number, z: number) => [Math.round((x - box.minX) / step), Math.round((z - box.minZ) / step)] as const;
  const ground = new Float32Array(nx * nz).fill(Number.NaN);
  const seen = new Uint8Array(nx * nz);
  const at = (i: number) => {
    if (Number.isNaN(ground[i]) && !seen[i]) {
      const x = box.minX + (i % nx) * step;
      const z = box.minZ + Math.floor(i / nx) * step;
      const g = groundAt(fx, x, z);
      ground[i] = g !== null && fits(fx, x, z, g) ? g : Number.NEGATIVE_INFINITY;
    }
    return ground[i];
  };
  const [sx, sz] = cell(BASEMENT_ARRIVAL.x, BASEMENT_ARRIVAL.z);
  const start = sx + sz * nx;
  assert.ok(Number.isFinite(at(start)), 'you can stand at the stair foot');
  const queue = [start];
  seen[start] = 1;
  while (queue.length) {
    const i = queue.pop()!;
    const g = ground[i];
    const ix = i % nx;
    const iz = Math.floor(i / nx);
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const jx = ix + dx;
      const jz = iz + dz;
      if (jx < 0 || jz < 0 || jx >= nx || jz >= nz) continue;
      const j = jx + jz * nx;
      if (seen[j]) continue;
      const h = at(j);
      if (!Number.isFinite(h) || Math.abs(h - g) > STEP + 0.01) continue;
      seen[j] = 1;
      queue.push(j);
    }
  }
  return (x, z) => {
    const [ix, iz] = cell(x, z);
    return !!seen[ix + iz * nx];
  };
}

test('the stair: a step of 0.3 at a time from the gym floor to the basement, inside its hole in the floor', () => {
  const steps = stairSteps();
  assert.equal(steps.length, STAIR.steps - 1);
  let last = 0;
  for (const s of steps) {
    assert.ok(Math.abs(last - s.top - STAIR.rise) < 1e-9, `${s.id} is one step down`);
    assert.ok(s.minX >= STAIRWELL.minX && s.maxX <= STAIRWELL.maxX && s.minZ >= STAIRWELL.minZ && s.maxZ <= STAIRWELL.maxZ, `${s.id} is under the hole`);
    last = s.top;
  }
  assert.ok(Math.abs(last - STAIR.rise - B) < 1e-9, 'the last step is one above the basement floor');
  assert.ok(Math.abs(STAIR_FOOT_Z - steps.at(-1)!.maxZ) < 1e-9);
  // Up in the spa: nothing of the gym stands in the hole but its rail.
  for (const f of gymFixtures()) if (!f.id.startsWith('stair-rail')) assert.ok(!(f.minX < STAIRWELL.maxX && f.maxX > STAIRWELL.minX && f.minZ < STAIRWELL.maxZ && f.maxZ > STAIRWELL.minZ), `${f.id} keeps out of the stairwell`);
  // The gym's floor is there everywhere but over the stair.
  const slabs = gymFloorSlabs();
  const onSlab = (x: number, z: number) => slabs.some((s) => x > s.minX && x < s.maxX && z > s.minZ && z < s.maxZ);
  assert.ok(!onSlab((STAIRWELL.minX + STAIRWELL.maxX) / 2, (STAIRWELL.minZ + STAIRWELL.maxZ) / 2), 'open over the stair');
  for (let x = GYM_ROOM.minX + 0.2; x < GYM_ROOM.maxX; x += 0.5)
    for (let z = GYM_ROOM.minZ + 0.2; z < GYM_ROOM.maxZ; z += 0.5) if (!inB(STAIRWELL, x, z)) assert.ok(onSlab(x, z), `floor at ${x.toFixed(1)}, ${z.toFixed(1)}`);
});

test('cutOut leaves exactly the rectangle minus its holes', () => {
  const r = { minX: 0, maxX: 10, minZ: 0, maxZ: 6 };
  const holes = [
    { minX: 2, maxX: 4, minZ: 1, maxZ: 3 },
    { minX: 6, maxX: 12, minZ: 4, maxZ: 8 },
  ];
  const parts = cutOut(r, holes);
  const area = parts.reduce((a, p) => a + (p.maxX - p.minX) * (p.maxZ - p.minZ), 0);
  assert.equal(area, 60 - 4 - 8);
  for (let x = 0.25; x < 10; x += 0.5)
    for (let z = 0.25; z < 6; z += 0.5) {
      const holed = holes.some((h) => inB(h, x, z));
      const covered = parts.filter((p) => inB(p, x, z)).length;
      assert.equal(covered, holed ? 0 : 1, `${x}, ${z}`);
    }
});

test('from the stair foot you can walk everywhere down there', () => {
  const reach = walkable();
  const spots: [string, number, number][] = [
    ['the foyer', 25.5, 52],
    ['the quiet room', 20.0, 46.0],
    ['the aquarium', 9.4, 47.0],
    ['the salt grotto', 33.6, 44.1],
    ['the brine pump', SALT_ROOM.pour!.x - 0.4, SALT_ROOM.pour!.z],
    ['into the Kneipp trough (east end)', KNEIPP.maxX - 0.4, (KNEIPP.minZ + KNEIPP.maxZ) / 2],
    ['into the Kneipp trough (west end)', KNEIPP.minX + 0.4, (KNEIPP.minZ + KNEIPP.maxZ) / 2],
    ...BSHOWERS.map((s): [string, number, number] => [`the ${s.name} shower`, s.x, s.z]),
    ['the north deck', 20, 61],
    ['the south deck', 20, 76],
    ['the west deck', 5.2, 69],
    ['the east deck', 33.2, 69],
    ['behind a starting block', BLOCKS.minX - 0.6, laneZ(1)],
    ['up on a starting block', (BLOCKS.minX + BLOCKS.maxX) / 2, laneZ(2)],
    ['down in the whirlpool', 37.5, 69.0],
    ['in front of the thermal baths door', (THERME_PASSAGE.minX + THERME_PASSAGE.maxX) / 2, THERME_PASSAGE.door - 0.5],
  ];
  for (const [what, x, z] of spots) assert.ok(reach(x, z), `you can walk to ${what}`);
  // And not into the lap pool's water, nor past the closed door to the baths.
  assert.ok(!reach(20, 69), "the lap pool isn't walked on");
  assert.ok(!reach((THERME_PASSAGE.minX + THERME_PASSAGE.maxX) / 2, THERME_PASSAGE.maxZ - 0.2), 'the baths are closed');
  // You can get up off every seat down here.
  for (const s of BASEMENT_SEATING) {
    assert.ok(SEATING_BY_ID.has(s.id), `${s.id} is in SEATING`);
    for (let i = 0; i < s.places.length; i++) {
      const p = seatPlace(s, i);
      assert.ok(seatHere(p.key, false, false, true), `${p.key} is somewhere to sit in the gym`);
      const ahead = p.rotY + (p.out < 0 ? Math.PI : 0);
      const up = [0, 0.6, -0.6, 1.2, -1.2].some((turn) => reach(p.x + Math.sin(ahead + turn) * Math.abs(p.out), p.z + Math.cos(ahead + turn) * Math.abs(p.out)));
      assert.ok(up, `${p.key}: room to get up`);
    }
  }
});

test('the rooms down here know they are down here', () => {
  const mid = (r: { minX: number; maxX: number; minZ: number; maxZ: number }) => [(r.minX + r.maxX) / 2, (r.minZ + r.maxZ) / 2] as const;
  for (const room of BASEMENT_ROOMS) {
    const [x, z] = mid(room.inner);
    assert.equal(basementRoomAt(x, z)?.station, room.station);
    assert.equal(walkInAt(x, z, 0, B)?.station, room.station, `${room.station} by feet on the basement floor`);
    assert.notEqual(walkInAt(x, z)?.station, room.station, `${room.station} isn't up in the gym`);
    assert.ok(GYM_STATIONS.some((s) => s.id === room.station && s.kind === 'wellness'), `${room.station} is a wellness station`);
    assert.ok(WELLNESS_SPOTS[room.machine], `${room.machine} has its spot`);
    assert.equal(WALK_IN_BY_STATION.get(room.station), room);
    for (const id of room.seats) {
      const s = SEATING_BY_ID.get(id)!;
      for (let i = 0; i < s.places.length; i++) assert.equal(basementRoomAt(seatPlace(s, i).x, seatPlace(s, i).z)?.station, room.station, `${id} is inside the ${room.name}`);
    }
  }
  // The salt grotto's under the massage room and the steam room: up there, feet on the gym's floor, it's theirs.
  assert.equal(walkInAt(31.5, 48.4)?.station, 'steam');
  assert.equal(walkInAt(31.5, 48.4, 0, B)?.station, 'kneipp');
  assert.equal(walkInAt(REST.minX + 1, REST.minZ + 1, 0, 0), undefined);
  assert.ok(GYM_UNDER < LAP_POOL.floor - 1, "nothing in the gym is further down than its pools' floors");
});

test('the lap pool: lanes, edges, and climbing out onto the deck (never onto a block)', () => {
  for (let lane = 0; lane < LAP_POOL.lanes; lane++) assert.equal(laneAt(laneZ(lane)), lane);
  assert.ok(LAP_POOL.maxX - LAP_POOL.minX === 25, '25 m');
  const fx = basementFixtures();
  for (let x = LAP_POOL.minX + 0.2; x < LAP_POOL.maxX; x += 0.8)
    for (let z = LAP_POOL.minZ + 0.2; z < LAP_POOL.maxZ; z += 0.8) {
      if (!atLapEdge(x, z)) continue;
      const out = lapClimbOut(x, z);
      assert.ok(!overLapPool(out.x, out.z), `out of the water from ${x.toFixed(1)}, ${z.toFixed(1)}`);
      const g = groundAt(fx, out.x, out.z);
      assert.equal(g, B, `onto the deck from ${x.toFixed(1)}, ${z.toFixed(1)}`);
      assert.ok(fits(fx, out.x, out.z, B), `room to stand from ${x.toFixed(1)}, ${z.toFixed(1)}`);
    }
  // A swimmer is kept in by the deck, which reaches down past their feet.
  const feet = LAP_POOL.surface - SWIM_SINK;
  const deck = fx.filter((f) => f.id.startsWith('bfloor-h'));
  for (const [x, z] of [
    [LAP_POOL.minX - 0.1, 69],
    [LAP_POOL.maxX + 0.1, 69],
    [20, LAP_POOL.minZ - 0.1],
    [20, LAP_POOL.maxZ + 0.1],
  ])
    assert.ok(
      deck.some((f) => inB(f, x, z) && (f.bottom ?? B) < feet && f.top > feet),
      `the wall at ${x}, ${z}`,
    );
  assert.ok(GROTTO_POOL.floor > LAP_POOL.floor, 'the whirlpool is shallow');
});

// ---- The server: who's in, and Gym FM --------------------------------------------------------------

class Peer {
  msgs: GymServerMsg[] = [];
  at: { x: number; y?: number; z: number } = { x: 20, z: 38 };
  player: GymPlayer;
  constructor(
    private gym: Gym,
    id: string,
    owner: string,
    name: string,
  ) {
    this.player = { id, owner, name, send: (m) => this.msgs.push(m), where: () => this.at };
    gym.enter(this.player);
  }
  walk(x: number, z: number, y?: number) {
    this.at = { x, z, ...(y !== undefined ? { y } : {}) };
    this.gym.moved(this.player.id);
  }
  results() {
    return this.msgs.filter((m) => m.t === 'gym.result').map((m) => (m as { text: string }).text);
  }
  station<T>(id: string): T | undefined {
    for (let i = this.msgs.length - 1; i >= 0; i--) {
      const m = this.msgs[i];
      if (m.t === 'gym.station' && m.station === id) return m.state as T;
    }
    return undefined;
  }
}

function withGym(run: (gym: Gym, clock: { t: number }, peer: (id: string, owner: string, name: string) => Peer) => void) {
  const dir = mkdtempSync(path.join(tmpdir(), 'gym-basement-'));
  const clock = { t: Date.UTC(2026, 0, 1, 12, 0, 0) };
  const gym = new Gym(dir, { now: () => clock.t, random: () => 0, manualTick: true });
  try {
    run(gym, clock, (id, owner, name) => new Peer(gym, id, owner, name));
  } finally {
    gym.stop();
    rmSync(dir, { recursive: true, force: true });
  }
}

test('down the stair: the salt grotto, the quiet room and the pool go by where you are and how far down', () => {
  withGym((gym, clock, peer) => {
    const ada = peer('c1', 'account:1', 'Ada');
    gym.fitness.addStamina('account:1', -60);
    // Up in the gym over the salt grotto (the massage room's corner): not in it.
    ada.walk(32.6, 44.1, 0);
    assert.notEqual(gym.roomFor('c1'), 'salt');
    // Down in it.
    ada.walk(32.6, 44.1, B);
    assert.equal(gym.roomFor('c1'), 'salt');
    assert.deepEqual(ada.station<WellnessView>('salt')?.occupants, ['Ada']);
    const before = gym.fitness.stamina('account:1');
    clock.t += 20_000;
    gym.tick();
    assert.ok(gym.fitness.stamina('account:1') > before, 'the salty air gives energy back');
    // The brine pump: a burst of salt mist for everyone in there.
    gym.message('c1', { t: 'gym.act', station: 'salt', action: 'ladle' });
    assert.match(ada.results().at(-1) ?? '', /salt mist/i);
    assert.ok(ada.station<WellnessView>('salt')?.puffAt);
    // Over to the quiet room: out of the grotto, into the quiet.
    ada.walk(15, 48, B);
    assert.equal(gym.roomFor('c1'), 'rest');
    assert.deepEqual(ada.station<WellnessView>('salt')?.occupants, []);
    // Swimming in the lap pool (feet well down in the water) counts as in the pool; standing on the deck doesn't.
    ada.walk(20, 69, LAP_POOL.surface - SWIM_SINK);
    assert.equal(gym.roomFor('c1'), 'lappool');
    ada.walk(20, 62, B);
    assert.equal(gym.roomFor('c1'), undefined);
    // Back up the stair and out: nothing down here holds you.
    ada.walk(25.5, 44, -1.2);
    ada.walk(25.5, 42.8, 0);
    assert.equal(gym.roomFor('c1'), undefined);
  });
});

test('Gym FM: E at the sound system tunes the next station for everyone, a few seconds apart', () => {
  withGym((gym, clock, peer) => {
    const ada = peer('c1', 'account:1', 'Ada');
    const bo = peer('c2', 'account:2', 'Bo');
    assert.equal(bo.station<GymRadioView>(GYM_RADIO.id)?.channel, GYM_DEFAULT_CHANNEL, 'you hear what it plays when you come in');
    gym.message('c1', { t: 'gym.act', station: GYM_RADIO.id, action: 'next' });
    assert.equal(bo.station<GymRadioView>(GYM_RADIO.id)?.channel, GYM_CHANNELS[1].id, 'everyone hears the change');
    assert.equal(bo.station<GymRadioView>(GYM_RADIO.id)?.by, 'Ada');
    assert.match(ada.results().at(-1) ?? '', /Gym FM/);
    gym.message('c2', { t: 'gym.act', station: GYM_RADIO.id, action: 'next' });
    assert.match(bo.results().at(-1) ?? '', /just changed/i, 'not twice in a moment');
    clock.t += GYM_RADIO_COOLDOWN_MS + 1;
    gym.message('c2', { t: 'gym.act', station: GYM_RADIO.id, action: 'tune', data: { channel: 'off' } });
    assert.equal(ada.station<GymRadioView>(GYM_RADIO.id)?.channel, 'off');
    clock.t += GYM_RADIO_COOLDOWN_MS + 1;
    gym.message('c2', { t: 'gym.act', station: GYM_RADIO.id, action: 'tune', data: { channel: 'http://evil.example/' } });
    assert.match(bo.results().at(-1) ?? '', /no such station/i, 'only the built-in stations');
    gym.message('c2', { t: 'gym.sit', station: GYM_RADIO.id });
    assert.equal(ada.station<GymRadioView>(GYM_RADIO.id)?.channel, 'off');
    for (const c of GYM_CHANNELS) assert.ok(c.url === '' || c.url.startsWith('https://'), `${c.id} streams over https`);
  });
});

test('Gym FM: one volume for everyone, clamped, and the station and volume survive a restart', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'gym-radio-'));
  const clock = { t: Date.UTC(2026, 0, 1, 12, 0, 0) };
  try {
    const gym = new Gym(dir, { now: () => clock.t, random: () => 0, manualTick: true });
    const ada = new Peer(gym, 'c1', 'account:1', 'Ada');
    const bo = new Peer(gym, 'c2', 'account:2', 'Bo');
    assert.equal(bo.station<GymRadioView>(GYM_RADIO.id)?.volume, GYM_DEFAULT_VOLUME);
    gym.message('c1', { t: 'gym.act', station: GYM_RADIO.id, action: 'volume', data: { volume: 1.5 } });
    assert.equal(bo.station<GymRadioView>(GYM_RADIO.id)?.volume, 1.5, 'everyone hears it louder');
    assert.equal(bo.station<GymRadioView>(GYM_RADIO.id)?.volumeBy, 'Ada');
    gym.message('c2', { t: 'gym.act', station: GYM_RADIO.id, action: 'volume', data: { volume: 99 } });
    assert.equal(ada.station<GymRadioView>(GYM_RADIO.id)?.volume, GYM_VOLUME_MAX, 'never past the top');
    gym.message('c2', { t: 'gym.act', station: GYM_RADIO.id, action: 'volume', data: { volume: 'loud' } });
    assert.match(bo.results().at(-1) ?? '', /no such volume/i);
    gym.message('c2', { t: 'gym.act', station: GYM_RADIO.id, action: 'tune', data: { channel: 'bass' } });
    gym.stop();
    const again = new Gym(dir, { now: () => clock.t, random: () => 0, manualTick: true });
    const cy = new Peer(again, 'c3', 'account:3', 'Cy');
    assert.equal(cy.station<GymRadioView>(GYM_RADIO.id)?.channel, 'bass', 'the station after a restart');
    assert.equal(cy.station<GymRadioView>(GYM_RADIO.id)?.volume, GYM_VOLUME_MAX, 'the volume after a restart');
    again.stop();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the towel shelf stands clear of the stair's way down", () => {
  const w = STAIRWELL;
  const approach = { minX: w.minX, maxX: 29.0, minZ: 42.15, maxZ: w.minZ };
  const overlaps = (a: typeof w, b: typeof w) => a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
  assert.ok(!overlaps(TOWEL_SHELF, approach), 'not where you walk up to the stair');
  assert.ok(!overlaps(TOWEL_SHELF, { ...w, minX: w.minX - 0.5, maxZ: w.maxZ + 0.3 }), 'not by the stairwell');
});
