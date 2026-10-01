// The casino's roulette table (flrnoh fork, see shared/casino.ts): European, a single zero, 37
// pockets. One shared table: while anyone sits at it, rounds run on their own (bets for BET_MS, the
// wheel for SPIN_MS, the payout for PAYOUT_MS). Every bet is a set of numbers, and pays so that
// what comes back is 36 / (how many numbers) times the stake: a house edge of exactly 1/37 on every
// bet (worked out in tests/casino-roulette.test.ts).
//
// A bet's key says where the chips lie on the layout:
//   n:17              straight up, one number (0..36)
//   split:a-b         two neighbours on the layout (a < b), the zero with 1, 2 or 3 too
//   street:r          a row of three: 3r-2, 3r-1, 3r (r 1..12)
//   corner:a          four: a, a+1, a+3, a+4 (a not in the top row); corner:0 is 0-1-2-3
//   line:r            six: streets r and r+1 (r 1..11)
//   dozen:d           1-12, 13-24, 25-36 (d 1..3)
//   column:c          1,4,..34 / 2,5,..35 / 3,6,..36 (c 1..3)
//   red black odd even low high

/** The pockets in the order they sit round the wheel, clockwise from the zero. */
export const WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26] as const;
export const POCKETS = 37;
export const REDS: ReadonlySet<number> = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
export const colorOf = (n: number): 'green' | 'red' | 'black' => (n === 0 ? 'green' : REDS.has(n) ? 'red' : 'black');

/** How long each part of a round lasts (ms). */
export const BET_MS = 20_000;
export const SPIN_MS = 6_000;
export const PAYOUT_MS = 5_000;

/** The table's limits: one spot takes 1..500 of yours, and a round at most 1,000. */
export const SPOT_MAX = 500;
export const ROUND_MAX = 1000;
/** The chips you pick up to bet with. */
export const ROULETTE_CHIPS = [1, 5, 25, 100] as const;
/** How many past numbers the table shows. */
export const HISTORY = 12;

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const int = (s: string, min: number, max: number): number | null => {
  if (!/^\d{1,2}$/.test(s)) return null;
  const n = Number(s);
  return n >= min && n <= max ? n : null;
};

/** The numbers a bet covers (sorted), or null when the key isn't a bet on this table. */
export function betNumbers(key: unknown): number[] | null {
  if (typeof key !== 'string' || key.length > 16) return null;
  switch (key) {
    case 'red':
      return range(1, 36).filter((n) => REDS.has(n));
    case 'black':
      return range(1, 36).filter((n) => !REDS.has(n));
    case 'odd':
      return range(1, 36).filter((n) => n % 2 === 1);
    case 'even':
      return range(1, 36).filter((n) => n % 2 === 0);
    case 'low':
      return range(1, 18);
    case 'high':
      return range(19, 36);
  }
  const [kind, arg = '', extra] = key.split(':');
  if (extra !== undefined) return null;
  switch (kind) {
    case 'n': {
      const n = int(arg, 0, 36);
      return n === null ? null : [n];
    }
    case 'split': {
      const m = /^(\d{1,2})-(\d{1,2})$/.exec(arg);
      if (!m) return null;
      const a = int(m[1], 0, 36);
      const b = int(m[2], 0, 36);
      if (a === null || b === null || a >= b) return null;
      const ok = a === 0 ? b <= 3 : b === a + 3 || (b === a + 1 && a % 3 !== 0);
      return ok ? [a, b] : null;
    }
    case 'street': {
      const r = int(arg, 1, 12);
      return r === null ? null : range(3 * r - 2, 3 * r);
    }
    case 'corner': {
      const a = int(arg, 0, 32);
      if (a === null) return null;
      if (a === 0) return [0, 1, 2, 3];
      return a % 3 === 0 ? null : [a, a + 1, a + 3, a + 4];
    }
    case 'line': {
      const r = int(arg, 1, 11);
      return r === null ? null : range(3 * r - 2, 3 * r + 3);
    }
    case 'dozen': {
      const d = int(arg, 1, 3);
      return d === null ? null : range(12 * d - 11, 12 * d);
    }
    case 'column': {
      const c = int(arg, 1, 3);
      return c === null ? null : range(0, 11).map((i) => 3 * i + c);
    }
  }
  return null;
}

/** What a winning bet pays per chip, besides the stake coming back (35 for a number, 1 for red). */
export function betOdds(key: string): number {
  const nums = betNumbers(key);
  return nums ? 36 / nums.length - 1 : 0;
}

/** What `amount` on `key` brings back when `n` comes up: the stake and the win, or 0. */
export function betReturn(key: string, amount: number, n: number): number {
  const nums = betNumbers(key);
  return nums && nums.includes(n) ? amount * (36 / nums.length) : 0;
}

/** A bet as people read it: "17", "Red", "Split 8/11", "2nd 12". */
export function betLabel(key: string): string {
  const [kind, arg] = key.split(':');
  const simple: Record<string, string> = { red: 'Red', black: 'Black', odd: 'Odd', even: 'Even', low: '1–18', high: '19–36' };
  if (simple[key]) return simple[key];
  const nums = betNumbers(key) ?? [];
  const ord = ['1st', '2nd', '3rd'];
  switch (kind) {
    case 'n':
      return arg;
    case 'split':
      return `Split ${nums.join('/')}`;
    case 'street':
      return `Street ${nums[0]}–${nums[2]}`;
    case 'corner':
      return `Corner ${nums.join('/')}`;
    case 'line':
      return `Line ${nums[0]}–${nums[5]}`;
    case 'dozen':
      return `${ord[Number(arg) - 1]} 12`;
    case 'column':
      return `Column ${arg}`;
  }
  return key;
}

export type RoulettePhase = 'idle' | 'betting' | 'spinning' | 'payout';

/** Chips on the layout: whose (their seat's colour, their name), where, how many. */
export interface RouletteChip {
  seat: number;
  name: string;
  key: string;
  amount: number;
}

/** The roulette table as everyone in the casino sees it (a `casino.table` state). */
export interface RouletteView {
  kind: 'roulette';
  phase: RoulettePhase;
  /** Counts up with every round, so a page can tell a new spin from the same one again. */
  round: number;
  /** When the phase ends and when the view was made, on the office's clock (a page works out its own offset). */
  endsAt?: number;
  now: number;
  /** Who's sitting, and at which seat (their chips' colour). */
  players: { seat: number; name: string }[];
  /** Names of everyone seated (the hint bar's count). */
  seated: string[];
  bets: RouletteChip[];
  /** The number: from the start of the spin (bets are closed by then; the window only says it once the ball lands) through the payout. */
  number?: number;
  /** The last numbers, newest first. */
  history: number[];
  /** Who won what in the last round (payout phase). */
  winners?: { seat: number; name: string; won: number }[];
  /** Your seat, when you sit here. */
  you?: number;
}

/** What a round's `casino.result` carries for the window. */
export interface RouletteResult {
  round: number;
  number: number;
  staked: number;
  /** Everything that came back, stakes included. */
  won: number;
}

/** A seat's chip colour. */
export const SEAT_COLORS = ['#f2c14e', '#4ea8de', '#e56b9f', '#7bd389', '#b18cf2', '#f28f3b'] as const;
