import { randomInt } from 'node:crypto';
import { GYM_STATIONS, JUICE_BAR, type GymClientMsg, type GymKind, type GymServerMsg, type GymStationDef } from '../../shared/gym.js';
import { WALK_IN_BY_STATION, WALK_IN_ENTER, WALK_IN_LEAVE, stillIn as stillInRoom, walkInAt } from '../../shared/gym-rooms.js';
import { GYM_RADIO } from '../../shared/gym-radio.js';
import { Allowance } from '../casino/index.js';
import { CardioMachine } from './cardio.js';
import { Fitness } from './fitness.js';
import type { GymContext, GymGame, GymTallies, Seated } from './game.js';
import { JuiceBar } from './juicebar.js';
import { GymRadio } from './radio.js';
import { StrengthStation } from './strength.js';
import { WellnessSpot } from './wellness.js';

export type { GymContext, GymGame, Seated } from './game.js';

/*
 * The gym across the street (flrnoh fork, see FORK.md): one for the whole building, like the casino
 * and the roof's DJ booth. It knows who's inside (server.ts tells it: enter/leave), puts them on its
 * stations, hands their actions to the station's game, keeps everyone's fitness (./fitness.ts), and
 * sends everyone inside each station's view when it changes. Mirrors server/casino/index.ts.
 */

/** Someone in the gym: one connection (a person with two tabs open is two, with one owner). */
export interface GymPlayer {
  id: string;
  /** Who they are for their fitness: `account:<id>`, or `name:<name>` on the shared password. */
  owner: string;
  name: string;
  send(msg: GymServerMsg): void;
  /** Where the office last saw them in the gym, and the seat they're on (fork: the walk-in rooms go by this). */
  where?(): { x: number; y?: number; z: number; seat?: string } | undefined;
}

/** How often timed games are ticked (ms). */
export const TICK_MS = 250;
/** How many rows the juice bar's leaderboard shows. */
const BOARD_ROWS = 8;

/** What stands at each kind of station in GYM_STATIONS (and the juice bar). */
const GAMES: Record<GymKind, (s: GymStationDef) => GymGame> = {
  cardio: (s) => new CardioMachine(s.id, s.machine),
  strength: (s) => new StrengthStation(s.id, s.machine),
  wellness: (s) => new WellnessSpot(s.id, s.machine, s.seats),
  juicebar: (s) => new JuiceBar(s.id, s.seats),
  radio: (s) => new GymRadio(s.id),
};

export interface GymOptions {
  now?: () => number;
  random?: (n: number) => number;
  /** Leave out the stations of GYM_STATIONS (the tests register their own). */
  empty?: boolean;
  /** Don't start the tick timer (tests call tick themselves). */
  manualTick?: boolean;
}

export class Gym {
  readonly fitness: Fitness;
  private stations = new Map<string, GymGame>();
  private players = new Map<string, GymPlayer>();
  /** Which station each owner is on. */
  private seatOf = new Map<string, string>();
  /** Which walk-in room (its station) each connection is standing in, by where it was last seen. */
  private roomOf = new Map<string, string>();
  private names = new Map<string, string>();
  private now: () => number;
  private random: (n: number) => number;
  private acts: Allowance;
  private moves: Allowance;
  private timer: NodeJS.Timeout | undefined;
  private dirtyStations = new Set<string>();
  private dirtyProfiles = new Set<string>();

  constructor(dataDir: string, opts: GymOptions = {}) {
    this.now = opts.now ?? Date.now;
    this.random = opts.random ?? ((n) => randomInt(n));
    this.fitness = new Fitness(dataDir, this.now);
    this.acts = new Allowance(8, 4, this.now);
    this.moves = new Allowance(6, 2, this.now);
    if (!opts.empty) {
      for (const s of GYM_STATIONS) this.register(GAMES[s.kind](s));
      this.register(GAMES.juicebar({ id: JUICE_BAR.id, kind: 'juicebar', machine: 'juicebar', name: 'Juice bar', x: JUICE_BAR.x, z: JUICE_BAR.z, rotY: Math.PI / 2, seats: JUICE_BAR.seats }));
      this.register(new GymRadio(GYM_RADIO.id, dataDir)); // fork: Gym FM, its station and volume kept in gym-radio.json
    }
    if (!opts.manualTick) {
      this.timer = setInterval(() => this.tick(), TICK_MS);
      this.timer.unref?.();
    }
  }

  /** Puts a game on the floor (replacing whatever stood at its id). */
  register(game: GymGame) {
    this.stations.set(game.id, game);
    // The juice bar's leaderboard is drawn from the fitness store when its view is built.
    if (game instanceof JuiceBar) game.boardFor = (owner) => this.fitness.leaderboard(BOARD_ROWS, owner);
  }

  station(id: string): GymGame | undefined {
    return this.stations.get(id);
  }

  stationIds(): string[] {
    return [...this.stations.keys()];
  }

  inside(): GymPlayer[] {
    return [...this.players.values()];
  }

  /** `p` walked in: their fitness and every station as they see it. */
  enter(p: GymPlayer) {
    this.players.set(p.id, p);
    this.names.set(p.owner, p.name);
    this.fitness.ensure(p.owner, p.name);
    this.sendProfile(p);
    for (const [id, g] of this.stations) p.send({ t: 'gym.station', station: id, state: g.view(this.seatOf.get(p.owner) === id ? p.owner : null) });
  }

  /** `id` left the gym (or the office): off their station, unless another tab of theirs is still inside. */
  leave(id: string) {
    const p = this.players.get(id);
    if (!p) return;
    this.players.delete(id);
    this.roomOf.delete(id);
    if (![...this.players.values()].some((o) => o.owner === p.owner)) this.standUp(p.owner);
    this.flush();
  }

  /**
   * Connection `id` moved or sat down (server.ts, on every move and sit in the gym): walking into the
   * sauna or the steam room puts them on it, walking out takes them off it (unless another tab of
   * theirs is still in there). Goes by where the office saw them, never by anything the page says it
   * is doing, with a little give at the door so standing in it doesn't flicker in and out.
   */
  moved(id: string) {
    const p = this.players.get(id);
    const at = p?.where?.();
    if (!p || !at) return;
    const was = this.roomOf.get(id);
    const wasRoom = was ? WALK_IN_BY_STATION.get(was) : undefined;
    // Fork: and how far down (the basement's rooms and pools are under the spa's, shared/gym-basement.ts).
    const room = wasRoom && stillInRoom(wasRoom, at.x, at.z, WALK_IN_LEAVE, at.y) ? wasRoom : walkInAt(at.x, at.z, WALK_IN_ENTER, at.y);
    if (room?.station === was) return;
    if (room) this.roomOf.set(id, room.station);
    else this.roomOf.delete(id);
    const stillIn = (station: string) => [...this.roomOf].some(([cid, s]) => s === station && this.players.get(cid)?.owner === p.owner);
    if (was && this.seatOf.get(p.owner) === was && !stillIn(was)) this.standUp(p.owner);
    if (room && this.seatOf.get(p.owner) !== room.station) {
      const g = this.stations.get(room.station);
      if (g) {
        this.standUp(p.owner);
        if (!g.sit(this.seated(p), this.ctx(g))) {
          this.seatOf.set(p.owner, g.id);
          this.dirtyStations.add(g.id);
        }
      }
    }
    this.flush();
  }

  /** The walk-in room connection `id` is standing in, if any (for tests and hints). */
  roomFor(id: string): string | undefined {
    return this.roomOf.get(id);
  }

  isInside(id: string): boolean {
    return this.players.has(id);
  }

  /** A gym.* message from connection `id`. */
  message(id: string, msg: GymClientMsg) {
    const p = this.players.get(id);
    if (!p) return;
    const warn = (text: string, station = '') => p.send({ t: 'gym.result', station, text });
    switch (msg.t) {
      case 'gym.sit': {
        if (!this.moves.take([p.id, p.owner])) return warn('Easy there: one station at a time');
        const station = typeof msg.station === 'string' ? this.stations.get(msg.station) : undefined;
        if (!station) return warn('No such station');
        // Fork: the sauna and the steam room are walked into, not sat at (see moved).
        if (WALK_IN_BY_STATION.has(station.id) && this.seatOf.get(p.owner) !== station.id) return warn('Walk in through the glass door', station.id);
        if (this.seatOf.get(p.owner) === station.id) {
          p.send({ t: 'gym.station', station: station.id, state: station.view(p.owner) });
          break;
        }
        const taken = [...this.seatOf.values()].filter((s) => s === station.id).length;
        if (taken >= station.seats) return warn(station.seats === 1 ? 'Someone is using that' : "It's full", station.id);
        this.standUp(p.owner);
        const err = station.sit(this.seated(p), this.ctx(station));
        if (err) {
          warn(err, station.id);
          break;
        }
        this.seatOf.set(p.owner, station.id);
        this.dirtyStations.add(station.id);
        break;
      }
      case 'gym.stand': {
        // Standing inside a walk-in room keeps you in it: you're out when you walk out.
        const at = this.seatOf.get(p.owner);
        if (at && WALK_IN_BY_STATION.has(at) && [...this.roomOf].some(([cid, s]) => s === at && this.players.get(cid)?.owner === p.owner)) break;
        this.standUp(p.owner);
        break;
      }
      case 'gym.act': {
        const station = typeof msg.station === 'string' ? this.stations.get(msg.station) : undefined;
        if (!station) return warn('No such station');
        if (typeof msg.action !== 'string' || msg.action.length > 32) return warn('No such move', station.id);
        if (this.seatOf.get(p.owner) !== station.id && !station.walkUp) return warn(WALK_IN_BY_STATION.has(station.id) ? 'Step inside first' : 'Step on first', station.id);
        if (!this.acts.take([p.id, p.owner])) return warn('Easy there: catch your breath', station.id);
        const err = station.act(this.seated(p), msg.action, msg.data, this.ctx(station));
        if (err) warn(err, station.id);
        break;
      }
    }
    this.flush();
  }

  /** Runs every station's timers, then sends what changed. */
  tick() {
    const now = this.now();
    for (const g of this.stations.values()) {
      try {
        g.tick(now, this.ctx(g));
      } catch (err) {
        console.error(`gym: station ${g.id} failed to tick`, err);
      }
    }
    this.fitness.flush(false);
    this.flush();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.fitness.flush(true);
  }

  private seated(p: GymPlayer): Seated {
    return { owner: p.owner, name: p.name };
  }

  private standUp(owner: string) {
    const at = this.seatOf.get(owner);
    if (!at) return;
    this.seatOf.delete(owner);
    const g = this.stations.get(at);
    if (g) g.stand(owner, this.ctx(g));
    this.dirtyStations.add(at);
  }

  private ctx(g: GymGame): GymContext {
    return {
      award: (owner, xp, tallies?: GymTallies) => {
        if (xp > 0) this.fitness.addXp(owner, xp);
        if (tallies) this.fitness.addTallies(owner, tallies);
        this.dirtyProfiles.add(owner);
      },
      addStamina: (owner, delta) => {
        if (!delta) return;
        this.fitness.addStamina(owner, delta);
        this.dirtyProfiles.add(owner);
      },
      stamina: (owner) => this.fitness.stamina(owner),
      level: (owner) => this.fitness.level(owner),
      pr: (owner, key) => this.fitness.pr(owner, key),
      setPr: (owner, key, value) => this.fitness.setPr(owner, key, value),
      countWorkout: (owner) => {
        this.fitness.countWorkout(owner);
        this.dirtyProfiles.add(owner);
      },
      leaderboard: (top, you) => this.fitness.leaderboard(top, you),
      random: (n) => this.random(n),
      result: (owner, text, xp, data) => {
        for (const p of this.players.values()) if (p.owner === owner) p.send({ t: 'gym.result', station: g.id, text, ...(xp !== undefined ? { xp } : {}), ...(data !== undefined ? { data } : {}) });
      },
      changed: () => this.dirtyStations.add(g.id),
      now: () => this.now(),
      name: (owner) => this.names.get(owner) ?? owner,
      seatKey: (owner) => {
        for (const p of this.players.values()) {
          const seat = p.owner === owner ? p.where?.()?.seat : undefined;
          if (seat) return seat;
        }
        return undefined;
      },
    };
  }

  private sendProfile(p: GymPlayer) {
    p.send({ t: 'gym.profile', profile: this.fitness.profile(p.owner) });
  }

  /** Sends what changed: each changed station to everyone inside, and each moved profile to its owner. */
  private flush() {
    if (this.dirtyProfiles.size) {
      for (const p of this.players.values()) if (this.dirtyProfiles.has(p.owner)) this.sendProfile(p);
      this.dirtyProfiles.clear();
    }
    if (!this.dirtyStations.size) return;
    const stations = [...this.dirtyStations];
    this.dirtyStations.clear();
    for (const id of stations) {
      const g = this.stations.get(id);
      if (!g) continue;
      // The juice bar's view is per-viewer (their line on the leaderboard); the rest look the same to onlookers.
      const shared = g.kind === 'juicebar' ? null : g.view(null);
      for (const p of this.players.values()) {
        const mine = this.seatOf.get(p.owner) === id;
        p.send({ t: 'gym.station', station: id, state: mine || shared === null ? g.view(mine ? p.owner : null) : shared });
      }
    }
  }
}
