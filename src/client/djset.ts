import { DJ_SET_SITES, djSetTitle, sameDjSet, type DjSet, type DjSetState } from '../shared/djset';

/*
 * DJ sets on the roof (flrnoh fork, see FORK.md): plays the set someone put on at the DJ booth in the
 * site's own embedded player (YouTube, SoundCloud or Mixcloud), off the edge of the page. Those can't
 * go through Web Audio, so it follows you by hand: the right volume for where you stand, the same bit
 * of the set as everyone else, paused while you're off the roof.
 */

/** How this page is getting on with the set. */
export type DjSetPhase = 'off' | 'loading' | 'playing' | 'blocked' | 'failed' | 'ended' | 'away';

export interface DjSetHooks {
  /** The office's clock, ms (see store.officeNow). */
  now(): number;
  /** How loud it should be where you stand, 0–1 (see OfficeSound.djSetVolume). */
  volume(): number;
  /** Something changed: whether the house DJ should play, the hint, the booth's window. */
  changed(): void;
  toast(text: string, level?: 'info' | 'warn'): void;
}

/** One embedded player, whichever site it's from. */
interface Deck {
  play(): void;
  pause(): void;
  seek(seconds: number): void;
  setVolume(v: number): void;
  /** Where it is now, in seconds, when the player can say. */
  position(): Promise<number | undefined>;
  /** How long the set is, in seconds; undefined for live or not known yet. */
  duration(): number | undefined;
  destroy(): void;
}

interface DeckEvents {
  ready(): void;
  playing(): void;
  paused(): void;
  ended(): void;
  error(text: string): void;
  title(t: string): void;
}

// ---- The sites' player APIs, as much of them as this uses ------------------------------------------

interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(s: number, allowSeekAhead: boolean): void;
  setVolume(v: number): void;
  unMute(): void;
  getCurrentTime(): number;
  getDuration(): number;
  getVideoData?(): { title?: string; isLive?: boolean };
  destroy(): void;
}
interface YTNamespace {
  Player: new (el: HTMLElement, o: { events: Record<string, (e: { data: number; target: YTPlayer }) => void> }) => YTPlayer;
}
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
type Globals = { YT?: YTNamespace; SC?: SCNamespace; Mixcloud?: MixNamespace; onYouTubeIframeAPIReady?: () => void };
const g = window as unknown as Globals;

const scripts = new Map<string, Promise<void>>();
/** A site's player script, once (and a failed load may be tried again). */
function loadScript(src: string, ready: () => boolean, waitFor?: (done: () => void) => void): Promise<void> {
  if (ready()) return Promise.resolve();
  let p = scripts.get(src);
  if (p) return p;
  p = new Promise<void>((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    el.onerror = () => {
      scripts.delete(src);
      el.remove();
      reject(new Error('blocked'));
    };
    if (waitFor) waitFor(resolve);
    else el.onload = () => (ready() ? resolve() : reject(new Error('no api')));
    document.head.append(el);
  });
  scripts.set(src, p);
  return p;
}

const loadYouTube = () =>
  loadScript(
    'https://www.youtube.com/iframe_api',
    () => !!g.YT?.Player,
    (done) => {
      const before = g.onYouTubeIframeAPIReady;
      g.onYouTubeIframeAPIReady = () => {
        before?.();
        done();
      };
    },
  );
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

function frame(src: string): HTMLIFrameElement {
  const f = document.createElement('iframe');
  f.width = '320';
  f.height = '200';
  f.allow = 'autoplay; encrypted-media';
  // The office's pages send no referrer, and YouTube's player refuses to start without one.
  f.referrerPolicy = 'strict-origin-when-cross-origin';
  f.tabIndex = -1;
  f.src = src;
  deckHost().append(f);
  return f;
}

const YT_ERRORS: Record<number, string> = {
  2: "that video link doesn't work",
  5: "the video won't play in this browser",
  100: 'the video is gone or private',
  101: "its owner doesn't allow playing it elsewhere",
  150: "its owner doesn't allow playing it elsewhere",
  153: "YouTube wouldn't start its player here",
};

async function youtubeDeck(set: DjSet, at: () => number, on: DeckEvents): Promise<Deck> {
  await loadYouTube();
  const f = frame(`https://www.youtube.com/embed/${set.id}?enablejsapi=1&controls=0&disablekb=1&playsinline=1&rel=0&start=${Math.floor(at())}&origin=${encodeURIComponent(location.origin)}`);
  let p: YTPlayer | undefined;
  let live = false;
  new g.YT!.Player(f, {
    events: {
      onReady: (e) => {
        p = e.target;
        const data = p.getVideoData?.();
        live = !!data?.isLive;
        if (data?.title) on.title(data.title);
        on.ready();
      },
      onStateChange: (e) => {
        if (e.data === 1) on.playing();
        else if (e.data === 2) on.paused();
        else if (e.data === 0) on.ended();
      },
      onError: (e) => on.error(YT_ERRORS[e.data] ?? "YouTube wouldn't play it"),
    },
  });
  return {
    play: () => p?.playVideo(),
    pause: () => p?.pauseVideo(),
    seek: (s) => !live && p?.seekTo(s, true),
    setVolume: (v) => {
      p?.unMute();
      p?.setVolume(Math.round(v * 100));
    },
    position: async () => (p && !live ? p.getCurrentTime() : undefined),
    duration: () => (p && !live && p.getDuration() > 0 ? p.getDuration() : undefined),
    destroy: () => {
      try {
        p?.destroy();
      } catch {
        // already gone
      }
      f.remove();
    },
  };
}

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

const DECKS = { youtube: youtubeDeck, soundcloud: soundcloudDeck, mixcloud: mixcloudDeck };

/** How far off everyone else it may drift before it's put back (s). */
const DRIFT = 3;
/** How long a player gets to start before it's taken as blocked, or not loading at all (ms). */
const START_WAIT = 4000;
const LOAD_WAIT = 20000;

export class DjSetPlayer {
  private state: DjSetState = { set: null, startedAt: 0, elapsed: 0 };
  private lastVolume = -1;
  private up = false;
  private deck: Deck | null = null;
  /** The set the deck is playing: a new one throws the deck away. */
  private deckSet: DjSet | null = null;
  private deckStartedAt = 0;
  private phaseNow: DjSetPhase = 'off';
  private why = '';
  private title = '';
  private ready = false;
  private timers: number[] = [];
  private tick = 0;
  private lastSync = 0;
  /** A browser that wouldn't start it on its own: the next click or key does. */
  private readonly retry = () => {
    if (this.phaseNow !== 'blocked' || !this.deck) return;
    this.deck.play();
  };

  constructor(private hooks: DjSetHooks) {
    window.addEventListener('pointerdown', this.retry, true);
    window.addEventListener('keydown', this.retry, true);
  }

  /** What's on at the booth, from the office. The same set again (a re-sent state) plays on. */
  set(s: DjSetState) {
    this.state = s;
    this.apply();
  }

  /** Whether you're up on the roof. */
  setUp(up: boolean) {
    if (up === this.up) return;
    this.up = up;
    this.apply();
  }

  /** What the booth has on (whether or not it plays here). */
  current(): DjSetState {
    return this.state;
  }

  phase(): DjSetPhase {
    return this.phaseNow;
  }

  /** Why it couldn't play here, for the booth's window. */
  problem(): string {
    return this.why;
  }

  /** Its title: the office's, else what the player said, else which site it's from. */
  titleNow(): string {
    const set = this.state.set;
    return set ? set.title || this.title || djSetTitle(set) : '';
  }

  /** Whether the house DJ keeps quiet: while a set is on and this page hasn't given up on it. */
  silencesHouse(): boolean {
    return !!this.state.set && this.phaseNow !== 'failed' && this.phaseNow !== 'ended';
  }

  /** Where in the set everyone is now, in seconds. */
  private target(): number {
    const set = this.state.set;
    if (!set) return 0;
    // On the office's clock (see 'pong'); any drift before the clocks are compared is put right in follow().
    return set.start + Math.max(0, this.hooks.now() - this.state.startedAt) / 1000;
  }

  private setPhase(p: DjSetPhase, why = '') {
    if (p === this.phaseNow && why === this.why) return;
    this.phaseNow = p;
    this.why = why;
    this.hooks.changed();
  }

  private apply() {
    const set = this.state.set;
    if (!set) {
      this.drop();
      return this.setPhase('off');
    }
    const fresh = !sameDjSet(set, this.deckSet) || this.state.startedAt !== this.deckStartedAt;
    if (fresh) {
      this.drop();
      this.title = '';
      this.deckSet = set;
      this.deckStartedAt = this.state.startedAt;
      // Gave up on the last one here; a new one gets a fresh try.
      this.phaseNow = 'off';
    }
    if (this.phaseNow === 'failed' || this.phaseNow === 'ended') return;
    if (!this.up) {
      this.deck?.pause();
      return this.setPhase(this.deck ? 'away' : 'off');
    }
    if (this.deck) {
      // Back up on the roof: on from where everyone else is now.
      this.resync(true);
      this.deck.play();
      this.waitToStart();
      return this.setPhase('loading');
    }
    this.load(set);
  }

  private load(set: DjSet) {
    this.setPhase('loading');
    this.ready = false;
    const at = () => this.target();
    const mine = () => this.deckSet === set;
    const events: DeckEvents = {
      ready: () => {
        if (!mine()) return;
        this.ready = true;
        const d = this.deck;
        if (!d) return;
        this.lastVolume = -1;
        this.volumeNow(d);
        if (!this.up) return d.pause();
        this.resync(true);
        d.play();
        this.waitToStart();
      },
      playing: () => {
        if (!mine()) return;
        if (!this.up) return this.deck?.pause();
        this.setPhase('playing');
      },
      paused: () => {
        // Nobody here can pause it (the player is out of sight): the browser did. A click starts it again.
        if (mine() && this.phaseNow === 'playing' && this.up) this.setPhase('blocked');
      },
      ended: () => {
        if (mine()) this.giveUp('ended');
      },
      error: (text) => {
        if (!mine()) return;
        this.hooks.toast(`🎧 Can't play the set here: ${text}. The house DJ takes over for you.`, 'warn');
        this.giveUp('failed', text);
      },
      title: (t) => {
        if (!mine() || !t) return;
        this.title = t.slice(0, 120);
        this.hooks.changed();
      },
    };
    DECKS[set.kind](set, at, events).then(
      (deck) => {
        if (!mine()) return deck.destroy();
        this.deck = deck;
        if (this.ready) events.ready();
        this.later(() => {
          if (mine() && !this.ready && this.phaseNow === 'loading') events.error(`${DJ_SET_SITES[set.kind]}'s player didn't load`);
        }, LOAD_WAIT);
      },
      () => mine() && events.error(`${DJ_SET_SITES[set.kind]}'s player is blocked in this browser`),
    );
    clearInterval(this.tick);
    this.tick = window.setInterval(() => this.follow(), 250);
  }

  /** A few seconds after asking it to play: still not playing means the browser wants a click first. */
  private waitToStart() {
    const set = this.deckSet;
    this.later(() => {
      if (this.deckSet !== set || !this.up || this.phaseNow !== 'loading') return;
      this.setPhase('blocked');
      this.hooks.toast('🎧 Click to hear the set');
    }, START_WAIT);
  }

  /** Volume for where you stand, and back in step when it drifted or ran past the end. */
  private follow() {
    const d = this.deck;
    if (!d || !this.ready || !this.up) return;
    this.volumeNow(d);
    const now = performance.now();
    if (this.phaseNow === 'playing' && now - this.lastSync > 5000) {
      this.lastSync = now;
      this.resync(false);
    }
  }

  private volumeNow(d: Deck) {
    const v = this.hooks.volume();
    if (Math.abs(v - this.lastVolume) < 0.01) return;
    this.lastVolume = v;
    d.setVolume(v);
  }

  private resync(always: boolean) {
    const d = this.deck;
    if (!d) return;
    const at = this.target();
    const len = d.duration();
    if (len !== undefined && at >= len - 1) return this.giveUp('ended');
    if (always) return d.seek(at);
    void d.position().then((pos) => {
      if (pos !== undefined && this.deck === d && Math.abs(pos - this.target()) > DRIFT) d.seek(this.target());
    });
  }

  /** Stops trying here: the house DJ plays for this page until someone puts on another set. */
  private giveUp(p: 'failed' | 'ended', why = '') {
    this.drop();
    this.setPhase(p, why);
  }

  private drop() {
    this.deck?.destroy();
    this.deck = null;
    this.ready = false;
    clearInterval(this.tick);
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }

  private later(fn: () => void, ms: number) {
    this.timers.push(window.setTimeout(fn, ms));
  }
}
