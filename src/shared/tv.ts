// Streams on the office TV (flrnoh fork, see FORK.md): a YouTube or Twitch link someone put on at the
// lounge TV, which every browser on that floor plays on the TV, from the same point. Shared by the
// server (which keeps what's on, per floor) and the browser. Screen sharing still wins the TV.

import { hms, readWebLink, startOf, youtubeVideo } from './embeds.js';

export type TvKind = 'youtube' | 'twitch';

export interface TvStream {
  kind: TvKind;
  /** A YouTube video id; on Twitch a channel's name (live) or a past broadcast's number (a VOD). */
  id: string;
  /** A Twitch channel, live: nothing to seek in, it just plays what's on now. */
  live?: true;
  /** The link, tidied up: what "open it" goes to, and what tells a repeat from a new stream. */
  url: string;
  /** Where in it to begin, in seconds (a link's t=), before the time since it was put on. */
  start: number;
  /** Its title, once known (YouTube's oEmbed; a Twitch channel's name). */
  title?: string;
}

export interface TvState {
  /** What's on; null while the TV is off (or only showing a shared screen). */
  set: TvStream | null;
  /** Who put it on, or last turned it off. */
  by?: string;
  /** When it was put on, on the office's clock (see the 'pong' message), so everyone sees the same bit. */
  startedAt: number;
  /** How long ago that was when this was sent, in ms, for until the clocks are compared. */
  elapsed: number;
}

export const TV_SITES: Record<TvKind, string> = { youtube: 'YouTube', twitch: 'Twitch' };

export const TV_HINT = 'Paste a YouTube or Twitch link';

const TWITCH_HOSTS = new Set(['twitch.tv', 'www.twitch.tv', 'm.twitch.tv', 'player.twitch.tv']);
/** Twitch's names: 3 (old ones) to 25 letters, digits and underscores. */
const CHANNEL = /^[A-Za-z0-9_]{3,25}$/;
const VIDEO = /^v?(\d{1,15})$/;
/** Twitch's own pages, not channels. */
const TWITCH_PAGES = new Set([
  'directory', 'videos', 'p', 'settings', 'downloads', 'jobs', 'search', 'subscriptions', 'inventory', 'wallet', 'drops',
  'friends', 'messages', 'turbo', 'prime', 'store', 'login', 'signup', 'logout', 'following', 'bits', 'u', 'moderator',
  'popout', 'embed', 'clip', 'clips', 'collections', 'team', 'broadcast', 'creatorcamp', 'privacy', 'legal', 'security',
  'user', 'dashboard', 'products', 'redeem', 'annual-recap', 'event', 'events', 'activate',
]);

const channelOf = (name: string): TvStream => ({ kind: 'twitch', id: name.toLowerCase(), live: true, url: `https://www.twitch.tv/${name.toLowerCase()}`, start: 0 });
const videoOf = (id: string, start: number): TvStream => ({ kind: 'twitch', id, url: `https://www.twitch.tv/videos/${id}${start ? `?t=${hms(start)}` : ''}`, start });

/**
 * Reads a pasted link into something the TV can play, or says, in a friendly way, why not. Only
 * YouTube (one video, live ones too) and Twitch (a channel, live; or a past broadcast, from its t=),
 * by their exact host names, over http(s), with no password or port in the link; anything else
 * (another site, a lookalike host, javascript: or data:, Twitch clips) is refused.
 */
export function parseTvUrl(raw: unknown): TvStream | { error: string } {
  const link = readWebLink(raw, TV_HINT, 'on the TV');
  if ('error' in link) return link;
  const { u, host, parts } = link;

  const yt = youtubeVideo(link);
  if (yt) return 'error' in yt ? yt : { kind: 'youtube', ...yt };

  if (host === 'clips.twitch.tv') return { error: 'Twitch clips can’t go on the TV: paste a channel or a past broadcast' };
  if (TWITCH_HOSTS.has(host)) {
    const start = startOf(u, 't', 'time');
    // The player's own address: player.twitch.tv/?channel=… or ?video=v…
    if (host === 'player.twitch.tv') {
      const channel = u.searchParams.get('channel');
      const video = VIDEO.exec(u.searchParams.get('video') ?? '');
      if (parts.length === 0 && channel && CHANNEL.test(channel)) return channelOf(channel);
      if (parts.length === 0 && video) return videoOf(video[1], start);
      return { error: 'Paste a link to one Twitch channel or past broadcast' };
    }
    const [first, second, third] = parts;
    // twitch.tv/videos/123 and twitch.tv/<channel>/video/123
    const video = first === 'videos' && parts.length === 2 ? VIDEO.exec(second) : second === 'video' && parts.length === 3 ? VIDEO.exec(third) : null;
    if (video) return videoOf(video[1], start);
    if (second === 'clip' || second === 'clips') return { error: 'Twitch clips can’t go on the TV: paste a channel or a past broadcast' };
    if (parts.length === 1 && CHANNEL.test(first) && !TWITCH_PAGES.has(first.toLowerCase())) return channelOf(first);
    return { error: 'Paste a link to one Twitch channel or past broadcast' };
  }

  return { error: `The TV only plays YouTube and Twitch. ${TV_HINT}` };
}

/** Its title, or what it is until the title's known. */
export function tvTitle(set: Pick<TvStream, 'kind' | 'title' | 'id' | 'live'>): string {
  if (set.title) return set.title;
  if (set.kind === 'twitch') return set.live ? `${set.id} live on Twitch` : 'a Twitch video';
  return 'a YouTube video';
}

/** Whether two links are the same thing (and so the second doesn't start it again). */
export function sameTvStream(a: TvStream | null | undefined, b: TvStream | null | undefined): boolean {
  return !!a && !!b && a.kind === b.kind && a.id === b.id && a.start === b.start && !!a.live === !!b.live;
}
