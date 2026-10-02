import test from 'node:test';
import assert from 'node:assert/strict';
import { CORRIDOR_FLOOR, DOOR_HEIGHT, LOBBY, STUDIO_GLASS, WING_CEILING, WING_DOOR_WAY, WING_EAST_WALL, WING_SOLIDS, WING_SPOTS, WING_WALL, doorOf, doorSwing, inner, wingPartAt } from '../src/shared/proberaum-layout.js';
import { bandName, cleanText, dueBetween, evNote, muffleFor, soundApart, takeEv, takePosition, type TakeEv } from '../src/shared/proberaum.js';
import { INSTRUMENT_SPOTS, REHEARSAL_ROOMS, VENUE, WING_DOOR, ZONES, type Zone } from '../src/shared/venue.js';

// The rehearsal wing's plan (flrnoh fork, see FORK.md "The rehearsal wing"): everything it puts in the
// Schallwerk stands in the wing, clear of the instruments, the doors and the ways; every room, door,
// thing to use and instrument can be walked to from the foyer; sound stays in the rooms.

const inside = (z: Zone, r: Zone, pad = 0) => z.minX >= r.minX + pad - 1e-9 && z.maxX <= r.maxX - pad + 1e-9 && z.minZ >= r.minZ + pad - 1e-9 && z.maxZ <= r.maxZ - pad + 1e-9;
const overlap = (a: Zone, b: Zone) => a.minX < b.maxX - 1e-9 && b.minX < a.maxX - 1e-9 && a.minZ < b.maxZ - 1e-9 && b.minZ < a.maxZ - 1e-9;
const distTo = (z: Zone, x: number, y: number) => Math.hypot(Math.max(z.minX - x, 0, x - z.maxX), Math.max(z.minZ - y, 0, y - z.maxZ));

test('everything the wing builds stands in the wing, in its own part of it', () => {
  for (const s of WING_SOLIDS) {
    assert.ok(inside(s, ZONES.wing), `${s.id} is outside the wing`);
    const part = s.where === 'lobby' ? LOBBY : s.where === 'corridor' ? CORRIDOR_FLOOR : inner(REHEARSAL_ROOMS.find((r) => r.id === s.where)!);
    assert.ok(inside(s, part), `${s.id} is outside ${s.where}`);
    assert.ok(s.top > 0 && s.top < WING_CEILING, `${s.id} is ${s.top} m tall`);
    if (s.where === 'studio') assert.ok(s.maxX <= STUDIO_GLASS.x - 0.1 || s.minX >= STUDIO_GLASS.x + 0.1, `${s.id} is in the glass`);
  }
  assert.ok(inside({ ...WING_EAST_WALL, minZ: ZONES.wing.minZ, maxZ: ZONES.wing.maxZ }, ZONES.wing));
  for (const s of WING_SPOTS) assert.ok(wingPartAt(s.x, s.z), `${s.what} ${s.room ?? ''} isn't in the wing`);
});

test('nothing stands within 0.8 m of an instrument, in a door’s swing, in the way in, or in the corridor', () => {
  for (const s of WING_SOLIDS) {
    for (const spot of INSTRUMENT_SPOTS.filter((x) => x.room === s.where)) assert.ok(distTo(s, spot.x, spot.z) >= 0.8, `${s.id} is ${distTo(s, spot.x, spot.z).toFixed(2)} m from ${spot.id}`);
    for (const r of REHEARSAL_ROOMS) assert.ok(!overlap(s, doorSwing(r)), `${s.id} is in ${r.id}'s door`);
    assert.ok(!overlap(s, WING_DOOR_WAY), `${s.id} is in the way in`);
    assert.ok(!overlap(s, CORRIDOR_FLOOR), `${s.id} is in the corridor`);
  }
  assert.ok(CORRIDOR_FLOOR.maxX - CORRIDOR_FLOOR.minX >= 1.8, 'the corridor is wide enough for two');
  for (const r of REHEARSAL_ROOMS) assert.ok(r.door.width >= 1 && DOOR_HEIGHT > 2, `${r.id}'s door`);
});

/**
 * Where you can stand, on a 10 cm grid over the wing: not in a wall (the rooms' with their doorways,
 * the wing's east wall with its way in, the studio's glass with its doorway) nor in anything that
 * stands there, with a body's width (0.32 m) round you.
 */
function walkable() {
  const R = 0.32;
  const blocks: Zone[] = [...WING_SOLIDS];
  for (const r of REHEARSAL_ROOMS) {
    const B = r.box;
    const d = doorOf(r);
    blocks.push(
      { minX: B.minX, maxX: B.maxX, minZ: B.minZ, maxZ: B.minZ + WING_WALL },
      { minX: B.minX, maxX: B.maxX, minZ: B.maxZ - WING_WALL, maxZ: B.maxZ },
      { minX: B.minX, maxX: B.minX + WING_WALL, minZ: B.minZ, maxZ: B.maxZ },
      { minX: B.maxX - WING_WALL, maxX: B.maxX, minZ: B.minZ, maxZ: d.z - d.width / 2 },
      { minX: B.maxX - WING_WALL, maxX: B.maxX, minZ: d.z + d.width / 2, maxZ: B.maxZ },
    );
  }
  blocks.push({ minX: STUDIO_GLASS.x - 0.1, maxX: STUDIO_GLASS.x + 0.1, minZ: STUDIO_GLASS.doorZ1, maxZ: STUDIO_GLASS.maxZ });
  blocks.push({ minX: WING_EAST_WALL.minX, maxX: WING_EAST_WALL.maxX, minZ: ZONES.wing.minZ, maxZ: WING_DOOR.z - WING_DOOR.width / 2 });
  blocks.push({ minX: WING_EAST_WALL.minX, maxX: WING_EAST_WALL.maxX, minZ: WING_DOOR.z + WING_DOOR.width / 2, maxZ: ZONES.wing.maxZ });
  const W = ZONES.wing;
  const step = 0.1;
  const nx = Math.round((W.maxX - W.minX) / step) + 8;
  const nz = Math.round((W.maxZ - W.minZ) / step) + 1;
  const cell = (x: number, z: number) => [Math.round((x - W.minX) / step), Math.round((z - W.minZ) / step)] as const;
  const free = (i: number, j: number) => {
    const x = W.minX + i * step;
    const z = W.minZ + j * step;
    if (z < W.minZ + R || z > W.maxZ - R || x < W.minX + R) return false;
    return !blocks.some((b) => distTo(b, x, z) < R);
  };
  // From just outside the way in (in the foyer), everywhere you can get to.
  const seen = new Uint8Array(nx * nz);
  const [si, sj] = cell(W.maxX + 0.5, WING_DOOR.z);
  const queue: [number, number][] = [[si, sj]];
  seen[si * nz + sj] = 1;
  while (queue.length) {
    const [i, j] = queue.pop()!;
    for (const [di, dj] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const a = i + di;
      const b = j + dj;
      if (a < 0 || b < 0 || a >= nx || b >= nz || seen[a * nz + b] || !free(a, b)) continue;
      seen[a * nz + b] = 1;
      queue.push([a, b]);
    }
  }
  return (x: number, z: number) => {
    const [i, j] = cell(x, z);
    // Near enough: a cell within 0.3 m that's reached.
    for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) if (seen[(i + a) * nz + (j + b)]) return true;
    return false;
  };
}

test('from the foyer you walk to every room, through every door, to everything to use and every instrument', () => {
  const reach = walkable();
  for (const r of REHEARSAL_ROOMS) {
    const d = doorOf(r);
    assert.ok(reach(d.outX, d.z), `${r.id}'s door from the corridor`);
    assert.ok(reach(d.inX, d.z), `into ${r.id}`);
  }
  for (const s of WING_SPOTS) assert.ok(reach(s.x, s.z), `${s.what} ${s.room ?? ''} at ${s.x}, ${s.z}`);
  for (const s of INSTRUMENT_SPOTS.filter((x) => x.room !== 'hall')) assert.ok(reach(s.x, s.z), `${s.id}`);
  // And the studio's live room through the glass wall's doorway.
  assert.ok(reach(STUDIO_GLASS.x - 0.8, (STUDIO_GLASS.doorZ0 + STUDIO_GLASS.doorZ1) / 2));
  // (Not through walls or furniture: the middle of the lobby's counter, beyond the north wall.)
  const counter = WING_SOLIDS.find((s) => s.id === 'counter')!;
  assert.ok(!reach((counter.minX + counter.maxX) / 2, (counter.minZ + counter.maxZ) / 2));
  assert.ok(!reach(-20, ZONES.wing.minZ + 0.1));
});

test('voice stays in a rehearsal room: nobody outside hears in, nobody inside hears out (or the hall’s PA)', () => {
  const at = (x: number, z: number, floor: string | null = VENUE) => ({ floor, x, z });
  const room = (id: string) => inner(REHEARSAL_ROOMS.find((r) => r.id === id)!);
  const mid = (z: Zone) => [(z.minX + z.maxX) / 2, (z.minZ + z.maxZ) / 2] as const;
  const [p1x, p1z] = mid(room('probe1'));
  const [p2x, p2z] = mid(room('probe2'));
  const [sx, sz] = mid(room('studio'));
  assert.equal(soundApart(at(p1x, p1z), at(p1x + 2, p1z + 1)), false, 'the band in the room');
  assert.equal(soundApart(at(p1x, p1z), at(-12.2, p1z)), true, 'the corridor, right outside');
  assert.equal(soundApart(at(-12.2, p1z), at(p1x, p1z)), true, 'both ways');
  assert.equal(soundApart(at(p1x, p1z), at(p2x, p2z)), true, 'next door');
  assert.equal(soundApart(at(p1x, p1z), at(2.5, 9)), true, 'the stage’s singer on the PA');
  assert.equal(soundApart(at(sx - 3, sz), at(sx + 2, sz)), false, 'the live room and the control room are one room');
  assert.equal(soundApart(at(-12.2, 0), at(0, 0)), false, 'the corridor and the hall: the circles decide');
  assert.equal(soundApart(at(p1x, p1z, 'floor-1'), at(-12.2, p1z, 'floor-1')), false, 'not in the Schallwerk: none of the wing’s business');
});

test('the hall heard in a room is muffled, the room heard outside only a thump, louder with the door open', () => {
  assert.deepEqual(muffleFor('hall', 'hall'), { gain: 1, cutoff: 20000 });
  assert.deepEqual(muffleFor('probe2', 'probe2'), { gain: 1, cutoff: 20000 });
  const shut = muffleFor('probe1', 'hall');
  const open = muffleFor('probe1', 'hall', true);
  assert.ok(shut.gain < 0.3 && shut.cutoff < 400);
  assert.ok(open.gain > shut.gain && open.cutoff > shut.cutoff);
  assert.ok(muffleFor('hall', 'probe1').gain < shut.gain);
  assert.ok(muffleFor('probe1', 'probe2').gain < 0.05);
});

test('takes keep only their room’s notes, and play back in order, round and round on a loop', () => {
  assert.deepEqual(takeEv('probe1', 120.4, 'probe1-guitar', { kind: 'guitar', pitch: 52, vel: 0.777, len: 1.234 }), [120, 'probe1-guitar', 52, 0.78, 1.23]);
  assert.equal(takeEv('probe1', 0, 'probe2-guitar', { kind: 'guitar', pitch: 52, vel: 1 }), null, 'another room');
  assert.equal(takeEv('probe1', 0, 'probe1-mic', { kind: 'drums', pitch: 36, vel: 1 }), null, 'the mic');
  assert.equal(takeEv('probe1', 0, 'probe1-keys', { kind: 'keys', pitch: 200, vel: 1 }), null, 'no such note');
  assert.equal(takeEv('probe1', -5, 'probe1-keys', { kind: 'keys', pitch: 60, vel: 1 }), null);
  assert.deepEqual(evNote([0, 'probe1-drums', 36, 0.9, 0]), { kind: 'drums', pitch: 36, vel: 0.9 });
  const evs: TakeEv[] = [0, 100, 200, 300].map((t) => [t, 'probe1-drums', 36, 1, 0]);
  assert.deepEqual(dueBetween(evs, -1, 150).map((e) => e[0]), [0, 100]);
  assert.deepEqual(dueBetween(evs, 100, 300).map((e) => e[0]), [200, 300]);
  assert.equal(takePosition(500, 400, false), null);
  assert.equal(takePosition(500, 400, true), 100);
  assert.equal(takePosition(-50, 400, true), -50);
});

test('band names, notes and setlists: made up, cleaned, kept short', () => {
  assert.equal(bandName(7), bandName(7));
  const names = new Set(Array.from({ length: 50 }, (_, i) => bandName(i)));
  assert.ok(names.size > 30);
  assert.equal(cleanText('  Hallo\u0000 ‮Welt  ', 20), 'Hallo Welt');
  assert.equal(cleanText('a\nb\nc\nd', 100, 2), 'a\nb');
  assert.equal(cleanText('a\nb', 100), 'a b');
  assert.equal(cleanText(42, 10), '');
  assert.equal([...cleanText('🎸'.repeat(50), 5)].length, 5);
});
