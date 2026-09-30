import test from 'node:test';
import assert from 'node:assert/strict';
import { seeded } from '../src/shared/tablegames/game.js';
import { GAMES } from '../src/shared/tablegames/index.js';
import { HOCKEY, hockey, hockeyGoal } from '../src/shared/tablegames/hockey.js';
import { KICKER, RODS, kicker, kickerGoal, manV, slideFor } from '../src/shared/tablegames/kicker.js';
import { PHASE, PONG, hitBall, pingpong, pongWinner, serverFor } from '../src/shared/tablegames/pingpong.js';
import { NOTE, POCKETS, POOL, POOL_PHASE, bestShot, canPlace, groupOf, pool, rack, settle, type PoolState } from '../src/shared/tablegames/pool.js';
import { TABLES, TABLE_IDS, inputOk, snapOk, standSpot, tableToWorld, worldToTable, type TableId } from '../src/shared/tablegames/tables.js';

const rng = () => seeded(7);

// ---- The tables ---------------------------------------------------------------------------------

test('tables: the table frame and the roof agree both ways', () => {
  for (const id of TABLE_IDS) {
    const t = { ...TABLES[id], rotY: 0.7 };
    const w = tableToWorld(t, 0.4, -0.2);
    const back = worldToTable(t, w.x, w.z);
    assert.ok(Math.abs(back.u - 0.4) < 1e-9 && Math.abs(back.v + 0.2) < 1e-9);
  }
  // Each side stands off its own end (or side), facing the middle.
  const s0 = standSpot(TABLES.hockey, 0);
  assert.ok(s0.x < TABLES.hockey.x - HOCKEY.halfL);
  assert.ok(Math.abs(s0.facing - Math.PI / 2) < 1e-9);
});

test('tables: the tables stand apart, clear of each other and of where people stand', () => {
  const box = (id: TableId) => {
    const t = TABLES[id];
    return { minX: t.x - t.outerLength / 2, maxX: t.x + t.outerLength / 2, minZ: t.z - t.outerWidth / 2, maxZ: t.z + t.outerWidth / 2 };
  };
  for (const a of TABLE_IDS) {
    for (const b of TABLE_IDS) {
      if (a >= b) continue;
      const A = box(a);
      const B = box(b);
      const apart = A.maxX + 1 < B.minX || B.maxX + 1 < A.minX || A.maxZ + 1 < B.minZ || B.maxZ + 1 < A.minZ;
      assert.ok(apart, `${a} and ${b} overlap`);
    }
  }
});

test('tables: what the office passes on from a page', () => {
  assert.ok(snapOk({ s: [1, 2, 3], score: [0, 3], win: -1 }));
  assert.ok(snapOk({ s: [], score: [7, 3], win: 0, ev: [1, 0.1, 0.2] }));
  assert.ok(!snapOk({ s: [NaN], score: [0, 0], win: -1 }));
  assert.ok(!snapOk({ s: new Array(500).fill(0), score: [0, 0], win: -1 }));
  assert.ok(!snapOk({ s: [], score: [0, 100], win: -1 }));
  assert.ok(!snapOk({ s: [], score: [0, 0], win: 2 }));
  assert.ok(!snapOk({ s: [], score: [0, 0], win: -1, ev: [1, 2] }));
  assert.ok(!snapOk({ s: ['x'], score: [0, 0], win: -1 }));
  assert.ok(inputOk([0, 0.5, -0.2]));
  assert.ok(!inputOk([]));
  assert.ok(!inputOk([0, 1, 2, 3, 4]));
  assert.ok(!inputOk([0, Infinity]));
  assert.ok(!inputOk('move'));
});

test('tables: every game goes over the wire and comes back the same', () => {
  for (const id of TABLE_IDS) {
    const g = GAMES[id];
    const r = rng();
    const s = g.init(r);
    for (let i = 0; i < 90; i++) {
      for (const side of [0, 1] as const) for (const a of g.cpu(s, side, 1 / 60, r)) g.input(s, side, a);
      g.step(s, 1 / 60, [], r);
    }
    const once = g.encode(s);
    assert.deepEqual(g.encode(g.decode(once)), once, id);
    assert.ok(snapOk({ s: once, score: s.score, win: s.win }), `${id} snapshot passes the office's check`);
  }
});

test('tables: the computer plays every game to the end against itself', () => {
  for (const id of TABLE_IDS) {
    const g = GAMES[id];
    const r = seeded(3);
    const s = g.init(r);
    let t = 0;
    while (s.win === -1 && t < 900) {
      for (const side of [0, 1] as const) for (const a of g.cpu(s, side, 1 / 60, r)) g.input(s, side, a);
      g.step(s, 1 / 60, [], r);
      t += 1 / 60;
    }
    assert.notEqual(s.win, -1, `${id} ended`);
  }
});

// ---- Air hockey ---------------------------------------------------------------------------------

test('air hockey: a goal only through the mouth, all the way over the line', () => {
  assert.equal(hockeyGoal(-HOCKEY.halfL - 0.05, 0), 0);
  assert.equal(hockeyGoal(HOCKEY.halfL + 0.05, 0.1), 1);
  assert.equal(hockeyGoal(-HOCKEY.halfL - 0.05, HOCKEY.goal + 0.01), -1);
  assert.equal(hockeyGoal(-HOCKEY.halfL + 0.01, 0), -1);
});

test('air hockey: a shot into the goal scores for the other side, off the rail it bounces', () => {
  const r = rng();
  const s = hockey.init(r);
  s.pause = 0;
  s.p = [-0.6, 0.02, -5, 0];
  // Side 0's mallet out of the way.
  s.m[0] = [-0.3, 0.4, 0, 0];
  s.to[0] = [-0.3, 0.4];
  const ev: number[] = [];
  hockey.step(s, 0.3, ev, r);
  assert.deepEqual(s.score, [0, 1]);
  assert.ok(ev.includes(3));
  // The puck is back on the side that let it in, waiting.
  assert.ok(s.p[0] < 0 && s.pause > 0);

  const t = hockey.init(r);
  t.pause = 0;
  t.p = [-0.6, 0.35, -5, 0];
  t.m[0] = [-0.3, -0.4, 0, 0];
  t.to[0] = [-0.3, -0.4];
  hockey.step(t, 0.2, [], r);
  assert.deepEqual(t.score, [0, 0]);
  assert.ok(t.p[2] > 0, 'it came back off the end rail');
});

test('air hockey: mallets stay in their own half, and the seventh goal wins', () => {
  const r = rng();
  const s = hockey.init(r);
  hockey.input(s, 0, [0, 0.8, 2]);
  assert.ok(s.to[0][0] < 0 && s.to[0][1] <= HOCKEY.halfW);
  s.score = [6, 2];
  s.pause = 0;
  s.p = [0.6, 0, 6, 0];
  s.m[1] = [0.3, 0.4, 0, 0];
  s.to[1] = [0.3, 0.4];
  hockey.step(s, 0.3, [], r);
  assert.equal(s.win, 0);
});

// ---- Table tennis -------------------------------------------------------------------------------

test('table tennis: two serves each, then one each from 10–10; 11 by two wins', () => {
  assert.equal(serverFor([0, 0]), 0);
  assert.equal(serverFor([1, 0]), 0);
  assert.equal(serverFor([1, 1]), 1);
  assert.equal(serverFor([2, 1]), 1);
  assert.equal(serverFor([2, 2]), 0);
  assert.equal(serverFor([10, 10]), 0);
  assert.equal(serverFor([11, 10]), 1);
  assert.equal(pongWinner([11, 9]), 0);
  assert.equal(pongWinner([11, 10]), -1);
  assert.equal(pongWinner([10, 12]), 1);
  assert.equal(pongWinner([5, 3]), -1);
});

/** A rally where side `hitter` has just hit the ball from its end. */
function rally(hitter: 0 | 1) {
  const r = rng();
  const s = pingpong.init(r);
  s.phase = PHASE.rally;
  const e = PONG.halfL + 0.2;
  s.b = [hitter === 0 ? -e : e, 0, 0.25, 0, 0, 0];
  hitBall(s, hitter, PONG.sweet, 0, 0, r);
  return { s, r };
}

test('table tennis: a return nobody touches is the hitter’s point', () => {
  const { s, r } = rally(0);
  const ev: number[] = [];
  for (let i = 0; i < 180 && s.phase === PHASE.rally; i++) pingpong.step(s, 1 / 60, ev, r);
  // It bounced on side 1's half first.
  assert.ok(ev.includes(6));
});

test('table tennis: the receiver swinging on time sends it back', () => {
  const { s, r } = rally(0);
  s.to[1] = [PONG.halfL + 0.25, s.b[1] + s.b[4] * 0.5];
  let hits = 0;
  for (let i = 0; i < 120 && s.last === 0; i++) {
    // Follow the ball across, and swing as it comes near.
    s.to[1] = [PONG.halfL + 0.25, s.b[1]];
    if (s.landed === 1 && s.sw[1] === 0 && Math.abs(s.b[0] - s.pad[1][0]) < 0.3) pingpong.input(s, 1, [1]);
    const ev: number[] = [];
    pingpong.step(s, 1 / 60, ev, r);
    hits += ev.filter((x, k) => k % 3 === 0 && x === 1).length;
  }
  assert.equal(s.last, 1, 'side 1 hit it back');
  assert.equal(hits, 1);
  assert.deepEqual(s.score, [0, 0]);
});

test('table tennis: into the net and down on your own side is the other’s point', () => {
  const r = rng();
  const s = pingpong.init(r);
  s.phase = PHASE.rally;
  s.last = 0;
  s.landed = -1;
  // Low and flat at the net.
  s.b = [-0.2, 0, 0.1, 3, 0, 0.5];
  const ev: number[] = [];
  for (let i = 0; i < 120 && s.phase === PHASE.rally; i++) pingpong.step(s, 1 / 60, ev, r);
  assert.ok(ev.some((x, k) => k % 3 === 0 && x === 7), 'into the net');
  assert.deepEqual(s.score, [0, 1]);
});

test('table tennis: the server’s swing puts the ball in play over the net', () => {
  const r = rng();
  const s = pingpong.init(r);
  assert.equal(s.phase, PHASE.serve);
  pingpong.input(s, 0, [1]);
  for (let i = 0; i < 10; i++) pingpong.step(s, 1 / 60, [], r);
  assert.equal(s.phase, PHASE.rally);
  assert.ok(s.b[3] > 0, 'toward side 1');
});

// ---- Kicker -------------------------------------------------------------------------------------

test('kicker: the rods, and sliding one so a man lines up with where you point', () => {
  assert.equal(RODS.length, 8);
  assert.equal(RODS.filter((r) => r.side === 0).reduce((n, r) => n + r.men, 0), 11);
  for (const r of RODS) {
    for (const v of [-0.3, -0.1, 0, 0.13, 0.3]) {
      const off = slideFor(r, v);
      assert.ok(Math.abs(off) <= r.range + 1e-9);
      // No man goes through the side of the table.
      for (let i = 0; i < r.men; i++) assert.ok(Math.abs(manV(r, i, off)) < KICKER.halfW);
    }
  }
  // The goalkeeper follows the ball across the goal.
  assert.ok(Math.abs(manV(RODS[0], 0, slideFor(RODS[0], 0.05)) - 0.05) < 1e-9);
});

test('kicker: a goal only through the mouth, and it counts for the other side', () => {
  assert.equal(kickerGoal(-KICKER.halfL - 0.03, 0), 0);
  assert.equal(kickerGoal(KICKER.halfL + 0.03, -0.05), 1);
  assert.equal(kickerGoal(KICKER.halfL + 0.03, 0.2), -1);
  const r = rng();
  const s = kicker.init(r);
  s.pause = 0;
  // Rolling hard into side 1's goal, through a gap in its men.
  s.b = [0.58, 0.0, 3, 0];
  s.off = s.off.map(() => 0);
  const ev: number[] = [];
  kicker.step(s, 0.05, ev, r);
  assert.ok(ev.includes(3));
});

test('kicker: a kick sends the ball toward the other goal', () => {
  const r = rng();
  const s = kicker.init(r);
  s.pause = 0;
  // Just in front of side 0's midfielder in the middle.
  const mid = RODS.findIndex((x) => x.side === 0 && x.men === 5);
  s.b = [RODS[mid].u + 0.03, manV(RODS[mid], 2, 0), 0, 0];
  kicker.input(s, 0, [0, s.b[1]]);
  kicker.input(s, 0, [1]);
  const ev: number[] = [];
  kicker.step(s, 1 / 60, ev, r);
  assert.ok(s.b[2] > 1.5, `the ball flies toward +u (${s.b[2]})`);
  assert.ok(ev.includes(9));
});

// ---- Pool ---------------------------------------------------------------------------------------

test('pool: the rack has every ball once, the 8 in the middle', () => {
  const balls = rack(rng());
  assert.equal(balls.length, 16);
  assert.ok(balls.every((b) => b[4] === 1));
  // Nothing overlaps.
  for (let i = 0; i < 16; i++) for (let j = i + 1; j < 16; j++) assert.ok(Math.hypot(balls[i][0] - balls[j][0], balls[i][1] - balls[j][1]) >= POOL.ball * 2 - 1e-6);
  const xs = balls.slice(1).map((b) => b[0]);
  assert.ok(Math.abs(balls[8][0] - (Math.min(...xs) + Math.max(...xs)) / 2) < 0.001);
  assert.deepEqual([groupOf(0), groupOf(3), groupOf(8), groupOf(12)], [0, 1, 0, 2]);
});

/** A table with only the balls in `on` (and the cue ball), side `turn` to play. */
function table(on: number[], turn: 0 | 1 = 0, groups: [number, number] = [0, 0]): PoolState {
  const s = pool.init(rng());
  s.balls.forEach((b, n) => (b[4] = n === 0 || on.includes(n) ? 1 : 0));
  s.turn = turn;
  s.groups = groups;
  s.hand = false;
  return s;
}

/** Plays a shot from the cue ball at (cu, cv), `angle`, `power`, to the end. */
function shoot(s: PoolState, cu: number, cv: number, angle: number, power: number) {
  s.balls[0] = [cu, cv, 0, 0, 1];
  pool.input(s, s.turn, [1, angle, power]);
  const r = rng();
  for (let i = 0; i < 60 * 20 && s.phase === POOL_PHASE.rolling; i++) pool.step(s, 1 / 60, [], r);
}

test('pool: a ball into a pocket drops; potting on the open table gives you that group and another shot', () => {
  const s = table([3]);
  const p = POCKETS[5]; // the far corner, +u +v
  s.balls[3] = [p.u - 0.2, p.v - 0.2, 0, 0, 1];
  // Straight through the 3 into the corner.
  const cu = p.u - 0.6;
  const cv = p.v - 0.6;
  shoot(s, cu, cv, Math.PI / 4, 0.5);
  assert.equal(s.balls[3][4], 0, 'the 3 went down');
  assert.equal(s.turn, 0, 'you go again');
  assert.deepEqual(s.groups, [1, 2]);
  assert.equal(s.note, NOTE.groups);
});

test('pool: missing hands the table over; the cue ball down is ball in hand for the other', () => {
  const s = table([3, 11], 0, [1, 2]);
  s.balls[3] = [0.5, 0.3, 0, 0, 1];
  s.balls[11] = [0.5, -0.3, 0, 0, 1];
  // At the 3, gently, nothing goes down.
  shoot(s, -0.5, 0.3, 0, 0.35);
  assert.equal(s.turn, 1);
  assert.equal(s.note, NOTE.missed);
  assert.equal(s.hand, false);

  const t = table([3], 0, [1, 2]);
  t.balls[3] = [0.3, 0.3, 0, 0, 1];
  // Straight into the corner pocket with the cue ball alone.
  const c = POCKETS[0];
  shoot(t, c.u + 0.3, c.v + 0.3, Math.atan2(-0.3, -0.3), 0.4);
  assert.equal(t.note, NOTE.scratch);
  assert.equal(t.turn, 1);
  assert.equal(t.hand, true);
  assert.equal(t.balls[0][4], 1, 'the cue ball is back');
  assert.ok(t.balls[0][0] <= POOL.kitchen, 'behind the head string');
});

test('pool: hitting the other group first is a foul', () => {
  const s = table([3, 11], 0, [1, 2]);
  s.balls[11] = [0, 0, 0, 0, 1];
  s.balls[3] = [0.8, 0.4, 0, 0, 1];
  shoot(s, -0.5, 0, 0, 0.4);
  assert.equal(s.note, NOTE.wrongFirst);
  assert.equal(s.turn, 1);
  assert.equal(s.hand, true);
});

test('pool: the 8 wins once your group is cleared, and loses before', () => {
  const settleWith = (s: PoolState, first: number, down: number[]) => {
    s.first = first;
    s.down = down;
    for (const n of down) s.balls[n][4] = 0;
    s.phase = POOL_PHASE.rolling;
    settle(s);
    return s;
  };
  // Solids all gone: the 8 wins.
  const done = settleWith(table([8, 9, 10], 0, [1, 2]), 8, [8]);
  assert.equal(done.win, 0);
  assert.equal(done.note, NOTE.eight);
  // Solids still up: the 8 loses.
  const early = settleWith(table([2, 8, 9], 0, [1, 2]), 2, [8]);
  assert.equal(early.win, 1);
  // Cleared, but the cue ball went down too: that loses as well.
  const scratch = settleWith(table([8], 1, [1, 2]), 8, [8, 0]);
  assert.equal(scratch.win, 0);
  // The last of your group and the 8 on the same shot: not cleared before it, so it loses.
  const both = settleWith(table([7, 8], 0, [1, 2]), 7, [7, 8]);
  assert.equal(both.win, 1);
});

test('pool: the cue ball in hand goes only behind the head string, clear of the balls', () => {
  const s = table([3]);
  s.balls[3] = [POOL.kitchen - 0.2, 0, 0, 0, 1];
  assert.ok(canPlace(s, POOL.kitchen - 0.1, 0.3));
  assert.ok(!canPlace(s, POOL.kitchen + 0.1, 0));
  assert.ok(!canPlace(s, POOL.kitchen - 0.2, 0.03));
  assert.ok(!canPlace(s, -POOL.halfL, 0));
  s.hand = true;
  pool.input(s, 0, [2, POOL.kitchen - 0.1, 0.3]);
  assert.deepEqual(s.balls[0].slice(0, 2), [POOL.kitchen - 0.1, 0.3]);
  // Not on the other player's turn.
  pool.input(s, 1, [2, POOL.kitchen - 0.3, -0.3]);
  assert.deepEqual(s.balls[0].slice(0, 2), [POOL.kitchen - 0.1, 0.3]);
});

test('pool: the computer lines up a clean pot when there is one', () => {
  const s = table([5], 1, [2, 1]);
  const p = POCKETS[2];
  s.balls[5] = [p.u - 0.3, p.v + 0.3, 0, 0, 1];
  s.balls[0] = [p.u - 0.9, p.v + 0.9, 0, 0, 1];
  const shot = bestShot(s);
  assert.ok(shot.value > 0);
  assert.ok(Math.abs(shot.angle - Math.atan2(-0.6, 0.6)) < 0.05);
  shoot(s, s.balls[0][0], s.balls[0][1], shot.angle, shot.power);
  assert.equal(s.balls[5][4], 0, 'potted');
});
