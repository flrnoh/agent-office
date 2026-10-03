import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ZONES, inT } from '../src/shared/therme.js';
import { thermeFixtures } from '../src/shared/therme-all.js';
import { BOARD_SIZE, LANDING, LANDING_POOL, LEVELS, LIFT_DOOR, MAX_RIDE_MS, SLIDES, SLIDE_KIOSK, SLIDE_RADIUS, TOWER, lanePath, minRideMs, samplePath, slideGate } from '../src/shared/therme-slides.js';
import { Therme } from '../src/server/therme/index.js';

// The Rutschenwelt (flrnoh fork, see FORK.md "The thermal baths", phase 4): the tower, the seven
// slides clear of each other and of everything else, the landing pool, and the office's clock.

const tracks = () => SLIDES.flatMap((s) => (s.lanes ?? [0]).map((_, l) => ({ id: `${s.id}:${l}`, slide: s.id, pts: samplePath(lanePath(s, l), 0.5) })));
const nearTower = (p: readonly number[]) => p[0] > TOWER.minX - 3 && p[0] < TOWER.maxX + 3 && p[2] > TOWER.minZ - 3 && p[2] < TOWER.maxZ + 3;

test('every slide starts at its platform\'s edge and ends over the landing pool', () => {
  assert.equal(SLIDES.length, 7);
  for (const s of SLIDES)
    for (let l = 0; l < (s.lanes?.length ?? 1); l++) {
      const path = lanePath(s, l);
      const a = path[0];
      const z = path.at(-1)!;
      assert.equal(a[1], LEVELS[s.level], `${s.id} starts at its platform's height`);
      assert.ok(Math.abs(a[0] - TOWER.minX) < 1 || Math.abs(a[0] - TOWER.maxX) < 1 || Math.abs(a[2] - TOWER.minZ) < 1 || Math.abs(a[2] - TOWER.maxZ) < 1, `${s.id} starts at the edge`);
      assert.ok(inT(LANDING, z[0], z[2], 1.5) && z[1] > LANDING_POOL.surface, `${s.id}:${l} ends over the water (${z})`);
      for (const p of samplePath(path, 0.5)) assert.ok(p[0] > ZONES.rutschen.minX + 0.6 && p[0] < ZONES.rutschen.maxX - 0.6 && p[2] > ZONES.rutschen.minZ + 0.6 && p[2] < ZONES.rutschen.maxZ - 0.6, `${s.id} leaves the Rutschenwelt at ${p}`);
    }
});

test('no two slides come near each other (nor a slide near itself, a turn below)', () => {
  const ts = tracks();
  const clear = SLIDE_RADIUS * 2 + 0.3;
  for (let i = 0; i < ts.length; i++)
    for (let j = i + 1; j < ts.length; j++) {
      const sameSlide = ts[i].slide === ts[j].slide; // the racer's lanes run side by side, on purpose
      for (const p of ts[i].pts) {
        if (nearTower(p)) continue;
        for (const q of ts[j].pts) {
          const d = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
          assert.ok(d > (sameSlide ? 1.1 : clear), `${ts[i].id} and ${ts[j].id} meet at ${p.map((v) => v.toFixed(1))} (${d.toFixed(2)} m)`);
        }
      }
    }
  for (const t of ts)
    for (let a = 0; a < t.pts.length; a++)
      for (let b = a + 12; b < t.pts.length; b++) {
        const p = t.pts[a];
        const q = t.pts[b];
        const d = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
        assert.ok(d > clear || Math.abs(b - a) * 0.5 < d * 2, `${t.id} runs into itself at ${p.map((v) => v.toFixed(1))} (${d.toFixed(2)} m)`);
      }
});

test('nothing solid stands in a slide\'s way (only its own platform, where it starts)', () => {
  const solids = thermeFixtures().filter((f) => !f.id.startsWith('slide-') && !f.id.startsWith('floor') && !f.id.startsWith('deck-') && !f.id.startsWith('rail-') && !f.id.startsWith('landing-'));
  for (const t of tracks())
    for (const p of t.pts) {
      if (nearTower(p) && p[1] > 2) continue;
      const hit = solids.find((f) => p[0] > f.minX - 0.3 && p[0] < f.maxX + 0.3 && p[2] > f.minZ - 0.3 && p[2] < f.maxZ + 0.3 && p[1] - SLIDE_RADIUS < f.top && p[1] + SLIDE_RADIUS > (f.bottom ?? 0));
      assert.ok(!hit, `${t.id} runs into ${hit?.id} at ${p.map((v) => v.toFixed(1))}`);
    }
});

test('from the lift\'s door on each platform you walk to every gate on it', () => {
  const fx = thermeFixtures();
  for (const [level, y] of LEVELS.entries()) {
    const deck = fx.filter((f) => f.id.startsWith(`deck-${level}-`));
    const solid = fx.filter((f) => (f.bottom ?? 0) < y + 1.7 && f.top > y + 0.05 && !f.id.startsWith('deck-'));
    const ok = (x: number, z: number) => deck.some((d) => inT(d, x, z, -1e-6)) && !solid.some((f) => x + 0.3 > f.minX && x - 0.3 < f.maxX && z + 0.3 > f.minZ && z - 0.3 < f.maxZ);
    const seen = new Set<string>();
    const k = (x: number, z: number) => `${Math.round(x * 4)},${Math.round(z * 4)}`;
    const q: [number, number][] = [[LIFT_DOOR.x, LIFT_DOOR.z]];
    seen.add(k(LIFT_DOOR.x, LIFT_DOOR.z));
    assert.ok(ok(LIFT_DOOR.x, LIFT_DOOR.z), `the lift's door on level ${level + 1}`);
    while (q.length) {
      const [x, z] = q.pop()!;
      for (const [dx, dz] of [[0.25, 0], [-0.25, 0], [0, 0.25], [0, -0.25]]) {
        const nx = x + dx;
        const nz = z + dz;
        if (seen.has(k(nx, nz)) || !ok(nx, nz)) continue;
        seen.add(k(nx, nz));
        q.push([nx, nz]);
      }
    }
    for (const s of SLIDES.filter((s) => s.level === level)) {
      const g = slideGate(s);
      assert.ok([...seen].some((key) => {
        const [x, z] = key.split(',').map((v) => Number(v) / 4);
        return Math.hypot(x - g.x, z - g.z) < 1.2;
      }), `${s.id}'s gate on level ${level + 1}`);
    }
  }
  assert.ok(!fx.some((f) => f.id !== 'slide-kiosk' && (f.bottom ?? 0) < 1.7 && f.top > 0.05 && SLIDE_KIOSK.x > f.minX - 0.3 && SLIDE_KIOSK.x < f.maxX + 0.3 && SLIDE_KIOSK.z - 1.3 > f.minZ - 0.3 && SLIDE_KIOSK.z - 1.3 < f.maxZ + 0.3), 'room in front of the kiosk');
});

test('the office clocks the rides: too fast is no ride, one row a person, the best kept, over a restart', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'therme-'));
  let now = 1_000_000;
  const th = new Therme(dir, () => now);
  const turbo = SLIDES.find((s) => s.id === 'turbo')!;
  assert.equal(th.finish('a', 'account:a', 'Anna', 'turbo'), null, 'no start, no ride');
  th.start('a', 'turbo');
  now += minRideMs(turbo) - 200;
  assert.deepEqual(th.finish('a', 'account:a', 'Anna', 'turbo'), { warn: 'Das war zu schnell für eine echte Fahrt' });
  now += 5000;
  th.start('a', 'turbo');
  now += 6000;
  const first = th.finish('a', 'account:a', 'Anna', 'turbo');
  assert.deepEqual(first, { ms: 6000, rank: 1, best: 6000, changed: true });
  now += 5000;
  th.start('b', 'turbo');
  now += 5000;
  assert.deepEqual(th.finish('b', 'name:Ben', 'Ben', 'turbo'), { ms: 5000, rank: 1, best: 5000, changed: true });
  now += 5000;
  th.start('a', 'turbo');
  now += 7000;
  assert.deepEqual(th.finish('a', 'account:a', 'Anna', 'turbo'), { ms: 7000, rank: 0, best: 6000, changed: false }, 'slower: the best stays');
  assert.deepEqual(th.boards().turbo?.map((r) => [r.name, r.ms]), [['Ben', 5000], ['Anna', 6000]]);
  // Starting again within a moment is refused; leaving halfway is no ride.
  th.start('a', 'familie');
  assert.ok(th.start('a', 'familie'));
  now += 3000;
  th.leave('a');
  now += 20_000;
  assert.equal(th.finish('a', 'account:a', 'Anna', 'familie'), null);
  th.start('a', 'familie');
  now += MAX_RIDE_MS + 1;
  assert.equal(th.finish('a', 'account:a', 'Anna', 'familie'), null, 'a coffee break is no ride');
  th.stop();
  const saved = JSON.parse(readFileSync(path.join(dir, 'therme.json'), 'utf8'));
  assert.equal(saved.bests.turbo.length, 2);
  const again = new Therme(dir, () => now);
  assert.deepEqual(again.boards().turbo?.map((r) => r.name), ['Ben', 'Anna']);
  // The board keeps ten.
  for (let i = 0; i < 14; i++) {
    now += 5000;
    again.start(`p${i}`, 'turbo');
    now += 8000 + i;
    again.finish(`p${i}`, `name:p${i}`, `p${i}`, 'turbo');
  }
  assert.equal(again.boards().turbo?.length, BOARD_SIZE);
});
