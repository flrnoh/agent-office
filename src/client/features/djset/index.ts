/**
 * flrnoh fork (see FORK.md): a DJ set someone put on at the roof's booth, from YouTube, SoundCloud or
 * Mixcloud, in place of the house DJ, for everyone up there (djset.ts, ui/djbooth.ts). The booth
 * itself, its hint and E, are features/bar's; it asks here what's on. While a set plays, the roof's
 * lights, LED wall and DJ go by its beats (`frame`, see frame.ts and server/djbeats/), and a YouTube
 * set's own video comes on the LED wall now and then (video.ts).
 */
import type { Ctx } from '../../core/context';
import { djFrame } from '../../dnb';
import { DjSetPlayer } from '../../djset';
import { store } from '../../state';
import { toast } from '../../ui/dom';
import { openDjBooth } from '../../ui/djbooth';
import type { SettingsPane } from '../../ui/settings';
import type { Interactable } from '../../world/types';
import { isDjBeats } from '../../../shared/djbeats';
import type { DjSetState } from '../../../shared/djset';
import { gridFrame, SetBeats, setHue, type SetFrame } from './frame';
import { SetVideo } from './video';

export interface DjSetDeps {
  /** How far into the house DJ's set it is (see features/rooftop). */
  djAt(): number;
  /** E at the booth's 📯 button: the air horn (see features/bar). */
  horn(): void;
  /** Settings, open at `pane`. */
  showSettings(pane?: SettingsPane): void;
  /** What you're pointing at (see input/pointer.ts): H at the booth is the air horn. */
  target(): Interactable | null;
}

export function installDjSets(ctx: Ctx, deps: DjSetDeps) {
  const watchers = new Set<() => void>();
  const djSets = new DjSetPlayer({ now: () => store.officeNow(), volume: () => ctx.sound.djSetVolume(), toast, changed: () => (houseDj(), watchers.forEach((fn) => fn())) });
  /** The house DJ plays on the roof unless a set does. */
  function houseDj() {
    ctx.sound.setDj(ctx.upTop() && !djSets.silencesHouse() ? deps.djAt : null);
  }
  /** The set's video for the LED wall, while you're up there. */
  const video = new SetVideo();
  /** Up on the roof, or back down (see setPlace in core/travel.ts). */
  function setUp(up: boolean) {
    djSets.setUp(up);
    houseDj();
    if (!up) video.release();
  }
  /** What's on, from the office; the booth's window and the beats (below) look again, as the set's tempo may have come with it. */
  const onState = (state: DjSetState) => {
    djSets.set(state);
    ctx.sound.setPartyVolume(state.volume ?? 1);
    watchers.forEach((fn) => fn());
  };
  ctx.messages.on('welcome', (msg) => void (msg.dj && onState(msg.dj)));
  ctx.messages.on('floor.enter', (msg) => void (msg.dj && onState(msg.dj)));
  ctx.messages.on('dj', (msg) => onState(msg.state));
  // At the DJ booth on the roof, H is the air horn (elsewhere it's the controls, see features/hud).
  ctx.keys.add('activity', (e) => {
    if (e.code !== 'KeyH' || !ctx.upTop() || deps.target()?.kind !== 'dj') return false;
    if (!e.repeat) deps.horn();
    return true;
  });

  // ---- The set's beats, for the lights ----------------------------------------------------------
  /** What the office heard in the set that's on, once it's here. */
  let heard: SetBeats | null = null;
  /** Which set's beats are on their way. */
  let fetching = '';
  /** How far the set's own player is ahead of where everyone should be (s): Mixcloud may start a show from its top. */
  let drift = 0;
  let driftFor = '';
  /** Fetches the set's beats once the office has heard it. */
  function fetchBeats() {
    const s = djSets.current();
    const url = s.set?.url;
    if (!url || s.beats?.status !== 'ready' || heard?.url === url || fetching === url) return;
    fetching = url;
    void fetch('/api/dj/beats', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((b: unknown) => {
        // Only if it's still the one on.
        if (isDjBeats(b) && b.url === djSets.current().set?.url) heard = new SetBeats(b);
      })
      .catch(() => {})
      .finally(() => fetching === url && (fetching = ''));
  }
  watchers.add(fetchBeats);
  // Every couple of seconds, while it plays here: how far off its player is.
  window.setInterval(() => {
    const url = djSets.current().set?.url;
    if (!url || !ctx.upTop()) return;
    if (driftFor !== url) (drift = 0), (driftFor = url);
    void djSets.heardAt().then((pos) => {
      if (pos === undefined || djSets.current().set?.url !== url) return;
      const off = pos - djSets.expectedAt(store.officeNow());
      // A big jump (it started from the top) at once; small wobbles smoothed.
      drift = Math.abs(off - drift) > 3 ? off : drift + (off - drift) * 0.3;
    });
  }, 2000);

  /** Where the set is, for the roof's lights, LED wall and DJ; null while the house DJ plays. */
  function frame(): SetFrame | null {
    const s = djSets.current();
    const set = s.set;
    if (!set || !djSets.silencesHouse()) return (video.release(), null);
    const hue = setHue(set.url);
    const now = store.officeNow();
    // Where the set you hear is: everyone's point in it, put right by how far its player here is off.
    const at = djSets.expectedAt(now) + (driftFor === set.url ? drift : 0);
    const shown = video.update(s.video?.status === 'ready' ? (s.video.key ?? null) : null, at, djSets.phase() === 'playing');
    const wall = { title: djSets.titleNow(), ...(shown ? { video: shown } : {}) };
    // A tapped tempo goes before what was heard (someone put it right); then what was heard; then a guess.
    if (s.tap) return { ...gridFrame((now - s.tap.at) / 1000, s.tap.bpm, 0, hue), ...wall };
    if (heard?.url === set.url) return { ...heard.frame(at, hue), ...wall };
    return { ...gridFrame(at, 124, 0, hue), ...wall };
  }

  /** Taps at the booth, a beat each: four or more in time set the tempo, for everyone once you stop tapping. */
  let taps: number[] = [];
  let tapTimer = 0;
  function tap(): number | null {
    const now = store.officeNow();
    if (taps.length && now - taps[taps.length - 1] > 2000) taps = [];
    taps.push(now);
    taps = taps.slice(-12);
    clearTimeout(tapTimer);
    if (taps.length < 4) return null;
    const bpm = Math.round(((60_000 * (taps.length - 1)) / (now - taps[0])) * 10) / 10;
    if (bpm < 60 || bpm > 200) return null;
    // The last tap is a beat: the grid runs on from it.
    tapTimer = window.setTimeout(() => ctx.net.send({ t: 'dj.tap', bpm, at: now }), 1200);
    return bpm;
  }

  /** E at the DJ booth: what's playing, a set of your own, the air horn. */
  function showDjBooth() {
    openDjBooth({
      net: ctx.net,
      player: djSets,
      house: () => djFrame(deps.djAt()).part,
      horn: deps.horn,
      openVolume: () => deps.showSettings('sound'),
      watch: (fn) => (watchers.add(fn), () => watchers.delete(fn)),
      tap,
      untap: () => ctx.net.send({ t: 'dj.tap', bpm: 0, at: store.officeNow() }),
      setVolume: (volume) => ctx.net.send({ t: 'dj.volume', volume }),
    });
  }

  /** What the booth's hint says is on, when it's a set of someone's (else the house DJ's). */
  function playing(): string | null {
    if (!djSets.silencesHouse() || !djSets.current().set) return null;
    return `🎶 ${djSets.titleNow()}${djSets.phase() === 'blocked' ? ' · click to hear it' : ''}`;
  }

  return { djSets, setUp, showDjBooth, playing, frame };
}
