import { randomInt } from 'node:crypto';
import { CASINO_TABLES, MAX_BET, MIN_BET, START_CHIPS, validBet, type CasinoClientMsg, type CasinoServerMsg } from '../../shared/casino.js';
import type { CasinoContext, CasinoGame, Seated } from './game.js';
import { SlotMachine } from './slots.js';
import { ComingSoon } from './soon.js';
import { Wallets } from './wallets.js';

export type { CasinoContext, CasinoGame, Seated } from './game.js';

/*
 * The casino across the street (flrnoh fork, see FORK.md): one for the whole building, like the
 * roof's DJ booth. It knows who's inside (server.ts tells it: enter/leave), seats them at its
 * tables, hands their actions to the table's game, keeps everyone's chips (./wallets.ts), and
 * sends everyone inside each table's view when it changes.
 */

/** Someone in the casino: one connection (a person with two tabs open is two, with one owner). */
export interface CasinoPlayer {
  /** The connection's id. */
  id: string;
  /** Who they are for their chips: `account:<id>`, or `name:<name>` on the shared password. */
  owner: string;
  name: string;
  send(msg: CasinoServerMsg): void;
}

/** How often timed games are ticked (ms). */
export const TICK_MS = 250;

/**
 * Something a player can only do so often: `burst` in a row, then `perSecond` as it comes back.
 * Kept under their connection and their owner both, so a second tab doesn't double it.
 */
export class Allowance {
  private used = new Map<string, { left: number; at: number }>();

  constructor(
    private burst: number,
    private perSecond: number,
    private now: () => number,
  ) {}

  /** Takes one for `keys` if every one of them has one left. */
  take(keys: readonly string[]): boolean {
    const now = this.now();
    const left = keys.map((k) => {
      const u = this.used.get(k);
      return u ? Math.min(this.burst, u.left + ((now - u.at) / 1000) * this.perSecond) : this.burst;
    });
    if (left.some((l) => l < 1)) return false;
    keys.forEach((k, i) => this.used.set(k, { left: left[i] - 1, at: now }));
    if (this.used.size > 2000) this.used.clear();
    return true;
  }
}

export interface CasinoOptions {
  now?: () => number;
  /** A fair random whole number from 0 to n - 1. */
  random?: (n: number) => number;
  /** Leave out the tables of CASINO_TABLES (the tests register their own). */
  empty?: boolean;
  /** Don't start the tick timer (tests call tick themselves). */
  manualTick?: boolean;
}

export class Casino {
  readonly wallets: Wallets;
  private tables = new Map<string, CasinoGame>();
  private players = new Map<string, CasinoPlayer>();
  /** Which table each owner sits at. */
  private seatOf = new Map<string, string>();
  private now: () => number;
  private random: (n: number) => number;
  private acts: Allowance;
  private moves: Allowance;
  private timer: NodeJS.Timeout | undefined;
  /** What to send once the current message or tick is done: tables that changed, wallets that moved. */
  private dirtyTables = new Set<string>();
  private dirtyWallets = new Set<string>();

  constructor(dataDir: string, opts: CasinoOptions = {}) {
    this.now = opts.now ?? Date.now;
    this.random = opts.random ?? ((n) => randomInt(n));
    this.wallets = new Wallets(dataDir, this.now);
    // Enough for quick play (a spin is SPIN_MS anyway), not for a script hammering the tables.
    this.acts = new Allowance(8, 4, this.now);
    this.moves = new Allowance(6, 2, this.now);
    if (!opts.empty) {
      for (const t of CASINO_TABLES) this.register(t.kind === 'slots' ? new SlotMachine(t.id) : new ComingSoon(t.id, t.kind, t.seats));
    }
    if (!opts.manualTick) {
      this.timer = setInterval(() => this.tick(), TICK_MS);
      this.timer.unref?.();
    }
  }

  /** Puts a game on the floor (replacing whatever stood at its id: phase 2's tables replace the placeholders). */
  register(game: CasinoGame) {
    this.tables.set(game.id, game);
  }

  table(id: string): CasinoGame | undefined {
    return this.tables.get(id);
  }

  tableIds(): string[] {
    return [...this.tables.keys()];
  }

  /** Who's inside right now (connections). */
  inside(): CasinoPlayer[] {
    return [...this.players.values()];
  }

  /** `p` walked in: their chips (topped up, if today's is due) and every table as they see it. */
  enter(p: CasinoPlayer) {
    this.players.set(p.id, p);
    const w = this.wallets.open(p.owner);
    if (w.toppedUp) p.send({ t: 'casino.result', table: '', text: `🎁 Your daily top-up: back to ${START_CHIPS} chips`, delta: w.toppedUp });
    this.sendWallet(p);
    for (const [id, g] of this.tables) p.send({ t: 'casino.table', table: id, state: g.view(this.seatOf.get(p.owner) === id ? p.owner : null) });
  }

  /** `id` left the casino (or the office): up from their table, unless another tab of theirs is still inside. */
  leave(id: string) {
    const p = this.players.get(id);
    if (!p) return;
    this.players.delete(id);
    if (![...this.players.values()].some((o) => o.owner === p.owner)) this.standUp(p.owner);
    this.flush();
  }

  isInside(id: string): boolean {
    return this.players.has(id);
  }

  /** A casino.* message from connection `id`. */
  message(id: string, msg: CasinoClientMsg) {
    const p = this.players.get(id);
    if (!p) return;
    const warn = (text: string, table = '') => p.send({ t: 'casino.result', table, text });
    switch (msg.t) {
      case 'casino.sit': {
        if (!this.moves.take([p.id, p.owner])) return warn('Easy there: one table at a time');
        const table = typeof msg.table === 'string' ? this.tables.get(msg.table) : undefined;
        if (!table) return warn('No such table');
        if (this.seatOf.get(p.owner) === table.id) {
          // Already here (another tab, or the window opened again): just their view.
          p.send({ t: 'casino.table', table: table.id, state: table.view(p.owner) });
          break;
        }
        const taken = [...this.seatOf.values()].filter((t) => t === table.id).length;
        if (taken >= table.seats) return warn(table.seats === 1 ? 'Somebody is playing that one' : 'The table is full', table.id);
        this.standUp(p.owner);
        const err = table.sit(this.seated(p), this.ctx(table));
        if (err) {
          warn(err, table.id);
          break;
        }
        this.seatOf.set(p.owner, table.id);
        this.dirtyTables.add(table.id);
        break;
      }
      case 'casino.stand':
        this.standUp(p.owner);
        break;
      case 'casino.act': {
        const table = typeof msg.table === 'string' ? this.tables.get(msg.table) : undefined;
        if (!table) return warn('No such table');
        if (typeof msg.action !== 'string' || msg.action.length > 32) return warn('No such move', table.id);
        if (this.seatOf.get(p.owner) !== table.id) return warn('Take a seat first', table.id);
        if (!this.acts.take([p.id, p.owner])) return warn('Easy there: the dealer can only go so fast', table.id);
        const err = table.act(this.seated(p), msg.action, msg.data, this.ctx(table));
        if (err) warn(err, table.id);
        break;
      }
    }
    this.flush();
  }

  /** Runs every table's timers, then sends what changed. */
  tick() {
    const now = this.now();
    for (const g of this.tables.values()) {
      try {
        g.tick(now, this.ctx(g));
      } catch (err) {
        console.error(`casino: table ${g.id} failed to tick`, err);
      }
    }
    this.flush();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  private seated(p: CasinoPlayer): Seated {
    return { owner: p.owner, name: p.name };
  }

  private standUp(owner: string) {
    const at = this.seatOf.get(owner);
    if (!at) return;
    this.seatOf.delete(owner);
    const g = this.tables.get(at);
    if (g) g.stand(owner, this.ctx(g));
    this.dirtyTables.add(at);
  }

  private ctx(g: CasinoGame): CasinoContext {
    return {
      stake: (owner, amount, limits) => {
        const min = limits?.min ?? MIN_BET;
        const max = limits?.max ?? MAX_BET;
        if (!validBet(amount, min, max)) return `Stakes are ${min} to ${max} chips`;
        if (!this.wallets.debit(owner, amount)) {
          const w = this.wallets.open(owner);
          return w.chips ? `You only have ${w.chips} chips` : `You're out of chips: the cashier tops you up to ${START_CHIPS} tomorrow`;
        }
        this.dirtyWallets.add(owner);
        return undefined;
      },
      pay: (owner, amount) => {
        if (!Number.isInteger(amount) || amount <= 0) return;
        this.wallets.credit(owner, amount);
        this.dirtyWallets.add(owner);
      },
      chips: (owner) => this.wallets.chips(owner),
      random: (n) => this.random(n),
      result: (owner, text, delta, data) => {
        for (const p of this.players.values()) if (p.owner === owner) p.send({ t: 'casino.result', table: g.id, text, ...(delta !== undefined ? { delta } : {}), ...(data !== undefined ? { data } : {}) });
      },
      changed: () => this.dirtyTables.add(g.id),
      now: () => this.now(),
    };
  }

  private sendWallet(p: CasinoPlayer) {
    const w = this.wallets.open(p.owner);
    p.send({ t: 'casino.wallet', chips: w.chips, ...(w.nextTopUpAt ? { nextTopUpAt: w.nextTopUpAt } : {}) });
  }

  /** Sends what changed: each changed table's view to everyone inside, and each moved wallet to its owner. */
  private flush() {
    if (this.dirtyWallets.size) {
      for (const p of this.players.values()) if (this.dirtyWallets.has(p.owner)) this.sendWallet(p);
      this.dirtyWallets.clear();
    }
    if (!this.dirtyTables.size) return;
    const tables = [...this.dirtyTables];
    this.dirtyTables.clear();
    for (const id of tables) {
      const g = this.tables.get(id);
      if (!g) continue;
      // Everyone who isn't seated there sees the same, so it's worked out once.
      const outside = g.view(null);
      for (const p of this.players.values()) p.send({ t: 'casino.table', table: id, state: this.seatOf.get(p.owner) === id ? g.view(p.owner) : outside });
    }
  }
}
