import type { ClientMsg, ServerMsg } from '../shared/protocol.js';
import type { CourtId } from '../shared/hall.js';
import { COURT_IDS, cleanPadelSnap, isCourtId, isSlot, padelInputOk, padelSnapOk, teamOf, type PadelPlayer, type PadelSeat, type PadelSnap, type Slot } from '../shared/padel/court.js';
import { Bucket, INPUTS_PER_SEC, SNAPS_PER_SEC } from './tablegames.js';

/*
 * Padel in the padel hall (flrnoh fork, see FORK.md "Padel"; the game is in shared/padel). Like the
 * table games on the roof: the office keeps who's on which court and slot, and the games won, and
 * passes the game along. The host's page (the first person on a court) runs it, the computer players
 * included, and sends snapshots, which go to everyone in the hall; the other people on the court send
 * their moves, which go to the host only. Nobody outside the hall, and nobody off the court, can send
 * either. When the host goes, the next person on the court takes over from the last snapshot; the
 * last one off leaves the court free.
 */

interface Court {
  players: [PadelPlayer | null, PadelPlayer | null, PadelPlayer | null, PadelPlayer | null];
  host: string | null;
  score: [number, number];
  win: -1 | 0 | 1;
  snap?: PadelSnap;
  snaps: Bucket;
  inputs: [Bucket, Bucket, Bucket, Bucket];
}

const fresh = (): Court => ({
  players: [null, null, null, null],
  host: null,
  score: [0, 0],
  win: -1,
  snaps: new Bucket(SNAPS_PER_SEC),
  inputs: [new Bucket(INPUTS_PER_SEC), new Bucket(INPUTS_PER_SEC), new Bucket(INPUTS_PER_SEC), new Bucket(INPUTS_PER_SEC)],
});

export class PadelCourts {
  private courts = new Map<CourtId, Court>(COURT_IDS.map((id) => [id, fresh()]));

  /** Every court as everyone in the hall sees it. */
  state(): PadelSeat[] {
    return COURT_IDS.map((id) => {
      const c = this.courts.get(id)!;
      return { id, players: [...c.players] as PadelSeat['players'], host: c.host, score: [c.score[0], c.score[1]], win: c.win, ...(c.snap ? { snap: c.snap } : {}) };
    });
  }

  /** The court `id` plays on, and which slot, if any. */
  seatOf(id: string): { court: CourtId; slot: Slot } | null {
    for (const [court, c] of this.courts) {
      const slot = c.players.findIndex((p) => p?.id === id);
      if (slot >= 0) return { court, slot: slot as Slot };
    }
    return null;
  }

  /**
   * Puts `p` on a court: on the slot they asked for if the computer has it, else (asking for none)
   * on the team with fewer people. Leaves any other court first; on the same court, a free slot
   * swaps them over. The first one there runs the game (its host). The match on the court goes on:
   * they take a computer player's place.
   */
  join(p: PadelPlayer, court: CourtId, slot?: Slot): { ok: true; slot: Slot; left?: CourtId } | { error: string } {
    const c = this.courts.get(court)!;
    const at = this.seatOf(p.id);
    if (at?.court === court && (slot === undefined || slot === at.slot)) return { ok: true, slot: at.slot };
    const free = ([0, 1, 2, 3] as Slot[]).filter((s) => !c.players[s]);
    if (!free.length) return { error: 'All four places on this court are taken — press E to watch' };
    let s: Slot;
    if (slot !== undefined) {
      if (c.players[slot]) return { error: `${c.players[slot]!.name} has that place — pick another, or watch` };
      s = slot;
    } else {
      const people = (team: number) => c.players.filter((x, i) => x && x.id !== p.id && teamOf(i as Slot) === team).length;
      const team = people(0) <= people(1) ? 0 : 1;
      s = free.find((x) => teamOf(x) === team) ?? free[0];
    }
    const left = at && at.court !== court ? this.leave(p.id) : undefined;
    if (at?.court === court) c.players[at.slot] = null;
    if (!c.players.some(Boolean)) {
      // An empty court: a new match.
      c.score = [0, 0];
      c.win = -1;
      delete c.snap;
    }
    c.players[s] = { id: p.id, name: p.name.slice(0, 32), color: p.color.slice(0, 16) };
    if (!c.host) c.host = p.id;
    return { ok: true, slot: s, ...(left ? { left } : {}) };
  }

  /** `id` steps off their court (or left the hall, or the office): the next person runs it, or it's free again. */
  leave(id: string): CourtId | undefined {
    const at = this.seatOf(id);
    if (!at) return undefined;
    const c = this.courts.get(at.court)!;
    c.players[at.slot] = null;
    const next = c.players.find(Boolean);
    if (!next) this.courts.set(at.court, fresh());
    else if (c.host === id) c.host = next.id;
    return at.court;
  }

  /**
   * A snapshot from `id`'s page: only the court's host sends them, and not too often. It's kept for
   * whoever comes in later (and a new host). Returns whether to pass it on, and whether the games changed.
   */
  sync(id: string, court: unknown, snap: unknown, now: number): { relay: PadelSnap; scored: boolean } | null {
    if (!isCourtId(court) || !padelSnapOk(snap)) return null;
    const c = this.courts.get(court)!;
    if (c.host !== id || !c.snaps.take(now)) return null;
    const clean = cleanPadelSnap(snap);
    const scored = clean.score[0] !== c.score[0] || clean.score[1] !== c.score[1] || clean.win !== c.win;
    c.score = [clean.score[0], clean.score[1]];
    c.win = clean.win;
    c.snap = { s: clean.s, score: clean.score, win: clean.win };
    return { relay: clean, scored };
  }

  /** A move from `id`'s page: only from someone else on the court, not too often. Returns who to pass it to. */
  input(id: string, court: unknown, input: unknown, now: number): { host: string; slot: Slot; input: number[] } | null {
    if (!isCourtId(court) || !padelInputOk(input)) return null;
    const c = this.courts.get(court)!;
    const at = this.seatOf(id);
    if (!at || at.court !== court || !c.host || c.host === id) return null;
    if (!c.inputs[at.slot].take(now)) return null;
    return { host: c.host, slot: at.slot, input: [...input] };
  }
}

export interface PadelHooks {
  /** The sender: their client id, name and color, and whether they're in the hall now. */
  id: string;
  who: string;
  color: string;
  inHall: boolean;
  /** To everyone in the hall (but `except`). */
  toHall(msg: ServerMsg, except?: string, droppable?: boolean): void;
  /** To one client by id. */
  toClient(id: string, msg: ServerMsg): void;
  /** Just to the sender, when it didn't happen. */
  warn(text: string): void;
  now?: number;
}

type PadelMsg = Extract<ClientMsg, { t: 'padel.look' | 'padel.join' | 'padel.leave' | 'padel.input' | 'padel.sync' }>;

/** padel.look, padel.join, padel.leave, padel.input and padel.sync from someone's page. */
export function padelMessage(courts: PadelCourts, msg: PadelMsg, c: PadelHooks) {
  const now = c.now ?? Date.now();
  if (msg.t === 'padel.leave') {
    if (courts.leave(c.id)) c.toHall({ t: 'padel', courts: courts.state() });
    return;
  }
  if (!c.inHall) {
    if (msg.t === 'padel.join') c.warn('The padel courts are in the padel hall');
    return;
  }
  if (msg.t === 'padel.look') return c.toClient(c.id, { t: 'padel', courts: courts.state() });
  if (msg.t === 'padel.join') {
    if (!isCourtId(msg.court)) return;
    const r = courts.join({ id: c.id, name: c.who, color: c.color }, msg.court, isSlot(msg.slot) ? msg.slot : undefined);
    if ('error' in r) {
      c.warn(r.error);
      c.toClient(c.id, { t: 'padel', courts: courts.state() });
      return;
    }
    c.toHall({ t: 'padel', courts: courts.state() });
    return;
  }
  if (msg.t === 'padel.input') {
    const r = courts.input(c.id, msg.court, msg.input, now);
    if (r) c.toClient(r.host, { t: 'padel.input', court: msg.court, slot: r.slot, input: r.input });
    return;
  }
  const r = courts.sync(c.id, msg.court, msg.snap, now);
  if (!r) return;
  c.toHall({ t: 'padel.sync', court: msg.court, snap: r.relay }, c.id, true);
  if (r.scored) c.toHall({ t: 'padel', courts: courts.state() });
}
