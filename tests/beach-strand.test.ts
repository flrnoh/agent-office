// flrnoh fork (see FORK.md "A day at the beach"): the beach's second round. Beach volleyball (the
// ball's flight, what a landing scores, the office's court with its computer team, and hits it
// won't take), the lighthouse you go up (walked up its stair and out onto the gallery with the
// office's own collisions), and the car park across the road.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { BEACH_PARKING, inSea } from '../src/shared/beach.js';
import { LIGHT_TOUR, lighthouseSolids, moleAt, polar, stepAt } from '../src/shared/lighthouse.js';
import { LIGHTHOUSE, LOOP, LOOP_HALF } from '../src/shared/scenic.js';
import { inTown } from '../src/shared/city.js';
import {
  BALL_R,
  VOLLEY,
  along,
  cpuServe,
  cpuTouch,
  flightAt,
  flightEnd,
  inCourt,
  lobTo,
  driveTo,
  playerHit,
  pointOf,
  serveSpot,
  setWinner,
  sideOf,
  standAt,
  type Flight,
} from '../src/shared/volley.js';
import { BeachCourt, Beaches, volleyMessage } from '../src/server/volley.js';
import type { VolleyServerMsg } from '../src/shared/volley.js';
import { blockerAt, groundAt, stepTo, type Body } from '../src/client/player/collide.js';
import type { Collider } from '../src/client/world/types.js';

const seq = (...xs: number[]) => {
  let i = 0;
  return () => xs[i++ % xs.length];
};

// ---- The ball ---------------------------------------------------------------------------------

test('a lob lands where it was aimed, and a drive too', () => {
  const p = { x: VOLLEY.x, y: 1.2, z: VOLLEY.z - 6 };
  for (const [tx, tz, apex] of [
    [VOLLEY.x + 2, VOLLEY.z + 5, 5],
    [VOLLEY.x - 3, VOLLEY.z + 2, 4.4],
  ]) {
    const f: Flight = { p, v: lobTo(p, tx, tz, apex), t0: 0, side: 0 };
    const end = flightEnd(f);
    assert.equal(end.net, false, 'a high lob clears the net');
    assert.ok(Math.abs(end.x - tx) < 1e-6 && Math.abs(end.z - tz) < 1e-6, `lands at ${tx},${tz}, not ${end.x},${end.z}`);
    assert.ok(Math.abs(along(f, end.s).y - BALL_R) < 1e-6);
  }
  const top = { x: VOLLEY.x, y: 3, z: VOLLEY.z - 1 };
  const f: Flight = { p: top, v: driveTo(top, VOLLEY.x + 1, VOLLEY.z + 5, 15), t0: 0, side: 0 };
  const end = flightEnd(f);
  assert.equal(end.net, false, 'a spike from above the tape goes over');
  assert.ok(Math.abs(end.z - (VOLLEY.z + 5)) < 1e-6);
});

test('a ball driven low into the net drops on the side it came from, and loses the point', () => {
  const p = { x: VOLLEY.x, y: 1.0, z: VOLLEY.z - 3 };
  const f: Flight = { p, v: { x: 0, y: 1, z: 9 }, t0: 1000, side: 0 };
  const end = flightEnd(f);
  assert.equal(end.net, true);
  assert.ok(end.z < VOLLEY.z, 'back on its own side');
  assert.deepEqual(pointOf(f, end), { won: 1, why: 'net' });
  // Where the office has it: along to the net, then down it, then lying there.
  const at = flightAt(f, 1000 + end.s * 1000 + 500);
  assert.ok(Math.abs(at.y - BALL_R) < 1e-9 && Math.abs(at.z - end.z) < 1e-9);
});

test('points: in on a side loses it for that side, out loses it for whoever hit it', () => {
  const p = { x: VOLLEY.x, y: 1.5, z: VOLLEY.z - 5 };
  const inside: Flight = { p, v: lobTo(p, VOLLEY.x, VOLLEY.z + 4, 5), t0: 0, side: 0 };
  assert.equal(pointOf(inside, flightEnd(inside)).won, 0, 'down in side 1: side 0 has it');
  const out: Flight = { p, v: lobTo(p, VOLLEY.x, VOLLEY.z + VOLLEY.halfL + 3, 5), t0: 0, side: 0 };
  assert.deepEqual(pointOf(out, flightEnd(out)), { won: 1, why: 'out' });
  assert.ok(inCourt(VOLLEY.x + VOLLEY.halfW, VOLLEY.z), 'the line is in');
  assert.equal(setWinner([15, 13]), 0);
  assert.equal(setWinner([15, 14]), -1, 'two clear');
  assert.equal(setWinner([20, 21]), 1, 'capped at 21');
});

test('standing about the court: a side on it, near it, or off the beach', () => {
  assert.equal(standAt(VOLLEY.x, VOLLEY.z - 3), 0);
  assert.equal(standAt(VOLLEY.x + 1, VOLLEY.z + 9), 1, 'behind the baseline, serving');
  assert.equal(standAt(VOLLEY.x + 20, VOLLEY.z), -1);
  assert.equal(standAt(0, 0), null);
  assert.equal(sideOf(serveSpot(0).z), 0);
  assert.equal(sideOf(serveSpot(1).z), 1);
});

test('your hits: a bump goes over toward where you face, a set stays up on your side, a spike needs you in the air by the net', () => {
  const r = () => 0.5;
  const ball = { x: VOLLEY.x, y: 1.4, z: VOLLEY.z - 5 };
  const bump = playerHit(ball, { x: ball.x, z: ball.z, yaw: 0, airborne: false, shift: false, serving: false }, r);
  assert.equal(bump.kind, 'bump');
  const end = flightEnd({ p: ball, v: bump.v, t0: 0, side: 0 });
  assert.equal(end.net, false);
  assert.equal(sideOf(end.z), 1, 'over to the other side');
  assert.ok(inCourt(end.x, end.z), 'and in');
  const set = playerHit(ball, { x: ball.x, z: ball.z, yaw: 0, airborne: false, shift: true, serving: false }, r);
  assert.equal(set.kind, 'set');
  assert.equal(sideOf(flightEnd({ p: ball, v: set.v, t0: 0, side: 0 }).z), 0);
  const high = { x: VOLLEY.x, y: 3.1, z: VOLLEY.z - 1 };
  assert.equal(playerHit(high, { x: high.x, z: high.z, yaw: 0, airborne: true, shift: false, serving: false }, r).kind, 'spike');
  assert.equal(playerHit(high, { x: high.x, z: high.z, yaw: 0, airborne: false, shift: false, serving: false }, r).kind, 'bump', 'not off the sand: no spike');
  const spike = playerHit(high, { x: high.x, z: high.z, yaw: 0, airborne: true, shift: false, serving: false }, r);
  const s = flightEnd({ p: high, v: spike.v, t0: 0, side: 0 });
  assert.equal(s.net, false);
  assert.equal(sideOf(s.z), 1);
  // Facing your own baseline, a bump still goes across (not into your own half).
  const back = playerHit(ball, { x: ball.x, z: ball.z, yaw: Math.PI, airborne: false, shift: false, serving: false }, r);
  assert.equal(sideOf(flightEnd({ p: ball, v: back.v, t0: 0, side: 0 }).z), 1);
  // A serve from behind the baseline lands in.
  for (const side of [0, 1] as const) {
    const sp = serveSpot(side);
    const v = playerHit(sp, { x: sp.x, z: sp.z, yaw: side === 0 ? 0 : Math.PI, airborne: false, shift: false, serving: true }, r).v;
    const e = flightEnd({ p: sp, v, t0: 0, side });
    assert.ok(!e.net && inCourt(e.x, e.z) && sideOf(e.z) !== side, `side ${side}'s serve goes in`);
  }
});

test('the computer team: a pass to the front, then over; a serve in', () => {
  const sp = serveSpot(1);
  const serve: Flight = { p: sp, v: cpuServe(1, () => 0.5), t0: 0, side: 1 };
  const e = flightEnd(serve);
  assert.ok(!e.net && inCourt(e.x, e.z) && sideOf(e.z) === 0, 'the computer serves in');
  const first = cpuTouch(serve, 'serve', 0, 0, seq(0.9, 0.5));
  assert.ok(first, 'they take it');
  assert.equal(first!.npc, 0, 'the back player');
  const pass: Flight = { p: first!.at, v: first!.v, t0: 0, side: 0 };
  assert.equal(sideOf(flightEnd(pass).z), 0, 'a pass stays on their side');
  const second = cpuTouch(pass, 'bump', 0, 1, seq(0.5, 0.9, 0.5, 0.5));
  assert.ok(second && second.npc === 1, 'the front player plays it over');
  const over = flightEnd({ p: second!.at, v: second!.v, t0: 0, side: 0 });
  assert.ok(!over.net && sideOf(over.z) === 1 && inCourt(over.x, over.z));
  assert.equal(cpuTouch(serve, 'serve', 0, 0, seq(0.01)), null, 'sometimes they miss');
  assert.equal(cpuTouch(serve, 'serve', 1, 0, seq(0.9)), null, 'not theirs: it comes down on the other side');
});

// ---- The office's court -----------------------------------------------------------------------

function court(rand = seq(0.9, 0.5, 0.3, 0.7)) {
  let now = 1_000_000;
  const sent: VolleyServerMsg[] = [];
  const c = new BeachCourt(() => now, (m) => sent.push(structuredClone(m)), rand);
  return {
    c,
    sent,
    at: () => now,
    run(ms: number) {
      for (let t = 0; t < ms; t += 50) {
        now += 50;
        c.tick();
      }
    },
  };
}

test('nobody about: it rests; someone watching: a show rally; someone on the court: a set, and they serve', () => {
  const k = court(seq(0.9, 0.5, 0.05, 0.7, 0.3));
  assert.equal(k.c.state.ball.k, 'idle');
  k.c.stand('watcher', -1);
  assert.deepEqual(k.c.state.cpu, [true, true], 'the computer plays both sides for the watcher');
  k.run(30_000);
  assert.ok(k.c.state.score[0] + k.c.state.score[1] > 0, 'points are played');
  k.c.stand('anna', 0);
  assert.deepEqual(k.c.state.cpu, [false, true]);
  assert.deepEqual(k.c.state.score, [0, 0], 'a new set');
  assert.deepEqual(k.c.state.ball, { k: 'serve', side: 0 }, 'Anna serves');
  assert.ok(!k.c.busy, 'and it waits for her');
  k.c.stand('watcher', null);
  k.c.stand('anna', null);
  assert.equal(k.c.state.ball.k, 'idle', 'everyone gone: it rests');
  assert.ok(!k.c.busy);
});

test('a serve, the computer plays it back, and a ball let fall is a point', () => {
  const k = court();
  k.c.stand('anna', 0);
  const sp = serveSpot(0);
  assert.equal(k.c.hit('anna', sp, lobTo(sp, VOLLEY.x, VOLLEY.z + 5, 5), 'serve'), true);
  assert.equal(k.c.state.ball.k, 'fly');
  // The computer's touches come by themselves; let it run until the ball's down on Anna's side.
  let guard = 0;
  while (k.c.state.ball.k !== 'down' && guard++ < 400) k.run(50);
  const b = k.c.state.ball;
  assert.equal(b.k, 'down');
  assert.equal(k.c.state.score[0] + k.c.state.score[1], 1);
  const touches = k.sent.filter((m) => m.state.ball.k === 'fly' && m.state.ball.by.startsWith('npc:'));
  assert.ok(touches.length >= 1, 'the computer played it');
  k.run(4000);
  assert.equal(k.c.state.ball.k, 'serve', 'then the next serve');
});

test('hits it won’t take: off the court, the wrong side serving, nowhere near the ball, too often, too hard', () => {
  const k = court();
  k.c.stand('anna', 0);
  k.c.stand('ben', 1);
  k.c.stand('watcher', -1);
  const sp = serveSpot(0);
  const v = lobTo(sp, VOLLEY.x, VOLLEY.z + 5, 5);
  assert.equal(k.c.hit('watcher', sp, v, 'serve'), false, 'not on the court');
  assert.equal(k.c.hit('ben', serveSpot(1), v, 'serve'), false, 'not Ben’s serve');
  assert.equal(k.c.hit('anna', { x: sp.x + 9, y: sp.y, z: sp.z }, v, 'serve'), false, 'nowhere near the ball');
  assert.equal(k.c.hit('anna', sp, { x: 0, y: 40, z: 0 }, 'serve'), false, 'too hard');
  assert.equal(k.c.hit('anna', sp, v, 'serve'), true);
  assert.equal(k.c.hit('anna', sp, v, 'bump'), false, 'not again in a blink');
  // Ben, where the ball's coming down, plays it back over.
  const f = (k.c.state.ball as { f: Flight }).f;
  const end = flightEnd(f);
  k.run((end.s - 0.3) * 1000);
  const at = k.c.ball()!;
  assert.equal(k.c.hit('ben', at, lobTo(at, VOLLEY.x, VOLLEY.z - 4, 5), 'bump'), true);
  assert.equal(k.c.state.ball.k === 'fly' && k.c.state.ball.by, 'ben');
  assert.deepEqual(k.c.state.cpu, [false, false], 'people on both sides: no computer');
});

test('the court on the wire: a page that comes down hears how it is; leaving takes you off', () => {
  const out: [string, VolleyServerMsg][] = [];
  const beaches = new Beaches((floor, m) => out.push([floor, m]), () => 5000);
  const answers: VolleyServerMsg[] = [];
  volleyMessage(beaches, 'f1', 'anna', { t: 'volley.stand', side: -1 }, (m) => answers.push(m));
  assert.equal(answers.length, 1, 'Anna hears how the court is');
  volleyMessage(beaches, 'f1', 'anna', { t: 'volley.stand', side: -1 }, (m) => answers.push(m));
  assert.equal(answers.length, 1, 'once');
  volleyMessage(beaches, 'f1', 'anna', { t: 'volley.stand', side: 7 as never }, (m) => answers.push(m));
  volleyMessage(beaches, 'f1', 'anna', { t: 'volley.stand', side: 1 }, (m) => answers.push(m));
  assert.equal(beaches.of('f1').state.players.anna, 1);
  assert.ok(out.every(([f]) => f === 'f1'), 'only to her floor');
  beaches.leave('f1', 'anna');
  assert.equal(beaches.of('f1').state.players.anna, undefined);
  assert.equal(beaches.of('f1').state.ball.k, 'idle');
  volleyMessage(beaches, undefined, 'x', { t: 'volley.stand', side: 0 }, () => assert.fail('no floor, nothing'));
});

// ---- The lighthouse ---------------------------------------------------------------------------

/** Walks a body toward (x, z) a little at a time, as the player's controller does: an axis at a time, up stairs, falling to what's under it. */
function walk(b: Body, x: number, z: number, maxSteps = 400) {
  for (let i = 0; i < maxSteps; i++) {
    const dx = x - b.pos.x;
    const dz = z - b.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.02) return true;
    const s = Math.min(d, 0.06);
    stepTo(b, b.pos.x + (dx / d) * s, b.pos.z);
    stepTo(b, b.pos.x, b.pos.z + (dz / d) * s);
    const g = groundAt(b.colliders, b.pos.x, b.pos.z, b.pos.y);
    if (g < b.pos.y) b.pos.y = Math.max(g, 0);
    b.grounded = true;
  }
  return false;
}

test('the lighthouse: out along the mole, in at the door, up every step, out onto the gallery', () => {
  const G = 0;
  const colliders = lighthouseSolids(G) as Collider[];
  const L = LIGHTHOUSE;
  const T = LIGHT_TOUR;
  const { x0 } = moleAt();
  const b: Body = { pos: new THREE.Vector3(x0 + 2, G, L.z), colliders, grounded: true, stepOffset: 0 };
  // Along the mole, and never in the sea.
  for (let x = x0; x > L.x + T.plinth + 0.5; x -= 1) {
    assert.ok(walk(b, x, L.z), `along the mole at x ${x.toFixed(1)}`);
    assert.ok(b.pos.y > G + 0.05 || !inSea(b.pos.x, b.pos.z), 'up out of the water');
  }
  assert.ok(walk(b, L.x + T.r0 + 1, L.z), 'up onto the plinth');
  assert.equal(b.pos.y, G + T.floor);
  assert.ok(walk(b, L.x + 1.4, L.z), 'in at the door');
  // Round and up the stair, keeping to the middle of the treads.
  let reached = 0;
  for (let i = 0; i < T.steps; i++) {
    for (const k of [0.25, 0.5, 0.75, 1]) {
      const a = stepAt(i).a - 0.35 + k * ((Math.PI * 2) / T.perTurn);
      const p = polar(T.stairR + 0.1, a);
      assert.ok(walk(b, p.x, p.z), `stuck by step ${i}`);
    }
    reached = Math.max(reached, b.pos.y);
  }
  assert.ok(Math.abs(b.pos.y - (G + T.top)) < 1e-6, `at the top (${b.pos.y.toFixed(2)} of ${T.top})`);
  // Through the glass door onto the gallery, then round it, by the railing.
  assert.ok(walk(b, polar(T.lantern - 0.5, 0).x, L.z), 'to the glass door');
  assert.ok(walk(b, polar(T.gallery - 0.9, 0).x, L.z), 'out onto the gallery');
  assert.equal(b.pos.y, G + T.top);
  for (let a = 0; a < Math.PI * 2; a += 0.2) {
    const p = polar(T.gallery - 0.9, a);
    walk(b, p.x, p.z);
    assert.equal(b.pos.y, G + T.top, 'still up on the gallery');
  }
  // The railing keeps you on it.
  const out = polar(T.gallery + 2, 0.5);
  walk(b, out.x, out.z, 200);
  assert.ok(Math.hypot(b.pos.x - L.x, b.pos.z - L.z) < T.gallery, 'not over the railing');
  assert.ok(blockerAt(b, out.x, out.z, b.pos.y) !== null || Math.hypot(b.pos.x - L.x, b.pos.z - L.z) < T.gallery);
});

test('the car park is clear of the road, the town and the sea; its cars in their bays', () => {
  const P = BEACH_PARKING;
  for (const p of LOOP) {
    const nearest = Math.max(P.minX - p.x, 0, p.x - P.maxX) ** 2 + Math.max(P.minZ - p.z, 0, p.z - P.maxZ) ** 2;
    assert.ok(Math.sqrt(nearest) > LOOP_HALF + 1, `the road at ${p.x.toFixed(0)},${p.z.toFixed(0)} runs through the car park`);
  }
  for (const [x, z] of [
    [P.minX, P.minZ],
    [P.maxX, P.maxZ],
    [P.minX, P.maxZ],
    [P.maxX, P.minZ],
  ]) {
    assert.ok(!inTown(x, z) && !inSea(x, z));
  }
  for (const c of P.parked) {
    assert.ok(c.x > P.minX && c.x < P.maxX && c.z > P.minZ + 1 && c.z < P.maxZ - 1);
    assert.ok(Math.abs(c.z - P.drive.z) > P.drive.width / 2 + 1, 'not in the driveway');
  }
});
