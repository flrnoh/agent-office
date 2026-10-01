import type * as THREE from 'three';
import type { ServerMsg } from '../../../shared/protocol';
import { BALL_R } from '../../../shared/soccer-ball';
import { TEAM_COLOR, type SoccerServerMsg, type SoccerView, type Team } from '../../../shared/soccer';
import type { Crowd } from './crowd';
import type { LedBoards } from './ads';
import type { Floodlights, GoalNets, Shell } from './props';
import { calloutFor, calmCrowd, crowdDensity, cueOf, floodlight, matchOn, nearMiss, react, settle, type Callout, type CrowdCue } from './matchday';
import './look.css';

/*
 * The soccer hall's atmosphere (flrnoh fork, see FORK.md "The soccer hall"), on this page: it hears the
 * office's soccer messages (main.ts hands them over, like the game's own place.ts), and while you're in
 * the hall (interior.ts's update drives it every frame) it runs the crowd, the LED boards, the
 * floodlights, the goals' nets, the stadium announcer's callouts and the crowd's sounds. The rules of
 * what happens when are matchday.ts's; this is the wiring.
 */

/** What it needs of the page's sound (sound.ts's soccer crowd section). */
export interface LookSound {
  setSoccerCrowd(level: number, intensity: number): void;
  soccerCrowd(kind: 'horn' | 'roar' | 'oooh' | 'applause' | 'chant', strength?: number): void;
}

/** The hall's moving parts (interior.ts builds them and hands them over). */
export interface LookParts {
  crowd: Crowd;
  led: LedBoards;
  lights: Floodlights;
  shell: Shell;
  nets: GoalNets;
}

/** Near misses closer together than this are one gasp (ms). */
const OOOH_GAP_MS = 1500;
/** How long a callout stays up (ms). */
const CALLOUT_MS = 3400;

export class SoccerLook {
  private sound: LookSound | null = null;
  private people: () => number = () => 1;
  private parts: LookParts | null = null;
  private view: SoccerView | null = null;
  private crowd = calmCrowd();
  private goal: { team: Team; at: number } | null = null;
  /** When the floodlights last flared (a match starting). */
  private flareAt = -1e9;
  /** When interior.ts last drove a frame: you're in the hall while it keeps doing so. */
  private lastFrame = -1e9;
  private intensity = 0;
  private density = 0;
  private ball = { x: 0, z: 0, speed: 0 };
  private ooohAt = -1e9;
  private nextChant = 0;
  private light = 1;
  private daylight = 1;
  private el: HTMLElement | null = null;
  private hideTimer = 0;
  /** What's been cheered, clapped and called out, for checks from the console. */
  readonly log: string[] = [];

  /** The page's sound, and how many people are in the hall (you too). */
  bind(o: { sound: LookSound; people: () => number }) {
    this.sound = o.sound;
    this.people = o.people;
  }

  /** The hall's parts, once it's built. */
  attach(parts: LookParts) {
    this.parts = parts;
  }

  /** In the hall right now (its frames are running). */
  get active(): boolean {
    return performance.now() - this.lastFrame < 400;
  }

  private cue(c: CrowdCue, now: number) {
    this.crowd = react(this.crowd, c, now);
    this.log.push(`crowd:${this.crowd.act}${this.crowd.team ? `:${this.crowd.team}` : ''}`);
    if (this.log.length > 60) this.log.splice(0, this.log.length - 60);
  }

  onMessage(msg: ServerMsg) {
    if (msg.t !== 'soccer' && msg.t !== 'soccer.ball') return;
    const m = msg as SoccerServerMsg;
    const now = performance.now();
    const here = this.active;
    if (m.t === 'soccer.ball') {
      const [x, z, y, vx, vz] = m.b;
      this.ball = { x, z, speed: Math.hypot(vx, vz) };
      if (!here) return;
      const speed = m.hs ?? this.ball.speed;
      if (m.hit === 'net') this.parts?.nets.billow(z < 0 ? 'north' : 'south', x, y + BALL_R, speed / 14);
      const miss = nearMiss(m.hit, x, z, speed);
      // A shot off the post that goes in is a goal: the cheer takes over from the gasp (react's ranks).
      if (miss && now - this.ooohAt > OOOH_GAP_MS && this.view?.phase !== 'goal') {
        this.ooohAt = now;
        this.cue({ kind: 'nearMiss' }, now);
        this.sound?.soccerCrowd('oooh', 0.5 + this.density * 0.5);
      }
      return;
    }
    const was = this.view?.phase;
    this.view = m.state;
    if (m.state.phase === 'kickoff' && was !== 'kickoff' && (was === 'waiting' || was === 'paused' || was === 'over' || !was)) this.flareAt = now;
    const ev = m.event;
    if (!ev) return;
    if (ev.kind === 'start') this.flareAt = now;
    if (ev.kind === 'goal' && ev.team) this.goal = { team: ev.team, at: now };
    const c = cueOf(ev);
    if (c) this.cue(c, now);
    if (!here) return;
    const call = calloutFor(ev, m.state);
    if (call) this.showCallout(call);
    const crowd = 0.4 + this.density * 0.6;
    if (ev.kind === 'goal') this.sound?.soccerCrowd('roar', crowd);
    if (ev.kind === 'start' || ev.kind === 'kickoff' || ev.kind === 'resume') this.sound?.soccerCrowd('applause', crowd);
    if (ev.kind === 'end') this.sound?.soccerCrowd(ev.team ? 'roar' : 'applause', crowd * 0.8);
    if (ev.kind === 'practice') this.sound?.soccerCrowd('applause', 0.35);
    if (call?.horn) this.sound?.soccerCrowd('horn', 1);
  }

  /** Every frame while you're in the hall (interior.ts's update). */
  frame(t: number, dt: number) {
    const now = performance.now();
    if (!this.active) {
      // Just came in: the chants start after a while, not at once.
      this.nextChant = now + 8000;
    }
    this.lastFrame = now;
    const p = this.parts;
    if (!p) return;
    const v = this.view;
    const on = matchOn(v?.phase);
    const people = Math.max(this.people(), v?.players.length ?? 0);
    // Folk drift in and out: the density eases, and each seat's regular comes at their own pace (crowd.ts).
    const target = crowdDensity(people, on);
    this.density += (target - this.density) * Math.min(1, dt * 0.8);
    this.crowd = settle(this.crowd, now);
    p.crowd.update(t, dt, this.density, this.crowd, now);
    p.led.update(now, this.goal);
    p.nets.update(dt);
    const playing = v?.phase === 'play' || v?.phase === 'kickoff' || v?.phase === 'goal';
    this.light = floodlight(now, this.flareAt, playing);
    p.lights.set(this.light, 1 - this.daylight);
    // How exciting it is: the ball near a goal and going fast, while it's on.
    const near = Math.min(1, Math.max(0, (Math.abs(this.ball.z) - 5) / 8));
    const want = v?.phase === 'play' ? Math.min(1, 0.25 + near * 0.5 + this.ball.speed / 25) : v?.phase === 'goal' ? 1 : 0.1;
    this.intensity += (want - this.intensity) * Math.min(1, dt * 1.5);
    const present = p.crowd.seats ? p.crowd.present() / p.crowd.seats : 0;
    this.sound?.setSoccerCrowd(Math.min(1, 0.15 + present), this.intensity);
    // Now and then in play, the stands clap along.
    if (v?.phase === 'play' && now >= this.nextChant) {
      if (present > 0.3) {
        this.cue({ kind: 'chant' }, now);
        this.sound?.soccerCrowd('chant', present);
      }
      this.nextChant = now + (11000 + Math.random() * 10000) * (1 - 0.4 * this.intensity);
    }
  }

  /** The hall's light (main.ts, after the place's own mood): the floodlights' flare and dimming, the night in the windows. */
  mood(lights: { hemi: THREE.HemisphereLight; ambient: THREE.AmbientLight }, daylight: number) {
    if (!this.active || !this.parts) return;
    this.daylight = daylight;
    // At night the hall's a touch darker round the edges, and the floodlights' pools show the more.
    const k = Math.min(1.4, Math.max(0.35, this.light)) * (0.84 + 0.16 * daylight);
    lights.hemi.intensity *= k;
    lights.ambient.intensity *= k;
    this.parts.shell.setDaylight(daylight);
  }

  // ---- The announcer's callout ------------------------------------------------------------------

  private showCallout(c: Callout) {
    if (!this.el) {
      this.el = document.createElement('div');
      this.el.className = 'soccer-callout';
      this.el.setAttribute('aria-live', 'polite');
      this.el.hidden = true;
      document.body.append(this.el);
    }
    const el = this.el;
    const head = document.createElement('b');
    head.textContent = c.head;
    const sub = document.createElement('span');
    sub.textContent = c.sub;
    el.replaceChildren(head, sub);
    el.style.setProperty('--team', c.team ? TEAM_COLOR[c.team] : '#35c46a');
    el.hidden = false;
    // Start its animation over.
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    this.log.push(`callout:${c.head} ${c.sub}`);
    clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(() => (el.hidden = true), CALLOUT_MS);
  }
}

/** The one on this page. */
export const soccerLook = new SoccerLook();
(globalThis as { __soccerLook?: SoccerLook }).__soccerLook = soccerLook;
