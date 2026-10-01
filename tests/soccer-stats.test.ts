import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ASSIST_MS, MatchStats, wouldScore } from '../src/server/soccer/stats.js';
import { SoccerRecords } from '../src/server/soccer/records.js';
import { Soccer } from '../src/server/soccer/index.js';
import { GOAL, GOAL_MS, GOALS_TO_WIN, KICKOFF_FIRST_MS, KICKOFF_MS, PITCH, PITCH_CX, SOCCER_ENTRY, type SoccerServerMsg } from '../src/shared/soccer.js';
import { CELEBRATIONS, REPLAY, assignNumber, minuteOf, mvpScore, pickCelebration, pickMvp, replayContentAt, replayPlaybackMs, type SoccerLine } from '../src/shared/soccer-stats.js';
import { ReplayBuffer, ReplayRun, sampleClip } from '../src/client/soccer/replay.js';
import { diveSide, shirtName } from '../src/client/soccer/kit.js';
import type { Ball } from '../src/shared/soccer-ball.js';
import type { ServerMsg } from '../src/shared/protocol.js';

// The soccer hall's statistics, leaderboard, replays, shirt numbers and celebrations (flrnoh fork,
// see FORK.md "The soccer hall").

const ball = (b: Partial<Ball>): Ball => ({ x: PITCH_CX, z: 0, y: 0, vx: 0, vz: 0, vy: 0, ...b });
/** A ball kicked hard from `z` straight at the south goal (red attacks it). */
const atSouth = (z = 8) => ball({ z, vz: 16 });
const atNorth = (z = -8) => ball({ z, vz: -16 });
/** A ball rolled gently across the pitch: no shot. */
const across = (z = 0) => ball({ z, vx: 6 });

test('shots on target are the ones the ball would go in from; wide ones are only shots', () => {
  assert.equal(wouldScore(atSouth()), 'south');
  assert.equal(wouldScore(atNorth()), 'north');
  assert.equal(wouldScore(across()), null);
  const s = new MatchStats();
  s.touch('a', 'Ann', 'red', 1000, true, atSouth());
  // Just wide of the post, near enough to be a shot.
  s.touch('a', 'Ann', 'red', 5000, true, ball({ z: 8, vz: 16, vx: 16 * ((GOAL.width / 2 + 0.8) / 5.5) }));
  // Across the halfway line: no shot.
  s.touch('a', 'Ann', 'red', 9000, true, across());
  // A soft pass up the middle from halfway that dies before the goal: no shot either.
  s.touch('a', 'Ann', 'red', 13_000, true, ball({ z: 0, vz: 7.2 }));
  const l = s.view().players[0];
  assert.deepEqual([l.shots, l.onTarget], [2, 1]);
  assert.deepEqual([s.view().teams.red.shots, s.view().teams.red.onTarget], [2, 1]);
});

test('goals: the scorer, the assist within the window, the minute; own goals', () => {
  const s = new MatchStats();
  // Bob passes to Ann, Ann shoots, in: Bob's assist and a completed pass.
  s.touch('b', 'Bob', 'red', 10_000, true, across());
  s.touch('a', 'Ann', 'red', 11_000, false, across());
  s.touch('a', 'Ann', 'red', 11_300, true, atSouth());
  let g = s.goal('red', minuteOf(2 * 60_000 + 5000), 12_000);
  assert.deepEqual(g, { team: 'red', minute: 3, scorer: 'Ann', assist: 'Bob' });
  // Too long before the goal: no assist.
  s.touch('b', 'Bob', 'red', 20_000, true, across());
  s.touch('a', 'Ann', 'red', 21_000, false, across());
  s.touch('a', 'Ann', 'red', 20_000 + ASSIST_MS + 500, true, atSouth());
  g = s.goal('red', 4, 20_000 + ASSIST_MS + 800);
  assert.equal(g.assist, undefined);
  assert.equal(g.scorer, 'Ann');
  // A defender's touch in between: no assist either.
  s.touch('b', 'Bob', 'red', 40_000, true, across());
  s.touch('c', 'Cat', 'blue', 40_500, false, across());
  s.touch('a', 'Ann', 'red', 41_000, true, atSouth());
  assert.equal(s.goal('red', 5, 41_500).assist, undefined);
  // Cat turns it into her own net.
  s.touch('c', 'Cat', 'blue', 50_000, true, atSouth());
  assert.deepEqual(s.goal('red', 6, 50_500), { team: 'red', minute: 6, own: true, scorer: 'Cat' });
  const v = s.view();
  const ann = v.players.find((p) => p.name === 'Ann')!;
  const bob = v.players.find((p) => p.name === 'Bob')!;
  const cat = v.players.find((p) => p.name === 'Cat')!;
  assert.deepEqual([ann.goals, ann.shots, ann.onTarget], [3, 3, 3]);
  assert.deepEqual([bob.assists, bob.passes], [1, 2]);
  assert.equal(cat.goals, 0);
  assert.equal(v.goals.length, 4);
  // A dribble into the net is still a shot on target.
  const d = new MatchStats();
  d.touch('a', 'Ann', 'red', 0, false, across());
  d.goal('red', 1, 500);
  assert.deepEqual([d.view().players[0].shots, d.view().players[0].onTarget], [1, 1]);
});

test('possession is the playing time each team had the last touch; saves', () => {
  const s = new MatchStats();
  s.tick(0, true);
  s.touch('a', 'Ann', 'red', 0, false, across());
  s.tick(3000, true);
  s.touch('c', 'Cat', 'blue', 3000, false, across());
  s.tick(4000, true);
  // Not in play: no possession counted.
  s.tick(9000, false);
  s.tick(10_000, true);
  assert.deepEqual([s.view().teams.red.possession, s.view().teams.blue.possession], [60, 40]);
  // Cat shoots at the north goal; Bob, near it, gets there: a save. A defender far up the pitch doesn't.
  s.touch('c', 'Cat', 'blue', 20_000, true, atNorth(-6));
  s.touch('b', 'Bob', 'red', 20_400, false, ball({ z: -11 }));
  s.touch('c', 'Cat', 'blue', 30_000, true, atNorth(-2));
  s.touch('b', 'Bob', 'red', 30_200, false, ball({ z: 2 }));
  const bob = s.view().players.find((p) => p.name === 'Bob')!;
  assert.equal(bob.saves, 1);
  assert.equal(s.view().teams.red.saves, 1);
  // Before anyone's touched it: 50/50.
  assert.deepEqual(new MatchStats().view().teams.red.possession, 50);
});

test('the man of the match: goals 3, assists 2, shots on target and saves 1; ties to goals, then the winners', () => {
  const line = (name: string, team: 'red' | 'blue', goals: number, assists: number, onTarget: number, saves: number): SoccerLine => ({ name, team, goals, assists, onTarget, saves, shots: onTarget, passes: 0 });
  assert.equal(mvpScore({ goals: 2, assists: 1, onTarget: 3, saves: 1 }), 12);
  const a = line('Ann', 'red', 1, 0, 1, 0); // 4
  const b = line('Bob', 'blue', 0, 2, 0, 0); // 4
  const c = line('Cat', 'blue', 0, 0, 1, 3); // 4
  assert.equal(pickMvp([b, c, a], 'blue')!.name, 'Ann'); // more goals
  assert.equal(pickMvp([b, c], 'blue')!.name, 'Bob'); // same goals, both winners: by name
  assert.equal(pickMvp([line('Dan', 'red', 0, 0, 1, 0), line('Eve', 'blue', 0, 0, 1, 0)], 'blue')!.name, 'Eve'); // the winners
  assert.equal(pickMvp([line('Zed', 'red', 0, 0, 0, 0)], 'red'), undefined);
  const s = new MatchStats();
  s.seen('a', 'Ann', 'red');
  s.seen('b', 'Bob', 'blue');
  s.touch('a', 'Ann', 'red', 0, true, atSouth());
  s.goal('red', 1, 100);
  const results = s.finish('red');
  assert.deepEqual(
    results.map((r) => [r.owner, r.won, r.goals, r.mvp]),
    [
      ['a', true, 1, true],
      ['b', false, 0, false],
    ],
  );
  assert.equal(s.view().mvp!.name, 'Ann');
});

test('the leaderboard is kept per person in soccer.json (0600), ranked by goals', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'soccer-'));
  try {
    const r = new SoccerRecords(dir);
    r.record([
      { owner: 'account:1', name: 'Ann', team: 'red', won: true, goals: 2, assists: 1, mvp: true },
      { owner: 'name:Bob', name: 'Bob', team: 'blue', won: false, goals: 3, assists: 0, mvp: false },
    ]);
    r.record([{ owner: 'account:1', name: 'Ann B', team: 'blue', won: false, goals: 2, assists: 0, mvp: false }]);
    const file = path.join(dir, 'soccer.json');
    assert.equal(statSync(file).mode & 0o777, 0o600);
    const again = new SoccerRecords(dir);
    assert.deepEqual(again.get('account:1'), { name: 'Ann B', matches: 2, wins: 1, goals: 4, assists: 1, mvp: 1 });
    assert.deepEqual(
      again.top(5).map((l) => [l.name, l.goals]),
      [
        ['Ann B', 4],
        ['Bob', 3],
      ],
    );
    assert.ok(JSON.parse(readFileSync(file, 'utf8')).players['name:Bob']);
    // Shirt numbers stick to the person, across restarts; someone else wearing it gets them the next one for now.
    const n = again.numberFor('account:1', 'Ann', new Set());
    assert.equal(new SoccerRecords(dir).numberFor('account:1', 'Ann', new Set()), n);
    const other = new SoccerRecords(dir).numberFor('account:1', 'Ann', new Set([n]));
    assert.notEqual(other, n);
    assert.equal(new SoccerRecords(dir).numberFor('account:1', 'Ann', new Set()), n);
    // A broken file: everyone starts over, no crash.
    new SoccerRecords(path.join(dir, 'nope'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('shirt numbers: 1..99, their own if free, else the next free one round past 99', () => {
  assert.equal(assignNumber(7, new Set()), 7);
  assert.equal(assignNumber(7, new Set([7, 8])), 9);
  assert.equal(assignNumber(99, new Set([99])), 1);
  const seeded = assignNumber(undefined, new Set(), 'account:42');
  assert.ok(seeded >= 1 && seeded <= 99);
  assert.equal(assignNumber(undefined, new Set(), 'account:42'), seeded);
  assert.equal(assignNumber(0, new Set(), 'x'), assignNumber(undefined, new Set(), 'x'));
  const all = new Set(Array.from({ length: 98 }, (_, i) => i + 1));
  assert.equal(assignNumber(1, all), 99);
  assert.equal(shirtName('  anna lena Zelzer'), 'ANNA');
  assert.equal(shirtName('Maximilianus'), 'MAXIMILIAN');
});

test('celebrations: the same on every page for a goal, all of them used', () => {
  assert.equal(pickCelebration('Ann', 3), pickCelebration('Ann', 3));
  const seen = new Set<string>();
  for (let i = 1; i <= 40; i++) seen.add(pickCelebration('Ann', i));
  assert.deepEqual([...seen].sort(), [...CELEBRATIONS].sort());
});

test('the replay buffer records, trims, cuts a clip and plays it back in time', () => {
  const b = new ReplayBuffer(7000, 30);
  for (let t = 0; t <= 10_000; t += 16) b.record(t, [t / 1000, 0, 0], [['ann', t / 1000, 1, 0]]);
  // Frames closer than 30 ms are skipped; older than 7 s are gone.
  assert.ok(b.size > 7000 / 40 && b.size <= 7000 / 30 + 2, `${b.size} frames`);
  b.kick(9_000, 'ann');
  b.kick(1_000, 'bob');
  const goal = 9_500;
  const clip = b.clip(goal - REPLAY.backMs, goal + REPLAY.afterMs)!;
  assert.ok(clip.frames[0].t <= goal - REPLAY.backMs && clip.frames.at(-1)!.t >= goal + REPLAY.afterMs - 40);
  assert.deepEqual(clip.kicks, [{ t: 9_000, id: 'ann' }]);
  const mid = sampleClip(clip, 8_000);
  assert.ok(Math.abs(mid.ball.x - 8) < 0.02);
  assert.ok(Math.abs(mid.players.get('ann')!.x - 8) < 0.02);
  assert.ok(Math.abs(mid.players.get('ann')!.speed - 1) < 0.1);
  // Played back: real speed, then the last slowMs at slowRate, then done.
  const run = new ReplayRun(clip, 100_000);
  assert.equal(run.at(100_000)!.t, clip.to - (REPLAY.backMs + REPLAY.afterMs));
  const fast = REPLAY.backMs + REPLAY.afterMs - REPLAY.slowMs;
  assert.equal(run.at(100_000 + fast)!.slow, false);
  const slow = run.at(100_000 + fast + 400)!;
  assert.ok(slow.slow);
  assert.ok(Math.abs(slow.t - (clip.to - REPLAY.slowMs + 400 * REPLAY.slowRate)) < 1e-6);
  assert.equal(run.at(100_000 + replayPlaybackMs() + 50), null);
  assert.equal(replayContentAt(replayPlaybackMs() - 1)! <= REPLAY.backMs + REPLAY.afterMs, true);
  // Too little recorded: no clip.
  assert.equal(new ReplayBuffer().clip(0, 1000), null);
  b.clear();
  assert.equal(b.size, 0);
});

test('the goal pause covers the celebration and the whole replay', () => {
  assert.ok(REPLAY.startAfterMs + replayPlaybackMs() <= GOAL_MS - 300, `${REPLAY.startAfterMs + replayPlaybackMs()} ms of ${GOAL_MS}`);
});

test('a goalkeeper dives for a ball flying past, in their own area only', () => {
  // Red keeps the north goal: a shot coming at it passing a metre to their side.
  const shot = { x: PITCH_CX + 1, y: 0.3, z: -8, vx: 0, vz: -15 };
  assert.equal(diveSide('red', PITCH_CX, PITCH.minZ + 1.5, shot), 1);
  assert.equal(diveSide('red', PITCH_CX + 2, PITCH.minZ + 1.5, shot), -1);
  // Right at them, or far wide, or slow, or out of their area, or going the other way: no dive.
  assert.equal(diveSide('red', PITCH_CX + 1, PITCH.minZ + 1.5, shot), 0);
  assert.equal(diveSide('red', PITCH_CX - 3, PITCH.minZ + 1.5, shot), 0);
  assert.equal(diveSide('red', PITCH_CX, PITCH.minZ + 1.5, { ...shot, vz: -3 }), 0);
  assert.equal(diveSide('red', PITCH_CX, -2, shot), 0);
  assert.equal(diveSide('blue', PITCH_CX, PITCH.minZ + 1.5, shot), 0);
  assert.equal(diveSide('blue', PITCH_CX, PITCH.maxZ - 1.5, { ...shot, z: 8, vz: 15 }), 1);
});

test('the office keeps the numbers of a whole match: goals in the state, the leaderboard at full time', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'soccer-'));
  try {
    let now = 1_000_000;
    const pos = new Map<string, { x: number; z: number }>();
    const got: ServerMsg[] = [];
    const s = new Soccer({ where: (id) => pos.get(id) ?? null, now: () => now, timer: false, dataDir: dir });
    const tick = (ms: number) => {
      for (let i = 0; i < Math.round(ms / (1000 / 30)); i++) {
        now += 1000 / 30;
        s.tick(1 / 30);
      }
    };
    for (const [id, name] of [
      ['ann', 'Ann'],
      ['bob', 'Bob'],
    ]) {
      pos.set(id, { x: SOCCER_ENTRY.x, z: SOCCER_ENTRY.z });
      s.enter({ id, name, owner: `account:${id}`, send: (m) => id === 'bob' && got.push(m) });
    }
    s.join('ann'); // red
    s.join('bob'); // blue
    const numbers = s.view().players.map((p) => p.number!);
    assert.ok(numbers.every((n) => n >= 1 && n <= 99) && numbers[0] !== numbers[1]);
    pos.set('bob', { x: PITCH.minX + 1, z: -12 });
    for (let goal = 1; goal <= GOALS_TO_WIN; goal++) {
      tick(KICKOFF_MS + KICKOFF_FIRST_MS + 300);
      assert.equal(s.match.phase, 'play');
      pos.set('ann', { x: PITCH_CX, z: -0.8 });
      tick(100);
      assert.equal(s.kick('ann', 0.9, 0, 0), null);
      pos.set('ann', { x: PITCH.maxX - 1, z: -5 });
      tick(2500);
      assert.equal(s.match.score.red, goal);
      if (goal < GOALS_TO_WIN) tick(GOAL_MS);
    }
    assert.equal(s.match.phase, 'over');
    const last = got.filter((m): m is Extract<SoccerServerMsg, { t: 'soccer' }> => m.t === 'soccer').at(-1)!;
    const st = last.state.stats!;
    assert.equal(st.goals.length, GOALS_TO_WIN);
    assert.deepEqual(st.goals[0], { team: 'red', minute: 1, scorer: 'Ann' });
    assert.deepEqual([st.teams.red.shots, st.teams.red.onTarget], [5, 5]);
    assert.equal(st.teams.red.possession, 100);
    assert.equal(st.mvp!.name, 'Ann');
    assert.deepEqual(last.state.leaders!.map((l) => [l.name, l.matches, l.wins, l.goals, l.mvp]), [
      ['Ann', 1, 1, 5, 1],
      ['Bob', 1, 0, 0, 0],
    ]);
    const saved = JSON.parse(readFileSync(path.join(dir, 'soccer.json'), 'utf8')).players;
    assert.equal(saved['account:ann'].goals, 5);
    assert.equal(saved['account:ann'].number, numbers[0]);
    // A new match: a fresh sheet.
    tick(10_000);
    assert.ok(s.match.phase === 'kickoff' || s.match.phase === 'play');
    assert.equal(s.view().stats!.goals.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
