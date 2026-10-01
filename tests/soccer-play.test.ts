import test from 'node:test';
import assert from 'node:assert/strict';
import { PITCH, PITCH_CX } from '../src/shared/soccer.js';
import {
  BALL_R,
  BOARD_E,
  CONTROL_R,
  DRIBBLE_LEAD,
  KICK_MAX,
  KICK_MIN,
  MAX_LIFT,
  PASS_ARRIVE,
  PLAYER_H,
  SHOT_MIN,
  SIM_DT,
  SPRINT_LEAD,
  UNSTICK_GAP,
  type Ball,
  type BallHit,
  type Footer,
  type Mate,
  type Possession,
  type TouchEvent,
  ballWire,
  centreBall,
  kick,
  kickVelocity,
  lobCarry,
  passKick,
  passSpeed,
  pickReceiver,
  rollDistance,
  shotKick,
  simulate,
  stepBall,
  still,
  touchBall,
} from '../src/shared/soccer-ball.js';
import { BUFFER_MS, CHARGE_MS, KickButton, TAP_MS } from '../src/client/soccer/controls.js';
import { BallView, INTERP_MS } from '../src/client/soccer/ball.js';
import { KICK_GAP_MS, KICK_LAG_MS, Soccer } from '../src/server/soccer/index.js';
import type { SoccerServerMsg } from '../src/shared/soccer.js';

// The soccer hall's gameplay (flrnoh fork, see FORK.md "The soccer hall"): the heavy futsal ball, close
// control (dribbling, the first touch, the trap, tackles), passing with the assist, shots aimed up, the
// kick button (tap, hold, the buffer), the office's checks, and the pages' prediction agreeing with the office.

const ball = (o: Partial<Ball> = {}): Ball => ({ ...centreBall(), ...o });
const player = (o: Partial<Footer> = {}): Footer => ({ id: 'ann', team: 'red', x: PITCH_CX, z: 0, vx: 0, vz: 0, facing: 0, free: true, ...o });
const speed = (b: Ball) => Math.hypot(b.vx, b.vz);

/** Rolls `b` until it stops (or `secs`): how far it went. */
function roll(b: Ball, secs = 15): number {
  const x0 = b.x;
  const z0 = b.z;
  for (let t = 0; t < secs && !still(b); t += SIM_DT) stepBall(b, SIM_DT);
  return Math.hypot(b.x - x0, b.z - z0);
}

/** Runs `p` along at its speed for `secs` with the ball, touching it every step as the office does. */
function run(b: Ball, ps: Footer[], poss: Possession, secs: number, events?: TouchEvent[], each?: (t: number) => void) {
  for (let t = 0; t < secs; t += SIM_DT) {
    each?.(t);
    touchBall(b, ps, poss, SIM_DT, events);
    stepBall(b, SIM_DT);
    for (const p of ps) {
      p.x += p.vx * SIM_DT;
      p.z += p.vz * SIM_DT;
    }
  }
}

// ---- The ball ------------------------------------------------------------------------------------

test('a heavy futsal ball: short passes die at 6–8 m, a free tap rolls about 8 m, the roll matches its formula', () => {
  // 6 and 7 m/s: the short passes.
  const six = roll(ball({ z: -12, vz: 6 }));
  const seven = roll(ball({ z: -12, vz: 7 }));
  assert.ok(six > 5.5 && six < 6.5, `6 m/s rolled ${six}`);
  assert.ok(seven > 7 && seven < 8, `7 m/s rolled ${seven}`);
  // The softest kick barely gets going; a firm 10 m/s pass goes well down the pitch but stops.
  assert.ok(roll(ball({ z: -12, vz: KICK_MIN })) < 3.5);
  const ten = roll(ball({ z: -12, vz: 10 }));
  assert.ok(ten > 11 && ten < 14, `10 m/s rolled ${ten}`);
  // The pass planner's formula is the physics' roll.
  for (const v of [4, 6, 9, 12]) assert.ok(Math.abs(roll(ball({ z: -12, vz: v })) - rollDistance(v)) < 0.1, `${v} m/s`);
  // A tap with nobody to pass to: a ground pass along the aim of about 8 m.
  const tap = passKick(ball(), 0, []);
  const b = ball({ z: -12 });
  kick(b, tap.power, tap.dir, tap.loft, tap.lift);
  const d = roll(b);
  assert.ok(d > 7 && d < 9, `a free tap rolled ${d}`);
});

test('it bounces low and settles quickly; off the boards lively but not pinball', () => {
  // Dropped from 2 m: comes up under 25 cm, and lies still on the floor within about a second.
  const b = ball({ y: 2 });
  let landed = false;
  let top = 0;
  let restAt = -1;
  for (let t = 0; t < 3; t += SIM_DT) {
    stepBall(b, SIM_DT);
    if (landed) top = Math.max(top, b.y);
    if (b.y === 0) landed = true;
    if (restAt < 0 && landed && b.y === 0 && b.vy === 0) restAt = t;
  }
  assert.ok(top > 0.05 && top < 0.25, `bounced ${top} m`);
  assert.ok(restAt > 0 && restAt < 1.2, `at rest after ${restAt} s`);
  // A chip's bounces: each lower, the second hardly any.
  const c = ball({ z: -10 });
  kick(c, 1, 0, 1);
  const hits: BallHit[] = [];
  for (let t = 0; t < 4; t += SIM_DT) stepBall(c, SIM_DT, hits);
  const floor = hits.filter((h) => h.kind === 'floor');
  assert.ok(floor.length >= 1 && floor.length <= 3, `${floor.length} bounces`);
  // The boards: back at about BOARD_E of the speed into them, and a 12 m/s ball at them is dead within 5 s.
  const w = ball({ x: PITCH.maxX - 1, z: 3, vx: 12 });
  for (let i = 0; i < 12 && w.vx > 0; i++) stepBall(w, SIM_DT);
  assert.ok(-w.vx > 12 * BOARD_E * 0.9 && -w.vx < 12 * BOARD_E, `came back at ${-w.vx}`);
  roll(w, 5);
  assert.ok(still(w));
});

test('a ball dead against the boards or in a corner rolls back out', () => {
  const corners = [
    [PITCH.minX + BALL_R, PITCH.minZ + BALL_R],
    [PITCH.maxX - BALL_R, PITCH.maxZ - BALL_R],
    [PITCH.minX + BALL_R + 0.02, 4],
    [PITCH.maxX - BALL_R, -6],
    [PITCH_CX + 4, PITCH.maxZ - BALL_R],
  ];
  for (const [x, z] of corners) {
    const b = ball({ x, z });
    simulate(b, 240);
    const gapX = Math.min(b.x - PITCH.minX, PITCH.maxX - b.x) - BALL_R;
    const gapZ = Math.min(b.z - PITCH.minZ, PITCH.maxZ - b.z) - BALL_R;
    assert.ok(gapX >= UNSTICK_GAP - 1e-6 && gapZ >= UNSTICK_GAP - 1e-6, `stuck at ${b.x}, ${b.z}`);
    assert.ok(still(b));
  }
  // But not in the goal's mouth (on the goal line between the posts): that one's for a shot.
  const m = ball({ z: PITCH.minZ + BALL_R });
  simulate(m, 120);
  assert.equal(m.z, PITCH.minZ + BALL_R);
});

// ---- Close control -------------------------------------------------------------------------------

test('dribbling: the ball stays 0.6–0.9 m ahead of your feet at a run, follows a turn, and goes further ahead at a sprint', () => {
  const b = ball();
  const me = player({ z: -1, vz: 4.6 });
  const poss: Possession = { id: null };
  const ev: TouchEvent[] = [];
  run(b, [me], poss, 2, ev);
  assert.equal(poss.id, 'ann');
  assert.deepEqual(ev[0], { kind: 'take', id: 'ann' });
  const ahead = b.z - me.z;
  assert.ok(ahead > 0.6 && ahead < 0.9, `${ahead} m ahead`);
  assert.ok(Math.abs(b.x - me.x) < 0.05);
  assert.ok(Math.abs(DRIBBLE_LEAD - ahead) < 0.1);
  // Turning east: it comes round in front of you, a little after you.
  me.vz = 0;
  me.vx = 4.6;
  run(b, [me], poss, 0.08);
  assert.ok(b.x - me.x < 0.5, 'a little lag on the turn');
  run(b, [me], poss, 0.7);
  assert.equal(poss.id, 'ann');
  assert.ok(b.x - me.x > 0.6 && b.x - me.x < 0.9 && Math.abs(b.z - me.z) < 0.15, `after the turn at ${b.x - me.x}, ${b.z - me.z}`);
  // Sprinting knocks it on further.
  const s = ball();
  const sp = player({ z: -1, vz: 7.5 });
  const sposs: Possession = { id: null };
  run(s, [sp], sposs, 1.5);
  assert.equal(sposs.id, 'ann');
  assert.ok(s.z - sp.z > 1.15 && s.z - sp.z < SPRINT_LEAD + 0.1, `${s.z - sp.z} m ahead at a sprint`);
});

test('stopping traps the ball at your feet; the first touch takes the pace off a pass, not off a rocket', () => {
  const b = ball();
  const me = player({ z: -1, vz: 5 });
  const poss: Possession = { id: null };
  run(b, [me], poss, 1);
  me.vz = 0;
  run(b, [me], poss, 1);
  assert.equal(poss.id, 'ann');
  const d = Math.hypot(b.x - me.x, b.z - me.z);
  assert.ok(d > 0.4 && d < 0.8, `trapped ${d} m off`);
  assert.ok(speed(b) < 0.1, `still rolling at ${speed(b)}`);
  // A 10 m/s pass into someone standing: taken, and it's slow after the touch.
  const p = ball({ z: -8, vz: 10 });
  const r = player({ z: 0, facing: Math.PI });
  const rp: Possession = { id: null };
  const ev: TouchEvent[] = [];
  let after = Infinity;
  run(p, [r], rp, 1.5, ev, () => {
    if (rp.id && after === Infinity) after = speed(p);
  });
  assert.equal(rp.id, 'ann');
  assert.ok(after < 2.5, `after the first touch ${after} m/s`);
  assert.ok(Math.hypot(p.x - r.x, p.z - r.z) < 0.9);
  // A 20 m/s shot at them isn't cushioned: it comes off their body first (and they can go after the rebound).
  const f = ball({ z: -8, vz: 20 });
  const fp: Possession = { id: null };
  const fev: TouchEvent[] = [];
  let back = 0;
  run(f, [player({ z: 0 })], fp, 0.6, fev, () => {
    if (!back && fev.length) back = f.vz;
  });
  assert.equal(fev[0].kind, 'block');
  assert.ok(back < -3, `came back off them at ${back}`);
  // A high ball goes over them.
  const hi = ball({ z: -3, y: PLAYER_H, vz: 8, vy: 2 });
  const hp: Possession = { id: null };
  run(hi, [player({ z: 0 })], hp, 0.8);
  assert.equal(hp.id, null);
  assert.ok(hi.z > 0);
});

test('tackles: the challenger clearly better placed takes it, a close call pops it loose, teammates don’t tackle', () => {
  // Ann dribbles north; Bob runs straight at the ball from in front and gets to it first.
  const b = ball();
  const ann = player({ z: -1, vz: 4 });
  const poss: Possession = { id: null };
  run(b, [ann], poss, 0.5);
  assert.equal(poss.id, 'ann');
  const bob = player({ id: 'bob', team: 'blue', z: b.z + 1.6, vz: -6 });
  const ev: TouchEvent[] = [];
  run(b, [ann, bob], poss, 0.3, ev);
  // Bob's first go at it: he takes it off her, or it's a 50/50.
  const first = ev.find((e) => e.kind !== 'block');
  assert.ok(first, JSON.stringify(ev));
  if (first.kind === 'take') assert.deepEqual(first, { kind: 'take', id: 'bob', from: 'ann' });
  else assert.equal(first.kind, 'loose');
  // Two just as well placed: loose, sideways out from between them, and neither has it.
  const c = ball({ z: 0 });
  const p1 = player({ id: 'p1', z: -0.7 });
  const p2 = player({ id: 'p2', team: 'blue', z: 0.7 });
  const cp: Possession = { id: 'p1' };
  const cev: TouchEvent[] = [];
  // p2 a touch nearer than p1 (whose HOLD_BONUS it just about makes up).
  p2.z = 0.7 - 0.25;
  c.x = PITCH_CX + 0.01;
  touchBall(c, [p1, p2], cp, SIM_DT, cev);
  assert.deepEqual(cev.map((e) => e.kind), ['loose']);
  assert.equal(cp.id, null);
  assert.ok(Math.abs(c.vx) > 3, 'out sideways');
  // A teammate running at it doesn't take it off you.
  const t = ball();
  const me = player({ z: -0.8 });
  const mate = player({ id: 'cat', z: 0.5, vz: -3 });
  const tp: Possession = { id: 'ann' };
  const tev: TouchEvent[] = [];
  touchBall(t, [me, mate], tp, SIM_DT, tev);
  assert.equal(tp.id, 'ann');
  assert.ok(!tev.some((e) => e.kind === 'take'));
  // Not free (just kicked it): no taking it back.
  const k = ball();
  const kp: Possession = { id: null };
  touchBall(k, [player({ z: -0.7, free: false })], kp, SIM_DT);
  assert.equal(kp.id, null);
});

// ---- Passing and shooting ------------------------------------------------------------------------

test('the pass assist: the teammate best in line within the cone, not too near or too far', () => {
  const from = { x: PITCH_CX, z: 0 };
  const m = (id: string, x: number, z: number): Mate => ({ id, x, z, vx: 0, vz: 0 });
  // Straight ahead (north, +z) and a little off to the side: the one in line.
  assert.equal(pickReceiver(from, 0, [m('a', 3, 8), m('b', 0.3, 9)])?.id, 'b');
  // Outside the cone (~40° off): nobody.
  assert.equal(pickReceiver(from, 0, [m('a', 6, 7)]), null);
  // Too close, too far.
  assert.equal(pickReceiver(from, 0, [m('a', 0, 1)]), null);
  assert.equal(pickReceiver(from, 0, [m('a', 0, 25)]), null);
  // Both in line: the nearer.
  assert.equal(pickReceiver(from, 0, [m('far', 0, 12), m('near', 0, 5)])?.id, 'near');
  // Aiming the other way picks the one behind.
  assert.equal(pickReceiver(from, Math.PI, [m('a', 0, 8), m('b', 0.5, -7)])?.id, 'b');
});

test('a pass gets to the teammate, led if they run, at a comfortable pace', () => {
  for (const [label, mate] of [
    ['standing 7 m away', { id: 'b', x: PITCH_CX + 1, z: 7, vx: 0, vz: 0 }],
    ['standing 14 m away', { id: 'b', x: PITCH_CX - 2, z: 13.2 - 0.5, vx: 0, vz: 0 }],
    ['running across', { id: 'b', x: PITCH_CX - 3, z: 8, vx: 4, vz: 0 }],
  ] as [string, Mate][]) {
    const b = ball({ z: -1 });
    const pass = passKick(b, 0, [mate]);
    assert.equal(pass.to, 'b', label);
    if (mate.vx) assert.ok(pass.at.x > mate.x + 1, `${label}: led to ${pass.at.x}`);
    kick(b, pass.power, pass.dir, pass.loft, pass.lift);
    // The receiver runs on; the ball rolls to them: it passes within reach at an easy speed.
    const r = { ...mate };
    let closest = Infinity;
    let at = 0;
    for (let t = 0; t < 4; t += SIM_DT) {
      stepBall(b, SIM_DT);
      r.x += r.vx * SIM_DT;
      r.z += r.vz * SIM_DT;
      const d = Math.hypot(b.x - r.x, b.z - r.z);
      if (d < closest) {
        closest = d;
        at = speed(b);
      }
    }
    assert.ok(closest < CONTROL_R * 0.8, `${label}: missed by ${closest}`);
    assert.ok(at > 1.5 && at < PASS_ARRIVE + 2.5, `${label}: arrives at ${at} m/s`);
  }
  // The pass's speed from the distance: always within the kick's range.
  assert.ok(passSpeed(0.5) === KICK_MIN && passSpeed(100) <= 15);
});

test('a lob goes over a defender and comes down near the teammate', () => {
  const b = ball({ z: -4 });
  const mate: Mate = { id: 'b', x: PITCH_CX, z: 6, vx: 0, vz: 0 };
  const lob = passKick(b, 0, [mate], true);
  assert.equal(lob.to, 'b');
  assert.equal(lob.loft, 1);
  kick(b, lob.power, lob.dir, lob.loft, lob.lift);
  const defender = player({ id: 'def', team: 'blue', z: 1 });
  let overDefender = 0;
  let landedAt = NaN;
  const hits: BallHit[] = [];
  const poss: Possession = { id: null };
  for (let t = 0; t < 3; t += SIM_DT) {
    touchBall(b, [defender], poss, SIM_DT);
    stepBall(b, SIM_DT, hits);
    if (Math.abs(b.z - defender.z) < 0.2) overDefender = b.y;
    if (Number.isNaN(landedAt) && hits.some((h) => h.kind === 'floor')) landedAt = b.z;
  }
  assert.equal(poss.id, null, 'the defender never had it');
  assert.ok(overDefender > PLAYER_H, `over the defender at ${overDefender} m`);
  assert.ok(Math.abs(landedAt - 6) < 2, `came down at ${landedAt}`);
  // Longer lobs go further.
  assert.ok(lobCarry(0.8).d > lobCarry(0.4).d);
});

test('shots go where you aim, up when you look up; the charge sets the power', () => {
  const aim = 0.7;
  const flat = shotKick(aim, 0, 1);
  const v = kickVelocity(flat.power, flat.dir, flat.loft, flat.lift);
  assert.ok(Math.abs(Math.atan2(v.vx, v.vz) - aim) < 1e-9);
  assert.equal(v.vy, 0);
  assert.ok(Math.abs(Math.hypot(v.vx, v.vz) - KICK_MAX) < 1e-9);
  // Looking up 0.15 rad: it rises at that angle.
  const up = shotKick(aim, 0.15, 1);
  const vu = kickVelocity(up.power, up.dir, up.loft, up.lift);
  assert.ok(Math.abs(Math.atan2(vu.vy, Math.hypot(vu.vx, vu.vz)) - 0.15) < 1e-9);
  // Clamped: never steeper than MAX_LIFT, never down into the floor.
  const sky = shotKick(aim, 3, 1);
  assert.equal(sky.lift, MAX_LIFT);
  assert.equal(shotKick(aim, -0.5, 1).lift, 0);
  // The charge: at least SHOT_MIN, full at 1.
  assert.equal(shotKick(0, 0, 0).power, SHOT_MIN);
  assert.equal(shotKick(0, 0, 1).power, 1);
  assert.ok(shotKick(0, 0, 0.5).power > SHOT_MIN && shotKick(0, 0, 0.5).power < 1);
  // A rising shot from 10 m out goes in under the bar; a flat one stays low; a chip goes up and comes down.
  const b = ball({ z: PITCH.maxZ - 10 });
  kick(b, up.power, 0, 0, 0.12);
  const r = simulate(b, 60);
  assert.equal(r, 'south');
  const chip = shotKick(0, 0, 0.6, true);
  assert.equal(chip.loft, 1);
  assert.equal(chip.lift, 0);
});

test('the kick button: a tap passes, a hold shoots charged over 0.9 s, and a kick waits a moment for the ball', () => {
  const k = new KickButton();
  // A tap.
  assert.ok(k.down(1000, false, 'm0'));
  assert.ok(!k.down(1010, true, 'm2'), 'one at a time');
  assert.equal(k.up(1050, 'm2'), null, 'only what held it lets go');
  const tap = k.up(1000 + TAP_MS - 20, 'm0')!;
  assert.equal(tap.shot, false);
  assert.equal(tap.lob, false);
  assert.deepEqual(k.fire(1170, true, 1170), tap);
  assert.equal(k.pending, null);
  // A hold: charging after TAP_MS, full at CHARGE_MS.
  k.down(2000, true, 'KeyC');
  assert.ok(!k.charging(2000 + TAP_MS - 1) && k.charging(2000 + TAP_MS));
  assert.ok(Math.abs(k.charge(2000 + CHARGE_MS / 2) - 0.5) < 1e-9);
  assert.equal(k.charge(2000 + CHARGE_MS * 2), 1);
  const shot = k.up(2000 + 450, 'KeyC')!;
  assert.ok(shot.shot && shot.lob && Math.abs(shot.charge - 0.5) < 1e-9);
  // Early: the ball's not in reach yet; it waits, and goes as soon as it is.
  const t = 2450;
  assert.equal(k.fire(t, false, -1e9), null);
  assert.equal(k.fire(t + 100, false, -1e9), null);
  assert.deepEqual(k.fire(t + 150, true, t + 150), shot);
  // Too early: it's given up after BUFFER_MS.
  k.down(5000, false, 'Space');
  k.up(5050, 'Space');
  assert.equal(k.fire(5050 + BUFFER_MS + 1, true, 5050 + BUFFER_MS + 1), null);
  assert.equal(k.pending, null);
  // Late: the ball went out of reach 150 ms ago: it still goes.
  k.down(6000, false, 'Space');
  k.up(6050, 'Space');
  assert.ok(k.fire(6050, false, 6050 - 150));
  // Too late (300 ms ago), it waits (and nothing comes).
  k.down(7000, false, 'Space');
  k.up(7050, 'Space');
  assert.equal(k.fire(7050, false, 7050 - 300), null);
  // Not allowed (a kickoff): dropped.
  assert.equal(k.fire(7060, true, 7060, false), null);
  assert.equal(k.pending, null);
});

// ---- The office ---------------------------------------------------------------------------------

function hall() {
  let now = 1_000_000;
  const pos = new Map<string, { x: number; z: number; rotY?: number }>();
  const got = new Map<string, SoccerServerMsg[]>();
  const s = new Soccer({ where: (id) => pos.get(id) ?? null, now: () => now, timer: false });
  const add = (id: string) => {
    got.set(id, []);
    pos.set(id, { x: PITCH.minX - 1, z: 0 });
    s.enter({ id, name: id, send: (m) => got.get(id)!.push(m as SoccerServerMsg) });
  };
  const tick = (ms: number) => {
    for (let i = 0; i < Math.round(ms / (1000 / 30)); i++) {
      now += 1000 / 30;
      s.tick(1 / 30);
    }
  };
  const balls = (id: string) => got.get(id)!.filter((m): m is Extract<SoccerServerMsg, { t: 'soccer.ball' }> => m.t === 'soccer.ball');
  return { s, pos, add, tick, balls, now: () => now };
}

test('the office: running onto the ball takes it and dribbles it ahead of you; its snapshots say who has it, on its clock', () => {
  const h = hall();
  h.add('ann');
  h.add('cat');
  h.s.join('ann');
  let z = -2;
  h.pos.set('ann', { x: PITCH_CX, z, rotY: 0 });
  h.tick(100);
  for (let i = 0; i < 30; i++) {
    z += 4.6 * 0.066;
    h.pos.set('ann', { x: PITCH_CX, z, rotY: 0 });
    h.tick(66);
  }
  assert.equal(h.s.poss.id, 'ann');
  const ahead = h.s.ball.z - z;
  assert.ok(ahead > 0.4 && ahead < 1.2, `${ahead} m ahead`);
  const snaps = h.balls('cat');
  assert.equal(snaps.at(-1)!.c, 'ann');
  // Its clock: 60 steps a second.
  const ks = snaps.map((m) => m.k);
  assert.ok(ks.every((k, i) => i === 0 || k >= ks[i - 1]));
  assert.ok(Math.abs(ks.at(-1)! - ks[0] - Math.round(((h.now() - 1_000_000) / 1000) * 60)) <= 2, `${ks[0]}..${ks.at(-1)}`);
});

test('the office: kicks allow for the line’s lag, but not much more; lift is clamped; one kick per 250 ms', () => {
  const h = hall();
  h.add('ann');
  h.s.join('ann');
  h.pos.set('ann', { x: PITCH_CX, z: -1.3 });
  h.tick(100);
  // The ball rolls away from ann (someone else's pass going by): 1 m/s, north.
  h.s.ball.vz = 4;
  h.tick(200);
  const gone = h.s.ball.z + 1.3;
  assert.ok(gone > 1.5 + 0.35, `the ball's ${gone} m off now`);
  // She saw it in reach on her page a moment ago: it counts.
  assert.equal(h.s.kick('ann', 0.5, 0, 0), null);
  // Later than KICK_LAG_MS: too far.
  const g = hall();
  g.add('bob');
  g.s.join('bob');
  g.pos.set('bob', { x: PITCH_CX, z: -1.3 });
  g.tick(100);
  g.s.ball.vz = 6;
  g.tick(KICK_LAG_MS + 250);
  assert.equal(g.s.kick('bob', 0.5, 0, 0), 'too far');
  // Lift: clamped to MAX_LIFT.
  const l = hall();
  l.add('cat');
  l.s.join('cat');
  l.pos.set('cat', { x: PITCH_CX, z: -1.2 });
  l.tick(100);
  assert.equal(l.s.kick('cat', 1, 0, 0, 5), null);
  assert.ok(Math.abs(l.s.ball.vy - KICK_MAX * Math.tan(MAX_LIFT)) < 1e-9);
  // Too soon after.
  l.tick(KICK_GAP_MS - 50);
  assert.equal(l.s.kick('cat', 1, 0, 0), 'too soon');
});

test('the office: a tackle takes the ball off a dribbler, and they get their breath before they can have it back', () => {
  const h = hall();
  h.add('ann');
  h.add('bob');
  h.s.join('ann'); // red
  h.s.join('bob'); // blue
  // Waiting out the kickoff (red or blue), bob out of the way.
  h.pos.set('ann', { x: PITCH_CX, z: -3 });
  h.pos.set('bob', { x: PITCH.maxX - 1, z: 6 });
  h.tick(6000);
  assert.equal(h.s.match.phase, 'play');
  // Ann walks onto the ball and stands with it.
  let z = -2;
  for (let i = 0; i < 20; i++) {
    z += 3 * 0.066;
    h.pos.set('ann', { x: PITCH_CX, z, rotY: 0 });
    h.tick(66);
  }
  h.tick(400);
  assert.equal(h.s.poss.id, 'ann');
  // Bob comes in hard from the front, onto the ball.
  let bz = h.s.ball.z + 3;
  for (let i = 0; i < 12 && h.s.poss.id === 'ann'; i++) {
    bz -= 6 * 0.066;
    h.pos.set('bob', { x: h.s.ball.x, z: bz, rotY: Math.PI });
    h.tick(66);
  }
  assert.notEqual(h.s.poss.id, 'ann', 'ann lost it');
});

// ---- The pages agree with the office -------------------------------------------------------------

test('your page predicts your kick exactly as the office runs it (the same steps, the same numbers)', () => {
  const h = hall();
  h.add('ann');
  h.s.join('ann');
  h.pos.set('ann', { x: PITCH_CX - 0.4, z: -1.1 });
  h.tick(100);
  // Both start from the same snapshot (a ball at rest on the spot: exact on the wire).
  const view = new BallView();
  const last = h.balls('ann').at(-1)!;
  let now = 5000;
  view.snapshot(last.b, last.k, last.c, false, now);
  assert.deepEqual(ballWire(view.b), ballWire(h.s.ball));
  // The same kick, a pass assisted to nobody, then a shot's worth: on the office, and on the page at once.
  const spec = shotKick(0.3, 0.1, 0.7);
  assert.equal(h.s.kick('ann', spec.power, spec.dir, spec.loft, spec.lift), null);
  view.kick(spec, now);
  assert.deepEqual({ ...view.b }, { ...h.s.ball });
  // 20 ticks on (40 physics steps each side): identical, not just close.
  for (let i = 0; i < 20; i++) {
    h.tick(1000 / 30);
    now += 1000 / 30;
    view.update(1 / 30, null, now);
  }
  for (const k of ['x', 'z', 'y', 'vx', 'vz', 'vy'] as const) assert.equal(view.b[k], h.s.ball[k], k);
});

test('everyone else’s page plays the ball back ~100 ms behind the office, smoothly between snapshots, and runs it on when one is late', () => {
  const view = new BallView();
  // A ball rolling north at 6 m/s, a snapshot every 4 steps (15 a second), arriving 40 ms after it's sent.
  const b = ball({ z: -8, vz: 6 });
  const snaps: { k: number; w: ReturnType<typeof ballWire> }[] = [];
  for (let k = 0; k <= 120; k++) {
    if (k % 4 === 0) snaps.push({ k, w: ballWire(b) });
    stepBall(b, SIM_DT);
  }
  const sent = (k: number) => k * SIM_DT * 1000 + 40;
  let i = 0;
  let prevZ = -Infinity;
  let worst = 0;
  for (let t = 0; t <= 1800; t += 16) {
    while (i < snaps.length && sent(snaps[i].k) <= t) {
      view.snapshot(snaps[i].w, snaps[i].k, undefined, false, sent(snaps[i].k));
      i++;
    }
    view.update(0.016, null, t);
    if (t > 300 && t < 1500) {
      // Always moving on (never back), and close to where the real ball was INTERP_MS + 40 ms ago.
      assert.ok(view.shown.z >= prevZ - 1e-6, `went back at ${t}`);
      const truth = ball({ z: -8, vz: 6 });
      simulate(truth, Math.floor((t - 40 - INTERP_MS) / (SIM_DT * 1000)));
      worst = Math.max(worst, Math.abs(view.shown.z - truth.z));
    }
    prevZ = view.shown.z;
  }
  assert.ok(worst < 0.12, `off by up to ${worst} m`);
  // No more snapshots: it runs on a little from the newest, then waits.
  const z0 = view.shown.z;
  view.update(0.016, null, 1800 + 150);
  assert.ok(view.shown.z >= z0);
});

test('your page dribbles the ball at your feet at once, and gives it up when the office says someone else has it', () => {
  const view = new BallView();
  view.snapshot(ballWire(ball({ z: 0.8 })), 10, undefined, false, 1000);
  view.update(0, null, 1000);
  const me = player({ z: 0, vz: 4.6 });
  assert.ok(view.canTake(me));
  view.claim(me, 1000);
  assert.equal(view.poss.id, 'ann');
  let now = 1000;
  for (let i = 0; i < 30; i++) {
    now += 16;
    me.z += me.vz * 0.016;
    view.update(0.016, me, now);
  }
  assert.equal(view.poss.id, 'ann');
  assert.ok(view.b.z - me.z > 0.55 && view.b.z - me.z < 0.95, `${view.b.z - me.z} ahead`);
  // The office has bob on it: off you.
  view.snapshot(ballWire(ball({ z: me.z + 0.8 })), 40, 'bob', false, now);
  assert.equal(view.poss.id, null);
  assert.ok(!view.predicting);
});
