import test from 'node:test';
import assert from 'node:assert/strict';
import { ANCHOR, BODY, BUNGEE, COOLDOWN_MS, COUNTDOWN, MARGIN, bungeeDuration, bungeePlan, bungeePose } from '../src/shared/bungee.js';
import { FLOOR, WALL_T, roofDrop } from '../src/shared/layout.js';
import { BungeeRope, bungeeMessage, type BungeeHooks } from '../src/server/bungee.js';
import { GUEST_MSGS } from '../src/server/guests.js';
import type { ServerMsg } from '../src/shared/protocol.js';

const DROPS = [1, 2, 3, 6, 10].map(roofDrop);

test('bungee motion: starts at the platform, counts down, then dives off the edge', () => {
  for (const drop of DROPS) {
    const p0 = bungeePose(drop, 0);
    assert.equal(p0.phase, 'count');
    assert.deepEqual([p0.x, p0.y, p0.z], [BUNGEE.x, BUNGEE.deckY, BUNGEE.standZ]);
    assert.equal(bungeePose(drop, COUNTDOWN - 0.01).y, BUNGEE.deckY);
    const off = bungeePose(drop, COUNTDOWN + 0.6);
    assert.equal(off.phase, 'fall');
    assert.ok(off.y < BUNGEE.deckY - 1, 'falling');
    assert.ok(off.z > BUNGEE.edgeZ, 'out past the front edge');
  }
});

test('bungee motion: never closer to the street than the margin, and clear of the facade', () => {
  for (const drop of DROPS) {
    const plan = bungeePlan(drop);
    let lowest = Infinity;
    for (let t = 0; t <= plan.end + 0.5; t += 0.01) {
      const p = bungeePose(drop, t);
      // The head hangs BODY below the ankles when head down.
      const head = p.y - BODY * Math.max(0, -Math.cos(p.pitch));
      lowest = Math.min(lowest, head);
      assert.ok(head >= -drop + MARGIN - 1e-6, `drop ${drop} t ${t.toFixed(2)}: head ${head.toFixed(2)} over a street at ${-drop}`);
      if (p.y < 0) assert.ok(p.z > FLOOR.maxZ + WALL_T + 2, `drop ${drop} t ${t.toFixed(2)}: ${p.z.toFixed(2)} too near the facade`);
    }
    // And it uses most of the height.
    assert.ok(lowest < -drop + MARGIN + 0.5, `drop ${drop}: lowest ${lowest.toFixed(2)}`);
  }
});

test('bungee motion: the rope pulls taut where its free length runs out, and the bounces die down', () => {
  for (const drop of DROPS) {
    const plan = bungeePlan(drop);
    let wasTaut = false;
    let caught = NaN;
    const lows: number[] = [];
    const highs: number[] = [];
    let prev = bungeePose(drop, plan.jump);
    let dir = 1;
    for (let t = plan.jump + 0.01; t < plan.winch; t += 0.005) {
      const p = bungeePose(drop, t);
      if (p.taut && !wasTaut && Number.isNaN(caught)) caught = BUNGEE.deckY - p.y;
      wasTaut = p.taut;
      if (dir > 0 && p.y > prev.y) lows.push(prev.y), (dir = -1);
      else if (dir < 0 && p.y < prev.y) highs.push(prev.y), (dir = 1);
      prev = p;
    }
    assert.ok(Math.abs(caught - plan.length) < 0.15, `drop ${drop}: taut at ${caught} m, rope ${plan.length} m`);
    assert.ok(lows.length >= 2, `drop ${drop}: ${lows.length} bounces`);
    for (let i = 1; i < lows.length; i++) assert.ok(lows[i] > lows[i - 1], `drop ${drop}: bounce ${i} deeper than the one before`);
    for (let i = 1; i < highs.length; i++) assert.ok(highs[i] < highs[i - 1], `drop ${drop}: rebound ${i} higher than the one before`);
    // Hanging head down by the time it's done bouncing.
    assert.ok(Math.abs(bungeePose(drop, plan.hang + 0.5).pitch - Math.PI) < 1e-9);
  }
});

test('bungee motion: winched back up and onto the platform, 12 to 18 seconds all told', () => {
  for (const drop of DROPS.slice(0, 4)) {
    const end = bungeeDuration(drop);
    assert.ok(end >= 12 && end <= 18, `drop ${drop}: ${end.toFixed(1)} s`);
  }
  for (const drop of DROPS) {
    const end = bungeeDuration(drop);
    const back = bungeePose(drop, end);
    assert.equal(back.phase, 'done');
    assert.deepEqual([back.x, back.y, back.z], [BUNGEE.x, BUNGEE.deckY, BUNGEE.standZ]);
    const nearly = bungeePose(drop, end - 0.001);
    assert.ok(Math.abs(nearly.y - BUNGEE.deckY) < 0.01 && Math.abs(nearly.z - BUNGEE.standZ) < 0.01, 'no jump at the end');
    // Continuous all along: no teleporting between frames.
    let prev = bungeePose(drop, 0);
    for (let t = 0.01; t <= end; t += 0.01) {
      const p = bungeePose(drop, t);
      const step = Math.hypot(p.x - prev.x, p.y - prev.y, p.z - prev.z);
      assert.ok(step < 0.6, `drop ${drop} t ${t.toFixed(2)}: moved ${step.toFixed(2)} m in 10 ms`);
      prev = p;
    }
  }
  // The anchor's out past the edge, over the street side.
  assert.ok(ANCHOR.z > BUNGEE.edgeZ && ANCHOR.y > BUNGEE.deckY + 2);
});

function hooks(over: Partial<BungeeHooks> = {}) {
  const sent: ServerMsg[] = [];
  const warned: string[] = [];
  const h: BungeeHooks = { id: 'a', who: 'Ann', color: '#f00', onRoof: true, floors: 3, toRoof: (m) => sent.push(m), warn: (t) => warned.push(t), ...over };
  return { h, sent, warned };
}

test('bungee server: only from the roof, one on the rope at a time, a cooldown after', () => {
  let now = new Date(2026, 8, 30, 12, 0, 0).getTime();
  const rope = new BungeeRope(() => now);
  // Off the roof: refused.
  let r = hooks({ onRoof: false });
  bungeeMessage(rope, { t: 'bungee.jump' }, r.h);
  assert.equal(r.sent.length, 0);
  assert.match(r.warned[0], /roof/);
  // On the roof: jumps, to everyone up there, from as high as the building is.
  r = hooks();
  bungeeMessage(rope, { t: 'bungee.jump' }, r.h);
  assert.equal(r.sent.length, 1);
  const msg = r.sent[0] as Extract<ServerMsg, { t: 'bungee' }>;
  assert.equal(msg.t, 'bungee');
  assert.equal(msg.state.jumper, 'a');
  assert.equal(msg.state.startedAt, now);
  assert.equal(msg.state.drop, roofDrop(3));
  assert.equal(msg.state.today, 1);
  // Someone else meanwhile: someone's on the rope.
  const b = hooks({ id: 'b', who: 'Bob' });
  bungeeMessage(rope, { t: 'bungee.jump' }, b.h);
  assert.equal(b.sent.length, 0);
  assert.match(b.warned[0], /on the rope/);
  // Ann again, still on it.
  r = hooks();
  bungeeMessage(rope, { t: 'bungee.jump' }, r.h);
  assert.equal(r.sent.length, 0);
  // Once it's over: nobody on the rope; Ann has to wait a few seconds, Bob can go.
  now += bungeeDuration(roofDrop(3)) * 1000 + 10;
  assert.equal(rope.state().jumper, null);
  r = hooks();
  bungeeMessage(rope, { t: 'bungee.jump' }, r.h);
  assert.equal(r.sent.length, 0);
  assert.match(r.warned[0], /breath/);
  bungeeMessage(rope, { t: 'bungee.jump' }, b.h);
  assert.equal(b.sent.length, 1);
  now += bungeeDuration(roofDrop(3)) * 1000 + COOLDOWN_MS;
  r = hooks();
  bungeeMessage(rope, { t: 'bungee.jump' }, r.h);
  assert.equal(r.sent.length, 1);
  assert.equal(rope.state().today, 3);
});

test('bungee server: leaving the roof takes you off the rope', () => {
  const now = Date.now();
  const rope = new BungeeRope(() => now);
  assert.ok('ok' in rope.jump({ id: 'a', name: 'Ann', color: '#f00' }, 20));
  assert.equal(rope.leave('b'), false);
  assert.equal(rope.leave('a'), true);
  assert.equal(rope.state().jumper, null);
  assert.equal(rope.state().today, 1, 'the jump still counts');
  assert.ok('ok' in rope.jump({ id: 'b', name: 'Bob', color: '#00f' }, 20));
});

test('bungee server: the day’s jumps start again at midnight', () => {
  let now = new Date(2026, 8, 30, 23, 50, 0).getTime();
  const rope = new BungeeRope(() => now);
  for (const id of ['a', 'b']) {
    assert.ok('ok' in rope.jump({ id, name: id, color: '#fff' }, 20));
    now += 60_000;
  }
  assert.equal(rope.state().today, 2);
  now = new Date(2026, 9, 1, 0, 0, 5).getTime();
  assert.equal(rope.state().today, 0);
  assert.ok('ok' in rope.jump({ id: 'c', name: 'c', color: '#fff' }, 20));
  assert.equal(rope.state().today, 1);
});

test('bungee: guests may jump', () => {
  assert.ok(GUEST_MSGS.has('bungee.jump'));
});
