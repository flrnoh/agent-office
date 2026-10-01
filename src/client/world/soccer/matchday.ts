import { GOAL, PITCH, PITCH_CX, type BallHitKind, type GoalSide, type SoccerEvent, type SoccerPhase, type SoccerView, type Team } from '../../../shared/soccer';

/*
 * The soccer hall's matchday (flrnoh fork, see FORK.md "The soccer hall"): the pure part of its
 * atmosphere, kept free of three.js and the page so the tests can drive it. How full the stands are,
 * how the crowd reacts to what happens on the pitch, which ad the LED boards show when, what counts as
 * a near miss, and what the stadium announcer calls out. world/soccer/look.ts puts it on the screen and
 * in your ears.
 */

// ---- How full the stands are ---------------------------------------------------------------------

/** Whether a match is on (the stands fill up for it). Waiting and paused are between matches. */
export const matchOn = (phase: SoccerPhase | undefined): boolean => phase === 'kickoff' || phase === 'play' || phase === 'goal' || phase === 'over';

/**
 * How many of the seats have someone in them (0..1), from how many people are in the hall (players and
 * watchers, you too) and whether a match is on. A match always draws a good crowd, more with more
 * people about; between matches only a few regulars sit about, and the hall is nearly empty when
 * nobody's in it.
 */
export function crowdDensity(people: number, match: boolean): number {
  const n = Math.max(0, Math.floor(people));
  if (match) return Math.min(1, 0.62 + 0.06 * n);
  if (n === 0) return 0.04;
  return Math.min(0.5, 0.14 + 0.07 * (n - 1));
}

/** Whether a seat whose regular comes at `threshold` (0..1, fixed per seat) is taken at `density`. */
export const seatTaken = (threshold: number, density: number): boolean => threshold < density;

// ---- How the crowd reacts --------------------------------------------------------------------------

/** What the crowd does: sit and watch, clap (a kick-off), "oooh" (a near miss), or jump and cheer (a goal). */
export type CrowdAct = 'idle' | 'clap' | 'oooh' | 'cheer';

export interface CrowdState {
  act: CrowdAct;
  /** Whose fans cheer (a goal, a win): the other end sits it out. None: everybody. */
  team?: Team;
  /** When it started and when it's over (ms, the caller's clock). */
  since: number;
  until: number;
}

/** Something the crowd reacts to. */
export type CrowdCue = { kind: 'goal'; team: Team } | { kind: 'win'; team?: Team } | { kind: 'nearMiss' } | { kind: 'kickoff' } | { kind: 'practice' } | { kind: 'chant' };

/** How long each reaction lasts (ms). */
export const REACT_MS: Record<Exclude<CrowdAct, 'idle'>, number> = { clap: 2600, oooh: 1700, cheer: 4600 };
const RANK: Record<CrowdAct, number> = { idle: 0, clap: 1, oooh: 2, cheer: 3 };

export const calmCrowd = (now = 0): CrowdState => ({ act: 'idle', since: now, until: now });

/** The crowd as it is at `now`: a reaction that's run its course settles back into watching. */
export function settle(s: CrowdState, now: number): CrowdState {
  return s.act !== 'idle' && now >= s.until ? { act: 'idle', since: s.until, until: s.until } : s;
}

/**
 * The crowd reacts to `cue` at `now`: a bigger reaction takes over from a smaller one (a goal's cheer
 * from the "oooh" of the post it came off), a smaller one waits its turn (no clapping over a cheer).
 */
export function react(s: CrowdState, cue: CrowdCue, now: number): CrowdState {
  const cur = settle(s, now);
  const [act, team]: [Exclude<CrowdAct, 'idle'>, Team | undefined] =
    cue.kind === 'goal' ? ['cheer', cue.team] : cue.kind === 'win' ? (cue.team ? ['cheer', cue.team] : ['clap', undefined]) : cue.kind === 'nearMiss' ? ['oooh', undefined] : ['clap', undefined];
  if (RANK[act] < RANK[cur.act]) return cur;
  return { act, ...(team ? { team } : {}), since: now, until: now + REACT_MS[act] };
}

/** What a fan of `fan` (null: neutral) does in the crowd's state: their team scored and they're up, or not. */
export function fanAct(s: CrowdState, fan: Team | null): CrowdAct {
  if (s.act === 'cheer' && s.team && fan && fan !== s.team) return 'idle';
  return s.act;
}

/** The crowd's cues from one of the office's match events. */
export function cueOf(ev: SoccerEvent): CrowdCue | null {
  switch (ev.kind) {
    case 'goal':
      return ev.team ? { kind: 'goal', team: ev.team } : null;
    case 'start':
    case 'kickoff':
    case 'resume':
      return { kind: 'kickoff' };
    case 'end':
      return { kind: 'win', ...(ev.team ? { team: ev.team } : {}) };
    case 'practice':
      return { kind: 'practice' };
    default:
      return null;
  }
}

// ---- Near misses -----------------------------------------------------------------------------------

/** How close to a post (outside it) a shot into the end boards still makes the crowd gasp (m). */
export const NEAR_MISS_WIDE = 1.6;
/** How hard it has to be going (m/s). */
export const NEAR_MISS_SPEED = 5;

/**
 * Whether the ball's hit (a snapshot's `hit`, where it was, how fast) was a near miss, and at which
 * goal: off the post or the bar always; into the end boards just wide of a post, hard. Null otherwise.
 */
export function nearMiss(hit: BallHitKind | undefined, x: number, z: number, speed: number): GoalSide | null {
  if (!hit) return null;
  const side: GoalSide = z < (PITCH.minZ + PITCH.maxZ) / 2 ? 'north' : 'south';
  if (hit === 'post' || hit === 'bar') return side;
  if (hit !== 'board' || speed < NEAR_MISS_SPEED) return null;
  const toLine = side === 'north' ? z - PITCH.minZ : PITCH.maxZ - z;
  if (toLine > 0.6) return null;
  const off = Math.abs(x - PITCH_CX) - GOAL.width / 2;
  return off <= NEAR_MISS_WIDE ? side : null;
}

// ---- The LED boards --------------------------------------------------------------------------------

/** The fake ads the perimeter boards cycle through: Florian's world, all friendly. [text, colour, background]. */
export const ADS: readonly (readonly [string, string, string])[] = [
  ['KULTUR AM REGEN · Kultur für alle', '#f4c95d', '#15110a'],
  ['BUS KOMMT GLEICH · einsteigen, mitspielen', '#ffd23f', '#0d2238'],
  ['BIBELSTUNDE COCKTAILS · heute ein Roulette-Drink?', '#ff8fb1', '#241022'],
  ['SIGNAL & STILLE · Florian Obermeier', '#e8e6df', '#11151c'],
  ['CASINO GEGENÜBER · Glück auf!', '#ffd166', '#3a0d16'],
  ['PADEL HALL · Café & Courts nebenan', '#8be28b', '#0e2a1c'],
  ['AGENT OFFICE · build · ship · score', '#8ecae6', '#0b1d2c'],
  ['FLOGGE FC · fair play', '#ffffff', '#1d3b2c'],
];

/** How long an ad stays up, and how long it takes to roll over to the next (ms). */
export const AD_HOLD_MS = 6000;
export const AD_ROLL_MS = 450;

/**
 * Which ad the boards show at `t` (ms): `index` up now, `next` coming, and `roll` 0..1 how far the
 * boards have rolled over from one to the other (0 for most of the hold).
 */
export function adSlot(t: number, n = ADS.length, hold = AD_HOLD_MS, roll = AD_ROLL_MS): { index: number; next: number; roll: number } {
  const period = hold + roll;
  const k = Math.max(0, t) / period;
  const index = Math.floor(k) % n;
  const into = (k - Math.floor(k)) * period;
  const r = into <= hold ? 0 : (into - hold) / roll;
  return { index, next: (index + 1) % n, roll: Math.min(1, r) };
}

/** After a goal the boards flash GOAL! in the scorer's colour this long (ms), then go back to the ads. */
export const GOAL_FLASH_MS = 4500;

/** What the boards show at `now`: an ad (see adSlot), or GOAL! for `team` (lit, or the strobe's inverted beat). */
export function boardShow(now: number, goal: { team: Team; at: number } | null): { kind: 'ad'; index: number; next: number; roll: number } | { kind: 'goal'; team: Team; lit: boolean } {
  // Lit most of the time, inverted for a beat: a strobe, not a flicker.
  if (goal && now >= goal.at && now - goal.at < GOAL_FLASH_MS) return { kind: 'goal', team: goal.team, lit: (now - goal.at) % 400 < 300 };
  return { kind: 'ad', ...adSlot(now) };
}

// ---- The stadium announcer -------------------------------------------------------------------------

const TEAM_DE: Record<Team, string> = { red: 'Rot', blue: 'Blau' };

export interface Callout {
  head: string;
  sub: string;
  /** Whose colour it's in (none: the hall's green). */
  team?: Team;
  /** Sound the stadium horn with it. */
  horn: boolean;
}

/** What the announcer calls out for one of the office's match events (the match as it is now), if anything. */
export function calloutFor(ev: SoccerEvent, view: SoccerView | null): Callout | null {
  const s = view?.score ?? { red: 0, blue: 0 };
  const score = `${TEAM_DE.red} ${s.red}:${s.blue} ${TEAM_DE.blue}`;
  switch (ev.kind) {
    case 'goal': {
      if (!ev.team) return null;
      const who = ev.who?.startsWith('own goal, ') ? `Eigentor ${ev.who.slice(10)}` : ev.who ? `${ev.who} trifft` : `Tor für ${TEAM_DE[ev.team]}`;
      return { head: '⚽ TOOOR!', sub: `${who} – ${score}`, team: ev.team, horn: true };
    }
    case 'start':
      return { head: 'ANPFIFF!', sub: `${TEAM_DE.red} gegen ${TEAM_DE.blue} – los geht's`, horn: true };
    case 'end':
      return ev.team ? { head: 'ABPFIFF!', sub: `${TEAM_DE[ev.team]} gewinnt – ${score}`, team: ev.team, horn: true } : { head: 'ABPFIFF!', sub: `Unentschieden – ${score}`, horn: true };
    default:
      return null;
  }
}

// ---- The floodlights -------------------------------------------------------------------------------

/** How long the floodlights' flare lasts when a match kicks off (ms). */
export const FLARE_MS = 2200;

/**
 * How bright the floodlights are (1 = normal): they flare up as a match kicks off (`startAt`), and
 * dim a little while nothing's on (between matches, paused).
 */
export function floodlight(now: number, startAt: number, match: boolean): number {
  const base = match ? 1 : 0.86;
  const t = now - startAt;
  if (t < 0 || t > FLARE_MS) return base;
  // Off for a blink, then up past full, settling back.
  if (t < 180) return base * 0.35;
  const k = (t - 180) / (FLARE_MS - 180);
  return base + 0.55 * Math.pow(1 - k, 2);
}
