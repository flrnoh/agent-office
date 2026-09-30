import test from 'node:test';
import assert from 'node:assert/strict';
import { PadelCourts, padelMessage, type PadelHooks } from '../src/server/padel.js';
import { allReviewed, GUEST_MSGS } from '../src/server/guests.js';
import { padel } from '../src/shared/padel/game.js';
import type { ServerMsg } from '../src/shared/protocol.js';

const ann = { id: 'a', name: 'Ann', color: '#f00' };
const bob = { id: 'b', name: 'Bob', color: '#00f' };
const cat = { id: 'c', name: 'Cat', color: '#0f0' };
const dan = { id: 'd', name: 'Dan', color: '#ff0' };
const eve = { id: 'e', name: 'Eve', color: '#0ff' };
const snap = (score: [number, number] = [0, 0], win: -1 | 0 | 1 = -1) => ({ s: padel.encode(padel.init()), score, win, ev: [1, 0, 0] });

test('padel sessions: the first on a court runs it; people go on the team with fewer people; a fifth is told to watch', () => {
  const p = new PadelCourts();
  assert.deepEqual(p.join(ann, 'court-1'), { ok: true, slot: 0 });
  // Two people: one a side, each with the computer as partner.
  assert.deepEqual(p.join(bob, 'court-1'), { ok: true, slot: 2 });
  assert.deepEqual(p.join(cat, 'court-1'), { ok: true, slot: 1 });
  assert.deepEqual(p.join(dan, 'court-1'), { ok: true, slot: 3 });
  const r = p.join(eve, 'court-1');
  assert.ok('error' in r && /watch/.test(r.error));
  const seat = p.state().find((s) => s.id === 'court-1')!;
  assert.equal(seat.host, 'a');
  assert.deepEqual(seat.players.map((x) => x?.id), ['a', 'c', 'b', 'd']);
  // A place asked for: the computer's, not a person's.
  const q = new PadelCourts();
  assert.deepEqual(q.join(ann, 'court-2', 1), { ok: true, slot: 1 });
  const taken = q.join(bob, 'court-2', 1);
  assert.ok('error' in taken && /Ann/.test(taken.error));
  assert.deepEqual(q.join(bob, 'court-2', 0), { ok: true, slot: 0 });
  // Changing places on the same court.
  assert.deepEqual(q.join(bob, 'court-2', 3), { ok: true, slot: 3 });
  assert.deepEqual(q.state().find((s) => s.id === 'court-2')!.players.map((x) => x?.id ?? null), [null, 'a', null, 'b']);
});

test('padel sessions: one court at a time; going onto the other leaves the first', () => {
  const p = new PadelCourts();
  p.join(ann, 'court-1');
  assert.deepEqual(p.join(ann, 'court-2'), { ok: true, slot: 0, left: 'court-1' });
  assert.equal(p.seatOf('a')?.court, 'court-2');
  assert.equal(p.state().find((s) => s.id === 'court-1')!.host, null);
});

test('padel sessions: the host leaves and the next person runs it from where it was; the last one off frees the court', () => {
  const p = new PadelCourts();
  p.join(ann, 'court-1');
  p.join(bob, 'court-1');
  assert.ok(p.sync('a', 'court-1', snap([2, 1]), 1000));
  assert.equal(p.leave('a'), 'court-1');
  let seat = p.state().find((s) => s.id === 'court-1')!;
  assert.equal(seat.host, 'b');
  // The match goes on: its games and last snapshot stay for the new host.
  assert.deepEqual(seat.score, [2, 1]);
  assert.ok(seat.snap);
  // Someone joining mid-match takes a computer's place, and the match goes on.
  p.join(cat, 'court-1');
  seat = p.state().find((s) => s.id === 'court-1')!;
  assert.deepEqual(seat.score, [2, 1]);
  p.leave('b');
  p.leave('c');
  seat = p.state().find((s) => s.id === 'court-1')!;
  assert.deepEqual(seat, { id: 'court-1', players: [null, null, null, null], host: null, score: [0, 0], win: -1 });
  assert.equal(p.leave('zzz'), undefined);
  // An empty court: whoever comes next starts a new match.
  p.join(ann, 'court-1');
  assert.deepEqual(p.state().find((s) => s.id === 'court-1')!.score, [0, 0]);
});

test('padel sessions: only the host snapshots, only others on the court move, within their rates; odd payloads are refused', () => {
  const p = new PadelCourts();
  p.join(ann, 'court-1');
  p.join(bob, 'court-1');
  assert.equal(p.sync('b', 'court-1', snap(), 1000), null, 'not the host');
  assert.equal(p.sync('a', 'court-2', snap(), 1000), null, 'not their court');
  assert.equal(p.sync('a', 'court-9', snap(), 1000), null);
  assert.equal(p.sync('a', 'court-1', { s: new Array(200).fill(0), score: [0, 0], win: -1 }, 1000), null, 'too big');
  assert.equal(p.sync('a', 'court-1', { s: [NaN], score: [0, 0], win: -1 }, 1000), null);
  assert.equal(p.sync('a', 'court-1', { s: [1], score: [0, 0], win: 2 }, 1000), null);
  const ok = p.sync('a', 'court-1', { ...snap([1, 0]), extra: 'x' }, 1000);
  assert.ok(ok && ok.scored && !('extra' in ok.relay));
  assert.equal(p.input('a', 'court-1', [1, 0, 0, 0], 1000), null, 'the host plays straight into its own game');
  assert.equal(p.input('c', 'court-1', [1, 0, 0, 0], 1000), null, 'not on the court');
  assert.equal(p.input('b', 'court-1', [1, 2, 3, 4, 5], 1000), null, 'too many numbers');
  assert.equal(p.input('b', 'court-1', ['x'], 1000), null);
  assert.deepEqual(p.input('b', 'court-1', [1, 2, -6, 1], 1000), { host: 'a', slot: 2, input: [1, 2, -6, 1] });
  // A flood is cut short, and allowed again a moment later.
  let passed = 0;
  for (let i = 0; i < 100; i++) if (p.input('b', 'court-1', [0, 0, 0, 1], 2000)) passed++;
  assert.ok(passed < 10, `${passed} got through`);
  assert.ok(p.input('b', 'court-1', [0, 0, 0, 1], 3000));
  let snaps = 0;
  for (let i = 0; i < 100; i++) if (p.sync('a', 'court-1', snap(), 5000)) snaps++;
  assert.ok(snaps < 10);
});

function hooks(id: string, inHall: boolean, log: { to: string; msg: ServerMsg }[]): PadelHooks {
  return {
    id,
    who: id.toUpperCase(),
    color: '#fff',
    inHall,
    now: 5000,
    toHall: (msg, except) => log.push({ to: `hall${except ? `-${except}` : ''}`, msg }),
    toClient: (to, msg) => log.push({ to, msg }),
    warn: (text) => log.push({ to: id, msg: { t: 'toast', text, level: 'warn' } }),
  };
}

test('padel messages: only from inside the hall; joins, snapshots and moves go where they should', () => {
  const p = new PadelCourts();
  const log: { to: string; msg: ServerMsg }[] = [];
  padelMessage(p, { t: 'padel.join', court: 'court-1' }, hooks('a', false, log));
  assert.equal(log.length, 1);
  assert.match((log[0].msg as { text: string }).text, /padel hall/);
  assert.equal(p.seatOf('a'), null);
  padelMessage(p, { t: 'padel.look' }, hooks('a', false, log));
  assert.equal(log.length, 1, 'no courts for someone outside');
  log.length = 0;
  padelMessage(p, { t: 'padel.look' }, hooks('a', true, log));
  assert.equal(log[0].to, 'a');
  assert.equal(log[0].msg.t, 'padel');
  log.length = 0;
  padelMessage(p, { t: 'padel.join', court: 'court-1' }, hooks('a', true, log));
  padelMessage(p, { t: 'padel.join', court: 'court-1', slot: 3 }, hooks('b', true, log));
  assert.deepEqual(log.map((l) => [l.to, l.msg.t]), [
    ['hall', 'padel'],
    ['hall', 'padel'],
  ]);
  assert.equal(p.seatOf('b')?.slot, 3);
  log.length = 0;
  padelMessage(p, { t: 'padel.join', court: 'nope' as 'court-1' }, hooks('c', true, log));
  assert.equal(log.length, 0);
  padelMessage(p, { t: 'padel.input', court: 'court-1', input: [1, 1, 6, 0] }, hooks('b', true, log));
  assert.deepEqual(log, [{ to: 'a', msg: { t: 'padel.input', court: 'court-1', slot: 3, input: [1, 1, 6, 0] } }]);
  log.length = 0;
  // A move from outside the hall doesn't get through.
  padelMessage(p, { t: 'padel.input', court: 'court-1', input: [1, 1, 6, 0] }, hooks('b', false, log));
  assert.equal(log.length, 0);
  padelMessage(p, { t: 'padel.sync', court: 'court-1', snap: snap() }, hooks('a', true, log));
  assert.deepEqual(log.map((l) => [l.to, l.msg.t]), [['hall-a', 'padel.sync']]);
  log.length = 0;
  padelMessage(p, { t: 'padel.sync', court: 'court-1', snap: snap([1, 0]) }, hooks('a', true, log));
  assert.deepEqual(log.map((l) => [l.to, l.msg.t]), [
    ['hall-a', 'padel.sync'],
    ['hall', 'padel'],
  ]);
  log.length = 0;
  // Stepping off works from anywhere (the office also takes people off when they leave the hall).
  padelMessage(p, { t: 'padel.leave' }, hooks('a', false, log));
  assert.equal(p.state()[0].host, 'b');
  assert.deepEqual(log.map((l) => [l.to, l.msg.t]), [['hall', 'padel']]);
});

test('padel messages are play: guests may send them', () => {
  for (const t of ['padel.look', 'padel.join', 'padel.leave', 'padel.input', 'padel.sync']) assert.ok(GUEST_MSGS.has(t as never), t);
  assert.ok(allReviewed);
});
