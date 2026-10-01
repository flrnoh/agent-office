import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { JUKEBOX_TUNES, STREAM, checkStreamUrl, trackTitle, tuneById, type JukeboxState } from '../shared/jukebox.js';
import { stationById, stationByUrl } from '../shared/radio.js';

interface Saved {
  on: boolean;
  track: string;
  url?: string;
  /** A built-in radio station's id, when `url` is one (see shared/radio.ts). */
  station?: string;
  by?: string;
  /** flrnoh fork: the speakers all over the floor switched off. */
  speakersOff?: boolean;
  /** When the track started, on this machine's clock. */
  startedAt: number;
}

/**
 * The lounge jukebox on one floor, saved in .agent-office/jukebox.json. It only says what's on and
 * since when; every browser plays it for itself, from the same point.
 */
export class Jukebox {
  private s: Saved = { on: false, track: JUKEBOX_TUNES[0].id, startedAt: Date.now() };
  private file: string;

  constructor(dataDir: string) {
    this.file = path.join(dataDir, 'jukebox.json');
    this.load();
  }

  state(): JukeboxState {
    const { on, track, url, station, by, speakersOff, startedAt } = this.s;
    return { on, track, ...(url && track === STREAM ? { url, ...(station ? { station } : {}) } : {}), ...(by ? { by } : {}), ...(speakersOff ? { speakersOff } : {}), startedAt, elapsed: Math.max(0, Date.now() - startedAt) };
  }

  /** What's on, for toasts: “Rainy Window”, or where a stream comes from. */
  title(): string {
    return trackTitle(this.s);
  }

  /** Puts on a radio station, a tune, a stream, or (with none) whatever it had. Says whether anything changed, or why it can't. */
  play(input: { track?: unknown; url?: unknown; station?: unknown }, by: string): { changed: boolean } | { error: string } {
    if (input.station !== undefined && input.station !== '') {
      const station = stationById(input.station);
      if (!station) return { error: "The jukebox doesn't know that station" };
      this.set({ on: true, track: STREAM, url: station.url, station: station.id, by });
    } else if (input.url !== undefined && input.url !== '') {
      const u = checkStreamUrl(input.url);
      if ('error' in u) return u;
      const station = stationByUrl(u.url);
      this.set({ on: true, track: STREAM, url: u.url, ...(station ? { station: station.id } : {}), by });
    } else if (input.track !== undefined) {
      if (typeof input.track !== 'string' || !tuneById(input.track)) return { error: "The jukebox doesn't have that one" };
      this.set({ on: true, track: input.track, by });
    } else {
      if (this.s.on) return { changed: false };
      this.set({ ...this.s, on: true, by });
    }
    return { changed: true };
  }

  /** On to the next tune; from a stream, back to the first one. */
  skip(by: string) {
    const i = JUKEBOX_TUNES.findIndex((t) => t.id === this.s.track);
    this.set({ on: true, track: JUKEBOX_TUNES[(i + 1) % JUKEBOX_TUNES.length].id, by });
  }

  /** flrnoh fork: switches the floor's speakers on or off (the jukebox itself plays on). Says whether that changed anything. */
  setSpeakers(on: boolean): boolean {
    if (!this.s.speakersOff === on) return false;
    const { speakersOff: _, ...rest } = this.s;
    this.s = on ? rest : { ...rest, speakersOff: true };
    this.save();
    return true;
  }

  stop(by: string): boolean {
    if (!this.s.on) return false;
    this.s = { ...this.s, on: false, by };
    this.save();
    return true;
  }

  private set(s: Omit<Saved, 'startedAt'>) {
    this.s = { ...s, ...(this.s.speakersOff ? { speakersOff: true } : {}), startedAt: Date.now() };
    this.save();
  }

  private load() {
    if (!existsSync(this.file)) return;
    try {
      const s = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<Saved>;
      const url = s.track === STREAM ? checkStreamUrl(s.url) : undefined;
      if (s.track === STREAM ? !url || 'error' in url : typeof s.track !== 'string' || !tuneById(s.track)) return;
      this.s = {
        on: s.on === true,
        track: s.track!,
        ...(url && 'url' in url ? { url: url.url, ...(stationByUrl(url.url) ? { station: stationByUrl(url.url)!.id } : {}) } : {}),
        ...(typeof s.by === 'string' ? { by: s.by.slice(0, 24) } : {}),
        ...(s.speakersOff === true ? { speakersOff: true } : {}),
        startedAt: typeof s.startedAt === 'number' && Number.isFinite(s.startedAt) ? s.startedAt : Date.now(),
      };
    } catch {
      // a broken file just means a quiet lounge
    }
  }

  private save() {
    try {
      writeFileSync(this.file, JSON.stringify(this.s, null, 2), { mode: 0o600 });
    } catch {
      // disk issues shouldn't take the office down
    }
  }
}
