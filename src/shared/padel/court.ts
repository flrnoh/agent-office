// Padel in the padel hall (flrnoh fork, see FORK.md "Padel"): the court's shape as the game sees it,
// the slots on it, and what goes over the wire. Shared by the server (seats, checks), the client (the
// courts in 3D, the game) and the tests.
//
// A court's own frame: x across (-5..5), z along (-10..10), y up from its floor, the net at z = 0.
// Team 0 plays the south half (z > 0) and hits toward -z; team 1 the north half. Each team has two
// slots: slot 0/1 are team 0's right and left player (as they face the net), slot 2/3 team 1's.
// Whoever isn't a person is the computer, so a court always plays two against two.

import { COURT, COURTS, type CourtId } from '../hall.js';
import { SNAP_MAX as TABLE_SNAP_MAX, clamp } from '../tablegames/tables.js';

export type Team = 0 | 1;
export type Slot = 0 | 1 | 2 | 3;
export const SLOTS: readonly Slot[] = [0, 1, 2, 3];

export const HALF_W = COURT.width / 2;
export const HALF_L = COURT.length / 2;
/** The service line, this far from the net on each side. */
export const SERVICE = 6.95;
export const BALL_R = 0.033;
/** Side glass runs this far out from each back wall (|z| ≥ SIDE_GLASS_FROM); the rest of the side is fence. */
export const SIDE_GLASS_FROM = HALF_L - COURT.sideGlass;
/** Glass is this high (back walls and the side glass); the wire fence on top of it reaches COURT.fence. */
export const GLASS_H = COURT.backWall;
export const FENCE_TOP = COURT.fence;
/** The side fence between the two glass ends is lower. */
export const SIDE_FENCE_H = 3;
/** The way onto the court: an opening in each side fence on either side of the net, |z| from..to, all the way up. */
export const DOOR = { from: 0.35, to: 1.55 } as const;

export const teamOf = (slot: Slot): Team => (slot < 2 ? 0 : 1);
/** Which way a team hits: team 0 toward -z. */
export const fwd = (team: Team): number => (team === 0 ? -1 : 1);
/** The half a z is on. */
export const halfOf = (z: number): Team => (z >= 0 ? 0 : 1);
/**
 * Which side of the court (x sign) a slot's home is: slot 0/2 the right as that team faces the net,
 * 1/3 the left. Team 0 faces -z, so its right is +x; team 1 faces +z, its right is -x.
 */
export const homeSign = (slot: Slot): number => ((slot & 1) === 0 ? 1 : -1) * (teamOf(slot) === 0 ? 1 : -1);

/** The net's top at x: 0.88 m in the middle, 0.92 m at the posts. */
export function netHeight(x: number): number {
  const k = clamp(Math.abs(x) / HALF_W, 0, 1);
  return COURT.netHeight + (COURT.netHeightPosts - COURT.netHeight) * k * k;
}

/** What's at the court's edge where a ball meets it: glass (bounces), fence (dead), open (it leaves), none (not at an edge). */
export type Edge = 'glass' | 'fence' | 'open';

/** What a ball at height y meets at the back wall (|z| = HALF_L). */
export function backEdge(y: number): Edge {
  return y < GLASS_H ? 'glass' : y < FENCE_TOP ? 'fence' : 'open';
}

/** What a ball at height y meets at a side (|x| = HALF_W) at z. */
export function sideEdge(z: number, y: number): Edge {
  const az = Math.abs(z);
  if (az >= SIDE_GLASS_FROM) return y < GLASS_H ? 'glass' : y < FENCE_TOP ? 'fence' : 'open';
  if (az > DOOR.from && az < DOOR.to) return 'open';
  return y < SIDE_FENCE_H ? 'fence' : 'open';
}

/** Where a court's frame is in the hall. */
export function courtDef(id: CourtId) {
  return COURTS.find((c) => c.id === id)!;
}
export function isCourtId(v: unknown): v is CourtId {
  return typeof v === 'string' && COURTS.some((c) => c.id === v);
}
export const COURT_IDS: readonly CourtId[] = COURTS.map((c) => c.id);

/** A point in a court's frame in the hall's coordinates, and back. */
export function courtToHall(id: CourtId, x: number, z: number): { x: number; z: number } {
  const c = courtDef(id);
  return { x: c.x + x, z: c.z + z };
}
export function hallToCourt(id: CourtId, x: number, z: number): { x: number; z: number } {
  const c = courtDef(id);
  return { x: x - c.x, z: z - c.z };
}

// ---- What goes over the wire -------------------------------------------------------------------

/** Someone on a court. */
export interface PadelPlayer {
  id: string;
  name: string;
  color: string;
}

/**
 * What a court looks like, as its host sends it: the game's numbers (see game.ts encode), the games
 * won, who won the match (-1: nobody yet), and what happened since the last one (`ev`, three
 * numbers each: kind, x, z in the court's frame, see PEV).
 */
export interface PadelSnap {
  s: number[];
  score: [number, number];
  win: -1 | 0 | 1;
  ev?: number[];
}

/** A court as everyone in the hall sees it: who's on which slot (null: the computer), whose page runs it, the games, the last snapshot. */
export interface PadelSeat {
  id: CourtId;
  players: [PadelPlayer | null, PadelPlayer | null, PadelPlayer | null, PadelPlayer | null];
  host: string | null;
  score: [number, number];
  win: -1 | 0 | 1;
  snap?: PadelSnap;
}

/** What happened on a court, for its sounds and news: [kind, x, z] each. */
export const PEV = { hit: 1, glass: 2, point: 3, fence: 4, bounce: 6, net: 7, win: 8, serve: 10, fault: 11, game: 12, smash: 13, out: 14 } as const;

export const PADEL_SNAP_MAX = Math.max(TABLE_SNAP_MAX, 96);
export const PADEL_INPUT_MAX = 4;

const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** Whether a snapshot from a page is one the office passes on: numbers, not too many, a score. */
export function padelSnapOk(v: unknown): v is PadelSnap {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  if (!Array.isArray(o.s) || o.s.length > PADEL_SNAP_MAX || !o.s.every((x) => finite(x) && Math.abs(x) < 1e4)) return false;
  if (!Array.isArray(o.score) || o.score.length !== 2 || !o.score.every((x) => Number.isInteger(x) && (x as number) >= 0 && (x as number) <= 99)) return false;
  if (o.win !== -1 && o.win !== 0 && o.win !== 1) return false;
  if (o.ev !== undefined && (!Array.isArray(o.ev) || o.ev.length > 60 || o.ev.length % 3 !== 0 || !o.ev.every((x) => finite(x) && Math.abs(x) < 100))) return false;
  return true;
}

/** Only what's in a snapshot, nothing a page tucked in beside it. */
export function cleanPadelSnap(s: PadelSnap): PadelSnap {
  return { s: [...s.s], score: [s.score[0], s.score[1]], win: s.win, ...(s.ev?.length ? { ev: [...s.ev] } : {}) };
}

/** Whether a move from a page is one the office passes on: a handful of plain numbers. */
export function padelInputOk(v: unknown): v is number[] {
  return Array.isArray(v) && v.length >= 1 && v.length <= PADEL_INPUT_MAX && v.every((x) => finite(x) && Math.abs(x) < 100);
}

export function isSlot(v: unknown): v is Slot {
  return v === 0 || v === 1 || v === 2 || v === 3;
}

/**
 * The messages: into the hall a page asks how the courts are (`padel.look`); E at a court puts you on
 * a slot (`padel.join`, the computer's place: any slot a person hasn't got) and ✕ takes you off
 * (`padel.leave`); the host's page sends snapshots (`padel.sync`), the others their moves (`padel.input`).
 */
export type PadelClientMsg =
  | { t: 'padel.look' }
  | { t: 'padel.join'; court: CourtId; slot?: Slot }
  | { t: 'padel.leave' }
  | { t: 'padel.input'; court: CourtId; input: number[] }
  | { t: 'padel.sync'; court: CourtId; snap: PadelSnap };

/** Who's on the courts (to everyone in the hall), a court's snapshot, and a move for its host. */
export type PadelServerMsg =
  | { t: 'padel'; courts: PadelSeat[] }
  | { t: 'padel.sync'; court: CourtId; snap: PadelSnap }
  | { t: 'padel.input'; court: CourtId; slot: Slot; input: number[] };
