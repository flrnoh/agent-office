import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { DjSet } from '../../shared/djset.js';
import { isDjBeats, type DjBeats, type DjBeatsStatus } from '../../shared/djbeats.js';
import { BeatsError, findTools, hearSet, type BeatTools } from './fetch.js';

/*
 * The office hearing the DJ sets put on at the roof's booth (flrnoh fork, see FORK.md): one at a
 * time, the set that's on; a new one stops hearing the last. What it heard is kept in the data
 * folder (dj-beats/, by link), so a set put on again is ready at once.
 */

/** Hears a set: fetch.ts' hearSet, or a stand-in in tests. */
export type Hear = (set: DjSet, signal: AbortSignal) => Promise<DjBeats>;

/** How many sets' beats it keeps. */
const KEEP = 60;

export class DjBeatsJobs {
  private dir: string;
  private status = new Map<string, DjBeatsStatus>();
  private job: { url: string; abort: AbortController } | null = null;
  /** The last one read, to hand out without reading the file each time. */
  private last: DjBeats | null = null;

  constructor(
    dataDir: string,
    /** The status of `url` changed: tell the roof. */
    private changed: (url: string) => void,
    private hear: Hear = defaultHear(),
  ) {
    this.dir = path.join(dataDir, 'dj-beats');
  }

  private file(url: string): string {
    return path.join(this.dir, `${createHash('sha1').update(url).digest('hex')}.json`);
  }

  /** What it heard in `url`, when it has. */
  get(url: string): DjBeats | null {
    if (this.last?.url === url) return this.last;
    const f = this.file(url);
    if (!existsSync(f)) return null;
    try {
      const b = JSON.parse(readFileSync(f, 'utf8')) as unknown;
      if (!isDjBeats(b) || b.url !== url) return null;
      return (this.last = b);
    } catch {
      return null;
    }
  }

  /** How hearing `url` is going (undefined: not asked). */
  statusOf(url: string): DjBeatsStatus | undefined {
    const s = this.status.get(url);
    if (s) return s;
    const b = this.get(url);
    return b ? { status: 'ready', bpm: b.bpm } : undefined;
  }

  /** The set that's on now (null: none): hears it, unless it has (or couldn't), and stops hearing any other. */
  want(set: DjSet | null) {
    if (this.job && this.job.url !== set?.url) {
      this.job.abort.abort();
      this.status.delete(this.job.url);
      this.job = null;
    }
    if (!set || this.job || this.statusOf(set.url)) return;
    const url = set.url;
    const abort = new AbortController();
    this.job = { url, abort };
    this.status.set(url, { status: 'pending' });
    this.changed(url);
    const mine = () => this.job?.abort === abort;
    void this.hear(set, abort.signal).then(
      (b) => {
        if (!mine()) return;
        this.job = null;
        this.save(b);
        this.status.set(url, { status: 'ready', bpm: b.bpm });
        this.changed(url);
      },
      (e: unknown) => {
        if (!mine()) return;
        this.job = null;
        const why = e instanceof BeatsError ? e.message : 'the set could not be fetched';
        if (!(e instanceof BeatsError)) console.warn(`[dj] couldn't hear ${url}: ${e instanceof Error ? e.message : e}`);
        this.status.set(url, { status: 'failed', why });
        this.changed(url);
      },
    );
  }

  private save(b: DjBeats) {
    this.last = b;
    try {
      mkdirSync(this.dir, { recursive: true });
      writeFileSync(this.file(b.url), JSON.stringify(b), { mode: 0o600 });
      // The oldest go once there are too many.
      const files = readdirSync(this.dir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => ({ f, at: statSync(path.join(this.dir, f)).mtimeMs }))
        .sort((a, b) => b.at - a.at);
      for (const { f } of files.slice(KEEP)) rmSync(path.join(this.dir, f), { force: true });
    } catch {
      // disk issues shouldn't take the office down: it's heard again next time
    }
  }
}

/** hearSet with the tools on this machine, looked for once. */
function defaultHear(): Hear {
  let tools: BeatTools | null = null;
  // Looked for again while yt-dlp is missing, so installing it needs no restart.
  return (set, signal) => hearSet(set, (tools = tools?.ytdlp ? tools : findTools()), signal);
}
