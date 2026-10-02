import { COUNT_IN_BEATS, dueBetween, evNote, spotOf, takePosition, type RoomView, type Take, type TakeEv } from '../../../shared/proberaum';
import type { InstrumentNote, RehearsalRoomId } from '../../../shared/venue';

/*
 * The rooms' recorders on the page (flrnoh fork, see FORK.md "The rehearsal wing"): a take the office
 * says a room is playing back, sounded at its instruments' spots from the moment it says, round again
 * on a loop, for whoever's in that room; the click track and the count-in while a room records; the
 * notes of a take being recorded as they come (for the window's timeline: the office keeps the take).
 */

export interface PlaybackOut {
  /** The office's clock (ms). */
  now(): number;
  /** The room you're in by its sound ('hall' anywhere else). */
  myRoom(): string;
  /** Sound a note at its spot (the instruments' synth). */
  note(n: InstrumentNote, at: { x: number; y: number; z: number }): void;
  /** A click of the click track, `delay` s from now, `accent` on the bar's first beat. */
  click(accent: boolean, delay: number): void;
}

interface Playing {
  take: Take;
  startAt: number;
  loop: boolean;
  /** Where in the take the last frame got to (ms), and on which time round. */
  pos: number;
  round: number;
}

/** How far ahead the click track is scheduled (ms): it's laid on the audio clock, so a slow frame doesn't wobble it. */
const AHEAD = 150;

export class Playback {
  private playing = new Map<RehearsalRoomId, Playing>();
  /** The beat each recording room's clicks are scheduled up to. */
  private clicked = new Map<RehearsalRoomId, number>();
  /** Notes heard while a room records (for the window), and when it started. */
  private live = new Map<RehearsalRoomId, { startAt: number; evs: TakeEv[] }>();

  constructor(private readonly out: PlaybackOut) {}

  /** The office says `room` plays `take` back from `startAt` (or stops: null). */
  set(room: RehearsalRoomId, take: Take | null, startAt: number, loop: boolean) {
    if (!take) {
      this.playing.delete(room);
      return;
    }
    this.playing.set(room, { take, startAt, loop, pos: -1, round: 0 });
  }

  /** What `room` is playing back, and how far in (ms; null when nothing). */
  position(room: RehearsalRoomId): { take: Take; at: number } | null {
    const p = this.playing.get(room);
    if (!p) return null;
    const at = takePosition(this.out.now() - p.startAt, p.take.dur, p.loop);
    return at === null ? null : { take: p.take, at: Math.max(0, at) };
  }

  /** The take being recorded in `room` so far, as this page heard it. */
  recording(room: RehearsalRoomId): { startAt: number; evs: TakeEv[] } | null {
    return this.live.get(room) ?? null;
  }

  /** A note the instruments sent out: kept for the window if its room is recording. */
  heard(spot: string, note: InstrumentNote) {
    const s = spotOf(spot);
    if (!s || s.room === 'hall') return;
    const r = this.live.get(s.room);
    if (!r) return;
    const t = this.out.now() - r.startAt;
    if (t < -150) return;
    r.evs.push([Math.max(0, Math.round(t)), spot, note.pitch, note.vel, note.len ?? 0]);
  }

  /** The rooms as the office says they are now: recordings starting and ending. */
  rooms(rooms: readonly RoomView[]) {
    for (const r of rooms) {
      if (r.rec && this.live.get(r.id)?.startAt !== r.rec.startAt) this.live.set(r.id, { startAt: r.rec.startAt, evs: [] });
      if (!r.rec) {
        this.live.delete(r.id);
        this.clicked.delete(r.id);
      }
      if (!r.playing) this.playing.delete(r.id);
    }
    this.recs = rooms.filter((r) => r.rec).map((r) => ({ id: r.id, rec: r.rec! }));
  }
  private recs: { id: RehearsalRoomId; rec: NonNullable<RoomView['rec']> }[] = [];

  /** Every frame: the notes due in the room you're in, and its clicks. */
  tick() {
    const now = this.out.now();
    const mine = this.out.myRoom();
    for (const [room, p] of this.playing) {
      const elapsed = now - p.startAt;
      const at = takePosition(elapsed, p.take.dur, p.loop);
      if (at === null) {
        this.playing.delete(room);
        continue;
      }
      const round = p.loop && elapsed > 0 ? Math.floor(elapsed / p.take.dur) : 0;
      // Out of the room you hear nothing of it, but it goes on.
      const due: TakeEv[] = [];
      if (round !== p.round) {
        due.push(...dueBetween(p.take.evs, p.pos, p.take.dur));
        due.push(...dueBetween(p.take.evs, -1, at));
      } else due.push(...dueBetween(p.take.evs, p.pos, at));
      p.pos = at;
      p.round = round;
      // A frame that came very late (a tab in the background) doesn't fire a flood of old notes.
      if (mine !== room || due.length > 64) continue;
      for (const ev of due) {
        const n = evNote(ev);
        const s = spotOf(ev[1]);
        if (n && s) this.out.note(n, { x: s.x, y: s.y + 1, z: s.z });
      }
    }
    for (const { id, rec } of this.recs) {
      if (mine !== id || (!rec.click && !rec.countIn)) continue;
      const beat = 60_000 / rec.bpm;
      const first = rec.countIn ? -COUNT_IN_BEATS : 0;
      let k = this.clicked.get(id) ?? Math.max(first, Math.ceil((now - rec.startAt) / beat));
      for (; ; k++) {
        const t = rec.startAt + k * beat;
        if (t > now + AHEAD) break;
        // After the count-in only with the click on.
        if (k >= 0 && !rec.click) break;
        if (t >= now - 30) this.out.click(((k % 4) + 4) % 4 === 0, (t - now) / 1000);
      }
      this.clicked.set(id, k);
    }
  }
}
