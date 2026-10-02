import test from 'node:test';
import assert from 'node:assert/strict';
import { BowlingLanes, IDLE_MS, SWEEP_S } from '../src/server/bowling/lanes.js';
import { LANE_HALF, MAX_PLAYERS, RELEASE_S, type ThrowParams } from '../src/shared/bowling-game.js';
import { bowl, fullRack } from '../src/shared/bowling-sim.js';
import type { LeagueGame } from '../src/shared/bowling-league.js';
import { score } from '../src/shared/bowling-score.js';
import { GUEST_MSGS } from '../src/server/guests.js';
import { bowlingGameHandlers } from '../src/server/ws/handlers/bowlinggame.js';

const STRIKE: ThrowParams = { u: 0.2973, back: 4, power: 0.65, line: -0.005, spin: 0.8 };
const GUTTER: ThrowParams = { u: LANE_HALF - 0.06, back: 4, power: 0.6, line: 0.03, spin: 0 };
const FOUL: ThrowParams = { ...STRIKE, back: 0.8, power: 1 };
const who = (id: string) => ({ id, owner: `name:${id}`, name: id, color: '#f00' });

/** A lane with a clock: each throw waits for the last ball and the sweep. */
function alley() {
  const games: LeagueGame[] = [];
  const lanes = new BowlingLanes((g) => games.push(g));
  let now = 1_000_000;
  const go = (id: string, p: ThrowParams, lane = 0) => {
    const r = lanes.throw(id, lane, p, now);
    if ('error' in r) throw new Error(r.error);
    now = lanes.view(lane).upSince + 1;
    return r;
  };
  return { lanes, games, go, now: () => now, tick: (ms: number) => (now += ms) };
}

test('those are the throws the tests bowl', () => {
  assert.equal(bowl(STRIKE, 12, fullRack()).knocked, 10);
  assert.equal(bowl(GUTTER, 12, fullRack()).knocked, 0);
  assert.equal(bowl(FOUL, 12, fullRack()).foul, true);
});

test('join a lane, bowl a frame: the second ball faces what the first left, then the next player is up', () => {
  const { lanes, go, now } = alley();
  assert.deepEqual(lanes.join(who('ann'), 0, now()), { ok: true, lanes: [0] });
  assert.deepEqual(lanes.join(who('ben'), 0, now()), { ok: true, lanes: [0] });
  assert.equal(lanes.view(0).up, 'ann');
  assert.deepEqual(lanes.throw('ben', 0, STRIKE, now()), { error: 'Du bist nicht dran' });
  const first = go('ann', { ...STRIKE, u: 0, spin: 0 });
  assert.ok(first.roll.roll.pins < 10);
  assert.equal(first.roll.after.length, 10 - first.roll.roll.pins, 'what stood is what the second ball faces');
  assert.equal(lanes.view(0).up, 'ann');
  assert.deepEqual(lanes.view(0).pins, first.roll.after);
  go('ann', GUTTER);
  assert.equal(lanes.view(0).up, 'ben');
  assert.equal(lanes.view(0).pins.length, 10);
  // A strike ends the frame at once.
  go('ben', STRIKE);
  assert.equal(lanes.view(0).up, 'ann');
});

test('the next ball waits for the last one to roll and the pins to be swept', () => {
  const { lanes, now } = alley();
  lanes.join(who('ann'), 0, now());
  const r = lanes.throw('ann', 0, GUTTER, now());
  assert.ok(!('error' in r));
  const until = now() + (RELEASE_S + r.roll.secs + SWEEP_S) * 1000;
  assert.deepEqual(lanes.throw('ann', 0, GUTTER, until - 10), { error: 'Die Kugel rollt noch' });
  assert.ok(!('error' in lanes.throw('ann', 0, GUTTER, until)));
});

test('only sensible throws are bowled', () => {
  const { lanes, now } = alley();
  lanes.join(who('ann'), 0, now());
  assert.deepEqual(lanes.throw('ann', 0, { u: 'left' }, now()), { error: 'Bad throw' });
  assert.deepEqual(lanes.throw('ann', 9, STRIKE, now()), { error: 'No such lane' });
  assert.deepEqual(lanes.throw('ann', 1, STRIKE, now()), { error: 'Erst auf Bahn 2 mitspielen' });
});

test('a perfect game goes into the league, and the lane starts over on a new game', () => {
  const { lanes, games, go, now } = alley();
  lanes.join(who('ann'), 2, now());
  let over = null;
  for (let i = 0; i < 12; i++) over = go('ann', STRIKE, 2).over;
  assert.deepEqual(over, [{ name: 'ann', score: 300 }]);
  assert.equal(lanes.view(2).over, true);
  assert.equal(lanes.view(2).up, null);
  assert.equal(games.length, 1);
  assert.deepEqual({ ...games[0], at: 0 }, { owner: 'name:ann', name: 'ann', score: 300, strikes: 12, spares: 0, at: 0 });
  assert.deepEqual(lanes.newGame('ann', 2, now()), { ok: true });
  assert.equal(lanes.view(2).players[0].rolls.length, 0);
  assert.equal(lanes.view(2).game, 2);
  assert.equal(lanes.view(2).up, 'ann');
});

test('a gutter game is 0; a foul counts nothing and sets the rack up again', () => {
  const { lanes, games, go, now } = alley();
  lanes.join(who('ann'), 0, now());
  const f = go('ann', FOUL);
  assert.equal(f.roll.foul, true);
  assert.equal(f.roll.roll.pins, 0);
  assert.equal(lanes.view(0).pins.length, 10, 'all ten for the second ball');
  for (let i = 0; i < 19; i++) go('ann', GUTTER);
  assert.equal(score(lanes.view(0).players[0].rolls), 0);
  assert.equal(games[0].score, 0);
});

test('late joiners bowl their missed frames first; leaving passes the turn on and frees the place', () => {
  const { lanes, go, now } = alley();
  lanes.join(who('ann'), 0, now());
  go('ann', STRIKE);
  go('ann', STRIKE);
  lanes.join(who('ben'), 0, now());
  assert.equal(lanes.view(0).up, 'ann', 'ann is in the middle of nothing, but ben has fewer frames');
  // Ann has bowled two frames, Ben none: Ben is up next (it's Ann's turn only once he's caught up).
  go('ann', STRIKE);
  assert.equal(lanes.view(0).up, 'ben');
  go('ben', STRIKE);
  go('ben', STRIKE);
  go('ben', STRIKE);
  assert.equal(lanes.view(0).up, 'ann');
  assert.equal(lanes.leave('ann', now()), 0);
  assert.equal(lanes.view(0).up, 'ben');
  assert.equal(lanes.view(0).players.length, 1);
  assert.equal(lanes.leave('ben', now()), 0);
  assert.deepEqual(lanes.view(0).players, []);
  assert.equal(lanes.view(0).up, null);
  assert.equal(lanes.leave('ben', now()), undefined);
});

test('six to a lane; joining another lane leaves the first; a ball from the rack is yours', () => {
  const { lanes, now } = alley();
  for (let i = 0; i < MAX_PLAYERS; i++) assert.ok(!('error' in lanes.join(who(`p${i}`), 1, now())));
  assert.deepEqual(lanes.join(who('late'), 1, now()), { error: `Bahn 2 ist voll (${MAX_PLAYERS} Spieler)` });
  assert.deepEqual(lanes.join(who('p0'), 3, now()), { ok: true, lanes: [1, 3] });
  assert.equal(lanes.laneOf('p0'), 3);
  assert.equal(lanes.view(1).players.length, MAX_PLAYERS - 1);
  assert.equal(lanes.pickBall('p0', 8), 3);
  assert.equal(lanes.view(3).players[0].ball, 8);
  assert.equal(lanes.pickBall('p0', 42), undefined);
  assert.equal(lanes.pickBall('nobody', 2), undefined);
});

test('a new game mid-game only alone; someone who keeps everyone waiting can be skipped', () => {
  const { lanes, go, now, tick } = alley();
  lanes.join(who('ann'), 0, now());
  lanes.join(who('ben'), 0, now());
  go('ann', STRIKE);
  assert.deepEqual(lanes.newGame('ann', 0, now()), { error: 'Das Spiel läuft noch' });
  assert.equal(lanes.skip('ann', 0, now()), null, 'not yet');
  tick(IDLE_MS);
  assert.equal(lanes.skip('ben', 0, now()), null, 'not yourself');
  assert.equal(lanes.skip('ann', 0, now()), 'ben');
  assert.deepEqual(lanes.view(0).players.map((p) => p.id), ['ann']);
  assert.deepEqual(lanes.newGame('ann', 0, now()), { ok: true });
});

test('guests may bowl, and every message has its handler', () => {
  for (const t of Object.keys(bowlingGameHandlers)) assert.ok(GUEST_MSGS.has(t), `${t} is open to guests`);
});
