import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { VENUE, VENUE_ENTRY, type VenueMode } from '../../shared/venue.js';
import {
  ANNOUNCEMENTS,
  ANNOUNCE_COOLDOWN_MS,
  COAT_TAGS,
  FX_COOLDOWN_MS,
  FX_LASTS_MS,
  LIGHTS_COOLDOWN_MS,
  MODE_COOLDOWN_MS,
  MODE_LIGHTS,
  STAMP_MS,
  isFx,
  isMerch,
  isMode,
  isScene,
  type MerchId,
  type VenueFx,
  type VenueHouseClientMsg,
  type VenueHouseServerMsg,
  type VenueLights,
  type VenueWear,
} from '../../shared/venue-house.js';
import type { FloorView } from '../../shared/protocol.js';

/*
 * The Schallwerk as a place (flrnoh fork, see FORK.md "The Schallwerk"), like the bowling centre
 * (server/bowling/place.ts): VENUE is a peer's `floor` while they're in there, so people from every
 * floor meet there. fork/office.ts hooks it in: `floor.go` to VENUE, back in after a reload, the view
 * someone arriving gets. And the house's own state: concert or club, the light desk, the effects, and
 * what people have on from the house (the entry stamp, a merch shirt, their coat at the cloakroom),
 * kept per person (account or name) in venue.json so a reload or a restart keeps them.
 */

/** Just inside the doors, where someone coming in stands (the page puts them there too). */
export const VENUE_ARRIVAL = { x: VENUE_ENTRY.x, y: 0, z: VENUE_ENTRY.z, rotY: VENUE_ENTRY.rotY } as const;

/** What someone arriving in the venue gets: none of a floor's things. The house comes in its own message. */
export function venueView(empty: FloorView): FloorView {
  return { ...empty, floor: VENUE };
}

/** Whether someone asking to come back to `wanted` (a reload, a restart) goes back into the venue: only while there's a building for its street. */
export function backInVenue(wanted: string | null, floors: number): boolean {
  return wanted === VENUE && floors > 0;
}

/** Who's asking, as the house needs them. */
export interface VenueGuest {
  id: string;
  /** Who they are to the house's keeping (account or name, see fork/office.ts owner). */
  owner: string;
  name: string;
  /** In the venue now. */
  inside: boolean;
}

/** What to tell whom: everyone inside, everyone in the office, or only the one asking (a refusal). */
export type VenueReply = { inside: VenueHouseServerMsg } | { everyone: VenueHouseServerMsg } | { warn: string } | null;

interface Kept {
  stampUntil?: number;
  shirt?: MerchId;
  coat?: number;
}

/** Concert or club, the light desk, the effects, and what people have on, for the whole house. */
export class VenueHouse {
  private mode: VenueMode = 'konzert';
  private lights: VenueLights = { ...MODE_LIGHTS.konzert };
  private modeAt = -Infinity;
  private lightsAt = -Infinity;
  private announcedAt = -Infinity;
  private fired = new Map<VenueFx, number>();
  private kept = new Map<string, Kept>();
  private file: string | null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(opts: { dataDir?: string; now?: () => number } = {}) {
    this.now = opts.now ?? (() => Date.now());
    this.file = opts.dataDir ? path.join(opts.dataDir, 'venue.json') : null;
    this.load();
  }

  private now: () => number;

  get current(): VenueMode {
    return this.mode;
  }

  /** What one person has on, as the wire says it (an expired stamp is washed off). */
  wearOf(owner: string): VenueWear {
    const k = this.kept.get(owner);
    if (!k) return {};
    const w: VenueWear = {};
    if (k.stampUntil && k.stampUntil > this.now()) w.stamp = true;
    if (k.shirt) w.shirt = k.shirt;
    if (k.coat) w.coat = k.coat;
    return w;
  }

  /** What someone coming in (or asking) is sent: `people` are everyone in the office, by peer id and owner. */
  state(people: { id: string; owner: string }[]): Extract<VenueHouseServerMsg, { t: 'venue.house' }> {
    const wear: Record<string, VenueWear> = {};
    for (const p of people) {
      const w = this.wearOf(p.owner);
      if (Object.keys(w).length) wear[p.id] = w;
    }
    const now = this.now();
    const fx = [...this.fired].filter(([f, at]) => now - at < FX_LASTS_MS[f]).map(([f, at]) => ({ fx: f, at }));
    return { t: 'venue.house', mode: this.mode, lights: { ...this.lights }, fx, wear };
  }

  /** A message from someone. `fxAt` is the office's clock (the page plays effects on it). */
  message(who: VenueGuest, msg: VenueHouseClientMsg, fxAt = this.now()): VenueReply {
    const by = who.name.slice(0, 40);
    const now = this.now();
    if (msg.t === 'venue.hello') return null; // answered by the handler with the whole house
    if (!who.inside) return null;
    switch (msg.t) {
      case 'venue.mode': {
        if (!isMode(msg.mode) || msg.mode === this.mode) return null;
        if (now - this.modeAt < MODE_COOLDOWN_MS) return { warn: 'Moment, die Anlage schaltet noch um' };
        this.mode = msg.mode;
        this.lights = { ...MODE_LIGHTS[msg.mode] };
        this.modeAt = now;
        this.lightsAt = now;
        return { everyone: { t: 'venue.mode', mode: this.mode, lights: { ...this.lights }, by } };
      }
      case 'venue.lights': {
        const next: VenueLights = { ...this.lights };
        if (msg.scene !== undefined) {
          if (!isScene(msg.scene)) return null;
          next.scene = msg.scene;
        }
        if (msg.laser !== undefined) next.laser = msg.laser === true;
        if (msg.ball !== undefined) next.ball = msg.ball === true;
        if (next.scene === this.lights.scene && next.laser === this.lights.laser && next.ball === this.lights.ball) return null;
        if (now - this.lightsAt < LIGHTS_COOLDOWN_MS) return { warn: 'Langsam am Lichtpult!' };
        this.lights = next;
        this.lightsAt = now;
        return { inside: { t: 'venue.lights', lights: { ...this.lights }, by } };
      }
      case 'venue.fx': {
        if (!isFx(msg.fx)) return null;
        const last = this.fired.get(msg.fx) ?? -Infinity;
        if (now - last < FX_COOLDOWN_MS[msg.fx]) return { warn: 'Lädt noch nach…' };
        this.fired.set(msg.fx, now);
        return { inside: { t: 'venue.fx', fx: msg.fx, at: fxAt, by } };
      }
      case 'venue.announce': {
        const text = Number.isInteger(msg.n) ? ANNOUNCEMENTS[msg.n] : undefined;
        if (!text) return null;
        if (now - this.announcedAt < ANNOUNCE_COOLDOWN_MS) return { warn: 'Eine Durchsage nach der anderen' };
        this.announcedAt = now;
        return { inside: { t: 'venue.announce', text, by } };
      }
      case 'venue.stamp': {
        const k = this.keep(who.owner);
        k.stampUntil = now + STAMP_MS;
        this.changed();
        return { everyone: { t: 'venue.wear', id: who.id, wear: this.wearOf(who.owner) } };
      }
      case 'venue.coat': {
        const k = this.keep(who.owner);
        if (msg.in === true) {
          if (k.coat) return null;
          const tag = this.freeTag(who.owner);
          if (!tag) return { warn: 'Die Garderobe ist voll' };
          k.coat = tag;
        } else {
          if (!k.coat) return null;
          delete k.coat;
        }
        this.changed();
        return { everyone: { t: 'venue.wear', id: who.id, wear: this.wearOf(who.owner) } };
      }
      case 'venue.merch': {
        const k = this.keep(who.owner);
        if (msg.item === null) {
          if (!k.shirt) return null;
          delete k.shirt;
        } else {
          if (!isMerch(msg.item) || k.shirt === msg.item) return null;
          k.shirt = msg.item;
        }
        this.changed();
        return { everyone: { t: 'venue.wear', id: who.id, wear: this.wearOf(who.owner) } };
      }
    }
    return null;
  }

  /**
   * A gig in the calendar starts (server/venue/show.ts onGigStart): the house turns into what it is,
   * whatever the light desk's cooldown says. What to tell everyone, or null when it already is.
   */
  gigStarts(mode: VenueMode, title: string): VenueHouseServerMsg | null {
    if (!isMode(mode) || mode === this.mode) return null;
    this.mode = mode;
    this.lights = { ...MODE_LIGHTS[mode] };
    this.modeAt = this.now();
    this.lightsAt = this.modeAt;
    this.changed();
    return { t: 'venue.mode', mode, lights: { ...this.lights }, by: title.slice(0, 40) };
  }

  /** The lowest free cloakroom number, the same each time for the same person's hash where it's free. */
  private freeTag(owner: string): number | null {
    const taken = new Set([...this.kept.values()].map((k) => k.coat).filter((n): n is number => !!n));
    let h = 0;
    for (const ch of owner) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    for (let i = 0; i < COAT_TAGS; i++) {
      const n = 1 + ((h + i * 37) % COAT_TAGS);
      if (!taken.has(n)) return n;
    }
    return null;
  }

  private keep(owner: string): Kept {
    let k = this.kept.get(owner);
    if (!k) {
      k = {};
      this.kept.set(owner, k);
    }
    return k;
  }

  // ---- venue.json ----------------------------------------------------------------------------------

  private load() {
    if (!this.file || !existsSync(this.file)) return;
    try {
      const saved = JSON.parse(readFileSync(this.file, 'utf8')) as { mode?: unknown; people?: Record<string, unknown> };
      if (isMode(saved.mode)) {
        this.mode = saved.mode;
        this.lights = { ...MODE_LIGHTS[saved.mode] };
      }
      for (const [owner, v] of Object.entries(saved.people ?? {})) {
        if (!v || typeof v !== 'object') continue;
        const o = v as Record<string, unknown>;
        const k: Kept = {};
        if (typeof o.stampUntil === 'number' && o.stampUntil > this.now()) k.stampUntil = o.stampUntil;
        if (isMerch(o.shirt)) k.shirt = o.shirt;
        if (typeof o.coat === 'number' && Number.isInteger(o.coat) && o.coat >= 1 && o.coat <= COAT_TAGS) k.coat = o.coat;
        if (Object.keys(k).length) this.kept.set(owner.slice(0, 200), k);
      }
    } catch {
      // a broken file: start afresh
    }
  }

  private changed() {
    if (!this.file || this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.save();
    }, 500);
    this.saveTimer.unref?.();
  }

  /** Writes venue.json now (and on stopping). */
  save() {
    if (!this.file) return;
    const now = this.now();
    const people: Record<string, Kept> = {};
    for (const [owner, k] of this.kept) {
      const keep: Kept = { ...k };
      if (keep.stampUntil && keep.stampUntil <= now) delete keep.stampUntil;
      if (Object.keys(keep).length) people[owner] = keep;
    }
    try {
      const tmp = `${this.file}.tmp`;
      writeFileSync(tmp, JSON.stringify({ mode: this.mode, people }), { mode: 0o600 });
      renameSync(tmp, this.file);
    } catch {
      // the data folder went away: it'll be written next time
    }
  }

  stop() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
      this.save();
    }
  }
}
