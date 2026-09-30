import test from 'node:test';
import assert from 'node:assert/strict';
import { EXERCISES, MAX_TARGET, comfyWeight, simulateSet, validWeight } from '../src/shared/gym-strength.js';
import { CARDIO_MACHINES, cardioStep, cardioXp, isIntensity, XP_PER_CALORIE, type CardioSession } from '../src/shared/gym-cardio.js';
import { WELLNESS_SPOTS, relaxXp } from '../src/shared/gym-wellness.js';
import { STAMINA_MAX } from '../src/shared/gym.js';

// The gym's workout maths (flrnoh fork): strength sets, cardio sessions and wellness recovery, all
// pure so the server and the tests get the same numbers.

// ---- Strength -----------------------------------------------------------------------------------

test('comfy weight climbs with the level and stays on the step', () => {
  const bench = EXERCISES.bench;
  const c1 = comfyWeight(bench, 1);
  const c20 = comfyWeight(bench, 20);
  assert.ok(c20 > c1);
  for (const w of [c1, c20]) assert.equal(w % bench.step, 0);
  assert.ok(comfyWeight(bench, 999) <= bench.max);
});

test('the weight selector only takes weights on its step', () => {
  const bench = EXERCISES.bench;
  assert.ok(validWeight(bench, 30));
  assert.ok(!validWeight(bench, 31));
  assert.ok(!validWeight(bench, 0));
  assert.ok(!validWeight(bench, bench.max + bench.step));
  assert.ok(!validWeight(bench, '30' as unknown));
});

test('a comfortable set at full energy grinds out every rep', () => {
  const bench = EXERCISES.bench;
  const weight = comfyWeight(bench, 5);
  // random always high → every rep clean (p < 10000 fails only when random is below the threshold).
  const res = simulateSet({ exercise: bench, weight, target: 8, level: 5, stamina: STAMINA_MAX }, () => 0);
  assert.equal(res.reps, 8);
  assert.equal(res.failed, false);
  assert.equal(res.volume, weight * 8);
  assert.ok(res.xp > 0);
  assert.equal(res.form.length, 8);
});

test('too heavy for you and the set folds early', () => {
  const bench = EXERCISES.bench;
  const crushing = bench.max; // far over a beginner's comfort
  // random always at the top → every rep fails the odds.
  const res = simulateSet({ exercise: bench, weight: crushing, target: 8, level: 1, stamina: STAMINA_MAX }, () => 9999);
  assert.equal(res.reps, 0);
  assert.equal(res.failed, true);
  assert.equal(res.volume, 0);
});

test('reps are clamped to a sane target', () => {
  const bench = EXERCISES.bench;
  const res = simulateSet({ exercise: bench, weight: comfyWeight(bench, 5), target: 1000, level: 5, stamina: STAMINA_MAX }, () => 0);
  assert.equal(res.reps, MAX_TARGET);
});

// ---- Cardio -------------------------------------------------------------------------------------

test('a cardio session piles up distance and calories', () => {
  const tm = CARDIO_MACHINES.treadmill;
  let s: CardioSession = { intensity: 'steady', meters: 0, calories: 0, secs: 0 };
  for (let i = 0; i < 10; i++) s = cardioStep(s, 1, STAMINA_MAX, tm).session;
  assert.ok(Math.abs(s.meters - tm.speed.steady * 10) < 0.01);
  assert.ok(Math.abs(s.calories - s.meters * tm.calPerMeter) < 0.01);
  assert.equal(s.secs, 10);
  assert.equal(cardioXp(s), Math.round(s.calories * XP_PER_CALORIE));
});

test('out of puff you can only walk', () => {
  const tm = CARDIO_MACHINES.treadmill;
  const fresh = cardioStep({ intensity: 'sprint', meters: 0, calories: 0, secs: 0 }, 1, STAMINA_MAX, tm);
  const spent = cardioStep({ intensity: 'sprint', meters: 0, calories: 0, secs: 0 }, 1, 0, tm);
  assert.ok(spent.speed < fresh.speed);
  assert.ok(Math.abs(spent.speed - tm.speed.easy) < 0.01);
});

test('the pace names are the ones the machine knows', () => {
  assert.ok(isIntensity('sprint'));
  assert.ok(!isIntensity('flat out'));
});

// ---- Wellness -----------------------------------------------------------------------------------

test('recovery XP adds up over the minutes', () => {
  const sauna = WELLNESS_SPOTS.sauna;
  assert.equal(relaxXp(sauna, 60), sauna.xpPerMin);
  assert.equal(relaxXp(sauna, 0), 0);
  assert.ok(WELLNESS_SPOTS.coldplunge.coldBurst! > 0);
});
