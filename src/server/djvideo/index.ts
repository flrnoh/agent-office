import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, utimesSync } from 'node:fs';
import path from 'node:path';
import type { DjSet, DjVideoStatus } from '../../shared/djset.js';
import { BeatsError } from '../djbeats/fetch.js';
import { fetchVideo } from './fetch.js';

/*
 * The YouTube sets' videos for the roof's LED wall (flrnoh fork, see FORK.md "The set's video on the
 * LED wall"): one at a time, the set that's on, after its beats are heard (djbeats/), never alongside,
 * so the lights get theirs first. A new set stops fetching the last. The copies are kept in the data
 * folder (dj-video/, by link), only the last few: a set put on again is ready at once.
 */

/** Fetches a set's video into `dir` as `<name>.dl.mp4`: fetch.ts' fetchVideo, or a stand-in in tests. */
export type FetchVideo = (set: DjSet, dir: string, name: string, signal: AbortSignal) => Promise<string>;

/** How many sets' videos it keeps (a 144p copy of a two-hour set is about 100 MB). */
export const KEEP_VIDEOS = 3;

export class DjVideoJobs {
  readonly dir: string;
  private status = new Map<string, DjVideoStatus>();
  private job: { url: string; abort: AbortController } | null = null;

  constructor(
    dataDir: string,
    /** The status of `url` changed: tell the roof. */
    private changed: (url: string) => void,
    private fetcher: FetchVideo = fetchVideo,
  ) {
    this.dir = path.join(dataDir, 'dj-video');
    // What a fetch cut short by a restart left behind.
    try {
      for (const f of readdirSync(this.dir)) if (f.includes('.dl.')) rmSync(path.join(this.dir, f), { force: true });
    } catch {
      // no folder yet
    }
  }

  /** Its name in the folder (and the key browsers fetch it by): from its link only, so nothing else can be asked for. */
  static key(url: string): string {
    return createHash('sha1').update(url).digest('hex').slice(0, 20);
  }

  private file(url: string): string {
    return path.join(this.dir, `${DjVideoJobs.key(url)}.mp4`);
  }

  /** The kept copy of `url`'s video, when there is one. */
  fileOf(url: string): string | null {
    const f = this.file(url);
    return existsSync(f) ? f : null;
  }

  /** How fetching `url`'s video is going (undefined: not asked). */
  statusOf(url: string): DjVideoStatus | undefined {
    return this.fileOf(url) ? { status: 'ready', key: DjVideoJobs.key(url) } : this.status.get(url);
  }

  /**
   * The set that's on (null: none, or not a YouTube one) and whether it may start now (`go`: its beats
   * are done). Stops fetching any other; a set not yet started says it's coming.
   */
  want(set: DjSet | null, go: boolean) {
    const url = set?.kind === 'youtube' ? set.url : null;
    if (this.job && this.job.url !== url) {
      this.job.abort.abort();
      this.status.delete(this.job.url);
      this.job = null;
    }
    // Others waiting their turn are forgotten (a failure is kept: not tried again and again).
    for (const [u, s] of this.status) if (u !== url && s.status === 'pending') this.status.delete(u);
    if (!url || this.job) return;
    const known = this.statusOf(url);
    if (known?.status === 'ready') return this.touch(url);
    if (known?.status === 'failed') return;
    if (!go) {
      if (!known) {
        this.status.set(url, { status: 'pending' });
        this.changed(url);
      }
      return;
    }
    const abort = new AbortController();
    this.job = { url, abort };
    if (!known) {
      this.status.set(url, { status: 'pending' });
      this.changed(url);
    }
    const mine = () => this.job?.abort === abort;
    const name = DjVideoJobs.key(url);
    void (async () => {
      mkdirSync(this.dir, { recursive: true, mode: 0o700 });
      const got = await this.fetcher(set!, this.dir, name, abort.signal);
      if (!mine()) return rmSync(got, { force: true });
      renameSync(got, this.file(url));
      chmodSync(this.file(url), 0o600);
      this.prune();
    })().then(
      () => {
        if (!mine()) return;
        this.job = null;
        this.status.delete(url);
        this.changed(url);
      },
      (e: unknown) => {
        if (!mine()) return;
        this.job = null;
        const why = e instanceof BeatsError ? e.message : 'the video could not be fetched';
        if (!(e instanceof BeatsError)) console.warn(`[dj] couldn't fetch the video of ${url}: ${e instanceof Error ? e.message : e}`);
        this.status.set(url, { status: 'failed', why });
        this.changed(url);
      },
    );
  }

  /** A copy used again counts as new, so it's the last to go. */
  private touch(url: string) {
    try {
      const now = new Date();
      utimesSync(this.file(url), now, now);
    } catch {
      // gone meanwhile: fetched again next time
    }
  }

  /** Keeps the newest few. */
  private prune() {
    try {
      const files = readdirSync(this.dir)
        .filter((f) => /^[0-9a-f]{20}\.mp4$/.test(f))
        .map((f) => ({ f, at: statSync(path.join(this.dir, f)).mtimeMs }))
        .sort((a, b) => b.at - a.at);
      for (const { f } of files.slice(KEEP_VIDEOS)) rmSync(path.join(this.dir, f), { force: true });
    } catch {
      // disk issues shouldn't take the office down
    }
  }
}
