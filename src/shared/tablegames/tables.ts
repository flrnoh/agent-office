// The table games on the rooftop bar (flrnoh fork, see FORK.md): a kicker, a pool table, an air
// hockey table and a table tennis table. Whoever steps up to one plays; the first two up there play
// each other, someone alone plays the computer, and everyone else up there watches.
//
// How it runs: the first player's page (the table's host) plays the game itself, the computer
// opponent included, and sends what the table looks like a couple of dozen times a second through
// the office to everyone on the roof. The other player's page sends its moves to the host the same
// way. The office only checks who may send what, and keeps the score for whoever comes up later.
// Shared by the server (seats, checks) and the client (the tables, the games).

import { FLOOR } from '../layout.js';

export type TableId = 'kicker' | 'pool' | 'hockey' | 'pingpong';
export const TABLE_IDS: readonly TableId[] = ['kicker', 'pool', 'hockey', 'pingpong'];
export type Side = 0 | 1;

export function isTableId(v: unknown): v is TableId {
  return typeof v === 'string' && (TABLE_IDS as readonly string[]).includes(v);
}

export interface TableDef {
  id: TableId;
  name: string;
  emoji: string;
  /** The middle of the table on the roof, and which way its length runs: along x (0) or along z (π/2). */
  x: number;
  z: number;
  rotY: number;
  /** The playing surface: `length` along u, `width` across (v), `top` high. */
  length: number;
  width: number;
  top: number;
  /** The cabinet round it, for colliders and the model. */
  outerLength: number;
  outerWidth: number;
  /** First to this many wins (pool: pot your group and then the 8). */
  target: number;
  /**
   * Where each side's player stands, in the table's own frame (u along, v across). At the kicker
   * that's the long sides; everywhere else the ends.
   */
  stand: readonly [{ u: number; v: number }, { u: number; v: number }];
}

/**
 * Where the tables stand: pool and the kicker on the open deck west of the dance floor, south of the
 * darts and axes; air hockey and table tennis side by side in the middle of the deck, north of the
 * sun loungers. The way from the elevator to the lounge and the loungers stays clear between them.
 */
export const TABLES: Record<TableId, TableDef> = {
  pool: { id: 'pool', name: 'Pool table', emoji: '🎱', x: -13, z: -4.2, rotY: 0, length: 2.24, width: 1.12, top: 0.8, outerLength: 2.56, outerWidth: 1.44, target: 1, stand: [{ u: -1.6, v: 0 }, { u: 1.6, v: 0 }] },
  kicker: { id: 'kicker', name: 'Kicker', emoji: '⚽', x: -13, z: 0.9, rotY: 0, length: 1.2, width: 0.68, top: 0.78, outerLength: 1.42, outerWidth: 0.78, target: 5, stand: [{ u: 0, v: -0.85 }, { u: 0, v: 0.85 }] },
  hockey: { id: 'hockey', name: 'Air hockey', emoji: '🏒', x: -4.6, z: 5.6, rotY: 0, length: 2.0, width: 1.0, top: 0.8, outerLength: 2.24, outerWidth: 1.2, target: 7, stand: [{ u: -1.4, v: 0 }, { u: 1.4, v: 0 }] },
  pingpong: { id: 'pingpong', name: 'Table tennis', emoji: '🏓', x: 1.6, z: 5.6, rotY: 0, length: 2.74, width: 1.525, top: 0.76, outerLength: 2.74, outerWidth: 1.525, target: 11, stand: [{ u: -2.0, v: 0 }, { u: 2.0, v: 0 }] },
};

// Every table stands on the deck, clear of its edges.
for (const t of Object.values(TABLES)) {
  const r = Math.max(t.outerLength, t.outerWidth) / 2;
  if (t.x - r < FLOOR.minX || t.x + r > FLOOR.maxX || t.z - r < FLOOR.minZ || t.z + r > FLOOR.maxZ) throw new Error(`${t.id} is off the roof`);
}

/** A point on the table (u, v) on the roof (x, z). */
export function tableToWorld(t: TableDef, u: number, v: number): { x: number; z: number } {
  const c = Math.cos(t.rotY);
  const s = Math.sin(t.rotY);
  return { x: t.x + u * c + v * s, z: t.z - u * s + v * c };
}

/** A point on the roof (x, z) on the table (u, v). */
export function worldToTable(t: TableDef, x: number, z: number): { u: number; v: number } {
  const c = Math.cos(t.rotY);
  const s = Math.sin(t.rotY);
  const dx = x - t.x;
  const dz = z - t.z;
  return { u: dx * c - dz * s, v: dx * s + dz * c };
}

/** Where a side's player stands on the roof, facing the middle of the table (a heading: 0 is +z). */
export function standSpot(t: TableDef, side: Side): { x: number; z: number; facing: number } {
  const p = t.stand[side];
  const w = tableToWorld(t, p.u, p.v);
  return { ...w, facing: Math.atan2(t.x - w.x, t.z - w.z) };
}

// ---- What goes over the wire -----------------------------------------------------------------------

/** Someone at a table. */
export interface TablePlayer {
  id: string;
  name: string;
  color: string;
}

/**
 * What the table looks like, as its host sends it: the game's own numbers (see each game's
 * encode), the score, who won (-1: nobody yet) and what happened since the last one (`ev`: a
 * sound or a cheer, three numbers each, see EV).
 */
export interface TableSnap {
  s: number[];
  score: [number, number];
  win: -1 | 0 | 1;
  ev?: number[];
}

/** A table as everyone on the roof sees it: who plays which side, who runs it, the score, and how it looked last. */
export interface TableSeat {
  id: TableId;
  players: [TablePlayer | null, TablePlayer | null];
  /** Whose page plays the game (the first of the two to step up). */
  host: string | null;
  score: [number, number];
  win: -1 | 0 | 1;
  /** Its last snapshot, for someone who just came up. */
  snap?: TableSnap;
}

/** What happened on a table, for its sounds: [kind, u, v] each. */
export const EV = { hit: 1, wall: 2, score: 3, click: 4, pocket: 5, bounce: 6, net: 7, win: 8, kick: 9, serve: 10, foul: 11 } as const;
export type EvKind = (typeof EV)[keyof typeof EV];

/** The most numbers a game's snapshot has (pool's sixteen balls are the most). */
export const SNAP_MAX = 128;
export const INPUT_MAX = 4;

const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** Whether a snapshot from a page is one the office passes on: numbers, not too many, a score. */
export function snapOk(v: unknown): v is TableSnap {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  if (!Array.isArray(o.s) || o.s.length > SNAP_MAX || !o.s.every((x) => finite(x) && Math.abs(x) < 1e4)) return false;
  if (!Array.isArray(o.score) || o.score.length !== 2 || !o.score.every((x) => Number.isInteger(x) && (x as number) >= 0 && (x as number) <= 99)) return false;
  if (o.win !== -1 && o.win !== 0 && o.win !== 1) return false;
  if (o.ev !== undefined && (!Array.isArray(o.ev) || o.ev.length > 60 || o.ev.length % 3 !== 0 || !o.ev.every((x) => finite(x) && Math.abs(x) < 100))) return false;
  return true;
}

/** Only what's in a snapshot, nothing a page tucked in beside it. */
export function cleanSnap(s: TableSnap): TableSnap {
  return { s: [...s.s], score: [s.score[0], s.score[1]], win: s.win, ...(s.ev?.length ? { ev: [...s.ev] } : {}) };
}

/** Whether a move from a page is one the office passes on: a handful of plain numbers. */
export function inputOk(v: unknown): v is number[] {
  return Array.isArray(v) && v.length >= 1 && v.length <= INPUT_MAX && v.every((x) => finite(x) && Math.abs(x) < 100);
}

/** Rounds to a tenth of a millimeter, which is all a snapshot needs. */
export const r4 = (x: number): number => Math.round(x * 1e4) / 1e4;

export const clamp = (x: number, a: number, b: number): number => (x < a ? a : x > b ? b : x);
