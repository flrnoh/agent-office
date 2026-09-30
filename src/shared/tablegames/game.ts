import type { Side, TableId } from './tables.js';

/**
 * One of the table games, as the host's page plays it: all of it pure, so the office's tests can
 * play it too. The state is plain numbers, so it goes over the wire as `encode` has it.
 */
export interface TableGame<S extends GameState> {
  id: TableId;
  /** A new match, with side 0 to start (serve, break or kick off). */
  init(rng: Rng): S;
  /**
   * A move from a side: [0, …] where they're moving to (a mallet, a paddle, the rods, the cue's
   * aim), [1, …] their action (a swing, a kick, a shot), [2, …] anything else the game has.
   */
  input(s: S, side: Side, a: readonly number[]): void;
  /** Runs the game on by `dt` seconds; what happened goes into `ev` (see EV). */
  step(s: S, dt: number, ev: number[], rng: Rng): void;
  /** The computer's moves for `side` this frame, if any. */
  cpu(s: S, side: Side, dt: number, rng: Rng): number[][];
  encode(s: S): number[];
  decode(a: readonly number[]): S;
}

export interface GameState {
  score: [number, number];
  win: -1 | 0 | 1;
}

export type Rng = () => number;

/** A repeatable random number generator, for tests (mulberry32). */
export function seeded(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Adds an event (see EV) at (u, v). */
export function emit(ev: number[], kind: number, u: number, v: number) {
  if (ev.length < 57) ev.push(kind, Math.round(u * 1000) / 1000, Math.round(v * 1000) / 1000);
}
