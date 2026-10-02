import test from 'node:test';
import assert from 'node:assert/strict';
import { BLOCKS, BLOCK_INNER, LOTS, PARK_TREES, STREETS, onCityStreet, stretchRect } from '../src/shared/city.js';
import { CHURCH, CHURCH_RANGE } from '../src/shared/church.js';
import { BELL_HOURS, SIREN_EVERY, awningLevel, bellDue, bellStrikes, murmurLevel, roadLevel, siren, sirenDue, streetDistance, summerish } from '../src/shared/citysound.js';
import { SKY_DAY_MS } from '../src/shared/sun.js';
import { FURNITURE } from '../src/shared/streetside.js';
import { SHOPS } from '../src/shared/shops.js';

// flrnoh fork (see FORK.md, "Sounds of the city"): the church on its park, its bells, the sirens, and
// how loud the city is where you stand (shared/church.ts, shared/citysound.ts).

test('the church stands on a park 80–200 m from the office, clear of the streets, the buildings and the trees', () => {
  assert.ok(CHURCH, 'a park in range has room for the church');
  const c = CHURCH!;
  assert.equal(c.block.kind, 'park');
  assert.ok(BLOCKS.includes(c.block));
  const d = Math.hypot(c.block.x, c.block.z);
  assert.ok(d >= CHURCH_RANGE.min && d <= CHURCH_RANGE.max, `its park is ${d.toFixed(0)} m off`);
  for (const s of c.solids) {
    // Inside the park's sidewalks…
    assert.ok(s.minX > c.block.x - BLOCK_INNER / 2 && s.maxX < c.block.x + BLOCK_INNER / 2, 'within the park along x');
    assert.ok(s.minZ > c.block.z - BLOCK_INNER / 2 && s.maxZ < c.block.z + BLOCK_INNER / 2, 'within the park along z');
    // …never on a street…
    for (let x = s.minX; x <= s.maxX; x += 0.5) for (let z = s.minZ; z <= s.maxZ; z += 0.5) assert.ok(!onCityStreet(x, z), `(${x}, ${z}) is on a street`);
    // …nor on a building's lot, a park tree or anything by the street.
    for (const l of LOTS) assert.ok(s.maxX < l.x - l.w / 2 || s.minX > l.x + l.w / 2 || s.maxZ < l.z - l.d / 2 || s.minZ > l.z + l.d / 2, 'clear of every lot');
    for (const t of [...PARK_TREES, ...FURNITURE]) assert.ok(t.x < s.minX - 2 || t.x > s.maxX + 2 || t.z < s.minZ - 2 || t.z > s.maxZ + 2, `clear of what stands at (${t.x.toFixed(1)}, ${t.z.toFixed(1)})`);
    assert.ok(s.top > s.bottom);
  }
  // The bells hang in the tower, the tower's the tallest part.
  const tower = c.solids.reduce((a, b) => (b.top > a.top ? b : a));
  assert.ok(c.bell.x > tower.minX && c.bell.x < tower.maxX && c.bell.z > tower.minZ && c.bell.z < tower.maxZ, 'the bells are in the tower');
  assert.ok(c.bell.y < tower.top && c.bell.y > 8);
});

test('the bell strikes the hour on a twelve-hour clock, and keeps quiet at night', () => {
  // Morning, noon and evening only: the office's day is an hour, so not every two and a half minutes.
  assert.deepEqual(BELL_HOURS, [8, 12, 18]);
  assert.equal(bellStrikes(8), 8);
  assert.equal(bellStrikes(12), 12);
  assert.equal(bellStrikes(18.5), 6);
  for (let h = 0; h < 24; h++) assert.equal(bellStrikes(h) > 0, BELL_HOURS.includes(h), `at ${h}:00`);
});

test('the bell rings once on each full hour of the office sky, at the moment it comes round', () => {
  const utcOffset = 120;
  const hour = SKY_DAY_MS / 24;
  // Step through two days of sky, a frame (60 ms) at a time, as a page would.
  const start = Date.UTC(2026, 9, 2, 8, 0, 0);
  const rings: { at: number; strikes: number }[] = [];
  for (let t = start; t < start + SKY_DAY_MS * 2; t += 60) {
    const k = bellDue(t, t + 60, utcOffset);
    if (k) rings.push({ at: t + 60, strikes: k });
  }
  // At eight, noon and six, each day: three a day, four or six sky hours apart (or fourteen overnight).
  assert.equal(rings.length, 6);
  assert.deepEqual(rings.map((r) => r.strikes), [8, 12, 6, 8, 12, 6]);
  for (let i = 1; i < rings.length; i++) {
    const gap = (rings[i].at - rings[i - 1].at) / hour;
    assert.ok([4, 6, 14].some((g) => Math.abs(gap - g) < 0.01), `${gap.toFixed(2)} sky hours between rings`);
  }
  // A jump (the tab was hidden) rings nothing, nor does standing still.
  assert.equal(bellDue(start, start + hour * 3, utcOffset), 0);
  assert.equal(bellDue(start, start, utcOffset), 0);
});

test('a siren goes by every ten to twenty minutes of the office clock, the same for everyone', () => {
  for (let n = 1000; n < 1200; n++) {
    const gap = siren(n + 1).at - siren(n).at;
    assert.ok(gap >= 10 * 60_000 && gap <= 20 * 60_000, `${gap / 60_000} minutes between sirens`);
    assert.deepEqual(siren(n), siren(n));
    const s = siren(n);
    assert.ok(s.dist >= 200 && s.dist <= 400);
  }
  // Stepping through three hours a frame at a time finds each one exactly once.
  const start = Date.UTC(2026, 9, 2, 12, 0, 0);
  const found: number[] = [];
  for (let t = start; t < start + 3 * 3_600_000; t += 50) {
    const s = sirenDue(t, t + 50);
    if (s) found.push(s.n);
  }
  const expect: number[] = [];
  for (let n = Math.floor(start / SIREN_EVERY) - 1; n <= Math.ceil((start + 3 * 3_600_000) / SIREN_EVERY) + 1; n++) {
    const at = siren(n).at;
    if (at > start && at <= start + 3 * 3_600_000) expect.push(n);
  }
  assert.deepEqual(found, expect);
  assert.ok(found.length >= 9 && found.length <= 18);
  assert.equal(sirenDue(start, start + 60 * 60_000), null, 'nothing after a jump');
});

test('the road is silent indoors far from any street, and rises the nearer one you are', () => {
  const cars: { x: number; z: number }[] = [];
  // Far off in the country, behind glass: nothing.
  assert.equal(roadLevel({ x: 600, z: 600, up: 1.6, inside: true }, cars), 0);
  assert.equal(roadLevel({ x: 600, z: 600, up: 1.6, inside: false }, cars), 0);
  // Down by a city street: the nearer, the louder, walking straight out from its middle.
  const st = STREETS.find((x) => x.alongX)!;
  const r = stretchRect(st);
  const street = { x: (r.minX + r.maxX) / 2, z: (r.minZ + r.maxZ) / 2 };
  const steps: number[] = [];
  for (let k = 0; k <= 12; k++) steps.push(roadLevel({ x: street.x, z: street.z + k * 2, up: 1.6, inside: false }, cars));
  for (let k = 1; k < steps.length; k++) {
    if (streetDistance(street.x, street.z + k * 2) > streetDistance(street.x, street.z + (k - 1) * 2)) assert.ok(steps[k] < steps[k - 1], `quieter further from the street (${k})`);
  }
  assert.ok(steps[0] > steps[12] * 2, `${steps[0]} by the street, ${steps[12]} 24 m off`);
  const by = roadLevel({ ...street, up: 1.6, inside: false }, cars);
  assert.ok(by > 0.2, `by the street: ${by}`);
  // Cars close by make it louder; up on a floor, behind glass, or on the roof it's quieter.
  const busy = roadLevel({ ...street, up: 1.6, inside: false }, [street, { x: street.x + 10, z: street.z }, { x: street.x - 10, z: street.z }]);
  assert.ok(busy > by);
  assert.ok(roadLevel({ ...street, up: 1.6, inside: true }, cars) < by * 0.5);
  assert.ok(roadLevel({ ...street, up: 20, inside: false }, cars) < by);
  assert.ok(roadLevel({ ...street, up: 30, inside: false }, cars) < roadLevel({ ...street, up: 10, inside: false }, cars));
  for (const v of [...steps, busy]) assert.ok(v >= 0 && v <= 1);
});

test('people by the shops by day, quiet at night; rain on the awnings only outside and only in the rain', () => {
  const s = SHOPS[0];
  const door = { x: s.ox + s.ux * s.doorU, z: s.oz + s.uz * s.doorU, up: 1.6, inside: false };
  assert.ok(murmurLevel(door, 1, 0) > murmurLevel(door, 0, 0));
  assert.ok(murmurLevel(door, 1, 0) > murmurLevel(door, 1, 0.8));
  assert.equal(murmurLevel({ x: 600, z: 600, up: 1.6, inside: false }, 1, 0), 0);
  assert.equal(awningLevel(door, 0), 0);
  assert.ok(awningLevel(door, 0.8) > 0.3);
  assert.equal(awningLevel({ ...door, inside: true }, 0.8), 0);
  assert.equal(awningLevel({ x: 600, z: 600, up: 1.6, inside: false }, 0.8), 0);
});

test('crickets want a warm night: by the forecast, or by the month without one', () => {
  assert.equal(summerish(20, Date.UTC(2026, 0, 1)), true);
  assert.equal(summerish(8, Date.UTC(2026, 6, 1)), false);
  assert.equal(summerish(undefined, Date.UTC(2026, 6, 1)), true);
  assert.equal(summerish(undefined, Date.UTC(2026, 11, 1)), false);
});
