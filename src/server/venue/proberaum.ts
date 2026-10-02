import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  ABANDON_MS,
  BAND_MAX,
  BAND_NAME_MAX,
  BOOK_MINUTES,
  KNOCK_MS,
  PINS_EACH,
  PINS_KEPT,
  PIN_COLORS,
  PIN_MAX,
  POLAROIDS_KEPT,
  SETLIST_LINES,
  SETLIST_MAX,
  cleanText,
  isRoomId,
  roomName,
  type BookingView,
  type PinView,
  type Polaroid,
  type ProbeView,
  type ProbeYou,
  type ProberaumClientMsg,
  type ProberaumServerMsg,
  type RoomView,
} from '../../shared/proberaum.js';
import { DOOR_REACH, doorOf, roomById } from '../../shared/proberaum-layout.js';
import { REHEARSAL_ROOMS, venueRoomAt, type RehearsalRoomId } from '../../shared/venue.js';
import { Recorders, type RecPerson } from './proberaum-rec.js';

/*
 * The rehearsal wing on the office's side (flrnoh fork, see FORK.md "The rehearsal wing"): who booked
 * which room till when and who's in their band, the doors (open or shut, who may open them), knocks,
 * the setlists on the whiteboards, the Schwarzes Brett, the polaroid wall, the tip jar, and the rooms'
 * recorders (proberaum-rec.ts). Everyone in the Schallwerk may use it, guests and party guests too:
 * one booking each, two hours at most. Kept in the office's data folder as proberaum.json (0600).
 */

/** Someone in the Schallwerk, and where they stand (interior coordinates). */
export interface ProbePresent extends RecPerson {
  x: number;
  z: number;
}

export interface ProberaumDeps {
  now(): number;
  /** Everyone in the Schallwerk right now. */
  present(): ProbePresent[];
  send(id: string, m: ProberaumServerMsg): void;
  dataDir?: string;
}

interface Member {
  owner: string;
  name: string;
}

interface Booking {
  owner: string;
  name: string;
  band: string;
  since: number;
  until: number;
  members: Member[];
  /** The last time any of the band was in the Schallwerk. */
  seenAt: number;
}

interface Pin extends PinView {
  owner: string;
}

const MINUTES: readonly number[] = BOOK_MINUTES;
/** Knocking, tipping, pinning: at most so often (ms). */
const KNOCK_EVERY = 1500;
const TIP_EVERY = 2000;
const PIN_EVERY = 8000;

export class Proberaum {
  private bookings = new Map<RehearsalRoomId, Booking>();
  private doors = new Map<RehearsalRoomId, boolean>();
  private knocks = new Map<RehearsalRoomId, { id: string; owner: string; name: string; at: number }[]>();
  private setlists = new Map<RehearsalRoomId, { text: string; by: string }>();
  private pins: Pin[] = [];
  private polaroids: Polaroid[] = [];
  private tips = 0;
  private last = new Map<string, number>();
  private seq = 0;
  readonly recorders: Recorders;
  private file: string | null;

  constructor(private readonly d: ProberaumDeps) {
    this.file = d.dataDir ? path.join(d.dataDir, 'proberaum.json') : null;
    this.recorders = new Recorders(d.dataDir);
    this.load();
  }

  // ---- What someone sent -------------------------------------------------------------------------

  /** A message from `p` (someone in the Schallwerk): a warning for them, or nothing. */
  message(p: RecPerson, msg: ProberaumClientMsg): string | void {
    const now = this.d.now();
    const me = this.d.present().find((x) => x.id === p.id);
    if (!me) return;
    const room = 'room' in msg ? msg.room : null;
    if (room !== null && !isRoomId(room)) return;
    switch (msg.t) {
      case 'probe.look':
        this.d.send(p.id, this.viewFor(p.owner, now));
        for (const r of REHEARSAL_ROOMS) {
          const play = this.recorders.play(r.id);
          const take = play && this.recorders.take(play.take);
          if (play && take) this.d.send(p.id, { t: 'probe.playing', room: r.id, take, startAt: play.startAt, loop: play.loop });
        }
        return;
      case 'probe.book':
        return this.book(me, msg.room, msg.minutes, msg.band, now);
      case 'probe.release': {
        const b = this.booking(msg.room, now);
        if (!b) return;
        if (b.owner !== p.owner) return `🎸 Nur ${b.name} kann ${roomName(msg.room)} freigeben`;
        this.free(msg.room);
        return this.changed();
      }
      case 'probe.band': {
        const mine = [...this.bookings.entries()].find(([r, b]) => b.owner === p.owner && this.booking(r, now));
        const name = cleanText(msg.name, BAND_NAME_MAX);
        if (!mine || !name) return;
        mine[1].band = name;
        return this.changed();
      }
      case 'probe.member':
        return this.member(me, msg.room, msg.id, msg.add, now);
      case 'probe.door':
        return this.door(me, msg.room, msg.open === true, now);
      case 'probe.knock':
        return this.knock(me, msg.room, now);
      case 'probe.letin':
        return this.letIn(me, msg.room, msg.id, now);
      case 'probe.setlist': {
        const why = this.mayUse(me, msg.room, now, '📝 Die Setlist schreibt die Band, die gebucht hat');
        if (why) return why;
        this.setlists.set(msg.room, { text: cleanText(msg.text, SETLIST_MAX, SETLIST_LINES), by: p.name });
        return this.changed();
      }
      case 'probe.rec': {
        const why = this.mayUse(me, msg.room, now, '🎚️ Aufnehmen darf hier nur die Band, die gebucht hat');
        if (why) return why;
        const res = this.recorders.start(msg.room, p, msg, now);
        if (typeof res === 'string') return res;
        if (res.over) this.toAll({ t: 'probe.playing', room: msg.room, take: res.over, startAt: res.startAt, loop: false });
        return this.changed();
      }
      case 'probe.recstop': {
        const rec = this.recorders.rec(msg.room);
        if (!rec) return;
        if (rec.byId !== p.id) {
          const why = this.mayUse(me, msg.room, now, '🎚️ Die Aufnahme stoppt, wer sie gestartet hat, oder die Band');
          if (why) return why;
        }
        const over = rec.over;
        this.recorders.stop(msg.room, msg.keep === true, msg.name, this.booking(msg.room, now)?.band ?? null, now);
        if (over) this.toAll({ t: 'probe.playing', room: msg.room, take: null, startAt: 0, loop: false });
        return this.changed();
      }
      case 'probe.play': {
        const why = this.mayUse(me, msg.room, now, '🎚️ Abspielen darf hier nur die Band, die gebucht hat');
        if (why) return why;
        const res = this.recorders.startPlaying(msg.room, msg.take, msg.loop === true, p.name, now);
        if (typeof res === 'string') return res;
        this.toAll({ t: 'probe.playing', room: msg.room, take: res.take, startAt: res.startAt, loop: msg.loop === true });
        return this.changed();
      }
      case 'probe.halt': {
        const why = this.mayUse(me, msg.room, now, '🎚️ Das stoppt hier nur die Band, die gebucht hat');
        if (why) return why;
        if (!this.recorders.halt(msg.room)) return;
        this.toAll({ t: 'probe.playing', room: msg.room, take: null, startAt: 0, loop: false });
        return this.changed();
      }
      case 'probe.take': {
        const res = this.recorders.edit(msg.take, p.owner, msg);
        if (typeof res === 'string') return res;
        if (res.stopped) this.toAll({ t: 'probe.playing', room: res.stopped, take: null, startAt: 0, loop: false });
        return this.changed();
      }
      case 'probe.pin':
        return this.pin(p, msg.text, msg.color, now);
      case 'probe.unpin': {
        const n = this.pins.length;
        this.pins = this.pins.filter((x) => !(x.id === msg.id && x.owner === p.owner));
        if (this.pins.length === n) return;
        return this.changed();
      }
      case 'probe.tip': {
        if (!this.every(`tip:${p.id}`, TIP_EVERY, now)) return;
        this.tips += 1 + (this.seq++ % 3 === 0 ? 1 : 0);
        this.save();
        this.toAll({ t: 'probe.tipped', name: p.name, tips: this.tips });
        return;
      }
    }
  }

  /** A note one of the instruments sent out (`instr.note`): into its room's take, if it's recording. */
  heard(spot: unknown, note: unknown) {
    this.recorders.heard(spot, note, this.d.now());
  }

  /** `id` left the Schallwerk or the office: their knocks go. Bookings, bands and takes stay. */
  leave(id: string) {
    let any = false;
    for (const [room, list] of this.knocks) {
      const kept = list.filter((k) => k.id !== id);
      if (kept.length !== list.length) {
        this.knocks.set(room, kept);
        any = true;
      }
    }
    if (any) this.changed();
  }

  /** Every second: bookings run out (or are let go of with nobody of the band about), knocks go stale, the recorders. */
  tick() {
    const now = this.d.now();
    const present = this.d.present();
    const owners = new Set(present.map((p) => p.owner));
    let changed = false;
    for (const [room, b] of this.bookings) {
      if (b.members.some((m) => owners.has(m.owner))) b.seenAt = now;
      if (b.until <= now || now - b.seenAt > ABANDON_MS) {
        this.free(room);
        changed = true;
      }
    }
    for (const [room, list] of this.knocks) {
      const kept = list.filter((k) => now - k.at < KNOCK_MS);
      if (kept.length !== list.length) {
        this.knocks.set(room, kept);
        changed = true;
      }
    }
    const empty = (room: RehearsalRoomId) => !present.some((p) => venueRoomAt(p.x, p.z) === room);
    const rec = this.recorders.tick(now, empty, (room) => this.booking(room, now)?.band ?? null);
    for (const room of rec.ended) this.toAll({ t: 'probe.playing', room, take: null, startAt: 0, loop: false });
    if (changed || rec.changed) this.changed();
  }

  // ---- The rules ---------------------------------------------------------------------------------

  /** `room`'s booking while it runs. */
  private booking(room: RehearsalRoomId, now: number): Booking | null {
    const b = this.bookings.get(room);
    return b && b.until > now ? b : null;
  }
  private inBand(room: RehearsalRoomId, owner: string, now: number): boolean {
    return !!this.booking(room, now)?.members.some((m) => m.owner === owner);
  }
  private inside(p: ProbePresent, room: RehearsalRoomId): boolean {
    return venueRoomAt(p.x, p.z) === room;
  }
  private nearDoor(p: ProbePresent, room: RehearsalRoomId): boolean {
    const d = doorOf(roomById(room));
    return Math.hypot(p.x - d.x, p.z - d.z) <= DOOR_REACH;
  }
  /** Using what's in a room: you're in it, and in its band while it's booked. A warning, or nothing. */
  private mayUse(p: ProbePresent, room: RehearsalRoomId, now: number, bandOnly: string): string | void {
    if (!this.inside(p, room)) return `🎸 Dafür musst du in ${roomName(room)} sein`;
    if (this.booking(room, now) && !this.inBand(room, p.owner, now)) return bandOnly;
  }
  private every(key: string, ms: number, now: number): boolean {
    const at = this.last.get(key) ?? -Infinity;
    if (now - at < ms) return false;
    this.last.set(key, now);
    if (this.last.size > 2000) for (const k of [...this.last.keys()].slice(0, 1000)) this.last.delete(k);
    return true;
  }

  private book(p: ProbePresent, room: RehearsalRoomId, minutes: unknown, band: unknown, now: number): string | void {
    if (typeof minutes !== 'number' || !MINUTES.includes(minutes)) return;
    const b = this.booking(room, now);
    const until = now + minutes * 60_000;
    if (b && b.owner !== p.owner) return `🎸 ${roomName(room)} ist bis ${clock(b.until)} gebucht (${b.band})`;
    const other = [...this.bookings.entries()].find(([r, x]) => r !== room && x.owner === p.owner && this.booking(r, now));
    if (other) return `🎸 Du hast schon ${roomName(other[0])} gebucht – erst freigeben`;
    if (b) {
      // Your own: for longer (or shorter) from now.
      b.until = until;
      const name = cleanText(band, BAND_NAME_MAX);
      if (name) b.band = name;
      return this.changed();
    }
    const name = cleanText(band, BAND_NAME_MAX) || `${p.name}s Band`;
    // Whoever's in the room with you is in the band.
    const members: Member[] = [{ owner: p.owner, name: p.name }];
    for (const o of this.d.present()) if (this.inside(o, room) && !members.some((m) => m.owner === o.owner) && members.length < BAND_MAX) members.push({ owner: o.owner, name: o.name });
    this.bookings.set(room, { owner: p.owner, name: p.name, band: name, since: now, until, members, seenAt: now });
    this.knocks.delete(room);
    this.polaroids.push({ band: name, names: members.map((m) => m.name), room, at: now });
    if (this.polaroids.length > POLAROIDS_KEPT) this.polaroids.splice(0, this.polaroids.length - POLAROIDS_KEPT);
    return this.changed();
  }

  private free(room: RehearsalRoomId) {
    this.bookings.delete(room);
    this.knocks.delete(room);
  }

  private member(p: ProbePresent, room: RehearsalRoomId, id: unknown, add: unknown, now: number): string | void {
    const b = this.booking(room, now);
    if (!b) return;
    if (b.owner !== p.owner) return `🎸 Wer in der Band ist, bestimmt ${b.name}`;
    const who = this.d.present().find((o) => o.id === id);
    if (add === true) {
      if (!who) return;
      if (!this.inside(who, room) && !this.knocks.get(room)?.some((k) => k.id === who.id)) return `🎸 ${who.name} muss dafür im Raum sein`;
      if (b.members.some((m) => m.owner === who.owner)) return;
      if (b.members.length >= BAND_MAX) return `🎸 Mehr als ${BAND_MAX} passen nicht in die Band`;
      b.members.push({ owner: who.owner, name: who.name });
    } else {
      const owner = who?.owner ?? null;
      const name = typeof id === 'string' ? id : '';
      // By someone here (their id), or by name for someone who's gone.
      const i = b.members.findIndex((m, j) => j > 0 && (m.owner === owner || (!owner && m.name === name)));
      if (i < 0) return;
      b.members.splice(i, 1);
    }
    return this.changed();
  }

  private door(p: ProbePresent, room: RehearsalRoomId, open: boolean, now: number): string | void {
    if (!this.nearDoor(p, room)) return;
    if ((this.doors.get(room) ?? false) === open) return;
    if (open && this.booking(room, now) && !this.inBand(room, p.owner, now) && !this.inside(p, room)) return `🔒 ${roomName(room)} ist gebucht (${this.booking(room, now)!.band}) – klopf an`;
    this.doors.set(room, open);
    return this.changed();
  }

  private knock(p: ProbePresent, room: RehearsalRoomId, now: number): string | void {
    const b = this.booking(room, now);
    if (!b || this.inside(p, room) || !this.nearDoor(p, room)) return;
    if (this.inBand(room, p.owner, now)) return '🎸 Du bist in der Band – einfach reingehen';
    if (!this.every(`knock:${p.id}`, KNOCK_EVERY, now)) return;
    const list = (this.knocks.get(room) ?? []).filter((k) => k.id !== p.id);
    list.push({ id: p.id, owner: p.owner, name: p.name, at: now });
    this.knocks.set(room, list.slice(-6));
    this.toAll({ t: 'probe.knocked', room, name: p.name });
    this.changed();
  }

  private letIn(p: ProbePresent, room: RehearsalRoomId, id: unknown, now: number): string | void {
    const b = this.booking(room, now);
    if (!b) return;
    if (!this.inBand(room, p.owner, now)) return '🎸 Reinlassen kann nur die Band';
    if (!this.inside(p, room) && !this.nearDoor(p, room)) return;
    const list = this.knocks.get(room) ?? [];
    const k = list.find((x) => x.id === id && now - x.at < KNOCK_MS);
    if (!k) return '🚪 Da klopft gerade keiner';
    this.knocks.set(room, list.filter((x) => x !== k));
    if (!b.members.some((m) => m.owner === k.owner)) {
      if (b.members.length >= BAND_MAX) return `🎸 Mehr als ${BAND_MAX} passen nicht in die Band`;
      b.members.push({ owner: k.owner, name: k.name });
    }
    this.doors.set(room, true);
    return this.changed();
  }

  private pin(p: RecPerson, text: unknown, color: unknown, now: number): string | void {
    const clean = cleanText(text, PIN_MAX, 3);
    if (!clean) return;
    if (!this.every(`pin:${p.owner}`, PIN_EVERY, now)) return '📌 Kurz warten, dann der nächste Zettel';
    const mine = this.pins.filter((x) => x.owner === p.owner);
    if (mine.length >= PINS_EACH) this.pins = this.pins.filter((x) => x !== mine[0]);
    const c = typeof color === 'number' && Number.isInteger(color) && color >= 0 && color < PIN_COLORS.length ? color : 0;
    this.pins.push({ id: `${now.toString(36)}${(this.seq++).toString(36)}`, text: clean, by: p.name, at: now, color: PIN_COLORS[c], owner: p.owner });
    if (this.pins.length > PINS_KEPT) this.pins.splice(0, this.pins.length - PINS_KEPT);
    return this.changed();
  }

  // ---- What everyone's told ----------------------------------------------------------------------

  view(now = this.d.now()): ProbeView {
    const rooms: RoomView[] = REHEARSAL_ROOMS.map((r) => {
      const b = this.booking(r.id, now);
      const booking: BookingView | null = b ? { band: b.band, by: b.name, since: b.since, until: b.until, members: b.members.map((m) => m.name) } : null;
      const s = this.setlists.get(r.id);
      return {
        id: r.id,
        door: this.doors.get(r.id) ?? false,
        booking,
        knocks: (this.knocks.get(r.id) ?? []).filter((k) => now - k.at < KNOCK_MS).map((k) => ({ id: k.id, name: k.name })),
        rec: this.recorders.rec(r.id),
        playing: this.recorders.play(r.id),
        setlist: s?.text ?? '',
        setlistBy: s?.by ?? '',
      };
    });
    return { now, rooms, takes: this.recorders.list(), pins: this.pins.map(({ owner: _o, ...v }) => v), polaroids: this.polaroids, tips: this.tips };
  }

  you(owner: string, now = this.d.now()): ProbeYou {
    const booked = REHEARSAL_ROOMS.find((r) => this.booking(r.id, now)?.owner === owner)?.id ?? null;
    return { booked, band: REHEARSAL_ROOMS.filter((r) => this.inBand(r.id, owner, now)).map((r) => r.id), takes: this.recorders.mine(owner), pins: this.pins.filter((x) => x.owner === owner).map((x) => x.id) };
  }

  private viewFor(owner: string, now: number): ProberaumServerMsg {
    return { t: 'probe', view: this.view(now), you: this.you(owner, now) };
  }

  /** Everyone in the Schallwerk gets the wing again (each with what's theirs); it's saved. */
  changed() {
    this.save();
    const now = this.d.now();
    const view = this.view(now);
    for (const p of this.d.present()) this.d.send(p.id, { t: 'probe', view, you: this.you(p.owner, now) });
  }

  private toAll(m: ProberaumServerMsg) {
    for (const p of this.d.present()) this.d.send(p.id, m);
  }

  // ---- Kept ---------------------------------------------------------------------------------------

  private load() {
    if (!this.file || !existsSync(this.file)) return;
    try {
      const s = JSON.parse(readFileSync(this.file, 'utf8')) as { [k: string]: unknown };
      const str = (v: unknown, max: number) => cleanText(v, max);
      for (const [room, v] of Object.entries((s.bookings ?? {}) as Record<string, Partial<Booking>>)) {
        if (!isRoomId(room) || !v || typeof v.owner !== 'string' || typeof v.until !== 'number') continue;
        const members = (Array.isArray(v.members) ? v.members : []).filter((m): m is Member => !!m && typeof m.owner === 'string' && typeof m.name === 'string').slice(0, BAND_MAX).map((m) => ({ owner: m.owner.slice(0, 200), name: str(m.name, 40) }));
        if (!members.length) continue;
        this.bookings.set(room, { owner: v.owner.slice(0, 200), name: str(v.name, 40), band: str(v.band, BAND_NAME_MAX) || 'Band', since: Number(v.since) || 0, until: v.until, members, seenAt: Number(v.seenAt) || Number(v.since) || 0 });
      }
      for (const [room, v] of Object.entries((s.setlists ?? {}) as Record<string, { text?: unknown; by?: unknown }>)) if (isRoomId(room) && v) this.setlists.set(room, { text: cleanText(v.text, SETLIST_MAX, SETLIST_LINES), by: str(v.by, 40) });
      for (const v of (Array.isArray(s.pins) ? s.pins : []) as Partial<Pin>[]) {
        const text = cleanText(v?.text, PIN_MAX, 3);
        if (!text || typeof v.owner !== 'string' || typeof v.id !== 'string') continue;
        this.pins.push({ id: v.id.slice(0, 40), text, by: str(v.by, 40), at: Number(v.at) || 0, color: PIN_COLORS.includes(v.color as never) ? (v.color as string) : PIN_COLORS[0], owner: v.owner.slice(0, 200) });
      }
      this.pins = this.pins.slice(-PINS_KEPT);
      for (const v of (Array.isArray(s.polaroids) ? s.polaroids : []) as Partial<Polaroid>[]) {
        if (!v || !isRoomId(v.room)) continue;
        this.polaroids.push({ band: str(v.band, BAND_NAME_MAX) || 'Band', names: (Array.isArray(v.names) ? v.names : []).slice(0, BAND_MAX).map((n) => str(n, 40)), room: v.room, at: Number(v.at) || 0 });
      }
      this.polaroids = this.polaroids.slice(-POLAROIDS_KEPT);
      this.tips = typeof s.tips === 'number' && Number.isFinite(s.tips) ? Math.max(0, Math.floor(s.tips)) : 0;
    } catch {
      // a broken file: the wing starts over
    }
  }

  private save() {
    if (!this.file) return;
    try {
      const tmp = `${this.file}.tmp`;
      const data = { bookings: Object.fromEntries(this.bookings), setlists: Object.fromEntries(this.setlists), pins: this.pins, polaroids: this.polaroids, tips: this.tips };
      writeFileSync(tmp, JSON.stringify(data), { mode: 0o600 });
      renameSync(tmp, this.file);
    } catch {
      // can't write: kept in memory till the next try
    }
  }
}

/** A time of day, Berlin's ("21:30"). */
function clock(ms: number): string {
  return new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });
}
