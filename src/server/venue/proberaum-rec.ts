import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { BPM_MAX, BPM_MIN, COUNT_IN_BEATS, LOOP_MAX_MS, PLAY_LEAD_MS, TAKES_KEPT, TAKE_MS_MAX, TAKE_NAME_MAX, TAKE_NOTES_MAX, cleanText, isRoomId, roomName, spotOf, takeEv, type PlayingView, type RecView, type Take, type TakeEv, type TakeMeta } from '../../shared/proberaum.js';
import type { RehearsalRoomId } from '../../shared/venue.js';

/*
 * The rehearsal wing's recorders (flrnoh fork, see FORK.md "The rehearsal wing"): one per room (the
 * studio's desk, the little one on each rehearsal room's mixer). A take is every note the room's
 * instruments play between start and stop (the office hears them as it sends them out, see
 * ws/handlers/proberaum.ts), with when; played back, every page in the room sounds them at their
 * spots from the same moment. Over a take: it plays along and ends up in the new one. Each room keeps
 * its last TAKES_KEPT, in the office's data folder as proberaum-takes.json (0600).
 */

/** Who's doing it. */
export interface RecPerson {
  id: string;
  owner: string;
  name: string;
}

interface Recording extends RecView {
  owner: string;
  evs: TakeEv[];
  /** The take recorded over: its notes go into the new one. */
  base: Take | null;
}

interface StoredTake extends Take {
  /** Who made it (owner key): only they rename or delete it. */
  owner: string;
}

const meta = (t: StoredTake): TakeMeta => ({ id: t.id, room: t.room, name: t.name, by: t.by, at: t.at, dur: t.dur, notes: t.notes, kinds: t.kinds });
const kindsOf = (evs: readonly TakeEv[]) => [...new Set(evs.map((e) => spotOf(e[1])?.kind).filter((k): k is NonNullable<typeof k> => !!k))].sort();

export class Recorders {
  private takes: StoredTake[] = [];
  private recs = new Map<RehearsalRoomId, Recording>();
  private playing = new Map<RehearsalRoomId, PlayingView & { dur: number }>();
  /** Each room's takes counted, for the next one's name. */
  private counts = new Map<RehearsalRoomId, number>();
  private seq = 0;
  private file: string | null;

  constructor(dataDir?: string) {
    this.file = dataDir ? path.join(dataDir, 'proberaum-takes.json') : null;
    this.load();
  }

  rec(room: RehearsalRoomId): RecView | null {
    const r = this.recs.get(room);
    return r ? { by: r.by, byId: r.byId, startAt: r.startAt, bpm: r.bpm, click: r.click, countIn: r.countIn, over: r.over } : null;
  }
  recording(room: RehearsalRoomId): boolean {
    return this.recs.has(room);
  }
  play(room: RehearsalRoomId): PlayingView | null {
    const p = this.playing.get(room);
    return p ? { take: p.take, startAt: p.startAt, loop: p.loop, by: p.by } : null;
  }
  list(): TakeMeta[] {
    return this.takes.map(meta);
  }
  take(id: string): Take | null {
    const t = this.takes.find((x) => x.id === id);
    if (!t) return null;
    return { ...meta(t), evs: t.evs };
  }
  /** The takes `owner` made. */
  mine(owner: string): string[] {
    return this.takes.filter((t) => t.owner === owner).map((t) => t.id);
  }

  /** Start a take in `room` at `now`: after a count-in if asked. Over take `over` (it plays along from the start). */
  start(room: RehearsalRoomId, p: RecPerson, opts: { bpm: unknown; click: unknown; countIn: unknown; over?: unknown }, now: number): string | { startAt: number; over: Take | null } {
    if (this.recs.has(room)) return `🔴 ${roomName(room)} nimmt schon auf (${this.recs.get(room)!.by})`;
    const bpm = typeof opts.bpm === 'number' && Number.isFinite(opts.bpm) ? Math.round(Math.min(BPM_MAX, Math.max(BPM_MIN, opts.bpm))) : 100;
    const countIn = opts.countIn === true;
    let base: StoredTake | null = null;
    if (typeof opts.over === 'string' && opts.over) {
      base = this.takes.find((t) => t.id === opts.over && t.room === room) ?? null;
      if (!base) return '🎚️ Die Aufnahme gibt es hier nicht (mehr)';
    }
    const startAt = now + 300 + (countIn ? Math.round((COUNT_IN_BEATS * 60_000) / bpm) : 0);
    this.recs.set(room, { by: p.name, byId: p.id, owner: p.owner, startAt, bpm, click: opts.click === true, countIn, over: base?.id ?? null, evs: [], base: base ? { ...meta(base), evs: base.evs } : null });
    if (base) this.playing.set(room, { take: base.id, startAt, loop: false, by: p.name, dur: base.dur });
    else this.playing.delete(room);
    return { startAt, over: base ? { ...meta(base), evs: base.evs } : null };
  }

  /** A note heard at `spot` at `now`: into the take if its room is recording (and it's past the count-in). Whether it went in. */
  heard(spot: unknown, note: unknown, now: number): boolean {
    const s = typeof spot === 'string' ? spotOf(spot) : undefined;
    if (!s || !isRoomId(s.room)) return false;
    const r = this.recs.get(s.room);
    if (!r || now < r.startAt - 150 || r.evs.length >= TAKE_NOTES_MAX) return false;
    const ev = takeEv(s.room, Math.max(0, now - r.startAt), spot, note);
    if (!ev) return false;
    r.evs.push(ev);
    return true;
  }

  /**
   * Stop `room`'s take at `now`: kept as a take (its notes and the one it was over), named `name`
   * or "<band> – Take n", or thrown away. The kept take, or null.
   */
  stop(room: RehearsalRoomId, keep: boolean, name: unknown, band: string | null, now: number): Take | null {
    const r = this.recs.get(room);
    if (!r) return null;
    this.recs.delete(room);
    if (r.over && this.playing.get(room)?.take === r.over) this.playing.delete(room);
    const played = Math.min(TAKE_MS_MAX, Math.max(0, now - r.startAt));
    const evs = [...(r.base?.evs ?? []), ...r.evs].sort((a, b) => a[0] - b[0]).slice(0, TAKE_NOTES_MAX);
    if (!keep || !r.evs.length) return null;
    const n = (this.counts.get(room) ?? 0) + 1;
    this.counts.set(room, n);
    const last = evs.length ? evs[evs.length - 1][0] : 0;
    const dur = Math.max(played, r.base?.dur ?? 0, last + 400);
    const take: StoredTake = {
      id: `${room}-${now.toString(36)}-${(this.seq++).toString(36)}`,
      room,
      name: cleanText(name, TAKE_NAME_MAX) || `${band ?? roomName(room)} – Take ${n}`,
      by: r.by,
      owner: r.owner,
      at: now,
      dur: Math.min(TAKE_MS_MAX, dur),
      notes: evs.length,
      kinds: kindsOf(evs),
      evs,
    };
    this.takes.push(take);
    // Each room keeps its last few.
    const here = this.takes.filter((t) => t.room === room);
    if (here.length > TAKES_KEPT) {
      const drop = new Set(here.slice(0, here.length - TAKES_KEPT).map((t) => t.id));
      this.takes = this.takes.filter((t) => !drop.has(t.id));
    }
    this.save();
    return { ...meta(take), evs: take.evs };
  }

  /** Play take `id` back in `room` from a moment from `now`, for everyone in there. */
  startPlaying(room: RehearsalRoomId, id: unknown, loop: boolean, by: string, now: number): string | { take: Take; startAt: number } {
    if (this.recs.has(room)) return '🔴 Erst die Aufnahme stoppen';
    const t = this.takes.find((x) => x.id === id);
    if (!t || t.room !== room) return '🎚️ Die Aufnahme gibt es hier nicht (mehr)';
    const startAt = now + PLAY_LEAD_MS;
    this.playing.set(room, { take: t.id, startAt, loop, by, dur: t.dur });
    return { take: { ...meta(t), evs: t.evs }, startAt };
  }

  halt(room: RehearsalRoomId): boolean {
    return this.playing.delete(room);
  }

  /** Rename (`name`) or delete a take of `owner`'s. A warning, or the room whose playback stopped (or true). */
  edit(id: unknown, owner: string, change: { name?: unknown; del?: unknown }): string | { stopped: RehearsalRoomId | null } {
    const t = this.takes.find((x) => x.id === id);
    if (!t) return '🎚️ Die Aufnahme gibt es nicht (mehr)';
    if (t.owner !== owner) return '🎚️ Nur wer sie aufgenommen hat, darf sie umbenennen oder löschen';
    if (change.del === true) {
      this.takes = this.takes.filter((x) => x !== t);
      const stopped = this.playing.get(t.room)?.take === t.id ? t.room : null;
      if (stopped) this.playing.delete(stopped);
      for (const r of this.recs.values()) if (r.over === t.id) r.over = null;
      this.save();
      return { stopped };
    }
    const name = cleanText(change.name, TAKE_NAME_MAX);
    if (!name) return '🎚️ Wie soll sie heißen?';
    t.name = name;
    this.save();
    return { stopped: null };
  }

  /**
   * Every second: takes that have run their length stop, a loop after LOOP_MAX_MS; a take at its
   * longest stops and is kept; one whose room `empty` says has nobody in it is kept too. What changed.
   */
  tick(now: number, empty: (room: RehearsalRoomId) => boolean, band: (room: RehearsalRoomId) => string | null): { changed: boolean; ended: RehearsalRoomId[]; kept: Take[] } {
    const ended: RehearsalRoomId[] = [];
    const kept: Take[] = [];
    for (const [room, p] of this.playing) {
      const over = p.loop ? now - p.startAt > LOOP_MAX_MS : now - p.startAt > p.dur + 500;
      if (over || (p.loop && empty(room))) {
        this.playing.delete(room);
        ended.push(room);
      }
    }
    for (const [room, r] of this.recs) {
      if (now - r.startAt >= TAKE_MS_MAX || r.evs.length >= TAKE_NOTES_MAX || (now > r.startAt && empty(room))) {
        const t = this.stop(room, true, '', band(room), now);
        if (t) kept.push(t);
        else ended.push(room);
      }
    }
    return { changed: ended.length > 0 || kept.length > 0, ended, kept };
  }

  private load() {
    if (!this.file || !existsSync(this.file)) return;
    try {
      const saved = JSON.parse(readFileSync(this.file, 'utf8')) as { takes?: unknown; counts?: unknown };
      for (const v of Array.isArray(saved?.takes) ? saved.takes : []) {
        const t = v as Partial<StoredTake>;
        if (!t || typeof t.id !== 'string' || !isRoomId(t.room) || typeof t.owner !== 'string' || !Array.isArray(t.evs)) continue;
        const evs = (t.evs as unknown[])
          .map((e) => (Array.isArray(e) ? takeEv(t.room!, Number(e[0]), e[1], { kind: spotOf(String(e[1]))?.kind, pitch: e[2], vel: e[3], len: e[4] }) : null))
          .filter((e): e is TakeEv => !!e)
          .slice(0, TAKE_NOTES_MAX);
        this.takes.push({
          id: t.id.slice(0, 60),
          room: t.room,
          name: cleanText(t.name, TAKE_NAME_MAX) || roomName(t.room),
          by: cleanText(t.by, 40),
          owner: t.owner.slice(0, 200),
          at: Number(t.at) || 0,
          dur: Math.min(TAKE_MS_MAX, Math.max(0, Number(t.dur) || 0)),
          notes: evs.length,
          kinds: kindsOf(evs),
          evs,
        });
      }
      for (const [room, n] of Object.entries((saved?.counts ?? {}) as Record<string, unknown>)) if (isRoomId(room) && typeof n === 'number') this.counts.set(room, Math.max(0, Math.floor(n)));
    } catch {
      // a broken file: the takes start over
    }
  }

  private save() {
    if (!this.file) return;
    try {
      const tmp = `${this.file}.tmp`;
      writeFileSync(tmp, JSON.stringify({ takes: this.takes, counts: Object.fromEntries(this.counts) }), { mode: 0o600 });
      renameSync(tmp, this.file);
    } catch {
      // can't write: kept in memory till the next try
    }
  }
}
