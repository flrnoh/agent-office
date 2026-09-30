// The casino's blackjack tables (flrnoh fork, see shared/casino.ts and server/casino/blackjack.ts):
// a six-deck shoe, the dealer stands on all 17s (soft ones too), blackjack pays 3 to 2, double on
// any first two cards, split a pair once. Shared by the server (the game) and the client (the
// window works out hand totals from the cards the view shows).

/** A card: its rank (A 2-9 T J Q K) and its suit (s h d c), e.g. 'As', 'Th', '7d'. */
export type Card = string;

export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K'] as const;
export const SUITS = ['s', 'h', 'd', 'c'] as const;
export const SUIT_SYMBOL: Record<string, string> = { s: '♠', h: '♥', d: '♦', c: '♣' };

/** How many decks go in the shoe, and how far into it the cut card sits (a fresh shuffle before the next round once it's out). */
export const DECKS = 6;
export const PENETRATION = 0.75;

/** The betting window, from the first bet on (ms); cut short once everyone seated has bet. */
export const BET_MS = 15_000;
/** How soon the cards come once everyone seated has bet. */
export const ALL_IN_MS = 2_000;
/** How long you have to play a hand before it stands for you. */
export const TURN_MS = 20_000;
/** How long the dealer takes over each card of theirs. */
export const DEALER_STEP_MS = 800;
/** How long the results stay on the table before the next round's betting. */
export const RESULTS_MS = 5_000;

/** The chip buttons under the bet. */
export const BJ_CHIPS = [1, 5, 25, 100] as const;

export const rankOf = (c: Card) => c[0];
export const suitOf = (c: Card) => c[1];
/** What a card counts: an ace 1 (handValue makes one of them 11 when it fits), pictures 10. */
export function cardPoints(c: Card): number {
  const r = rankOf(c);
  if (r === 'A') return 1;
  if (r === 'T' || r === 'J' || r === 'Q' || r === 'K') return 10;
  return Number(r);
}
export const isTenValue = (c: Card) => cardPoints(c) === 10;
/** How a card reads: 'A♠', '10♥'. */
export const cardLabel = (c: Card) => `${rankOf(c) === 'T' ? '10' : rankOf(c)}${SUIT_SYMBOL[suitOf(c)] ?? '?'}`;

/** A fresh, unshuffled shoe of `decks` decks. */
export function newShoe(decks = DECKS): Card[] {
  const out: Card[] = [];
  for (let d = 0; d < decks; d++) for (const s of SUITS) for (const r of RANKS) out.push(r + s);
  return out;
}

/** Shuffles `cards` in place (Fisher-Yates) with `random(n)`: a fair whole number from 0 to n - 1. */
export function shuffle<T>(cards: T[], random: (n: number) => number): T[] {
  for (let i = cards.length - 1; i > 0; i--) {
    const j = random(i + 1);
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

/** A hand's total, and whether it's soft (an ace counted as 11 in it). */
export function handValue(cards: readonly Card[]): { total: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    total += cardPoints(c);
    if (rankOf(c) === 'A') aces++;
  }
  const soft = aces > 0 && total + 10 <= 21;
  return { total: soft ? total + 10 : total, soft };
}

/** How a total reads: '17', 'soft 17', 'bust 24', 'Blackjack'. */
export function totalText(cards: readonly Card[], blackjack = false): string {
  if (!cards.length) return '';
  if (blackjack) return 'Blackjack';
  const v = handValue(cards);
  if (v.total > 21) return `bust ${v.total}`;
  return v.soft && v.total < 21 ? `soft ${v.total}` : `${v.total}`;
}

/** A natural: two cards making 21, not on a split hand. */
export const isBlackjack = (cards: readonly Card[], fromSplit = false) => !fromSplit && cards.length === 2 && handValue(cards).total === 21;

/** Whether the dealer draws on `cards`: under 17 (they stand on every 17, soft ones too). */
export const dealerDraws = (cards: readonly Card[]) => handValue(cards).total < 17;

export type HandOutcome = 'blackjack' | 'win' | 'push' | 'lose' | 'bust';

/**
 * What a hand gets back at the end (its stake included): nothing when it lost, the stake on a push,
 * double on a win, and 3 to 2 on a blackjack (half chips rounded down: play chips come whole).
 */
export function settleHand(hand: { cards: readonly Card[]; bet: number; split?: boolean }, dealer: readonly Card[]): { outcome: HandOutcome; paid: number } {
  const mine = handValue(hand.cards).total;
  if (mine > 21) return { outcome: 'bust', paid: 0 };
  const bj = isBlackjack(hand.cards, hand.split);
  const dealerBj = isBlackjack(dealer);
  if (bj && dealerBj) return { outcome: 'push', paid: hand.bet };
  if (bj) return { outcome: 'blackjack', paid: hand.bet + Math.floor(hand.bet * 1.5) };
  if (dealerBj) return { outcome: 'lose', paid: 0 };
  const theirs = handValue(dealer).total;
  if (theirs > 21 || mine > theirs) return { outcome: 'win', paid: hand.bet * 2 };
  if (mine === theirs) return { outcome: 'push', paid: hand.bet };
  return { outcome: 'lose', paid: 0 };
}

// ---- What the office sends -----------------------------------------------------------------------

export type BlackjackPhase = 'betting' | 'playing' | 'dealer' | 'results';

export interface BlackjackHandView {
  cards: Card[];
  bet: number;
  /** Doubled down (the bet shown is the doubled one). */
  doubled?: boolean;
  /** One of the two hands of a split. */
  split?: boolean;
  /** Played out: stood, bust, doubled, 21, or a blackjack. */
  done?: boolean;
  /** Once settled. */
  outcome?: HandOutcome;
  /** What it got back, its stake included. */
  paid?: number;
}

export interface BlackjackSeatView {
  name: string;
  /** What they've put down for the next hand (the betting window). */
  bet: number;
  hands: BlackjackHandView[];
  /** Got up mid-round: their hands play out (they stand) and are settled all the same. */
  gone?: boolean;
}

export interface BlackjackView {
  kind: 'blackjack';
  phase: BlackjackPhase;
  round: number;
  /** How long until the betting window closes, the hand whose turn it is stands, or the next round (ms, as of when this was sent). */
  left?: number;
  /** The dealer's cards: the hole card is null until the dealer turns it over. */
  dealer: (Card | null)[];
  /** One per seat, null where nobody sits. */
  seats: (BlackjackSeatView | null)[];
  /** Whose turn it is: a seat and which of their hands. */
  turn?: { seat: number; hand: number };
  /** Who's sitting (names), for the hint bar. */
  seated: string[];
  /** Cards left in the shoe before the cut card (not what they are). */
  shoe: number;
  /** Only in your own view: your seat, what you bet last round, and what you may do now. */
  you?: number;
  lastBet?: number;
  can?: { hit: boolean; stand: boolean; double: boolean; split: boolean };
}

/** What casino.result carries after a round: each of your hands as it was settled. */
export interface BlackjackResult {
  round: number;
  dealer: Card[];
  hands: { cards: Card[]; bet: number; outcome: HandOutcome; paid: number }[];
}
