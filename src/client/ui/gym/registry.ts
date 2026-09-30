import type { GymKind, GymStationDef, FitnessProfile } from '../../../shared/gym';

/*
 * The gym's station windows (flrnoh fork, see FORK.md): one per kind of station. client/gym.ts opens
 * the window for the station you press E at and hands it the office's news about that station; a game
 * registers its window here (registerGymUi). Mirrors ui/casino/registry.ts.
 */

export type GymSoundKind = 'rep' | 'clank' | 'run' | 'ding' | 'splash' | 'cheer' | 'sip' | 'whoosh' | 'buzzer';

/** What a station's window gets to work with. */
export interface GymUiContext {
  station: GymStationDef;
  /** The station as the office last described it to you (a gym.station state), or null before it has. */
  state: unknown;
  /** Your fitness right now. */
  profile: FitnessProfile;
  /** Does something at the station: a gym.act with the game's own action and data. */
  act(action: string, data?: unknown): void;
  sound(kind: GymSoundKind): void;
  toast(text: string, level?: 'info' | 'warn' | 'error'): void;
  /** The window closed (✕, Esc, or it closed itself): you step off the station. Call it exactly once. */
  closed(): void;
}

/** An open station window: the gym passes it what the office says while it's open. */
export interface GymUi {
  /** The station changed (a gym.station for it). */
  station(state: unknown): void;
  /** Your fitness changed. */
  profile(profile: FitnessProfile): void;
  /**
   * How it went (a gym.result for this station). Return true to show it yourself (e.g. a set landing);
   * otherwise it's a toast.
   */
  result(text: string, xp: number | undefined, data: unknown): boolean | void;
  /** Closes it from outside (leaving the gym, the office going away). */
  close(): void;
}

export type GymUiOpener = (ctx: GymUiContext) => GymUi;

const openers = new Map<GymKind, GymUiOpener>();

export function registerGymUi(kind: GymKind, open: GymUiOpener) {
  openers.set(kind, open);
}

export function gymUiFor(kind: GymKind): GymUiOpener | undefined {
  return openers.get(kind);
}

/** A number as people read it: 12,540. */
export const num = (n: number) => Math.max(0, Math.floor(n)).toLocaleString('en-US');

/** Fitness points, short: 1.2k, 340. */
export function xpText(n: number): string {
  const x = Math.max(0, Math.floor(n));
  return x >= 10000 ? `${(x / 1000).toFixed(1)}k` : num(x);
}

/** A distance, in metres or kilometres. */
export function distText(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`;
}
