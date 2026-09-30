import test from 'node:test';
import assert from 'node:assert/strict';
import { RoofTables, tableMessage, type TableHooks } from '../src/server/tablegames.js';
import { allReviewed, GUEST_MSGS } from '../src/server/guests.js';
import type { ServerMsg } from '../src/shared/protocol.js';

const ann = { id: 'a', name: 'Ann', color: '#f00' };
const bob = { id: 'b', name: 'Bob', color: '#00f' };
const cat = { id: 'c', name: 'Cat', color: '#0f0' };
const snap = (score: [number, number] = [0, 0], win: -1 | 0 | 1 = -1) => ({ s: [1, 2, 3], score, win, ev: [1, 0, 0] });

test('table sessions: the first two up play, the first one runs it, a third is told to watch', () => {
  const t = new RoofTables();
  assert.deepEqual(t.join(ann, 'hockey'), { ok: true, side: 0 });
  assert.deepEqual(t.join(bob, 'hockey'), { ok: true, side: 1 });
  const r = t.join(cat, 'hockey');
  assert.ok('error' in r && /watch/.test(r.error));
  const seat = t.state().find((s) => s.id === 'hockey')!;
  assert.equal(seat.host, 'a');
  assert.deepEqual(seat.players.map((p) => p?.id), ['a', 'b']);
  // Asking for a side that's free gets it.
  const u = new RoofTables();
  assert.deepEqual(u.join(bob, 'pool', 1), { ok: true, side: 1 });
  assert.deepEqual(u.join(ann, 'pool', 1), { ok: true, side: 0 });
});

test('table sessions: one table at a time; stepping up to another leaves the first', () => {
  const t = new RoofTables();
  t.join(ann, 'kicker');
  const r = t.join(ann, 'pool');
  assert.deepEqual(r, { ok: true, side: 0, left: 'kicker' });
  assert.equal(t.seatOf('a')?.table, 'pool');
  assert.equal(t.state().find((s) => s.id === 'kicker')!.host, null);
});

test('table sessions: the host leaves and the other player runs it; the last one out frees the table', () => {
  const t = new RoofTables();
  t.join(ann, 'pingpong');
  t.join(bob, 'pingpong');
  t.sync('a', 'pingpong', snap([3, 2]), 1000);
  assert.equal(t.leave('a'), 'pingpong');
  let seat = t.state().find((s) => s.id === 'pingpong')!;
  assert.equal(seat.host, 'b');
  assert.deepEqual(seat.players.map((p) => p?.id ?? null), [null, 'b']);
  // A new game against the computer: the old score and snapshot are gone.
  assert.deepEqual(seat.score, [0, 0]);
  assert.equal(seat.snap, undefined);
  assert.equal(t.leave('b'), 'pingpong');
  seat = t.state().find((s) => s.id === 'pingpong')!;
  assert.equal(seat.host, null);
  assert.equal(t.leave('b'), undefined);
});

test('table sessions: only the host sends snapshots, not too many, and only good ones', () => {
  const t = new RoofTables();
  t.join(ann, 'hockey');
  t.join(bob, 'hockey');
  assert.equal(t.sync('b', 'hockey', snap(), 1000), null, 'not the host');
  assert.equal(t.sync('c', 'hockey', snap(), 1000), null, 'not at the table');
  assert.equal(t.sync('a', 'hockey', { s: 'x' }, 1000), null, 'not a snapshot');
  assert.equal(t.sync('a', 'nope', snap(), 1000), null, 'no such table');
  const r = t.sync('a', 'hockey', { ...snap([1, 0]), extra: 'no' } as unknown, 1000);
  assert.ok(r && r.scored);
  assert.equal((r!.relay as unknown as Record<string, unknown>).extra, undefined);
  // Kept for whoever comes up later, without the news.
  const seat = t.state().find((s) => s.id === 'hockey')!;
  assert.deepEqual(seat.score, [1, 0]);
  assert.deepEqual(seat.snap, { s: [1, 2, 3], score: [1, 0], win: -1 });
  // A burst is fine; a flood isn't.
  let passed = 0;
  for (let i = 0; i < 50; i++) if (t.sync('a', 'hockey', snap([1, 0]), 2000)) passed++;
  assert.ok(passed < 10, `${passed} of a flood got through`);
  assert.ok(t.sync('a', 'hockey', snap([1, 0]), 3000));
});

test('table sessions: moves go from the other player to the host only', () => {
  const t = new RoofTables();
  t.join(ann, 'pool');
  assert.equal(t.input('a', 'pool', [0, 1, 0.5], 1000), null, 'the host plays its own game');
  t.join(bob, 'pool');
  assert.deepEqual(t.input('b', 'pool', [0, 1, 0.5], 1000), { host: 'a', side: 1, input: [0, 1, 0.5] });
  assert.equal(t.input('c', 'pool', [0, 1, 0.5], 1000), null, 'a watcher');
  assert.equal(t.input('b', 'hockey', [0, 1, 0.5], 1000), null, 'another table');
  assert.equal(t.input('b', 'pool', [0, 1, 2, 3, 4, 5], 1000), null, 'too much');
  assert.equal(t.input('b', 'pool', [NaN], 1000), null, 'not a number');
  // A move and a click straight after it both count.
  assert.ok(t.input('b', 'pool', [1, 0.2, 0.6], 1001));
});

/** The office's hooks, recording what went where. */
function hooks(id: string, onRoof: boolean, log: { to: string; msg: ServerMsg }[]): TableHooks {
  return {
    id,
    who: id.toUpperCase(),
    color: '#fff',
    onRoof,
    now: 5000,
    toRoof: (msg, except) => log.push({ to: `roof${except ? `-${except}` : ''}`, msg }),
    toClient: (to, msg) => log.push({ to, msg }),
    warn: (text) => log.push({ to: id, msg: { t: 'toast', text, level: 'warn' } }),
  };
}

test('table messages: only from up on the roof; joins, snapshots and moves go where they should', () => {
  const t = new RoofTables();
  const log: { to: string; msg: ServerMsg }[] = [];
  // Downstairs: no.
  tableMessage(t, { t: 'table.join', table: 'kicker' }, hooks('a', false, log));
  assert.equal(t.seatOf('a'), null);
  assert.equal(log[0].msg.t, 'toast');
  log.length = 0;
  tableMessage(t, { t: 'table.join', table: 'kicker' }, hooks('a', true, log));
  tableMessage(t, { t: 'table.join', table: 'kicker' }, hooks('b', true, log));
  assert.deepEqual(log.map((l) => `${l.to}:${l.msg.t}`), ['roof:tables', 'roof:tables']);
  log.length = 0;
  tableMessage(t, { t: 'table.sync', table: 'kicker', snap: snap([1, 0]) }, hooks('a', true, log));
  // To everyone up there but the host, then the new score.
  assert.deepEqual(log.map((l) => `${l.to}:${l.msg.t}`), ['roof-a:table.sync', 'roof:tables']);
  log.length = 0;
  tableMessage(t, { t: 'table.input', table: 'kicker', input: [0, 0.1] }, hooks('b', true, log));
  assert.deepEqual(log, [{ to: 'a', msg: { t: 'table.input', table: 'kicker', side: 1, input: [0, 0.1] } }]);
  log.length = 0;
  // Someone else can't send moves or snapshots for the table.
  tableMessage(t, { t: 'table.input', table: 'kicker', input: [1] }, hooks('c', true, log));
  tableMessage(t, { t: 'table.sync', table: 'kicker', snap: snap() }, hooks('b', true, log));
  assert.equal(log.length, 0);
  // A third player is told to watch, and gets the tables as they are.
  tableMessage(t, { t: 'table.join', table: 'kicker' }, hooks('c', true, log));
  assert.deepEqual(log.map((l) => `${l.to}:${l.msg.t}`), ['c:toast', 'c:tables']);
  log.length = 0;
  tableMessage(t, { t: 'table.leave' }, hooks('a', true, log));
  assert.equal(t.state().find((s) => s.id === 'kicker')!.host, 'b');
  assert.deepEqual(log.map((l) => `${l.to}:${l.msg.t}`), ['roof:tables']);
});

test('table messages: guests may play', () => {
  assert.equal(allReviewed, true);
  for (const t of ['table.join', 'table.leave', 'table.input', 'table.sync']) assert.ok(GUEST_MSGS.has(t), t);
});
