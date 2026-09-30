import type { CasinoKind } from '../../shared/casino.js';
import {
  BIG_BLIND,
  HAND_PAUSE_MS,
  HOUSE_BOT,
  HOUSE_BOT_NAME,
  HOUSE_BOT_STACK,
  MAX_BUY_IN,
  MIN_BUY_IN,
  RUNOUT_MS,
  SMALL_BLIND,
  TIMEOUTS_TO_SIT_OUT,
  TURN_MS,
  evaluate,
  fullDeck,
  shareOut,
  splitPots,
  type Card,
  type PokerResult,
  type PokerSeatView,
  type PokerStreet,
  type PokerToAct,
  type PokerView,
} from '../../shared/casino-poker.js';
import type { CasinoContext, CasinoGame, Seated } from './game.js';

/*
 * The poker table (flrnoh fork, see shared/casino-poker.ts): no-limit Texas Hold'em, a cash game
 * among whoever sits here. You sit down with nothing in front of you and buy in (`buyin`, data:
 * chips from your wallet); getting up, or leaving, puts what's left of your stack back in your
 * wallet. A hand starts by itself when two or more have chips, the button moves round, blinds
 * 5/10, and the betting is the usual: fold, check, call, bet or raise (`raise`, data: the total to
 * go to this round) with the minimum-raise rule, all-in (`allin`), side pots, a 30 s clock per turn.
 * Nobody sees anyone's hole cards but their own until a showdown, and the deck never leaves here.
 * Optional: a simple house bot (`bot` toggles it) so one person can play; its chips are the house's.
 */

/** Someone sitting at the table. */
interface SeatP {
  owner: string;
  name: string;
  seat: number;
  /** Chips in front of them (out of their wallet: back into it when they get up). */
  stack: number;
  sitOut: boolean;
  /** Turns missed in a row. */
  timeouts: number;
  bot: boolean;
}

/** Someone in the hand being played (they may have got up since: `left`, folded). */
interface HandP {
  owner: string;
  name: string;
  seat: number;
  bot: boolean;
  hole: Card[];
  /** In this betting round, and over the whole hand. */
  bet: number;
  total: number;
  folded: boolean;
  allIn: boolean;
  /** Acted this round; and the full raise they last acted after (see canRaise). */
  acted: boolean;
  actedFull: number;
  left: boolean;
  shown: boolean;
  last?: string;
  won: number;
  handName?: string;
}

interface Hand {
  no: number;
  /** In seat order. */
  players: HandP[];
  dealer: number;
  deck: Card[];
  board: Card[];
  street: PokerStreet;
  /** The most anyone has put in this round, the size of the last full raise, and how many full raises (and rounds) there have been. */
  currentBet: number;
  minRaise: number;
  fullRaise: number;
  /** Whose turn (an index into players), -1 for nobody's, and till when. */
  turn: number;
  deadline: number;
  /** The house bot acts at this time. */
  botAt: number;
  /** All-in, no more betting: the next street comes at this time. */
  runoutAt: number;
  over: boolean;
}

export interface PokerOptions {
  /** The tests' own deck: dealt from the front, two each starting left of the button, then the board. */
  deck?: () => Card[];
}

const BETTING: readonly PokerStreet[] = ['preflop', 'flop', 'turn', 'river'];

export class PokerTable implements CasinoGame {
  readonly kind: CasinoKind = 'poker';
  private seatsAt: (SeatP | null)[];
  private hand: Hand | null = null;
  private handNo = 0;
  private lastDealerSeat = -1;
  private nextHandAt = 0;
  private summary: string | undefined;

  constructor(
    readonly id: string,
    readonly seats = 6,
    private opts: PokerOptions = {},
  ) {
    this.seatsAt = Array.from({ length: seats }, () => null);
  }

  // ---- Seating ----------------------------------------------------------------------------------

  private seatOf(owner: string): SeatP | undefined {
    return this.seatsAt.find((s) => s?.owner === owner) ?? undefined;
  }

  private humans(): SeatP[] {
    return this.seatsAt.filter((s): s is SeatP => !!s && !s.bot);
  }

  sit(p: Seated, ctx: CasinoContext): string | void {
    this.lastNow = ctx.now();
    if (this.seatOf(p.owner)) return;
    let free = this.seatsAt.findIndex((s) => !s);
    if (free < 0) {
      // Everyone's chair but the bot's is taken: it makes room.
      const bot = this.seatOf(HOUSE_BOT);
      if (!bot) return 'The table is full';
      this.removeBot(ctx);
      free = this.seatsAt.findIndex((s) => !s);
    }
    this.seatsAt[free] = { owner: p.owner, name: p.name, seat: free, stack: 0, sitOut: false, timeouts: 0, bot: false };
    ctx.changed();
  }

  stand(owner: string, ctx: CasinoContext) {
    this.lastNow = ctx.now();
    const seat = this.seatOf(owner);
    if (!seat) return;
    this.leaveHand(owner, ctx);
    this.seatsAt[seat.seat] = null;
    if (seat.stack > 0 && !seat.bot) {
      ctx.pay(owner, seat.stack);
      ctx.result(owner, `You cash out ${seat.stack} chips`, 0);
    }
    seat.stack = 0;
    if (!seat.bot && !this.humans().length && this.seatOf(HOUSE_BOT)) this.removeBot(ctx);
    // Everyone's gone: the table's cleared (the last hand's cards don't linger on the felt).
    if (this.seatsAt.every((s) => !s) && (!this.hand || this.hand.over)) {
      this.hand = null;
      this.summary = undefined;
    }
    ctx.changed();
  }

  /** `owner` is out of the hand being played (got up): folded, their chips in the pot stay there. */
  private leaveHand(owner: string, ctx: CasinoContext) {
    const h = this.hand;
    if (!h) return;
    const hp = h.players.find((x) => x.owner === owner && !x.left);
    if (!hp) return;
    hp.left = true;
    if (h.over || hp.folded) return;
    hp.folded = true;
    hp.last = 'Left';
    this.progress(ctx);
  }

  private removeBot(ctx: CasinoContext) {
    const bot = this.seatOf(HOUSE_BOT);
    if (!bot) return;
    this.leaveHand(HOUSE_BOT, ctx);
    this.seatsAt[bot.seat] = null;
  }

  // ---- Playing ----------------------------------------------------------------------------------

  act(p: Seated, action: string, data: unknown, ctx: CasinoContext): string | void {
    this.lastNow = ctx.now();
    const seat = this.seatOf(p.owner);
    if (!seat) return 'Take a seat first';
    switch (action) {
      case 'buyin':
        return this.buyIn(seat, data, ctx);
      case 'sitout':
        seat.sitOut = true;
        ctx.changed();
        return;
      case 'back':
        seat.sitOut = false;
        seat.timeouts = 0;
        ctx.changed();
        return;
      case 'bot':
        return this.toggleBot(ctx);
      case 'fold':
      case 'check':
      case 'call':
      case 'raise':
      case 'allin': {
        const h = this.hand;
        if (!h || h.over || h.turn < 0) return 'Wait for the next hand';
        const hp = h.players[h.turn];
        if (hp.owner !== p.owner) return 'It isn’t your turn';
        const err = this.play(hp, action, data, ctx);
        if (err) return err;
        seat.timeouts = 0;
        return;
      }
      default:
        return 'No such move';
    }
  }

  private buyIn(seat: SeatP, data: unknown, ctx: CasinoContext): string | void {
    const hp = this.hand && !this.hand.over ? this.hand.players.find((x) => x.owner === seat.owner && !x.left) : undefined;
    if (hp && !hp.folded) return 'Add chips between hands';
    if (seat.stack >= MAX_BUY_IN) return `Your stack is at the table's most (${MAX_BUY_IN})`;
    const min = seat.stack > 0 ? 1 : MIN_BUY_IN;
    const err = ctx.stake(seat.owner, data, { min, max: MAX_BUY_IN - seat.stack });
    if (err) return seat.stack > 0 ? err : err.replace(/^Stakes are/, 'Buy in for');
    seat.stack += data as number;
    seat.sitOut = false;
    seat.timeouts = 0;
    // Somebody new with chips: give everyone a moment before the cards come.
    if ((!this.hand || this.hand.over) && this.nextHandAt < ctx.now() + 1500) this.nextHandAt = ctx.now() + 1500;
    ctx.result(seat.owner, `You sit down with ${seat.stack} chips`, 0);
    ctx.changed();
  }

  private toggleBot(ctx: CasinoContext): string | void {
    if (this.seatOf(HOUSE_BOT)) {
      this.removeBot(ctx);
      ctx.changed();
      return;
    }
    const free = this.seatsAt.findIndex((s) => !s);
    if (free < 0) return 'No chair free for the house';
    this.seatsAt[free] = { owner: HOUSE_BOT, name: HOUSE_BOT_NAME, seat: free, stack: HOUSE_BOT_STACK, sitOut: false, timeouts: 0, bot: true };
    if ((!this.hand || this.hand.over) && this.nextHandAt < ctx.now() + 1500) this.nextHandAt = ctx.now() + 1500;
    ctx.changed();
  }

  /** Chips go back to `hp`: onto their stack, or into their wallet if they've got up since. */
  private give(hp: HandP, n: number, ctx: CasinoContext) {
    if (n <= 0) return;
    const seat = this.seatOf(hp.owner);
    if (seat) seat.stack += n;
    else if (!hp.bot) ctx.pay(hp.owner, n);
  }

  private put(hp: HandP, n: number) {
    const seat = this.seatOf(hp.owner)!;
    const amount = Math.max(0, Math.min(n, seat.stack));
    seat.stack -= amount;
    hp.bet += amount;
    hp.total += amount;
    if (seat.stack === 0) hp.allIn = true;
    return amount;
  }

  private stackOf(hp: HandP): number {
    return this.seatOf(hp.owner)?.stack ?? 0;
  }

  /** Still in, with chips to bet: `hp` excluded. */
  private othersCanAct(hp: HandP): number {
    return this.hand!.players.filter((x) => x !== hp && !x.folded && !x.allIn).length;
  }

  private needsAction(hp: HandP): boolean {
    const h = this.hand!;
    if (hp.folded || hp.allIn) return false;
    return hp.bet < h.currentBet || (!hp.acted && this.othersCanAct(hp) > 0);
  }

  /**
   * Whether `hp` may bet or raise: not after they've acted since the last full raise (an all-in
   * for less than a full raise doesn't reopen the betting), not with nobody left to answer it,
   * and not without chips beyond a call.
   */
  private canRaise(hp: HandP): boolean {
    const h = this.hand!;
    return (!hp.acted || hp.actedFull < h.fullRaise) && this.othersCanAct(hp) > 0 && this.stackOf(hp) + hp.bet > h.currentBet;
  }

  toAct(hp: HandP): PokerToAct {
    const h = this.hand!;
    const stack = this.stackOf(hp);
    const maxTo = hp.bet + stack;
    const minTo = Math.min(maxTo, h.currentBet === 0 ? BIG_BLIND : h.currentBet + h.minRaise);
    return { toCall: Math.min(stack, Math.max(0, h.currentBet - hp.bet)), canCheck: hp.bet >= h.currentBet, canRaise: this.canRaise(hp), minTo, maxTo, bet: hp.bet, stack };
  }

  private play(hp: HandP, action: string, data: unknown, ctx: CasinoContext): string | void {
    const h = this.hand!;
    const call = () => {
      const toCall = h.currentBet - hp.bet;
      if (toCall <= 0) {
        hp.last = 'Check';
        return;
      }
      const paid = this.put(hp, toCall);
      hp.last = hp.allIn ? `All-in ${hp.bet}` : `Call ${paid}`;
    };
    const raiseTo = (to: number): string | void => {
      const maxTo = hp.bet + this.stackOf(hp);
      if (!this.canRaise(hp)) return h.currentBet > hp.bet ? 'You can only call or fold' : 'You can only check';
      if (to > maxTo) return `You can go to ${maxTo} at most`;
      if (to <= h.currentBet) return `Raise to more than ${h.currentBet}`;
      const minTo = h.currentBet === 0 ? BIG_BLIND : h.currentBet + h.minRaise;
      if (to < minTo && to !== maxTo) return `The least you can ${h.currentBet ? 'raise' : 'bet'} to is ${minTo}`;
      const by = to - h.currentBet;
      const opening = h.currentBet === 0;
      if (by >= h.minRaise) {
        h.minRaise = by;
        h.fullRaise++;
      }
      h.currentBet = to;
      this.put(hp, to - hp.bet);
      hp.last = hp.allIn ? `All-in ${to}` : opening ? `Bet ${to}` : `Raise to ${to}`;
    };
    switch (action) {
      case 'fold':
        hp.folded = true;
        hp.last = 'Fold';
        break;
      case 'check':
        if (hp.bet < h.currentBet) return `You can't check: call ${Math.min(this.stackOf(hp), h.currentBet - hp.bet)} or fold`;
        hp.last = 'Check';
        break;
      case 'call':
        call();
        break;
      case 'raise': {
        if (typeof data !== 'number' || !Number.isInteger(data)) return 'Raise to how much?';
        const err = raiseTo(data);
        if (err) return err;
        break;
      }
      case 'allin': {
        const maxTo = hp.bet + this.stackOf(hp);
        if (maxTo > h.currentBet && this.canRaise(hp)) {
          const err = raiseTo(maxTo);
          if (err) return err;
        } else call();
        break;
      }
    }
    hp.acted = true;
    hp.actedFull = h.fullRaise;
    this.progress(ctx);
  }

  /** After a move (or someone leaving): the hand's over, the next player's turn, or the round's done. */
  private progress(ctx: CasinoContext) {
    const h = this.hand;
    if (!h || h.over) return;
    ctx.changed();
    if (h.players.filter((x) => !x.folded).length <= 1) return this.finish(ctx);
    if (h.runoutAt) return;
    if (h.turn >= 0 && this.needsAction(h.players[h.turn])) return;
    const next = this.findNext(h.turn + 1);
    if (next >= 0) this.setTurn(next, ctx);
    else this.endStreet(ctx);
  }

  private findNext(from: number): number {
    const h = this.hand!;
    const n = h.players.length;
    for (let k = 0; k < n; k++) {
      const i = (((from + k) % n) + n) % n;
      if (this.needsAction(h.players[i])) return i;
    }
    return -1;
  }

  private setTurn(i: number, ctx: CasinoContext) {
    const h = this.hand!;
    h.turn = i;
    const now = ctx.now();
    h.deadline = now + TURN_MS;
    h.botAt = h.players[i].bot ? now + 900 + ctx.random(900) : 0;
    ctx.changed();
  }

  /** The biggest bet this round, where nobody matched all of it: the rest goes back. */
  private returnUncalled(ctx: CasinoContext) {
    const h = this.hand!;
    const sorted = [...h.players].sort((a, b) => b.bet - a.bet);
    const top = sorted[0];
    const second = sorted[1]?.bet ?? 0;
    const excess = top ? top.bet - second : 0;
    if (excess <= 0) return;
    top.bet -= excess;
    top.total -= excess;
    this.give(top, excess, ctx);
    if (this.seatOf(top.owner) && this.stackOf(top) > 0) top.allIn = false;
  }

  private endStreet(ctx: CasinoContext) {
    const h = this.hand!;
    this.returnUncalled(ctx);
    for (const p of h.players) p.bet = 0;
    if (h.street === 'river') return this.showdown(ctx);
    this.dealStreet();
    h.currentBet = 0;
    h.minRaise = BIG_BLIND;
    h.fullRaise++;
    for (const p of h.players) p.acted = false;
    h.turn = -1;
    const canAct = h.players.filter((p) => !p.folded && !p.allIn).length;
    const next = canAct >= 2 ? this.findNext(h.dealer + 1) : -1;
    if (next >= 0) return this.setTurn(next, ctx);
    // No more betting: everyone still in shows, and the rest of the board comes.
    for (const p of h.players) if (!p.folded) p.shown = true;
    h.runoutAt = ctx.now() + RUNOUT_MS;
    ctx.changed();
  }

  private dealStreet() {
    const h = this.hand!;
    const i = BETTING.indexOf(h.street);
    const n = h.street === 'preflop' ? 3 : 1;
    h.board.push(...h.deck.splice(0, n));
    h.street = BETTING[i + 1];
  }

  /** Everyone but one folded: they take it all, without showing. */
  private finish(ctx: CasinoContext) {
    const h = this.hand!;
    this.returnUncalled(ctx);
    const winner = h.players.find((x) => !x.folded)!;
    const amount = h.players.reduce((s, p) => s + p.total, 0);
    winner.won = amount;
    this.give(winner, amount, ctx);
    this.summary = `${winner.name} wins ${amount}`;
    this.endHand(ctx);
  }

  private showdown(ctx: CasinoContext) {
    const h = this.hand!;
    h.street = 'showdown';
    // Burned cards aside, the board is always five by now (a run-out dealt the rest).
    while (h.board.length < 5) h.board.push(h.deck.shift()!);
    const values = h.players.map((p) => (p.folded ? null : evaluate([...p.hole, ...h.board])));
    h.players.forEach((p, i) => {
      if (values[i]) {
        p.shown = true;
        p.handName = values[i]!.name;
      }
    });
    const pots = splitPots(h.players.map((p) => ({ total: p.total, live: !p.folded })));
    const n = h.players.length;
    // Odd chips go to the first winner left of the button.
    const leftOfButton = (i: number) => (i - h.dealer - 1 + n) % n;
    for (const pot of pots) {
      const best = Math.max(...pot.eligible.map((i) => values[i]!.score));
      const winners = pot.eligible.filter((i) => values[i]!.score === best).sort((a, b) => leftOfButton(a) - leftOfButton(b));
      for (const [i, won] of shareOut(pot.amount, winners)) {
        h.players[i].won += won;
        this.give(h.players[i], won, ctx);
      }
    }
    this.summary = h.players
      .filter((p) => p.won > 0)
      .map((p) => `${p.name} wins ${p.won} with ${p.handName}`)
      .join(' · ');
    this.endHand(ctx);
  }

  private endHand(ctx: CasinoContext) {
    const h = this.hand!;
    h.over = true;
    h.turn = -1;
    h.runoutAt = 0;
    this.nextHandAt = ctx.now() + HAND_PAUSE_MS;
    this.lastDealerSeat = h.players[h.dealer].seat;
    for (const p of h.players) {
      if (p.bot) continue;
      const net = p.won - p.total;
      const data: PokerResult = { hand: h.no, won: p.won, net };
      const text = p.won > 0 ? `🏆 You win ${p.won}${p.handName ? ` with ${p.handName}` : ''}` : (this.summary ?? 'Hand over');
      ctx.result(p.owner, text, net, data);
    }
    // The house tops itself up when it's running low.
    const bot = this.seatOf(HOUSE_BOT);
    if (bot && bot.stack < HOUSE_BOT_STACK / 2) bot.stack = HOUSE_BOT_STACK;
    ctx.changed();
  }

  private start(ctx: CasinoContext) {
    const ready = this.seatsAt.filter((s): s is SeatP => !!s && s.stack > 0 && !s.sitOut);
    if (ready.length < 2 || !ready.some((s) => !s.bot)) return;
    // The button moves to the next seat round from the last one that had it.
    const n = ready.length;
    let dealer = ready.findIndex((s) => s.seat > this.lastDealerSeat);
    if (dealer < 0) dealer = 0;
    const deck = this.opts.deck?.() ?? this.shuffle(ctx);
    const players: HandP[] = ready.map((s) => ({
      owner: s.owner,
      name: s.name,
      seat: s.seat,
      bot: s.bot,
      hole: [],
      bet: 0,
      total: 0,
      folded: false,
      allIn: false,
      acted: false,
      actedFull: 0,
      left: false,
      shown: false,
      won: 0,
    }));
    for (let k = 1; k <= n; k++) players[(dealer + k) % n].hole = deck.splice(0, 2);
    this.hand = { no: ++this.handNo, players, dealer, deck, board: [], street: 'preflop', currentBet: 0, minRaise: BIG_BLIND, fullRaise: 1, turn: -1, deadline: 0, botAt: 0, runoutAt: 0, over: false };
    this.summary = undefined;
    // Heads-up the button posts the small blind and acts first before the flop.
    const sb = n === 2 ? dealer : (dealer + 1) % n;
    const bb = (sb + 1) % n;
    this.put(players[sb], SMALL_BLIND);
    players[sb].last = `Small blind ${players[sb].bet}`;
    this.put(players[bb], BIG_BLIND);
    players[bb].last = `Big blind ${players[bb].bet}`;
    this.hand.currentBet = Math.max(players[sb].bet, players[bb].bet);
    const next = this.findNext(bb + 1);
    ctx.changed();
    if (next >= 0) this.setTurn(next, ctx);
    else this.endStreet(ctx);
  }

  private shuffle(ctx: CasinoContext): Card[] {
    const d = fullDeck();
    for (let i = d.length - 1; i > 0; i--) {
      const j = ctx.random(i + 1);
      [d[i], d[j]] = [d[j], d[i]];
    }
    return d;
  }

  tick(now: number, ctx: CasinoContext) {
    this.lastNow = now;
    const h = this.hand;
    if (h && !h.over) {
      if (h.runoutAt) {
        if (now < h.runoutAt) return;
        if (h.street === 'river') return this.showdown(ctx);
        this.dealStreet();
        h.runoutAt = now + RUNOUT_MS;
        ctx.changed();
        return;
      }
      if (h.turn < 0) return;
      const hp = h.players[h.turn];
      if (hp.bot && h.botAt && now >= h.botAt) {
        h.botAt = 0;
        this.botPlays(hp, ctx);
        return;
      }
      if (now >= h.deadline) {
        const seat = this.seatOf(hp.owner);
        this.play(hp, hp.bet >= h.currentBet ? 'check' : 'fold', undefined, ctx);
        if (seat && ++seat.timeouts >= TIMEOUTS_TO_SIT_OUT) seat.sitOut = true;
        if (!hp.bot) ctx.result(hp.owner, seat?.sitOut ? 'Time’s up: you’re sitting out until you say you’re back' : `Time’s up: the dealer ${hp.last === 'Check' ? 'checked' : 'folded'} for you`);
      }
      return;
    }
    if (now >= this.nextHandAt) this.start(ctx);
  }

  /** The house bot: a rough idea of its hand's strength, the price, and a little luck. */
  private botPlays(hp: HandP, ctx: CasinoContext) {
    const h = this.hand!;
    const a = this.toAct(hp);
    const pot = h.players.reduce((s, p) => s + p.total, 0);
    let strength: number;
    if (h.board.length === 0) {
      const [r1, r2] = hp.hole.map((c) => '23456789TJQKA'.indexOf(c[0])).sort((x, y) => y - x);
      strength = r1 === r2 ? 0.5 + r1 / 24 : (r1 + r2) / 48 + (hp.hole[0][1] === hp.hole[1][1] ? 0.06 : 0) + (r1 - r2 === 1 ? 0.05 : 0);
    } else {
      const v = evaluate([...hp.hole, ...h.board]);
      strength = [0.15, 0.45, 0.65, 0.75, 0.85, 0.88, 0.93, 0.97, 0.99][v.category];
    }
    const luck = ctx.random(100) / 100;
    const odds = a.toCall / (pot + a.toCall || 1);
    if (a.canRaise && strength > 0.7 && luck < 0.6) {
      const to = Math.min(a.maxTo, Math.max(a.minTo, h.currentBet + Math.round((pot * 0.6) / 5) * 5));
      if (!this.play(hp, 'raise', to, ctx)) return;
    }
    if (a.canCheck) return void this.play(hp, a.canRaise && strength > 0.55 && luck < 0.3 ? 'raise' : 'check', a.minTo, ctx);
    this.play(hp, strength >= odds + 0.1 || (a.toCall <= BIG_BLIND && strength > 0.25) ? 'call' : 'fold', undefined, ctx);
  }

  // ---- What it looks like -----------------------------------------------------------------------

  view(forOwner: string | null): PokerView {
    const h = this.hand;
    const seats: PokerSeatView[] = [];
    for (const s of this.seatsAt) {
      if (!s) continue;
      const hp = h?.players.find((x) => x.owner === s.owner && !x.left);
      const v: PokerSeatView = { seat: s.seat, name: s.name, stack: s.stack, bet: 0, status: s.stack === 0 ? 'out' : s.sitOut ? 'sitout' : 'waiting' };
      if (h && hp) {
        v.bet = hp.bet;
        if (!(h.over && s.stack === 0 && hp.won === 0)) v.status = hp.folded ? 'folded' : h.over ? 'in' : hp.allIn ? 'allin' : 'in';
        v.hasCards = !hp.folded || hp.owner === forOwner;
        if (hp.owner === forOwner || hp.shown) v.cards = [...hp.hole];
        if (hp.last) v.last = hp.last;
        if (h.over && hp.won) v.won = hp.won;
        if (hp.shown && hp.handName) v.hand = hp.handName;
        if (!h.over && h.players[h.turn] === hp) v.turn = true;
        if (h.players[h.dealer] === hp) v.dealer = true;
      } else if (!h && s.seat === this.lastDealerSeat) v.dealer = true;
      if (s.bot) v.bot = true;
      if (forOwner && s.owner === forOwner) v.you = true;
      seats.push(v);
    }
    const view: PokerView = {
      kind: 'poker',
      seated: this.seatsAt.filter((s): s is SeatP => !!s).map((s) => s.name),
      seats,
      board: h ? [...h.board] : [],
      street: h ? (h.over ? 'showdown' : h.street) : 'idle',
      hand: this.handNo,
      pot: h ? h.players.reduce((s, p) => s + p.total, 0) : 0,
      pots: [],
      blinds: [SMALL_BLIND, BIG_BLIND],
    };
    if (h) {
      const pots = splitPots(h.players.map((p) => ({ total: h.over ? p.total : p.total - p.bet, live: !p.folded })));
      if (pots.length > 1) view.pots = pots.map((p) => p.amount);
      if (!h.over && h.turn >= 0) {
        view.turnSeat = h.players[h.turn].seat;
        view.turnMs = Math.max(0, h.deadline - this.clock());
      }
    }
    if (!h || h.over) {
      const ready = this.seatsAt.filter((s) => s && s.stack > 0 && !s.sitOut).length;
      if (ready >= 2) view.nextMs = Math.max(0, this.nextHandAt - this.clock());
    }
    if (this.summary) view.summary = this.summary;
    if (this.seatOf(HOUSE_BOT)) view.bot = true;
    const mine = forOwner ? this.seatOf(forOwner) : undefined;
    if (mine) {
      const sv = seats.find((x) => x.seat === mine.seat)!;
      view.you = { seat: mine.seat, stack: mine.stack, status: sv.status };
      const hp = h?.players.find((x) => x.owner === forOwner && !x.left);
      if (h && hp && !h.over && h.players[h.turn] === hp) view.you.toAct = this.toAct(hp);
      if (h && hp && !hp.folded && h.board.length >= 3) view.you.hand = evaluate([...hp.hole, ...h.board]).name;
    }
    return view;
  }

  /** The office's clock as the last tick or move saw it (views are made after them, without a context). */
  private lastNow = 0;
  private clock(): number {
    return this.lastNow;
  }
}
