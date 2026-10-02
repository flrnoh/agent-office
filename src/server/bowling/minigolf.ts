import type { ServerMsg } from '../../shared/protocol.js';
import { HOLES, HOLE_COUNT, toRoom } from '../../shared/minigolf-holes.js';
import { simulate, wrapAngle } from '../../shared/minigolf-physics.js';
import {
  GROUP_REACH,
  MAX_GROUP,
  MAX_PLAYERS,
  MAX_STROKES,
  MG_COLORS,
  PLUS,
  PUTT_REACH,
  TURN_MS,
  cardTotal,
  clockSec,
  emptyCard,
  teeSpot,
  type Card,
  type MgEvent,
  type MgGroup,
  type MgPlayer,
  type MgShot,
  type MgView,
  type MinigolfClientMsg,
} from '../../shared/minigolf.js';
import { MinigolfRecords } from './minigolf-records.js';

/*
 * The black-light mini golf in the bowling centre (flrnoh fork, see FORK.md "Black-light mini golf"):
 * who has a putter and a ball, which hole each is on, their cards, groups taking turns, and the
 * records. A putt is worked out here, with the same physics the pages roll it with (shared/
 * minigolf-physics.ts), from where the ball lay, which way, how hard and when on the office's clock
 * (what the windmill and the bridge go by), and sent to everyone in the centre with what it came to;
 * once it's rolled out (its time), the card has it.
 *
 * Playing alone you putt when you like; a group (gathered at the first tee) takes turns: whoever has
 * putted least on the hole goes next, in the group's order, and a turn not taken in TURN_MS passes on.
 * A group moves to the next hole once everyone in it is down (or has a "+").
 */

export interface MinigolfMember {
  id: string;
  owner: string;
  name: string;
}

export interface MinigolfDeps {
  /** The office's clock (ms). */
  now(): number;
  /** Where someone in the bowling centre stands (interior coordinates), or null when they're not in there. */
  where(id: string): { x: number; z: number } | null;
  /** To one person, and to everyone in the centre. */
  send(id: string, m: ServerMsg): void;
  toAll(m: ServerMsg): void;
  /** Where minigolf.json is kept; none: in memory only. */
  dataDir?: string;
}

interface Player extends MgPlayer {
  owner: string;
  /** The putt rolling now, and when it's rolled out (office ms). */
  roll: { shot: MgShot; until: number } | null;
  lastPutt: number;
}

/** A putt rolls out on the pages this long after the office has it worked out, give or take: the card waits for it. */
const SETTLE_MS = 350;
/** One putt at a time, this far apart at least. */
const BETWEEN_MS = 600;
/** How far off the office's clock a page's putt may say it was (ms). */
const CLOCK_SLACK = 1500;

export class Minigolf {
  private players = new Map<string, Player>();
  private groups = new Map<string, MgGroup>();
  private readonly records: MinigolfRecords;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextGroup = 1;

  constructor(private readonly deps: MinigolfDeps) {
    this.records = new MinigolfRecords(deps.dataDir);
  }

  /** Runs the clock: rolls ending, turns running out. */
  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), 100);
    this.timer.unref?.();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Whether `id` has a putter. */
  has(id: string): boolean {
    return this.players.has(id);
  }

  view(): MgView {
    const now = this.deps.now();
    return {
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        hole: p.hole,
        strokes: p.strokes,
        card: [...p.card],
        ball: { ...p.ball },
        rolling: !!p.roll,
        ...(p.group ? { group: p.group } : {}),
      })),
      groups: [...this.groups.values()].map((g) => ({ ...g, players: [...g.players] })),
      best: this.records.best(),
      week: this.records.week(now),
      aces: this.records.aces(),
      now,
    };
  }

  private changed(event?: MgEvent) {
    this.deps.toAll({ t: 'mg', view: this.view(), ...(event ? { event } : {}) });
  }

  private mine(p: { id: string; owner: string }) {
    this.deps.send(p.id, { t: 'mg', view: this.view(), mine: this.records.mine(p.owner, this.deps.now()) });
  }

  /** A message from `m` (in the bowling centre). Returns a warning for them, if any. */
  message(m: MinigolfMember, msg: MinigolfClientMsg): string | void {
    switch (msg.t) {
      case 'mg.look':
        return this.mine(m);
      case 'mg.take':
        return this.take(m);
      case 'mg.return':
        if (this.leave(m.id)) this.mine(m);
        return;
      case 'mg.group':
        return this.gather(m.id);
      case 'mg.putt':
        return this.putt(m.id, msg);
      case 'mg.pickup':
        return this.pickup(m.id);
    }
  }

  /** A putter and a ball from the stand: a fresh card, on the first tee. */
  take(m: MinigolfMember): string | void {
    if (this.players.has(m.id)) return;
    if (this.players.size >= MAX_PLAYERS) return '⛳ Alle Schläger sind gerade unterwegs – gleich wieder';
    const used = new Set([...this.players.values()].map((p) => p.color));
    const color = MG_COLORS.findIndex((_, i) => !used.has(i));
    const c = color < 0 ? this.players.size % MG_COLORS.length : color;
    this.players.set(m.id, { id: m.id, owner: m.owner, name: m.name.slice(0, 40), color: c, hole: 1, strokes: 0, card: emptyCard(), ball: teeSpot(1, c), rolling: false, roll: null, lastPutt: 0 });
    this.mine(m);
    this.changed();
  }

  /** Off with the putter (given back, gone out, gone): out of their group, the ball gone. Whether they had one. */
  leave(id: string): boolean {
    const p = this.players.get(id);
    if (!p) return false;
    this.players.delete(id);
    if (p.group) this.dropFromGroup(p.group, id);
    this.changed();
    return true;
  }

  /** Whether `p` has a round going (a stroke or a hole played, and not finished). */
  private midRound(p: Player): boolean {
    return p.hole > 0 && (p.strokes > 0 || p.card.some((n) => n !== null));
  }

  /** At the first tee: a group of everyone there with a putter and no round going (a finished one starts over). */
  gather(id: string): string | void {
    const p = this.players.get(id);
    if (!p) return;
    if (this.midRound(p)) return '⛳ Erst die Runde zu Ende spielen – oder den Schläger zurückgeben';
    const near = (q: Player) => {
      const at = this.deps.where(q.id);
      if (!at) return false;
      const tee = toRoom(HOLES[0], HOLES[0].tee.x, HOLES[0].tee.z);
      return Math.hypot(at.x - tee.x, at.z - tee.z) <= GROUP_REACH;
    };
    if (!near(p)) return '⛳ Am ersten Abschlag stehen, um eine Runde zu starten';
    const who = [p, ...[...this.players.values()].filter((q) => q !== p && !this.midRound(q) && near(q))].slice(0, MAX_GROUP);
    for (const q of who) {
      if (q.group) this.dropFromGroup(q.group, q.id);
      this.fresh(q);
    }
    if (who.length > 1) {
      const g: MgGroup = { id: `g${this.nextGroup++}`, players: who.map((q) => q.id), turn: null, turnEnds: 0 };
      this.groups.set(g.id, g);
      for (const q of who) q.group = g.id;
      this.nextTurn(g);
    }
    this.changed({ k: 'group', names: who.map((q) => q.name) });
  }

  private fresh(p: Player) {
    p.hole = 1;
    p.strokes = 0;
    p.card = emptyCard();
    p.ball = teeSpot(1, p.color);
    delete p.group;
  }

  putt(id: string, msg: { hole: number; dir: number; power: number; at: number }): string | void {
    const p = this.players.get(id);
    const now = this.deps.now();
    if (!p || p.roll || p.hole < 1) return;
    if (p.hole === 0 || msg.hole !== p.hole || !Number.isFinite(msg.dir) || !Number.isFinite(msg.power)) return;
    if (now - p.lastPutt < BETWEEN_MS) return;
    const g = p.group ? this.groups.get(p.group) : undefined;
    if (g && g.turn !== id) {
      const whose = g.turn && this.players.get(g.turn);
      return whose ? `⛳ ${whose.name} ist dran` : undefined;
    }
    const hole = HOLES[p.hole - 1];
    const at = this.deps.where(id);
    const ball = toRoom(hole, p.ball.x, p.ball.z);
    if (!at || Math.hypot(at.x - ball.x, at.z - ball.z) > PUTT_REACH) return '⛳ Erst zum Ball gehen';
    const when = Number.isFinite(msg.at) && Math.abs(msg.at - now) <= CLOCK_SLACK ? Math.round(msg.at) : now;
    const dir = wrapAngle(msg.dir);
    const power = Math.max(0, Math.min(1, msg.power));
    const result = simulate(hole.course, p.ball, dir, power, clockSec(when));
    const shot: MgShot = { id, hole: p.hole, from: { ...p.ball }, dir, power, at: when, result };
    p.roll = { shot, until: when + result.time * 1000 + SETTLE_MS };
    p.lastPutt = now;
    if (g) g.turnEnds = Number.MAX_SAFE_INTEGER; // nobody else's while it rolls
    this.deps.toAll({ t: 'mg.putt', shot });
    this.changed();
  }

  /** Picking the ball up: a "+" for the hole. */
  pickup(id: string): string | void {
    const p = this.players.get(id);
    if (!p || p.roll || p.hole < 1) return;
    const g = p.group ? this.groups.get(p.group) : undefined;
    if (g && g.turn !== id) return '⛳ Aufheben, wenn du dran bist';
    p.card[p.hole - 1] = PLUS;
    this.holeDone(p, { k: 'plus', id: p.id, name: p.name, hole: p.hole });
  }

  /** Every 100 ms: putts that have rolled out go on the card; turns not taken pass on. */
  tick() {
    const now = this.deps.now();
    for (const p of [...this.players.values()]) if (p.roll && now >= p.roll.until) this.rolledOut(p);
    for (const g of this.groups.values()) {
      if (!g.turn || now < g.turnEnds) continue;
      const p = this.players.get(g.turn);
      if (p?.roll) continue;
      this.nextTurn(g, g.turn);
      this.changed(g.turn ? { k: 'turn', id: g.turn, name: this.players.get(g.turn)?.name ?? '', hole: this.players.get(g.turn)?.hole ?? 0 } : undefined);
    }
  }

  private rolledOut(p: Player) {
    const { shot } = p.roll!;
    p.roll = null;
    p.strokes += 1;
    const r = shot.result;
    if (r.holed) {
      p.card[p.hole - 1] = p.strokes;
      if (p.strokes === 1) this.records.ace(p.owner, p.name);
      return this.holeDone(p, p.strokes === 1 ? { k: 'ace', id: p.id, name: p.name, hole: p.hole } : { k: 'holed', id: p.id, name: p.name, hole: p.hole, strokes: p.strokes });
    }
    if (p.strokes >= MAX_STROKES) {
      p.card[p.hole - 1] = PLUS;
      return this.holeDone(p, { k: 'plus', id: p.id, name: p.name, hole: p.hole });
    }
    p.ball = { x: r.x, z: r.z };
    const g = p.group ? this.groups.get(p.group) : undefined;
    if (g) this.nextTurn(g);
    this.changed();
  }

  /** `p`'s down on this hole (or gave it up): alone, on to the next; in a group, once they all are. */
  private holeDone(p: Player, event: MgEvent) {
    const g = p.group ? this.groups.get(p.group) : undefined;
    if (!g) {
      const done = this.nextHole(p);
      this.changed(event);
      if (done) this.changed(done);
      return;
    }
    const members = g.players.map((id) => this.players.get(id)!).filter(Boolean);
    const hole = p.hole;
    if (members.every((q) => q.card[hole - 1] !== null)) {
      let finished: MgEvent | undefined;
      const rounds: MgEvent[] = [];
      for (const q of members) {
        finished = this.nextHole(q);
        if (finished) rounds.push(finished);
      }
      if (members.every((q) => q.hole === 0)) {
        this.groups.delete(g.id);
        for (const q of members) delete q.group;
      } else this.nextTurn(g);
      this.changed(event);
      for (const r of rounds) this.changed(r);
      return;
    }
    this.nextTurn(g);
    this.changed(event);
  }

  /** On to the next hole, or the round's over: on the records, and back to the start. Returns the round's event. */
  private nextHole(p: Player): MgEvent | undefined {
    if (p.hole < HOLE_COUNT) {
      p.hole += 1;
      p.strokes = 0;
      p.ball = teeSpot(p.hole, p.color);
      return undefined;
    }
    const total = cardTotal(p.card);
    const r = this.records.round(p.owner, p.name, total, this.deps.now());
    p.hole = 0;
    p.strokes = 0;
    p.ball = teeSpot(1, p.color);
    this.mine(p);
    return { k: 'round', id: p.id, name: p.name, total, best: r.best, week: r.week };
  }

  /** Whose turn it is in `g` now: whoever's still on the hole and has putted least, in the group's order (after `skip`, when passing a turn on). */
  private nextTurn(g: MgGroup, skip?: string) {
    const members = g.players.map((id) => this.players.get(id)).filter((p): p is Player => !!p);
    const playing = members.filter((p) => p.hole > 0 && p.card[p.hole - 1] === null);
    if (!playing.length) {
      g.turn = null;
      g.turnEnds = 0;
      return;
    }
    let pick: Player;
    if (skip && playing.length > 1) {
      // The next one round from whoever let it pass.
      const i = g.players.indexOf(skip);
      const order = [...g.players.slice(i + 1), ...g.players.slice(0, i + 1)];
      pick = order.map((id) => playing.find((p) => p.id === id)).find((p): p is Player => !!p && p.id !== skip)!;
    } else pick = playing.reduce((a, b) => (b.strokes < a.strokes ? b : a));
    g.turn = pick.id;
    g.turnEnds = this.deps.now() + TURN_MS;
  }

  private dropFromGroup(gid: string, id: string) {
    const g = this.groups.get(gid);
    if (!g) return;
    g.players = g.players.filter((x) => x !== id);
    const p = this.players.get(id);
    if (p) delete p.group;
    if (g.players.length <= 1) {
      // One left: they play on alone.
      for (const x of g.players) delete this.players.get(x)?.group;
      this.groups.delete(gid);
      const last = g.players[0] && this.players.get(g.players[0]);
      if (last && last.hole > 0 && last.card[last.hole - 1] !== null) {
        const done = this.nextHole(last);
        if (done) this.changed(done);
      }
      return;
    }
    const hole = this.players.get(g.players[0])?.hole ?? 0;
    const members = g.players.map((x) => this.players.get(x)!).filter(Boolean);
    if (hole > 0 && members.every((q) => q.card[hole - 1] !== null)) {
      for (const q of members) {
        const done = this.nextHole(q);
        if (done) this.changed(done);
      }
    }
    if (g.turn === id || !g.turn) this.nextTurn(g);
  }

  /** The card of `id`, for the tests. */
  cardOf(id: string): Card | undefined {
    return this.players.get(id)?.card;
  }
}
