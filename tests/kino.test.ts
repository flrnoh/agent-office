import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { FILMS, KINO_BREAK, KINO_EPOCH, KINO_ROUND, kinoAt, kinoComing } from '../src/shared/kino.js';
import { BOOTH2, COUNTER, ENTRANCE, HALL_DOORS, KINO, KINO_SEATS, SERVE, inHall, kinoSolids, type KBox } from '../src/shared/kino-plan.js';
import { landmarkBox } from '../src/shared/landmarks.js';
import { KINO_SNACKS } from '../src/shared/kino-snacks.js';
import { DRINK_BY_ID } from '../src/shared/rooftop.js';
import { heldAnywhere, isSnack } from '../src/shared/fridge.js';
import { GUEST_MSGS } from '../src/server/guests.js';
import { PARTY_MSGS, PARTY_SEES_MSGS, partyView } from '../src/server/party.js';
import { KinoScreens, kinoMessage } from '../src/server/kino.js';

// flrnoh fork (see FORK.md "The cinema").

test('the programme runs back to back on the office clock: a break, then the film, round and round', () => {
  assert.ok(FILMS.length >= 8);
  // The same moment is the same for everyone.
  const t = Date.UTC(2026, 9, 2, 20, 15, 7);
  assert.deepEqual(kinoAt(t), kinoAt(t));
  // Each film ends where the next one's break begins, and the last one hands over to the first.
  let k = kinoAt(KINO_EPOCH);
  assert.equal(k.film, 0);
  assert.equal(k.phase, 'break');
  assert.equal(k.offset, -KINO_BREAK);
  for (let i = 0; i < FILMS.length + 2; i++) {
    const next = kinoAt(k.endsAt);
    assert.equal(next.film, (k.film + 1) % FILMS.length);
    assert.equal(next.film, k.next);
    assert.equal(next.phase, 'break');
    assert.equal(next.startsAt, k.endsAt + KINO_BREAK * 1000);
    assert.equal(next.endsAt - next.startsAt, FILMS[next.film].seconds * 1000);
    k = next;
  }
  // Any time at all: inside its slot, the offset where it is, and the same one a round later or earlier.
  for (let n = 0; n < 500; n++) {
    const at = KINO_EPOCH + Math.floor(((n * 7919) % 1000) / 1000 * KINO_ROUND * 3000) + n * 12345;
    const a = kinoAt(at);
    assert.ok(at >= a.startsAt - KINO_BREAK * 1000 && at < a.endsAt, `slot holds ${at}`);
    assert.ok(Math.abs(a.offset - (at - a.startsAt) / 1000) < 1e-6);
    assert.equal(a.phase, a.offset < 0 ? 'break' : 'film');
    assert.ok(a.offset >= -KINO_BREAK && a.offset < FILMS[a.film].seconds);
    for (const shift of [KINO_ROUND * 1000, -KINO_ROUND * 1000]) {
      const b = kinoAt(at + shift);
      assert.equal(b.film, a.film);
      assert.ok(Math.abs(b.offset - a.offset) < 1e-3);
    }
  }
  // What comes after, in order.
  const coming = kinoComing(t, 4);
  assert.equal(coming.length, 4);
  for (let i = 1; i < coming.length; i++) assert.ok(coming[i].at > coming[i - 1].at);
  assert.equal(coming[0].film, kinoAt(t).next);
});

test('every film may be shown: a licence and its credit, a sane stream and its source', () => {
  const ids = new Set<string>();
  for (const f of FILMS) {
    assert.ok(!ids.has(f.id), `${f.id} twice`);
    ids.add(f.id);
    assert.ok(f.title && f.by && f.credit, `${f.id} credited`);
    assert.ok(f.seconds > 60 && f.seconds < 3 * 3600, `${f.id} length`);
    if (f.licence === 'Public domain') {
      // Old enough everywhere: before 1930, and its credit says so.
      assert.ok(f.year < 1930, `${f.id} is public domain by age`);
      assert.match(f.credit, /public domain/);
      assert.equal(f.licenceUrl, undefined);
    } else {
      assert.match(f.licence, /^CC BY(-SA)? \d\.\d$/, `${f.id} is Creative Commons, attribution`);
      assert.ok(f.licenceUrl?.startsWith('https://creativecommons.org/licenses/by'), `${f.id} links its licence`);
      assert.ok(f.credit.includes(f.licence), `${f.id}'s credit names its licence`);
      assert.match(f.by, /Blender/);
    }
    const u = new URL(f.url);
    assert.equal(u.protocol, 'https:');
    assert.equal(u.hostname, 'upload.wikimedia.org');
    assert.match(u.pathname, /^\/wikipedia\/commons\/transcoded\/[0-9a-f]\/[0-9a-f]{2}\/[^/]+\/[^/]+\.720p\.vp9\.webm$/);
    assert.ok(!u.search && !u.hash);
    assert.ok(f.source.startsWith('https://commons.wikimedia.org/wiki/File:'));
    assert.equal(f.poster.length, 3);
    for (const c of f.poster) assert.match(c, /^#[0-9a-f]{6}$/);
  }
});

test('the counter hands out popcorn, nachos and a cola, held like the fridge’s things', () => {
  for (const s of KINO_SNACKS) {
    assert.equal(DRINK_BY_ID.get(s.id), s);
    assert.ok(heldAnywhere(s.id));
    assert.equal(s.strength <= 0, true);
  }
  assert.ok(isSnack(KINO_SNACKS.find((s) => s.id === 'popcorn')!));
  assert.ok(!isSnack(KINO_SNACKS.find((s) => s.id === 'kinocola')!));
});

// ---- Walking it: every seat, the counter, the lectern and the halls' doors from the street ---------

const R = 0.32;
const STEP = 0.3;
const CELL = 0.1;

function touches(b: KBox, x: number, z: number): boolean {
  const nx = Math.max(b.minX, Math.min(x, b.maxX));
  const nz = Math.max(b.minZ, Math.min(z, b.maxZ));
  return (x - nx) ** 2 + (z - nz) ** 2 < R * R;
}

/** From the street in front of the doors: how high you stand on each cell you can walk to (NaN: not). */
function walk(solids: KBox[]) {
  const box = landmarkBox('kino');
  const x0 = box.minX;
  const z0 = box.minZ;
  const nx = Math.ceil((box.maxX - box.minX) / CELL);
  const nz = Math.ceil((box.maxZ - box.minZ) / CELL);
  const h = new Float32Array(nx * nz).fill(NaN);
  const near = (x: number, z: number) => solids.filter((b) => touches(b, x, z));
  const cellOf = (x: number, z: number) => [Math.floor((x - x0) / CELL), Math.floor((z - z0) / CELL)] as const;
  const [sx, sz] = cellOf(KINO.maxX + 3, ENTRANCE.z);
  h[sz * nx + sx] = 0;
  const queue = [sz * nx + sx];
  while (queue.length) {
    const c = queue.pop()!;
    const ci = c % nx;
    const cj = (c - ci) / nx;
    const y = h[c];
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const i = ci + di;
      const j = cj + dj;
      if (i < 0 || j < 0 || i >= nx || j >= nz) continue;
      const x = x0 + (i + 0.5) * CELL;
      const z = z0 + (j + 0.5) * CELL;
      const here = near(x, z).filter((b) => b.bottom < y + 1.7);
      if (here.some((b) => b.top > y + STEP)) continue;
      const ny = Math.max(0, ...here.map((b) => b.top));
      const n = j * nx + i;
      if (!Number.isNaN(h[n])) continue;
      h[n] = ny;
      queue.push(n);
    }
  }
  return (x: number, z: number) => {
    const [i, j] = cellOf(x, z);
    return h[j * nx + i];
  };
}

test('every seat, the counter, the lectern and the halls are reachable on foot from the street', () => {
  const solids = kinoSolids();
  const at = walk(solids);
  // In through the doors, and into each hall by its doorways.
  assert.equal(at(ENTRANCE.x - 2, ENTRANCE.z), 0, 'into the foyer');
  assert.ok(Number.isNaN(at(KINO.minX + 2, KINO.minZ + 2)), 'not into the projectionists’ rooms');
  for (const d of HALL_DOORS) assert.equal(at(d.x - 1, d.z), 0, `through Saal ${d.hall}'s door at z ${d.z}`);
  assert.equal(at(SERVE.x, SERVE.z), 0, 'up to the counter');
  assert.ok(at(SERVE.x, SERVE.z) === 0 && COUNTER.maxZ < SERVE.z);
  assert.equal(at(BOOTH2.x - 0.7, BOOTH2.z), 0, 'up to the lectern');
  // Each seat: where you'd get up to (out in front of it) is reached, on its own row's floor.
  for (const s of KINO_SEATS) {
    const x = s.x + Math.sin(s.rotY) * s.out;
    const z = s.z + Math.cos(s.rotY) * s.out;
    const y = at(x, z);
    assert.ok(Math.abs(y - s.y) < 1e-4, `${s.key}: stood at ${y}, its row is at ${s.y}`);
    assert.ok(inHall(s.hall, s.x, s.z), `${s.key} in its hall`);
    // And sitting in it you're inside the seat's own box, not inside a wall.
    const walls = solids.filter((b) => b.top > 4 && touches(b, s.x, s.z));
    assert.deepEqual(walls, [], `${s.key} clear of the walls`);
  }
  assert.equal(new Set(KINO_SEATS.map((s) => s.key)).size, KINO_SEATS.length, 'every seat its own key');
});

test('the cinema stands on its own block, inside the sidewalks', () => {
  const box = landmarkBox('kino');
  assert.ok(KINO.minX > box.minX && KINO.maxX + 4.5 < box.maxX + 2 && KINO.minZ > box.minZ && KINO.maxZ < box.maxZ);
});

test('Saal 2: guests and party guests may put on a film, and see what is on', async () => {
  for (const t of ['kino.play', 'kino.stop']) {
    assert.ok(GUEST_MSGS.has(t), `${t} for guests`);
    assert.ok(PARTY_MSGS.has(t), `${t} for party guests`);
  }
  assert.ok(PARTY_SEES_MSGS.has('kino'));
  // What's on reaches them as it is (the floor view's `kino` is in VIEW_AS_IS, checked when it compiles).
  const msg = { t: 'kino' as const, state: { set: null, startedAt: 1, elapsed: 0 } };
  assert.deepEqual(partyView(msg), msg);

  const dir = mkdtempSync(path.join(tmpdir(), 'kino-'));
  mkdirSync(path.join(dir, '.agent-office'));
  try {
    const screens = new KinoScreens(async () => 'A title');
    const floor = { id: 'f1', dir };
    const sent: unknown[] = [];
    const warned: string[] = [];
    const hooks = { id: 'c1', who: 'Ann', office: true, toFloor: (m: unknown) => sent.push(m), warn: (t: string) => warned.push(t) };
    kinoMessage(screens.of(floor), { t: 'kino.play', url: 'https://example.com/film.mp4' }, hooks);
    assert.equal(sent.length, 0);
    assert.match(warned[0], /YouTube/);
    kinoMessage(screens.of(floor), { t: 'kino.play', url: 'https://youtu.be/aqz-KE-bpKQ' }, hooks);
    assert.equal((sent[0] as { t: string }).t, 'kino');
    assert.equal(screens.view(floor)?.set?.id, 'aqz-KE-bpKQ');
    await new Promise((r) => setTimeout(r, 10));
    assert.ok(sent.some((m) => (m as { text?: string }).text?.includes('Saal 2')));
    // Kept in the floor's .agent-office folder: what's on is still on after a restart.
    assert.equal(new KinoScreens().view(floor)?.set?.id, 'aqz-KE-bpKQ');
    kinoMessage(screens.of(floor), { t: 'kino.stop' }, { ...hooks, id: 'c2' });
    assert.equal(screens.view(floor)?.set, null);
    kinoMessage(screens.of(floor), { t: 'kino.play', url: 'https://youtu.be/aqz-KE-bpKQ' }, { ...hooks, office: false });
    assert.match(warned.at(-1)!, /office/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
