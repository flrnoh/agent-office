import { existsSync, readFileSync, writeFileSync } from 'node:fs';

/*
 * What's on in a site's embedded player, for everyone in one place (flrnoh fork, see FORK.md): the
 * DJ booth on the roof (djset.ts) and each floor's TV (tv.ts). The office only keeps what's on and
 * since when, saved to a file; every browser plays it in the site's own player, from that moment.
 */

/** Something a pasted link put on: its tidied link, and a title once the site has said. */
export interface Playable {
  url: string;
  title?: string;
}

export interface PlayingState<S> {
  set: S | null;
  by?: string;
  startedAt: number;
  elapsed: number;
}

interface Saved<S> {
  set: S | null;
  by?: string;
  startedAt: number;
}

/** Asks the site what something is called; undefined when it won't say. */
export type TitleLookup<S> = (set: S) => Promise<string | undefined>;

/** The least time between two changes by one person (ms): enough for a tap on Play, not for a flood. */
export const CHANGE_EVERY = 3000;

export const cleanTitle = (t: string): string | undefined => t.replace(/\s+/g, ' ').trim().slice(0, 120) || undefined;

/** A site's oEmbed answer's title, for a link (the endpoint is the office's own, never the page's); a few seconds at most. */
export async function oembed(endpoint: string, url: string): Promise<string | undefined> {
  try {
    const res = await fetch(endpoint + encodeURIComponent(url), { signal: AbortSignal.timeout(4000), redirect: 'follow' });
    if (!res.ok) return undefined;
    const text = await res.text();
    if (text.length > 200_000) return undefined;
    const title = (JSON.parse(text) as { title?: unknown }).title;
    return typeof title === 'string' ? cleanTitle(title) : undefined;
  } catch {
    return undefined;
  }
}

export interface LinkPlayerOptions<S> {
  /** Where it's saved. */
  file: string;
  /** Reads a pasted link (and a saved one, again, so a hand-edited file can't smuggle anything in). */
  parse(raw: unknown): S | { error: string };
  same(a: S | null | undefined, b: S | null | undefined): boolean;
  lookup: TitleLookup<S>;
}

/** What's on, who put it on and when; saved; not changed too often by any one person. */
export class LinkPlayer<S extends Playable> {
  private s: Saved<S> = { set: null, startedAt: Date.now() };
  /** When each person last changed it (by client id), for CHANGE_EVERY. */
  private lastChange = new Map<string, number>();

  constructor(private o: LinkPlayerOptions<S>) {
    this.load();
  }

  state(): PlayingState<S> {
    const { set, by, startedAt } = this.s;
    return { set, ...(by ? { by } : {}), startedAt, elapsed: Math.max(0, Date.now() - startedAt) };
  }

  /**
   * Puts on what a link points to. The same again changes nothing (it plays on); a link it can't
   * play says why. `titled` resolves once the site has said what it's called (or wouldn't).
   */
  play(raw: unknown, by: string): { changed: false } | { changed: true; titled: Promise<void> } | { error: string } {
    const set = this.o.parse(raw);
    if ('error' in set) return set;
    if (this.o.same(this.s.set, set)) return { changed: false };
    this.s = { set, by, startedAt: Date.now() };
    this.save();
    return { changed: true, titled: this.fetchTitle(set) };
  }

  /** Off; false when it already was. */
  stop(by: string): boolean {
    if (!this.s.set) return false;
    this.s = { set: null, by, startedAt: Date.now() };
    this.save();
    return true;
  }

  /** Whether `who` may change it now (and, if so, counts it). */
  allow(who: string, now = Date.now()): boolean {
    const last = this.lastChange.get(who) ?? -Infinity;
    if (now - last < CHANGE_EVERY) return false;
    this.lastChange.set(who, now);
    for (const [k, t] of this.lastChange) if (now - t > 60_000) this.lastChange.delete(k);
    return true;
  }

  private async fetchTitle(set: S): Promise<void> {
    const title = await this.o.lookup(set).catch(() => undefined);
    // Someone may have put another one on while the site was answering.
    if (!title || this.s.set !== set) return;
    this.s = { ...this.s, set: { ...set, title } };
    this.save();
  }

  private load() {
    if (!existsSync(this.o.file)) return;
    try {
      const s = JSON.parse(readFileSync(this.o.file, 'utf8')) as Partial<Saved<S>>;
      const startedAt = typeof s.startedAt === 'number' && Number.isFinite(s.startedAt) ? s.startedAt : Date.now();
      const by = typeof s.by === 'string' ? s.by.slice(0, 24) : undefined;
      // Read back through the same check as a pasted link, so a hand-edited file can't smuggle anything in.
      const parsed = s.set && typeof s.set === 'object' ? this.o.parse(s.set.url) : null;
      const title = typeof s.set?.title === 'string' ? cleanTitle(s.set.title) : undefined;
      const set = parsed && !('error' in parsed) ? { ...parsed, ...(title ? { title } : {}) } : null;
      this.s = { set, ...(by ? { by } : {}), startedAt };
    } catch {
      // a broken file just means nothing's on
    }
  }

  private save() {
    try {
      writeFileSync(this.o.file, JSON.stringify(this.s, null, 2), { mode: 0o600 });
    } catch {
      // disk issues shouldn't take the office down
    }
  }
}
