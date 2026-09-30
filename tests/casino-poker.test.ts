import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { START_CHIPS, type CasinoServerMsg } from '../src/shared/casino.js';
import {
  BIG_BLIND,
  HAND_PAUSE_MS,
  HOUSE_BOT_NAME,
  MIN_BUY_IN,
  RUNOUT_MS,
  TURN_MS,
  evaluate,
  evaluate5,
  fullDeck,
  shareOut,
  splitPots,
  type Card,
  type PokerView,
} from '../src/shared/casino-poker.js';
import { Casino, type CasinoPlayer } from '../src/server/casino/index.js';
import { PokerTable } from '../src/server/casino/poker.js';

// The poker table (flrnoh fork): the hand evaluator, pots, and no-limit hold'em's betting rules,
// played through the casino with scripted decks and a fake clock.

const cards = (s: string) => s.split(' ') as Card[];
const ev = (s: string) => evaluate(cards(s));

// ---- The evaluator ------------------------------------------------------------------------------

test('every category, named', () => {
  const cases: [string, number, string][] = [
    ['As Ks Qs Js Ts', 8, 'Royal flush'],
    ['9h 8h 7h 6h 5h', 8, 'Straight flush, Nine high'],
    ['5d 4d 3d 2d Ad', 8, 'Straight flush, Five high'],
    ['7c 7d 7h 7s Kd', 7, 'Four of a kind, Sevens'],
    ['Kc Kd Kh 7s 7d', 6, 'Full house, Kings full of Sevens'],
    ['Ah Jh 8h 4h 2h', 5, 'Flush, Ace high'],
    ['Ah Kd Qc Js Tc', 4, 'Straight, Ace high'],
    ['Ts 9h 8d 7c 6s', 4, 'Straight, Ten high'],
    ['5s 4h 3d 2c Ad', 4, 'Straight, Five high'],
    ['Qs Qh Qd 9c 2s', 3, 'Three of a kind, Queens'],
    ['Js Jh 4d 4c As', 2, 'Two pair, Jacks and Fours'],
    ['Ts Th 8d 5c 2s', 1, 'Pair of Tens'],
    ['Ks Jh 8d 5c 2s', 0, 'High card, King'],
  ];
  for (const [hand, cat, name] of cases) {
    const v = evaluate5(cards(hand));
    assert.equal(v.category, cat, hand);
    assert.equal(v.name, name, hand);
    assert.equal(v.best.length, 5);
  }
  // Each category beats the one below it.
  const scores = cases.map(([h]) => evaluate5(cards(h)).score);
  for (let i = 1; i < scores.length; i++) assert.ok(scores[i - 1] >= scores[i], cases[i][0]);
});

test('kickers and ties', () => {
  const beats = (a: string, b: string) => assert.ok(ev(a).score > ev(b).score, `${a} should beat ${b}`);
  const ties = (a: string, b: string) => assert.equal(ev(a).score, ev(b).score, `${a} should tie ${b}`);
  beats('As Ad Kc 7h 3s', 'Ah Ac Qc 7d 3c'); // pair, kicker
  beats('As Ad Kc 7h 4s', 'Ah Ac Kd 7d 3c'); // third kicker
  beats('Ks Kd 5c 5h 3s', 'Qs Qd Jc Jh As'); // higher top pair
  beats('Ks Kd 5c 5h 4s', 'Kh Kc 5s 5d 3c'); // two pair kicker
  beats('Ks Kd 6c 6h 2s', 'Kh Kc 5s 5d Ac'); // second pair decides before kicker
  beats('9s 9d 9c 2h 3s', '8s 8d 8c Ah Ks'); // trips
  beats('9s 9d 9c Ah 3s', '9h 9d 9c Kh Qs'); // trips kicker (impossible in one deck, fine for the maths)
  beats('Ah Qh 9h 5h 3h', 'Ad Qd 9d 5d 2d'); // flush, last card
  beats('2s 2d 2c 3h 3s', 'As Kd Qc Jh 9h'.replace('9h', '9s').replace('Qc', 'Qs').replace('Kd', 'Ks').replace('Jh', 'Js')); // full house over flush
  beats('3s 3d 3c 2h 2s', '2c 2d 2h As Ad'); // full house by trips first
  beats('Qs Qd Qc Qh 2s', 'Js Jd Jc Jh As'); // quads
  beats('Qs Qd Qc Qh 5s', 'Qs Qd Qc Qh 4s'); // quads kicker
  beats('6s 5h 4d 3c 2s', '5s 4h 3d 2c As'); // six-high straight beats the wheel
  beats('6h 5h 4h 3h 2h', '5s 4s 3s 2s As'); // and likewise flushed
  beats('As 5h 4d 3c 2s', 'Ks Qh Jd Tc 8s'); // the wheel is still a straight
  ties('As Kd Qc Jh 9s', 'Ah Kc Qd Js 9h');
  ties('Ts Td 8c 8h 4s', 'Th Tc 8s 8d 4c');
  // No wrap-around: Q K A 2 3 is ace high.
  assert.equal(ev('Qs Kd Ac 2h 3s').category, 0);
  // The wheel's ace counts low among its cards.
  assert.deepEqual(evaluate5(cards('As 2d 3c 4h 5s')).best.map((c) => c[0]), ['5', '4', '3', '2', 'A']);
});

test('the best five of seven', () => {
  // A flush and a straight on offer: the flush.
  assert.equal(ev('Ah 2h 3h 4s 5h 9h Kd').name, 'Flush, Ace high');
  // A straight flush hiding in a flush.
  assert.equal(ev('9s 8s 7s 6s 5s As Ks').name, 'Straight flush, Nine high');
  // Two sets of trips: the best full house.
  assert.equal(ev('9s 9d 9c 4h 4s 4d Ac').name, 'Full house, Nines full of Fours');
  // Three pairs: the top two and the best kicker left.
  const v = ev('Ks Kd 7c 7h 3s 3d 2c');
  assert.equal(v.name, 'Two pair, Kings and Sevens');
  assert.equal(v.best[4][0], '3');
  // Quads with a board kicker.
  assert.equal(ev('8s 8d 8c 8h Ks 2d 3c').best[4], 'Ks');
  // Seven to a straight: the highest.
  assert.equal(ev('4s 5d 6c 7h 8s 9d 2c').name, 'Straight, Nine high');
  // Wheel with a 6 around: six high.
  assert.equal(ev('As 2d 3c 4h 5s 6d Kc').name, 'Straight, Six high');
  // The board plays: two players tie.
  assert.equal(ev('2c 3d As Ks Qs Js Ts').score, ev('4c 5d As Ks Qs Js Ts').score);
  // A kicker that isn't in the best five doesn't count.
  assert.equal(ev('Ac 2d Kh Kd 9s 9c 7h').score, ev('As 3d Kh Kd 9s 9c 7h').score);
  assert.ok(ev('Ac 2d Kh Kd 9s 9c 7h').score > ev('Qs 3d Kh Kd 9s 9c 7h').score);
  // Five or six cards work too.
  assert.equal(ev('As Ad Ac Kd Ks').category, 6);
  assert.equal(ev('As Ad Ac Kd Ks 2c').category, 6);
});

test('the evaluator agrees with itself over random hands', () => {
  // Every 7-card value equals the best of its 21 five-card values, and category counts look like poker.
  let seed = 7;
  const rnd = (n: number) => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed % n;
  };
  const counts = new Array(9).fill(0);
  for (let t = 0; t < 3000; t++) {
    const d = fullDeck();
    for (let i = d.length - 1; i > 0; i--) {
      const j = rnd(i + 1);
      [d[i], d[j]] = [d[j], d[i]];
    }
    const seven = d.slice(0, 7);
    const v = evaluate(seven);
    counts[v.category]++;
    assert.equal(evaluate5(v.best).score, v.score);
  }
  // One pair is the most common 7-card hand, then two pair, then high card.
  assert.ok(counts[1] > counts[2] && counts[2] > counts[0] && counts[0] > counts[3], counts.join(','));
});

// ---- Pots ---------------------------------------------------------------------------------------

test('side pots: three all-ins of different sizes and a caller', () => {
  const pots = splitPots([
    { total: 100, live: true },
    { total: 250, live: true },
    { total: 400, live: true },
    { total: 400, live: true },
    { total: 50, live: false },
  ]);
  assert.deepEqual(pots, [
    { amount: 450, eligible: [0, 1, 2, 3] },
    { amount: 450, eligible: [1, 2, 3] },
    { amount: 300, eligible: [2, 3] },
  ]);
  assert.equal(pots.reduce((s, p) => s + p.amount, 0), 1200);
  // Folded chips above every live player's go to the last pot.
  assert.deepEqual(splitPots([
    { total: 30, live: true },
    { total: 60, live: false },
    { total: 30, live: true },
  ]), [{ amount: 120, eligible: [0, 2] }]);
});

test('split pots: the odd chip goes to the first winner left of the button', () => {
  assert.deepEqual([...shareOut(25, [2, 0])], [
    [2, 13],
    [0, 12],
  ]);
  assert.deepEqual([...shareOut(11, [1, 3, 0])], [
    [1, 4],
    [3, 4],
    [0, 3],
  ]);
  assert.deepEqual([...shareOut(30, [0, 1, 2])].map((e) => e[1]), [10, 10, 10]);
});

// ---- The table ----------------------------------------------------------------------------------

/**
 * A casino with only the poker table, `n` players seated in order (seats 0, 1, …) who bought in
 * for `stacks`, a queue of decks, and a fake clock. The first hand's button is seat 0.
 */
function setup(n: number, stacks: number[] = [], decks: Card[][] = []) {
  const d = mkdtempSync(path.join(tmpdir(), 'casino-poker-'));
  const t = { now: 10_000_000 };
  let seed = 42;
  const casino = new Casino(d, {
    now: () => t.now,
    random: (k) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % k;
    },
    empty: true,
    manualTick: true,
  });
  const table = new PokerTable('poker', 6, { deck: () => decks.shift() ?? shuffled() });
  casino.register(table);
  const inbox = new Map<string, CasinoServerMsg[]>();
  const ids: string[] = [];
  const names = ['Ada', 'Bo', 'Cy', 'Di', 'Ed', 'Flo'];
  const owner = (i: number) => `name:${names[i]}`;
  const join = (i: number) => {
    const id = `c${i}`;
    inbox.set(id, []);
    const p: CasinoPlayer = { id, owner: owner(i), name: names[i], send: (m) => inbox.get(id)!.push(m) };
    casino.enter(p);
    casino.message(id, { t: 'casino.sit', table: 'poker' });
    return id;
  };
  for (let i = 0; i < n; i++) ids.push(join(i));
  const act = (i: number, action: string, data?: unknown) => {
    t.now += 250; // (the casino's rate limit: four a second)
    casino.message(ids[i], { t: 'casino.act', table: 'poker', action, ...(data !== undefined ? { data } : {}) });
  };
  for (let i = 0; i < n; i++) {
    if (stacks[i] === undefined) continue;
    act(i, 'buyin', Math.max(MIN_BUY_IN, stacks[i]));
    if (stacks[i] < MIN_BUY_IN) {
      // A short stack (as if they'd lost the rest): the difference goes back to their wallet.
      (table as unknown as { seatsAt: { stack: number }[] }).seatsAt[i].stack = stacks[i];
      casino.wallets.credit(owner(i), MIN_BUY_IN - stacks[i]);
    }
  }
  const view = (i: number | null) => table.view(i === null ? null : owner(i));
  const said = (i: number) => (inbox.get(ids[i])!.filter((m) => m.t === 'casino.result').at(-1) as { text: string } | undefined)?.text ?? '';
  const wallet = (i: number) => casino.wallets.chips(owner(i));
  const stack = (i: number) => view(null).seats.find((s) => s.name === names[i])?.stack ?? 0;
  /** Every chip there is: wallets, stacks, and what's in the middle. */
  const total = () => {
    const v = view(null);
    // (after a hand the pot's still shown, but it's in the winners' stacks already)
    let sum = v.street === 'showdown' || v.street === 'idle' ? 0 : v.pot;
    for (let i = 0; i < ids.length; i++) sum += wallet(i);
    for (const s of v.seats) if (!s.bot) sum += s.stack;
    return sum;
  };
  /** On to the next hand: the pause runs out and the cards come. */
  const deal = () => {
    t.now += HAND_PAUSE_MS + 10;
    casino.tick();
  };
  const turn = () => {
    const v = view(null);
    return v.turnSeat === undefined ? -1 : v.turnSeat;
  };
  return { d, t, casino, table, ids, inbox, owner, join, act, view, said, wallet, stack, total, deal, turn, done: () => (casino.stop(), rmSync(d, { recursive: true, force: true })) };
}

function shuffled(): Card[] {
  const d = fullDeck();
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

/** A deck dealing `holes` (in dealing order: starting left of the button) and then `board`. */
function stacked(holes: string[], board: string): Card[] {
  const top = [...holes.flatMap(cards), ...cards(board)];
  return [...top, ...fullDeck().filter((c) => !top.includes(c))];
}

test('buying in: limits, your wallet, and a hand starts with two', () => {
  const s = setup(2);
  try {
    s.act(0, 'buyin', 50);
    assert.match(s.said(0), /Buy in for 100 to 1000/);
    s.act(0, 'buyin', 1001);
    assert.match(s.said(0), /Buy in for 100 to 1000/);
    s.act(0, 'buyin', 150.5);
    assert.equal(s.wallet(0), START_CHIPS);
    s.act(0, 'buyin', 300);
    assert.equal(s.wallet(0), START_CHIPS - 300);
    assert.equal(s.stack(0), 300);
    assert.equal(s.view(0).you?.status, 'waiting');
    assert.equal(s.view(1).you?.status, 'out');
    // Topping up between hands, to at most 1000.
    s.act(0, 'buyin', 800);
    assert.match(s.said(0), /1 to 700/);
    s.act(0, 'buyin', 700);
    assert.equal(s.stack(0), 1000);
    // Alone at the table: nothing's dealt.
    s.deal();
    assert.equal(s.view(null).street, 'idle');
    s.act(1, 'buyin', 200);
    s.deal();
    assert.equal(s.view(null).street, 'preflop');
    assert.equal(s.total(), 2 * START_CHIPS);
  } finally {
    s.done();
  }
});

test('heads-up: the button posts the small blind and acts first, then last after the flop', () => {
  // Button seat 0 (Ada): dealt second.
  const s = setup(2, [200, 200], [stacked(['2c 7d', '3h 8s'], 'Kd Qd 9c 4s 5h')]);
  try {
    s.deal();
    const v = s.view(0);
    const ada = v.seats.find((x) => x.seat === 0)!;
    const bo = v.seats.find((x) => x.seat === 1)!;
    assert.ok(ada.dealer);
    assert.equal(ada.bet, 5);
    assert.equal(bo.bet, 10);
    assert.deepEqual(ada.cards, ['3h', '8s']);
    assert.equal(s.turn(), 0, 'the button acts first before the flop');
    assert.equal(v.you?.toAct?.toCall, 5);
    s.act(0, 'call');
    assert.equal(s.turn(), 1, 'the big blind has the option');
    assert.equal(s.view(1).you?.toAct?.canCheck, true);
    s.act(1, 'check');
    assert.equal(s.view(null).street, 'flop');
    assert.equal(s.view(null).board.length, 3);
    assert.equal(s.turn(), 1, 'after the flop the big blind acts first');
    s.act(1, 'check');
    assert.equal(s.turn(), 0);
    s.act(0, 'check');
    assert.equal(s.view(null).street, 'turn');
    // The next hand: the button moves to Bo.
    s.act(1, 'check');
    s.act(0, 'check');
    s.act(1, 'check');
    s.act(0, 'check');
    assert.equal(s.view(null).street, 'showdown');
    s.deal();
    assert.ok(s.view(null).seats.find((x) => x.seat === 1)!.dealer);
    assert.equal(s.turn(), 1);
  } finally {
    s.done();
  }
});

test('three-handed order, minimum bets and raises', () => {
  // Button Ada (0), small blind Bo (1), big blind Cy (2): Ada is first to act.
  const s = setup(3, [500, 500, 500]);
  try {
    s.deal();
    assert.equal(s.turn(), 0);
    const a = s.view(0).you!.toAct!;
    assert.equal(a.toCall, 10);
    assert.equal(a.minTo, 20);
    s.act(0, 'raise', 15);
    assert.match(s.said(0), /least you can raise to is 20/);
    s.act(0, 'raise', 35); // a raise of 25
    assert.equal(s.turn(), 1);
    assert.equal(s.view(1).you!.toAct!.minTo, 60, 'a re-raise is at least the last raise again');
    s.act(1, 'raise', 59);
    assert.match(s.said(1), /least you can raise to is 60/);
    s.act(0, 'call');
    assert.match(s.said(0), /isn’t your turn/);
    s.act(1, 'raise', 60);
    s.act(2, 'fold');
    assert.equal(s.turn(), 0);
    s.act(0, 'check');
    assert.match(s.said(0), /can't check: call 25/);
    s.act(0, 'call');
    // The flop: the small blind is first after the button.
    assert.equal(s.view(null).street, 'flop');
    assert.equal(s.turn(), 1);
    assert.equal(s.view(1).you!.toAct!.minTo, BIG_BLIND, 'the smallest bet is the big blind');
    s.act(1, 'raise', 5);
    assert.match(s.said(1), /least you can bet to is 10/);
    s.act(1, 'raise', 10);
    s.act(0, 'raise', 30);
    assert.equal(s.view(1).you!.toAct!.minTo, 50);
    s.act(1, 'raise', 1000);
    assert.match(s.said(1), /440 at most/);
    assert.equal(s.total(), 3 * START_CHIPS);
  } finally {
    s.done();
  }
});

test('an all-in for less than a full raise does not reopen the betting', () => {
  // Button Ada (0), SB Bo (1), BB Cy (2), and Di (3) short.
  const s = setup(4, [500, 500, 500, 125]);
  try {
    s.deal();
    // Di is under the gun.
    assert.equal(s.turn(), 3);
    s.act(3, 'fold');
    // Ada raises to 100 (a raise of 90), Bo and Cy fold, and the next hand...
    s.act(0, 'raise', 100);
    s.act(1, 'fold');
    s.act(2, 'fold');
    // Uncalled: Ada gets her 90 back and wins the blinds.
    assert.equal(s.stack(0), 515);
    s.deal();
    // Button Bo (1), SB Cy (2), BB Di (3): Ada first.
    assert.equal(s.turn(), 0);
    s.act(0, 'raise', 100);
    s.act(1, 'call');
    s.act(2, 'fold');
    // Di goes all-in for 125 (from the big blind): 25 more is short of a full raise (90).
    s.act(3, 'allin');
    assert.equal(s.view(null).seats.find((x) => x.seat === 3)!.status, 'allin');
    assert.equal(s.turn(), 0);
    const a = s.view(0).you!.toAct!;
    assert.equal(a.toCall, 25);
    assert.equal(a.canRaise, false, 'Ada already acted: she can only call or fold');
    s.act(0, 'raise', 300);
    assert.match(s.said(0), /only call or fold/);
    s.act(0, 'allin');
    assert.equal(s.view(null).seats.find((x) => x.seat === 0)!.bet, 125, 'all-in when you may not raise is a call');
    assert.equal(s.view(1).you!.toAct!.canRaise, false);
    s.act(1, 'call');
    assert.equal(s.view(null).street, 'flop');
    assert.equal(s.total(), 4 * START_CHIPS);
  } finally {
    s.done();
  }
});

test('a short all-in: whoever hasn’t acted yet may still raise, and with nobody left to bet the board runs out', () => {
  const s = setup(3, [500, 35, 40]);
  try {
    s.deal();
    // Button Ada, SB Bo (35), BB Cy (40). Ada raises to 30, Bo is all-in for 35 (5 more: short).
    s.act(0, 'raise', 30);
    s.act(1, 'allin');
    assert.equal(s.view(2).you!.toAct!.canRaise, true, 'Cy hasn’t acted yet');
    s.act(2, 'allin');
    assert.equal(s.view(0).you!.toAct!.canRaise, false, 'Ada acted on the last full raise');
    s.act(0, 'call');
    // No one left to bet against: the board runs out and it's shown down.
    assert.equal(s.view(null).street, 'flop');
    const v = s.view(null);
    assert.ok(v.seats.every((x) => x.cards?.length === 2), 'all-in: the cards are turned up');
    s.t.now += RUNOUT_MS;
    s.casino.tick();
    assert.equal(s.view(null).street, 'turn');
    s.t.now += RUNOUT_MS;
    s.casino.tick();
    s.t.now += RUNOUT_MS;
    s.casino.tick();
    assert.equal(s.view(null).street, 'showdown');
    assert.equal(s.total(), 3 * START_CHIPS);
  } finally {
    s.done();
  }
});

test('side pots: three all-ins of different sizes, each pot to its best hand', () => {
  // Button Ada (0, 1000), SB Bo (1, 100), BB Cy (2, 200), Di (3, 300). Dealt from Bo.
  // Bo: quads (best), Cy: a flush, Di: trips, Ada: a pair.
  const deck = stacked(['9c 9d', 'Ah 2h', 'Qs Qd', 'Kc 3d'], '9h 9s 5h 7h Qc');
  const s = setup(4, [1000, 100, 200, 300], [deck]);
  try {
    const before = s.total();
    s.deal();
    // Di under the gun: all-in 300. Ada calls. Bo all-in 100. Cy all-in 200.
    assert.equal(s.turn(), 3);
    s.act(3, 'allin');
    s.act(0, 'call');
    s.act(1, 'allin');
    s.act(2, 'allin');
    // Nobody left to act: run out.
    for (let i = 0; i < 3; i++) {
      s.t.now += RUNOUT_MS;
      s.casino.tick();
    }
    const v = s.view(null);
    assert.equal(v.street, 'showdown');
    // Main pot 400 (4×100): Bo, Cy, Di, Ada. Side pot 300 (3×100): Cy, Di, Ada. Side pot 200 (2×100): Di, Ada.
    assert.deepEqual(v.pots, [400, 300, 200]);
    const seat = (i: number) => v.seats.find((x) => x.seat === i)!;
    assert.equal(seat(1).hand, 'Four of a kind, Nines');
    assert.equal(seat(2).hand, 'Flush, Ace high');
    assert.equal(seat(3).hand, 'Full house, Queens full of Nines');
    assert.equal(seat(0).hand, 'Pair of Nines');
    // Bo's quads win the main pot (400); Di's queens full beats Cy's flush and Ada's pair for both side pots (300 + 200).
    assert.equal(seat(1).won, 400);
    assert.equal(seat(3).won, 500);
    assert.equal(seat(2).won ?? 0, 0);
    // Ada called 300 of her 1000: 700 left, nothing won.
    assert.equal(seat(0).stack, 700);
    assert.equal(seat(1).stack, 400);
    assert.equal(seat(3).stack, 500);
    assert.equal(seat(2).stack, 0);
    assert.equal(seat(2).status, 'out');
    assert.match(v.summary!, /Bo wins 400 with Four of a kind/);
    assert.equal(s.total(), before);
  } finally {
    s.done();
  }
});

test('a split pot with an odd chip, and the board playing', () => {
  // Button Ada (0), SB Bo (1), BB Cy (2). Dealt Bo, Cy, Ada. The board is a royal straight.
  const deck = stacked(['2c 3d', '4c 5d', '6c 7d'], 'As Kh Qd Jc Th');
  const s = setup(3, [200, 200, 200], [deck]);
  try {
    s.deal();
    s.act(0, 'call');
    s.act(1, 'fold');
    s.act(2, 'check');
    for (let street = 0; street < 3; street++) {
      s.act(2, 'check');
      s.act(0, 'check');
    }
    const v = s.view(null);
    assert.equal(v.street, 'showdown');
    // 25 in the pot (Bo's small blind is dead money): Cy is first left of the button among the winners.
    const seat = (i: number) => v.seats.find((x) => x.seat === i)!;
    assert.equal(seat(2).won, 13);
    assert.equal(seat(0).won, 12);
    assert.equal(seat(2).stack, 203);
    assert.equal(seat(0).stack, 202);
    assert.equal(seat(1).stack, 195);
    assert.equal(seat(0).hand, 'Straight, Ace high');
    assert.equal(seat(1).cards, undefined, 'a folded hand is never shown');
  } finally {
    s.done();
  }
});

test('uncalled bets come back: a bet everyone folds to, and an all-in bigger than the call', () => {
  const s = setup(2, [500, 200], [stacked(['Kc Kd', 'Ac Ad'], '2s 3s 4h 9c Jd')]);
  try {
    s.deal();
    // Ada (button, SB) shoves 500; Bo calls with 200 all-in: 300 of Ada's comes back.
    s.act(0, 'allin');
    assert.equal(s.stack(0), 0);
    s.act(1, 'call');
    assert.equal(s.stack(0), 300, 'the part nobody could call is back at once');
    assert.equal(s.view(null).pot, 400);
    for (let i = 0; i < 3; i++) {
      s.t.now += RUNOUT_MS;
      s.casino.tick();
    }
    assert.equal(s.stack(0), 700);
    assert.equal(s.stack(1), 0);
    assert.match(s.said(0), /You win 400 with Pair of Aces/);
    assert.equal(s.total(), 2 * START_CHIPS);
  } finally {
    s.done();
  }
});

test('timeouts: a check when you can, a fold when you can’t, and two in a row sit you out', () => {
  const s = setup(3, [200, 200, 200]);
  try {
    s.deal();
    assert.equal(s.view(0).you!.toAct !== undefined, true);
    assert.ok(s.view(null).turnMs! <= TURN_MS);
    // Ada (under the gun) faces the big blind: time's up, she folds.
    s.t.now += TURN_MS - 1000;
    s.casino.tick();
    assert.equal(s.turn(), 0, 'not yet');
    s.t.now += 1000;
    s.casino.tick();
    assert.equal(s.view(null).seats.find((x) => x.seat === 0)!.status, 'folded');
    assert.match(s.said(0), /folded for you/);
    s.act(1, 'call');
    // Cy's option: time runs out, the dealer checks.
    s.t.now += TURN_MS;
    s.casino.tick();
    assert.equal(s.view(null).street, 'flop');
    assert.match(s.said(2), /checked for you/);
    // A second in a row for Cy (first after the button on the flop is Bo, then Cy).
    s.act(1, 'check');
    s.t.now += TURN_MS;
    s.casino.tick();
    assert.match(s.said(2), /sitting out/);
    assert.equal(s.view(2).you!.status, 'in', 'still in this hand');
    // Finish the hand: Bo and Cy check it down (Cy by the clock).
    for (let i = 0; i < 2; i++) {
      s.act(1, 'check');
      s.t.now += TURN_MS;
      s.casino.tick();
    }
    assert.equal(s.view(null).street, 'showdown');
    s.deal();
    assert.equal(s.view(2).you!.status, 'sitout', 'dealt out of the next hand');
    assert.equal(s.view(null).seats.find((x) => x.seat === 2)!.hasCards, undefined);
    s.act(2, 'back');
    assert.equal(s.total(), 3 * START_CHIPS);
  } finally {
    s.done();
  }
});

test('getting up, or leaving, mid-hand: folded, and the rest of your stack goes back to your wallet', () => {
  const s = setup(3, [300, 300, 300]);
  try {
    s.deal();
    s.act(0, 'raise', 50);
    s.act(1, 'call');
    // Bo gets up, not his turn: folded, 250 back, the 50 stays in the pot.
    s.casino.message(s.ids[1], { t: 'casino.stand' });
    assert.equal(s.wallet(1), START_CHIPS - 300 + 250);
    assert.match(s.said(1), /cash out 250/);
    assert.equal(s.view(null).pot, 110);
    assert.equal(s.turn(), 2);
    assert.equal(s.total(), 3 * START_CHIPS);
    // Cy leaves the casino on his turn: the hand is Ada's.
    s.casino.leave(s.ids[2]);
    assert.equal(s.wallet(2), START_CHIPS - 10);
    assert.equal(s.stack(0), 360);
    assert.equal(s.view(null).street, 'showdown');
    assert.equal(s.total(), 3 * START_CHIPS);
    // Ada gets up between hands: all 360 back.
    s.casino.message(s.ids[0], { t: 'casino.stand' });
    assert.equal(s.wallet(0), START_CHIPS + 60);
    assert.equal(s.view(null).seats.length, 0);
    // Nobody left: the table's cleared.
    assert.equal(s.view(null).street, 'idle');
    assert.deepEqual(s.view(null).board, []);
    assert.equal(s.view(null).summary, undefined);
  } finally {
    s.done();
  }
});

test('an uncalled bet of someone who has left goes back to their wallet', () => {
  const s = setup(2, [300, 300]);
  try {
    s.deal();
    s.act(0, 'raise', 100);
    // Ada bets and walks out before Bo answers: she's folded and Bo wins the blinds.
    s.casino.leave(s.ids[0]);
    // Bo takes what he matched (10 of Ada's), Ada gets back the 90 nobody called.
    assert.equal(s.wallet(0), START_CHIPS - 300 + 200 + 90);
    assert.equal(s.stack(1), 310);
    assert.equal(s.total(), 2 * START_CHIPS);
  } finally {
    s.done();
  }
});

test('views never show anyone else’s hole cards, and never the deck', () => {
  const deck = stacked(['Ah Kh', 'Qs Js', '9d 9c'], '2h 3h 4c 8h Td');
  const s = setup(3, [200, 200, 200], [deck]);
  try {
    s.deal();
    const hole = { 1: ['Ah', 'Kh'], 2: ['Qs', 'Js'], 0: ['9d', '9c'] } as Record<number, string[]>;
    const check = (who: number | null) => {
      const json = JSON.stringify(s.view(who));
      for (const [seat, cs] of Object.entries(hole)) for (const c of cs) assert.equal(json.includes(`"${c}"`), Number(seat) === who, `${who} sees ${c}?`);
      // Nothing of the undealt deck (the board's still to come).
      for (const c of ['2h', '3h', '4c', '8h', 'Td']) assert.ok(!json.includes(`"${c}"`), `${c} leaked`);
    };
    check(null);
    check(0);
    check(1);
    check(2);
    // What the casino sends: someone standing in the room sees no cards at all.
    const outsider = s.join(3);
    const seen = s.inbox.get(outsider)!.filter((m) => m.t === 'casino.table').at(-1);
    assert.ok(seen);
    for (const cs of Object.values(hole)) for (const c of cs) assert.ok(!JSON.stringify(seen).includes(`"${c}"`));
    // At a showdown, the cards still in are shown to everyone.
    s.act(0, 'call');
    s.act(1, 'call');
    s.act(2, 'check');
    for (let i = 0; i < 3; i++) {
      s.act(1, 'check');
      s.act(2, 'check');
      s.act(0, 'check');
    }
    const end = s.view(null);
    assert.equal(end.street, 'showdown');
    assert.deepEqual(end.seats.find((x) => x.seat === 1)!.cards, ['Ah', 'Kh']);
    assert.equal(end.seats.find((x) => x.seat === 1)!.hand, 'Flush, Ace high');
  } finally {
    s.done();
  }
});

test('a folder’s cards stay hidden, even at the showdown', () => {
  const s = setup(3, [200, 200, 200], [stacked(['Ah Kh', 'Qs Js', '9d 9c'], '2c 3c 4c 8s Td')]);
  try {
    s.deal();
    s.act(0, 'fold');
    s.act(1, 'call');
    s.act(2, 'check');
    for (let i = 0; i < 3; i++) {
      s.act(1, 'check');
      s.act(2, 'check');
    }
    const json = JSON.stringify(s.view(1));
    assert.ok(!json.includes('"9d"') && !json.includes('"9c"'));
    assert.deepEqual(s.view(0).seats.find((x) => x.seat === 0)!.cards, ['9d', '9c'], 'you still see your own');
  } finally {
    s.done();
  }
});

test('many random hands: chips are never made or lost, and every hand ends', () => {
  const s = setup(4, [300, 200, 500, 150]);
  try {
    const start = s.total();
    let seed = 99;
    const rnd = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    let hands = 0;
    for (let step = 0; step < 4000 && hands < 60; step++) {
      const v = s.view(null);
      if (v.street === 'showdown' || v.street === 'idle') {
        hands++;
        // Anyone busted buys back in, if they can.
        for (let i = 0; i < 4; i++) if (s.stack(i) === 0 && s.wallet(i) >= 100) s.act(i, 'buyin', 100 + rnd(3) * 50);
        s.deal();
        continue;
      }
      if (step % 53 === 52) {
        // Someone gets up mid-hand and sits straight back down (with nothing in front of them).
        const k = rnd(4);
        s.casino.message(s.ids[k], { t: 'casino.stand' });
        s.t.now += 600;
        s.casino.message(s.ids[k], { t: 'casino.sit', table: 'poker' });
        assert.equal(s.total(), start, `chips changed when ${k} got up at step ${step}`);
        continue;
      }
      if (v.turnSeat === undefined) {
        s.t.now += RUNOUT_MS;
        s.casino.tick();
        continue;
      }
      const i = v.turnSeat;
      const a = s.view(i).you!.toAct!;
      const r = rnd(10);
      if (r === 0) s.act(i, 'fold');
      else if (r < 5) s.act(i, a.canCheck ? 'check' : 'call');
      else if (r < 8 && a.canRaise) s.act(i, 'raise', a.minTo + rnd(Math.max(1, a.maxTo - a.minTo + 1)));
      else if (r === 8) s.act(i, 'allin');
      else if (r === 9 && rnd(4) === 0) {
        // Once in a while it's the clock.
        s.t.now += TURN_MS;
        s.casino.tick();
        s.act(i, 'back');
      } else s.act(i, 'call');
      assert.equal(s.total(), start, `chips changed at step ${step}`);
      for (const seat of s.view(null).seats) assert.ok(seat.stack >= 0 && Number.isInteger(seat.stack));
    }
    assert.ok(hands >= 30, `only ${hands} hands`);
    // Everyone gets up: all of it is back in the wallets.
    for (let i = 0; i < 4; i++) s.casino.message(s.ids[i], { t: 'casino.stand' });
    assert.equal([0, 1, 2, 3].reduce((sum, i) => sum + s.wallet(i), 0), start);
  } finally {
    s.done();
  }
});

test('the house bot: one person can play, it plays by itself, and it leaves with them', () => {
  const s = setup(1, [300]);
  try {
    s.act(0, 'bot');
    const v = s.view(0);
    assert.ok(v.bot);
    assert.ok(v.seats.some((x) => x.name === HOUSE_BOT_NAME && x.bot));
    let hands = 0;
    for (let step = 0; step < 2000 && hands < 15; step++) {
      const w = s.view(0);
      if (w.street === 'showdown' || w.street === 'idle') {
        hands++;
        if (s.stack(0) === 0) s.act(0, 'buyin', 100);
        s.deal();
        continue;
      }
      if (w.you?.toAct) s.act(0, w.you.toAct.canCheck ? 'check' : 'call');
      else {
        s.t.now += 1000;
        s.casino.tick();
      }
    }
    assert.ok(hands >= 10, `only ${hands} hands with the bot`);
    // The bot's cards are hidden like anyone's (until a showdown).
    s.casino.message(s.ids[0], { t: 'casino.stand' });
    assert.equal(s.view(null).seats.length, 0, 'the house gets up when the last person does');
  } finally {
    s.done();
  }
});

test('a sixth person gets the bot’s chair', () => {
  const s = setup(5, [100, 100, 100, 100, 100]);
  try {
    s.act(0, 'bot');
    assert.equal(s.view(null).seats.length, 6);
    s.join(5);
    const v = s.view(null);
    assert.equal(v.seats.length, 6);
    assert.ok(!v.bot);
  } finally {
    s.done();
  }
});
