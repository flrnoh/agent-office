// The black-light mini golf in the bowling centre (flrnoh fork, see FORK.md "Black-light mini golf"):
// the room (its own walls in ZONES.minigolf, always black light), nine holes (shared/minigolf-holes.ts),
// the ball (shared/minigolf-physics.ts), and the game the office keeps (server/bowling/minigolf.ts):
// who has a putter and a ball, who plays which hole, groups taking turns, every scorecard, the records.

import { MINIGOLF_DOOR, ZONES } from './bowling.js';
import { HOLES, HOLE_COUNT } from './minigolf-holes.js';
import type { PuttResult } from './minigolf-physics.js';

// ---- The room ------------------------------------------------------------------------------------

/** Its own walls (south and west), this thick, standing in the zone's edge. */
export const MG_WALL = 0.2;
/** The room inside them, and its black ceiling. */
export const MG_ROOM = { minX: ZONES.minigolf.minX + MG_WALL, maxX: ZONES.minigolf.maxX, minZ: ZONES.minigolf.minZ, maxZ: ZONES.minigolf.maxZ - MG_WALL, ceiling: 3.4 } as const;
/** The doorway in the south wall: from x0 to x1, this tall. */
export const MG_DOOR = { x0: MINIGOLF_DOOR.x - MINIGOLF_DOOR.width / 2, x1: MINIGOLF_DOOR.x + MINIGOLF_DOOR.width / 2, height: 2.4 } as const;
export { LANE_Y } from './minigolf-holes.js';
/** "Schläger & Bälle": the stand just inside the door (west of it), its counter against the south wall. */
export const MG_STAND = { x: -1.65, z: MG_ROOM.maxZ - 0.3, width: 1.5, depth: 0.55 } as const;
/** The scorecard board on the south wall east of the door, facing into the room. */
export const MG_BOARD = { x: 5.0, y: 1.05, z: MG_ROOM.maxZ - 0.04, width: 3.6, height: 1.9 } as const;

/** Every player's ball has a colour of its own (what the page and the board show): the paint, and its name. */
export const MG_COLORS = [
  ['#39ff14', 'Grün'],
  ['#ff2bd6', 'Pink'],
  ['#00e5ff', 'Cyan'],
  ['#fffb00', 'Gelb'],
  ['#ff7a00', 'Orange'],
  ['#b14dff', 'Lila'],
  ['#00ffb3', 'Mint'],
  ['#ff3b3b', 'Rot'],
] as const;

// ---- The rules -----------------------------------------------------------------------------------

/** Strokes a hole at most: not down in this many, it's a "+" (and counts PLUS). */
export const MAX_STROKES = 7;
export const PLUS = 8;
/** A group plays together, at most this many, taking turns. */
export const MAX_GROUP = 4;
/** A turn not taken in this long passes to the next one in the group. */
export const TURN_MS = 60_000;
/** You putt standing this near your ball (m), and gather a group standing this near the first tee. */
export const PUTT_REACH = 3;
export const GROUP_REACH = 4.5;
/** At most this many putters out at once. */
export const MAX_PLAYERS = 16;

/** A hole's strokes on the card: null not played yet, else the strokes (PLUS a "+"). */
export type Card = (number | null)[];

/** What the card says for a hole. */
export const cardText = (n: number | null | undefined) => (n == null ? '' : n >= PLUS ? '+' : String(n));

/** What a card adds up to (a "+" counts PLUS). */
export const cardTotal = (card: Card) => card.reduce<number>((s, n) => s + (n ?? 0), 0);

/** Holes on the card done. */
export const cardHoles = (card: Card) => card.filter((n) => n != null).length;

/** Over or under par for the holes done ("±0", "+3", "-1"). */
export function toPar(card: Card): string {
  let d = 0;
  card.forEach((n, i) => {
    if (n != null) d += n - HOLES[i].par;
  });
  return d === 0 ? '±0' : d > 0 ? `+${d}` : String(d);
}

/** The week (ISO, "2026-W40") a time falls in: the weekly best's. */
export function weekOf(ms: number): string {
  const d = new Date(ms);
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const year = t.getUTCFullYear();
  const week = Math.ceil(((t.getTime() - Date.UTC(year, 0, 1)) / 86_400_000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** The moving obstacles' clock: the shared clock (the office's ms) as seconds into its hour. Every period divides an hour. */
export const clockSec = (ms: number) => (((ms % 3_600_000) + 3_600_000) % 3_600_000) / 1000;

/** Where a player's ball sits on the tee before their first putt: side by side, by colour. */
export function teeSpot(hole: number, color: number): { x: number; z: number } {
  const h = HOLES[Math.max(0, Math.min(HOLE_COUNT, hole) - 1)];
  const k = (((color % 3) + 1) % 3) - 1; // the first colour right on the tee, the next either side of it
  return { x: h.tee.x + k * 0.08, z: h.tee.z - Math.floor((color % 6) / 3) * 0.08 };
}

// ---- What everyone sees ----------------------------------------------------------------------------

export interface MgPlayer {
  id: string;
  name: string;
  /** Which of MG_COLORS. */
  color: number;
  /** The hole they're on (1–9), or 0 having finished the round. */
  hole: number;
  /** Strokes on it so far. */
  strokes: number;
  card: Card;
  /** Where their ball lies on that hole (its own frame). */
  ball: { x: number; z: number };
  /** Rolling now (a putt not over yet). */
  rolling: boolean;
  /** Their group, if they play in one. */
  group?: string;
}

export interface MgGroup {
  id: string;
  /** In turn order. */
  players: string[];
  /** Whose turn it is (null between holes). */
  turn: string | null;
  /** Until when (office ms) the turn's theirs. */
  turnEnds: number;
}

export interface MgLeader {
  name: string;
  total: number;
  /** When (office ms). */
  at: number;
}

export interface MgView {
  players: MgPlayer[];
  groups: MgGroup[];
  /** The best rounds ever, and this week's. */
  best: MgLeader[];
  week: MgLeader[];
  /** Holes in one, all told. */
  aces: number;
  /** The office's clock when this was sent (ms), for the shared clock. */
  now: number;
}

/** Your own records (only to you). */
export interface MgMine {
  rounds: number;
  best: number | null;
  aces: number;
  weekBest: number | null;
}

/** What just happened, for the toast and the show. */
export type MgEvent =
  | { k: 'holed'; id: string; name: string; hole: number; strokes: number }
  | { k: 'ace'; id: string; name: string; hole: number }
  | { k: 'plus'; id: string; name: string; hole: number }
  | { k: 'round'; id: string; name: string; total: number; best: boolean; week: boolean }
  | { k: 'group'; names: string[] }
  | { k: 'turn'; id: string; name: string; hole: number };

/** A putt: who, on which hole, from where, which way (the hole's frame), how hard, when (office ms), and what it came to. */
export interface MgShot {
  id: string;
  hole: number;
  from: { x: number; z: number };
  dir: number;
  power: number;
  at: number;
  result: PuttResult;
}

export type MinigolfClientMsg =
  /** In the bowling centre: tell me how the mini golf stands. */
  | { t: 'mg.look' }
  /** At the stand: a putter and a ball (a new round on hole 1), or giving them back. */
  | { t: 'mg.take' }
  | { t: 'mg.return' }
  /** At the first tee: a round together with everyone there with a putter and no round under way. */
  | { t: 'mg.group' }
  /** A putt on hole `hole`: which way (its frame), how hard (0–1), when on the office's clock (ms). */
  | { t: 'mg.putt'; hole: number; dir: number; power: number; at: number }
  /** Picking the ball up: a "+" for this hole, on to the next. */
  | { t: 'mg.pickup' };

export type MinigolfServerMsg =
  /** How the mini golf stands (to everyone in the centre), with what just happened. */
  | { t: 'mg'; view: MgView; event?: MgEvent; mine?: MgMine }
  /** Someone putted (to everyone in the centre): everyone rolls it the same way. */
  | { t: 'mg.putt'; shot: MgShot };

export const isMinigolfMsg = (t: string): t is MinigolfClientMsg['t'] => t === 'mg.look' || t === 'mg.take' || t === 'mg.return' || t === 'mg.group' || t === 'mg.putt' || t === 'mg.pickup';

/** A fresh card. */
export const emptyCard = (): Card => Array.from({ length: HOLE_COUNT }, () => null);
