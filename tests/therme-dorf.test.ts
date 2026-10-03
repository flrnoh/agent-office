import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ZONES, inT, type TFixture, type TRect } from '../src/shared/therme.js';
import { thermeFixtures, thermeWhereabouts } from '../src/shared/therme-all.js';
import {
  AUFGUSS_EVERY, AUFGUSS_LATE, AUFGUSS_ORDER, AUFGUSS_RUN, DOOR_WIDTH, JETTY, KNEIPP, KNEIPP_FLOOR, PLUNGE, POND, POND_POOL, RUHEHAUS, SAUNAS, aufgussAt, aufgussPlan, dorfSeats, innerOf, saunaAt, stoveOf,
} from '../src/shared/therme-dorf.js';
import { overPool } from '../src/shared/swim.js';
import { Therme } from '../src/server/therme/index.js';

// The Saunadorf (flrnoh fork, see FORK.md "The thermal baths", phase 5): its huts round the pond,
// every one walked into, every seat sat on, the Aufguss plan by the office's clock and its bonus.

const BODY = 0.3;
const FX = thermeFixtures();
const overlap = (a: TRect, b: TRect) => a.minX < b.maxX - 1e-9 && b.minX < a.maxX - 1e-9 && a.minZ < b.maxZ - 1e-9 && b.minZ < a.maxZ - 1e-9;
const blocks = (f: TFixture, y: number) => f.top > y + 0.05 && (f.bottom ?? 0) < y + 1.7;
const free = (x: number, z: number, y = 0) => !FX.some((f) => blocks(f, y) && x + BODY > f.minX && x - BODY < f.maxX && z + BODY > f.minZ && z - BODY < f.maxZ);
/** What you stand on at (x, z): the highest top at or under your knees. */
const ground = (x: number, z: number) => Math.max(-9, ...FX.filter((f) => inT(f, x, z, -1e-6) && f.top <= 0.31).map((f) => f.top));

/** On foot from the door in from the Thermenparadies, on a 0.25 m grid, stepping no more than 0.3 m. */
const walk = (() => {
  const D = ZONES.dorf;
  const S = 0.25;
  const seen = new Map<string, number>();
  const k = (x: number, z: number) => `${Math.round(x / S)},${Math.round(z / S)}`;
  const start: [number, number] = [D.maxX - 1, 74];
  seen.set(k(...start), 0);
  const q = [start];
  while (q.length) {
    const [x, z] = q.pop()!;
    const y0 = seen.get(k(x, z))!;
    for (const [dx, dz] of [[S, 0], [-S, 0], [0, S], [0, -S]]) {
      const nx = x + dx;
      const nz = z + dz;
      if (nx < D.minX || nx > D.maxX + 2 || nz < D.minZ || nz > D.maxZ || seen.has(k(nx, nz))) continue;
      const y = ground(nx, nz);
      if (y < -0.5 || Math.abs(y - y0) > 0.31 || !free(nx, nz, Math.max(y, y0))) continue;
      seen.set(k(nx, nz), y);
      q.push([nx, nz]);
    }
  }
  return (x: number, z: number) => seen.has(k(x, z));
})();

test('the huts stand in the village, apart, clear of the water and of the way in', () => {
  const huts = [...SAUNAS.map((s) => ({ id: s.id, box: s.box })), { id: 'ruhe', box: RUHEHAUS.box }];
  for (const h of huts) {
    assert.ok(h.box.minX >= ZONES.dorf.minX && h.box.maxX <= ZONES.dorf.maxX - 1 && h.box.minZ >= ZONES.dorf.minZ && h.box.maxZ <= ZONES.dorf.maxZ, `${h.id} is outside the village`);
    for (const w of [POND, PLUNGE, KNEIPP]) assert.ok(!overlap(h.box, w), `${h.id} stands in the water`);
    for (const o of huts) if (o !== h) assert.ok(!overlap(h.box, o.box), `${h.id} overlaps ${o.id}`);
  }
  assert.equal(SAUNAS.length, 7);
});

test('on foot from the door: into every sauna up to its stove, the Ruhehaus, the jetty, through the Kneipp trough', () => {
  for (const s of SAUNAS) {
    const r = innerOf(s.box);
    const d = s.door;
    const outside = d.side === 'n' ? [d.at, s.box.minZ - 0.6] : d.side === 's' ? [d.at, s.box.maxZ + 0.6] : d.side === 'w' ? [s.box.minX - 0.6, d.at] : [s.box.maxX + 0.6, d.at];
    assert.ok(walk(outside[0], outside[1]), `up to ${s.id}'s door`);
    const st = stoveOf(s);
    const near = [
      [st.minX - 0.6, (st.minZ + st.maxZ) / 2],
      [st.maxX + 0.6, (st.minZ + st.maxZ) / 2],
      [(st.minX + st.maxX) / 2, st.minZ - 0.6],
      [(st.minX + st.maxX) / 2, st.maxZ + 0.6],
    ];
    assert.ok(near.some(([x, z]) => walk(x, z)), `in ${s.id}, up to its stove`);
    assert.ok(r.maxX - r.minX > DOOR_WIDTH);
  }
  const R = innerOf(RUHEHAUS.box);
  assert.ok(walk((R.minX + R.maxX) / 2, (R.minZ + R.maxZ) / 2 + 3), 'into the Ruhehaus');
  assert.ok(walk(JETTY.minX + 0.6, (JETTY.minZ + JETTY.maxZ) / 2), 'out on the jetty');
  assert.ok(walk((KNEIPP.minX + KNEIPP.maxX) / 2, (KNEIPP.minZ + KNEIPP.maxZ) / 2), 'through the Kneipp trough');
  assert.equal(ground((KNEIPP.minX + KNEIPP.maxX) / 2, (KNEIPP.minZ + KNEIPP.maxZ) / 2), KNEIPP_FLOOR);
  assert.ok(!walk((POND.minX + POND.maxX) / 2, POND.minZ + 2), 'the pond is swum in');
  assert.ok(overPool(POND_POOL, (POND.minX + POND.maxX) / 2, POND.minZ + 2) && !overPool(POND_POOL, JETTY.minX + 1, (JETTY.minZ + JETTY.maxZ) / 2));
});

test('every seat is on its bench (or a lounger in the Ruhehaus), with room to sit, under its roof', () => {
  const seats = dorfSeats();
  assert.ok(seats.length > 100, `${seats.length} seats`);
  const ids = new Set<string>();
  for (const s of seats) {
    assert.ok(!ids.has(s.id), `${s.id} twice`);
    ids.add(s.id);
    if (s.pose === 'lie') {
      assert.ok(inT(innerOf(RUHEHAUS.box), s.x, s.z), `${s.id} is in the Ruhehaus`);
      continue;
    }
    const sauna = saunaAt(s.x, s.y, s.z);
    assert.ok(sauna, `${s.id} is in a sauna`);
    // On a bench's top at its height, nothing higher over it there (the tier above stops just behind).
    const under = FX.filter((f) => inT(f, s.x, s.z, -1e-6) && f.id.includes('-tier'));
    assert.ok(under.some((f) => Math.abs(f.top - s.y) < 1e-6), `${s.id} isn't on a bench at ${s.y}`);
    assert.ok(!under.some((f) => f.top > s.y + 1e-6), `${s.id} is under a higher tier`);
    assert.ok(sauna!.height - s.y > 1.0, `${s.id}: no headroom`);
  }
});

test('the Aufguss plan: by the office\'s clock, the arena every other time, the next few', () => {
  assert.equal(AUFGUSS_ORDER.filter((s) => s === 'arena').length * 2, AUFGUSS_ORDER.length);
  for (const id of SAUNAS.map((s) => s.id)) assert.ok(AUFGUSS_ORDER.includes(id), `${id} never has one`);
  const t0 = 100 * AUFGUSS_EVERY;
  const a = aufgussAt(t0 + 1000);
  assert.ok(a.running && a.start === t0);
  assert.ok(!aufgussAt(t0 + AUFGUSS_RUN + 1).running);
  assert.notEqual(aufgussAt(t0).sauna, aufgussAt(t0 + AUFGUSS_EVERY).sauna);
  const plan = aufgussPlan(t0 + 1000, 4);
  assert.equal(plan.length, 4);
  assert.ok(plan[0].running && plan[0].start === t0);
  assert.deepEqual(plan.map((p) => p.start), [t0, t0 + AUFGUSS_EVERY, t0 + 2 * AUFGUSS_EVERY, t0 + 3 * AUFGUSS_EVERY]);
  const later = aufgussPlan(t0 + AUFGUSS_RUN + 1000, 2);
  assert.ok(!later[0].running && later[0].start === t0 + AUFGUSS_EVERY, 'between them, the next one first');
});

test('the office gives the Aufguss\'s bonus once, to whoever is in that sauna while it\'s young', () => {
  const th = new Therme(mkdtempSync(path.join(tmpdir(), 'therme-a-')));
  const t0 = 200 * AUFGUSS_EVERY;
  const a = aufgussAt(t0);
  const s = SAUNAS.find((x) => x.id === a.sauna)!;
  const other = SAUNAS.find((x) => x.id !== a.sauna)!;
  const at = (box: TRect) => ({ x: (box.minX + box.maxX) / 2, y: 0.45, z: (box.minZ + box.maxZ) / 2 });
  const people = [
    { id: 'in', owner: 'account:in', ...at(innerOf(s.box)) },
    { id: 'elsewhere', owner: 'account:else', ...at(innerOf(other.box)) },
    { id: 'pond', owner: 'account:pond', x: 25, y: -1.3, z: 60 },
  ];
  assert.deepEqual(th.aufguss(t0 + 5000, people).map((g) => g.id), ['in']);
  assert.deepEqual(th.aufguss(t0 + 8000, people), [], 'once');
  assert.deepEqual(th.aufguss(t0 + AUFGUSS_LATE + 1000, [{ id: 'late', owner: 'account:late', ...at(innerOf(s.box)) }]), [], 'too late for it');
  const next = t0 + AUFGUSS_EVERY;
  const n = SAUNAS.find((x) => x.id === aufgussAt(next).sauna)!;
  assert.deepEqual(th.aufguss(next + 1000, [{ id: 'in', owner: 'account:in', ...at(innerOf(n.box)) }]).map((g) => g.id), ['in'], 'the next one counts again');
});

test('where you are in the village, in words', () => {
  const arena = SAUNAS.find((s) => s.id === 'arena')!;
  const r = innerOf(arena.box);
  assert.equal(thermeWhereabouts((r.minX + r.maxX) / 2, 0.45, (r.minZ + r.maxZ) / 2), '🔥 in der Aufgussarena');
  const dampf = SAUNAS.find((s) => s.id === 'dampf')!;
  assert.equal(thermeWhereabouts((dampf.box.minX + dampf.box.maxX) / 2, 0, (dampf.box.minZ + dampf.box.maxZ) / 2), '💨 im Dampfbad');
  assert.equal(thermeWhereabouts(25, POND_POOL.surface - POND_POOL.sink, 60), '🧊 im Kaltwasserteich');
  assert.equal(thermeWhereabouts(JETTY.minX + 1, 0, (JETTY.minZ + JETTY.maxZ) / 2), '🪵 auf dem Steg');
  assert.equal(thermeWhereabouts(49, 0, 28), '🛋️ im Ruhehaus');
});
