import type { ServerMsg } from '../../shared/protocol.js';
import {
  MAX_PER_TEAM,
  TEAM_NAME,

  scorerOf,
  type BallHitKind,
  type SoccerClientMsg,
  type SoccerEvent,
  type SoccerView,
  type Team,
} from '../../shared/soccer.js';
import {
  type Ball,
  type BallHit,
  type Footer,
  type Possession,
  type TouchEvent,
  SIM_DT,
  ballWire,
  canKick,
  centreBall,
  clamp01,
  kick,
  stepBall,
  still,
  touchBall,
} from '../../shared/soccer-ball.js';
import { SoccerMatch } from './match.js';
import { SoccerRecords } from './records.js'; // stats: the leaderboard and shirt numbers
import { SoccerTackles, type TacklePlayer } from './tackle.js'; // slide tackles and fouls

/*
 * The soccer hall's game on the server (flrnoh fork, see FORK.md "The soccer hall"): who's in the
 * hall, who plays for whom, the ball, and the match. The office decides where the ball is: it runs
 * the physics (shared/soccer-ball.ts) in fixed steps of SIM_DT, 30 ticks a second, reads the players'
 * positions from their ordinary `move` messages (`where`), lets them take the ball, dribble it and
 * tackle for it (touchBall), takes their kicks (only from close enough, allowing for the line's lag,
 * not too often, clamped), sees goals, and runs the match (match.ts). Everyone in the hall gets the
 * ball about 15 times a second while it moves (with the step it's from and who has it, so their
 * pages play it back smoothly) and the match whenever it changes.
 */

export interface SoccerMember {
  id: string;
  name: string;
  /** Stats: who they are for the leaderboard, `account:<id>` or `name:<name>` (default: by name). */
  owner?: string;
  send(m: ServerMsg): void;
}

export interface SoccerDeps {
  /** Where someone in the hall stands now (their last `move`, and which way they face), in the hall's coordinates; null when they're not in there. */
  where(id: string): { x: number; z: number; rotY?: number } | null;
  /** The clock (ms). */
  now?: () => number;
  /** Runs itself on a timer while anyone's inside (the default); tests step it with `tick`. */
  timer?: boolean;
  /** Stats: where the leaderboard's kept (soccer.json); none: in memory only. */
  dataDir?: string;
}

export const TICK_HZ = 30;
/** Every how many ticks the ball goes out while it moves (15 a second), and at least how often (ms) while it lies still. */
const SNAP_EVERY = 2;
const IDLE_SNAP_MS = 1000;
/** The match's state goes out at least this often (ms), to keep everyone's clock true. */
const STATE_MS = 5000;
/** One kick per player per this many ms. */
export const KICK_GAP_MS = 250;
/**
 * A kick counts when the ball was in reach (KICK_REACH, plus KICK_SLACK m) of where the office has you
 * at any moment in the last KICK_LAG_MS: what you saw on your page was that long ago here.
 */
export const KICK_SLACK = 0.35;
export const KICK_LAG_MS = 350;
/** After your own kick you can't take the ball back for this long (ms); after a 50/50 or losing it in a tackle, LOOSE_COOL_MS. */
const KICK_COOL_MS = 250;
const LOOSE_COOL_MS = 350;
/** How many of the ball's past steps are kept, to judge a kick by (half a second). */
const HISTORY = 30;
/** A practice goal (no match on): the ball comes back to the centre after this long (ms). */
const PRACTICE_RESET_MS = 1500;
/** Someone who moved further than this between two `move`s was put somewhere (m): no speed from that. */
const JUMP = 3;
/** Nobody runs faster than this (m/s), whatever their messages say. */
const MAX_RUN = 9;

interface Member {
  m: SoccerMember;
  team?: Team;
  lastKick: number;
  /** Until when they can't take the ball (ms: just after their own kick, a 50/50, losing a tackle). */
  coolUntil: number;
  /** Tackles: beaten by a slide until then (ms): the poked ball goes past them, not off their shins. */
  beatenUntil?: number;
  /** Where they were last seen standing, when, and how fast they were going. */
  track: { x: number; z: number; t: number; vx: number; vz: number } | null;
}

export type JoinResult = { ok: true; team: Team } | { ok: false; reason: string };

export class Soccer {
  private members = new Map<string, Member>();
  readonly ball: Ball = centreBall();
  readonly match = new SoccerMatch();
  /** Stats: the all-time leaderboard, and everyone's shirt number (by id) while they're on the pitch. */
  readonly records: SoccerRecords;
  private numbers = new Map<string, number>();
  private readonly now: () => number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastTickAt = 0;
  private ticks = 0;
  private snapAt = 0;
  private stateAt = 0;
  /** The loudest thing the ball hit since the last snapshot, and who kicked it. */
  private hit: { kind: BallHitKind; speed: number; by?: string } | null = null;
  /** Who touched the ball last (a goal's scorer, if it's their team's). */
  private toucher: { id: string; name: string; team: Team } | null = null;
  /** When a practice goal's ball goes back to the centre (0: it doesn't). */
  private resetAt = 0;
  /** The ball's held on the centre spot (the kickoff's freeze). */
  private held = false;
  /** Who's dribbling the ball. */
  readonly poss: Possession = { id: null };
  /** The physics' clock: how many SIM_DT steps it's gone (it runs on while the ball's held, too), and the time not yet stepped (s). */
  private k = 0;
  private acc = 0;
  /** Where the ball was over the last HISTORY steps, for kicks from pages a little behind. */
  private history: { k: number; x: number; z: number; y: number }[] = [];

  /** Slide tackles, fouls and cards (tackle.ts). */
  readonly tackles: SoccerTackles;

  constructor(private deps: SoccerDeps) {
    this.now = deps.now ?? Date.now;
    this.records = new SoccerRecords(deps.dataDir); // stats
    this.tackles = new SoccerTackles(this.tackleHost()); // tackles
  }

  // ---- In and out ---------------------------------------------------------------------------------

  /** Someone came into the hall: they see the match and the ball. */
  enter(m: SoccerMember) {
    const was = this.members.get(m.id);
    this.members.set(m.id, { m, team: was?.team, lastKick: 0, coolUntil: 0, track: null });
    m.send({ t: 'soccer', state: this.view() });
    m.send({ t: 'soccer.ball', b: ballWire(this.ball), k: this.k, ...(this.poss.id ? { c: this.poss.id } : {}) });
    this.run();
  }

  /** Someone left the hall (or the office): off the pitch too. */
  leave(id: string) {
    const was = this.members.get(id);
    if (!was) return;
    this.members.delete(id);
    this.tackles.forget(id); // tackles
    if (was.team) this.changed({ kind: 'leave', team: was.team, who: was.m.name, text: `${was.m.name} left the pitch` });
    if (!this.members.size) this.halt();
  }

  /** Whether `id` is in the hall (as far as the game knows). */
  has(id: string): boolean {
    return this.members.has(id);
  }

  teamOf(id: string): Team | undefined {
    return this.members.get(id)?.team;
  }

  counts(): Record<Team, number> {
    const c = { red: 0, blue: 0 };
    for (const p of this.members.values()) if (p.team) c[p.team] += 1;
    return c;
  }

  /** Onto the pitch: the team with fewer players (on a tie, the one behind; else red). At most MAX_PER_TEAM a side. */
  join(id: string): JoinResult {
    const p = this.members.get(id);
    if (!p) return { ok: false, reason: 'Come into the hall first' };
    if (p.team) return { ok: true, team: p.team };
    const out = this.tackles.sentOff(ownerOf(p), this.now()); // tackles: a red card
    if (out) return { ok: false, reason: out };
    const c = this.counts();
    const s = this.match.score;
    const team: Team = c.red !== c.blue ? (c.red < c.blue ? 'red' : 'blue') : s.red !== s.blue && this.match.phase !== 'waiting' ? (s.red < s.blue ? 'red' : 'blue') : 'red';
    if (c[team] >= MAX_PER_TEAM) return { ok: false, reason: `The pitch is full: ${MAX_PER_TEAM} a side` };
    p.team = team;
    p.lastKick = 0;
    this.numbers.set(id, this.records.numberFor(ownerOf(p), p.m.name, new Set([...this.members.values()].filter((o) => o !== p && o.team).map((o) => this.numbers.get(o.m.id) ?? 0)))); // stats: a shirt number
    this.changed({ kind: 'join', team, who: p.m.name, text: `⚽ ${p.m.name} plays for ${TEAM_NAME[team]}` });
    return { ok: true, team };
  }

  /** Off the pitch, back to watching. */
  leavePitch(id: string, text?: string): boolean {
    const p = this.members.get(id);
    if (!p?.team) return false;
    const team = p.team;
    delete p.team;
    this.tackles.forget(id); // tackles
    if (this.toucher?.id === id) this.toucher = null;
    if (this.poss.id === id) this.poss.id = null;
    this.changed({ kind: 'leave', team, who: p.m.name, text: text ?? `${p.m.name} left the pitch` });
    return true;
  }

  /**
   * A kick from `id`: null when the ball goes, else why not. Only players on a team, when their team
   * may touch the ball, once every KICK_GAP_MS, from within KICK_REACH of it (plus KICK_SLACK, at any
   * moment in the last KICK_LAG_MS: their page is a little behind; or dribbling it); power and loft
   * clamped to 0..1, lift to 0..MAX_LIFT.
   */
  kick(id: string, power: unknown, dir: unknown, loft: unknown, lift: unknown = 0): string | null {
    const p = this.members.get(id);
    if (!p?.team) return 'not playing';
    const nums = [power, dir, loft, lift];
    if (!nums.every((v) => typeof v === 'number' && Number.isFinite(v))) return 'bad kick';
    const now = this.now();
    if (now - p.lastKick < KICK_GAP_MS) return 'too soon';
    const setPiece = !this.held && !this.match.canTouch(p.team, now) && this.match.setPieceKick(p.team, id, now); // tackles: a free kick or a penalty
    if (this.held || (!this.match.canTouch(p.team, now) && !setPiece)) return 'not now';
    if (this.tackles.sliding(id, now)) return 'sliding';
    const at = this.deps.where(id);
    if (!at || !this.reached(id, at.x, at.z)) return 'too far';
    p.lastKick = now;
    p.coolUntil = now + KICK_COOL_MS;
    this.poss.id = null;
    kick(this.ball, clamp01(power as number), dir as number, clamp01(loft as number), lift as number);
    const restart = setPiece ? this.match.taken(now) : []; // tackles: the set piece is taken, play on
    this.touch(p);
    this.hit = { kind: 'kick', speed: Math.hypot(this.ball.vx, this.ball.vz, this.ball.vy), by: id };
    this.snap();
    for (const ev of restart) this.apply(ev);
    return null;
  }

  /** Whether the ball's been in `id`'s reach (at x, z) lately: see kick. */
  private reached(id: string, x: number, z: number): boolean {
    if (this.poss.id === id || canKick(this.ball, x, z, KICK_SLACK)) return true;
    const lag = Math.ceil(KICK_LAG_MS / 1000 / SIM_DT);
    return this.history.some((h) => this.k - h.k <= lag && canKick(h, x, z, KICK_SLACK));
  }

  /** A soccer message from someone in the hall. */
  message(id: string, msg: SoccerClientMsg) {
    const p = this.members.get(id);
    if (!p) return;
    switch (msg.t) {
      case 'soccer.join': {
        const r = this.join(id);
        if (!r.ok) p.m.send({ t: 'toast', text: r.reason, level: 'warn' });
        break;
      }
      case 'soccer.leave':
        this.leavePitch(id);
        break;
      case 'soccer.kick':
        this.kick(id, msg.power, msg.dir, msg.loft, msg.lift ?? 0);
        break;
      case 'soccer.slide': // tackles
        this.tackles.start(id, p.team, this.deps.where(id), msg.dir, { x: msg.x, z: msg.z }, this.now());
        break;
    }
  }

  // ---- Every tick ---------------------------------------------------------------------------------

  /** Moves everything on by `dt` seconds (default: the time since the last tick). */
  tick(dt?: number) {
    const now = this.now();
    const step = dt ?? Math.min(0.1, Math.max(0, (now - (this.lastTickAt || now)) / 1000));
    this.lastTickAt = now;
    this.ticks += 1;

    // The match moves on (a kickoff's freeze ends, a team empties…).
    for (const ev of this.match.update(now, this.counts())) this.apply(ev);

    if (this.resetAt && now >= this.resetAt) {
      this.resetAt = 0;
      this.centre();
    }

    // The players who may touch the ball, where they are (running on a little between their moves).
    const footers: Footer[] = [];
    for (const p of this.members.values()) {
      const at = this.deps.where(p.m.id);
      if (!at) {
        p.track = null;
        continue;
      }
      const tr = this.follow(p, at.x, at.z, now);
      if (!p.team || this.held || !this.match.canTouch(p.team, now)) continue;
      const ahead = Math.min(0.15, (now - tr.t) / 1000);
      const facing = typeof at.rotY === 'number' && Number.isFinite(at.rotY) ? at.rotY : Math.atan2(tr.vx, tr.vz);
      footers.push({ id: p.m.id, team: p.team, x: tr.x + tr.vx * ahead, z: tr.z + tr.vz * ahead, vx: tr.vx, vz: tr.vz, facing, free: now >= p.coolUntil });
    }
    if (this.held) this.poss.id = null;
    // Tackles: what the slides hit first (a poke, a foul); sliders and anyone a foul stopped play for can't touch the ball.
    this.tackles.tick(now);
    for (let i = footers.length - 1; i >= 0; i--) {
      const f = footers[i];
      const m = this.members.get(f.id);
      if (!m?.team || this.held || !this.match.canTouch(m.team, now) || this.tackles.sliding(f.id, now) || now < (m.beatenUntil ?? 0)) footers.splice(i, 1);
      else f.free = now >= m.coolUntil;
    }

    // The physics, in SIM_DT steps (its clock runs on while the ball's held for a kickoff).
    const had = this.poss.id;
    const hits: BallHit[] = [];
    this.acc = Math.min(this.acc + step, 0.25);
    while (this.acc >= SIM_DT - 1e-9) {
      this.acc -= SIM_DT;
      this.k += 1;
      if (this.held) continue;
      const events: TouchEvent[] = [];
      touchBall(this.ball, footers, this.poss, SIM_DT, events);
      for (const ev of events) this.touched(ev, now);
      const goal = stepBall(this.ball, SIM_DT, hits);
      this.history.push({ k: this.k, x: this.ball.x, z: this.ball.z, y: this.ball.y });
      if (this.history.length > HISTORY) this.history.shift();
      // Everyone runs on the way they go, between their moves (not further than a sprint).
      for (const f of footers) {
        f.x += f.vx * SIM_DT;
        f.z += f.vz * SIM_DT;
      }
      if (goal) {
        this.goal(scorerOf(goal), now);
        break;
      }
    }
    for (const h of hits) {
      if (h.kind === 'floor' || h.speed < 1) continue;
      if (!this.hit || h.speed > this.hit.speed) this.hit = { kind: h.kind, speed: h.speed };
    }

    // Out to everyone: the ball while it moves (at once after a hit), the match now and then.
    const moving = !still(this.ball);
    if (this.hit || this.poss.id !== had || (moving && this.ticks % SNAP_EVERY === 0) || now - this.snapAt >= IDLE_SNAP_MS) this.snap();
    if (now - this.stateAt >= STATE_MS) this.changed();
  }

  /** The view everyone in the hall gets. */
  view(): SoccerView {
    const players = [...this.members.values()].filter((p) => p.team).map((p) => {
      const card = this.match.stats.cardOf(ownerOf(p)); // tackles
      return { id: p.m.id, name: p.m.name, team: p.team!, number: this.numbers.get(p.m.id), ...(card ? { card } : {}) };
    });
    return { ...this.match.view(this.now()), players, stats: this.match.stats.view(), leaders: this.records.top(5) }; // stats
  }

  /** Stats: the final whistle: everyone on the pitch is in the match's numbers, and all of them go on the leaderboard. */
  private fullTime() {
    for (const p of this.members.values()) if (p.team) this.match.stats.seen(ownerOf(p), p.m.name, p.team, this.numbers.get(p.m.id));
    this.records.record(this.match.stats.finish(this.match.winner ?? 'draw'));
  }

  stop() {
    this.halt();
  }

  // ---- Inside ------------------------------------------------------------------------------------

  /** Tackles: what tackle.ts needs of the game. */
  private tackleHost() {
    const self = this;
    return {
      match: this.match,
      ball: this.ball,
      poss: this.poss,
      held: () => this.held,
      players: (): TacklePlayer[] => {
        const now = this.now();
        const out: TacklePlayer[] = [];
        for (const p of this.members.values()) {
          const tr = p.track;
          if (!p.team || !tr) continue;
          const ahead = Math.min(0.15, (now - tr.t) / 1000);
          out.push({ id: p.m.id, name: p.m.name, team: p.team, owner: ownerOf(p), number: this.numbers.get(p.m.id), x: tr.x + tr.vx * ahead, z: tr.z + tr.vz * ahead, vx: tr.vx, vz: tr.vz });
        }
        return out;
      },
      touch: (id: string) => {
        const m = this.members.get(id);
        if (m) this.touch(m);
      },
      cool: (id: string, ms: number) => {
        const m = this.members.get(id);
        if (m) m.coolUntil = m.beatenUntil = Math.max(m.coolUntil, this.now() + ms);
      },
      placeBall: (x: number, z: number) => {
        Object.assign(this.ball, { x, z, y: 0, vx: 0, vz: 0, vy: 0 });
        this.poss.id = null;
        this.history = [];
        this.resetAt = 0;
        this.snap();
      },
      hit: (speed: number) => {
        self.hit = { kind: 'kick', speed };
      },
      event: (ev: SoccerEvent) => this.changed(ev),
      sendOff: (id: string, text: string) => this.leavePitch(id, text),
      send: (m: ServerMsg) => this.send(m),
      tell: (id: string, m: ServerMsg) => this.members.get(id)?.m.send(m),
    };
  }

  private follow(p: Member, x: number, z: number, now: number) {
    const tr = p.track;
    if (!tr) return (p.track = { x, z, t: now, vx: 0, vz: 0 });
    const d = Math.hypot(x - tr.x, z - tr.z);
    if (d > 1e-4) {
      const secs = (now - tr.t) / 1000;
      let vx = 0;
      let vz = 0;
      if (d < JUMP && secs > 0) {
        vx = (x - tr.x) / secs;
        vz = (z - tr.z) / secs;
        const s = Math.hypot(vx, vz);
        if (s > MAX_RUN) {
          vx *= MAX_RUN / s;
          vz *= MAX_RUN / s;
        }
      }
      return (p.track = { x, z, t: now, vx, vz });
    }
    // Standing still for a while now (their page sends nothing while they stand).
    if (now - tr.t > 250) {
      tr.vx = 0;
      tr.vz = 0;
    }
    return tr;
  }

  /** What a touch did: whoever touched it last (for a goal's scorer), and a breather after a 50/50 or losing it. */
  private touched(ev: TouchEvent, now: number) {
    const ids = ev.kind === 'loose' ? ev.ids : ev.kind === 'take' && ev.from ? [ev.from] : [];
    for (const id of ids) {
      const m = this.members.get(id);
      if (m) m.coolUntil = now + LOOSE_COOL_MS;
    }
    const p = this.members.get(ev.kind === 'loose' ? ev.ids[1] : ev.id);
    if (p) this.touch(p);
  }

  private touch(p: Member) {
    if (!p.team) return;
    this.toucher = { id: p.m.id, name: p.m.name, team: p.team };
    // Stats: a touch in play (a kick when it's their kick's moment).
    if (this.match.phase === 'play') this.match.stats.touch(ownerOf(p), p.m.name, p.team, this.now(), p.lastKick === this.now(), this.ball, this.numbers.get(p.m.id));
    this.match.touched(p.team);
  }

  private goal(team: Team, now: number) {
    if (this.match.counting) {
      // The scorer is whoever touched it last, if they play for the team it counts for (else an own goal).
      const t = this.toucher;
      const who = t ? (t.team === team ? t.name : `own goal, ${t.name}`) : undefined;
      for (const ev of this.match.scored(now, team, who)) this.apply(ev);
      return;
    }
    if (this.match.phase === 'waiting' || this.match.phase === 'paused') {
      this.resetAt = now + PRACTICE_RESET_MS;
      this.changed({ kind: 'practice', team, text: '⚽ Goal! (practice: the match starts once both teams have a player)' });
    }
  }

  /** What a match event does here: the ball back on the spot for a kickoff, held until the whistle. */
  private apply(ev: SoccerEvent) {
    if (ev.kind === 'kickoff') {
      this.held = true;
      this.centre();
    }
    if (ev.kind === 'play' || ev.kind === 'pause' || ev.kind === 'reset') this.held = false;
    if (ev.kind === 'reset' || ev.kind === 'start') this.toucher = null;
    if (ev.kind === 'end') this.fullTime(); // stats
    this.changed(ev);
  }

  private centre() {
    Object.assign(this.ball, centreBall());
    this.poss.id = null;
    this.history = [];
    this.resetAt = 0;
    this.snap();
  }

  private snap() {
    const h = this.hit;
    this.hit = null;
    this.snapAt = this.now();
    this.send({ t: 'soccer.ball', b: ballWire(this.ball), k: this.k, ...(this.poss.id ? { c: this.poss.id } : {}), ...(h ? { hit: h.kind, hs: Math.round(h.speed * 10) / 10, ...(h.by ? { by: h.by } : {}) } : {}) });
  }

  private changed(event?: SoccerEvent) {
    this.stateAt = this.now();
    this.send({ t: 'soccer', state: this.view(), ...(event ? { event } : {}) });
  }

  private send(m: ServerMsg) {
    for (const p of this.members.values()) p.m.send(m);
  }

  private run() {
    if (this.timer || this.deps.timer === false) return;
    this.lastTickAt = this.now();
    this.timer = setInterval(() => this.tick(), 1000 / TICK_HZ);
    this.timer.unref?.();
  }

  private halt() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (!this.members.size) this.tackles.clear(); // tackles
    // Nobody's left inside: the match is over, the ball back on the spot for whoever comes next.
    if (!this.members.size) {
      this.match.update(this.now(), { red: 0, blue: 0 });
      Object.assign(this.ball, centreBall());
      this.held = false;
      this.resetAt = 0;
      this.hit = null;
      this.toucher = null;
      this.poss.id = null;
      this.history = [];
      this.acc = 0;
    }
  }
}

/** Stats: who someone is for the leaderboard. */
const ownerOf = (p: Member) => p.m.owner ?? `name:${p.m.name}`;
