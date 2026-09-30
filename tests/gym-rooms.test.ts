import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { GYM_ENTRY, GYM_ROOM, GYM_STATIONS, JUICE_BAR, type GymServerMsg } from '../src/shared/gym.js';
import { AUFGUSS_BOOST, AUFGUSS_BOOST_MS, AUFGUSS_COOLDOWN_MS, BENCH_BONUS, GYM_SEATING, SAUNA, STEAM, WALK_INS, aufgussWait, gymFixtures, inRect, onBenchIn, walkInAt, walkInFactor, type Rect } from '../src/shared/gym-rooms.js';
import { SEATING_BY_ID, seatHere, seatPlace } from '../src/shared/layout.js';
import { Gym, type GymPlayer } from '../src/server/gym/index.js';
import type { WellnessView } from '../src/shared/gym-wellness.js';

// The gym's rooms, spa and fixtures (flrnoh fork): the floor plan leaves the machines and the ways
// in clear, the walk-in sauna and steam room know who's inside by where they stand, their benches
// work a little better, and an Aufguss is one per room every so often.

const RADIUS = 0.32; // client/player.ts: how wide you are
const overlaps = (a: Rect, b: Rect) => a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
/** The machines' footprints, as world/gym/interior.ts collides them (the other gym work owns these). */
const machines: (Rect & { id: string })[] = GYM_STATIONS.filter((s) => s.kind === 'cardio' || s.kind === 'strength').map((s) => {
  const [w, d] = s.kind === 'cardio' ? [1.0, 1.7] : [1.9, 1.5];
  return { id: s.id, minX: s.x - w / 2, maxX: s.x + w / 2, minZ: s.z - d / 2, maxZ: s.z + d / 2 };
});
/** Everything you bump into at standing height (the cabins' roofs and lintels are overhead). */
const solid = () => [...gymFixtures().filter((f) => (f.bottom ?? 0) < 1.5 && f.top > 0.3), ...machines];

/** Whether you fit standing at (x, z). */
function fits(x: number, z: number, obstacles: Rect[] = solid()): boolean {
  if (!inRect(GYM_ROOM, x, z, RADIUS)) return false;
  return !obstacles.some((o) => {
    const nx = Math.min(Math.max(x, o.minX), o.maxX);
    const nz = Math.min(Math.max(z, o.minZ), o.maxZ);
    return (x - nx) ** 2 + (z - nz) ** 2 < RADIUS * RADIUS;
  });
}

/** Everywhere you can walk to from the door, on a 10 cm grid. */
function walkable(): (x: number, z: number) => boolean {
  const step = 0.1;
  const obstacles = solid();
  const nx = Math.ceil((GYM_ROOM.maxX - GYM_ROOM.minX) / step);
  const nz = Math.ceil((GYM_ROOM.maxZ - GYM_ROOM.minZ) / step);
  const cell = (x: number, z: number) => [Math.round((x - GYM_ROOM.minX) / step), Math.round((z - GYM_ROOM.minZ) / step)] as const;
  const seen = new Uint8Array(nx * nz);
  const [sx, sz] = cell(GYM_ENTRY.x, GYM_ENTRY.z);
  const queue = [sx + sz * nx];
  seen[queue[0]] = 1;
  while (queue.length) {
    const i = queue.pop()!;
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
      if (seen[j] || !fits(GYM_ROOM.minX + jx * step, GYM_ROOM.minZ + jz * step, obstacles)) continue;
      seen[j] = 1;
      queue.push(j);
    }
  }
  return (x, z) => {
    const [ix, iz] = cell(x, z);
    return !!seen[ix + iz * nx];
  };
}

test('nothing of the rooms stands on a machine, and everything stays in the hall', () => {
  for (const f of gymFixtures()) {
    assert.ok(f.minX >= GYM_ROOM.minX - 1e-9 && f.maxX <= GYM_ROOM.maxX + 1e-9 && f.minZ >= GYM_ROOM.minZ - 1e-9 && f.maxZ <= GYM_ROOM.maxZ + 1e-9, `${f.id} is inside`);
    for (const m of machines) assert.ok(!overlaps(f, { minX: m.minX - 0.1, maxX: m.maxX + 0.1, minZ: m.minZ - 0.1, maxZ: m.maxZ + 0.1 }), `${f.id} keeps off ${m.id}`);
  }
  assert.ok(fits(GYM_ENTRY.x, GYM_ENTRY.z), 'where you come in is clear');
});

test('from the door you can walk into the sauna, the steam room and everywhere else', () => {
  const reach = walkable();
  const spots: [string, number, number][] = [
    ['inside the sauna', 31.0, 53.0],
    ['through the sauna door', SAUNA.door.x, SAUNA.door.z],
    ['inside the steam room', 31.5, 48.4],
    ['through the steam door', STEAM.door.x, STEAM.door.z],
    ['the massage room', 30.4, 44.3],
    ['beside the jacuzzi', 28.7, 52.9],
    ['the loungers', 27.2, 44.2],
    ['the juice bar', JUICE_BAR.x + 1.2, JUICE_BAR.z],
    ['the stretch area', 17.8, 51.9],
    ['the turf lane', 20.5, 54.3],
    ['the heavy bag', 11.0, 53.0],
    ['the lockers', 7.3, 39.0],
  ];
  for (const [what, x, z] of spots) assert.ok(reach(x, z), `you can walk to ${what}`);
  // Every cardio and strength machine can be walked up to.
  for (const m of machines) {
    const round = [
      [m.minX - 0.45, (m.minZ + m.maxZ) / 2],
      [m.maxX + 0.45, (m.minZ + m.maxZ) / 2],
      [(m.minX + m.maxX) / 2, m.minZ - 0.45],
      [(m.minX + m.maxX) / 2, m.maxZ + 0.45],
    ];
    assert.ok(
      round.some(([x, z]) => reach(x, z)),
      `you can get to ${m.id}`,
    );
  }
});

test('the cabins are closed but for their doors', () => {
  for (const r of WALK_INS) {
    const walls = gymFixtures().filter((f) => f.id.startsWith(`${r.station}-wall-w`));
    for (let z = r.inner.minZ + 0.05; z < r.inner.maxZ; z += 0.1) {
      const wall = walls.some((f) => z > f.minZ && z < f.maxZ);
      if (Math.abs(z - r.door.z) < r.door.width / 2 - 0.02) assert.ok(!wall, `${r.station}: the door at z ${z.toFixed(2)} is open`);
      else if (Math.abs(z - r.door.z) > r.door.width / 2 + 0.02) assert.ok(wall, `${r.station}: the wall at z ${z.toFixed(2)} is closed`);
    }
    assert.ok(r.door.width > 2 * RADIUS + 0.1, `${r.station}: you fit through the door`);
    assert.ok(fits(r.outer.minX - 0.5, r.door.z) && fits(r.inner.minX + 0.4, r.door.z), `${r.station}: both sides of the door are clear`);
    assert.equal(walkInAt(r.inner.minX + 0.4, r.door.z)?.station, r.station);
    assert.equal(walkInAt(r.outer.minX - 0.5, r.door.z), undefined);
  }
});

test('the benches: in their room, in the gym only, and you can get up off them', () => {
  for (const s of GYM_SEATING) {
    assert.ok(SEATING_BY_ID.has(s.id), `${s.id} is in SEATING`);
    for (let i = 0; i < s.places.length; i++) {
      const p = seatPlace(s, i);
      assert.ok(seatHere(p.key, false, false, true), `${p.key} is somewhere to sit in the gym`);
      assert.equal(seatHere(p.key, false), undefined, `${p.key} not from an office floor`);
      assert.equal(seatHere(p.key, false, true), undefined, `${p.key} not from the padel hall`);
      assert.ok(inRect(GYM_ROOM, p.x, p.z), `${p.key} is in the gym`);
      // Getting up (as player.ts standingSpot does): out in front, or turning a little, clear of
      // anything taller than where your feet go.
      const ahead = p.rotY + (p.out < 0 ? Math.PI : 0);
      const tall = [...gymFixtures().filter((f) => (f.bottom ?? 0) < 1.5 && f.top > p.y + 0.01), ...machines];
      const up = [0, 0.6, -0.6, 1.2, -1.2, Math.PI / 2, -Math.PI / 2].some((turn) => fits(p.x + Math.sin(ahead + turn) * Math.abs(p.out), p.z + Math.cos(ahead + turn) * Math.abs(p.out), tall));
      assert.ok(up, `${p.key}: room to get up`);
    }
  }
  for (const r of WALK_INS)
    for (const id of r.seats) {
      const s = SEATING_BY_ID.get(id)!;
      for (let i = 0; i < s.places.length; i++) {
        const p = seatPlace(s, i);
        assert.equal(walkInAt(p.x, p.z)?.station, r.station, `${p.key} is inside the ${r.name}`);
        assert.ok(onBenchIn(r, p.key));
      }
    }
  assert.ok(!onBenchIn(SAUNA, 'gym-steam-e:0'), "the steam room's bench isn't the sauna's");
  assert.ok(!onBenchIn(SAUNA, undefined));
  assert.equal(seatHere('couch:1', false, false, true), undefined, 'no office couch from the gym');
});

test('walkInAt: a little give at the door', () => {
  const r = SAUNA;
  const z = r.door.z;
  assert.equal(walkInAt(r.inner.minX + 0.1, z, 0.25), undefined, 'one step in is not yet in');
  assert.equal(walkInAt(r.inner.minX + 0.4, z, 0.25)?.station, 'sauna');
  assert.equal(walkInAt(r.inner.minX - 0.1, z, -0.2)?.station, 'sauna', 'back in the doorway still counts while you were in');
  assert.equal(walkInAt(Number.NaN, z), undefined);
});

test('the Aufguss: once per room every so often, and its heat wears off', () => {
  const t = 1_000_000;
  assert.equal(aufgussWait(0, t), 0, 'never poured: go ahead');
  assert.equal(aufgussWait(t, t + 1000), AUFGUSS_COOLDOWN_MS - 1000);
  assert.equal(aufgussWait(t, t + AUFGUSS_COOLDOWN_MS), 0);
  assert.equal(walkInFactor(false, 0, t), 1);
  assert.equal(walkInFactor(true, 0, t), BENCH_BONUS);
  assert.equal(walkInFactor(true, t, t + 1000), BENCH_BONUS * AUFGUSS_BOOST);
  assert.equal(walkInFactor(false, t, t + AUFGUSS_BOOST_MS), 1, 'the heat is gone');
});

// ---- The server: who's in, by where they stand ----------------------------------------------------

class Peer {
  msgs: GymServerMsg[] = [];
  at: { x: number; z: number; seat?: string } = { x: GYM_ENTRY.x, z: GYM_ENTRY.z };
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
  walk(x: number, z: number, seat?: string) {
    this.at = { x, z, ...(seat ? { seat } : {}) };
    this.gym.moved(this.player.id);
  }
  results() {
    return this.msgs.filter((m) => m.t === 'gym.result').map((m) => (m as { text: string }).text);
  }
  station(id: string): WellnessView | undefined {
    for (let i = this.msgs.length - 1; i >= 0; i--) {
      const m = this.msgs[i];
      if (m.t === 'gym.station' && m.station === id) return m.state as WellnessView;
    }
    return undefined;
  }
}

function withGym(run: (gym: Gym, clock: { t: number }, peer: (id: string, owner: string, name: string) => Peer) => void) {
  const dir = mkdtempSync(path.join(tmpdir(), 'gym-rooms-'));
  const clock = { t: Date.UTC(2026, 0, 1, 12, 0, 0) };
  const gym = new Gym(dir, { now: () => clock.t, random: () => 0, manualTick: true });
  try {
    run(gym, clock, (id, owner, name) => new Peer(gym, id, owner, name));
  } finally {
    gym.stop();
    rmSync(dir, { recursive: true, force: true });
  }
}

const IN_SAUNA = { x: 31.0, z: 53.0 };
const OUTSIDE = { x: 28.6, z: SAUNA.door.z };

test('walking into the sauna puts you in it; walking out banks your time', () => {
  withGym((gym, clock, peer) => {
    const ada = peer('c1', 'account:1', 'Ada');
    gym.fitness.addStamina('account:1', -60);
    gym.message('c1', { t: 'gym.sit', station: 'sauna' });
    assert.match(ada.results().at(-1) ?? '', /walk in/i, "the sauna isn't sat at from outside");
    assert.deepEqual(ada.station('sauna')?.occupants, []);
    ada.walk(OUTSIDE.x, OUTSIDE.z);
    ada.walk(SAUNA.inner.minX + 0.1, SAUNA.door.z);
    assert.equal(gym.roomFor('c1'), undefined, 'in the doorway, not in yet');
    ada.walk(IN_SAUNA.x, IN_SAUNA.z);
    assert.equal(gym.roomFor('c1'), 'sauna');
    assert.deepEqual(ada.station('sauna')?.occupants, ['Ada']);
    assert.equal(ada.station('sauna')?.walkIn, true);
    const before = gym.fitness.stamina('account:1');
    clock.t += 20_000;
    gym.tick();
    assert.ok(gym.fitness.stamina('account:1') > before, 'energy came back in the heat');
    // A stray gym.stand (a window closing) doesn't take you out while you're standing in there.
    gym.message('c1', { t: 'gym.stand' });
    assert.deepEqual(ada.station('sauna')?.occupants, ['Ada']);
    ada.walk(OUTSIDE.x, OUTSIDE.z);
    assert.deepEqual(ada.station('sauna')?.occupants, [], 'out you are');
    assert.ok(gym.fitness.profile('account:1').totals.relaxSecs >= 1, 'the time in there was banked');
  });
});

test('a bench in the sauna recovers faster than standing about', () => {
  withGym((gym, clock, peer) => {
    const ada = peer('c1', 'account:1', 'Ada');
    const bo = peer('c2', 'account:2', 'Bo');
    gym.fitness.addStamina('account:1', -90);
    gym.fitness.addStamina('account:2', -90);
    const bench = seatPlace(SEATING_BY_ID.get('gym-sauna-low-e')!, 1);
    ada.walk(bench.x, bench.z, bench.key);
    bo.walk(IN_SAUNA.x, IN_SAUNA.z);
    clock.t += 1_000;
    gym.tick(); // starts the room's clock
    const [a0, b0] = [gym.fitness.stamina('account:1'), gym.fitness.stamina('account:2')];
    clock.t += 2_000;
    gym.tick();
    const da = gym.fitness.stamina('account:1') - a0;
    const db = gym.fitness.stamina('account:2') - b0;
    assert.ok(da > db * 1.1, `on the bench ${da.toFixed(2)} > standing ${db.toFixed(2)}`);
  });
});

test('an Aufguss: everyone inside gets the heat, then the stones need a rest', () => {
  withGym((gym, clock, peer) => {
    const ada = peer('c1', 'account:1', 'Ada');
    const bo = peer('c2', 'account:2', 'Bo');
    const cy = peer('c3', 'account:3', 'Cy');
    ada.walk(IN_SAUNA.x, IN_SAUNA.z);
    bo.walk(IN_SAUNA.x + 0.4, IN_SAUNA.z);
    cy.walk(OUTSIDE.x, OUTSIDE.z);
    gym.message('c3', { t: 'gym.act', station: 'sauna', action: 'ladle' });
    assert.match(cy.results().at(-1) ?? '', /step on first/i, 'not from outside the sauna');
    gym.message('c1', { t: 'gym.act', station: 'sauna', action: 'ladle' });
    assert.match(ada.results().at(-1) ?? '', /aufguss/i);
    assert.match(bo.results().at(-1) ?? '', /Ada poured/);
    const puff = ada.station('sauna')?.puffAt;
    assert.ok(puff, 'the steam puffs for everyone in the gym');
    assert.equal(cy.station('sauna')?.puffAt, puff, 'onlookers see it too');
    clock.t += 5_000;
    gym.message('c2', { t: 'gym.act', station: 'sauna', action: 'ladle' });
    assert.match(bo.results().at(-1) ?? '', /still hissing/i, 'one Aufguss per room at a time, whoever pours');
    assert.equal(bo.station('sauna')?.puffAt, puff);
    clock.t += AUFGUSS_COOLDOWN_MS;
    gym.message('c2', { t: 'gym.act', station: 'sauna', action: 'ladle' });
    assert.ok((bo.station('sauna')?.puffAt ?? 0) > puff!, 'and then the next one');
  });
});

test('the steam room is walked into too, and leaving the gym takes you out', () => {
  withGym((gym, _clock, peer) => {
    const ada = peer('c1', 'account:1', 'Ada');
    ada.walk(31.5, 48.4);
    assert.deepEqual(ada.station('steam')?.occupants, ['Ada']);
    // Straight from the steam room into the sauna next door.
    ada.walk(IN_SAUNA.x, IN_SAUNA.z);
    assert.deepEqual(ada.station('steam')?.occupants, []);
    assert.deepEqual(ada.station('sauna')?.occupants, ['Ada']);
    gym.leave('c1');
    const bo = peer('c2', 'account:2', 'Bo');
    assert.deepEqual(bo.station('sauna')?.occupants, []);
  });
});
