import { TEAM_NAME, defends, onPitch, type SoccerEvent, type SoccerServerMsg, type Team } from '../../shared/soccer.js';
import { HOLD_R, type Ball, type Possession } from '../../shared/soccer-ball.js';
import {
  RED_OUT_MS,
  SLIDE,
  SLIDE_MS,
  SLIDE_TRUST,
  type ContactPlayer,
  type Slide,
  firstContact,
  foulSpot,
  isPenalty,
  makeSlide,
  penaltyPlaces,
  penaltySpot,
  pokeOf,
  slideAt,
  slideRefused,
} from '../../shared/soccer-tackle.js';
import type { SoccerMatch } from './match.js';

/*
 * Slide tackles on the server (flrnoh fork, see FORK.md "The soccer hall", and shared/soccer-tackle.ts
 * for the rules): who's sliding (one every two seconds, only on the pitch, in a team, when the match
 * lets them: not at a set piece, nor in the other team's kickoff), and every tick, along each slide's
 * curve, what it hits first. The ball: poked on (or won), a clean tackle if an opponent had it. An
 * opponent's legs: a foul, if a match is on: the whistle, a free kick at the spot or a penalty in the
 * fouler's own penalty area, the foul counted, the second a yellow card, the third a red one (off the
 * pitch for a minute). index.ts hooks it in (the message, the tick, who may touch the ball).
 */

/** Someone on the pitch as the tackles see them: where (run on to now) and how fast. */
export interface TacklePlayer extends ContactPlayer {
  name: string;
  team: Team;
  owner: string;
  number?: number;
}

export interface TackleHost {
  match: SoccerMatch;
  ball: Ball;
  poss: Possession;
  /** Whether the ball's held (the kickoff's freeze). */
  held(): boolean;
  /** Everyone on a team, where the office has them now. */
  players(): TacklePlayer[];
  /** `id` touched the ball (the last toucher, stats). */
  touch(id: string): void;
  /** `id` can't take the ball for `ms` (they just lost it). */
  cool(id: string, ms: number): void;
  /** The ball onto (x, z), dead still, nobody's (a set piece). */
  placeBall(x: number, z: number): void;
  /** The ball was hit: its sound and a snapshot at once. */
  hit(speed: number): void;
  /** Something happened: the match to everyone, with `ev`. */
  event(ev: SoccerEvent): void;
  /** Off the pitch (a red card), with this said. */
  sendOff(id: string, text: string): void;
  /** To everyone in the hall, and to one of them. */
  send(m: SoccerServerMsg): void;
  tell(id: string, m: SoccerServerMsg): void;
}

interface LiveSlide extends Slide {
  id: string;
  team: Team;
  /** When it started (ms), how far along it contacts have been looked for (ms of it), and whether it's hit something (or stopped looking). */
  at: number;
  checked: number;
  done: boolean;
}

/** Losing the ball to a slide: this long before the one who had it can take it again (ms). */
const BEATEN_MS = 600;
/** Telling someone why their slide wasn't taken: at most this often (ms). */
const NOTE_MS = 600;

export type SlideResult = { ok: true; slide: { x: number; z: number; dir: number; d: number } } | { ok: false; reason: string };

export class SoccerTackles {
  private live = new Map<string, LiveSlide>();
  private nextAt = new Map<string, number>();
  private noteAt = new Map<string, number>();
  /** Red cards: who (by owner) may not play until when. */
  private outUntil = new Map<string, number>();

  constructor(private host: TackleHost) {}

  /** Whether `id` is sliding (down, lying or getting up) at `now`: no running with the ball, no kicks. */
  sliding(id: string, now: number): boolean {
    const s = this.live.get(id);
    return !!s && now - s.at < SLIDE_MS;
  }

  /** Where `id`'s slide has them at `now`, if they're sliding. */
  where(id: string, now: number): { x: number; z: number } | null {
    const s = this.live.get(id);
    if (!s || now - s.at >= SLIDE_MS) return null;
    const p = slideAt(s, now - s.at);
    return { x: p.x, z: p.z };
  }

  /** Why `owner` may not play now (sent off), or null. */
  sentOff(owner: string, now: number): string | null {
    const until = this.outUntil.get(owner) ?? 0;
    if (now >= until) {
      this.outUntil.delete(owner);
      return null;
    }
    return `🟥 Sent off: back on the pitch in ${Math.ceil((until - now) / 1000)} s`;
  }

  /**
   * A slide from `id` (of `team`; null: not playing) along `dir`, from where the office has them (`at`) or
   * where their page says (`claim`, if it's within SLIDE_TRUST of that). Everyone sees it start; a refusal
   * goes back to them (not too often).
   */
  start(id: string, team: Team | undefined, at: { x: number; z: number } | null, dir: unknown, claim: { x?: unknown; z?: unknown }, now: number): SlideResult {
    const r = this.check(id, team, at, dir, now);
    if (typeof r === 'string') {
      if (now - (this.noteAt.get(id) ?? -1e9) >= NOTE_MS) {
        this.noteAt.set(id, now);
        this.host.tell(id, { t: 'soccer.slide', id, no: r });
      }
      return { ok: false, reason: r };
    }
    const cx = claim.x;
    const cz = claim.z;
    const trusted = typeof cx === 'number' && typeof cz === 'number' && Number.isFinite(cx) && Number.isFinite(cz) && Math.hypot(cx - r.x, cz - r.z) <= SLIDE_TRUST && onPitch(cx, cz, -0.05);
    const m = makeSlide(trusted ? cx : r.x, trusted ? cz : r.z, dir as number);
    // Rounded as it goes on the wire, so every page's curve is the office's to the millimetre.
    const s = { x: r3(m.x), z: r3(m.z), dir: r3(m.dir), d: r3(m.d) };
    this.live.set(id, { ...s, id, team: team!, at: now, checked: -1, done: false });
    this.nextAt.set(id, now + SLIDE.cooldownMs);
    // Sliding, you've let go of the ball.
    if (this.host.poss.id === id) this.host.poss.id = null;
    this.host.send({ t: 'soccer.slide', id, ...s });
    return { ok: true, slide: s };
  }

  private check(id: string, team: Team | undefined, at: { x: number; z: number } | null, dir: unknown, now: number): { x: number; z: number } | string {
    if (!team) return 'not playing';
    if (typeof dir !== 'number' || !Number.isFinite(dir)) return 'bad slide';
    const m = this.host.match;
    const no = slideRefused(m.phase, team, m.kickoff);
    if (no) return no;
    if (this.sliding(id, now)) return 'sliding';
    if (now < (this.nextAt.get(id) ?? 0)) return 'too soon';
    if (!at || !onPitch(at.x, at.z, -0.05)) return 'off the pitch';
    return at;
  }

  /** Every tick, before the ball's steps: what each slide hit since the last one, first. */
  tick(now: number) {
    if (!this.live.size) return;
    let players: TacklePlayer[] | null = null;
    for (const s of this.live.values()) {
      const ms = now - s.at;
      if (ms >= SLIDE_MS) {
        this.live.delete(s.id);
        continue;
      }
      if (s.done) continue;
      const m = this.host.match;
      players ??= this.host.players();
      // The ball counts when it may be played now; legs only in a match in play (no fouls in practice).
      const ballOk = !this.host.held() && m.canTouch(s.team, now);
      const b = this.host.ball;
      const opponents = m.phase === 'play' ? players.filter((p) => p.team !== s.team && p.id !== s.id) : [];
      const c = firstContact(s, s.checked, ms, ballOk ? b : null, opponents);
      s.checked = ms;
      if (!c) {
        if (ms >= SLIDE.activeMs) s.done = true;
        continue;
      }
      s.done = true;
      if (c.kind === 'ball') this.poke(s, c.ms, players, now);
      else this.foul(s, players.find((p) => p.id === c.id)!, c.x, c.z, players, now);
      // A foul stops play: nobody else's slide counts after it in this tick.
      if (m.phase !== 'play' && c.kind === 'legs') break;
    }
  }

  /** The slide got the ball first: poked on (or won); a clean tackle if an opponent had it, or was right by it. */
  private poke(s: LiveSlide, ms: number, players: TacklePlayer[], now: number) {
    const h = this.host;
    const b = h.ball;
    const had = h.poss.id;
    const opp = players.filter((p) => p.team !== s.team);
    const won = (!!had && opp.some((p) => p.id === had)) || opp.some((p) => Math.hypot(p.x - b.x, p.z - b.z) < HOLD_R);
    const v = pokeOf(s, ms);
    h.poss.id = null;
    b.vx = v.vx;
    b.vz = v.vz;
    b.vy = 0;
    b.y = 0;
    for (const p of opp) if (Math.hypot(p.x - b.x, p.z - b.z) < HOLD_R) h.cool(p.id, BEATEN_MS);
    h.touch(s.id);
    h.hit(Math.hypot(v.vx, v.vz));
    if (won) {
      const me = players.find((p) => p.id === s.id);
      if (me && h.match.phase === 'play') h.match.stats.tackle(me.owner, me.name, me.team, me.number);
      h.event({ kind: 'tackle', team: s.team, id: s.id, ...(me ? { who: me.name } : {}) });
    }
  }

  /** The slide got `victim`'s legs first (they were at x, z): a foul. */
  private foul(s: LiveSlide, victim: TacklePlayer, x: number, z: number, players: TacklePlayer[], now: number) {
    const h = this.host;
    const by = players.find((p) => p.id === s.id);
    if (!by) return;
    const penalty = isPenalty(s.team, x, z);
    const spot = penalty ? penaltySpot(defends(s.team)) : foulSpot(x, z);
    // At a penalty, the defenders' keeper is whoever of them is nearest their goal (their page puts them on the line).
    const goal = penaltyPlaces(defends(s.team)).keeper;
    const keeper = penalty ? players.filter((p) => p.team === s.team).sort((a, b) => Math.hypot(a.x - goal.x, a.z - goal.z) - Math.hypot(b.x - goal.x, b.z - goal.z))[0]?.id : undefined;
    if (!h.match.foul(now, { kind: penalty ? 'penalty' : 'freekick', team: victim.team, x: spot.x, z: spot.z, ...(penalty ? { taker: victim.id } : {}), ...(keeper ? { keeper } : {}) })) return;
    const { card } = h.match.stats.foul(by, victim);
    h.placeBall(spot.x, spot.z);
    const what = penalty ? `Penalty for ${TEAM_NAME[victim.team]}` : `Free kick for ${TEAM_NAME[victim.team]}`;
    const cardText = card === 'red' ? ' · 🟥 red card' : card === 'yellow' ? ' · 🟨 yellow card' : '';
    h.event({ kind: 'foul', team: victim.team, who: by.name, id: by.id, victim: victim.id, victimName: victim.name, penalty, ...(card ? { card } : {}), text: `🚩 Foul by ${by.name} on ${victim.name}: ${what}${cardText}` });
    if (card === 'red') this.redCard(by, now);
  }

  private redCard(p: TacklePlayer, now: number) {
    this.outUntil.set(p.owner, now + RED_OUT_MS);
    this.host.sendOff(p.id, `🟥 ${p.name} is sent off for ${RED_OUT_MS / 1000} s`);
  }

  /** `id` left the pitch (or the hall): their slide's over. */
  forget(id: string) {
    this.live.delete(id);
  }

  clear() {
    this.live.clear();
    this.nextAt.clear();
    this.noteAt.clear();
  }
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;

