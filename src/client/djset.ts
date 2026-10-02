import { DJ_SET_SITES, djSetTitle, sameDjSet, type DjSet, type DjSetState } from '../shared/djset';
import { EmbedPlayer, embedFrame, loadScript, youtubeDeck, type Deck, type DeckEvents, type EmbedHooks, type EmbedPhase } from './embeds';

/*
 * DJ sets on the roof (flrnoh fork, see FORK.md): plays the set someone put on at the DJ booth in the
 * site's own embedded player (YouTube, SoundCloud or Mixcloud), off the edge of the page. Keeping it
 * in step, at the right volume, is embeds.ts's (shared with the office TV); here are the SoundCloud
 * and Mixcloud players, where the decks live, and the house DJ's say.
 */

/** How this page is getting on with the set. */
export type DjSetPhase = EmbedPhase;

/** How loud it should be where you stand, 0–1, is OfficeSound.djSetVolume. */
export type DjSetHooks = EmbedHooks;

// ---- The sites' player APIs, as much of them as this uses ------------------------------------------

interface SCWidget {
  bind(ev: string, fn: (e?: unknown) => void): void;
  play(): void;
  pause(): void;
  seekTo(ms: number): void;
  setVolume(v: number): void;
  getPosition(cb: (ms: number) => void): void;
  getDuration(cb: (ms: number) => void): void;
  getCurrentSound(cb: (s: { title?: string; kind?: string } | null) => void): void;
}
interface SCNamespace {
  Widget: ((el: HTMLIFrameElement) => SCWidget) & { Events: Record<string, string> };
}
interface MixEvent {
  on(fn: (...a: unknown[]) => void): void;
}
interface MixWidget {
  ready: Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(s: number): Promise<boolean>;
  getPosition(): Promise<number>;
  getDuration(): Promise<number>;
  setVolume?(v: number): Promise<void>;
  events: Record<string, MixEvent | undefined>;
}
interface MixNamespace {
  PlayerWidget(el: HTMLIFrameElement): MixWidget;
}
type Globals = { SC?: SCNamespace; Mixcloud?: MixNamespace };
const g = window as unknown as Globals;

const loadSoundCloud = () => loadScript('https://w.soundcloud.com/player/api.js', () => !!g.SC?.Widget);
const loadMixcloud = () => loadScript('https://widget.mixcloud.com/media/js/widgetApi.js', () => !!g.Mixcloud?.PlayerWidget);

/** Where the players live: off the page, but laid out, since some players won't play when hidden. */
function deckHost(): HTMLElement {
  let el = document.getElementById('dj-decks');
  if (!el) {
    el = document.createElement('div');
    el.id = 'dj-decks';
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText = 'position:fixed;left:-10000px;top:0;width:320px;height:200px;overflow:hidden;pointer-events:none;opacity:0';
    document.body.append(el);
  }
  return el;
}

const frame = (src: string) => embedFrame(src, deckHost());

const djYoutubeDeck = (set: DjSet, at: () => number, on: DeckEvents): Promise<Deck> => youtubeDeck(set.id, at, on, deckHost());

async function soundcloudDeck(set: DjSet, at: () => number, on: DeckEvents): Promise<Deck> {
  await loadSoundCloud();
  const f = frame(`https://w.soundcloud.com/player/?url=${encodeURIComponent(set.id)}&auto_play=false&visual=false&show_artwork=false&buying=false&sharing=false&download=false&show_comments=false`);
  const w = g.SC!.Widget(f);
  const E = g.SC!.Widget.Events;
  let duration: number | undefined;
  // A set (a playlist) can't be joined halfway through: it plays from its top.
  let single = true;
  let joined = false;
  w.bind(E.READY, () => {
    w.getCurrentSound((s) => {
      if (s?.title) on.title(s.title);
    });
    single = !set.id.includes('/sets/');
    if (single) w.getDuration((ms) => (duration = ms > 0 ? ms / 1000 : undefined));
    on.ready();
  });
  // SoundCloud ignores a seek before it's playing: the first time it starts, it goes to the right bit.
  w.bind(E.PLAY, () => {
    if (!joined && single && at() > 1) w.seekTo(at() * 1000);
    joined = true;
    on.playing();
  });
  w.bind(E.PAUSE, () => on.paused());
  w.bind(E.FINISH, () => on.ended());
  w.bind(E.ERROR, () => on.error("SoundCloud wouldn't play it"));
  return {
    play: () => w.play(),
    pause: () => w.pause(),
    seek: (s) => {
      if (single) w.seekTo(s * 1000);
    },
    setVolume: (v) => w.setVolume(Math.round(v * 100)),
    position: () => (single ? new Promise((resolve) => w.getPosition((ms) => resolve(ms / 1000))) : Promise.resolve(undefined)),
    duration: () => (single ? duration : undefined),
    destroy: () => f.remove(),
  };
}

async function mixcloudDeck(set: DjSet, at: () => number, on: DeckEvents): Promise<Deck> {
  await loadMixcloud();
  const f = frame(`https://www.mixcloud.com/widget/iframe/?feed=${encodeURIComponent(set.id)}&hide_cover=1&mini=1&hide_artwork=1`);
  const w = g.Mixcloud!.PlayerWidget(f);
  let duration: number | undefined;
  let joined = false;
  const quiet = (p: Promise<unknown> | undefined) => void p?.catch(() => {});
  void w.ready.then(
    () => {
      w.events.play?.on(() => {
        // Mixcloud may not let a show be joined halfway (its licence): then it plays from the top.
        if (!joined && at() > 1) quiet(w.seek(at()));
        joined = true;
        on.playing();
      });
      w.events.pause?.on(() => on.paused());
      w.events.ended?.on(() => on.ended());
      w.events.error?.on(() => on.error("Mixcloud wouldn't play it"));
      void w.getDuration().then((d) => (duration = d > 0 ? d : undefined), () => {});
      on.ready();
    },
    () => on.error("Mixcloud's player didn't start"),
  );
  return {
    play: () => quiet(w.play()),
    pause: () => quiet(w.pause()),
    seek: (s) => quiet(w.seek(s)),
    setVolume: (v) => quiet(w.setVolume?.(v)),
    position: () => w.getPosition().then((p) => p, () => undefined),
    duration: () => duration,
    destroy: () => f.remove(),
  };
}

const DECKS = { youtube: djYoutubeDeck, soundcloud: soundcloudDeck, mixcloud: mixcloudDeck };

export class DjSetPlayer extends EmbedPlayer<DjSet> {
  constructor(hooks: DjSetHooks) {
    super(hooks, {
      decks: DECKS,
      site: (set) => DJ_SET_SITES[set.kind],
      fallbackTitle: djSetTitle,
      same: sameDjSet,
      cantPlay: (why) => `🎧 Can't play the set here: ${why}. The house DJ takes over for you.`,
      clickToHear: '🎧 Click to hear the set',
    });
  }

  /** Whether you're up on the roof. */
  setUp(up: boolean) {
    this.setOn(up);
  }

  /** What's on, with how the office hearing it is going and any tempo tapped for it. */
  override current(): DjSetState {
    return super.current() as DjSetState;
  }

  /** Where the set's own player is in it, in seconds, when it says (for the lights, see features/djset/frame.ts). */
  heardAt(): Promise<number | undefined> {
    return this.phase() === 'playing' && this.deck ? this.deck.position().catch(() => undefined) : Promise.resolve(undefined);
  }

  /** Where everyone is in the set, in seconds, by the office's clock. */
  expectedAt(now: number): number {
    const s = this.current();
    return s.set ? s.set.start + Math.max(0, now - s.startedAt) / 1000 : 0;
  }

  /** Whether the house DJ keeps quiet: while a set is on and this page hasn't given up on it. */
  silencesHouse(): boolean {
    return !!this.current().set && this.phase() !== 'failed' && this.phase() !== 'ended';
  }
}
