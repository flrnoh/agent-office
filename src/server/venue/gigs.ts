import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { GIGS_MAX, GIG_KEEP_MS, clash, cleanGig, liveGig, upcoming, type Gig, type GigInput } from '../../shared/venueshow.js';

/*
 * The SCHALLWERK's gig calendar (flrnoh fork, see FORK.md "The show"): what's on when, put in by the
 * team, kept in <dataDir>/venue-gigs.json (0600, written beside it and moved over it). Real clock
 * time, not the office's day. It says when a gig starts (once, even across a restart) and which one
 * is on now; gigs over for a month are let go.
 */

export class GigCalendar {
  private gigs: Gig[] = [];
  private file: string;

  constructor(dataDir: string, now = Date.now()) {
    this.file = path.join(dataDir, 'venue-gigs.json');
    this.load(now);
  }

  /** Every gig not long over, soonest first. */
  list(): Gig[] {
    return [...this.gigs].sort((a, b) => a.start - b.start);
  }

  /** The gigs still to come (or on now). */
  upcoming(now = Date.now()): Gig[] {
    return upcoming(this.gigs, now);
  }

  live(now = Date.now()): Gig | null {
    return liveGig(this.gigs, now);
  }

  /** Puts a gig in (no id) or changes one (its id); says why not when it can't. */
  save(raw: unknown, by: string, now = Date.now()): { gig: Gig } | { error: string } {
    const was = raw && typeof raw === 'object' && typeof (raw as { id?: unknown }).id === 'string' ? this.gigs.find((g) => g.id === (raw as { id: string }).id) : undefined;
    if (raw && typeof raw === 'object' && 'id' in raw && (raw as { id?: unknown }).id !== undefined && !was) return { error: 'Den Termin gibt’s nicht mehr' };
    const g = cleanGig(raw, now, !was || (raw as GigInput).start !== was.start);
    if ('error' in g) return g;
    const other = this.gigs.find((o) => o.id !== was?.id && clash(o, g));
    if (other) return { error: `Da ist schon „${other.title}“ im Schallwerk` };
    if (!was && this.gigs.length >= GIGS_MAX) return { error: 'Der Kalender ist voll' };
    const gig: Gig = {
      id: was?.id ?? randomBytes(6).toString('hex'),
      title: g.title,
      kind: g.kind,
      start: g.start,
      end: g.end,
      ...(g.text ? { text: g.text } : {}),
      style: g.style,
      color: g.color,
      by: was?.by ?? by.slice(0, 24),
      // Moved to later: it gets announced again when it starts.
      ...(was?.announced && g.start === was.start ? { announced: true } : {}),
    };
    this.gigs = [...this.gigs.filter((o) => o.id !== gig.id), gig];
    this.save_();
    return { gig };
  }

  /** Takes a gig out; false when there's none by that id. */
  remove(id: unknown): boolean {
    const before = this.gigs.length;
    this.gigs = this.gigs.filter((g) => g.id !== id);
    if (this.gigs.length === before) return false;
    this.save_();
    return true;
  }

  /**
   * Every few seconds: the gig that has just started, if one has and hasn't been announced (once
   * each, kept across restarts), and whether the calendar changed (a gig over long enough went).
   */
  tick(now = Date.now()): { started: Gig | null; changed: boolean } {
    let changed = false;
    const keep = this.gigs.filter((g) => g.end > now - GIG_KEEP_MS);
    if (keep.length !== this.gigs.length) {
      this.gigs = keep;
      changed = true;
    }
    const live = this.live(now);
    let started: Gig | null = null;
    if (live && !live.announced) {
      live.announced = true;
      started = live;
      changed = true;
    }
    if (changed) this.save_();
    return { started, changed };
  }

  private load(now: number) {
    if (!existsSync(this.file)) return;
    try {
      const raw = JSON.parse(readFileSync(this.file, 'utf8')) as { gigs?: unknown };
      const list = Array.isArray(raw.gigs) ? raw.gigs : [];
      for (const r of list) {
        // Read back through the same check as a gig someone filled in, so a hand-edited file can't smuggle anything in.
        const g = cleanGig(r, now, false);
        const o = r as Partial<Gig>;
        if ('error' in g || typeof o.id !== 'string' || !/^[a-z0-9]{4,24}$/.test(o.id)) continue;
        if (this.gigs.some((x) => x.id === o.id || clash(x, g))) continue;
        this.gigs.push({ ...g, id: o.id, by: typeof o.by === 'string' ? o.by.slice(0, 24) : '', ...(o.announced === true ? { announced: true } : {}) });
        if (this.gigs.length >= GIGS_MAX) break;
      }
    } catch {
      // a broken file just means an empty calendar
    }
  }

  private save_() {
    try {
      const tmp = `${this.file}.tmp`;
      writeFileSync(tmp, JSON.stringify({ gigs: this.list() }, null, 1), { mode: 0o600 });
      renameSync(tmp, this.file);
    } catch {
      // disk issues shouldn't take the office down
    }
  }
}
