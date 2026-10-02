import test from 'node:test';
import assert from 'node:assert/strict';
import { STAGE_HEIGHT, ZONES, type Zone } from '../src/shared/venue.js';
import { BARRIER, BOOTH_DESK, BOOTH_RISER, BOOTH_SCREEN, BOOTH_STAIRS, DIVE_EDGE, DJ_SPOT, PIT_ZONE, POSTER_WALL, SECURITY, WALKWAYS, atDecks, atDiveEdge, crowdArea } from '../src/shared/venueshow.js';
import { CROWD_GAP, MAX_CROWD, concertMood, crowdSpots, crowdTarget, findPit, moveFor, onWalkway, pitPlace, stepAside, wodPlace } from '../src/shared/venueshow-crowd.js';
import { BALL_BOX, BALL_R, HANDS, HIT_MAX_SIDE, HIT_UP, RELAUNCH_MS, ballAt, effectiveHit, hitBall, launch } from '../src/shared/venueshow-balls.js';
import { CALLED_BUILD, CALLED_DROP, CYCLE_BARS, MIX_EPOCH, mixAt, mixFrame, mixStep } from '../src/shared/venueshow-mix.js';
import { HOUSE_STYLES } from '../src/shared/venueshow.js';

// flrnoh fork (see FORK.md "The show"): the Schallwerk's crowd, its beach balls and its house mix, all pure.

const inZone = (z: Zone, x: number, y: number, pad = 0) => x >= z.minX + pad && x <= z.maxX - pad && y >= z.minZ + pad && y <= z.maxZ - pad;

test('the show builds only in its own zones: the floor and the DJ booth', () => {
  const F = ZONES.floor;
  const D = ZONES.djbooth;
  const boxInside = (b: Zone, z: Zone) => b.minX >= z.minX - 1e-9 && b.maxX <= z.maxX + 1e-9 && b.minZ >= z.minZ - 1e-9 && b.maxZ <= z.maxZ + 1e-9;
  assert.ok(boxInside({ minX: BARRIER.minX, maxX: BARRIER.maxX, minZ: BARRIER.z - 0.5, maxZ: BARRIER.z + 0.5 }, F), 'the barrier and its footplates');
  assert.ok(boxInside(PIT_ZONE, F) && inZone(PIT_ZONE, SECURITY.x, SECURITY.z), 'security stands in the pit');
  assert.ok(boxInside({ minX: POSTER_WALL.x - 0.1, maxX: POSTER_WALL.x + 0.2, minZ: POSTER_WALL.minZ, maxZ: POSTER_WALL.maxZ }, F), 'the poster wall');
  for (const w of WALKWAYS) assert.ok(boxInside(w, F), 'a walkway');
  for (const b of [BOOTH_RISER, BOOTH_STAIRS]) assert.ok(boxInside(b, D), 'the booth');
  assert.ok(boxInside({ minX: BOOTH_DESK.x - BOOTH_DESK.width / 2, maxX: BOOTH_DESK.x + BOOTH_DESK.width / 2, minZ: BOOTH_DESK.z - BOOTH_DESK.depth / 2, maxZ: BOOTH_DESK.z + BOOTH_DESK.depth / 2 }, BOOTH_RISER), 'the desk on the riser');
  assert.ok(boxInside({ minX: BOOTH_SCREEN.x - BOOTH_SCREEN.width / 2, maxX: BOOTH_SCREEN.x + BOOTH_SCREEN.width / 2, minZ: BOOTH_SCREEN.z - 0.1, maxZ: BOOTH_SCREEN.z + 0.25 }, D), 'the screen');
  assert.ok(inZone(BOOTH_RISER, DJ_SPOT.x, DJ_SPOT.z, 0.3) && DJ_SPOT.y === BOOTH_RISER.height, 'the DJ stands on the riser');
  assert.ok(atDecks(DJ_SPOT.x, DJ_SPOT.z) && !atDecks(DJ_SPOT.x, DJ_SPOT.z, 0) && !atDecks(DJ_SPOT.x - 5, DJ_SPOT.z));
  // The stairs climb from the floor to the riser in steps you can walk up.
  assert.ok(BOOTH_RISER.height / BOOTH_STAIRS.steps <= 0.3);
  assert.equal(BOOTH_STAIRS.maxX, BOOTH_RISER.minX);
  // The edge to dive off is the stage's front, up on it.
  assert.ok(atDiveEdge(2, STAGE_HEIGHT, DIVE_EDGE.z + 0.5) && !atDiveEdge(2, 0, DIVE_EDGE.z + 0.5) && !atDiveEdge(2, STAGE_HEIGHT, DIVE_EDGE.z + 3));
});

test('the crowd stands on the floor, off the walkways, apart, behind the barrier in concert mode', () => {
  for (const mode of ['konzert', 'club'] as const) {
    const spots = crowdSpots(mode);
    assert.equal(spots.length, MAX_CROWD, `${mode}: room for a full house`);
    const area = crowdArea(mode);
    for (const s of spots) {
      assert.ok(inZone(ZONES.floor, s.x, s.z, 0.3), `${mode}: ${s.x},${s.z} off the floor`);
      assert.ok(inZone(area, s.x, s.z), `${mode}: outside its area`);
      assert.ok(!onWalkway(s.x, s.z, 0.2), `${mode}: on a walkway at ${s.x},${s.z}`);
      if (mode === 'konzert') assert.ok(s.z < BARRIER.z - 0.3, 'in front of the barrier');
    }
    for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++) assert.ok(Math.hypot(spots[i].x - spots[j].x, spots[i].z - spots[j].z) >= CROWD_GAP - 1e-9, `${mode}: two in each other`);
    assert.equal(crowdSpots(mode), spots, 'worked out once');
  }
  // The concert fills from the front: the first dozen are nearer the stage than the last dozen.
  const k = crowdSpots('konzert');
  const avgZ = (l: readonly { z: number }[]) => l.reduce((s, p) => s + p.z, 0) / l.length;
  assert.ok(avgZ(k.slice(0, 12)) > avgZ(k.slice(-12)) + 1.5);
});

test('how many come: a few by day, more at night, a full house for a gig, the club when the music plays, the stage when it is loud', () => {
  const base = { mode: 'konzert' as const, live: false, music: false, stage: 0 };
  assert.ok(crowdTarget({ ...base, hour: 6 }) <= 4);
  assert.ok(crowdTarget({ ...base, hour: 13 }) < crowdTarget({ ...base, hour: 22 }));
  assert.equal(crowdTarget({ ...base, hour: 13, live: true }), MAX_CROWD);
  assert.ok(crowdTarget({ ...base, hour: 13, mode: 'club', music: true }) >= 50);
  assert.ok(crowdTarget({ ...base, hour: 13, stage: 0.7 }) > crowdTarget({ ...base, hour: 13, stage: 0.1 }));
  for (let h = 0; h < 24; h += 0.5) assert.ok(crowdTarget({ ...base, hour: h, stage: 1, music: true }) <= MAX_CROWD);
  assert.equal(concertMood(0.01, true), 'idle');
  assert.equal(concertMood(0.2, true), 'slow');
  assert.equal(concertMood(0.5, true), 'nod');
  assert.equal(concertMood(0.9, true), 'wild');
  assert.equal(concertMood(0.9, false), 'idle');
});

test('a pit opens where two or more pogo near each other, and the crowd makes a ring round it', () => {
  const now = 100_000;
  assert.equal(findPit([{ id: 'a', x: 0, z: 0, at: now - 100 }], now), null, 'one alone is no pit');
  assert.equal(findPit([{ id: 'a', x: 0, z: 0, at: now - 100 }, { id: 'a', x: 0.5, z: 0, at: now - 50 }], now), null, 'one jumping twice is no pit');
  assert.equal(findPit([{ id: 'a', x: 0, z: 0, at: now - 100 }, { id: 'b', x: 8, z: 0, at: now - 100 }], now), null, 'too far apart');
  assert.equal(findPit([{ id: 'a', x: 0, z: 0, at: now - 9000 }, { id: 'b', x: 1, z: 0, at: now - 9000 }], now), null, 'long over');
  const pit = findPit([{ id: 'a', x: 0, z: 0, at: now - 100 }, { id: 'b', x: 2, z: 0, at: now - 300 }, { id: 'c', x: 1, z: 1, at: now - 200 }, { id: 'd', x: 12, z: 0, at: now - 10 }], now)!;
  assert.ok(pit && pit.jumpers === 3 && Math.abs(pit.x - 1) < 1e-9 && pit.r > 2.5);
  const moved = pitPlace({ x: 1.3, z: 0.2 }, pit);
  assert.ok(Math.hypot(moved.x - pit.x, moved.z - pit.z) >= pit.r, 'out to the ring');
  assert.deepEqual(pitPlace({ x: 9, z: 0 }, pit), { x: 9, z: 0 }, 'further off, they stay');
});

test('the Wall of Death: the crowd parts down the middle, then runs at each other, then it is over', () => {
  const s = { x: 3.5, z: -1 };
  const at = 10_000;
  assert.equal(wodPlace(s, at, at - 10, 'konzert'), null);
  const part = wodPlace(s, at, at + 2000, 'konzert')!;
  assert.equal(part.phase, 'part');
  const run = wodPlace(s, at, at + 5000, 'konzert')!;
  assert.equal(run.phase, 'run');
  assert.equal(wodPlace(s, at, at + 20_000, 'konzert'), null);
  assert.ok(stepAside({ x: 0, z: 0 }, [{ x: 0.3, z: 0 }]).x < -0.5, 'someone steps aside for a player');
  assert.deepEqual(stepAside({ x: 0, z: 0 }, [{ x: 3, z: 0 }]), { x: 0, z: 0 });
  assert.ok(['jump', 'pump', 'wave', 'bang'].includes(moveFor(7, 'drop', 3)));
  assert.equal(moveFor(7, 'drop', 3), moveFor(7, 'drop', 3));
});

test('the beach balls fly the same everywhere, stay over the floor, and only a hit within reach counts', () => {
  const now = MIX_EPOCH + 1234567;
  const a = ballAt(0, undefined, now);
  const b = ballAt(0, undefined, now);
  assert.deepEqual(a, b, 'the same on every page');
  for (let t = 0; t < RELAUNCH_MS; t += 7_777) {
    for (let i = 0; i < 3; i++) {
      const p = ballAt(i, undefined, now + t);
      assert.ok(p.x >= BALL_BOX.minX - 1e-6 && p.x <= BALL_BOX.maxX + 1e-6 && p.z >= BALL_BOX.minZ - 1e-6 && p.z <= BALL_BOX.maxZ + 1e-6, 'in the box');
      assert.ok(p.y >= BALL_R - 1e-6 && p.y < 12, `in the air or on the floor: ${p.y}`);
    }
  }
  // A throw-in every ten minutes, unless someone hit it since.
  const boundary = Math.floor(now / RELAUNCH_MS) * RELAUNCH_MS;
  assert.deepEqual(effectiveHit(1, undefined, now), launch(1, boundary));
  const p = ballAt(1, undefined, now);
  assert.equal(hitBall(1, undefined, now, { x: p.x + 10, y: 0, z: p.z }, { vx: 1, vy: 5, vz: 0 }), null, 'out of reach');
  const hit = hitBall(1, undefined, now, { x: p.x + 1, y: Math.max(0, p.y - 2), z: p.z }, { vx: 50, vy: 99, vz: 0 })!;
  assert.ok(hit, 'within reach');
  assert.ok(Math.hypot(hit.vx, hit.vz) <= HIT_MAX_SIDE + 1e-9 && hit.vy === HIT_UP[1], 'not too hard');
  assert.ok(Math.abs(hit.x - p.x) < 1e-9 && hit.at === now, 'from where the office reckons it is');
  assert.deepEqual(effectiveHit(1, hit, now + 5), hit);
  // Over the crowd's hands it keeps going up again.
  const later = ballAt(1, { x: 3, y: HANDS + 1, z: 0, vx: 0, vy: 3, vz: 0, at: now, n: 5 }, now + 20_000);
  assert.ok(later.y > BALL_R + 0.5, 'still bouncing over the crowd');
  // Hit off over a walkway it comes down and lies still.
  const dead = ballAt(1, { x: 17.5, y: 1, z: -5.4, vx: 0, vy: 1, vz: 0, at: now, n: 5 }, now + 30_000);
  assert.ok(Math.abs(dead.y - BALL_R) < 1e-9 && dead.vy === 0);
});

test('the house mix: its cycle, the drop the DJ calls, the same frame on every page', () => {
  const style = 'techno';
  const barMs = (240 / HOUSE_STYLES[style].bpm) * 1000;
  const parts = new Set<string>();
  for (let b = 0; b < CYCLE_BARS; b++) parts.add(mixAt(style, 0, MIX_EPOCH + (b + 0.5) * barMs).part);
  assert.deepEqual([...parts].sort(), ['breakdown', 'build', 'drop', 'intro']);
  // A drop called mid-bar: the build from the next bar, then the drop.
  const call = MIX_EPOCH + 1000 * barMs + barMs * 0.4;
  assert.equal(mixAt(style, call, call + barMs * 0.8).part, 'build');
  assert.ok(mixAt(style, call, call + barMs * 0.8).called);
  const dropAt = MIX_EPOCH + (1001 + CALLED_BUILD) * barMs;
  const f = mixAt(style, call, dropAt + 10);
  assert.equal(f.part, 'drop');
  assert.ok(f.sinceDrop < 0.05);
  assert.ok(!mixAt(style, call, dropAt + (CALLED_DROP + 1) * barMs).called, 'then the cycle goes on');
  assert.deepEqual(mixFrame(style, call, dropAt + 333), mixFrame(style, call, dropAt + 333));
  const fr = mixFrame('house', 0, MIX_EPOCH + 5000);
  assert.ok(fr.beat >= 0 && fr.beat <= 1 && fr.energy > 0 && fr.bpm === HOUSE_STYLES.house.bpm);
  // Four on the floor in the drop, no kick in the breakdown.
  const drop = mixAt('house', 0, MIX_EPOCH + 30 * barMs);
  assert.equal(drop.part, 'drop');
  assert.equal(mixStep('house', { ...drop, step: 0 }).kick, 1);
  const bd = mixAt('house', 0, MIX_EPOCH + 60 * barMs);
  assert.equal(bd.part, 'breakdown');
  assert.equal(mixStep('house', { ...bd, step: 0 }).kick, 0);
});
