import test from 'node:test';
import assert from 'node:assert/strict';
import { GOAL, PITCH, PITCH_CX, type SoccerView } from '../src/shared/soccer.js';
import {
  ADS,
  AD_HOLD_MS,
  AD_ROLL_MS,
  FLARE_MS,
  GOAL_FLASH_MS,
  NEAR_MISS_WIDE,
  REACT_MS,
  adSlot,
  boardShow,
  calloutFor,
  calmCrowd,
  crowdDensity,
  cueOf,
  fanAct,
  floodlight,
  matchOn,
  nearMiss,
  react,
  seatTaken,
  settle,
} from '../src/client/world/soccer/matchday.js';

// The soccer hall's atmosphere (flrnoh fork, see FORK.md "The soccer hall"): how full the stands are,
// how the crowd reacts, the LED boards' ads, near misses, the announcer and the floodlights.

test('the stands fill with the people in the hall, a match always draws a crowd, an empty hall is nearly empty', () => {
  assert.ok(crowdDensity(0, false) < 0.1);
  assert.ok(crowdDensity(1, false) > crowdDensity(0, false));
  // More people, more crowd, but between matches never packed.
  for (let n = 1; n < 12; n++) assert.ok(crowdDensity(n + 1, false) >= crowdDensity(n, false));
  assert.ok(crowdDensity(20, false) <= 0.5);
  // A match: well over half full even with just the two players, full with a crowd, never over.
  assert.ok(crowdDensity(0, true) >= 0.6);
  assert.ok(crowdDensity(2, true) > crowdDensity(20, false));
  assert.equal(crowdDensity(10, true), 1);
  assert.ok(crowdDensity(100, true) <= 1);
  // Seats: a regular comes at their threshold.
  assert.ok(seatTaken(0.2, 0.5) && !seatTaken(0.7, 0.5));
  assert.ok(matchOn('play') && matchOn('kickoff') && matchOn('goal') && matchOn('over'));
  assert.ok(!matchOn('waiting') && !matchOn('paused') && !matchOn(undefined));
});

test('the crowd claps a kick-off, gasps at a near miss, cheers a goal, and settles back', () => {
  let s = calmCrowd(0);
  s = react(s, { kind: 'kickoff' }, 1000);
  assert.equal(s.act, 'clap');
  assert.equal(settle(s, 1000 + REACT_MS.clap - 1).act, 'clap');
  assert.equal(settle(s, 1000 + REACT_MS.clap).act, 'idle');
  // A near miss outranks the clapping, a goal the gasp (the shot off the post that went in).
  s = react(s, { kind: 'nearMiss' }, 1500);
  assert.equal(s.act, 'oooh');
  s = react(s, { kind: 'goal', team: 'blue' }, 1700);
  assert.equal(s.act, 'cheer');
  assert.equal(s.team, 'blue');
  // No clapping or gasping over the cheer; once it's over, they can.
  assert.equal(react(s, { kind: 'chant' }, 2000).act, 'cheer');
  assert.equal(react(s, { kind: 'nearMiss' }, 2000).act, 'cheer');
  assert.equal(react(s, { kind: 'nearMiss' }, 1700 + REACT_MS.cheer).act, 'oooh');
  // Another goal restarts the cheer, for whoever scored it.
  const again = react(s, { kind: 'goal', team: 'red' }, 3000);
  assert.equal(again.team, 'red');
  assert.equal(again.until, 3000 + REACT_MS.cheer);
});

test('only the scorers\' fans (and the neutrals) jump for a goal', () => {
  const s = react(calmCrowd(0), { kind: 'goal', team: 'red' }, 0);
  assert.equal(fanAct(s, 'red'), 'cheer');
  assert.equal(fanAct(s, null), 'cheer');
  assert.equal(fanAct(s, 'blue'), 'idle');
  // Everyone gasps and claps together.
  const o = react(calmCrowd(0), { kind: 'nearMiss' }, 0);
  assert.equal(fanAct(o, 'blue'), 'oooh');
  // A draw at the final whistle: applause all round; a win: the winners' end cheers.
  assert.equal(react(calmCrowd(0), { kind: 'win' }, 0).act, 'clap');
  const w = react(calmCrowd(0), { kind: 'win', team: 'blue' }, 0);
  assert.equal(fanAct(w, 'blue'), 'cheer');
  assert.equal(fanAct(w, 'red'), 'idle');
});

test('the office\'s match events become the crowd\'s cues', () => {
  assert.deepEqual(cueOf({ kind: 'goal', team: 'red', who: 'Ann' }), { kind: 'goal', team: 'red' });
  assert.deepEqual(cueOf({ kind: 'start' }), { kind: 'kickoff' });
  assert.deepEqual(cueOf({ kind: 'kickoff', team: 'blue' }), { kind: 'kickoff' });
  assert.deepEqual(cueOf({ kind: 'end', team: 'blue' }), { kind: 'win', team: 'blue' });
  assert.deepEqual(cueOf({ kind: 'end' }), { kind: 'win' });
  assert.equal(cueOf({ kind: 'join', team: 'red' }), null);
  assert.equal(cueOf({ kind: 'goal' }), null);
});

test('the LED boards hold each ad, roll over to the next, and go round', () => {
  const period = AD_HOLD_MS + AD_ROLL_MS;
  assert.deepEqual(adSlot(0), { index: 0, next: 1, roll: 0 });
  assert.deepEqual(adSlot(AD_HOLD_MS - 1), { index: 0, next: 1, roll: 0 });
  const mid = adSlot(AD_HOLD_MS + AD_ROLL_MS / 2);
  assert.equal(mid.index, 0);
  assert.ok(Math.abs(mid.roll - 0.5) < 1e-9);
  assert.deepEqual(adSlot(period), { index: 1, next: 2, roll: 0 });
  // Round and round: the last rolls onto the first.
  const last = adSlot(period * (ADS.length - 1) + AD_HOLD_MS + 1);
  assert.equal(last.index, ADS.length - 1);
  assert.equal(last.next, 0);
  assert.equal(adSlot(period * ADS.length).index, 0);
  assert.equal(adSlot(-5).index, 0);
  // Nothing but friendly slogans for Florian's world.
  for (const [text] of ADS) assert.ok(text.length > 4 && text.length < 60, text);
  assert.ok(ADS.some(([t]) => t.includes('KULTUR AM REGEN')) && ADS.some(([t]) => t.includes('SIGNAL & STILLE')));
});

test('after a goal the boards flash GOAL! in the scorers\' colour, then go back to the ads', () => {
  const goal = { team: 'blue' as const, at: 10_000 };
  const a = boardShow(10_000, goal);
  assert.equal(a.kind, 'goal');
  assert.ok(a.kind === 'goal' && a.team === 'blue' && a.lit);
  const b = boardShow(10_300, goal);
  assert.ok(b.kind === 'goal' && !b.lit);
  const c = boardShow(10_400, goal);
  assert.ok(c.kind === 'goal' && c.lit);
  assert.equal(boardShow(10_000 + GOAL_FLASH_MS, goal).kind, 'ad');
  assert.equal(boardShow(9_000, goal).kind, 'ad');
  assert.equal(boardShow(10_000, null).kind, 'ad');
});

test('near misses: off the post or the bar, or hard into the end boards just wide', () => {
  const nx = PITCH_CX + GOAL.width / 2 + 0.5;
  assert.equal(nearMiss('post', PITCH_CX + 1.5, PITCH.minZ + 0.1, 3), 'north');
  assert.equal(nearMiss('bar', PITCH_CX, PITCH.maxZ - 0.1, 3), 'south');
  assert.equal(nearMiss('board', nx, PITCH.maxZ - 0.2, 12), 'south');
  assert.equal(nearMiss('board', -nx, PITCH.minZ + 0.2, 12), 'north');
  // Too soft, too wide, off a side board, a kick, nothing: no gasp.
  assert.equal(nearMiss('board', nx, PITCH.maxZ - 0.2, 2), null);
  assert.equal(nearMiss('board', PITCH_CX + GOAL.width / 2 + NEAR_MISS_WIDE + 0.5, PITCH.maxZ - 0.2, 12), null);
  assert.equal(nearMiss('board', PITCH.maxX - 0.1, 0, 12), null);
  assert.equal(nearMiss('kick', PITCH_CX, PITCH.maxZ - 1, 20), null);
  assert.equal(nearMiss('net', PITCH_CX, PITCH.maxZ + 0.5, 20), null);
  assert.equal(nearMiss(undefined, PITCH_CX, PITCH.maxZ, 20), null);
});

test('the announcer calls out goals (own goals too), the kick-off and the final whistle', () => {
  const view: SoccerView = { phase: 'goal', score: { red: 2, blue: 1 }, clockMs: 100_000, running: false, players: [] };
  const g = calloutFor({ kind: 'goal', team: 'red', who: 'Ann' }, view)!;
  assert.equal(g.head, '⚽ TOOOR!');
  assert.equal(g.sub, 'Ann trifft – Rot 2:1 Blau');
  assert.equal(g.team, 'red');
  assert.ok(g.horn);
  assert.match(calloutFor({ kind: 'goal', team: 'blue', who: 'own goal, Bo' }, view)!.sub, /^Eigentor Bo – /);
  assert.match(calloutFor({ kind: 'goal', team: 'blue' }, view)!.sub, /^Tor für Blau – /);
  assert.equal(calloutFor({ kind: 'start' }, null)!.head, 'ANPFIFF!');
  assert.match(calloutFor({ kind: 'end', team: 'red' }, { ...view, phase: 'over' })!.sub, /^Rot gewinnt – Rot 2:1 Blau$/);
  assert.match(calloutFor({ kind: 'end' }, { ...view, phase: 'over' })!.sub, /^Unentschieden/);
  assert.equal(calloutFor({ kind: 'join', team: 'red' }, view), null);
  assert.equal(calloutFor({ kind: 'play' }, view), null);
});

test('the floodlights flare as a match kicks off and dim a little between matches', () => {
  assert.equal(floodlight(0, -1e9, true), 1);
  assert.ok(floodlight(0, -1e9, false) < 1 && floodlight(0, -1e9, false) > 0.7);
  // A blink off, then up past full, settling back.
  assert.ok(floodlight(1050, 1000, true) < 0.5);
  assert.ok(floodlight(1300, 1000, true) > 1.4);
  assert.ok(floodlight(1000 + FLARE_MS / 2, 1000, true) > 1);
  assert.equal(floodlight(1000 + FLARE_MS + 1, 1000, true), 1);
});
