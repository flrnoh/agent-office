import { GOAL, PITCH, PITCH_CX, defends, other, type GoalSide, type Team } from '../../shared/soccer.js';
import { BALL_R, type Ball, stepBall } from '../../shared/soccer-ball.js';
import { cardFor, type Card } from '../../shared/soccer-tackle.js'; // slide tackles
import { pickMvp, type SoccerGoalRec, type SoccerLine, type SoccerStats, type SoccerTeamStats } from '../../shared/soccer-stats.js';

/*
 * A match's statistics in the soccer hall (flrnoh fork, see FORK.md "The soccer hall"), kept by the
 * office as the match goes (the match, match.ts, keeps them: index.ts reports touches, the match its
 * goals, the time passing and new matches):
 *
 * - goals, with the scorer, the assist (the last touch before the scorer's by someone else, if it was
 *   a teammate's and at most ASSIST_MS before the goal) and the minute; an own goal is the toucher's;
 * - shots (a hard kick at the other goal that, run on by the physics, reaches its end line near the
 *   posts) and shots on target (it would go in); a goal always counts as a shot on target;
 * - passes completed (a kick whose next touch is a teammate's);
 * - possession: playing time the ball was last touched by each team;
 * - saves: a shot on target stopped by a defender near their own goal.
 *
 * Everyone is kept by who they are (`owner`: `account:<id>` or `name:<name>`), so a reconnect keeps
 * their numbers. Pure bookkeeping on the time it's given, for the tests.
 */

/** An assist is a teammate's touch at most this long before the goal. */
export const ASSIST_MS = 6000;
/** A kick's next touch by a teammate within this long completes a pass. */
export const PASS_MS = 8000;
/** A shot on target stopped within this long of the kick, by a defender this near their goal, is a save. */
export const SAVE_MS = 3000;
export const SAVE_NEAR = 7;
/** A kick counts as a shot from at most this far from the goal line, this fast, headed within this much either side of the posts. */
export const SHOT_RANGE = 15;
export const SHOT_SPEED = 7;
export const SHOT_WIDE = 2.5;
/** Consecutive touches by the same player this close together are one touch (running with the ball). */
const SAME_TOUCH_MS = 600;

interface Touch {
  key: string;
  team: Team;
  at: number;
}

interface Line extends SoccerLine {
  key: string;
}

/** What someone's match comes to at the final whistle, for the leaderboard. */
export interface MatchResult {
  owner: string;
  name: string;
  team: Team;
  won: boolean;
  goals: number;
  assists: number;
  mvp: boolean;
}

const zeroTeam = (): SoccerTeamStats => ({ shots: 0, onTarget: 0, passes: 0, saves: 0, tackles: 0, fouls: 0, possession: 50 });

/** Where the goal `side` is: its line's z. */
const goalLineZ = (side: GoalSide) => (side === 'north' ? PITCH.minZ : PITCH.maxZ);

/**
 * Where the ball goes if nobody touches it again (run on by the physics for up to `secs`): the goal
 * it goes into, if any, else the first end line it reaches and where along it (x), if it does.
 */
export function runOn(b: Ball, secs = 4): { goal: GoalSide | null; line?: { side: GoalSide; x: number } } {
  const c = { ...b };
  // Fine steps, so a fast ball is seen at the end line before the boards turn it back.
  const dt = 1 / 120;
  for (let t = 0; t < secs; t += dt) {
    const g = stepBall(c, dt);
    if (g) return { goal: g };
    // Into the goal's mouth it's in or off the woodwork (the next steps say); elsewhere at the end line, it's gone wide.
    const side: GoalSide | null = c.z <= PITCH.minZ + BALL_R + 0.2 ? 'north' : c.z >= PITCH.maxZ - BALL_R - 0.2 ? 'south' : null;
    if (side && !(Math.abs(c.x - PITCH_CX) < GOAL.width / 2 + GOAL.post && c.y < GOAL.height)) return { goal: null, line: { side, x: c.x } };
    if (c.y <= 0 && Math.hypot(c.vx, c.vz) < 0.05) break;
  }
  return { goal: null };
}

/** Which goal the ball would go into if nobody touched it again, if any. */
export const wouldScore = (b: Ball, secs = 4): GoalSide | null => runOn(b, secs).goal;

export class MatchStats {
  private lines = new Map<string, Line>();
  private goals: SoccerGoalRec[] = [];
  private touches: Touch[] = [];
  /** Playing time (ms) each team had the ball last. */
  private poss: Record<Team, number> = { red: 0, blue: 0 };
  private possTeam: Team | null = null;
  private tickAt: number | null = null;
  /** A kick waiting to see whether a teammate gets it (a pass). */
  private pass: Touch | null = null;
  /** A shot waiting to see whether it's saved (or goes in). */
  private shot: (Touch & { onTarget: boolean }) | null = null;
  private mvp: SoccerStats['mvp'];

  reset() {
    this.lines.clear();
    this.goals = [];
    this.touches = [];
    this.poss = { red: 0, blue: 0 };
    this.possTeam = null;
    this.tickAt = null;
    this.pass = null;
    this.shot = null;
    this.mvp = undefined;
  }

  /** `owner` plays for `team` in this match (called while it's on): they're in the numbers, even without a touch. */
  seen(owner: string, name: string, team: Team, number?: number): Line {
    let l = this.lines.get(owner);
    if (!l) {
      l = { key: owner, name, team, goals: 0, assists: 0, shots: 0, onTarget: 0, passes: 0, saves: 0, tackles: 0, fouls: 0, fouled: 0 };
      this.lines.set(owner, l);
    }
    l.name = name;
    l.team = team;
    if (number !== undefined) l.number = number;
    return l;
  }

  /** Time passes: possession goes to whoever touched the ball last, while it's in play. */
  tick(now: number, playing: boolean) {
    if (playing && this.possTeam && this.tickAt !== null) this.poss[this.possTeam] += Math.max(0, now - this.tickAt);
    this.tickAt = now;
  }

  /**
   * `owner` (of `team`) touched the ball at `now`: a kick (`ball` as it leaves their foot) or running
   * into it. Passes, shots and saves come out of the order of touches.
   */
  touch(owner: string, name: string, team: Team, now: number, kick: boolean, ball: Ball, number?: number) {
    const me = this.seen(owner, name, team, number);
    const last = this.touches.at(-1);
    const again = last && last.key === owner && now - last.at < SAME_TOUCH_MS;
    if (again) last.at = now;
    else this.touches.push({ key: owner, team, at: now });
    if (this.touches.length > 32) this.touches.splice(0, this.touches.length - 32);
    this.possTeam = team;

    // Someone else got to a kick: a pass if it's a teammate.
    const pass = this.pass;
    if (pass && pass.key !== owner) {
      if (pass.team === team && now - pass.at <= PASS_MS) {
        const from = this.lines.get(pass.key);
        if (from) from.passes += 1;
      }
      this.pass = null;
    }
    // A shot on target stopped by a defender near their goal: a save.
    const shot = this.shot;
    if (shot && shot.key !== owner) {
      if (shot.onTarget && team !== shot.team && now - shot.at <= SAVE_MS && Math.abs(ball.z - goalLineZ(defends(team))) <= SAVE_NEAR) me.saves += 1;
      this.shot = null;
    }

    if (!kick) return;
    this.shot = null;
    this.pass = null;
    const aim = defends(other(team));
    const run = runOn(ball);
    const onTarget = run.goal === aim;
    if (onTarget || this.isShot(ball, aim, run.line)) {
      me.shots += 1;
      if (onTarget) me.onTarget += 1;
      this.shot = { key: owner, team, at: now, onTarget };
    } else this.pass = { key: owner, team, at: now };
  }

  /** A kick at the `aim` goal from near enough, hard enough, that reaches its end line about at the goal (wide, or off the post). */
  private isShot(b: Ball, aim: GoalSide, line?: { side: GoalSide; x: number }): boolean {
    const toward = aim === 'north' ? -b.vz : b.vz;
    if (toward <= 0 || Math.hypot(b.vx, b.vz) < SHOT_SPEED || Math.abs(goalLineZ(aim) - b.z) > SHOT_RANGE) return false;
    return !!line && line.side === aim && Math.abs(line.x - PITCH_CX) <= GOAL.width / 2 + SHOT_WIDE;
  }

  /** Tackles: `owner` won the ball off an opponent with a clean slide. */
  tackle(owner: string, name: string, team: Team, number?: number) {
    const l = this.seen(owner, name, team, number);
    l.tackles = (l.tackles ?? 0) + 1;
  }

  /** Tackles: `by` fouled `on`. Returns how many fouls `by` has in this match, and the card that came to (two a yellow, three a red). */
  foul(by: { owner: string; name: string; team: Team; number?: number }, on: { owner: string; name: string; team: Team; number?: number }): { fouls: number; card?: Card } {
    const l = this.seen(by.owner, by.name, by.team, by.number);
    const v = this.seen(on.owner, on.name, on.team, on.number);
    l.fouls = (l.fouls ?? 0) + 1;
    v.fouled = (v.fouled ?? 0) + 1;
    const card = cardFor(l.fouls);
    if (card) l.card = card;
    return { fouls: l.fouls, ...(card ? { card } : {}) };
  }

  /** Tackles: the card `owner` has in this match, if any. */
  cardOf(owner: string): Card | undefined {
    return this.lines.get(owner)?.card;
  }

  /** A goal for `team` in `minute`: who scored and who laid it on (names), as it goes on the scoreboard. */
  goal(team: Team, minute: number, now: number): SoccerGoalRec {
    const last = this.touches.at(-1);
    let rec: SoccerGoalRec = { team, minute };
    if (last && last.team === team) {
      const scorer = this.lines.get(last.key);
      if (scorer) {
        scorer.goals += 1;
        // A goal is always a shot on target (a run into the net, a deflection the kick's run-on missed).
        const shot = this.shot;
        if (!shot || shot.key !== last.key) {
          scorer.shots += 1;
          scorer.onTarget += 1;
        } else if (!shot.onTarget) scorer.onTarget += 1;
        rec = { ...rec, scorer: scorer.name };
        // The assist: the last touch before the scorer's by someone else, if a teammate's and recent.
        for (let i = this.touches.length - 1; i >= 0; i--) {
          const t = this.touches[i];
          if (t.key === last.key) continue;
          if (t.team === team && now - t.at <= ASSIST_MS) {
            const a = this.lines.get(t.key);
            if (a) {
              a.assists += 1;
              rec.assist = a.name;
            }
          }
          break;
        }
      }
    } else if (last) {
      const unlucky = this.lines.get(last.key);
      rec = { ...rec, own: true, ...(unlucky ? { scorer: unlucky.name } : {}) };
    }
    this.goals.push(rec);
    this.touches = [];
    this.shot = null;
    this.pass = null;
    // The kickoff's the other team's: nobody has the ball until it's touched again.
    this.possTeam = null;
    return rec;
  }

  /** The final whistle: the man of the match, and each player's match for the leaderboard. */
  finish(winner: Team | 'draw'): MatchResult[] {
    const lines = [...this.lines.values()];
    this.mvp = pickMvp(lines, winner);
    const mvpLine = this.mvp ? lines.find((l) => l.name === this.mvp!.name && l.team === this.mvp!.team) : undefined;
    this.possTeam = null;
    return lines.map((l) => ({ owner: l.key, name: l.name, team: l.team, won: winner === l.team, goals: l.goals, assists: l.assists, mvp: l === mvpLine }));
  }

  view(): SoccerStats {
    const teams = { red: zeroTeam(), blue: zeroTeam() };
    for (const l of this.lines.values()) {
      const t = teams[l.team];
      t.shots += l.shots;
      t.onTarget += l.onTarget;
      t.passes += l.passes;
      t.saves += l.saves;
      t.tackles = (t.tackles ?? 0) + (l.tackles ?? 0);
      t.fouls = (t.fouls ?? 0) + (l.fouls ?? 0);
    }
    const total = this.poss.red + this.poss.blue;
    if (total > 0) {
      teams.red.possession = Math.round((this.poss.red / total) * 100);
      teams.blue.possession = 100 - teams.red.possession;
    }
    const players = [...this.lines.values()]
      .map(({ key: _key, ...l }) => l)
      .sort((a, b) => (a.team === b.team ? b.goals - a.goals || b.assists - a.assists || a.name.localeCompare(b.name) : a.team === 'red' ? -1 : 1));
    return { goals: this.goals.map((g) => ({ ...g })), teams, players, ...(this.mvp ? { mvp: { ...this.mvp } } : {}) };
  }
}
