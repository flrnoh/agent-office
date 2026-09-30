import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { lapText } from '../shared/racing.js';
import { RIG_GAME, checkRigFrame, checkRigResult, insertScore, type RigFrame, type RigScore, type RigScores, type RigState, type RigView } from '../shared/rig.js';
import type { ClientMsg, ServerMsg } from '../shared/protocol.js';

// The racing rig in the lounge (flrnoh fork, see FORK.md): one driver at a time on each floor, their
// race passed on to everyone else there, and the building's fastest races and laps, kept in the
// office's .agent-office/rig.json.

const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
/** A race goes out to the others on the floor at most this often (ms). */
export const RELAY_EVERY = 80;
/** How much quicker than the office's own clock a race may say it went (ms): the page's clock and the network aren't the office's. */
export const CLOCK_SLACK = 2500;

/** The building's fastest races and laps, saved so they survive a restart. */
export class RigTable {
  private scores: RigScores = { races: [], laps: [] };
  private readonly file: string;

  constructor(dataDir: string) {
    this.file = path.join(dataDir, 'rig.json');
    this.load();
  }

  top(): RigScores {
    return this.scores;
  }

  /** A finished race: its total and its best lap, each on its table if it's quick enough. Where each went (0 for not on it). */
  record(name: string, color: string, laps: number[]): { race: number; lap: number } {
    const at = Date.now();
    const race = insertScore(this.scores.races, { name, color, ms: laps.reduce((a, b) => a + b, 0), at });
    const lap = insertScore(this.scores.laps, { name, color, ms: Math.min(...laps), at });
    if (race.rank || lap.rank) {
      this.scores = { races: race.list, laps: lap.list };
      this.save();
    }
    return { race: race.rank, lap: lap.rank };
  }

  private load() {
    if (!existsSync(this.file)) return;
    try {
      const saved = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<Record<keyof RigScores, unknown>>;
      for (const k of ['races', 'laps'] as const) {
        const list = Array.isArray(saved?.[k]) ? (saved[k] as Partial<RigScore>[]) : [];
        for (const e of list) {
          if (!e || typeof e.name !== 'string' || !e.name || typeof e.ms !== 'number' || !(e.ms > 0) || typeof e.at !== 'number') continue;
          const s: RigScore = { name: e.name.slice(0, 24), color: typeof e.color === 'string' && COLOR_RE.test(e.color) ? e.color : '#4f86f7', ms: Math.round(e.ms), at: e.at };
          this.scores[k] = insertScore(this.scores[k], s).list;
        }
      }
    } catch {
      // a broken file just means fresh tables
    }
  }

  private save() {
    try {
      writeFileSync(this.file, JSON.stringify(this.scores, null, 2), { mode: 0o600 });
    } catch {
      // disk issues shouldn't take the office down
    }
  }
}

/** Someone at the wheel. */
interface Seat {
  id: string;
  name: string;
  color: string;
  frame: RigFrame | null;
  relayedAt: number;
  /** When (the office's clock) this race's lights went green, as the office saw it; null before. */
  greenAt: number | null;
  /** This race's result is in. */
  done: boolean;
}

/** The rigs on every floor: who's at each, and their race. */
export class Rigs {
  private readonly seats = new Map<string, Seat>();

  constructor(readonly table: RigTable) {}

  state(floor: string | undefined): RigState {
    const s = floor ? this.seats.get(floor) : undefined;
    return { driver: s ? { id: s.id, name: s.name, color: s.color } : null, scores: this.table.top() };
  }

  view(floor: string | undefined): RigView {
    return { ...this.state(floor), frame: (floor && this.seats.get(floor)?.frame) || null };
  }

  /** Who's at the wheel on `floor`. */
  driver(floor: string): string | undefined {
    return this.seats.get(floor)?.id;
  }

  /** `who` gets in on `floor`: null if they're in, else the name of whoever's at the wheel already. */
  enter(floor: string, who: { id: string; name: string; color: string }): string | null {
    const s = this.seats.get(floor);
    if (s && s.id !== who.id) return s.name;
    if (!s) this.seats.set(floor, { ...who, color: COLOR_RE.test(who.color) ? who.color : '#ef476f', frame: null, relayedAt: 0, greenAt: null, done: false });
    return null;
  }

  /** Client `id` got out (or left the floor, or the office). The floors they were driving on. */
  leave(id: string): string[] {
    const out: string[] = [];
    for (const [floor, s] of this.seats) {
      if (s.id !== id) continue;
      this.seats.delete(floor);
      out.push(floor);
    }
    return out;
  }

  /** A frame from client `id` on `floor`: the frame to pass on to the others there now, if any. */
  frame(id: string, floor: string, raw: unknown, now = Date.now()): RigFrame | null {
    const s = this.seats.get(floor);
    const f = checkRigFrame(raw);
    if (!s || s.id !== id || !f) return null;
    // The lights counting down again: a new race.
    if (f.phase === 'count') {
      s.greenAt = null;
      s.done = false;
    } else if (s.greenAt === null && f.phase === 'race' && f.laps.length === 0) {
      // Green: as the office sees it, when the page said it went (not before the lights could have).
      s.greenAt = now - Math.max(0, Math.min(f.t, 1000));
    }
    const was = s.frame?.phase;
    s.frame = f;
    // A new phase (the green, the flag) always goes out; otherwise not too often.
    if (now - s.relayedAt < RELAY_EVERY && f.phase === was) return null;
    s.relayedAt = now;
    return f;
  }

  /**
   * Client `id` on `floor` crossed the line: their laps go on the tables if they add up. Each lap no
   * quicker than a lap can be, the lights seen going green this race, and the whole race no quicker
   * than the office's own clock says it could have been.
   */
  finish(id: string, floor: string, raw: unknown, now = Date.now()): { ok: true; name: string; color: string; laps: number[] } | { ok: false; why: string } {
    const s = this.seats.get(floor);
    if (!s || s.id !== id) return { ok: false, why: 'Get in the rig first' };
    const r = checkRigResult(raw);
    if (!r) return { ok: false, why: "🏁 The office couldn't follow that race, so it won't go on the tables" };
    const total = r.laps.reduce((a, b) => a + b, 0);
    if (s.done || s.greenAt === null || now - s.greenAt + CLOCK_SLACK < total) return { ok: false, why: "🏁 The office couldn't follow that race, so it won't go on the tables" };
    s.done = true;
    return { ok: true, name: s.name, color: s.color, laps: r.laps };
  }
}

/** What rigMessage needs from the server. */
export interface RigHooks {
  id: string;
  who: string;
  color: string;
  floor: string | undefined;
  /** To the sender. */
  send(msg: ServerMsg): void;
  /** To everyone else on the sender's floor. */
  toNeighbors(msg: ServerMsg, droppable: boolean): void;
  /** Everyone on the sender's floor hears who's at the wheel now. */
  changed(): void;
  /** Every floor hears the tables changed. */
  tablesChanged(): void;
  toastFloor(text: string): void;
  warn(text: string): void;
}

/** rig.play, rig.leave, rig.frame and rig.finish, from someone's page. */
export function rigMessage(rigs: Rigs, msg: Extract<ClientMsg, { t: 'rig.play' | 'rig.leave' | 'rig.frame' | 'rig.finish' }>, c: RigHooks) {
  const floor = c.floor;
  switch (msg.t) {
    case 'rig.play': {
      if (!floor) return c.warn('Take the elevator to a floor first');
      const busy = rigs.enter(floor, { id: c.id, name: c.who, color: c.color });
      if (busy) {
        c.warn(`${busy} is at the wheel — press E at the rig to watch`);
        return c.send({ t: 'rig', state: rigs.state(floor) });
      }
      return c.changed();
    }
    case 'rig.leave':
      if (rigs.leave(c.id).length) c.changed();
      return;
    case 'rig.frame': {
      if (!floor) return;
      const f = rigs.frame(c.id, floor, msg.frame);
      if (f) c.toNeighbors({ t: 'rig.frame', frame: f }, f.phase === 'race');
      return;
    }
    case 'rig.finish': {
      if (!floor) return;
      const r = rigs.finish(c.id, floor, msg.result);
      if (!r.ok) return c.warn(r.why);
      const { race, lap } = rigs.table.record(r.name, r.color, r.laps);
      if (!race && !lap) return;
      c.tablesChanged();
      const total = r.laps.reduce((a, b) => a + b, 0);
      if (race === 1) c.toastFloor(`🏆 ${r.name} set the ${RIG_GAME} record: ${lapText(total)}`);
      else if (lap === 1) c.toastFloor(`⏱️ ${r.name} set the ${RIG_GAME} lap record: ${lapText(Math.min(...r.laps))}`);
      return;
    }
  }
}
