import { isDjBeats } from '../../../shared/djbeats';
import type { VenueDjState } from '../../../shared/venueshow';
import { mixFrame, type MixFrame } from '../../../shared/venueshow-mix';
import { DjSetPlayer } from '../../djset';
import type { Bones } from '../../world/character';
import { SetBeats, gridFrame, setHue } from '../djset/frame';

// The SCHALLWERK's DJ booth, on this page (flrnoh fork, see FORK.md "The show"): the set someone put
// on (YouTube, SoundCloud, Mixcloud) in the site's own player, like the roof's (client/djset.ts),
// played only while you're in the house; what the office heard in it (its beats, from
// /api/venue/beats) or a tapped tempo, for the frame the lights and the crowd move to; else the
// house mix's frame (shared/venueshow-mix.ts). And the DJ's moves, on whoever's at the decks.

export const NO_DJ: VenueDjState = { dj: null, set: null, startedAt: 0, elapsed: 0, house: { style: 'house', dropAt: 0 }, volume: 1 };

export interface VenueDjHooks {
  now(): number;
  /** How loud the set's player should be where you are (0..1). */
  volume(): number;
  toast(text: string, level?: 'info' | 'warn'): void;
  changed(): void;
}

export class VenueDj {
  state: VenueDjState = NO_DJ;
  readonly player: DjSetPlayer;
  private heard: SetBeats | null = null;
  private fetching = '';
  private drift = 0;
  private driftFor = '';
  private timer = 0;

  constructor(private h: VenueDjHooks) {
    this.player = new DjSetPlayer({ now: h.now, volume: h.volume, toast: h.toast, changed: () => h.changed() });
  }

  /** What the office says is on at the booth. */
  set(s: VenueDjState) {
    this.state = s;
    this.player.set(s);
    this.fetchBeats();
    this.h.changed();
  }

  /** In the house (the set plays), or not. */
  setIn(inside: boolean) {
    this.player.setUp(inside);
    if (inside && !this.timer) this.timer = window.setInterval(() => this.follow(), 2000);
    if (!inside && this.timer) {
      clearInterval(this.timer);
      this.timer = 0;
    }
  }

  /** Whether a set plays here now (rather than the house mix). */
  setPlays(): boolean {
    return this.player.silencesHouse() && !!this.state.set;
  }

  private fetchBeats() {
    const url = this.state.set?.url;
    if (!url || this.state.beats?.status !== 'ready' || this.heard?.url === url || this.fetching === url) return;
    this.fetching = url;
    void fetch('/api/venue/beats', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((b: unknown) => {
        if (isDjBeats(b) && b.url === this.state.set?.url) this.heard = new SetBeats(b);
      })
      .catch(() => {})
      .finally(() => this.fetching === url && (this.fetching = ''));
  }

  /** How far the set's own player is off where everyone should be. */
  private follow() {
    const url = this.state.set?.url;
    if (!url) return;
    if (this.driftFor !== url) (this.drift = 0), (this.driftFor = url);
    void this.player.heardAt().then((pos) => {
      if (pos === undefined || this.state.set?.url !== url) return;
      const off = pos - this.player.expectedAt(this.h.now());
      this.drift = Math.abs(off - this.drift) > 3 ? off : this.drift + (off - this.drift) * 0.3;
    });
  }

  /**
   * The beat the house moves to now: the set's (what was heard, a tapped tempo, or a steady guess),
   * or the house mix's when `house` plays it; null when nothing plays.
   */
  frame(house: boolean): MixFrame | null {
    const s = this.state;
    const now = this.h.now();
    if (this.setPlays()) {
      const set = s.set!;
      const hue = setHue(set.url);
      if (s.tap) return gridFrame((now - s.tap.at) / 1000, s.tap.bpm, 0, hue);
      const at = this.player.expectedAt(now) + (this.driftFor === set.url ? this.drift : 0);
      if (this.heard?.url === set.url) return this.heard.frame(at, hue);
      return gridFrame(at, 124, 0, hue);
    }
    return house ? mixFrame(s.house.style, s.house.dropAt, now) : null;
  }

  title(): string {
    return this.setPlays() ? this.player.titleNow() : '';
  }
}

// ---- The DJ's moves ---------------------------------------------------------------------------------

const TAU = Math.PI * 2;
const ease = (x: number) => x * x * (3 - 2 * x);

/**
 * The DJ at the decks (as the roof's, features/rooftop/dancer.ts): a hand on the mixer and one on a
 * jog wheel or a cup of the headphones at an ear, nodding and bouncing on the beat; through a build
 * pointing up, then clapping overhead; at the drop a jump and both fists; in a breakdown hands up,
 * swaying. Called from the Person's own update (setWorkout), after it has posed them standing.
 */
export function djPose(b: Bones, f: MixFrame | null, t: number) {
  if (!f) {
    b.armR.rotation.set(-1.1, 0, 0.2);
    b.armL.rotation.set(-1.1, 0, -0.2);
    b.head.rotation.x = 0.15 * Math.max(0, Math.sin(t * 2));
    return;
  }
  const phase = f.beats - Math.floor(f.beats);
  const bar = Math.floor(f.beats / 4);
  const phrase = Math.floor(bar / 8);
  const on = Math.sin(phase * Math.PI);
  // armR is on -x (their right): its "up" is a negative z turn; armL's a positive one.
  let rx = -1.15 + 0.05 * Math.sin(t * 7);
  let rz = 0.25;
  let lx = -1.2 + 0.08 * Math.sin(t * 11);
  let lz = -0.2;
  let nod = 0.28 * (0.35 + 0.65 * f.energy) * Math.max(0, Math.sin(phase * TAU));
  let lift = 0;
  let crouch = 0;
  let spin = 0;
  if (f.sinceDrop < 3) {
    const beatLen = 60 / Math.max(60, Math.min(200, f.bpm));
    if (f.sinceDrop < beatLen) spin = ease(f.sinceDrop / beatLen) * TAU;
    lift = f.sinceDrop < beatLen * 2 ? 0.25 * Math.sin((f.sinceDrop / (beatLen * 2)) * Math.PI) : 0.05 * on;
    const left = Math.floor(f.beats) % 2 === 0;
    rx = lx = 0;
    rz = -(2.75 - (left ? 0 : 0.45 * on));
    lz = 2.75 - (left ? 0.45 * on : 0);
    nod = 0.4 * Math.max(0, Math.sin(phase * TAU));
  } else if (f.part === 'drop') {
    nod = 0.5 * Math.max(0, Math.sin(phase * TAU));
    if (phrase % 2) {
      lx = 0;
      lz = 2.9 - 0.35 * on;
    }
  } else if (f.part === 'build') {
    crouch = 0.12 * f.rise;
    if (f.rise > 0.75) {
      const clap = Math.sin(((f.beats * 2) % 1) * Math.PI);
      rx = lx = -0.1;
      rz = -(2.6 - 0.35 * clap);
      lz = 2.6 - 0.35 * clap;
    } else {
      const pump = f.rise > 0.4 ? Math.sin(((f.beats * 2) % 1) * Math.PI) : on;
      lx = -0.15;
      lz = 2.7 - 0.4 * pump;
    }
  } else if (f.part === 'breakdown') {
    nod = -0.12 + 0.06 * Math.sin(f.beats * Math.PI * 0.5);
    if (bar % 8 >= 4) {
      const wave = Math.sin(f.beats * Math.PI * 0.5);
      rx = lx = -0.2;
      rz = -(2.5 + 0.25 * wave);
      lz = 2.5 - 0.25 * wave;
    } else {
      lx = -0.2;
      lz = 2.55;
    }
  } else if (phrase % 2) {
    // A cup of the headphones held to an ear, listening for the next track.
    lx = -0.2;
    lz = 2.55;
  }
  b.armR.rotation.set(rx, 0, rz);
  b.armL.rotation.set(lx, 0, lz);
  b.body.position.y = -(0.05 * f.energy * on + crouch) + lift;
  b.body.rotation.z = 0.05 * Math.sin(f.beats * Math.PI * 0.5);
  b.body.rotation.y = spin;
  b.head.rotation.x = nod;
}
