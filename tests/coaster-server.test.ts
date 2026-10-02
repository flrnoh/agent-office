import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Coaster, CoasterRecords, coasterMessage, type CoasterHooks } from '../src/server/coaster.js';
import { COUNTDOWN_MS, SEATS, type CoasterState } from '../src/shared/coaster.js';
import { rideDuration } from '../src/shared/coaster-track.js';
import { GUEST_MSGS } from '../src/server/guests.js';
import { PARTY_SEES_MSGS } from '../src/server/party.js';

/** A coaster on a clock of its own: `advance` runs whatever's due. */
function rig(dataDir?: string, storeys = 3) {
  let now = 1_000_000;
  const timers: { at: number; fn: () => void }[] = [];
  const sent: CoasterState[] = [];
  const c = new Coaster({
    now: () => now,
    dataDir,
    changed: (s) => sent.push(s),
    storeys: () => storeys,
    typists: () => [{ desk: 'desk-1', name: 'Pixel', color: '#ff0000' }],
    later: (fn, ms) => {
      const t = { at: now + ms, fn };
      timers.push(t);
      return () => timers.splice(timers.indexOf(t), 1);
    },
  });
  const advance = (ms: number) => {
    const until = now + ms;
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      const next = timers[0];
      if (!next || next.at > until) break;
      timers.shift();
      now = next.at;
      next.fn();
    }
    now = until;
  };
  const who = (id: string) => ({ id, owner: `name:${id}`, name: id, color: '#4f86f7' });
  return { c, sent, advance, who, now: () => now };
}

test('coaster: the first one in starts the countdown, others hop in, then it goes and comes back', () => {
  const { c, sent, advance, who } = rig();
  assert.equal(c.state().phase, 'load');
  assert.deepEqual(c.board(who('ann')), { ok: true, seat: 0 });
  assert.equal(c.state().phase, 'count');
  assert.equal(c.board(who('bob'), 5).ok, true);
  assert.equal(c.seatOf('bob'), 5);
  assert.ok('error' in c.board(who('ann')), 'not twice');
  advance(COUNTDOWN_MS - 1);
  assert.equal(c.state().phase, 'count');
  advance(1);
  const ride = c.state();
  assert.equal(ride.phase, 'ride');
  assert.equal(ride.storeys, 3);
  assert.deepEqual(ride.typists, [{ desk: 'desk-1', name: 'Pixel', color: '#ff0000' }]);
  assert.ok('error' in c.board(who('cat')), 'nobody gets on while it’s out');
  assert.equal(c.leave('ann'), false, 'nobody gets off while it’s out');
  advance(rideDuration(3) * 1000 - 10);
  assert.equal(c.state().phase, 'ride');
  advance(10);
  const back = c.state();
  assert.equal(back.phase, 'load');
  assert.ok(back.seats.every((s) => !s));
  assert.equal(back.rides, 1);
  assert.deepEqual(
    back.leaders.map((l) => [l.name, l.rides]),
    [
      ['ann', 1],
      ['bob', 1],
    ],
  );
  assert.ok(sent.length >= 4);
});

test('coaster: getting out during the countdown, and the last one out stops it', () => {
  const { c, advance, who } = rig();
  c.board(who('ann'));
  c.board(who('bob'));
  assert.equal(c.leave('ann'), true);
  assert.equal(c.state().phase, 'count');
  c.leave('bob');
  assert.equal(c.state().phase, 'load');
  advance(COUNTDOWN_MS * 2);
  assert.equal(c.state().phase, 'load', 'nobody in, nothing goes');
});

test('coaster: full is full, and a seat taken goes to the next free one', () => {
  const { c, who } = rig();
  for (let i = 0; i < SEATS; i++) assert.equal(c.board(who(`p${i}`), 0).ok, true);
  assert.ok('error' in c.board(who('late')));
  assert.equal(c.seatOf('p1'), 1);
});

test('coaster: hands up while riding, counted to the tenth of a second, and the best ride kept', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'coaster-'));
  const { c, advance, who } = rig(dir);
  c.board(who('ann'));
  assert.equal(c.hands('ann', true), false, 'not in the station');
  advance(COUNTDOWN_MS);
  assert.equal(c.hands('ann', true), true);
  assert.equal(c.state().seats[0]!.hands, true);
  assert.equal(c.hands('ann', true), false, 'up already');
  advance(4000);
  assert.equal(c.hands('ann', false), true);
  advance(1000);
  c.hands('ann', true);
  advance(2500);
  c.hands('ann', false);
  advance(rideDuration(3) * 1000);
  const rec = c.records.get('name:ann')!;
  assert.equal(rec.rides, 1);
  assert.equal(rec.hands, 6.5);
  // Saved, and only for the office.
  const file = path.join(dir, 'coaster.json');
  assert.equal(statSync(file).mode & 0o777, 0o600);
  const again = new CoasterRecords(dir);
  assert.deepEqual(again.get('name:ann'), { name: 'ann', rides: 1, hands: 6.5 });
  assert.equal(again.total, 1);
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).total, 1);
});

test('coaster: leaving the roof mid-ride gives the seat up, and the ride goes on without them', () => {
  const { c, advance, who } = rig();
  c.board(who('ann'));
  c.board(who('bob'));
  advance(COUNTDOWN_MS + 5000);
  assert.equal(c.gone('ann'), true);
  assert.equal(c.seatOf('ann'), -1);
  assert.equal(c.state().phase, 'ride');
  advance(rideDuration(3) * 1000);
  assert.equal(c.records.get('name:ann'), undefined, 'no ride for leaving it');
  assert.equal(c.records.get('name:bob')!.rides, 1);
});

test('coaster messages: only from the roof, and guests and party guests ride too', () => {
  const { c, who } = rig();
  const warned: string[] = [];
  const hooks = (onRoof: boolean): CoasterHooks => ({ ...who('ann'), onRoof, warn: (t) => warned.push(t) });
  coasterMessage(c, { t: 'coaster.board' }, hooks(false));
  assert.equal(c.seatOf('ann'), -1);
  assert.equal(warned.length, 1);
  coasterMessage(c, { t: 'coaster.board', seat: 3 }, hooks(true));
  assert.equal(c.seatOf('ann'), 3);
  coasterMessage(c, { t: 'coaster.leave' }, hooks(true));
  assert.equal(c.seatOf('ann'), -1);
  for (const t of ['coaster.board', 'coaster.leave', 'coaster.hands']) assert.ok(GUEST_MSGS.has(t), t);
  assert.ok(PARTY_SEES_MSGS.has('coaster'));
});

test('coaster: a floor added or taken off while it is out brings it straight back, laid for the new height', () => {
  let storeys = 3;
  let now = 1_000_000;
  const timers: { at: number; fn: () => void }[] = [];
  const sent: CoasterState[] = [];
  const c = new Coaster({
    now: () => now,
    changed: (s) => sent.push(s),
    storeys: () => storeys,
    typists: () => [],
    later: (fn, ms) => {
      const t = { at: now + ms, fn };
      timers.push(t);
      return () => {
        const i = timers.indexOf(t);
        if (i >= 0) timers.splice(i, 1);
      };
    },
  });
  const advance = (ms: number) => {
    const until = now + ms;
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      const next = timers[0];
      if (!next || next.at > until) break;
      timers.shift();
      now = next.at;
      next.fn();
    }
    now = until;
  };
  c.board({ id: 'ann', owner: 'name:ann', name: 'ann', color: '#fff' });
  advance(COUNTDOWN_MS + 10_000);
  assert.equal(c.state().phase, 'ride');
  assert.equal(c.state().storeys, 3);
  // Unchanged: it keeps going.
  advance(2000);
  assert.equal(c.state().phase, 'ride');
  // A floor's added: within a fifth of a second it's back, nobody in it, laid for four, and says which ride it stopped.
  storeys = 4;
  advance(250);
  const s = c.state();
  assert.equal(s.phase, 'load');
  assert.equal(s.storeys, 4);
  assert.equal(s.halted, s.ride);
  assert.ok(s.seats.every((x) => !x));
  assert.equal(c.records.get('name:ann')!.rides, 1, 'it counts as a ride');
  // Straight away when the office says the floors changed, without waiting for the check.
  c.board({ id: 'bob', owner: 'name:bob', name: 'bob', color: '#fff' });
  assert.equal(c.state().halted, 0, 'a new ride starts unhalted');
  advance(COUNTDOWN_MS + 1000);
  storeys = 2;
  c.checkHeight();
  assert.equal(c.state().phase, 'load');
  assert.equal(c.state().storeys, 2);
  // And no timer left over to end a ride that isn't running.
  advance(200_000);
  assert.equal(c.state().phase, 'load');
});
