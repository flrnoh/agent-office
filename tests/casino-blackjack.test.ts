import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  ALL_IN_MS,
  BET_MS,
  DEALER_STEP_MS,
  DECKS,
  RESULTS_MS,
  TURN_MS,
  dealerDraws,
  handValue,
  isBlackjack,
  newShoe,
  settleHand,
  shuffle,
  totalText,
  type BlackjackResult,
  type BlackjackView,
} from '../src/shared/casino-blackjack.js';
import { START_CHIPS, type CasinoServerMsg } from '../src/shared/casino.js';
import { Blackjack } from '../src/server/casino/blackjack.js';
import type { CasinoContext } from '../src/server/casino/game.js';
import { Casino, type CasinoPlayer } from '../src/server/casino/index.js';

// The blackjack tables (flrnoh fork): the hand arithmetic, the round's flow on a fake clock, the
// payouts, and that nobody's view ever shows the hole card or the shoe before their time.

test('hand totals: soft aces, hard aces, pictures', () => {
  assert.deepEqual(handValue(['As', '6h']), { total: 17, soft: true });
  assert.deepEqual(handValue(['As', '6h', 'Td']), { total: 17, soft: false });
  assert.deepEqual(handValue(['As', 'Ah']), { total: 12, soft: true });
  assert.deepEqual(handValue(['As', 'Ah', '9c']), { total: 21, soft: true });
  assert.deepEqual(handValue(['Ks', 'Qh', '2c']), { total: 22, soft: false });
  assert.deepEqual(handValue(['As', 'Ah', 'Ad', 'Ac']), { total: 14, soft: true });
  assert.equal(totalText(['As', '6h']), 'soft 17');
  assert.equal(totalText(['Ts', '6h', '9c']), 'bust 25');
  assert.equal(totalText(['As', 'Kh'], true), 'Blackjack');
});

test('a blackjack is two cards to 21, and never after a split', () => {
  assert.ok(isBlackjack(['As', 'Kh']));
  assert.ok(isBlackjack(['Th', 'Ad']));
  assert.ok(!isBlackjack(['As', 'Kh'], true));
  assert.ok(!isBlackjack(['7s', '7h', '7d']));
});

test('the dealer stands on all 17s, soft ones too', () => {
  assert.ok(dealerDraws(['Ts', '6h']));
  assert.ok(!dealerDraws(['Ts', '7h']));
  assert.ok(!dealerDraws(['As', '6h']), 'soft 17 stands');
  assert.ok(dealerDraws(['As', '5h']));
  assert.ok(!dealerDraws(['As', '6h', 'Tc']), 'a hard 17 with an ace in it stands too');
  assert.ok(dealerDraws(['As', '5h', 'Tc']));
});

test('what hands are paid', () => {
  const dealer19 = ['Ts', '9h'];
  assert.deepEqual(settleHand({ cards: ['Ts', 'Qh'], bet: 10 }, dealer19), { outcome: 'win', paid: 20 });
  assert.deepEqual(settleHand({ cards: ['Ts', '9c'], bet: 10 }, dealer19), { outcome: 'push', paid: 10 });
  assert.deepEqual(settleHand({ cards: ['Ts', '8c'], bet: 10 }, dealer19), { outcome: 'lose', paid: 0 });
  assert.deepEqual(settleHand({ cards: ['Ts', '8c', '5d'], bet: 10 }, ['Ts', '6h', 'Kd']), { outcome: 'bust', paid: 0 }, 'a bust loses even when the dealer busts');
  assert.deepEqual(settleHand({ cards: ['Ts', '2c'], bet: 10 }, ['Ts', '6h', 'Kd']), { outcome: 'win', paid: 20 });
  assert.deepEqual(settleHand({ cards: ['As', 'Kc'], bet: 10 }, dealer19), { outcome: 'blackjack', paid: 25 }, '3:2');
  assert.deepEqual(settleHand({ cards: ['As', 'Kc'], bet: 5 }, dealer19), { outcome: 'blackjack', paid: 12 }, '3:2, the half chip rounded down');
  assert.deepEqual(settleHand({ cards: ['As', 'Kc'], bet: 10 }, ['Ah', 'Qd']), { outcome: 'push', paid: 10 });
  assert.deepEqual(settleHand({ cards: ['7s', '7c', '7d'], bet: 10 }, ['Ah', 'Qd']), { outcome: 'lose', paid: 0 }, "the dealer's natural beats a 21");
  assert.deepEqual(settleHand({ cards: ['As', 'Kc'], bet: 10, split: true }, dealer19), { outcome: 'win', paid: 20 }, 'a split 21 is just a win');
});

test('the shoe: six decks, Fisher-Yates on the random it is given', () => {
  const shoe = newShoe();
  assert.equal(shoe.length, DECKS * 52);
  assert.equal(new Set(shoe).size, 52);
  const asked: number[] = [];
  const out = shuffle([...shoe], (n) => (asked.push(n), 0));
  assert.equal(asked.length, shoe.length - 1);
  assert.equal(asked[0], shoe.length);
  assert.equal(asked.at(-1), 2);
  assert.deepEqual([...out].sort(), [...shoe].sort(), 'the same cards');
  // A real table asks ctx.random for its shuffle.
  const t = fakeTable();
  const calls: number[] = [];
  t.ctx.random = (n) => (calls.push(n), n - 1);
  t.sit('A');
  t.bet('A', 10);
  t.later(ALL_IN_MS);
  assert.equal(calls.length, DECKS * 52 - 1);
});

// ---- A table on a fake clock, with a fake wallet ---------------------------------------------------

function fakeTable(seats = 5) {
  const clock = { now: 1_000_000 };
  const chips = new Map<string, number>();
  const results: { owner: string; text: string; delta?: number; data?: unknown }[] = [];
  let changes = 0;
  const bal = (o: string) => chips.get(o) ?? START_CHIPS;
  const ctx: CasinoContext = {
    stake(owner, amount) {
      if (typeof amount !== 'number' || !Number.isInteger(amount) || amount < 1 || amount > 500) return 'Stakes are 1 to 500 chips';
      if (bal(owner) < amount) return 'Not enough';
      chips.set(owner, bal(owner) - amount);
      return undefined;
    },
    pay(owner, amount) {
      if (Number.isInteger(amount) && amount > 0) chips.set(owner, bal(owner) + amount);
    },
    chips: bal,
    random: (n) => Math.floor(Math.random() * n),
    result: (owner, text, delta, data) => results.push({ owner, text, delta, data }),
    changed: () => void changes++,
    now: () => clock.now,
  };
  const bj = new Blackjack('bj', seats);
  return {
    bj,
    ctx,
    clock,
    results,
    bal,
    changes: () => changes,
    sit: (who: string) => bj.sit({ owner: who, name: who }, ctx),
    stand: (who: string) => bj.stand(who, ctx),
    act: (who: string, action: string, data?: unknown) => bj.act({ owner: who, name: who }, action, data, ctx),
    bet: (who: string, n: number) => bj.act({ owner: who, name: who }, 'bet', n, ctx),
    /** Moves the clock on and ticks the table. */
    later(ms: number) {
      clock.now += ms;
      bj.tick(clock.now, ctx);
    },
    view: (who: string | null = null) => bj.view(who),
    /** Ticks through the dealer's turn and the settling. */
    finish() {
      for (let i = 0; i < 20 && bj.view(null).phase === 'dealer'; i++) this.later(DEALER_STEP_MS);
    },
  };
}

/** Deals a round to the players in `bets` (seated and betting in that order) from a rigged shoe. */
function dealt(cards: string[], bets: [string, number][]) {
  const t = fakeTable();
  for (const [who] of bets) t.sit(who);
  t.bj.loadShoe(cards);
  for (const [who, n] of bets) assert.equal(t.bet(who, n), undefined);
  t.later(ALL_IN_MS);
  return t;
}

test('a round: bet, deal, hit, stand, the dealer draws to 17, paid', () => {
  // Deal order: player, dealer up, player, dealer hole; then the draws.
  const t = dealt(['Ts', '9h', '5d', '7c', '4s', '2h'], [['A', 10]]);
  assert.equal(t.bal('A'), START_CHIPS - 10);
  let v = t.view('A');
  assert.equal(v.phase, 'playing');
  assert.deepEqual(v.seats[0]!.hands[0].cards, ['Ts', '5d']);
  assert.deepEqual(v.dealer, ['9h', null], 'the hole card is hidden');
  assert.deepEqual(v.turn, { seat: 0, hand: 0 });
  assert.deepEqual(v.can, { hit: true, stand: true, double: true, split: false });
  assert.equal(t.act('A', 'hit'), undefined);
  v = t.view('A');
  assert.deepEqual(v.seats[0]!.hands[0].cards, ['Ts', '5d', '4s']);
  assert.equal(v.can!.double, false, 'no doubling on three cards');
  assert.equal(t.act('A', 'double'), 'You can only double on your first two cards (with the chips to match)');
  t.act('A', 'stand');
  v = t.view(null);
  assert.equal(v.phase, 'dealer');
  assert.deepEqual(v.dealer, ['9h', '7c'], 'turned over for the dealer');
  t.finish();
  v = t.view(null);
  assert.equal(v.phase, 'results');
  assert.deepEqual(v.dealer, ['9h', '7c', '2h'], 'drew on 16, stood on 18');
  // 19 against 18: a win.
  assert.equal(t.bal('A'), START_CHIPS + 10);
  const r = t.results.at(-1)!;
  assert.equal(r.owner, 'A');
  assert.equal(r.delta, 10);
  assert.equal((r.data as BlackjackResult).hands[0].outcome, 'win');
  t.later(RESULTS_MS);
  v = t.view('A');
  assert.equal(v.phase, 'betting');
  assert.equal(v.lastBet, 10);
  assert.equal(v.seats[0]!.hands.length, 0);
});

test('blackjack pays 3:2 and the dealer draws nothing for it', () => {
  const t = dealt(['As', '9h', 'Kd', '7c'], [['A', 10]]);
  assert.equal(t.view(null).phase, 'dealer', 'nothing to play');
  t.finish();
  assert.deepEqual(t.view(null).dealer, ['9h', '7c']);
  assert.equal(t.bal('A'), START_CHIPS + 15);
});

test('the dealer peeks: a blackjack under a ten ends the round at once', () => {
  const t = dealt(['9s', 'Kh', '9d', 'Ac'], [['A', 10]]);
  const v = t.view('A');
  assert.equal(v.phase, 'results');
  assert.deepEqual(v.dealer, ['Kh', 'Ac']);
  assert.equal(t.bal('A'), START_CHIPS - 10);
  assert.equal(t.results.at(-1)!.delta, -10);
});

test('no peek under a 9: nothing to see, and the hole stays hidden', () => {
  const t = dealt(['9s', '9h', '9d', 'Ac'], [['A', 10]]);
  assert.equal(t.view('A').phase, 'playing');
  assert.deepEqual(t.view('A').dealer, ['9h', null]);
});

test('double: the stake again, one card, done', () => {
  const t = dealt(['6s', 'Th', '5d', '7c', 'Ts'], [['A', 20]]);
  assert.equal(t.act('A', 'double'), undefined);
  assert.equal(t.bal('A'), START_CHIPS - 40);
  const v = t.view(null);
  assert.deepEqual(v.seats[0]!.hands[0], { cards: ['6s', '5d', 'Ts'], bet: 40, doubled: true, done: true });
  t.finish();
  // 21 against 17.
  assert.equal(t.bal('A'), START_CHIPS + 40);
});

test('split: two hands, a stake each, played in turn; a split 21 is no blackjack', () => {
  // A: 8 8 → split → 8+A (19, soft), 8+3 → hit T → 21. Dealer 10 + 7 = 17.
  const t = dealt(['8s', 'Th', '8d', '7c', 'As', '3h', 'Td'], [['A', 10]]);
  assert.equal(t.view('A').can!.split, true);
  assert.equal(t.act('A', 'split'), undefined);
  assert.equal(t.bal('A'), START_CHIPS - 20);
  let v = t.view('A');
  assert.equal(v.seats[0]!.hands.length, 2);
  assert.deepEqual(v.seats[0]!.hands[0].cards, ['8s', 'As']);
  assert.deepEqual(v.seats[0]!.hands[1].cards, ['8d', '3h']);
  assert.equal(v.can!.split, false, 'split once');
  assert.equal(t.act('A', 'split'), 'You can only split a pair, once (with the chips to match)');
  t.act('A', 'stand');
  assert.deepEqual(t.view('A').turn, { seat: 0, hand: 1 });
  t.act('A', 'hit');
  v = t.view(null);
  assert.equal(v.phase, 'dealer', '21 stands by itself');
  t.finish();
  // 19 and 21 against 17: two wins.
  assert.equal(t.bal('A'), START_CHIPS + 20);
  const r = t.results.at(-1)!.data as BlackjackResult;
  assert.deepEqual(r.hands.map((h) => h.outcome), ['win', 'win']);
});

test('split aces: one card each, and a ten on one is 21, not blackjack', () => {
  const t = dealt(['As', '9h', 'Ad', '8c', 'Ks', '5h'], [['A', 10]]);
  t.act('A', 'split');
  const v = t.view(null);
  assert.equal(v.phase, 'dealer', 'both split aces are done at once');
  assert.deepEqual(v.seats[0]!.hands.map((h) => h.cards), [['As', 'Ks'], ['Ad', '5h']]);
  t.finish();
  // 21 (paid 1:1) and soft 16 against 17: +10, -10.
  assert.equal(t.bal('A'), START_CHIPS);
  assert.deepEqual((t.results.at(-1)!.data as BlackjackResult).hands.map((h) => h.outcome), ['win', 'lose']);
});

test('a push gives the stake back', () => {
  const t = dealt(['Ts', 'Th', '9d', '9c'], [['A', 10]]);
  t.act('A', 'stand');
  t.finish();
  assert.equal(t.bal('A'), START_CHIPS);
  assert.equal(t.results.at(-1)!.delta, 0);
});

test('a bust loses even when the dealer busts too', () => {
  // A: T 6, hits K. B: T 2, stands. Dealer: T 6, draws Q.
  const t = dealt(['Ts', 'Tc', 'Th', '6s', '2c', '6h', 'Kd', 'Qd'], [['A', 10], ['B', 10]]);
  t.act('A', 'hit');
  t.act('B', 'stand');
  t.finish();
  assert.deepEqual(t.view(null).dealer, ['Th', '6h', 'Qd']);
  assert.equal(t.bal('A'), START_CHIPS - 10);
  assert.equal(t.bal('B'), START_CHIPS + 10);
});

test('seat order, turn timers, and illegal moves', () => {
  // A: T 6, B: T 7, dealer 9 + 8.
  const t = dealt(['Ts', 'Td', '9h', '6c', '7s', '8d', '5h'], [['A', 10], ['B', 25]]);
  let v = t.view('B');
  assert.deepEqual(v.turn, { seat: 0, hand: 0 });
  assert.deepEqual(v.can, { hit: false, stand: false, double: false, split: false }, 'not your turn, no buttons');
  assert.equal(t.act('B', 'hit'), "It isn't your turn");
  assert.equal(t.act('A', 'fold'), 'No such move at blackjack');
  assert.equal(t.act('A', 'bet', 10), 'Wait for the next hand to bet');
  assert.equal(t.act('A', 'clear'), 'The cards are out: your bet stays');
  assert.equal(t.act('A', 'split'), 'You can only split a pair, once (with the chips to match)');
  assert.equal(t.act('C', 'hit'), 'Take a seat first');
  // A lets the clock run out: their hand stands and it's B's turn.
  t.later(TURN_MS - 1);
  assert.deepEqual(t.view(null).turn, { seat: 0, hand: 0 });
  t.later(1);
  v = t.view('B');
  assert.deepEqual(v.turn, { seat: 1, hand: 0 });
  assert.equal(v.seats[0]!.hands[0].done, true);
  assert.equal(v.can!.hit, true);
  t.act('B', 'hit'); // 22
  assert.equal(t.view(null).phase, 'dealer');
  t.finish();
  // Everyone's out or settled: A 16 v 17 loses, B bust.
  assert.equal(t.bal('A'), START_CHIPS - 10);
  assert.equal(t.bal('B'), START_CHIPS - 25);
});

test('the betting window: opens with the first bet, closes at BET_MS or when everyone is in', () => {
  const t = fakeTable();
  t.sit('A');
  t.sit('B');
  assert.equal(t.view(null).left, undefined, 'no countdown before a bet');
  t.later(60_000);
  assert.equal(t.view(null).phase, 'betting');
  assert.equal(t.bet('A', 0), 'Stakes are 1 to 500 chips');
  assert.equal(t.bet('A', 501), 'Stakes are 1 to 500 chips');
  assert.equal(t.bet('A', 2.5), 'Stakes are 1 to 500 chips');
  assert.equal(t.bet('A', 50), undefined);
  assert.equal(t.view(null).left, BET_MS);
  // Changing a bet: the old one comes back.
  assert.equal(t.bet('A', 20), undefined);
  assert.equal(t.bal('A'), START_CHIPS - 20);
  assert.equal(t.act('A', 'clear'), undefined);
  assert.equal(t.bal('A'), START_CHIPS);
  t.bet('A', 20);
  t.later(BET_MS - 1);
  assert.equal(t.view(null).phase, 'betting');
  t.later(1);
  const v = t.view(null);
  assert.notEqual(v.phase, 'betting');
  assert.equal(v.seats[1]!.hands.length, 0, 'B sits this one out');
  assert.equal(t.bal('B'), START_CHIPS);
  // Rebet takes the last bet again once the round is over.
  const u = fakeTable();
  u.sit('A');
  assert.equal(u.act('A', 'rebet'), 'Nothing to bet again yet');
  u.bet('A', 7);
  u.later(ALL_IN_MS);
  for (let i = 0; i < 10 && u.view(null).phase === 'playing'; i++) u.act('A', 'stand');
  u.finish();
  u.later(RESULTS_MS);
  assert.equal(u.view(null).phase, 'betting');
  assert.equal(u.act('A', 'rebet'), undefined);
  assert.equal(u.view(null).seats[0]!.bet, 7);
});

test('you cannot bet chips you do not have', () => {
  const t = fakeTable();
  t.sit('A');
  t.ctx.stake('A', 500);
  t.ctx.stake('A', 450);
  assert.equal(t.bet('A', 100), 'Not enough');
  assert.equal(t.bet('A', 50), undefined);
  assert.equal(t.bal('A'), 0);
});

test('getting up: a bet comes back in the window; mid-round the hands stand and are settled', () => {
  const t = fakeTable();
  t.sit('A');
  t.bet('A', 30);
  t.stand('A');
  assert.equal(t.bal('A'), START_CHIPS);
  assert.equal(t.view(null).seats[0], null);

  const u = dealt(['Ts', 'Td', '9h', '9c', '7s', '8d'], [['A', 10], ['B', 10]]);
  assert.deepEqual(u.view(null).turn, { seat: 0, hand: 0 });
  u.stand('A');
  let v = u.view(null);
  assert.equal(v.seats[0]!.gone, true);
  assert.deepEqual(v.turn, { seat: 1, hand: 0 }, 'on to the next seat');
  assert.deepEqual(v.seated, ['B']);
  u.act('B', 'stand');
  u.finish();
  // A's 19 beats the dealer's 17 and is paid, though they left.
  assert.equal(u.bal('A'), START_CHIPS + 10);
  u.later(RESULTS_MS);
  v = u.view(null);
  assert.equal(v.seats[0], null, 'their seat is free for the next round');
});

test("nobody's view shows the hole card before the dealer's turn, nor the shoe", () => {
  const t = dealt(['Ts', 'Td', '9h', '9c', '7s', 'Qd'], [['A', 10], ['B', 10]]);
  for (const who of ['A', 'B', null]) {
    const v = t.view(who);
    const json = JSON.stringify(v);
    assert.deepEqual(v.dealer, ['9h', null]);
    assert.ok(!json.includes('Qd'), 'the hole card');
    assert.equal(typeof v.shoe, 'number');
  }
  t.act('A', 'stand');
  t.act('B', 'stand');
  assert.ok(JSON.stringify(t.view(null)).includes('Qd'), 'revealed for the dealer');
});

// ---- Through the casino: wallets and what goes out on the wire ---------------------------------------

test('through the casino: chips move once, and the other player never sees the hole card early', () => {
  const d = mkdtempSync(path.join(tmpdir(), 'casino-bj-'));
  const clock = { now: 5_000_000 };
  const casino = new Casino(d, { now: () => clock.now, random: () => 0, manualTick: true });
  const got: Record<string, CasinoServerMsg[]> = { a: [], b: [] };
  const mk = (id: 'a' | 'b', name: string): CasinoPlayer => ({ id, owner: `name:${name}`, name, send: (m) => got[id].push(m) });
  try {
    casino.enter(mk('a', 'Ada'));
    casino.enter(mk('b', 'Bob'));
    casino.message('a', { t: 'casino.sit', table: 'blackjack-1' });
    casino.message('b', { t: 'casino.sit', table: 'blackjack-1' });
    const bj = casino.table('blackjack-1') as Blackjack;
    assert.ok(bj instanceof Blackjack);
    bj.loadShoe(['Ts', '8d', '9h', '9s', '6c', 'Kd', 'Qc']);
    casino.message('a', { t: 'casino.act', table: 'blackjack-1', action: 'bet', data: 100 });
    casino.message('b', { t: 'casino.act', table: 'blackjack-1', action: 'bet', data: 40 });
    const wallet = (id: string) => (got[id].filter((m) => m.t === 'casino.wallet').at(-1) as { chips: number }).chips;
    assert.equal(wallet('a'), START_CHIPS - 100);
    assert.equal(wallet('b'), START_CHIPS - 40);
    clock.now += ALL_IN_MS;
    casino.tick();
    // Ada 19, Bob 14, dealer 9 up, K in the hole.
    const views = (id: string) => got[id].filter((m) => m.t === 'casino.table' && m.table === 'blackjack-1').map((m) => (m as { state: BlackjackView }).state);
    const bobs = views('b').at(-1)!;
    assert.deepEqual(bobs.dealer, ['9h', null]);
    assert.equal(bobs.you, 1);
    casino.message('a', { t: 'casino.act', table: 'blackjack-1', action: 'stand' });
    // Every view Bob got before the dealer's turn hid the K.
    for (const v of views('b')) if (v.phase === 'playing' || v.phase === 'betting') assert.ok(!JSON.stringify(v).includes('Kd'));
    casino.message('b', { t: 'casino.act', table: 'blackjack-1', action: 'hit' }); // 14 + Q = bust
    for (let i = 0; i < 10; i++) {
      clock.now += DEALER_STEP_MS;
      casino.tick();
    }
    // Dealer 19: Ada pushes, Bob busts.
    assert.equal(wallet('a'), START_CHIPS);
    assert.equal(wallet('b'), START_CHIPS - 40);
    assert.equal(casino.wallets.chips('name:Ada'), START_CHIPS);
    const res = got.a.filter((m) => m.t === 'casino.result' && m.table === 'blackjack-1').at(-1) as { text: string; delta: number };
    assert.equal(res.delta, 0);
    assert.match(res.text, /Push/);
    // Getting up with a bet down in the next window gives it back.
    clock.now += RESULTS_MS;
    casino.tick();
    casino.message('a', { t: 'casino.act', table: 'blackjack-1', action: 'rebet' });
    assert.equal(wallet('a'), START_CHIPS - 100);
    casino.message('a', { t: 'casino.stand' });
    assert.equal(wallet('a'), START_CHIPS);
  } finally {
    casino.stop();
    rmSync(d, { recursive: true, force: true });
  }
});

test('the shoe is reshuffled once the cut card (75% in) is out, and only before a deal', () => {
  const t = fakeTable();
  let shuffles = 0;
  t.ctx.random = (n) => {
    if (n === DECKS * 52) shuffles++;
    return Math.floor(Math.random() * n);
  };
  t.sit('A');
  let lowest = Infinity;
  let rounds = 0;
  while (shuffles < 2 && rounds < 500) {
    const before = t.view(null).shoe;
    t.bet('A', 1);
    t.later(ALL_IN_MS);
    if (shuffles < 2 && rounds > 0) lowest = Math.min(lowest, before);
    for (let i = 0; i < 10 && t.view(null).phase === 'playing'; i++) t.act('A', 'stand');
    t.finish();
    t.later(RESULTS_MS);
    rounds++;
  }
  assert.equal(shuffles, 2);
  // 234 of 312 cards go before the fresh shuffle: at 4-6 cards a round, well over 25 rounds.
  assert.ok(rounds > 25, `${rounds} rounds`);
  assert.ok(lowest <= 8, `the shoe ran down to ${lowest} before the cut`);
});
