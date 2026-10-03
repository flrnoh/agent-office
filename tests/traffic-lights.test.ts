// flrnoh fork (see FORK.md "Traffic lights and the city bus"): the traffic lights, the city's cars at
// them, the buses' timetables, and the passers-by crossing on the green man and getting on the bus.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RUNS } from '../src/shared/city.js';
import { BUS_L, BUS_LINES, BUS_PERIOD, BUS_RUNS, DWELL, busCall, poseOf } from '../src/shared/citybus.js';
import { EPOCH, SLOTS, planFor } from '../src/shared/passersby.js';
import { onRoad } from '../src/shared/sidewalks.js';
import { CYCLE, LIT, STOP_AT, lampAt, lightLimit, walkAt, type Axis } from '../src/shared/traffic-lights.js';

const T0 = 1_790_000_000;

test('the lights: at the busier crossings, the same for everyone, and never green both ways', () => {
  assert.ok(LIT.length >= 10, `${LIT.length} crossings with lights`);
  for (const l of LIT) {
    assert.ok([l.c.north, l.c.south, l.c.east, l.c.west].filter(Boolean).length >= 3, 'lights only where three or four ways meet');
    for (let t = T0; t < T0 + CYCLE * 2; t += 0.25) {
      const x = lampAt(l, 'x', t);
      const z = lampAt(l, 'z', t);
      assert.equal(lampAt(l, 'x', t + CYCLE * 7), x, 'the same phase a whole number of cycles on');
      assert.ok(x === 'red' || x === 'redamber' || z === 'red' || z === 'redamber', `both roads moving at ${t} (${x}, ${z})`);
      // The green man across a road only while that road's cars stand.
      for (const road of ['x', 'z'] as Axis[]) if (walkAt(l, road, t)) assert.ok(['red', 'redamber'].includes(lampAt(l, road, t)), `the green man over ${road} with its cars on ${lampAt(l, road, t)}`);
    }
  }
});

/** Where the stop lines are along a run going `dir`, with their crossing. */
function stopLines(run: (typeof RUNS)[number], dir: number) {
  return LIT.filter((l) => Math.abs((run.alongX ? l.c.z : l.c.x) - run.line) < 0.5 && (run.alongX ? l.c.east || l.c.west : l.c.north || l.c.south)).map((l) => ({ l, at: (run.alongX ? l.c.x : l.c.z) - dir * STOP_AT }));
}

test('the city’s cars never put their front past a stop line at red', () => {
  let stops = 0;
  let passes = 0;
  for (const run of RUNS) {
    for (const dir of [1, -1]) {
      const lines = stopLines(run, dir);
      if (!lines.length) continue;
      for (const start of [0, 13, 27]) {
        // Drive it the way world/town/traffic.ts does: speed up to its cruise, brake for the light ahead.
        let front = dir > 0 ? run.from + 6 : run.to - 6;
        let v = 10;
        let t = T0 + start;
        let stood = false;
        for (let k = 0; k < 4000 && (front - run.from) * (run.to - front) > 0; k++) {
          const dt = 0.05;
          const lim = lightLimit(run.alongX, run.line, dir, front, v, t);
          const want = Math.max(0, Math.min(12, (lim - 0.05) * 1.1));
          v += Math.max(-9 * dt, Math.min(3 * dt, want - v));
          const next = front + dir * Math.min(v * dt, lim);
          for (const s of lines) {
            if ((s.at - front) * dir >= 0 && (s.at - next) * dir < 0) {
              const lamp = lampAt(s.l, run.alongX ? 'x' : 'z', t + dt);
              assert.ok(lamp === 'green' || lamp === 'amber', `a car over the line on ${lamp}`);
              passes++;
            }
          }
          if (v < 0.05 && !stood) {
            stood = true;
            stops++;
          } else if (v > 1) stood = false;
          front = next;
          t += dt;
        }
      }
    }
  }
  assert.ok(stops > 10 && passes > 10, `${stops} stops at red, ${passes} lines crossed`);
});

test('the buses: on the streets, at their stops with the doors open, keeping to the lights, and the same timetable for everyone', () => {
  assert.ok(BUS_LINES.length >= 3);
  assert.equal(BUS_PERIOD % CYCLE, 0, 'the timetable is a whole number of light cycles');
  for (const line of BUS_LINES) {
    assert.ok(line.stops.length >= 4, `line ${line.no} stops somewhere`);
    assert.ok(Number.isInteger(BUS_PERIOD / line.round), `line ${line.no}: a whole number of rounds`);
    for (let i = 0; i < line.xs.length; i++) assert.ok(onRoad(line.xs[i], line.zs[i]), `line ${line.no} off the road at (${line.xs[i].toFixed(1)}, ${line.zs[i].toFixed(1)})`);
    // It comes past the office's front.
    assert.ok(Array.from(line.zs).some((z, i) => Math.abs(z - 27) < 3 && Math.abs(line.xs[i]) < 10), `line ${line.no} past the office`);
  }
  for (const r of BUS_RUNS) {
    const { line } = r;
    for (const t of [T0, T0 + 33.3, T0 + 101]) assert.deepEqual(poseOf(r, t), poseOf(r, t + BUS_PERIOD * 3));
    // Every stop every round, for its dwell, with the doors open in the middle of it.
    assert.equal(r.calls.length, line.stops.length * (BUS_PERIOD / line.round), `line ${line.no}'s bus ${r.k} misses a stop`);
    for (const c of r.calls) {
      assert.ok(c.leave - c.arrive >= DWELL - 0.01);
      const p = poseOf(r, (c.arrive + c.leave) / 2);
      assert.equal(p.doors, 1);
      assert.equal(p.stop, c.stop);
      assert.ok(Math.abs(((p.s % line.length) + line.length) % line.length - line.stops[c.stop].s) < 0.5, 'standing where its stop is');
      const f = line.stops[c.stop].f;
      assert.ok(Math.hypot(p.x - f.x, p.z - f.z) < 9, 'beside the shelter');
    }
    // Over the stop lines only on green or amber, and doors shut while it moves.
    for (let u = 0; u < BUS_PERIOD; u += 0.25) {
      const a = poseOf(r, u);
      const b = poseOf(r, u + 0.25);
      if (a.speed > 0.3) assert.equal(a.doors, 0, 'doors open on the move');
      for (const g of line.gates) {
        const fa = (((a.s + BUS_L / 2) % line.length) + line.length) % line.length;
        const fb = (((b.s + BUS_L / 2) % line.length) + line.length) % line.length;
        if (fa <= g.s + 0.01 && fb > g.s + 0.02 && fb - fa < 10) {
          const lamp = lampAt(g.l, g.axis, u + 0.25);
          assert.ok(lamp === 'green' || lamp === 'amber', `line ${line.no} over a stop line on ${lamp}`);
        }
      }
    }
  }
});

test('passers-by cross where there are lights only on the green man, and get on the bus at its door', () => {
  let lit = 0;
  let boarded = 0;
  let alighted = 0;
  for (const s of SLOTS) {
    for (let e = 8_950_000; e < 8_950_000 + 6; e++) {
      const p = planFor(s, e, 1);
      if (!p) continue;
      for (const l of p.legs) {
        if (l.act !== 'cross') continue;
        const mx = (l.ax + l.bx) / 2;
        const mz = (l.az + l.bz) / 2;
        const at = LIT.find((q) => Math.hypot(q.c.x - mx, q.c.z - mz) < 8);
        if (!at) continue;
        lit++;
        const road: Axis = Math.abs(l.bz - l.az) > Math.abs(l.bx - l.ax) ? 'x' : 'z';
        assert.ok(walkAt(at, road, l.t0 + 1e-6), `across on red at ${l.t0}`);
      }
      const last = p.legs[p.legs.length - 1];
      if (onRoad(last.bx, last.bz)) {
        // Their last step is into a bus standing there with its doors open.
        boarded++;
        const bus = BUS_RUNS.map((r) => poseOf(r, p.end)).find((b) => Math.hypot(b.x - last.bx, b.z - last.bz) < BUS_L / 2 + 2);
        assert.ok(bus && bus.doors > 0.5, 'onto a bus that is there, doors open');
      }
      const first = p.legs[0];
      if (onRoad(first.ax, first.az)) {
        alighted++;
        const bus = BUS_RUNS.map((r) => poseOf(r, p.start)).find((b) => Math.hypot(b.x - first.ax, b.z - first.az) < BUS_L / 2 + 2);
        assert.ok(bus && bus.doors > 0.5, 'off a bus that is there, doors open');
      }
      assert.ok(p.end - p.start <= EPOCH - 6);
    }
  }
  assert.ok(lit > 20, `${lit} crossings at lights`);
  assert.ok(boarded > 0, `${boarded} got on a bus`);
  assert.ok(alighted > 0, `${alighted} got off one`);
  // The bus's calls, as the passers-by see them.
  const st = BUS_LINES[0].stops[0];
  const call = busCall(st.f.x, st.f.z, T0, T0 + 1000);
  assert.ok(call && call.open >= T0 && call.leave > call.open);
});
