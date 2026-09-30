import type { GymKind, LeaderRow } from '../../shared/gym.js';

/*
 * What a gym station is to the gym (flrnoh fork, see FORK.md and ./index.ts): one piece of equipment
 * with a few places on it. The gym seats and unseats people, hands the game their actions, ticks it
 * for anything timed (a running belt, water warming, a set being ground out), and sends everyone in
 * the gym its view whenever the game says it changed. Fitness points and energy only ever move
 * through the context, which keeps the profiles.
 */

/** Someone at a station: who they are for their profile (`account:<id>` or `name:<name>`), and their name. */
export interface Seated {
  owner: string;
  name: string;
}

/** Lifetime tallies a game can add to (all optional; left-out ones don't move). */
export interface GymTallies {
  workouts?: number;
  meters?: number;
  calories?: number;
  volume?: number;
  reps?: number;
  relaxSecs?: number;
}

/** What a game can do with the gym, handed to every call (bound to its station). */
export interface GymContext {
  /** Gives `owner` fitness points, and adds to their lifetime tallies. Whole XP only; nothing for 0. */
  award(owner: string, xp: number, tallies?: GymTallies): void;
  /** Tops up (or spends, when negative) `owner`'s energy, clamped to 0…STAMINA_MAX. */
  addStamina(owner: string, delta: number): void;
  /** `owner`'s energy right now (after the rest they've had since it last moved). */
  stamina(owner: string): number;
  /** `owner`'s level right now. */
  level(owner: string): number;
  /** A personal best `owner` keeps (per machine, e.g. their heaviest set): 0 if none yet. */
  pr(owner: string, key: string): number;
  setPr(owner: string, key: string, value: number): void;
  /** Marks that `owner` did a real workout now: bumps their workout count and their daily streak. */
  countWorkout(owner: string): void;
  /** The top `top` by XP, with `you` flagged. */
  leaderboard(top: number, you: string): LeaderRow[];
  /** A fair random whole number from 0 to n - 1 (crypto.randomInt, or the tests' own). */
  random(n: number): number;
  /** Tells `owner` how it went (a toast on their page, and `data` for the window to animate). `xp`: points earned. */
  result(owner: string, text: string, xp?: number, data?: unknown): void;
  /** The station looks different now: everyone in the gym gets its view again. */
  changed(): void;
  /** The office's clock (ms). */
  now(): number;
  /** What `owner` is called (for a station's occupant list). */
  name(owner: string): string;
  /** The office seat `owner` sits on right now (a peer's `seat`, e.g. "gym-sauna-low-e:1"), if any. */
  seatKey(owner: string): string | undefined;
}

export interface GymGame {
  /** The station's id (GYM_STATIONS), which every message about it names. */
  readonly id: string;
  readonly kind: GymKind;
  /** How many use it at once. The gym keeps count: `sit` is only asked while there's a free place. */
  readonly seats: number;
  /** `p` steps on (the gym checked there's room, and they're at no other station). An error keeps them off it. */
  sit(p: Seated, ctx: GymContext): string | void;
  /** `owner` stepped off, or left the gym, or the office: whatever they had going ends and is banked. */
  stand(owner: string, ctx: GymContext): void;
  /** `p`, on this station, does `action` with `data` (both unchecked: validate them). An error goes back as a toast. */
  act(p: Seated, action: string, data: unknown, ctx: GymContext): string | void;
  /** A few times a second (TICK_MS), for anything timed: a running session, water warming, a set finishing. */
  tick(now: number, ctx: GymContext): void;
  /** The station as `forOwner` sees it (null: someone who isn't on it), sent as a gym.station state. */
  view(forOwner: string | null): unknown;
}
