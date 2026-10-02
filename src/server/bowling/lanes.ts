import { LANE_COUNT } from '../../shared/bowling.js';
import { BALLS, MAX_PLAYERS, RELEASE_S, cleanThrow, isBallId, isLane, type BowlingRoll, type LanePlayer, type LaneView, type StandingPin } from '../../shared/bowling-game.js';
import { bowl, fullRack, maskOf } from '../../shared/bowling-sim.js';
import { finished, marks, position, score } from '../../shared/bowling-score.js';
import type { LeagueGame } from '../../shared/bowling-league.js';

/*
 * The six lanes' games (flrnoh fork, see FORK.md "Bowling lanes"). The office keeps who's on which
 * lane, whose ball it is, the score sheets and the pins standing, and it counts every ball itself:
 * the bowler's page sends only how it was thrown (where they stood, how hard, the line, the hook),
 * the office runs the very same simulation the pages play back (shared/bowling-sim.ts, which uses
 * nothing that could come out differently on another machine) and sends the throw and what it
 * counted to everyone in the centre. Nobody can send pins, only a throw within its limits.
 *
 * Turns go the way a bowling centre's do: a frame each in order, the next frame once everyone has
 * bowled this one, and whoever joins late bowls their missed frames first. A lane's busy while its
 * ball rolls and the pinsetter sweeps; the next ball waits for that.
 */

/** The pinsetter's sweep and reset after the pins settle (s). */
export const SWEEP_S = 2.4;
/** Someone up this long without bowling can be skipped by the others on the lane (ms). */
export const IDLE_MS = 90_000;

export interface Bowler {
  id: string;
  owner: string;
  name: string;
  color: string;
}

interface Player extends LanePlayer {
  owner: string;
}

interface Lane {
  players: Player[];
  up: string | null;
  upSince: number;
  pins: StandingPin[];
  game: number;
  over: boolean;
  busyUntil: number;
}

const freshLane = (game = 1): Lane => ({ players: [], up: null, upSince: 0, pins: fullRack(), game, over: false, busyUntil: 0 });

export class BowlingLanes {
  private lanes: Lane[] = Array.from({ length: LANE_COUNT }, () => freshLane());

  /** A finished game goes to the league (server/bowling/league.ts). */
  constructor(private readonly record: (g: LeagueGame) => void = () => {}) {}

  view(lane: number): LaneView {
    const l = this.lanes[lane];
    return {
      lane,
      players: l.players.map((p) => ({ id: p.id, name: p.name, color: p.color, ball: p.ball, rolls: p.rolls.map((r) => ({ ...r })) })),
      up: l.up,
      upSince: l.upSince,
      pins: l.pins.map((p) => ({ ...p })),
      game: l.game,
      over: l.over,
    };
  }

  views(): LaneView[] {
    return this.lanes.map((_, i) => this.view(i));
  }

  /** The lane `id` bowls on, if any. */
  laneOf(id: string): number {
    return this.lanes.findIndex((l) => l.players.some((p) => p.id === id));
  }

  /** Onto `lane`'s game (off any other first). A lane whose game is over starts a new one. */
  join(b: Bowler, lane: unknown, now: number): { ok: true; lanes: number[] } | { error: string } {
    if (!isLane(lane)) return { error: 'No such lane' };
    const at = this.laneOf(b.id);
    if (at === lane) return { ok: true, lanes: [] };
    const l = this.lanes[lane];
    if (l.players.length >= MAX_PLAYERS) return { error: `Bahn ${lane + 1} ist voll (${MAX_PLAYERS} Spieler)` };
    const changed = at >= 0 ? [at, lane] : [lane];
    if (at >= 0) this.leave(b.id, now);
    if (l.over) this.restart(lane, now);
    const ball = this.lanes.flatMap((x) => x.players).find((p) => p.owner === b.owner)?.ball ?? 4;
    l.players.push({ id: b.id, owner: b.owner, name: b.name.slice(0, 32), color: b.color.slice(0, 16), ball, rolls: [] });
    if (!l.up) this.nextUp(lane, now);
    return { ok: true, lanes: changed };
  }

  /** `id` steps off their lane (or left the centre, or the office): their game goes with them. */
  leave(id: string, now: number): number | undefined {
    const lane = this.laneOf(id);
    if (lane < 0) return undefined;
    const l = this.lanes[lane];
    l.players = l.players.filter((p) => p.id !== id);
    if (!l.players.length) {
      this.lanes[lane] = freshLane(l.game + 1);
      return lane;
    }
    if (l.up === id) {
      // The next one up faces a fresh rack.
      l.up = null;
      l.pins = fullRack();
      this.nextUp(lane, now);
    }
    if (!l.over && l.players.every((p) => finished(p.rolls))) this.finish(lane, now);
    return lane;
  }

  /** A house ball off the rack: theirs from now on. The lane it changed, if they're on one. */
  pickBall(id: string, ball: unknown): number | undefined {
    if (!isBallId(ball)) return undefined;
    const lane = this.laneOf(id);
    const p = lane >= 0 ? this.lanes[lane].players.find((x) => x.id === id) : undefined;
    if (!p) return undefined;
    p.ball = ball;
    return lane;
  }

  /** Everyone on `lane` starts again from the first frame: once the game's over, or by someone on it before anyone's bowled. */
  newGame(id: string, lane: unknown, now: number): { ok: true } | { error: string } {
    if (!isLane(lane)) return { error: 'No such lane' };
    const l = this.lanes[lane];
    if (!l.players.some((p) => p.id === id)) return { error: `Erst auf Bahn ${lane + 1} mitspielen` };
    if (now < l.busyUntil) return { error: 'Die Kugel rollt noch' };
    if (!l.over && l.players.some((p) => p.rolls.length)) {
      if (l.players.length > 1) return { error: 'Das Spiel läuft noch' };
    }
    this.restart(lane, now);
    return { ok: true };
  }

  /**
   * Someone on `lane` skips whoever's up and has kept everyone waiting (IDLE_MS): off the lane they
   * go. Returns the id skipped, if anyone was.
   */
  skip(id: string, lane: number, now: number): string | null {
    const l = this.lanes[lane];
    if (!l || !l.up || l.up === id || !l.players.some((p) => p.id === id) || now - l.upSince < IDLE_MS || now < l.busyUntil) return null;
    const gone = l.up;
    this.leave(gone, now);
    return gone;
  }

  /**
   * A ball from `id`'s page: only from whoever's up on that lane, not while the last one's still
   * rolling, and only within the limits. The office bowls it and counts the pins.
   */
  throw(id: string, lane: unknown, params: unknown, now: number): { roll: BowlingRoll; over: { name: string; score: number }[] | null } | { error: string } {
    if (!isLane(lane)) return { error: 'No such lane' };
    const l = this.lanes[lane];
    const p = l.players.find((x) => x.id === id);
    if (!p) return { error: `Erst auf Bahn ${lane + 1} mitspielen` };
    if (l.up !== id) return { error: 'Du bist nicht dran' };
    if (now < l.busyUntil) return { error: 'Die Kugel rollt noch' };
    const t = cleanThrow(params);
    if (!t) return { error: 'Bad throw' };
    const before = l.pins.map((x) => ({ ...x }));
    const res = bowl(t, BALLS[p.ball].lbs, before);
    // A foul counts nothing; what it knocked down is set up again or swept with the frame.
    const pins = res.foul ? 0 : res.knocked;
    const left = res.foul ? maskOf(before) : maskOf(res.standing);
    p.rolls.push({ pins, ...(res.foul ? { foul: true } : {}), left });
    const next = position(p.rolls);
    l.pins = next.done || next.fullRack ? fullRack() : res.foul ? before : res.standing;
    l.busyUntil = now + (RELEASE_S + res.secs + SWEEP_S) * 1000;
    l.upSince = l.busyUntil;
    if (next.done || next.ball === 0) this.nextUp(lane, now, l.busyUntil);
    let over: { name: string; score: number }[] | null = null;
    if (l.players.every((x) => finished(x.rolls))) over = this.finish(lane, now);
    const roll: BowlingRoll = {
      lane,
      by: id,
      name: p.name,
      ball: p.ball,
      params: t,
      pins: before,
      roll: p.rolls[p.rolls.length - 1],
      after: l.pins.map((x) => ({ ...x })),
      foul: res.foul,
      secs: res.secs,
      view: this.view(lane),
    };
    return { roll, over };
  }

  /** Who's next on `lane`: the one with the fewest frames bowled (late joiners catch up), first in the order on a tie. */
  private nextUp(lane: number, now: number, from = now) {
    const l = this.lanes[lane];
    let best: Player | null = null;
    let bestFrame = Infinity;
    for (const p of l.players) {
      const pos = position(p.rolls);
      if (pos.done) continue;
      if (pos.frame < bestFrame) {
        best = p;
        bestFrame = pos.frame;
      }
    }
    if (best?.id !== l.up) l.pins = fullRack();
    l.up = best?.id ?? null;
    l.upSince = Math.max(now, from);
  }

  private restart(lane: number, now: number) {
    const l = this.lanes[lane];
    for (const p of l.players) p.rolls = [];
    l.game += 1;
    l.over = false;
    l.pins = fullRack();
    l.up = null;
    this.nextUp(lane, now);
  }

  /** Everyone's bowled ten frames: into the league, best first. */
  private finish(lane: number, now: number): { name: string; score: number }[] {
    const l = this.lanes[lane];
    l.over = true;
    l.up = null;
    const out = l.players.filter((p) => finished(p.rolls)).map((p) => ({ p, score: score(p.rolls) }));
    for (const { p, score: s } of out) this.record({ owner: p.owner, name: p.name, score: s, ...marks(p.rolls), at: now });
    return out.sort((a, b) => b.score - a.score).map(({ p, score: s }) => ({ name: p.name, score: s }));
  }
}
