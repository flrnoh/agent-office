// No-limit Texas Hold'em at the casino's poker table (flrnoh fork, see FORK.md): a cash game among
// the people sitting there, for play chips. Shared by the server (server/casino/poker.ts deals and
// keeps the betting) and the client (the table's window, the felt in the room): the rules' numbers,
// the cards, the hand evaluator and what the table looks like to each viewer.

export const SMALL_BLIND = 5;
export const BIG_BLIND = 10;
/** What you can take to the table from your wallet (and top your stack up to, between hands). */
export const MIN_BUY_IN = 100;
export const MAX_BUY_IN = 1000;
export const DEFAULT_BUY_IN = 200;
/** How long you have to act before the dealer checks for you (or folds, facing a bet). */
export const TURN_MS = 30_000;
/** The pause after a hand (to see who won with what) before the next is dealt. */
export const HAND_PAUSE_MS = 5_000;
/** Between the streets of an all-in run-out, so everyone sees the cards come. */
export const RUNOUT_MS = 1_200;
/** Missing this many turns in a row sits you out until you say you're back. */
export const TIMEOUTS_TO_SIT_OUT = 2;
/** The house bot's owner key (it never has a wallet: its chips come from and go to the house). */
export const HOUSE_BOT = 'house:bot';
export const HOUSE_BOT_NAME = '🤖 House';
export const HOUSE_BOT_STACK = 1000;

// ---- Cards --------------------------------------------------------------------------------------

/** Ranks low to high (T is ten), and suits. A card is rank then suit: 'As', 'Td', '2c'. */
export const RANKS = '23456789TJQKA';
export const SUITS = 'shdc';
export type Card = string;

export const SUIT_SYMBOL: Record<string, string> = { s: '♠', h: '♥', d: '♦', c: '♣' };
export const isRed = (c: Card) => c[1] === 'h' || c[1] === 'd';
/** A rank as people read it on a card: 10 rather than T. */
export const rankLabel = (c: Card) => (c[0] === 'T' ? '10' : c[0]);

export function fullDeck(): Card[] {
  const d: Card[] = [];
  for (const s of SUITS) for (const r of RANKS) d.push(r + s);
  return d;
}

export function isCard(c: unknown): c is Card {
  return typeof c === 'string' && c.length === 2 && RANKS.includes(c[0]) && SUITS.includes(c[1]);
}

const rankOf = (c: Card) => RANKS.indexOf(c[0]);

// ---- Hands --------------------------------------------------------------------------------------

export const CATEGORIES = ['High card', 'Pair', 'Two pair', 'Three of a kind', 'Straight', 'Flush', 'Full house', 'Four of a kind', 'Straight flush'] as const;
export type Category = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface HandValue {
  /** Bigger beats smaller; equal is a split. */
  score: number;
  category: Category;
  /** What people call it: "Full house, Kings full of Sevens". */
  name: string;
  /** The five cards that make it, strongest first. */
  best: Card[];
}

const RANK_NAME = ['Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Jack', 'Queen', 'King', 'Ace'];
const PLURAL = ['Twos', 'Threes', 'Fours', 'Fives', 'Sixes', 'Sevens', 'Eights', 'Nines', 'Tens', 'Jacks', 'Queens', 'Kings', 'Aces'];

/** Five cards' value. */
export function evaluate5(cards: readonly Card[]): HandValue {
  const ranks = cards.map(rankOf);
  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  // Groups by size, then rank: [rank, count] strongest first.
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const flush = cards.every((c) => c[1] === cards[0][1]);
  const distinct = [...counts.keys()].sort((a, b) => b - a);
  let straightHigh = -1;
  if (distinct.length === 5) {
    if (distinct[0] - distinct[4] === 4) straightHigh = distinct[0];
    // The wheel: A-2-3-4-5, five high.
    else if (distinct[0] === 12 && distinct[1] === 3) straightHigh = 3;
  }
  let category: Category;
  let kickers: number[];
  if (straightHigh >= 0 && flush) {
    category = 8;
    kickers = [straightHigh];
  } else if (groups[0][1] === 4) {
    category = 7;
    kickers = [groups[0][0], groups[1][0]];
  } else if (groups[0][1] === 3 && groups[1][1] === 2) {
    category = 6;
    kickers = [groups[0][0], groups[1][0]];
  } else if (flush) {
    category = 5;
    kickers = distinct;
  } else if (straightHigh >= 0) {
    category = 4;
    kickers = [straightHigh];
  } else if (groups[0][1] === 3) {
    category = 3;
    kickers = groups.map((g) => g[0]);
  } else if (groups[0][1] === 2 && groups[1][1] === 2) {
    category = 2;
    kickers = groups.map((g) => g[0]);
  } else if (groups[0][1] === 2) {
    category = 1;
    kickers = groups.map((g) => g[0]);
  } else {
    category = 0;
    kickers = distinct;
  }
  let score = category;
  for (let i = 0; i < 5; i++) score = score * 13 + (kickers[i] ?? 0);
  // The cards in the order they count: groups first, the wheel's ace last.
  const order = (c: Card) => {
    const r = rankOf(c);
    if ((category === 4 || category === 8) && straightHigh === 3 && r === 12) return -1;
    return (counts.get(r) ?? 0) * 100 + r;
  };
  const best = [...cards].sort((a, b) => order(b) - order(a));
  return { score, category, name: handName(category, kickers), best };
}

function handName(category: Category, k: number[]): string {
  switch (category) {
    case 8:
      return k[0] === 12 ? 'Royal flush' : `Straight flush, ${RANK_NAME[k[0]]} high`;
    case 7:
      return `Four of a kind, ${PLURAL[k[0]]}`;
    case 6:
      return `Full house, ${PLURAL[k[0]]} full of ${PLURAL[k[1]]}`;
    case 5:
      return `Flush, ${RANK_NAME[k[0]]} high`;
    case 4:
      return `Straight, ${RANK_NAME[k[0]]} high`;
    case 3:
      return `Three of a kind, ${PLURAL[k[0]]}`;
    case 2:
      return `Two pair, ${PLURAL[k[0]]} and ${PLURAL[k[1]]}`;
    case 1:
      return `Pair of ${PLURAL[k[0]]}`;
    default:
      return `High card, ${RANK_NAME[k[0]]}`;
  }
}

/** The best five of five to seven cards (hole cards and the board). */
export function evaluate(cards: readonly Card[]): HandValue {
  if (cards.length < 5 || cards.length > 7) throw new Error('evaluate: 5 to 7 cards');
  let best: HandValue | null = null;
  const n = cards.length;
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++)
      for (let c = b + 1; c < n; c++)
        for (let d = c + 1; d < n; d++)
          for (let e = d + 1; e < n; e++) {
            const v = evaluate5([cards[a], cards[b], cards[c], cards[d], cards[e]]);
            if (!best || v.score > best.score) best = v;
          }
  return best!;
}

// ---- Pots ---------------------------------------------------------------------------------------

/** One pot: how much is in it, and who can win it (indexes into what `splitPots` was given). */
export interface Pot {
  amount: number;
  eligible: number[];
}

/**
 * The main pot and the side pots, from what each player put in this hand and whether they're still
 * in it. Each level an all-in player stops at closes a pot only the players who put in at least as
 * much can win. Chips from folded players count toward the pots at their level; anything above
 * the last live player's level (which the uncalled-bet return normally leaves nothing of) goes to
 * the last pot.
 */
export function splitPots(players: readonly { total: number; live: boolean }[]): Pot[] {
  const levels = [...new Set(players.filter((p) => p.live && p.total > 0).map((p) => p.total))].sort((a, b) => a - b);
  const pots: Pot[] = [];
  let prev = 0;
  for (const level of levels) {
    let amount = 0;
    for (const p of players) amount += Math.max(0, Math.min(p.total, level) - prev);
    const eligible = players.map((p, i) => (p.live && p.total >= level ? i : -1)).filter((i) => i >= 0);
    if (amount > 0) {
      // Two levels with the same players able to win are one pot.
      const last = pots.at(-1);
      if (last && last.eligible.length === eligible.length && last.eligible.every((e, i) => e === eligible[i])) last.amount += amount;
      else pots.push({ amount, eligible });
    }
    prev = level;
  }
  const over = players.reduce((s, p) => s + Math.max(0, p.total - prev), 0);
  if (over > 0) {
    if (pots.length) pots[pots.length - 1].amount += over;
    else pots.push({ amount: over, eligible: players.map((p, i) => (p.live ? i : -1)).filter((i) => i >= 0) });
  }
  return pots;
}

/**
 * Splits `amount` among `winners` (already in order from the first seat left of the button): the
 * odd chips, one each, go to the first of them.
 */
export function shareOut(amount: number, winners: readonly number[]): Map<number, number> {
  const out = new Map<number, number>();
  if (!winners.length) return out;
  const each = Math.floor(amount / winners.length);
  let odd = amount - each * winners.length;
  for (const w of winners) {
    out.set(w, each + (odd > 0 ? 1 : 0));
    odd--;
  }
  return out;
}

// ---- What the table looks like ------------------------------------------------------------------

export type PokerStreet = 'idle' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';

export interface PokerSeatView {
  seat: number;
  name: string;
  stack: number;
  /** Put in this betting round. */
  bet: number;
  /**
   * waiting: seated, not in this hand (just sat down, or between hands); in: playing it; folded;
   * allin; out: no chips (buy in again); sitout: missed their turns, sitting out.
   */
  status: 'waiting' | 'in' | 'folded' | 'allin' | 'out' | 'sitout';
  dealer?: boolean;
  /** Their turn: `turnMs` says how long they have left, from when this view was sent. */
  turn?: boolean;
  /** Dealt in (face down to everyone else). */
  hasCards?: boolean;
  /** Face up: yours, or everyone's still in at a showdown. */
  cards?: Card[];
  /** What they did last this hand: "Call 20", "Raise to 60". */
  last?: string;
  /** At the end of a hand: what they won, and with what. */
  won?: number;
  hand?: string;
  bot?: boolean;
  you?: boolean;
}

/** What you can do when it's your turn. */
export interface PokerToAct {
  toCall: number;
  canCheck: boolean;
  /** Bet or raise: to how much in total this round, at least and at most (at most is all-in). */
  canRaise: boolean;
  minTo: number;
  maxTo: number;
  /** Your bet this round already, and your stack. */
  bet: number;
  stack: number;
}

export interface PokerView {
  kind: 'poker';
  /** Everyone at the table, by name (the room's hint counts them). */
  seated: string[];
  seats: PokerSeatView[];
  board: Card[];
  street: PokerStreet;
  /** Hands dealt at this table since the office started. */
  hand: number;
  /** Everything in the middle, bets this round included; and split into main and side pots once there's more than one. */
  pot: number;
  pots: number[];
  blinds: [number, number];
  /** Whose turn (a seat), and how long they have left (ms, from when this was sent). */
  turnSeat?: number;
  turnMs?: number;
  /** Till the next hand's dealt (ms). */
  nextMs?: number;
  /** The last hand's outcome, in a line: "Ada wins 240 with Flush, Ace high". */
  summary?: string;
  /** Yours: your seat (none while standing), and what you can do right now. */
  you?: { seat: number; stack: number; status: PokerSeatView['status']; toAct?: PokerToAct; hand?: string };
  /** The house bot sits here. */
  bot?: boolean;
}

/** What a casino.result's data says about a hand you played. */
export interface PokerResult {
  hand: number;
  won: number;
  net: number;
}
