import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BET_MS, HISTORY, PAYOUT_MS, POCKETS, REDS, ROUND_MAX, SPIN_MS, SPOT_MAX, WHEEL, betLabel, betNumbers, betOdds, betReturn, type RouletteResult, type RouletteView } from '../src/shared/casino-roulette.js';
import { START_CHIPS, type CasinoServerMsg } from '../src/shared/casino.js';
import { Casino, TICK_MS, type CasinoPlayer } from '../src/server/casino/index.js';
import { WheelClock, pocketAngle } from '../src/client/ui/casino/roulette-wheel.js';

// The roulette table (flrnoh fork): every bet's numbers and payout, the house edge (exactly 1/37 on
// every kind of bet), the round's clock, stakes and refunds, the table's limits, and what everyone sees.

/** Every bet the layout offers. */
function allBets(): string[] {
  const keys = ['red', 'black', 'odd', 'even', 'low', 'high'];
  for (let n = 0; n <= 36; n++) keys.push(`n:${n}`);
  for (let a = 0; a <= 36; a++) for (let b = a + 1; b <= 36; b++) if (betNumbers(`split:${a}-${b}`)) keys.push(`split:${a}-${b}`);
  for (let r = 1; r <= 12; r++) keys.push(`street:${r}`);
  for (let a = 0; a <= 32; a++) if (betNumbers(`corner:${a}`)) keys.push(`corner:${a}`);
  for (let r = 1; r <= 11; r++) keys.push(`line:${r}`);
  for (let d = 1; d <= 3; d++) keys.push(`dozen:${d}`, `column:${d}`);
  return keys;
}

test('the wheel and the colours', () => {
  assert.equal(WHEEL.length, POCKETS);
  assert.deepEqual([...WHEEL].sort((a, b) => a - b), Array.from({ length: 37 }, (_, i) => i));
  assert.equal(REDS.size, 18);
  // Round the wheel the colours alternate after the zero.
  for (let i = 1; i < WHEEL.length - 1; i++) assert.notEqual(REDS.has(WHEEL[i]), REDS.has(WHEEL[i + 1]), `${WHEEL[i]} ${WHEEL[i + 1]}`);
});

test('what every kind of bet covers', () => {
  const keys = allBets();
  const count = (kind: string) => keys.filter((k) => k.startsWith(kind)).length;
  assert.equal(count('split:'), 60, 'splits: 57 on the grid and three with the zero');
  assert.equal(count('corner:'), 23, 'corners: 22 on the grid and the first four');
  assert.deepEqual(betNumbers('column:1'), [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34]);
  assert.deepEqual(betNumbers('dozen:3'), Array.from({ length: 12 }, (_, i) => 25 + i));
  assert.deepEqual(betNumbers('street:4'), [10, 11, 12]);
  assert.deepEqual(betNumbers('corner:5'), [5, 6, 8, 9]);
  assert.deepEqual(betNumbers('corner:0'), [0, 1, 2, 3]);
  assert.deepEqual(betNumbers('line:11'), [31, 32, 33, 34, 35, 36]);
  assert.deepEqual(betNumbers('split:0-2'), [0, 2]);
  for (const k of ['red', 'black', 'odd', 'even', 'low', 'high']) {
    assert.equal(betNumbers(k)!.length, 18, k);
    assert.ok(!betNumbers(k)!.includes(0), `${k} loses on zero`);
  }
  // Not bets: off the grid, not neighbours, junk.
  for (const k of ['n:37', 'n:-1', 'n:', 'split:3-4', 'split:1-5', 'split:2-1', 'split:0-4', 'corner:3', 'corner:33', 'street:0', 'street:13', 'line:12', 'dozen:4', 'column:0', 'green', 'n:1:2', 'n:01x', '', 42, null, {}]) {
    assert.equal(betNumbers(k), null, String(k));
  }
});

test('payouts for every kind of bet, the zero included', () => {
  assert.equal(betOdds('n:17'), 35);
  assert.equal(betOdds('split:8-11'), 17);
  assert.equal(betOdds('street:1'), 11);
  assert.equal(betOdds('corner:1'), 8);
  assert.equal(betOdds('line:1'), 5);
  assert.equal(betOdds('dozen:1'), 2);
  assert.equal(betOdds('column:2'), 2);
  for (const k of ['red', 'black', 'odd', 'even', 'low', 'high']) assert.equal(betOdds(k), 1, k);
  // Stake and win come back together.
  assert.equal(betReturn('n:17', 10, 17), 360);
  assert.equal(betReturn('n:17', 10, 18), 0);
  assert.equal(betReturn('n:0', 2, 0), 72);
  assert.equal(betReturn('red', 10, 1), 20);
  assert.equal(betReturn('black', 10, 2), 20);
  assert.equal(betReturn('odd', 10, 35), 20);
  assert.equal(betReturn('even', 10, 36), 20);
  assert.equal(betReturn('low', 10, 18), 20);
  assert.equal(betReturn('high', 10, 19), 20);
  assert.equal(betReturn('dozen:2', 10, 13), 30);
  assert.equal(betReturn('column:3', 10, 36), 30);
  assert.equal(betReturn('split:0-3', 10, 0), 180);
  assert.equal(betReturn('corner:0', 10, 3), 90);
  assert.equal(betReturn('line:2', 10, 9), 60);
  assert.equal(betReturn('street:12', 10, 34), 120);
  // The zero: every even-money bet, dozen and column loses.
  for (const k of ['red', 'black', 'odd', 'even', 'low', 'high', 'dozen:1', 'dozen:2', 'dozen:3', 'column:1', 'column:2', 'column:3']) assert.equal(betReturn(k, 10, 0), 0, k);
  assert.equal(betLabel('dozen:2'), '2nd 12');
  assert.equal(betLabel('split:8-11'), 'Split 8/11');
});

test('the house edge is exactly 1/37 on every bet (exact over all 37 pockets)', () => {
  for (const k of allBets()) {
    let back = 0;
    for (let n = 0; n < POCKETS; n++) back += betReturn(k, 1, n);
    // Everything that comes back over one of each pocket, against 37 staked: 36/37.
    assert.equal(back, 36, k);
    // The house keeps one stake in 37 (integers, so exact).
    assert.equal(POCKETS - back, 1, k);
  }
});

// ---- The table in the casino ------------------------------------------------------------------

function setup(draws: number[] = []) {
  const d = mkdtempSync(path.join(tmpdir(), 'casino-roulette-'));
  const t = { now: 7_000_000 };
  const casino = new Casino(d, { now: () => t.now, random: () => draws.shift() ?? 0, manualTick: true });
  const inbox = new Map<string, CasinoServerMsg[]>();
  const join = (id: string, name: string) => {
    inbox.set(id, []);
    const p: CasinoPlayer = { id, owner: `name:${name}`, name, send: (m) => inbox.get(id)!.push(m) };
    casino.enter(p);
    casino.message(id, { t: 'casino.sit', table: 'roulette' });
  };
  const view = (id: string) => (inbox.get(id)!.filter((m) => m.t === 'casino.table' && m.table === 'roulette').at(-1) as { state: RouletteView }).state;
  const said = (id: string) => (inbox.get(id)!.filter((m) => m.t === 'casino.result').at(-1) as { text: string } | undefined)?.text ?? '';
  const result = (id: string) => inbox.get(id)!.filter((m) => m.t === 'casino.result' && m.data).at(-1) as { text: string; delta: number; data: RouletteResult } | undefined;
  const chips = (id: string) => casino.wallets.chips(`name:${id}`);
  const act = (id: string, action: string, data?: unknown) => {
    t.now += 300; // under the casino's rate limit
    casino.message(id, { t: 'casino.act', table: 'roulette', action, ...(data !== undefined ? { data } : {}) });
  };
  const bet = (id: string, key: string, amount: number) => act(id, 'bet', { key, amount });
  /** Runs the clock forward `ms`, a tick at a time. */
  const run = (ms: number) => {
    for (let left = ms; left > 0; left -= TICK_MS) {
      t.now += Math.min(TICK_MS, left);
      casino.tick();
    }
  };
  const table = () => casino.table('roulette')!.view(null) as RouletteView;
  return { d, t, casino, inbox, join, view, said, result, chips, act, bet, run, table, done: () => (casino.stop(), rmSync(d, { recursive: true, force: true })) };
}

test('the round: idle until someone sits, bets, no more bets, spin, payout, again', () => {
  const s = setup([17, 5]);
  try {
    assert.equal(s.table().phase, 'idle');
    s.join('a', 'Ada');
    const v = s.table();
    assert.equal(v.phase, 'betting');
    assert.equal(v.round, 1);
    assert.equal(v.endsAt! - v.now, BET_MS);
    s.run(BET_MS - TICK_MS);
    assert.equal(s.table().phase, 'betting');
    s.run(TICK_MS);
    assert.equal(s.table().phase, 'spinning');
    // Drawn as the wheel starts: the number rides along (bets are closed), the history waits.
    assert.equal(s.table().number, 17);
    assert.deepEqual(s.table().history, []);
    s.bet('a', 'red', 5);
    assert.match(s.said('a'), /No more bets/);
    s.run(SPIN_MS);
    assert.equal(s.table().phase, 'payout');
    assert.deepEqual(s.table().history, [17]);
    s.run(PAYOUT_MS);
    const next = s.table();
    assert.equal(next.phase, 'betting');
    assert.equal(next.round, 2);
    assert.equal(next.number, undefined);
    // Everybody up: the round in hand finishes, then the wheel rests.
    s.run(BET_MS + SPIN_MS);
    s.casino.message('a', { t: 'casino.stand' });
    assert.equal(s.table().phase, 'payout');
    s.run(PAYOUT_MS);
    assert.equal(s.table().phase, 'idle');
    assert.deepEqual(s.table().history, [5, 17]);
    s.run(60_000);
    assert.equal(s.table().phase, 'idle');
  } finally {
    s.done();
  }
});

test('getting up while bets are open: the wheel rests, and your bets come back', () => {
  const s = setup();
  try {
    s.join('a', 'Ada');
    s.bet('a', 'n:7', 50);
    assert.equal(s.chips('Ada'), START_CHIPS - 50);
    s.casino.message('a', { t: 'casino.stand' });
    assert.equal(s.chips('Ada'), START_CHIPS);
    assert.equal(s.table().phase, 'idle');
    assert.deepEqual(s.table().bets, []);
  } finally {
    s.done();
  }
});

test('stakes at placement, refunds on remove / undo / clear, and the payout against the number', () => {
  const s = setup([17]);
  try {
    s.join('a', 'Ada');
    s.bet('a', 'n:17', 10);
    s.bet('a', 'red', 20);
    s.bet('a', 'black', 30);
    s.bet('a', 'dozen:2', 5);
    s.bet('a', 'column:2', 5); // 17 is in column 2 (2, 5, … 17 …)
    s.bet('a', 'n:17', 5); // adds up on the spot
    assert.equal(s.chips('Ada'), START_CHIPS - 75);
    assert.equal(s.table().bets.find((b) => b.key === 'n:17')!.amount, 15);
    // Undo: the last 5 on 17 comes back.
    s.act('a', 'undo');
    assert.equal(s.chips('Ada'), START_CHIPS - 70);
    assert.equal(s.table().bets.find((b) => b.key === 'n:17')!.amount, 10);
    // Remove: the whole spot.
    s.act('a', 'remove', { key: 'red' });
    assert.equal(s.chips('Ada'), START_CHIPS - 50);
    s.act('a', 'remove', { key: 'red' });
    assert.match(s.said('a'), /nothing there/);
    // Back on red, then spin: 17 is black, odd, low, 2nd dozen, 2nd column.
    s.bet('a', 'red', 20);
    const before = s.chips('Ada');
    assert.equal(before, START_CHIPS - 70);
    s.run(BET_MS + SPIN_MS);
    // n:17 10 → 360; black 30 → 60; dozen 2 5 → 15; column 2 5 → 15; red 20 → 0.
    const won = 360 + 60 + 15 + 15;
    assert.equal(s.chips('Ada'), before + won);
    const r = s.result('a')!;
    assert.equal(r.data.number, 17);
    assert.equal(r.data.staked, 70);
    assert.equal(r.data.won, won);
    assert.equal(r.delta, won - 70);
    assert.match(r.text, /17 black/);
    assert.deepEqual(s.table().winners, [{ seat: 0, name: 'Ada', won }]);
    assert.deepEqual(s.table().bets, []);
    // Clear takes everything off.
    s.run(PAYOUT_MS);
    s.bet('a', 'odd', 10);
    s.bet('a', 'n:3', 10);
    s.act('a', 'clear');
    assert.equal(s.chips('Ada'), before + won);
    assert.deepEqual(s.table().bets, []);
    // Rebet: last round's bets again.
    s.act('a', 'rebet');
    assert.equal(s.chips('Ada'), before + won - 70);
    assert.equal(s.table().bets.length, 5);
  } finally {
    s.done();
  }
});

test('zero: even-money bets lose, the zero pays 35 to 1', () => {
  const s = setup([0]);
  try {
    s.join('a', 'Ada');
    for (const k of ['red', 'black', 'odd', 'even', 'low', 'high']) s.bet('a', k, 10);
    s.run(1000); // (the rate limit)
    s.bet('a', 'n:0', 2);
    s.bet('a', 'split:0-1', 2);
    s.run(BET_MS + SPIN_MS);
    assert.equal(s.chips('Ada'), START_CHIPS - 64 + 72 + 36);
    assert.match(s.said('a'), /^0 green/);
  } finally {
    s.done();
  }
});

test('limits: 1..500 on a spot, 1,000 a round, whole chips, what you have, real bets only', () => {
  const s = setup();
  try {
    s.join('a', 'Ada');
    s.bet('a', 'red', 0);
    assert.match(s.said('a'), /whole chips/);
    s.bet('a', 'red', 2.5);
    assert.match(s.said('a'), /whole chips/);
    s.bet('a', 'red', SPOT_MAX + 1);
    assert.match(s.said('a'), /At most 500 on one spot/);
    s.bet('a', 'n:40', 5);
    assert.match(s.said('a'), /not a bet/);
    s.bet('a', 'red', 400);
    s.bet('a', 'red', 101);
    assert.match(s.said('a'), /100 more fits on Red/);
    s.bet('a', 'red', 100);
    s.bet('a', 'red', 1);
    assert.match(s.said('a'), /table limit/);
    s.bet('a', 'black', 500);
    assert.equal(s.chips('Ada'), 0);
    s.bet('a', 'odd', 1);
    assert.match(s.said('a'), /round’s limit \(1000/);
    assert.equal(ROUND_MAX, 1000);
    s.act('a', 'remove', { key: 'black' });
    s.act('a', 'remove', { key: 'red' });
    // Not more than you have.
    s.casino.wallets.debit('name:Ada', 990);
    s.bet('a', 'odd', 20);
    assert.match(s.said('a'), /only have 10/);
    assert.equal(s.chips('Ada'), 10);
    s.act('a', 'dance');
    assert.match(s.said('a'), /No such move/);
  } finally {
    s.done();
  }
});

test('two players: everyone sees every bet, each is paid their own', () => {
  const s = setup([32]);
  try {
    s.join('a', 'Ada');
    s.join('b', 'Bo');
    s.inbox.set('c', []);
    s.casino.enter({ id: 'c', owner: 'name:Cy', name: 'Cy', send: (m) => s.inbox.get('c')!.push(m) }); // watching, not seated
    s.bet('a', 'red', 100);
    s.bet('b', 'black', 50);
    s.bet('b', 'n:32', 10);
    for (const id of ['a', 'b', 'c']) {
      const v = s.view(id);
      assert.deepEqual(
        v.bets.map((b) => [b.seat, b.name, b.key, b.amount]),
        [
          [0, 'Ada', 'red', 100],
          [1, 'Bo', 'black', 50],
          [1, 'Bo', 'n:32', 10],
        ],
      );
      assert.deepEqual(v.players, [
        { seat: 0, name: 'Ada' },
        { seat: 1, name: 'Bo' },
      ]);
      assert.deepEqual(v.seated, ['Ada', 'Bo']);
    }
    assert.equal(s.view('a').you, 0);
    assert.equal(s.view('b').you, 1);
    assert.equal(s.view('c').you, undefined);
    // Bo can't touch Ada's.
    s.act('b', 'remove', { key: 'red' });
    assert.match(s.said('b'), /nothing there/);
    // Before the spin nobody sees a number.
    assert.equal(s.view('c').number, undefined);
    s.run(BET_MS);
    // Bo gets up mid-spin: his bets stand, and he's paid.
    s.casino.message('b', { t: 'casino.stand' });
    s.run(SPIN_MS);
    assert.equal(s.chips('Ada'), START_CHIPS + 100);
    assert.equal(s.chips('Bo'), START_CHIPS - 60 + 360);
    assert.deepEqual(s.view('c').winners, [
      { seat: 0, name: 'Ada', won: 200 },
      { seat: 1, name: 'Bo', won: 360 },
    ].sort((x, y) => y.won - x.won));
    // Seats are handed out lowest first: Cy takes Bo's.
    s.casino.message('c', { t: 'casino.sit', table: 'roulette' });
    assert.equal(s.view('c').you, 1);
  } finally {
    s.done();
  }
});

test('the history keeps the last 12, newest first', () => {
  const draws = Array.from({ length: 15 }, (_, i) => i + 1);
  const s = setup([...draws]);
  try {
    s.join('a', 'Ada');
    for (let i = 0; i < 15; i++) s.run(BET_MS + SPIN_MS + PAYOUT_MS);
    const h = s.table().history;
    assert.equal(h.length, HISTORY);
    assert.deepEqual(h, draws.slice(3).reverse());
  } finally {
    s.done();
  }
});

test('the wheels land the ball in the drawn number’s pocket', () => {
  const A = (Math.PI * 2) / POCKETS;
  const pocketUnder = (angle: number) => WHEEL[Math.floor((((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / A)];
  for (const n of [0, 17, 26, 32, 36]) {
    const clock = new WheelClock();
    const view: RouletteView = { kind: 'roulette', phase: 'spinning', round: 3, endsAt: 50_000 + SPIN_MS, now: 50_000, players: [], seated: [], bets: [], number: n, history: [] };
    clock.set(view, 1000);
    // Halfway: out on the rim; at the end, in n's pocket.
    const mid = clock.pose(1000 + SPIN_MS / 2);
    assert.ok(mid.progress > 0.4 && mid.progress < 0.6 && mid.ballR > 1);
    const end = clock.pose(1000 + SPIN_MS);
    assert.equal(end.progress, 1);
    assert.equal(pocketUnder(end.ball!), n);
    assert.equal(end.ball, pocketAngle(n));
    // Paid out: it stays there, and the wheel carries on without a jump.
    clock.set({ ...view, phase: 'payout', endsAt: 50_000 + SPIN_MS + PAYOUT_MS, now: 50_000 + SPIN_MS, history: [n] }, 1000 + SPIN_MS);
    const after = clock.pose(1000 + SPIN_MS);
    assert.equal(pocketUnder(after.ball!), n);
    assert.ok(Math.abs(Math.cos(after.wheel) - Math.cos(end.wheel)) < 1e-9 && Math.abs(Math.sin(after.wheel) - Math.sin(end.wheel)) < 1e-9);
  }
});
