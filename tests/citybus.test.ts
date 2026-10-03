// flrnoh fork (see FORK.md "Traffic lights and the city bus"): the bus network's lines and named stops,
// the town's buses keeping out of each other's way, the inside of a bus you walk about in, and where
// someone is in one as the office takes it.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LOTS, CROSSINGS, CITY_ROAD, CITY_WALK } from '../src/shared/city.js';
import { BUS_L, BUS_LINES, BUS_PERIOD, BUS_RUNS, BUS_W, DOORS, busCall, nextCalls, nextStop, poseOf } from '../src/shared/citybus.js';
import { LINE_DEFS, STOP_DEFS } from '../src/shared/busnet.js';
import { BODY_R, CABIN_BLOCKS, INSIDE, SEATS, SEAT_REACH, VALIDATORS, doorAt, inCabin, inDoor, standsAt } from '../src/shared/buscabin.js';
import { busRideOf } from '../src/shared/busride.js';
import { FURNITURE, LAMPS } from '../src/shared/streetside.js';
import { landmarkBox } from '../src/shared/landmarks.js';
import { onTankstelle } from '../src/shared/tankstelle.js';
import { BOWLING_BOX } from '../src/shared/bowling.js';
import { VENUE_BOX } from '../src/shared/venue.js';
import { CASINO_BOX } from '../src/shared/casino.js';
import { SOCCER_BOX } from '../src/shared/soccer.js';
import { HALL_BOX } from '../src/shared/hall.js';
import { GYM_STREET_BOX } from '../src/shared/gym.js';
import { GOLF_HOLE, ROAD } from '../src/shared/layout.js';

type Box = { minX: number; maxX: number; minZ: number; maxZ: number };

test('the network: every stop named, on a line, standing clear, and every line round its stops', () => {
  assert.ok(STOP_DEFS.length >= 12);
  assert.equal(new Set(STOP_DEFS.map((s) => s.id)).size, STOP_DEFS.length, 'stop ids are unique');
  for (const s of STOP_DEFS) assert.ok(LINE_DEFS.some((l) => l.stops.includes(s.id)), `nothing calls at ${s.id}`);
  for (const l of LINE_DEFS) assert.equal(new Set(l.stops).size, l.stops.length, `line ${l.no} calls twice at one stop`);
  // The office, its neighbours and the landmarks, as boxes a shelter mustn't stand in.
  const places: [string, Box][] = [
    ['bowling', BOWLING_BOX],
    ['venue', VENUE_BOX],
    ['casino', CASINO_BOX],
    ['soccer', SOCCER_BOX],
    ['hall', HALL_BOX],
    ['gym', GYM_STREET_BOX],
    ['golf', { minX: GOLF_HOLE.fairway[0], maxX: GOLF_HOLE.fairway[1], minZ: ROAD.maxZ + 2.3, maxZ: GOLF_HOLE.z + GOLF_HOLE.green }],
    ...(['tankstelle', 'kino', 'baumarkt'] as const).map((id) => [id, landmarkBox(id)] as [string, Box]),
  ];
  const stops = FURNITURE.filter((f) => f.stop);
  assert.equal(stops.length, STOP_DEFS.length, 'every stop stands on its strip');
  assert.ok(!FURNITURE.some((f) => f.kind === 'bus' && !f.stop), 'no stray bus stops');
  for (const f of stops) {
    const name = f.stop!.id;
    const r = f.stop!.pole ? 0.3 : 1.7;
    for (const l of LOTS) assert.ok(!(Math.abs(f.x - l.x) < l.w / 2 + r && Math.abs(f.z - l.z) < l.d / 2 + r), `${name} stands in a building`);
    for (const [what, b] of places) assert.ok(!(f.x > b.minX - r && f.x < b.maxX + r && f.z > b.minZ - r && f.z < b.maxZ + r), `${name} stands in the ${what}`);
    assert.ok(!onTankstelle(f.x, f.z), `${name} stands in the petrol station's way`);
    for (const l of LAMPS) assert.ok(Math.hypot(l.x - f.x, l.z - f.z) > 1.2, `${name} stands on a street lamp`);
    for (const g of FURNITURE) if (g !== f) assert.ok(Math.hypot(g.x - f.x, g.z - f.z) > 2.5, `${name} stands on a ${g.kind}`);
  }
});

test('a bus at its stop stands out of the crossings, with its doors by the sidewalk', () => {
  const half = CITY_ROAD / 2 + CITY_WALK;
  for (const line of BUS_LINES) {
    for (const st of line.stops) {
      // Nose and tail clear of every crossing.
      for (const c of CROSSINGS) {
        for (const k of [-0.5, 0, 0.5]) {
          const yaw = Math.atan2(-(st.doors[0][1] - st.doors[1][1]), st.doors[0][0] - st.doors[1][0]);
          const mid = { x: (st.doors[0][0] + st.doors[1][0]) / 2, z: (st.doors[0][1] + st.doors[1][1]) / 2 };
          const x = mid.x + Math.cos(yaw) * k * BUS_L;
          const z = mid.z - Math.sin(yaw) * k * BUS_L;
          assert.ok(!(Math.abs(x - c.x) < half - 1 && Math.abs(z - c.z) < half - 1), `line ${line.no} stands in a crossing at ${st.id}`);
        }
      }
      for (const [x, z] of st.doors) assert.ok(Math.hypot(x - st.f.x, z - st.f.z) < 8, `line ${line.no}'s doors far from ${st.id}`);
    }
  }
});

/** A bus's outline: four corners. */
function outline(x: number, z: number, yaw: number): [number, number][] {
  const fx = Math.cos(yaw);
  const fz = -Math.sin(yaw);
  return [
    [1, 1],
    [1, -1],
    [-1, -1],
    [-1, 1],
  ].map(([a, c]) => [x + (fx * a * BUS_L) / 2 - (fz * c * BUS_W) / 2, z + (fz * a * BUS_L) / 2 + (fx * c * BUS_W) / 2]);
}

function overlap(p: [number, number][], q: [number, number][]): boolean {
  for (const P of [p, q]) {
    for (let i = 0; i < 4; i++) {
      const nx = P[(i + 1) % 4][1] - P[i][1];
      const nz = P[i][0] - P[(i + 1) % 4][0];
      const ps = p.map(([x, z]) => x * nx + z * nz);
      const qs = q.map(([x, z]) => x * nx + z * nz);
      if (Math.max(...ps) < Math.min(...qs) || Math.max(...qs) < Math.min(...ps)) return false;
    }
  }
  return true;
}

test('the town\'s buses never run into each other, and their timetable comes round seamlessly', () => {
  assert.ok(BUS_RUNS.length >= 6);
  for (let t = 0; t < BUS_PERIOD; t += 0.25) {
    const ps = BUS_RUNS.map((r) => poseOf(r, t));
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) {
        if (Math.hypot(ps[i].x - ps[j].x, ps[i].z - ps[j].z) > BUS_L + 1) continue;
        assert.ok(!overlap(outline(ps[i].x, ps[i].z, ps[i].yaw), outline(ps[j].x, ps[j].z, ps[j].yaw)), `${BUS_RUNS[i].line.no}/${BUS_RUNS[i].k} and ${BUS_RUNS[j].line.no}/${BUS_RUNS[j].k} collide at ${t}`);
      }
    }
  }
  for (const r of BUS_RUNS) {
    const rounds = (r.end - r.track[0]) / r.line.length;
    assert.ok(Math.abs(rounds - BUS_PERIOD / r.line.round) < 1e-6, `line ${r.line.no}'s bus ${r.k} isn't back where it started (${rounds} rounds)`);
    const a = poseOf(r, BUS_PERIOD - 0.01);
    const b = poseOf(r, BUS_PERIOD + 0.01);
    assert.ok(Math.hypot(a.x - b.x, a.z - b.z) < 0.3, `line ${r.line.no}'s bus ${r.k} jumps at the end of the period`);
  }
});

test('stops know their next buses, and a bus knows its next stop', () => {
  const t = 1_790_000_123;
  for (const line of BUS_LINES) {
    line.stops.forEach((st, i) => {
      const next = nextCalls(line, i, t, 3);
      assert.equal(next.length, 3);
      for (let k = 1; k < next.length; k++) assert.ok(next[k] >= next[k - 1]);
      assert.ok(next[0] > t - 120 && next[0] < t + BUS_PERIOD, `line ${line.no} at ${st.id}: next at ${next[0] - t}`);
      // The passers-by's view of it agrees.
      const call = busCall(st.f.x, st.f.z, t, t + BUS_PERIOD);
      assert.ok(call && call.leave > call.open);
    });
  }
  // Standing at a stop it says that stop; on the move, the one it comes to next.
  const r = BUS_RUNS[0];
  const c = r.calls[2];
  const at = poseOf(r, (c.arrive + c.leave) / 2);
  assert.deepEqual(nextStop(r.line, at), { i: c.stop, at: true });
  const moving = poseOf(r, c.leave + 5);
  assert.deepEqual(nextStop(r.line, moving), { i: (c.stop + 1) % r.line.stops.length, at: false });
});

test('inside a bus: every seat, validator and door can be got to from the doors', () => {
  // Every place there's room to stand, on a 5 cm grid, joined up from just inside each door.
  const S = 0.05;
  const key = (x: number, z: number) => `${Math.round(x / S)},${Math.round(z / S)}`;
  const seen = new Set<string>();
  const queue: [number, number][] = [];
  for (const k of [0, 1]) {
    const [x, z] = inDoor(k);
    assert.ok(standsAt(x, z), `no room inside door ${k}`);
    queue.push([x, z]);
    seen.add(key(x, z));
  }
  while (queue.length) {
    const [x, z] = queue.pop()!;
    for (const [dx, dz] of [
      [S, 0],
      [-S, 0],
      [0, S],
      [0, -S],
    ]) {
      const nx = x + dx;
      const nz = z + dz;
      if (seen.has(key(nx, nz)) || !standsAt(nx, nz)) continue;
      seen.add(key(nx, nz));
      queue.push([nx, nz]);
    }
  }
  const reach = (x: number, z: number, r: number) => [...seen].some((k) => {
    const [a, b] = k.split(',').map(Number);
    return Math.hypot(a * S - x, b * S - z) < r;
  });
  SEATS.forEach((s, i) => assert.ok(reach(s.x + 0.4 * Math.sin(s.rotY), s.z + 0.4 * Math.cos(s.rotY), SEAT_REACH), `seat ${i} can't be got to`));
  for (const v of VALIDATORS) assert.ok(reach(v.x, v.z, 0.95), 'a validator out of reach');
  // Out of each door, walking at it.
  DOORS.forEach((u, k) => assert.equal(doorAt(u, INSIDE.maxZ - BODY_R), k));
  assert.equal(doorAt(0, -0.5), -1);
  // Nothing in there overlaps another thing's middle, and the aisle's wide enough to walk.
  assert.ok(standsAt(-1, 0.2) && standsAt(2, 0.2) && standsAt(-3.5, 0.2), 'no aisle');
  for (const b of CABIN_BLOCKS) assert.ok(b.minX < b.maxX && b.minZ < b.maxZ);
  assert.ok(seen.size > 500, `${seen.size} places to stand`);
});

test('where someone is in a bus, as the office takes it', () => {
  assert.deepEqual(busRideOf({ run: 1, x: 0.5, z: 0.2, r: 7 }), { run: 1, x: 0.5, z: 0.2, r: Math.round(Math.atan2(Math.sin(7), Math.cos(7)) * 1000) / 1000 });
  assert.equal(busRideOf({ run: 1, x: 0.5, z: 0.2, r: 0, seat: 3 })?.seat, 3);
  for (const bad of [null, 5, 'x', {}, { run: -1, x: 0, z: 0, r: 0 }, { run: BUS_RUNS.length, x: 0, z: 0, r: 0 }, { run: 0.5, x: 0, z: 0, r: 0 }, { run: 0, x: 20, z: 0, r: 0 }, { run: 0, x: 0, z: 3, r: 0 }, { run: 0, x: NaN, z: 0, r: 0 }, { run: 0, x: 0, z: 0, r: Infinity }, { run: 0, x: 0, z: 0, r: 0, seat: SEATS.length }, { run: 0, x: 0, z: 0, r: 0, seat: '1' }]) {
    assert.equal(busRideOf(bad), null, JSON.stringify(bad));
  }
  assert.ok(inCabin(0, 0) && !inCabin(BUS_L, 0));
});
