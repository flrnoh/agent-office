// DJ sets on the roof (flrnoh fork, see FORK.md): a link someone pasted at the DJ booth, from
// YouTube, SoundCloud or Mixcloud, which every browser up there plays in the site's own embedded
// player, from the same point. Shared by the server (which keeps what's on) and the browser.

import { readWebLink, startOf, youtubeVideo } from './embeds.js';

/** How a link's t= reads (shared/embeds.ts, with the office TV's links). */
export { parseStart } from './embeds.js';

export type DjSetKind = 'youtube' | 'soundcloud' | 'mixcloud';

export interface DjSet {
  kind: DjSetKind;
  /**
   * What the embed needs: a YouTube video id, a SoundCloud address (https://soundcloud.com/…, or an
   * on.soundcloud.com short link, which SoundCloud's own player follows), or a Mixcloud show's key (/user/show/).
   */
  id: string;
  /** The link, tidied up: what "open it" goes to, and what tells a repeat from a new set. */
  url: string;
  /** Where in it to begin, in seconds (a link's t=), before the time since it was put on. */
  start: number;
  /** Its title, once the site has told the office (see the server's djset.ts); the site's name until then. */
  title?: string;
}

export interface DjSetState {
  /** The set that's on; null while the house DJ plays (the synthesized set in client/dnb.ts). */
  set: DjSet | null;
  /** Who put it on, or last sent the house DJ back up. */
  by?: string;
  /** When it was put on, on the office's clock (see the 'pong' message), so everyone hears the same bit. */
  startedAt: number;
  /** How long ago that was when this was sent, in ms, for until the clocks are compared. */
  elapsed: number;
}

export const DJ_SET_SITES: Record<DjSetKind, string> = { youtube: 'YouTube', soundcloud: 'SoundCloud', mixcloud: 'Mixcloud' };

const SOUNDCLOUD_HOSTS = new Set(['soundcloud.com', 'www.soundcloud.com', 'm.soundcloud.com']);
const MIXCLOUD_HOSTS = new Set(['mixcloud.com', 'www.mixcloud.com', 'm.mixcloud.com']);

const SLUG = /^[A-Za-z0-9_-]{1,100}$/;
/** Mixcloud's names can be anything, percent-encoded in the link. */
const MIX_SLUG = /^(?:[A-Za-z0-9_.~-]|%[0-9A-Fa-f]{2}){1,200}$/;
/** SoundCloud pages that are a person's lists, not something to play. */
const SC_NOT_A_SET = new Set(['tracks', 'albums', 'popular-tracks', 'reposts', 'likes', 'followers', 'following', 'comments', 'playlists', 'spotlight']);
/** SoundCloud's own pages, not people's. */
const SC_PAGES = new Set(['discover', 'search', 'stream', 'you', 'upload', 'charts', 'pages', 'settings', 'messages', 'notifications', 'people', 'terms-of-use', 'pro', 'jobs', 'imprint', 'mobile', 'stations', 'feed']);
/** Mixcloud's own pages, not people's; and live/, which its player can't play. */
const MIX_PAGES = new Set(['discover', 'live', 'upload', 'settings', 'search', 'dashboard', 'select', 'categories', 'tag', 'favorites', 'about', 'pro', 'developers', 'genres', 'messages', 'notifications']);

export const DJ_SET_HINT = 'Paste a YouTube, SoundCloud or Mixcloud link';

/**
 * Reads a pasted link into a set the booth can play, or says, in a friendly way, why not. Only
 * YouTube, SoundCloud and Mixcloud, by their exact host names, over http(s), with no password or
 * port in the link; anything else (another site, a lookalike host, javascript: or data:) is refused.
 */
export function parseDjSetUrl(raw: unknown): DjSet | { error: string } {
  const link = readWebLink(raw, DJ_SET_HINT, 'at the DJ booth');
  if ('error' in link) return link;
  const { u, host, parts } = link;

  const yt = youtubeVideo(link);
  if (yt) return 'error' in yt ? yt : { kind: 'youtube', ...yt };

  if (host === 'on.soundcloud.com') {
    if (parts.length !== 1 || !/^[A-Za-z0-9]{1,40}$/.test(parts[0])) return { error: 'That SoundCloud link is missing its track' };
    const url = `https://on.soundcloud.com/${parts[0]}`;
    return { kind: 'soundcloud', id: url, url, start: 0 };
  }
  if (SOUNDCLOUD_HOSTS.has(host)) {
    const [user, what, set] = parts;
    const ok =
      !!user && SLUG.test(user) && !SC_PAGES.has(user.toLowerCase()) && !!what && SLUG.test(what) && !SC_NOT_A_SET.has(what.toLowerCase()) &&
      (what === 'sets' ? !!set && SLUG.test(set) && parts.length === 3 : parts.length === 2);
    if (!ok) return { error: 'Paste a link to one SoundCloud track or set' };
    const start = startOf(u, 't');
    const path = parts.join('/');
    return { kind: 'soundcloud', id: `https://soundcloud.com/${path}`, url: `https://soundcloud.com/${path}${start ? `#t=${start}` : ''}`, start };
  }

  if (MIXCLOUD_HOSTS.has(host)) {
    const [user, show] = parts;
    if (parts.length !== 2 || !MIX_SLUG.test(user) || !MIX_SLUG.test(show) || MIX_PAGES.has(user.toLowerCase())) return { error: 'Paste a link to one Mixcloud show' };
    const key = `/${user}/${show}/`;
    return { kind: 'mixcloud', id: key, url: `https://www.mixcloud.com${key}`, start: 0 };
  }

  return { error: `The DJ only plays YouTube, SoundCloud and Mixcloud. ${DJ_SET_HINT}` };
}

/** Its title, or which site it's from until the title's known. */
export function djSetTitle(set: Pick<DjSet, 'kind' | 'title'>): string {
  return set.title || `a ${DJ_SET_SITES[set.kind]} set`;
}

/** Whether two links are the same set (and so the second doesn't start it again). */
export function sameDjSet(a: DjSet | null | undefined, b: DjSet | null | undefined): boolean {
  return !!a && !!b && a.kind === b.kind && a.id === b.id && a.start === b.start;
}
