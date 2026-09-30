import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DOWN_FIRST,
  REP_PEAK,
  REP_SECONDS,
  SET_LEAD,
  SET_TAIL,
  barPlates,
  cardioHz,
  ease,
  failExtent,
  grindExtent,
  nearestSize,
  repExtent,
  repPeakAt,
  repSeconds,
  rowStroke,
  setAttempts,
  setDurationMs,
  setMotion,
  stackPlates,
} from '../src/shared/gym-motion.js';
import { EXERCISES } from '../src/shared/gym-strength.js';
import { CARDIO_MACHINES } from '../src/shared/gym-cardio.js';
import { GYM_STATIONS } from '../src/shared/gym.js';
import { Gym } from '../src/server/gym/index.js';
import type { StrengthView } from '../src/shared/gym-strength.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// How the gym's equipment moves (flrnoh fork): the tempo a set is worked at, where its reps are,
// which plates are on a bar, how many of a stack the pin picks, and the cardio cadences.

test('every strength station has a rep tempo, a natural one', () => {
  for (const s of GYM_STATIONS.filter((d) => d.kind === 'strength')) {
    assert.ok(REP_SECONDS[s.machine], `${s.machine} has a tempo`);
    assert.ok(repSeconds(s.machine) >= 0.8 && repSeconds(s.machine) <= 2.5);
  }
  assert.ok(Object.keys(REP_SECONDS).every((m) => m in EXERCISES));
  assert.equal(repSeconds('nope'), 1.4);
});

test('a set lasts its lead-in, its reps and racking it', () => {
  assert.equal(setDurationMs('bench', 5), Math.round((SET_LEAD + 5 * REP_SECONDS.bench + SET_TAIL) * 1000));
  // Nothing tried still takes a rep's time (a refused lift is never zero-length).
  assert.equal(setDurationMs('bench', 0), setDurationMs('bench', 1));
  assert.equal(setAttempts({ reps: 7, failed: true }), 8);
  assert.equal(setAttempts({ reps: 7, failed: false }), 7);
  assert.equal(setAttempts(undefined), 0);
  // The window's rep sound lands at each rep's far point.
  assert.equal(repPeakAt('squat', 0), SET_LEAD + REP_PEAK * REP_SECONDS.squat);
  assert.ok(Math.abs(repPeakAt('squat', 3) - repPeakAt('squat', 2) - REP_SECONDS.squat) < 1e-9);
});

test('a clean rep goes out to its far point and all the way back', () => {
  assert.equal(repExtent(0), 0);
  assert.equal(repExtent(1), 0);
  assert.ok(Math.abs(repExtent(REP_PEAK) - 1) < 1e-9);
  for (let u = 0; u <= 1; u += 0.01) {
    const e = repExtent(u);
    assert.ok(e >= 0 && e <= 1, `extent ${e} at ${u}`);
  }
  // Up quicker than down.
  assert.ok(repExtent(REP_PEAK / 2) > repExtent(REP_PEAK + (1 - REP_PEAK) / 2) - 0.01);
});

test('a broken rep stalls halfway (or stuck at the bottom for lifts that go down first)', () => {
  let most = 0;
  for (let u = 0; u < 1; u += 0.01) most = Math.max(most, failExtent(u));
  assert.ok(most > 0.4 && most < 0.6);
  assert.equal(failExtent(1), 0);
  assert.ok(grindExtent(0.4) > 0.99);
  assert.ok(grindExtent(0.7) > 0.55 && grindExtent(0.7) < 0.8);
  assert.equal(grindExtent(1), 0);
  assert.ok(DOWN_FIRST.has('bench') && DOWN_FIRST.has('squat') && !DOWN_FIRST.has('deadlift'));
});

test('setMotion walks a set from the lead-in through the reps to racking it', () => {
  const rep = REP_SECONDS.deadlift;
  assert.equal(setMotion('deadlift', -1, 3, false).stage, 'lead');
  const lead = setMotion('deadlift', SET_LEAD / 2, 3, false);
  assert.equal(lead.stage, 'lead');
  assert.ok(lead.hold > 0 && lead.hold < 1);
  const peak = setMotion('deadlift', SET_LEAD + rep * (1 + REP_PEAK), 3, false);
  assert.equal(peak.stage, 'rep');
  assert.equal(peak.rep, 1);
  assert.ok(peak.extent > 0.99);
  assert.equal(peak.hold, 1);
  assert.ok(Math.abs(peak.u - REP_PEAK) < 1e-9);
  // The last of three reps is the one that breaks, when it does.
  assert.equal(setMotion('deadlift', SET_LEAD + rep * 2.5, 3, true).failing, true);
  assert.equal(setMotion('deadlift', SET_LEAD + rep * 1.5, 3, true).failing, false);
  const tail = setMotion('deadlift', SET_LEAD + rep * 3 + SET_TAIL / 2, 3, false);
  assert.equal(tail.stage, 'tail');
  assert.ok(tail.hold < 1 && tail.hold > 0);
  assert.equal(setMotion('deadlift', setDurationMs('deadlift', 3) / 1000 + 0.01, 3, false).stage, 'done');
  // Nothing tried: nothing to show.
  assert.equal(setMotion('deadlift', 1, 0, false).stage, 'done');
});

test('the pin picks more of the stack the heavier the weight, never none', () => {
  assert.equal(stackPlates(0, 200, 12), 1);
  assert.equal(stackPlates(200, 200, 12), 12);
  assert.equal(stackPlates(999, 200, 12), 12);
  assert.equal(stackPlates(100, 200, 12), 6);
  let last = 0;
  for (let w = 5; w <= 200; w += 5) {
    const n = stackPlates(w, 200, 12);
    assert.ok(n >= last);
    last = n;
  }
  assert.equal(stackPlates(50, 0, 12), 1);
});

test('a barbell carries the weight in plates, biggest first, the same both sides', () => {
  assert.deepEqual(barPlates(20), []);
  assert.deepEqual(barPlates(60), [20]);
  assert.deepEqual(barPlates(100), [25, 15]);
  assert.deepEqual(barPlates(62.5), [20, 1.25]);
  const heavy = barPlates(400);
  assert.equal(heavy.length, 6);
  assert.deepEqual(heavy, [...heavy].sort((a, b) => b - a));
  for (const w of [40, 70, 135, 180]) assert.equal(20 + 2 * barPlates(w).reduce((a, b) => a + b, 0), w);
});

test('the dumbbell off the rack is the nearest size', () => {
  const sizes = [2, 4, 6, 8, 10, 12];
  assert.equal(nearestSize(7.9, sizes), 8);
  assert.equal(nearestSize(1, sizes), 2);
  assert.equal(nearestSize(99, sizes), 12);
});

test('cardio cadences: still at rest, faster with speed, within human limits', () => {
  for (const m of Object.keys(CARDIO_MACHINES)) {
    assert.equal(cardioHz(m, 0), 0);
    const easy = cardioHz(m, CARDIO_MACHINES[m].speed.easy);
    const sprint = cardioHz(m, CARDIO_MACHINES[m].speed.sprint);
    assert.ok(sprint > easy, `${m} faster flat out`);
    assert.ok(sprint <= 2, `${m} cadence ${sprint}`);
  }
  // A rower: 20–34 strokes a minute.
  const spm = (v: number) => cardioHz('rower', v) * 60;
  assert.ok(spm(CARDIO_MACHINES.rower.speed.easy) >= 20 && spm(CARDIO_MACHINES.rower.speed.sprint) <= 38);
});

test('ease spins up and winds down without overshooting', () => {
  let v = 0;
  for (let i = 0; i < 100; i++) v = ease(v, 5, 1 / 60, 3);
  assert.ok(v > 4 && v <= 5);
  assert.equal(ease(1, 5, 10, 3), 5);
  assert.equal(ease(1, 5, -1, 3), 1);
});

test('the rowing stroke: legs first on the drive, back to the catch on the recovery', () => {
  const c = rowStroke(0);
  assert.ok(c.seat < 0.05 && c.handle < 0.05);
  const drive = rowStroke(0.15);
  assert.ok(drive.seat > drive.handle, 'legs before arms');
  const finish = rowStroke(0.35);
  assert.ok(finish.seat > 0.95 && finish.handle > 0.95);
  const back = rowStroke(0.99);
  assert.ok(back.seat < 0.05);
  assert.deepEqual(rowStroke(1.25), rowStroke(0.25));
});

test('the office times a set at the lifter tempo, and tells onlookers when it started', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gym-motion-'));
  try {
    let now = 1_000_000;
    const gym = new Gym(dir, { now: () => now, random: () => 0, manualTick: true });
    const got: StrengthView[] = [];
    gym.enter({ id: 'c1', owner: 'name:Ann', name: 'Ann', send: (m) => m.t === 'gym.station' && m.station === 'squat' && got.push(m.state as StrengthView) });
    gym.message('c1', { t: 'gym.sit', station: 'squat' });
    gym.message('c1', { t: 'gym.act', station: 'squat', action: 'set', data: { weight: 40, target: 5 } });
    const v = got[got.length - 1];
    assert.equal(v.working, true);
    assert.equal(v.since, now);
    assert.equal(v.until! - v.since!, setDurationMs('squat', setAttempts(v.last)));
    now += setDurationMs('squat', setAttempts(v.last)) + 10;
    gym.tick();
    assert.equal(got[got.length - 1].working, false);
    gym.stop();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
