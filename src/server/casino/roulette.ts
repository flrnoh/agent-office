import type { CasinoKind } from '../../shared/casino.js';
import { BET_MS, HISTORY, PAYOUT_MS, POCKETS, ROUND_MAX, SPIN_MS, SPOT_MAX, betLabel, betNumbers, betReturn, colorOf, type RouletteChip, type RoulettePhase, type RouletteResult, type RouletteView } from '../../shared/casino-roulette.js';
import type { CasinoContext, CasinoGame, Seated } from './game.js';

/*
 * The roulette table (flrnoh fork, see shared/casino-roulette.ts): one wheel everyone at the table
 * plays together. While anyone sits at it the rounds run by themselves: bets (BET_MS), the wheel
 * (SPIN_MS: the number is drawn as it starts), the payout (PAYOUT_MS), and again. Chips are staked
 * the moment they're placed and come back if they're taken off before the bets close (or their
 * owner gets up then). Once the wheel turns, bets stand: they're paid even if their owner has left.
 *
 * Actions (`casino.act`):
 *   bet   {key, amount}   put chips on a spot (adds to what you have there)
 *   remove {key}          take your chips off a spot
 *   undo                  take back the last chips you placed
 *   clear                 take all of yours off
 *   rebet                 the bets you had last round, again
 */

interface Bet {
  owner: string;
  seat: number;
  name: string;
  key: string;
  amount: number;
}

export class Roulette implements CasinoGame {
  readonly kind: CasinoKind = 'roulette';
  readonly seats: number;
  private seated = new Map<string, { seat: number; name: string }>();
  private phase: RoulettePhase = 'idle';
  private endsAt = 0;
  private round = 0;
  private bets: Bet[] = [];
  /** The order each owner placed chips in (for undo): the key and how many. */
  private placed = new Map<string, { key: string; amount: number }[]>();
  /** What each owner had on the layout last round (for rebet). */
  private last = new Map<string, { key: string; amount: number }[]>();
  private number: number | undefined;
  private history: number[] = [];
  private winners: { seat: number; name: string; won: number }[] = [];
  /** The office's clock as of the last call (the view says it, for countdowns). */
  private clock = 0;

  constructor(
    readonly id: string,
    seats = 6,
  ) {
    this.seats = seats;
  }

  sit(p: Seated, ctx: CasinoContext): string | void {
    this.clock = ctx.now();
    const taken = new Set([...this.seated.values()].map((s) => s.seat));
    let seat = 0;
    while (taken.has(seat)) seat++;
    if (seat >= this.seats) return 'The table is full';
    this.seated.set(p.owner, { seat, name: p.name });
    if (this.phase === 'idle') this.startBetting(this.clock);
    ctx.changed();
  }

  stand(owner: string, ctx: CasinoContext) {
    this.clock = ctx.now();
    if (!this.seated.delete(owner)) return;
    // Bets still open: theirs come back. Once the wheel turns, they stand (and get paid).
    if (this.phase === 'betting') this.takeBack(owner, () => true, ctx);
    if (!this.seated.size && this.phase === 'betting') this.phase = 'idle';
    ctx.changed();
  }

  act(p: Seated, action: string, data: unknown, ctx: CasinoContext): string | void {
    this.clock = ctx.now();
    const me = this.seated.get(p.owner);
    if (!me) return 'Take a seat first';
    const d = (data && typeof data === 'object' ? data : {}) as { key?: unknown; amount?: unknown };
    if (!['bet', 'remove', 'undo', 'clear', 'rebet'].includes(action)) return 'No such move at roulette';
    if (this.phase !== 'betting') return 'No more bets: wait for the next round';
    switch (action) {
      case 'bet': {
        const key = d.key;
        if (!betNumbers(key)) return 'That’s not a bet on this table';
        return this.place(p.owner, me, key as string, d.amount, ctx);
      }
      case 'remove': {
        if (typeof d.key !== 'string') return 'Which bet?';
        const key = d.key;
        if (!this.takeBack(p.owner, (b) => b.key === key, ctx)) return 'You have nothing there';
        break;
      }
      case 'undo': {
        const list = this.placed.get(p.owner);
        const lastOne = list?.pop();
        if (!lastOne) return 'Nothing to undo';
        const b = this.bets.find((x) => x.owner === p.owner && x.key === lastOne.key);
        if (b) {
          const back = Math.min(b.amount, lastOne.amount);
          b.amount -= back;
          if (!b.amount) this.bets = this.bets.filter((x) => x !== b);
          ctx.pay(p.owner, back);
        }
        break;
      }
      case 'clear':
        if (!this.takeBack(p.owner, () => true, ctx)) return 'You have no bets down';
        break;
      case 'rebet': {
        const prev = this.last.get(p.owner);
        if (!prev?.length) return 'No bets from last round to repeat';
        const mine = this.bets.filter((b) => b.owner === p.owner);
        if (mine.length) return 'Clear your bets first, then repeat';
        const total = prev.reduce((s, b) => s + b.amount, 0);
        if (ctx.chips(p.owner) < total) return `That needs ${total} chips`;
        for (const b of prev) {
          const err = this.place(p.owner, me, b.key, b.amount, ctx, true);
          if (err) {
            ctx.changed();
            return err;
          }
        }
        break;
      }
    }
    ctx.changed();
  }

  tick(now: number, ctx: CasinoContext) {
    this.clock = now;
    if (this.phase === 'idle' || now < this.endsAt) return;
    if (this.phase === 'betting') {
      // Nobody sitting (they got up with their bets): the wheel rests.
      if (!this.seated.size && !this.bets.length) {
        this.phase = 'idle';
      } else {
        this.phase = 'spinning';
        this.number = ctx.random(POCKETS);
        this.endsAt = now + SPIN_MS;
      }
    } else if (this.phase === 'spinning') {
      this.settle(ctx);
      this.phase = 'payout';
      this.endsAt = now + PAYOUT_MS;
    } else if (this.phase === 'payout') {
      if (this.seated.size) this.startBetting(now);
      else this.phase = 'idle';
    }
    ctx.changed();
  }

  view(forOwner: string | null): RouletteView {
    const players = [...this.seated.values()].sort((a, b) => a.seat - b.seat);
    const you = forOwner ? this.seated.get(forOwner)?.seat : undefined;
    const showNumber = this.phase === 'spinning' || this.phase === 'payout';
    return {
      kind: 'roulette',
      phase: this.phase,
      round: this.round,
      ...(this.phase !== 'idle' ? { endsAt: this.endsAt } : {}),
      now: this.clock,
      players: players.map((p) => ({ seat: p.seat, name: p.name })),
      seated: players.map((p) => p.name),
      bets: this.bets.map((b): RouletteChip => ({ seat: b.seat, name: b.name, key: b.key, amount: b.amount })),
      ...(showNumber && this.number !== undefined ? { number: this.number } : {}),
      history: [...this.history],
      ...(this.phase === 'payout' ? { winners: this.winners.map((w) => ({ ...w })) } : {}),
      ...(you !== undefined ? { you } : {}),
    };
  }

  // ---- Inside -----------------------------------------------------------------------------------

  private startBetting(now: number) {
    this.phase = 'betting';
    this.round++;
    this.endsAt = now + BET_MS;
    this.number = undefined;
    this.winners = [];
    this.placed.clear();
  }

  /** Stakes `amount` on `key` for `owner`, within the spot's and the round's limits. */
  private place(owner: string, me: { seat: number; name: string }, key: string, amount: unknown, ctx: CasinoContext, quiet = false): string | undefined {
    const mine = this.bets.filter((b) => b.owner === owner);
    const onSpot = mine.find((b) => b.key === key);
    const inRound = mine.reduce((s, b) => s + b.amount, 0);
    const spotRoom = SPOT_MAX - (onSpot?.amount ?? 0);
    const roundRoom = ROUND_MAX - inRound;
    if (typeof amount !== 'number' || !Number.isInteger(amount) || amount < 1) return 'Bets are whole chips, at least 1';
    if (spotRoom <= 0) return `${betLabel(key)} is at the table limit (${SPOT_MAX})`;
    if (roundRoom <= 0) return `You’re at the round’s limit (${ROUND_MAX} chips)`;
    const max = Math.min(spotRoom, roundRoom);
    if (amount > max) return spotRoom < roundRoom ? (onSpot ? `At most ${SPOT_MAX} on one spot: ${spotRoom} more fits on ${betLabel(key)}` : `At most ${SPOT_MAX} on one spot`) : `At most ${ROUND_MAX} chips a round: ${roundRoom} more fits`;
    const err = ctx.stake(owner, amount, { min: 1, max });
    if (err) return err;
    if (onSpot) onSpot.amount += amount;
    else this.bets.push({ owner, seat: me.seat, name: me.name, key, amount });
    const list = this.placed.get(owner) ?? [];
    list.push({ key, amount });
    this.placed.set(owner, list);
    if (!quiet) ctx.changed();
    return undefined;
  }

  /** Gives `owner` back their bets that `which` picks. True if there were any. */
  private takeBack(owner: string, which: (b: Bet) => boolean, ctx: CasinoContext): boolean {
    const back = this.bets.filter((b) => b.owner === owner && which(b));
    if (!back.length) return false;
    this.bets = this.bets.filter((b) => !back.includes(b));
    const keys = new Set(back.map((b) => b.key));
    const list = this.placed.get(owner);
    if (list) this.placed.set(owner, list.filter((p) => !keys.has(p.key)));
    ctx.pay(
      owner,
      back.reduce((s, b) => s + b.amount, 0),
    );
    return true;
  }

  /** The ball has landed on `number`: pays every bet and tells each player how it went. */
  private settle(ctx: CasinoContext) {
    const n = this.number ?? 0;
    this.history = [n, ...this.history].slice(0, HISTORY);
    const by = new Map<string, { seat: number; name: string; staked: number; won: number; hits: string[] }>();
    for (const b of this.bets) {
      const r = by.get(b.owner) ?? { seat: b.seat, name: b.name, staked: 0, won: 0, hits: [] };
      r.staked += b.amount;
      const back = betReturn(b.key, b.amount, n);
      if (back) {
        r.won += back;
        r.hits.push(betLabel(b.key));
      }
      by.set(b.owner, r);
    }
    this.last = new Map();
    for (const b of this.bets) {
      const l = this.last.get(b.owner) ?? [];
      l.push({ key: b.key, amount: b.amount });
      this.last.set(b.owner, l);
    }
    this.bets = [];
    this.winners = [];
    const said = `${n} ${colorOf(n) === 'green' ? 'green' : colorOf(n)}`;
    for (const [owner, r] of by) {
      if (r.won) ctx.pay(owner, r.won);
      const data: RouletteResult = { round: this.round, number: n, staked: r.staked, won: r.won };
      const net = r.won - r.staked;
      const text = r.won ? `${said} · ${r.hits.join(', ')} · you win ${r.won} chips${net < 0 ? ` (${-net} down)` : ''}` : `${said} · no luck this time`;
      ctx.result(owner, text, net, data);
      if (r.won) this.winners.push({ seat: r.seat, name: r.name, won: r.won });
    }
    this.winners.sort((a, b) => b.won - a.won);
  }
}
