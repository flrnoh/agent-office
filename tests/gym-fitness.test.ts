import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { levelFor, rankFor, xpForLevel, MAX_LEVEL, STAMINA_MAX, STAMINA_REGEN } from '../src/shared/gym.js';
import { Fitness } from '../src/server/gym/fitness.js';

// The gym's fitness store (flrnoh fork): levels, energy, streaks, the leaderboard and gym.json.

test('the level curve and its inverse agree', () => {
  assert.equal(xpForLevel(1), 0);
  assert.equal(levelFor(0), 1);
  for (let l = 1; l <= MAX_LEVEL; l++) {
    assert.equal(levelFor(xpForLevel(l)), l, `at exactly level ${l}`);
    if (l > 1) assert.equal(levelFor(xpForLevel(l) - 1), l - 1, `one short of level ${l}`);
  }
  assert.equal(levelFor(-100), 1);
  assert.equal(levelFor(1e18), MAX_LEVEL, 'the curve caps out');
});

test('ranks climb with the level', () => {
  assert.equal(rankFor(1), 'Rookie');
  assert.equal(rankFor(MAX_LEVEL), 'Legend');
  // Never blank, always a string.
  for (let l = 1; l <= MAX_LEVEL; l++) assert.equal(typeof rankFor(l), 'string');
});

function withFitness(run: (f: Fitness, clock: { t: number }) => void) {
  const dir = mkdtempSync(path.join(tmpdir(), 'gym-'));
  const clock = { t: Date.UTC(2026, 0, 1, 12, 0, 0) };
  try {
    run(new Fitness(dir, () => clock.t), clock);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('XP raises the level, and the profile reads the bar right', () => {
  withFitness((f) => {
    f.ensure('account:1', 'Ada');
    f.addXp('account:1', xpForLevel(3)); // straight to level 3
    const p = f.profile('account:1');
    assert.equal(p.level, 3);
    assert.equal(p.levelXp, 0);
    assert.equal(p.levelSpan, xpForLevel(4) - xpForLevel(3));
    assert.equal(p.rank, rankFor(3));
  });
});

test('energy comes back with rest and clamps at both ends', () => {
  withFitness((f, clock) => {
    f.ensure('account:1', 'Ada');
    assert.equal(f.stamina('account:1'), STAMINA_MAX);
    f.addStamina('account:1', -60);
    assert.ok(Math.abs(f.stamina('account:1') - 40) < 0.001);
    clock.t += 100_000; // 100 s of rest
    assert.ok(Math.abs(f.stamina('account:1') - (40 + 100 * STAMINA_REGEN)) < 0.01);
    f.addStamina('account:1', 1000);
    assert.equal(f.stamina('account:1'), STAMINA_MAX);
    f.addStamina('account:1', -1000);
    assert.equal(f.stamina('account:1'), 0);
  });
});

test('the daily streak carries on, holds and resets', () => {
  withFitness((f, clock) => {
    f.ensure('account:1', 'Ada');
    const day = 24 * 3600_000;
    f.countWorkout('account:1');
    assert.equal(f.profile('account:1').streak, 1);
    f.countWorkout('account:1'); // same day again
    assert.equal(f.profile('account:1').streak, 1);
    clock.t += day; // next day
    f.countWorkout('account:1');
    assert.equal(f.profile('account:1').streak, 2);
    clock.t += 2 * day; // skipped a day
    f.countWorkout('account:1');
    assert.equal(f.profile('account:1').streak, 1);
    assert.equal(f.profile('account:1').totals.workouts, 4);
  });
});

test('the leaderboard sorts by XP and always shows you', () => {
  withFitness((f) => {
    f.ensure('account:1', 'Ada');
    f.ensure('account:2', 'Bo');
    f.ensure('account:3', 'Cy');
    f.addXp('account:1', 500);
    f.addXp('account:2', 1500);
    f.addXp('account:3', 100);
    const top2 = f.leaderboard(2, 'account:3');
    assert.deepEqual(top2.map((r) => r.name), ['Bo', 'Ada', 'Cy']); // you tacked on the end
    assert.equal(top2[0].xp, 1500);
    assert.equal(top2.at(-1)?.you, true);
    // Nobody with 0 XP shows.
    assert.ok(!f.leaderboard(10, '').some((r) => r.xp === 0));
  });
});

test('profiles survive a save and reload', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'gym-'));
  const clock = { t: Date.UTC(2026, 0, 1, 12, 0, 0) };
  try {
    const a = new Fitness(dir, () => clock.t);
    a.ensure('account:1', 'Ada');
    a.addXp('account:1', 777);
    a.addTallies('account:1', { meters: 1200, calories: 300 });
    a.setPr('account:1', 'vol:bench', 900);
    a.flush(true);
    const b = new Fitness(dir, () => clock.t);
    const p = b.profile('account:1');
    assert.equal(p.xp, 777);
    assert.equal(p.totals.meters, 1200);
    assert.equal(b.pr('account:1', 'vol:bench'), 900);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
