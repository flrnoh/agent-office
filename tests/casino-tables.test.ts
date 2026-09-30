import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CASINO, CASINO_BOX, CASINO_ROOM, CASINO_TABLES, CASINO_DOOR, CASHIER, START_CHIPS, validBet, type CasinoServerMsg } from '../src/shared/casino.js';
import { GUEST_MSGS } from '../src/server/guests.js';
import { Casino, type CasinoContext, type CasinoGame, type CasinoPlayer, type Seated } from '../src/server/casino/index.js';
import { GOLF_HOLE, ROAD } from '../src/shared/layout.js';

// The casino's tables (flrnoh fork): the registry, seating, the generic messages, rate limits.

function setup() {
  const d = mkdtempSync(path.join(tmpdir(), 'casino-tables-'));
  const t = { now: 5_000_000 };
  const casino = new Casino(d, { now: () => t.now, manualTick: true });
  const inbox = new Map<string, CasinoServerMsg[]>();
  const player = (id: string, name: string, owner = `name:${name}`): CasinoPlayer => {
    inbox.set(id, []);
    return { id, owner, name, send: (m) => inbox.get(id)!.push(m) };
  };
  const last = (id: string, pred: (m: CasinoServerMsg) => boolean) => inbox.get(id)!.filter(pred).at(-1);
  const said = (id: string) => (inbox.get(id)!.filter((m) => m.t === 'casino.result').at(-1) as { text: string } | undefined)?.text ?? '';
  return { d, t, casino, inbox, player, last, said, done: () => (casino.stop(), rmSync(d, { recursive: true, force: true })) };
}

test('every table in the layout is registered, inside the room, and apart', () => {
  const s = setup();
  try {
    assert.deepEqual(s.casino.tableIds().sort(), CASINO_TABLES.map((t) => t.id).sort());
    for (const t of CASINO_TABLES) {
      assert.ok(t.x > CASINO_ROOM.minX && t.x < CASINO_ROOM.maxX && t.z > CASINO_ROOM.minZ && t.z < CASINO_ROOM.maxZ, t.id);
      assert.equal(s.casino.table(t.id)!.kind, t.kind);
      assert.equal(s.casino.table(t.id)!.seats, t.seats);
    }
    const big = CASINO_TABLES.filter((t) => t.kind !== 'slots');
    for (const a of big) for (const b of big) if (a !== b) assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > 6, `${a.id} and ${b.id} are too close`);
    assert.ok(CASHIER.x < CASINO_ROOM.maxX);
    // Across the street, clear of the road, the sidewalk and the golf hole's fairway.
    assert.ok(CASINO_BOX.minZ > ROAD.maxZ + 2);
    assert.ok(CASINO_BOX.maxX < GOLF_HOLE.fairway[0]);
    assert.ok(CASINO_DOOR.x > CASINO_BOX.minX && CASINO_DOOR.x < CASINO_BOX.maxX);
    assert.ok(CASINO.startsWith('@'));
  } finally {
    s.done();
  }
});

test('entering: your chips and every table’s view', () => {
  const s = setup();
  try {
    s.casino.enter(s.player('c1', 'Ada'));
    const msgs = s.inbox.get('c1')!;
    assert.deepEqual(msgs.find((m) => m.t === 'casino.wallet'), { t: 'casino.wallet', chips: START_CHIPS });
    assert.equal(msgs.filter((m) => m.t === 'casino.table').length, CASINO_TABLES.length);
    assert.equal(s.casino.inside().length, 1);
  } finally {
    s.done();
  }
});

test('seats: one table at a time, a machine for one, placeholders say coming soon', () => {
  const s = setup();
  try {
    s.casino.enter(s.player('a', 'Ada'));
    s.casino.enter(s.player('b', 'Bo'));
    s.casino.message('a', { t: 'casino.sit', table: 'slots-2' });
    s.casino.message('b', { t: 'casino.sit', table: 'slots-2' });
    assert.match(s.said('b'), /Somebody is playing/);
    // Everyone sees who's at the machine.
    const seen = s.last('b', (m) => m.t === 'casino.table' && m.table === 'slots-2') as { state: { player?: string } };
    assert.equal(seen.state.player, 'Ada');
    // Over to roulette: up from the machine first.
    s.casino.message('a', { t: 'casino.sit', table: 'roulette' });
    const machine = s.last('b', (m) => m.t === 'casino.table' && m.table === 'slots-2') as { state: { player?: string } };
    assert.equal(machine.state.player, undefined);
    s.casino.message('a', { t: 'casino.act', table: 'roulette', action: 'bet', data: { on: 'red', amount: 10 } });
    assert.match(s.said('a'), /Coming soon/);
    // Not seated there: no playing it.
    s.casino.message('b', { t: 'casino.act', table: 'roulette', action: 'bet' });
    assert.match(s.said('b'), /Take a seat first/);
    s.casino.message('b', { t: 'casino.sit', table: 'nowhere' });
    assert.match(s.said('b'), /No such table/);
    // Leaving stands you up.
    s.casino.leave('a');
    const rt = s.last('b', (m) => m.t === 'casino.table' && m.table === 'roulette') as { state: { seated: string[] } };
    assert.deepEqual(rt.state.seated, []);
    // Messages from someone who isn't inside go nowhere.
    s.casino.message('a', { t: 'casino.sit', table: 'slots-1' });
    assert.equal(s.casino.table('slots-1')!.view(null) && (s.casino.table('slots-1')!.view(null) as { player?: string }).player, undefined);
  } finally {
    s.done();
  }
});

test('a full table turns people away', () => {
  const s = setup();
  try {
    for (let i = 0; i < 6; i++) {
      s.casino.enter(s.player(`p${i}`, `P${i}`));
      s.casino.message(`p${i}`, { t: 'casino.sit', table: 'blackjack-1' });
    }
    assert.match(s.said('p5'), /full/);
    assert.equal((s.casino.table('blackjack-1')!.view(null) as { seated: string[] }).seated.length, 5);
  } finally {
    s.done();
  }
});

test('two tabs of one person: one seat, and leaving one keeps it', () => {
  const s = setup();
  try {
    s.casino.enter(s.player('t1', 'Ada', 'account:a'));
    s.casino.enter(s.player('t2', 'Ada', 'account:a'));
    s.casino.message('t1', { t: 'casino.sit', table: 'slots-1' });
    s.casino.leave('t1');
    assert.equal((s.casino.table('slots-1')!.view(null) as { player?: string }).player, 'Ada');
    s.casino.leave('t2');
    assert.equal((s.casino.table('slots-1')!.view(null) as { player?: string }).player, undefined);
  } finally {
    s.done();
  }
});

test('rate limits: acting and sitting only so fast', () => {
  const s = setup();
  try {
    s.casino.enter(s.player('a', 'Ada'));
    s.casino.message('a', { t: 'casino.sit', table: 'poker' });
    let refused = 0;
    for (let i = 0; i < 30; i++) {
      s.casino.message('a', { t: 'casino.act', table: 'poker', action: 'x' });
      if (/Easy there/.test(s.said('a'))) refused++;
    }
    assert.ok(refused >= 20, `refused ${refused}`);
    // A second later, some are back.
    s.t.now += 1000;
    s.casino.message('a', { t: 'casino.act', table: 'poker', action: 'x' });
    assert.match(s.said('a'), /Coming soon/);
    // Hopping from table to table, too.
    for (let i = 0; i < 10; i++) s.casino.message('a', { t: 'casino.sit', table: i % 2 ? 'roulette' : 'poker' });
    assert.match(s.said('a'), /one table at a time/);
  } finally {
    s.done();
  }
});

test('a game plugs in: stakes are checked and paid through the casino, views go to everyone', () => {
  const s = setup();
  try {
    /** A coin toss: heads doubles the stake. */
    class Coin implements CasinoGame {
      readonly id = 'roulette';
      readonly kind = 'roulette' as const;
      readonly seats = 2;
      flips = 0;
      sit(_p: Seated, ctx: CasinoContext) {
        ctx.changed();
      }
      stand() {}
      act(p: Seated, action: string, data: unknown, ctx: CasinoContext) {
        if (action !== 'flip') return 'flip only';
        const err = ctx.stake(p.owner, data, { max: 100 });
        if (err) return err;
        this.flips++;
        if (ctx.random(2) === 1) ctx.pay(p.owner, (data as number) * 2);
        ctx.changed();
      }
      tick() {}
      view(forOwner: string | null) {
        return { flips: this.flips, you: forOwner };
      }
    }
    s.casino.register(new Coin());
    s.casino.enter(s.player('a', 'Ada'));
    s.casino.enter(s.player('b', 'Bo'));
    s.casino.message('a', { t: 'casino.sit', table: 'roulette' });
    s.casino.message('a', { t: 'casino.act', table: 'roulette', action: 'flip', data: 101 });
    assert.match(s.said('a'), /Stakes are 1 to 100/);
    s.casino.message('a', { t: 'casino.act', table: 'roulette', action: 'flip', data: 50 });
    const chips = s.casino.wallets.chips('name:Ada');
    assert.ok(chips === START_CHIPS - 50 || chips === START_CHIPS + 50, String(chips));
    // Ada sees her own view, Bo the one for someone not seated.
    assert.deepEqual((s.last('a', (m) => m.t === 'casino.table' && m.table === 'roulette') as { state: unknown }).state, { flips: 1, you: 'name:Ada' });
    assert.deepEqual((s.last('b', (m) => m.t === 'casino.table' && m.table === 'roulette') as { state: unknown }).state, { flips: 1, you: null });
  } finally {
    s.done();
  }
});

test('bets are whole chips within the limits', () => {
  assert.equal(validBet(1), true);
  assert.equal(validBet(500), true);
  for (const bad of [0, 501, 1.5, -1, '5', NaN, null, undefined]) assert.equal(validBet(bad), false, String(bad));
});

test('guests may play: every casino message is a guest’s', () => {
  for (const t of ['casino.sit', 'casino.stand', 'casino.act']) assert.ok(GUEST_MSGS.has(t), t);
});
