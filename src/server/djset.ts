import path from 'node:path';
import { DJ_SET_SITES, djSetTitle, parseDjSetUrl, sameDjSet, type DjSet } from '../shared/djset.js';
import type { ClientMsg, ServerMsg } from '../shared/protocol.js';
import { CHANGE_EVERY, LinkPlayer, oembed, type TitleLookup as LookupOf } from './embeds.js';

/*
 * DJ sets on the roof (flrnoh fork, see FORK.md). The roof has no Floor of its own, so the office
 * keeps one booth for the whole building, saved in its data folder as dj.json. Like the jukebox it
 * only says what's on and since when; every browser on the roof plays it in the site's own player.
 * What's kept and how is embeds.ts's, shared with the office TV (tv.ts).
 */

/** Asks the site what a set is called; undefined when it won't say. */
export type TitleLookup = LookupOf<DjSet>;

/** The least time between two changes by one person (ms): enough for a tap on Play, not for a flood. */
export const DJ_CHANGE_EVERY = CHANGE_EVERY;

const OEMBED: Record<DjSet['kind'], string> = {
  youtube: 'https://www.youtube.com/oembed?format=json&url=',
  soundcloud: 'https://soundcloud.com/oembed?format=json&url=',
  mixcloud: 'https://app.mixcloud.com/oembed/?format=json&url=',
};

/** The site's oEmbed answer for the set's own (tidied) link, from these three hosts only; a few seconds at most. */
export const oembedTitle: TitleLookup = (set) => oembed(OEMBED[set.kind], set.url);

export class DjBooth extends LinkPlayer<DjSet> {
  constructor(dataDir: string, lookup: TitleLookup = oembedTitle) {
    super({ file: path.join(dataDir, 'dj.json'), parse: parseDjSetUrl, same: sameDjSet, lookup });
  }
}

export interface DjHooks {
  /** The sender's client id, name, and whether they're on the roof now. */
  id: string;
  who: string;
  onRoof: boolean;
  /** To everyone on the roof. */
  toRoof(msg: ServerMsg): void;
  /** Just to the sender, when it didn't happen. */
  warn(text: string): void;
}

/** dj.play and dj.stop, from someone's page: only from up on the roof, not too often. */
export function djMessage(booth: DjBooth, msg: Extract<ClientMsg, { t: 'dj.play' | 'dj.stop' }>, c: DjHooks) {
  if (!c.onRoof) return c.warn('Head up to the roof to pick what the DJ plays');
  if (msg.t === 'dj.stop') {
    if (!booth.allow(c.id)) return c.warn('Easy there, give the DJ a moment');
    if (!booth.stop(c.who)) return;
    c.toRoof({ t: 'dj', state: booth.state() });
    return c.toRoof({ t: 'toast', text: `🎧 ${c.who} gave the decks back to the house DJ`, level: 'info' });
  }
  const parsed = parseDjSetUrl(msg.url);
  if ('error' in parsed) return c.warn(parsed.error);
  if (sameDjSet(booth.state().set, parsed)) return c.warn('That set is already on');
  if (!booth.allow(c.id)) return c.warn('Easy there, give the DJ a moment');
  const r = booth.play(msg.url, c.who);
  if ('error' in r) return c.warn(r.error);
  if (!r.changed) return c.warn('That set is already on');
  const { startedAt } = booth.state();
  c.toRoof({ t: 'dj', state: booth.state() });
  void r.titled.then(() => {
    const now = booth.state();
    // Only if it's still the one they put on.
    if (!now.set || now.startedAt !== startedAt) return;
    if (now.set.title) c.toRoof({ t: 'dj', state: now });
    c.toRoof({ t: 'toast', text: `🎧 ${c.who} put on a set: ${now.set.title ? djSetTitle(now.set) : `from ${DJ_SET_SITES[now.set.kind]}`}`, level: 'info' });
  });
}
