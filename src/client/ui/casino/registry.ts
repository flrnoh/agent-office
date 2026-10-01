import type { CasinoKind, CasinoTableDef } from '../../../shared/casino';

/*
 * The casino's game windows (flrnoh fork, see FORK.md): one per kind of table. client/casino.ts
 * opens the window for the table you press E at and hands it the office's news about that table;
 * a game registers its window here (registerCasinoUi), and a kind without one gets "Coming soon".
 */

export type CasinoSoundKind = 'spin' | 'reel' | 'win' | 'jackpot' | 'lose' | 'chip';

/** What a game's window gets to work with. */
export interface CasinoUiContext {
  table: CasinoTableDef;
  /** The table as the office last described it to you (a casino.table state), or null before it has. */
  state: unknown;
  /** Your chips right now, and when the next top-up comes (if you're below START_CHIPS). */
  chips: number;
  nextTopUpAt?: number;
  /** Plays at the table: a casino.act with the game's own action and data. */
  act(action: string, data?: unknown): void;
  sound(kind: CasinoSoundKind): void;
  toast(text: string, level?: 'info' | 'warn' | 'error'): void;
  /** The window closed (✕, Esc, or it closed itself): you get up from the table. Call it exactly once. */
  closed(): void;
}

/** An open game window: the casino passes it what the office says while it's open. */
export interface CasinoUi {
  /** The table changed (a casino.table for it). */
  table(state: unknown): void;
  /** Your chips changed. */
  wallet(chips: number, nextTopUpAt?: number): void;
  /**
   * How your play went (a casino.result for this table). Return true to show it yourself (the
   * slot window says it once the reels land); otherwise it's a toast.
   */
  result(text: string, delta: number | undefined, data: unknown): boolean | void;
  /** Closes it from outside (leaving the casino, the office going away). */
  close(): void;
}

export type CasinoUiOpener = (ctx: CasinoUiContext) => CasinoUi;

const openers = new Map<CasinoKind, CasinoUiOpener>();

/** Phase 2: `registerCasinoUi('roulette', openRoulette)` and the roulette tables open it. */
export function registerCasinoUi(kind: CasinoKind, open: CasinoUiOpener) {
  openers.set(kind, open);
}

export function casinoUiFor(kind: CasinoKind): CasinoUiOpener | undefined {
  return openers.get(kind);
}

/** Chips as people read them: 1,250. */
export const chipText = (n: number) => Math.max(0, Math.floor(n)).toLocaleString('en-US');
