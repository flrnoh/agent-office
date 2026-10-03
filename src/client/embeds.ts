/*
 * Sites' embedded players, kept in step with everyone else (flrnoh fork, see FORK.md): what the DJ
 * sets on the roof (djset.ts) and the streams on the office TV (tv.ts) both play through. The
 * players can't go through Web Audio, so this follows by hand: the right volume for where you stand,
 * the same bit as everyone else (on the office's clock), paused while you're not there.
 */

/** How this page is getting on with what's on. `held`: you paused it yourself, in the big player. */
export type EmbedPhase = 'off' | 'loading' | 'playing' | 'blocked' | 'failed' | 'ended' | 'away' | 'held';

/** What a pasted link put on, as the embed needs it. */
export interface Embeddable {
  kind: string;
  id: string;
  /** Where in it to begin, in seconds, before the time since it was put on. */
  start: number;
  title?: string;
}

export interface EmbedState<S> {
  set: S | null;
  by?: string;
  startedAt: number;
  elapsed: number;
}

export interface EmbedHooks {
  /** The office's clock, ms (see store.officeNow). */
  now(): number;
  /** How loud it should be where you stand, 0–1. */
  volume(): number;
  /** Something changed: the hint, a window showing it, whatever else plays instead. */
  changed(): void;
  toast(text: string, level?: 'info' | 'warn'): void;
}

/** One embedded player, whichever site it's from. */
export interface Deck {
  play(): void;
  pause(): void;
  seek(seconds: number): void;
  setVolume(v: number): void;
  /** Where it is now, in seconds, when the player can say (not for live). */
  position(): Promise<number | undefined>;
  /** How long it is, in seconds; undefined for live or not known yet. */
  duration(): number | undefined;
  destroy(): void;
}

export interface DeckEvents {
  ready(): void;
  playing(): void;
  paused(): void;
  ended(): void;
  error(text: string): void;
  title(t: string): void;
}

/** Makes a deck for what's on; `at()` is where everyone is in it now, in seconds. */
export type DeckMaker<S> = (set: S, at: () => number, on: DeckEvents) => Promise<Deck>;

// ---- Loading the sites' scripts, and YouTube's player (both the DJ and the TV play YouTube) -----------

interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(s: number, allowSeekAhead: boolean): void;
  setVolume(v: number): void;
  unMute(): void;
  mute(): void;
  getCurrentTime(): number;
  getDuration(): number;
  getVideoData?(): { title?: string; isLive?: boolean };
  destroy(): void;
}
interface YTNamespace {
  Player: new (el: HTMLElement, o: { events: Record<string, (e: { data: number; target: YTPlayer }) => void> }) => YTPlayer;
}
const g = window as unknown as { YT?: YTNamespace; onYouTubeIframeAPIReady?: () => void };

const scripts = new Map<string, Promise<void>>();
/** A site's player script, once (and a failed load may be tried again). */
export function loadScript(src: string, ready: () => boolean, waitFor?: (done: () => void) => void): Promise<void> {
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

/** An iframe for a site's player, in `host`: 320×200, or filling the host when `fill`. */
export function embedFrame(src: string, host: HTMLElement, fill = false): HTMLIFrameElement {
  const f = document.createElement('iframe');
  if (fill) f.style.cssText = 'width:100%;height:100%;border:0;display:block';
  else {
    f.width = '320';
    f.height = '200';
  }
  f.allow = fill ? 'autoplay; encrypted-media; fullscreen; picture-in-picture' : 'autoplay; encrypted-media';
  // The office's pages send no referrer, and YouTube's player refuses to start without one.
  f.referrerPolicy = 'strict-origin-when-cross-origin';
  f.tabIndex = -1;
  f.src = src;
  host.append(f);
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

/**
 * YouTube's player for video `id`, in `host`. Without `controls` it's the DJ's hidden deck (320×200,
 * no controls); with them it fills its host, as on the TV, where you can use them in the big player.
 */
export async function youtubeDeck(id: string, at: () => number, on: DeckEvents, host: HTMLElement, controls = false): Promise<Deck> {
  await loadYouTube();
  // On the TV it starts muted: the office turns it up to how loud it should be where you stand.
  const opts = controls ? 'controls=1&playsinline=1&rel=0&iv_load_policy=3&mute=1' : 'controls=0&disablekb=1&playsinline=1&rel=0';
  const f = embedFrame(`https://www.youtube.com/embed/${id}?enablejsapi=1&${opts}&start=${Math.floor(at())}&origin=${encodeURIComponent(location.origin)}`, host, controls);
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
      if (controls && v <= 0) return p?.mute();
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

// ---- Keeping one in step ----------------------------------------------------------------------------

/** How far off everyone else it may drift before it's put back (s). */
const DRIFT = 3;
/** How long a player gets to start before it's taken as blocked, or not loading at all (ms). */
const START_WAIT = 4000;
const LOAD_WAIT = 20000;

export interface EmbedPlayerOptions<S extends Embeddable> {
  decks: Record<S['kind'], DeckMaker<S>>;
  /** Which site it's from: "YouTube". */
  site(set: S): string;
  /** What to call it until a title's known. */
  fallbackTitle(set: S): string;
  same(a: S | null | undefined, b: S | null | undefined): boolean;
  /** The toast when it can't play here, with why. */
  cantPlay(why: string): string;
  /** The toast when the browser wants a click first. */
  clickToHear: string;
}

/**
 * Plays what's on in its site's player, from where everyone else is: loads it while it's `on` here,
 * pauses it while not, puts it back in step when it drifts, and gives up (for this page) when the
 * site won't play it. `held` (set while you have the player's own controls) lets you pause it.
 */
export class EmbedPlayer<S extends Embeddable> {
  private state: EmbedState<S> = { set: null, startedAt: 0, elapsed: 0 };
  private lastVolume = -1;
  private on = false;
  private hands = false;
  protected deck: Deck | null = null;
  /** What the deck is playing: a new one throws the deck away. */
  private deckSet: S | null = null;
  private deckStartedAt = 0;
  private phaseNow: EmbedPhase = 'off';
  private why = '';
  private title = '';
  private ready = false;
  /** Counts decks thrown away: a player still loading for one of those is thrown away when it comes. */
  private gen = 0;
  /** A player on its way (its site's script loading). */
  private loading = false;
  private timers: number[] = [];
  private tick = 0;
  private lastSync = 0;
  /** A browser that wouldn't start it on its own: the next click or key does. */
  private readonly retry = () => {
    if (this.phaseNow !== 'blocked' || !this.deck) return;
    // Its volume again too: a player may have stayed muted until now.
    this.lastVolume = -1;
    this.deck.play();
  };

  constructor(
    protected hooks: EmbedHooks,
    private o: EmbedPlayerOptions<S>,
  ) {
    window.addEventListener('pointerdown', this.retry, true);
    window.addEventListener('keydown', this.retry, true);
  }

  /** What's on, from the office. The same again (a re-sent state) plays on. */
  set(s: EmbedState<S>) {
    this.state = s;
    this.apply();
  }

  /** Whether it should play here now (you're there, nothing else has the screen). */
  setOn(on: boolean) {
    if (on === this.on) return;
    this.on = on;
    this.apply();
  }

  /**
   * While you have the player's own controls in your hands: pausing it is yours to do then. Letting
   * go puts it back where everyone else is.
   */
  setHands(hands: boolean) {
    if (hands === this.hands) return;
    this.hands = hands;
    if (!hands && this.phaseNow === 'held' && this.deck && this.on) {
      this.resync(true);
      this.deck.play();
      this.setPhase('loading');
      this.waitToStart();
    }
  }

  /** What's on (whether or not it plays here). */
  current(): EmbedState<S> {
    return this.state;
  }

  phase(): EmbedPhase {
    return this.phaseNow;
  }

  /** Why it couldn't play here. */
  problem(): string {
    return this.why;
  }

  /** Its title: the office's, else what the player said, else what it is. */
  titleNow(): string {
    const set = this.state.set;
    return set ? set.title || this.title || this.o.fallbackTitle(set) : '';
  }

  /** How long it is (s), once its player has said. */
  length(): number | undefined {
    return this.deck?.duration();
  }

  /** Where in it everyone is now, in seconds. */
  private target(): number {
    const set = this.state.set;
    if (!set) return 0;
    // On the office's clock (see 'pong'); any drift before the clocks are compared is put right in follow().
    return set.start + Math.max(0, this.hooks.now() - this.state.startedAt) / 1000;
  }

  private setPhase(p: EmbedPhase, why = '') {
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
    // Skipped in it (the same thing, from another moment): the player that's there jumps, unless it gave up.
    const skipped = this.o.same(set, this.deckSet) && this.state.startedAt !== this.deckStartedAt;
    if (skipped && (this.deck || this.loading) && this.phaseNow !== 'failed' && this.phaseNow !== 'ended') this.deckStartedAt = this.state.startedAt;
    const fresh = !this.o.same(set, this.deckSet) || this.state.startedAt !== this.deckStartedAt;
    if (fresh) {
      this.drop();
      this.title = '';
      this.deckSet = set;
      this.deckStartedAt = this.state.startedAt;
      // Gave up on the last one here; a new one gets a fresh try.
      this.phaseNow = 'off';
    }
    if (this.phaseNow === 'failed' || this.phaseNow === 'ended') return;
    if (!this.on) {
      this.deck?.pause();
      return this.setPhase(this.deck || this.loading ? 'away' : 'off');
    }
    // On its way: it starts once it's ready (and still wanted).
    if (this.loading) return this.setPhase('loading');
    if (this.deck) {
      // Back: on from where everyone else is now.
      this.resync(true);
      this.deck.play();
      this.waitToStart();
      return this.setPhase('loading');
    }
    this.load(set);
  }

  private load(set: S) {
    this.setPhase('loading');
    this.ready = false;
    const at = () => this.target();
    // What's on can come again with its title (a new object, the same thing): so it's this load, not the set, that counts.
    const gen = this.gen;
    const mine = () => this.gen === gen;
    this.loading = true;
    const events: DeckEvents = {
      ready: () => {
        if (!mine()) return;
        this.ready = true;
        const d = this.deck;
        if (!d) return;
        this.lastVolume = -1;
        this.volumeNow(d);
        if (!this.on) return d.pause();
        this.resync(true);
        d.play();
        this.waitToStart();
      },
      playing: () => {
        if (!mine()) return;
        if (!this.on) return this.deck?.pause();
        // Played again after you paused it yourself: back where everyone is.
        if (this.phaseNow === 'held') this.resync(true);
        this.setPhase('playing');
      },
      paused: () => {
        if (!mine() || !this.on) return;
        // In your hands, that was you; otherwise nobody here can pause it: the browser did, and a click starts it again.
        if (this.hands) this.setPhase('held');
        else if (this.phaseNow === 'playing') this.setPhase('blocked');
      },
      ended: () => {
        if (mine()) this.giveUp('ended');
      },
      error: (text) => {
        if (!mine()) return;
        this.hooks.toast(this.o.cantPlay(text), 'warn');
        this.giveUp('failed', text);
      },
      title: (t) => {
        if (!mine() || !t) return;
        this.title = t.slice(0, 120);
        this.hooks.changed();
      },
    };
    this.o.decks[set.kind as S['kind']](set, at, events).then(
      (deck) => {
        if (!mine()) return deck.destroy();
        this.loading = false;
        this.deck = deck;
        if (this.ready) events.ready();
        this.later(() => {
          if (mine() && !this.ready && this.phaseNow === 'loading') events.error(`${this.o.site(set)}'s player didn't load`);
        }, LOAD_WAIT);
      },
      () => mine() && ((this.loading = false), events.error(`${this.o.site(set)}'s player is blocked in this browser`)),
    );
    clearInterval(this.tick);
    this.tick = window.setInterval(() => this.follow(), 250);
  }

  /** A few seconds after asking it to play: still not playing means the browser wants a click first. */
  private waitToStart() {
    const gen = this.gen;
    this.later(() => {
      if (this.gen !== gen || !this.on || this.phaseNow !== 'loading') return;
      this.setPhase('blocked');
      this.hooks.toast(this.o.clickToHear);
    }, START_WAIT);
  }

  /** Volume for where you stand, and back in step when it drifted or ran past the end. */
  private follow() {
    const d = this.deck;
    if (!d || !this.ready || !this.on) return;
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

  /** Stops trying here, until someone puts on something else. */
  private giveUp(p: 'failed' | 'ended', why = '') {
    this.drop();
    this.setPhase(p, why);
  }

  private drop() {
    this.gen++;
    this.loading = false;
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
