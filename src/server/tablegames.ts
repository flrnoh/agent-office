import type { ClientMsg, ServerMsg } from '../shared/protocol.js';
import { TABLE_IDS, cleanSnap, inputOk, isTableId, snapOk, type Side, type TableId, type TablePlayer, type TableSeat, type TableSnap } from '../shared/tablegames/tables.js';

/*
 * The table games on the roof (flrnoh fork, see FORK.md; the games are in shared/tablegames). The
 * office keeps who's at which table and the score, and passes the game along: the host's page (the
 * first of the two players) plays it and sends snapshots, which go to everyone on the roof; the other
 * player's page sends its moves, which go to the host only. Nobody else can send either.
 */

/**
 * How many snapshots a host may send a second, and moves a player (a page's own rate is lower), and
 * how many at once after a pause: a little bucket each, so a click right after a move still counts.
 */
export const SNAPS_PER_SEC = 40;
export const INPUTS_PER_SEC = 60;
const BURST = 6;

/** A bucket of `rate` a second, up to BURST: whether there was one to take now. */
export class Bucket {
  private tokens = BURST;
  private at = 0;
  constructor(private readonly rate: number) {}
  take(now: number): boolean {
    this.tokens = Math.min(BURST, this.tokens + ((now - this.at) / 1000) * this.rate);
    this.at = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

interface Table {
  players: [TablePlayer | null, TablePlayer | null];
  host: string | null;
  score: [number, number];
  win: -1 | 0 | 1;
  snap?: TableSnap;
  snaps: Bucket;
  inputs: [Bucket, Bucket];
}

const fresh = (): Table => ({ players: [null, null], host: null, score: [0, 0], win: -1, snaps: new Bucket(SNAPS_PER_SEC), inputs: [new Bucket(INPUTS_PER_SEC), new Bucket(INPUTS_PER_SEC)] });

export class RoofTables {
  private tables = new Map<TableId, Table>(TABLE_IDS.map((id) => [id, fresh()]));

  /** Every table as everyone on the roof sees it. */
  state(): TableSeat[] {
    return TABLE_IDS.map((id) => {
      const t = this.tables.get(id)!;
      return { id, players: [t.players[0], t.players[1]], host: t.host, score: [t.score[0], t.score[1]], win: t.win, ...(t.snap ? { snap: t.snap } : {}) };
    });
  }

  /** The table `id` plays at, and which side, if any. */
  seatOf(id: string): { table: TableId; side: Side } | null {
    for (const [table, t] of this.tables) {
      if (t.players[0]?.id === id) return { table, side: 0 };
      if (t.players[1]?.id === id) return { table, side: 1 };
    }
    return null;
  }

  /**
   * Steps `p` up to a table, on the side they asked for if it's free, else the other one. Leaves any
   * other table first. The first one there runs the game (its host).
   */
  join(p: TablePlayer, table: TableId, side?: Side): { ok: true; side: Side; left?: TableId } | { error: string } {
    const t = this.tables.get(table)!;
    const at = this.seatOf(p.id);
    if (at?.table === table) return { ok: true, side: at.side };
    const free = ([0, 1] as Side[]).filter((s) => !t.players[s]);
    if (!free.length) return { error: `${t.players[0]!.name} and ${t.players[1]!.name} are playing — press E to watch` };
    const s = side !== undefined && free.includes(side) ? side : free[0];
    const left = at ? this.leave(p.id) : undefined;
    t.players[s] = { id: p.id, name: p.name.slice(0, 32), color: p.color.slice(0, 16) };
    if (!t.host) t.host = p.id;
    // Somebody new at the table: a new game (the host's page starts it).
    t.score = [0, 0];
    t.win = -1;
    delete t.snap;
    return { ok: true, side: s, ...(left ? { left } : {}) };
  }

  /** `id` steps back from their table (or went away): the other player runs it now, or it's free again. */
  leave(id: string): TableId | undefined {
    const at = this.seatOf(id);
    if (!at) return undefined;
    const t = this.tables.get(at.table)!;
    t.players[at.side] = null;
    const other = t.players[at.side === 0 ? 1 : 0];
    if (!other) this.tables.set(at.table, fresh());
    else {
      if (t.host === id) t.host = other.id;
      t.score = [0, 0];
      t.win = -1;
      delete t.snap;
    }
    return at.table;
  }

  /**
   * A snapshot from `id`'s page: only the table's host sends them, and not too often. It's kept for
   * whoever comes up later. Returns whether to pass it on, and whether the score changed.
   */
  sync(id: string, table: unknown, snap: unknown, now: number): { relay: TableSnap; scored: boolean } | null {
    if (!isTableId(table) || !snapOk(snap)) return null;
    const t = this.tables.get(table)!;
    if (t.host !== id || !t.snaps.take(now)) return null;
    const clean = cleanSnap(snap);
    const scored = clean.score[0] !== t.score[0] || clean.score[1] !== t.score[1] || clean.win !== t.win;
    t.score = [clean.score[0], clean.score[1]];
    t.win = clean.win;
    // Kept without what just happened: that was news only once.
    t.snap = { s: clean.s, score: clean.score, win: clean.win };
    return { relay: clean, scored };
  }

  /** A move from `id`'s page: only from the table's other player, not too often. Returns who to pass it to. */
  input(id: string, table: unknown, input: unknown, now: number): { host: string; side: Side; input: number[] } | null {
    if (!isTableId(table) || !inputOk(input)) return null;
    const t = this.tables.get(table)!;
    const at = this.seatOf(id);
    if (!at || at.table !== table || !t.host || t.host === id) return null;
    if (!t.inputs[at.side].take(now)) return null;
    return { host: t.host, side: at.side, input: [...input] };
  }
}

export interface TableHooks {
  /** The sender: their client id, name and color, and whether they're on the roof now. */
  id: string;
  who: string;
  color: string;
  onRoof: boolean;
  /** To everyone on the roof (but `except`). */
  toRoof(msg: ServerMsg, except?: string, droppable?: boolean): void;
  /** To one client by id. */
  toClient(id: string, msg: ServerMsg): void;
  /** Just to the sender, when it didn't happen. */
  warn(text: string): void;
  now?: number;
}

type TableMsg = Extract<ClientMsg, { t: 'table.join' | 'table.leave' | 'table.input' | 'table.sync' }>;

/** table.join, table.leave, table.input and table.sync from someone's page. */
export function tableMessage(tables: RoofTables, msg: TableMsg, c: TableHooks) {
  const now = c.now ?? Date.now();
  if (msg.t === 'table.leave') {
    if (tables.leave(c.id)) c.toRoof({ t: 'tables', tables: tables.state() });
    return;
  }
  if (!c.onRoof) {
    if (msg.t === 'table.join') c.warn('The tables are up on the roof');
    return;
  }
  if (msg.t === 'table.join') {
    if (!isTableId(msg.table)) return;
    const side = msg.side === 0 || msg.side === 1 ? msg.side : undefined;
    const r = tables.join({ id: c.id, name: c.who, color: c.color }, msg.table, side);
    if ('error' in r) {
      c.warn(r.error);
      c.toClient(c.id, { t: 'tables', tables: tables.state() });
      return;
    }
    c.toRoof({ t: 'tables', tables: tables.state() });
    return;
  }
  if (msg.t === 'table.input') {
    const r = tables.input(c.id, msg.table, msg.input, now);
    if (r) c.toClient(r.host, { t: 'table.input', table: msg.table, side: r.side, input: r.input });
    return;
  }
  const r = tables.sync(c.id, msg.table, msg.snap, now);
  if (!r) return;
  c.toRoof({ t: 'table.sync', table: msg.table, snap: r.relay }, c.id, true);
  if (r.scored) c.toRoof({ t: 'tables', tables: tables.state() });
}
