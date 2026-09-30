import {
  GOAL_MS,
  GOALS_TO_WIN,
  KICKOFF_FIRST_MS,
  KICKOFF_MS,
  MATCH_MS,
  OVER_MS,
  TEAM_NAME,
  other,
  type SoccerEvent,
  type SoccerPhase,
  type SoccerView,
  type Team,
} from '../../shared/soccer.js';

/*
 * A match in the soccer hall (flrnoh fork, see FORK.md "The soccer hall"): the phases, the score and
 * the clock, driven by the time it's given (`now`, ms), so the tests can run it on a fake clock.
 *
 *   waiting ─(both teams have a player)→ kickoff ─(2 s)→ play ─(goal)→ goal ─(3 s)→ kickoff …
 *   play ─(5 goals, or the clock runs out)→ over ─(10 s)→ kickoff (a new match) or waiting
 *   kickoff/play/goal ─(a team empties)→ paused ─(both have players again)→ kickoff
 *   anything ─(nobody left on the pitch)→ waiting, the score gone
 *
 * The clock only runs in play. While waiting or paused the ball is free to kick about (practice:
 * goals then don't count). After the kickoff's freeze only the kicking-off team may touch the ball
 * until it has, or KICKOFF_FIRST_MS have gone by.
 */

export type TeamCounts = Record<Team, number>;

export class SoccerMatch {
  phase: SoccerPhase = 'waiting';
  score: Record<Team, number> = { red: 0, blue: 0 };
  /** Who kicks off (the next kickoff, or the one just taken). */
  kickoff: Team = 'red';
  winner: Team | 'draw' | undefined;
  /** Left on the clock when it last stopped (or started), and when it started running (null: stopped). */
  private clockLeft = MATCH_MS;
  private clockFrom: number | null = null;
  /** When the phase moves on by itself (kickoff, goal, over). */
  private until = 0;
  /** Until when only the kicking-off team may touch the ball (0: anyone). */
  private firstUntil = 0;
  /** Who kicked off the last match (the next one's kicked off by the other). */
  private opener: Team = 'blue';

  /** Left on the clock at `now`. */
  clock(now: number): number {
    return Math.max(0, this.clockFrom === null ? this.clockLeft : this.clockLeft - (now - this.clockFrom));
  }

  private stopClock(now: number) {
    this.clockLeft = this.clock(now);
    this.clockFrom = null;
  }

  view(now: number): Omit<SoccerView, 'players'> {
    const timed = this.phase === 'kickoff' || this.phase === 'goal' || this.phase === 'over';
    return {
      phase: this.phase,
      score: { ...this.score },
      clockMs: this.clock(now),
      running: this.clockFrom !== null,
      ...(timed ? { phaseMs: Math.max(0, this.until - now) } : {}),
      ...(this.phase === 'kickoff' || (this.phase === 'play' && now < this.firstUntil) ? { kickoff: this.kickoff } : {}),
      ...(this.phase === 'over' && this.winner ? { winner: this.winner } : {}),
    };
  }

  /** Whether players of `team` may touch the ball now (kick it, or run it along). */
  canTouch(team: Team, now: number): boolean {
    if (this.phase === 'waiting' || this.phase === 'paused') return true;
    if (this.phase !== 'play') return false;
    return now >= this.firstUntil || team === this.kickoff;
  }

  /** Someone of `team` touched the ball: after a kickoff, that frees it for everyone once the kicking-off team has. */
  touched(team: Team) {
    if (team === this.kickoff) this.firstUntil = 0;
  }

  /** Whether a goal now counts (in play; practice goals while waiting or paused don't). */
  get counting(): boolean {
    return this.phase === 'play';
  }

  /** Time passes and people come and go: what happens next. `counts`: players per team now. */
  update(now: number, counts: TeamCounts): SoccerEvent[] {
    const out: SoccerEvent[] = [];
    const both = counts.red > 0 && counts.blue > 0;
    if (counts.red === 0 && counts.blue === 0) {
      if (this.phase !== 'waiting' || this.score.red || this.score.blue) {
        this.reset();
        out.push({ kind: 'reset' });
      }
      return out;
    }
    switch (this.phase) {
      case 'waiting':
        if (both) out.push(...this.start(now));
        break;
      case 'kickoff':
        if (!both) out.push(this.pause(now));
        else if (now >= this.until) {
          this.phase = 'play';
          this.clockFrom = now;
          this.firstUntil = now + KICKOFF_FIRST_MS;
          out.push({ kind: 'play', team: this.kickoff });
        }
        break;
      case 'play':
        if (this.clock(now) <= 0) out.push(this.end(now));
        else if (!both) out.push(this.pause(now));
        break;
      case 'goal':
        if (!both) out.push(this.pause(now));
        else if (now >= this.until) out.push(this.toKickoff(now, this.kickoff));
        break;
      case 'paused':
        if (both) {
          out.push(this.toKickoff(now, this.kickoff));
          out.push({ kind: 'resume', text: '⚽ Both teams are back: play on' });
        }
        break;
      case 'over':
        if (now >= this.until) {
          if (both) out.push(...this.start(now));
          else {
            this.reset();
            out.push({ kind: 'reset' });
          }
        }
        break;
    }
    return out;
  }

  /** The ball went in for `team`, `who` last touched it: a goal (if it counts), or the end of the match. */
  scored(now: number, team: Team, who?: string): SoccerEvent[] {
    if (!this.counting) return [];
    this.score[team] += 1;
    this.stopClock(now);
    const text = `⚽ GOAL! ${TEAM_NAME[team]}${who ? ` (${who})` : ''} · Red ${this.score.red}:${this.score.blue} Blue`;
    const out: SoccerEvent[] = [{ kind: 'goal', team, ...(who ? { who } : {}), text }];
    if (this.score[team] >= GOALS_TO_WIN) out.push(this.end(now));
    else {
      this.phase = 'goal';
      this.until = now + GOAL_MS;
      // The team that conceded kicks off.
      this.kickoff = other(team);
    }
    return out;
  }

  private start(now: number): SoccerEvent[] {
    this.score = { red: 0, blue: 0 };
    this.clockLeft = MATCH_MS;
    this.clockFrom = null;
    this.winner = undefined;
    this.opener = other(this.opener);
    return [{ kind: 'start', text: '⚽ Kick-off! A new match: 5 minutes, first to 5 goals' }, this.toKickoff(now, this.opener)];
  }

  private toKickoff(now: number, team: Team): SoccerEvent {
    this.stopClock(now);
    this.phase = 'kickoff';
    this.kickoff = team;
    this.until = now + KICKOFF_MS;
    this.firstUntil = 0;
    return { kind: 'kickoff', team };
  }

  private pause(now: number): SoccerEvent {
    this.stopClock(now);
    this.phase = 'paused';
    this.firstUntil = 0;
    return { kind: 'pause', text: '⏸️ A team is empty: the match waits (join to play on)' };
  }

  private end(now: number): SoccerEvent {
    this.stopClock(now);
    this.phase = 'over';
    this.until = now + OVER_MS;
    this.firstUntil = 0;
    const { red, blue } = this.score;
    this.winner = red > blue ? 'red' : blue > red ? 'blue' : 'draw';
    const text = this.winner === 'draw' ? `🏁 Full time: a draw, ${red}:${blue}` : `🏁 Full time: ${TEAM_NAME[this.winner]} win ${Math.max(red, blue)}:${Math.min(red, blue)}`;
    return { kind: 'end', ...(this.winner !== 'draw' ? { team: this.winner } : {}), text };
  }

  private reset() {
    this.phase = 'waiting';
    this.score = { red: 0, blue: 0 };
    this.clockLeft = MATCH_MS;
    this.clockFrom = null;
    this.winner = undefined;
    this.firstUntil = 0;
  }
}
