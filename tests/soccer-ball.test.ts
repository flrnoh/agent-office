import test from 'node:test';
import assert from 'node:assert/strict';
import { GOAL, PITCH, PITCH_CX, SOCCER_ROOM } from '../src/shared/soccer.js';
import {
  BALL_R,
  BOARD_E,
  KICK_MAX,
  KICK_MIN,
  type Ball,
  type BallHit,
  ballFromWire,
  ballWire,
  canKick,
  centreBall,
  inGoal,
  kick,
  kickVelocity,
  stepBall,
  still,
} from '../src/shared/soccer-ball.js';

// The soccer hall's ball (flrnoh fork, see FORK.md "The soccer hall"): rolling, the boards, the
// goals with their posts and bar, chips, kicks and dribbling.

const ball = (o: Partial<Ball>): Ball => ({ ...centreBall(), ...o });
const DT = 1 / 30;
/** Runs `b` for `secs`, returning the first goal and everything it hit. */
function run(b: Ball, secs: number) {
  const hits: BallHit[] = [];
  let goal = null;
  let top = b.y;
  for (let t = 0; t < secs; t += DT) {
    const g = stepBall(b, DT, hits);
    goal ??= g;
    top = Math.max(top, b.y);
  }
  return { goal, hits, top };
}

test('a rolling ball slows down on the turf and stops', () => {
  const b = ball({ vz: 6 });
  const { goal } = run(b, 12);
  assert.equal(goal, null);
  assert.ok(still(b), `still moving: ${JSON.stringify(b)}`);
  assert.equal(b.vz, 0);
  // A heavy futsal ball: a 6 m/s pass rolls about 6 m, not the length of the pitch.
  assert.ok(b.z > 5.5 && b.z < 6.5, `rolled to ${b.z}`);
  // Friction only ever takes speed away.
  const c = ball({ vx: 3 });
  let last = 3;
  for (let i = 0; i < 60; i++) {
    stepBall(c, DT);
    assert.ok(c.vx <= last + 1e-9);
    last = c.vx;
  }
});

test('the boards send the ball back and take some of its speed', () => {
  const b = ball({ x: PITCH.maxX - 1, z: 2, vx: 10 });
  const hits: BallHit[] = [];
  for (let i = 0; i < 10 && b.vx > 0; i++) stepBall(b, DT, hits);
  assert.ok(b.vx < 0, 'came back off the east boards');
  assert.ok(b.x <= PITCH.maxX - BALL_R + 1e-9);
  // Roughly BOARD_E of the speed into the boards (a little rolling friction on top).
  assert.ok(-b.vx < 10 * BOARD_E && -b.vx > 10 * BOARD_E * 0.85, `came back at ${-b.vx}`);
  assert.equal(hits.filter((h) => h.kind === 'board').length, 1);
  assert.ok(hits[0].speed > 9);
  // The end boards beside the goal (outside the posts) too.
  const e = ball({ x: PITCH_CX + GOAL.width / 2 + 1, z: PITCH.minZ + 1, vz: -8 });
  const r = run(e, 0.5);
  assert.equal(r.goal, null);
  assert.ok(e.vz > 0 && e.z >= PITCH.minZ + BALL_R - 1e-9);
  // Nothing gets out of the pitch, whatever it does.
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const f = ball({ x: PITCH_CX + 2, vx: Math.sin(a) * 25, vz: Math.cos(a) * 25, vy: (i % 4) * 3 });
    for (let t = 0; t < 180; t++) {
      stepBall(f, DT);
      const x = f.x;
      const z = f.z;
      assert.ok(x > PITCH.minX && x < PITCH.maxX, `out at x ${x}`);
      assert.ok(z > PITCH.minZ - GOAL.depth && z < PITCH.maxZ + GOAL.depth, `out at z ${z}`);
      assert.ok(f.y >= 0 && f.y < SOCCER_ROOM.height);
    }
  }
});

test('a goal is the whole ball over the line, between the posts, under the bar', () => {
  // Straight in, rolling: into the north goal (blue scores there), and it stays in the net.
  const b = ball({ z: PITCH.minZ + 4, vz: -12 });
  const r = run(b, 2);
  assert.equal(r.goal, 'north');
  assert.equal(inGoal(b), 'north');
  assert.ok(b.z > PITCH.minZ - GOAL.depth && b.z < PITCH.minZ);
  assert.ok(r.hits.some((h) => h.kind === 'net'));
  // Into the south one too.
  assert.equal(run(ball({ z: PITCH.maxZ - 3, vz: 10, x: PITCH_CX - 1 }), 2).goal, 'south');
  // On the line isn't over it: not yet a goal.
  assert.equal(inGoal(ball({ z: PITCH.minZ })), null);
  assert.equal(inGoal(ball({ z: PITCH.minZ - BALL_R + 0.01 })), null);
  assert.equal(inGoal(ball({ z: PITCH.minZ - BALL_R - 0.01 })), 'north');
  // Just inside the post: in (it may kiss the post on the way).
  const inside = ball({ x: PITCH_CX + GOAL.width / 2 - BALL_R - 0.03, z: PITCH.minZ + 3, vz: -9 });
  assert.equal(run(inside, 2).goal, 'north');
});

test('the posts and the bar keep a ball out that hits them', () => {
  // Square on the post: it comes back out.
  const post = ball({ x: PITCH_CX + GOAL.width / 2, z: PITCH.minZ + 3, vz: -10 });
  const r = run(post, 2);
  assert.equal(r.goal, null);
  assert.ok(r.hits.some((h) => h.kind === 'post'));
  assert.ok(post.z > PITCH.minZ, 'bounced back into the pitch');
  // Just outside the post: the boards, never a goal.
  const wide = ball({ x: PITCH_CX + GOAL.width / 2 + BALL_R + 0.1, z: PITCH.minZ + 3, vz: -10 });
  assert.equal(run(wide, 2).goal, null);
  // Flying at the bar (the ball's middle at the bar's height): off it.
  const bar = ball({ z: PITCH.minZ + 1.5, y: GOAL.height + GOAL.post - BALL_R, vz: -9, vy: 0.5 });
  const rb = run(bar, 2);
  assert.equal(rb.goal, null);
  assert.ok(rb.hits.some((h) => h.kind === 'bar'), JSON.stringify(rb.hits));
  // Over the bar: the net above the goal sends it back, no goal.
  const over = ball({ z: PITCH.minZ + 1.5, y: 2.6, vz: -9, vy: 1.5 });
  const ro = run(over, 2);
  assert.equal(ro.goal, null);
  assert.ok(over.z > PITCH.minZ - 0.01);
  // Under the bar, in the air: a goal.
  const under = ball({ z: PITCH.minZ + 1.5, y: 1.2, vz: -12, vy: 0.5 });
  assert.equal(run(under, 1).goal, 'north');
});

test('a chip goes up, comes down, bounces a little and rolls on', () => {
  const b = ball({ z: -8 });
  kick(b, 1, 0, 1);
  assert.ok(b.vy > 0 && b.y > 0);
  let top = 0;
  let landedAt = -1;
  const hits: BallHit[] = [];
  for (let i = 0; i < 120; i++) {
    stepBall(b, DT, hits);
    top = Math.max(top, b.y);
    if (landedAt < 0 && hits.some((h) => h.kind === 'floor')) landedAt = b.z;
  }
  assert.ok(top > 1.5 && top < 4.5, `topped out at ${top}`);
  assert.ok(landedAt > -8 + 4, `landed at ${landedAt}`);
  // The first bounce is lower than the flight, and it ends up rolling on the floor.
  assert.equal(b.y, 0);
  assert.equal(b.vy, 0);
  // A low kick stays on the ground.
  const g = ball({});
  kick(g, 0.5, Math.PI / 2, 0);
  assert.equal(g.vy, 0);
  assert.equal(g.y, 0);
  assert.ok(g.vx > 0);
});

test('kicks: power and loft are clamped, and the direction is the facing angle', () => {
  const soft = kickVelocity(0, 0, 0);
  const hard = kickVelocity(1, 0, 0);
  assert.ok(Math.abs(soft.vz - KICK_MIN) < 1e-9 && Math.abs(hard.vz - KICK_MAX) < 1e-9);
  assert.deepEqual(kickVelocity(5, 0, -1), hard);
  assert.deepEqual(kickVelocity(-3, 0, 0), soft);
  assert.deepEqual(kickVelocity(Number.NaN, 0, 0), soft);
  const east = kickVelocity(1, Math.PI / 2, 0);
  assert.ok(east.vx > KICK_MAX - 1e-9 && Math.abs(east.vz) < 1e-9);
  // In reach: close and not over your head.
  assert.ok(canKick(ball({}), PITCH_CX + 1.4, 0));
  assert.ok(!canKick(ball({}), PITCH_CX + 1.6, 0));
  assert.ok(canKick(ball({}), PITCH_CX + 1.6, 0, 0.35));
  assert.ok(!canKick(ball({ y: 1.5 }), PITCH_CX, 0.5));
});

test('the ball goes over the wire and back', () => {
  const b = ball({ x: 1.23456, z: -2.5, y: 0.3, vx: 1, vz: -2, vy: 3 });
  const w = ballWire(b);
  assert.equal(w.length, 6);
  assert.deepEqual(ballFromWire(w), { x: 1.235, z: -2.5, y: 0.3, vx: 1, vz: -2, vy: 3 });
});
