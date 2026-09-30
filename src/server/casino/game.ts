import type { CasinoKind } from '../../shared/casino.js';

/*
 * What a casino game is to the casino (flrnoh fork, see FORK.md and ./index.ts): one table (or
 * slot machine) with a few seats. The casino seats and unseats people, hands the game their
 * actions, ticks it for anything timed, and sends everyone in the casino its view whenever the game
 * says it changed. Chips only ever move through the context's stake and pay, which check them.
 */

/** Someone at a table: who they are for their chips (`account:<id>` or `name:<name>`), and what they're called. */
export interface Seated {
  owner: string;
  name: string;
}

/** What a game can do with the casino, handed to every call (bound to its table). */
export interface CasinoContext {
  /**
   * Takes a stake off `owner`: an error (nothing taken) when it isn't a whole number of chips
   * between `min` and `max` (MIN_BET and MAX_BET unless the game says), or they don't have it.
   */
  stake(owner: string, amount: unknown, limits?: { min?: number; max?: number }): string | undefined;
  /** Gives `owner` chips: winnings, and a stake coming back. Whole numbers only; nothing for 0. */
  pay(owner: string, amount: number): void;
  /** How many chips `owner` has. */
  chips(owner: string): number;
  /** A fair random whole number from 0 to n - 1 (crypto.randomInt, or the tests' own). */
  random(n: number): number;
  /** Tells `owner` how it went (a toast on their page, and `data` for the window to animate). `delta`: what it did to their chips. */
  result(owner: string, text: string, delta?: number, data?: unknown): void;
  /** The table looks different now: everyone in the casino gets its view again. */
  changed(): void;
  /** The office's clock (ms). */
  now(): number;
}

export interface CasinoGame {
  /** The table's id (CASINO_TABLES), which every message about it names. */
  readonly id: string;
  readonly kind: CasinoKind;
  /** How many can sit at it at once. The casino keeps count: `sit` is only asked while there's a free seat. */
  readonly seats: number;
  /** `p` sits down (the casino checked there's room, and they're at no other table). An error keeps them standing. */
  sit(p: Seated, ctx: CasinoContext): string | void;
  /** `owner` got up, or left the casino, or the office: whatever they had going ends as the game sees fit. */
  stand(owner: string, ctx: CasinoContext): void;
  /** `p`, seated here, does `action` with `data` (both unchecked: validate them). An error goes back to them as a toast. */
  act(p: Seated, action: string, data: unknown, ctx: CasinoContext): string | void;
  /** A few times a second (TICK_MS), for anything timed: reels stopping, a dealer's turn, a betting window closing. */
  tick(now: number, ctx: CasinoContext): void;
  /** The table as `forOwner` sees it (null: someone who isn't seated), sent as a casino.table state. Hide others' hole cards here. */
  view(forOwner: string | null): unknown;
}
