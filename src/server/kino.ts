import path from 'node:path';
import type { KinoClientMsg, KinoScreenState, KinoServerMsg } from '../shared/kino.js';
import { TV_SITES, parseTvUrl, sameTvStream, tvTitle, type TvStream } from '../shared/tv.js';
import { LinkPlayer, type TitleLookup } from './embeds.js';
import { tvTitleLookup } from './tv.js';

/*
 * The cinema's Saal 2 (flrnoh fork, see FORK.md "The cinema"): anyone on a floor (guests and party
 * guests too: it's play) puts a YouTube or Twitch link on its screen, like the office TV, and everyone
 * in there sees it from the same moment. Each floor's street has its own cinema, so each floor keeps
 * its own Saal 2 in its .agent-office folder (kino.json). Saal 1's programme needs nothing kept: it
 * runs on the office's clock (shared/kino.ts).
 */

export class KinoScreen extends LinkPlayer<TvStream> {
  constructor(dataDir: string, lookup: TitleLookup<TvStream> = tvTitleLookup) {
    super({ file: path.join(dataDir, 'kino.json'), parse: parseTvUrl, same: sameTvStream, lookup });
  }
}

/** Each floor's Saal 2, made the first time someone there asks. */
export class KinoScreens {
  private byFloor = new Map<string, KinoScreen>();

  constructor(private lookup: TitleLookup<TvStream> = tvTitleLookup) {}

  /** Floor `id`'s, kept in its project's .agent-office folder (`dir`). */
  of(floor: { id: string; dir: string }): KinoScreen {
    let s = this.byFloor.get(floor.id);
    if (!s) this.byFloor.set(floor.id, (s = new KinoScreen(path.join(floor.dir, '.agent-office'), this.lookup)));
    return s;
  }

  /** What's on in a floor's Saal 2, for someone arriving there. */
  view(floor: { id: string; dir: string } | undefined): KinoScreenState | undefined {
    return floor ? this.of(floor).state() : undefined;
  }
}

export interface KinoHooks {
  id: string;
  who: string;
  /** Whether the building is the office (the city and its cinema are the office map's). */
  office: boolean;
  /** To everyone on the sender's floor (its street, and the cinema on it, are theirs). */
  toFloor(msg: KinoServerMsg | { t: 'toast'; text: string; level: 'info' }): void;
  warn(text: string): void;
}

/** kino.play and kino.stop, from someone on a floor: not too often, only what the TV would play. */
export function kinoMessage(screen: KinoScreen | undefined, msg: KinoClientMsg, c: KinoHooks) {
  if (!screen) return c.warn('Head to a floor: the cinema is down on its street');
  if (!c.office) return c.warn('The cinema is in the office’s city: switch the building back to the office');
  if (msg.t === 'kino.stop') {
    if (!screen.state().set) return;
    if (!screen.allow(c.id)) return c.warn('Easy there, give the projectionist a moment');
    if (!screen.stop(c.who)) return;
    c.toFloor({ t: 'kino', state: screen.state() });
    return c.toFloor({ t: 'toast', text: `🎬 ${c.who} turned Saal 2’s screen off`, level: 'info' });
  }
  const parsed = parseTvUrl(msg.url);
  if ('error' in parsed) return c.warn(parsed.error.replace('The TV only plays', 'Saal 2 only plays'));
  if (sameTvStream(screen.state().set, parsed)) return c.warn('That’s already on in Saal 2');
  if (!screen.allow(c.id)) return c.warn('Easy there, give the projectionist a moment');
  const r = screen.play(msg.url, c.who);
  if ('error' in r) return c.warn(r.error);
  if (!r.changed) return c.warn('That’s already on in Saal 2');
  const { startedAt } = screen.state();
  c.toFloor({ t: 'kino', state: screen.state() });
  void r.titled.then(() => {
    const now = screen.state();
    if (!now.set || now.startedAt !== startedAt) return;
    if (now.set.title) c.toFloor({ t: 'kino', state: now });
    const what = now.set.title || now.set.live ? tvTitle(now.set) : `a ${TV_SITES[now.set.kind]} video`;
    c.toFloor({ t: 'toast', text: `🎬 ${c.who} put on ${what} in Saal 2`, level: 'info' });
  });
}
