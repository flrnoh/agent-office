import path from 'node:path';
import type { ClientMsg, ServerMsg } from '../shared/protocol.js';
import { TV_SITES, parseTvUrl, sameTvStream, tvTitle, type TvStream } from '../shared/tv.js';
import { LinkPlayer, oembed, type TitleLookup } from './embeds.js';

/*
 * Streams on the office TV (flrnoh fork, see FORK.md). Each floor's TV keeps what's on in its
 * .agent-office folder as tv.json, like the jukebox; every browser on the floor plays it on the TV
 * in the site's own player (client/tv.ts), from the same moment. Kept the same way as the DJ booth's
 * sets (embeds.ts).
 */

/** YouTube's oEmbed for a video's title; Twitch has none to ask without a key, so a channel goes by its name. */
export const tvTitleLookup: TitleLookup<TvStream> = async (set) => (set.kind === 'youtube' ? oembed('https://www.youtube.com/oembed?format=json&url=', set.url) : undefined);

export class OfficeTv extends LinkPlayer<TvStream> {
  constructor(dataDir: string, lookup: TitleLookup<TvStream> = tvTitleLookup) {
    super({ file: path.join(dataDir, 'tv.json'), parse: parseTvUrl, same: sameTvStream, lookup });
  }
}

export interface TvHooks {
  /** The sender's client id and name. */
  id: string;
  who: string;
  /** Whether the building is the office (the TV is in its lounge; other maps have none). */
  office: boolean;
  /** To everyone on the sender's floor. */
  toFloor(msg: ServerMsg): void;
  /** Just to the sender, when it didn't happen. */
  warn(text: string): void;
}

/** tv.play and tv.stop, from someone on a floor (guests too): not too often. */
export function tvMessage(tv: OfficeTv | undefined, msg: Extract<ClientMsg, { t: 'tv.play' | 'tv.stop' }>, c: TvHooks) {
  if (!tv) return c.warn('Head to a floor to use its TV');
  if (!c.office) return c.warn('The TV is in the office’s lounge: switch the building back to the office');
  if (msg.t === 'tv.stop') {
    if (!tv.state().set) return;
    if (!tv.allow(c.id)) return c.warn('Easy there, give the TV a moment');
    if (!tv.stop(c.who)) return;
    c.toFloor({ t: 'tv', state: tv.state() });
    return c.toFloor({ t: 'toast', text: `📺 ${c.who} turned the TV off`, level: 'info' });
  }
  const parsed = parseTvUrl(msg.url);
  if ('error' in parsed) return c.warn(parsed.error);
  if (sameTvStream(tv.state().set, parsed)) return c.warn('That’s already on the TV');
  if (!tv.allow(c.id)) return c.warn('Easy there, give the TV a moment');
  const r = tv.play(msg.url, c.who);
  if ('error' in r) return c.warn(r.error);
  if (!r.changed) return c.warn('That’s already on the TV');
  const { startedAt } = tv.state();
  c.toFloor({ t: 'tv', state: tv.state() });
  void r.titled.then(() => {
    const now = tv.state();
    // Only if it's still the one they put on.
    if (!now.set || now.startedAt !== startedAt) return;
    if (now.set.title) c.toFloor({ t: 'tv', state: now });
    const what = now.set.title || now.set.live ? tvTitle(now.set) : `a ${TV_SITES[now.set.kind]} video`;
    c.toFloor({ t: 'toast', text: `📺 ${c.who} put on ${what}`, level: 'info' });
  });
}
