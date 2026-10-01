import test from 'node:test';
import assert from 'node:assert/strict';
import { SoccerMatch } from '../src/server/soccer/match.js';
import { GOAL_MS, GOALS_TO_WIN, KICKOFF_FIRST_MS, KICKOFF_MS, MATCH_MS, OVER_MS } from '../src/shared/soccer.js';

// A match in the soccer hall (flrnoh fork, see FORK.md "The soccer hall"), on a fake clock.

const both = { red: 1, blue: 1 };
const kinds = (evs: { kind: string }[]) => evs.map((e) => e.kind);

/** A match that has just kicked off and is in play at `t`. */
function inPlay() {
  const m = new SoccerMatch();
  m.update(0, both);
  const evs = m.update(KICKOFF_MS, both);
  assert.deepEqual(kinds(evs), ['play']);
  return m;
}

test('a match starts once both teams have someone, with a kickoff freeze, then the clock runs', () => {
  const m = new SoccerMatch();
  assert.deepEqual(m.update(0, { red: 1, blue: 0 }), []);
  assert.equal(m.phase, 'waiting');
  // Waiting: the ball's free to kick about, goals don't count.
  assert.ok(m.canTouch('red', 0));
  assert.deepEqual(m.scored(0, 'red'), []);
  assert.deepEqual(kinds(m.update(1000, both)), ['start', 'kickoff']);
  assert.equal(m.phase, 'kickoff');
  const kicker = m.kickoff;
  // Frozen: nobody touches it, the clock stands.
  assert.ok(!m.canTouch('red', 1500) && !m.canTouch('blue', 1500));
  assert.equal(m.view(1500).clockMs, MATCH_MS);
  assert.equal(m.view(1500).running, false);
  assert.deepEqual(m.update(1000 + KICKOFF_MS - 1, both), []);
  assert.deepEqual(kinds(m.update(1000 + KICKOFF_MS, both)), ['play']);
  assert.equal(m.phase, 'play');
  // The kicking-off team touches it first (or the other can after a moment).
  const t = 1000 + KICKOFF_MS;
  assert.ok(m.canTouch(kicker, t + 10));
  assert.ok(!m.canTouch(kicker === 'red' ? 'blue' : 'red', t + 10));
  assert.ok(m.canTouch(kicker === 'red' ? 'blue' : 'red', t + KICKOFF_FIRST_MS));
  m.touched(kicker);
  assert.ok(m.canTouch(kicker === 'red' ? 'blue' : 'red', t + 20));
  // Now the clock runs.
  assert.equal(m.view(t + 10_000).clockMs, MATCH_MS - 10_000);
  assert.equal(m.view(t + 10_000).running, true);
});

test('a goal: the score, the celebration with the clock stopped, then the team that conceded kicks off', () => {
  const m = inPlay();
  const t = KICKOFF_MS + 30_000;
  const evs = m.scored(t, 'red', 'Ann');
  assert.deepEqual(kinds(evs), ['goal']);
  assert.match(evs[0].text!, /GOAL! Red \(Ann\) · Red 1:0 Blue/);
  assert.deepEqual(m.score, { red: 1, blue: 0 });
  assert.equal(m.phase, 'goal');
  assert.ok(!m.canTouch('red', t + 10) && !m.canTouch('blue', t + 10));
  // Only one goal per ball in: the net doesn't score again while celebrating.
  assert.deepEqual(m.scored(t + 100, 'red'), []);
  const clock = m.view(t).clockMs;
  assert.equal(m.view(t + GOAL_MS - 1).clockMs, clock);
  assert.deepEqual(kinds(m.update(t + GOAL_MS, both)), ['kickoff']);
  assert.equal(m.kickoff, 'blue');
  assert.deepEqual(kinds(m.update(t + GOAL_MS + KICKOFF_MS, both)), ['play']);
  assert.equal(m.view(t + GOAL_MS + KICKOFF_MS).clockMs, clock);
});

test('first to five goals wins, then a pause, then a new match', () => {
  const m = inPlay();
  let t = KICKOFF_MS;
  for (let i = 0; i < GOALS_TO_WIN - 1; i++) {
    t += 1000;
    m.scored(t, 'blue');
    t += GOAL_MS;
    m.update(t, both);
    t += KICKOFF_MS;
    m.update(t, both);
    assert.equal(m.phase, 'play');
  }
  const evs = m.scored(t + 500, 'blue', 'Bob');
  assert.deepEqual(kinds(evs), ['goal', 'end']);
  assert.equal(m.phase, 'over');
  assert.equal(m.winner, 'blue');
  assert.match(evs[1].text!, /Blue win 5:0/);
  assert.equal(m.view(t + 600).winner, 'blue');
  assert.deepEqual(m.update(t + 500 + OVER_MS - 1, both), []);
  assert.deepEqual(kinds(m.update(t + 500 + OVER_MS, both)), ['start', 'kickoff']);
  assert.deepEqual(m.score, { red: 0, blue: 0 });
  assert.equal(m.view(t + 500 + OVER_MS).clockMs, MATCH_MS);
});

test('the clock running out ends it (a draw too)', () => {
  const m = inPlay();
  m.scored(KICKOFF_MS + 1000, 'red');
  m.update(KICKOFF_MS + 1000 + GOAL_MS, both);
  m.update(KICKOFF_MS + 1000 + GOAL_MS + KICKOFF_MS, both);
  const t0 = KICKOFF_MS + 1000 + GOAL_MS + KICKOFF_MS;
  // 1 s of play before the goal, the rest from here.
  const end = t0 + MATCH_MS - 1000;
  assert.deepEqual(m.update(end - 1, both), []);
  const evs = m.update(end, both);
  assert.deepEqual(kinds(evs), ['end']);
  assert.equal(m.winner, 'red');
  assert.match(evs[0].text!, /Red win 1:0/);
  // A draw.
  const d = inPlay();
  const e2 = d.update(KICKOFF_MS + MATCH_MS, both);
  assert.equal(d.winner, 'draw');
  assert.match(e2[0].text!, /draw, 0:0/);
});

test('a team emptying pauses the match (clock stopped, score kept); back, it kicks off again; nobody left resets it', () => {
  const m = inPlay();
  m.scored(KICKOFF_MS + 5000, 'blue');
  m.update(KICKOFF_MS + 5000 + GOAL_MS, both);
  m.update(KICKOFF_MS + 5000 + 2 * GOAL_MS, both);
  const t = KICKOFF_MS + 60_000;
  assert.equal(m.phase, 'play');
  const clock = m.view(t).clockMs;
  assert.deepEqual(kinds(m.update(t, { red: 0, blue: 2 })), ['pause']);
  assert.equal(m.phase, 'paused');
  assert.equal(m.view(t + 30_000).clockMs, clock);
  assert.equal(m.view(t + 30_000).running, false);
  // Practice meanwhile: touches allowed, goals don't count.
  assert.ok(m.canTouch('blue', t + 1));
  assert.deepEqual(m.scored(t + 2, 'blue'), []);
  assert.deepEqual(m.score, { red: 0, blue: 1 });
  assert.deepEqual(kinds(m.update(t + 40_000, both)), ['kickoff', 'resume']);
  m.update(t + 40_000 + KICKOFF_MS, both);
  assert.equal(m.phase, 'play');
  assert.equal(m.view(t + 40_000 + KICKOFF_MS).clockMs, clock);
  // Everyone gone: back to waiting, the score with it.
  assert.deepEqual(kinds(m.update(t + 50_000, { red: 0, blue: 0 })), ['reset']);
  assert.equal(m.phase, 'waiting');
  assert.deepEqual(m.score, { red: 0, blue: 0 });
  assert.deepEqual(m.update(t + 51_000, { red: 0, blue: 0 }), []);
});
