import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { BOARD_SIZE, MAX_RIDE_MS, SLIDES, SLIDE_BY_ID, minRideMs, type SlideBoards, type SlideId, type SlideRow } from '../../shared/therme-slides.js';

/*
 * The thermal baths on the server (flrnoh fork, see FORK.md "The thermal baths"): what the office
 * keeps of them. The slides' rides: the office clocks each one itself, from the start it hears to
 * the finish, and a ride faster than the slide allows (minRideMs) or slower than any ride takes
 * doesn't count; each slide's board is everyone's best (one row a person), kept in therme.json.
 */

interface Best extends SlideRow {
  owner: string;
}

interface Saved {
  bests?: Partial<Record<SlideId, Best[]>>;
}

export type RideResult = { ms: number; rank: number; best: number; changed: boolean } | { warn: string };

export class Therme {
  private file: string;
  /** Who's on their way down which slide, since when (by peer id). */
  private riding = new Map<string, { slide: SlideId; lane: number; at: number }>();
  /** When each peer last set off: a start a second isn't a ride. */
  private lastStart = new Map<string, number>();
  private bests: Partial<Record<SlideId, Best[]>> = {};
  private dirty: ReturnType<typeof setTimeout> | null = null;

  constructor(
    dataDir: string,
    private now: () => number = Date.now,
  ) {
    this.file = path.join(dataDir, 'therme.json');
    try {
      const saved = JSON.parse(readFileSync(this.file, 'utf8')) as Saved;
      for (const s of SLIDES) {
        const rows = saved.bests?.[s.id];
        if (Array.isArray(rows)) this.bests[s.id] = rows.filter((r) => r && typeof r.owner === 'string' && typeof r.ms === 'number').slice(0, 200);
      }
    } catch {
      // nothing ridden yet
    }
  }

  /** `id` set off down `slide`. */
  start(id: string, slide: SlideId, lane = 0): { warn: string } | null {
    const t = this.now();
    if (t - (this.lastStart.get(id) ?? -Infinity) < 1500) return { warn: 'Langsam, eine Rutsche nach der anderen' };
    this.lastStart.set(id, t);
    const lanes = SLIDE_BY_ID.get(slide)?.lanes?.length ?? 1;
    this.riding.set(id, { slide, lane: Math.max(0, Math.min(lanes - 1, Math.floor(lane) || 0)), at: t });
    return null;
  }

  /** `id` (who's `owner`, called `name`) landed at the bottom of `slide`: their time, if it was a ride. */
  finish(id: string, owner: string, name: string, slide: SlideId): RideResult | null {
    const ride = this.riding.get(id);
    this.riding.delete(id);
    if (!ride || ride.slide !== slide) return null;
    const def = SLIDE_BY_ID.get(slide)!;
    const ms = this.now() - ride.at;
    if (ms < minRideMs(def)) return { warn: 'Das war zu schnell für eine echte Fahrt' };
    if (ms > MAX_RIDE_MS) return null;
    const list = (this.bests[slide] ??= []);
    const mine = list.find((b) => b.owner === owner);
    let changed = false;
    if (!mine || ms < mine.ms) {
      if (mine) Object.assign(mine, { ms, name, at: this.now() });
      else list.push({ owner, name, ms, at: this.now() });
      list.sort((a, b) => a.ms - b.ms);
      changed = list.findIndex((b) => b.owner === owner) < BOARD_SIZE;
      this.save();
    }
    const best = list.find((b) => b.owner === owner)!.ms;
    const at = list.findIndex((b) => b.owner === owner);
    return { ms, rank: at < BOARD_SIZE && best === ms ? at + 1 : 0, best, changed };
  }

  /** Off the slide halfway (left the baths, or the page went). */
  leave(id: string) {
    this.riding.delete(id);
  }

  /** Every slide's board: the best rides, one a person. */
  boards(): SlideBoards {
    const out: SlideBoards = {};
    for (const s of SLIDES) out[s.id] = (this.bests[s.id] ?? []).slice(0, BOARD_SIZE).map(({ name, ms, at }) => ({ name, ms, at }));
    return out;
  }

  private save() {
    if (this.dirty) return;
    this.dirty = setTimeout(() => this.flush(), 2000);
    this.dirty.unref?.();
  }

  flush() {
    if (this.dirty) clearTimeout(this.dirty);
    this.dirty = null;
    try {
      const tmp = `${this.file}.tmp`;
      writeFileSync(tmp, JSON.stringify({ bests: this.bests } satisfies Saved, null, 2) + '\n', { mode: 0o600 });
      renameSync(tmp, this.file);
    } catch {
      // the data folder's gone: the next ride tries again
    }
  }

  stop() {
    this.flush();
  }
}
