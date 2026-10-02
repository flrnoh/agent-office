// The Schallwerk's instruments, as the office keeps them (flrnoh fork, see FORK.md "The
// instruments"): who plays what (one player per instrument, one instrument per player), each room's
// jam (tempo, click, key), each spot's sound, and the notes: taken only from whoever holds that spot,
// standing at it, one the instrument can play, and not too many of them (shared/instruments.ts).
// Pure bookkeeping: the handlers (ws/handlers/instruments.ts) say who's where and send what it says.

import { JAM_ROOMS, NO_JAM, PLAY_REACH, RateBucket, SPOT_BY_ID, TAKE_REACH, applyJam, cleanNote, toneFits, type Jam } from '../../shared/instruments.js';
import type { InstrumentNote, VenueRoomId } from '../../shared/venue.js';

/** Someone in the venue, as the office sees them: who, and where they stand (interior coordinates). */
export interface Musician {
  id: string;
  name: string;
  x: number;
  z: number;
}

export type TakeResult = { ok: true; changed: boolean } | { error: string };

export class Instruments {
  /** Spot id → who plays it. */
  private players = new Map<string, string>();
  private names = new Map<string, string>();
  private jams = new Map<VenueRoomId, Jam>();
  private tones = new Map<string, string>();
  private buckets = new Map<string, RateBucket>();

  /** Who plays what now, as `instr.state` sends it. */
  state(): Record<string, string> {
    return Object.fromEntries(this.players);
  }

  /** The spot someone plays, if any. */
  spotOf(id: string): string | undefined {
    for (const [spot, who] of this.players) if (who === id) return spot;
    return undefined;
  }

  /** Takes the instrument at `spot` (putting back whatever else they had). */
  take(m: Musician, spotId: string): TakeResult {
    const spot = SPOT_BY_ID.get(spotId);
    if (!spot) return { error: 'Das Instrument gibt es nicht' };
    const holder = this.players.get(spotId);
    if (holder === m.id) return { ok: true, changed: false };
    if (holder) return { error: `🎶 Da spielt gerade ${this.names.get(holder) ?? 'jemand'}` };
    if (Math.hypot(m.x - spot.x, m.z - spot.z) > TAKE_REACH) return { error: 'Da musst du schon hingehen' };
    this.leave(m.id);
    this.players.set(spotId, m.id);
    this.names.set(m.id, m.name);
    return { ok: true, changed: true };
  }

  /** Puts back whatever `id` plays: whether they had anything. */
  leave(id: string): boolean {
    const spot = this.spotOf(id);
    this.names.delete(id);
    if (!spot) return false;
    this.players.delete(spot);
    return true;
  }

  /**
   * A note from `m` at `spotId`: the note as everyone gets it, or why not. Someone who's wandered off
   * their spot (whatever their page says) loses it: `dropped` says so.
   */
  note(m: Musician, spotId: string, note: unknown, now: number): { note: InstrumentNote } | { refused: 'spot' | 'note' | 'rate' | 'away' } {
    const spot = SPOT_BY_ID.get(spotId);
    if (!spot || this.players.get(spotId) !== m.id) return { refused: 'spot' };
    if (Math.hypot(m.x - spot.x, m.z - spot.z) > PLAY_REACH) {
      this.leave(m.id);
      return { refused: 'away' };
    }
    const clean = cleanNote(spot.kind, note);
    if (!clean) return { refused: 'note' };
    let bucket = this.buckets.get(m.id);
    if (!bucket) this.buckets.set(m.id, (bucket = new RateBucket(undefined, undefined, now)));
    if (!bucket.take(now)) return { refused: 'rate' };
    return { note: clean };
  }

  /** Gone from the office: nothing of theirs is kept. */
  forget(id: string) {
    this.leave(id);
    this.buckets.delete(id);
  }

  jam(room: VenueRoomId): Jam {
    return this.jams.get(room) ?? NO_JAM;
  }

  /** Every room's jam that isn't the one rooms start with. */
  allJams(): Partial<Record<VenueRoomId, Jam>> {
    return Object.fromEntries(this.jams);
  }

  /** Changes `room`'s jam: the new one, or null (not a room with instruments, nothing valid in it). */
  setJam(room: unknown, change: unknown, now: number): Jam | null {
    if (!(JAM_ROOMS as readonly unknown[]).includes(room)) return null;
    const r = room as VenueRoomId;
    const next = applyJam(this.jam(r), change, now);
    if (next) this.jams.set(r, next);
    return next;
  }

  /** Each spot's sound (only the ones switched away from their first). */
  allTones(): Record<string, string> {
    return Object.fromEntries(this.tones);
  }

  /** Switches the sound of the instrument `id` plays at `spotId`: whether it changed. */
  setTone(id: string, spotId: string, tone: unknown): boolean {
    const spot = SPOT_BY_ID.get(spotId);
    if (!spot || this.players.get(spotId) !== id || !toneFits(spot, tone) || this.tones.get(spotId) === tone) return false;
    this.tones.set(spotId, tone);
    return true;
  }
}
