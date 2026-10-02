import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Minigolf } from '../src/server/bowling/minigolf.js';
import { MinigolfRecords } from '../src/server/bowling/minigolf-records.js';
import { GUEST_MSGS } from '../src/server/guests.js';
import { PARTY_SEES_MSGS } from '../src/server/party.js';
import { HOLES, toRoom } from '../src/shared/minigolf-holes.js';
import { simulate } from '../src/shared/minigolf-physics.js';
import { MAX_STROKES, PLUS, TURN_MS, cardTotal, clockSec, isMinigolfMsg, type MgEvent, type MgView, type MinigolfServerMsg } from '../src/shared/minigolf.js';
import type { ServerMsg } from '../src/shared/protocol.js';

// The black-light mini golf on the server (flrnoh fork, see FORK.md "Black-light mini golf"): the
// putters, putts worked out with the shared physics, the cards, groups taking turns, the records.

const ACES: Record<number, [number, number, number]> = { 1: [2.69, 0.98, 100], 2: [2.49, 0.92, 100], 3: [2.813, 0.96, 100], 4: [-3.497, 0.92, 100], 5: [-3.47, 0.9, 100], 6: [2.19, 0.98, 100], 7: [2.546, 0.86, 100], 8: [2.38, 0.98, 100], 9: [2.88, 0.76, 100] };

function course(dataDir?: string) {
  let now = 3_600_000 * 500; // on the hour: clockSec(now) is 0
  const pos = new Map<string, { x: number; z: number }>();
  const all: ServerMsg[] = [];
  const got = new Map<string, ServerMsg[]>();
  const g = new Minigolf({ now: () => now, where: (id) => pos.get(id) ?? null, send: (id, m) => got.get(id)?.push(m), toAll: (m) => all.push(m), dataDir });
  const join = (id: string) => {
    got.set(id, []);
    g.message({ id, owner: `name:${id}`, name: id }, { t: 'mg.take' });
  };
  const view = () => (all.filter((m) => m.t === 'mg').at(-1) as Extract<MinigolfServerMsg, { t: 'mg' }>).view as MgView;
  const me = (id: string) => view().players.find((p) => p.id === id)!;
  /** Stands `id` by their ball. */
  const stand = (id: string) => {
    const p = me(id);
    const at = toRoom(HOLES[p.hole - 1], p.ball.x, p.ball.z);
    pos.set(id, { x: at.x + 0.4, z: at.z });
  };
  const events = () => all.filter((m): m is Extract<MinigolfServerMsg, { t: 'mg' }> => m.t === 'mg' && !!m.event).map((m) => m.event as MgEvent);
  /** A putt at the clock's `t` (seconds into the hour), and the clock run on till it's rolled out. */
  const putt = (id: string, dir: number, power: number, t = 100) => {
    // `t` into this hour, or the next one: the clock only goes forward, the windmill's where it was.
    const at = now - (now % 3_600_000) + t * 1000;
    now = at > now ? at : at + 3_600_000;
    stand(id);
    const warn = g.message({ id, owner: `name:${id}`, name: id }, { t: 'mg.putt', hole: me(id).hole, dir, power, at: now });
    now += 41_000;
    g.tick();
    return warn;
  };
  return { g, pos, all, got, join, view, me, putt, events, stand, at: () => now, advance: (ms: number) => (now += ms) };
}

test('the stand hands out a putter and a ball in a colour of your own, and takes them back', () => {
  const c = course();
  c.join('ann');
  c.join('bob');
  assert.equal(c.view().players.length, 2);
  assert.notEqual(c.me('ann').color, c.me('bob').color);
  assert.equal(c.me('ann').hole, 1);
  assert.ok(c.got.get('ann')!.some((m) => m.t === 'mg' && m.mine), 'your own records');
  c.g.message({ id: 'ann', owner: 'name:ann', name: 'ann' }, { t: 'mg.return' });
  assert.equal(c.view().players.length, 1);
});

test('a putt is worked out with the shared physics, sent to everyone, and on the card once it has rolled out', () => {
  const c = course();
  c.join('ann');
  const [dir, power, t] = ACES[1];
  c.stand('ann');
  const at = 3_600_000 * 500 + t * 1000;
  c.advance(at - c.at());
  c.g.message({ id: 'ann', owner: 'name:ann', name: 'ann' }, { t: 'mg.putt', hole: 1, dir, power, at });
  const shot = c.all.find((m) => m.t === 'mg.putt') as Extract<MinigolfServerMsg, { t: 'mg.putt' }>;
  assert.ok(shot);
  assert.deepEqual(shot.shot.result, simulate(HOLES[0].course, HOLES[0].tee.x === shot.shot.from.x ? HOLES[0].tee : shot.shot.from, dir, power, clockSec(at)));
  assert.equal(c.me('ann').rolling, true);
  assert.equal(c.me('ann').card[0], null, 'not on the card while it rolls');
  c.advance(41_000);
  c.g.tick();
  assert.equal(c.me('ann').rolling, false);
});

test('far from your ball, or a putt from outside the centre, does nothing', () => {
  const c = course();
  c.join('ann');
  c.pos.set('ann', { x: 15, z: -15 });
  const w = c.g.message({ id: 'ann', owner: 'name:ann', name: 'ann' }, { t: 'mg.putt', hole: 1, dir: Math.PI, power: 0.5, at: c.at() });
  assert.match(String(w), /Ball/);
  c.pos.delete('ann');
  c.g.message({ id: 'ann', owner: 'name:ann', name: 'ann' }, { t: 'mg.putt', hole: 1, dir: Math.PI, power: 0.5, at: c.at() });
  assert.ok(!c.all.some((m) => m.t === 'mg.putt'));
});

test('a hole in one: on the card, the records, and on to the next hole', () => {
  const c = course();
  c.join('ann');
  c.putt('ann', ...ACES[1]);
  assert.equal(c.me('ann').card[0], 1);
  assert.equal(c.me('ann').hole, 2);
  assert.ok(c.events().some((e) => e.k === 'ace'));
  assert.equal(c.view().aces, 1);
});

test('seven strokes at most: then a "+", counting eight, and on to the next', () => {
  const c = course();
  c.join('ann');
  for (let i = 0; i < MAX_STROKES; i++) c.putt('ann', Math.PI, 0.02 + i * 0.001, 10 + i * 50);
  assert.equal(c.me('ann').card[0], PLUS);
  assert.equal(c.me('ann').hole, 2);
  assert.ok(c.events().some((e) => e.k === 'plus'));
});

test('picking up is a "+"', () => {
  const c = course();
  c.join('ann');
  c.g.message({ id: 'ann', owner: 'name:ann', name: 'ann' }, { t: 'mg.pickup' });
  assert.equal(c.me('ann').card[0], PLUS);
  assert.equal(c.me('ann').hole, 2);
});

test('a whole round goes on the records: best ever, best this week, saved in minigolf.json', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'mg-'));
  try {
    const c = course(dir);
    c.join('ann');
    for (let n = 1; n <= 9; n++) c.putt('ann', ...ACES[n]);
    const round = c.events().find((e) => e.k === 'round') as Extract<MgEvent, { k: 'round' }>;
    assert.equal(round.total, 9);
    assert.ok(round.best && round.week);
    assert.equal(c.me('ann').hole, 0, 'done');
    assert.equal(c.view().best[0].total, 9);
    assert.equal(c.view().week[0].name, 'ann');
    const file = path.join(dir, 'minigolf.json');
    assert.equal(statSync(file).mode & 0o777, 0o600);
    const saved = JSON.parse(readFileSync(file, 'utf8'));
    assert.equal(saved.players['name:ann'].best, 9);
    assert.equal(saved.players['name:ann'].aces, 9);
    // Kept across a restart.
    const again = new MinigolfRecords(dir);
    assert.equal(again.best()[0].total, 9);
    assert.equal(again.mine('name:ann', c.at()).aces, 9);
    // A worse round isn't a new best; a new week starts the week's afresh.
    const r = again.round('name:ann', 'ann', 20, c.at() + 8 * 86_400_000);
    assert.deepEqual(r, { best: false, week: true });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a group gathered at the first tee takes turns: least strokes on the hole first, in order', () => {
  const c = course();
  for (const id of ['ann', 'bob', 'cat']) c.join(id);
  const tee = toRoom(HOLES[0], 0, 0);
  for (const id of ['ann', 'bob']) c.pos.set(id, { x: tee.x + 1, z: tee.z });
  c.pos.set('cat', { x: 15, z: -15 });
  c.g.message({ id: 'ann', owner: 'name:ann', name: 'ann' }, { t: 'mg.group' });
  const g = c.view().groups[0];
  assert.deepEqual(g.players, ['ann', 'bob'], 'cat was too far away');
  assert.equal(g.turn, 'ann');
  // Not bob's turn.
  assert.match(String(c.putt('bob', Math.PI, 0.3, 5)), /ann/);
  c.putt('ann', Math.PI, 0.3, 50);
  assert.equal(c.view().groups[0].turn, 'bob');
  c.g.message({ id: 'bob', owner: 'name:bob', name: 'bob' }, { t: 'mg.pickup' });
  assert.equal(c.me('bob').card[0], PLUS);
  assert.equal(c.me('bob').hole, 1, 'waits for the group');
  assert.equal(c.view().groups[0].turn, 'ann');
  c.g.message({ id: 'ann', owner: 'name:ann', name: 'ann' }, { t: 'mg.pickup' });
  assert.equal(c.me('ann').hole, 2);
  assert.equal(c.me('bob').hole, 2, 'on together');
  assert.equal(c.view().groups[0].turn, 'ann');
});

test('a turn not taken passes on; someone leaving the group hands it on too', () => {
  const c = course();
  for (const id of ['ann', 'bob', 'cat']) c.join(id);
  const tee = toRoom(HOLES[0], 0, 0);
  for (const id of ['ann', 'bob', 'cat']) c.pos.set(id, { x: tee.x + 1, z: tee.z });
  c.g.message({ id: 'bob', owner: 'name:bob', name: 'bob' }, { t: 'mg.group' });
  assert.equal(c.view().groups[0].turn, 'bob');
  c.advance(TURN_MS + 10);
  c.g.tick();
  assert.equal(c.view().groups[0].turn, 'ann');
  c.g.leave('ann');
  assert.equal(c.view().groups[0].turn, 'bob', 'least strokes, first in the order');
  c.g.leave('cat');
  assert.equal(c.view().groups.length, 0, 'one left plays on alone');
  assert.equal(c.me('bob').group, undefined);
});

test('mid-round you can’t start another; a finished round can', () => {
  const c = course();
  c.join('ann');
  c.putt('ann', Math.PI, 0.3, 5);
  const tee = toRoom(HOLES[0], 0, 0);
  c.pos.set('ann', tee);
  assert.match(String(c.g.message({ id: 'ann', owner: 'name:ann', name: 'ann' }, { t: 'mg.group' })), /Runde/);
  assert.ok(cardTotal(c.me('ann').card) === 0 && c.me('ann').strokes === 1);
});

test('guests and party guests play; party guests see it', () => {
  for (const t of ['mg.look', 'mg.take', 'mg.return', 'mg.group', 'mg.putt', 'mg.pickup']) {
    assert.ok(GUEST_MSGS.has(t), t);
    assert.ok(isMinigolfMsg(t));
  }
  for (const t of ['mg', 'mg.putt']) assert.ok(PARTY_SEES_MSGS.has(t), t);
});
