import type { CasinoKind } from '../../shared/casino.js';
import {
  ALL_IN_MS,
  BET_MS,
  DEALER_STEP_MS,
  DECKS,
  PENETRATION,
  RESULTS_MS,
  TURN_MS,
  dealerDraws,
  handValue,
  isBlackjack,
  isTenValue,
  newShoe,
  rankOf,
  settleHand,
  shuffle,
  type BlackjackPhase,
  type BlackjackResult,
  type BlackjackView,
  type Card,
  type HandOutcome,
} from '../../shared/casino-blackjack.js';
import type { CasinoContext, CasinoGame, Seated } from './game.js';

/*
 * A blackjack table (flrnoh fork, see shared/casino-blackjack.ts). Rounds go round while anyone
 * sits at it: a betting window (it starts with the first bet, and closes after BET_MS, or sooner
 * once everyone seated has bet), the deal, the dealer peeking under an ace or a ten, each seat's
 * hands in turn (TURN_MS each, then it stands), the dealer's hand, the settling, a few seconds of
 * results, and betting again. The shoe and the hole card stay here: views never carry them.
 */

interface Hand {
  cards: Card[];
  bet: number;
  doubled?: boolean;
  split?: boolean;
  done?: boolean;
  outcome?: HandOutcome;
  paid?: number;
}

interface Seat {
  owner: string;
  name: string;
  /** Staked for the next deal (already off their chips). */
  bet: number;
  lastBet: number;
  hands: Hand[];
  gone?: boolean;
}

export class Blackjack implements CasinoGame {
  readonly kind: CasinoKind = 'blackjack';
  private seatList: (Seat | null)[];
  private shoe: Card[] = [];
  /** How many cards may be dealt from this shoe before a fresh shuffle. */
  private cut = 0;
  /** Set by the tests: the shoe is exactly this, in this order, and never reshuffled. */
  private rigged = false;
  private dealer: Card[] = [];
  private revealed = false;
  private phase: BlackjackPhase = 'betting';
  private round = 0;
  /** When the betting window closes, the turn runs out, the dealer's next card comes, the results clear. */
  private deadline: number | undefined;
  private turn: { seat: number; hand: number } | undefined;
  /** The office's clock as of the last thing that happened (views say how long is left from it). */
  private clock = 0;

  constructor(
    readonly id: string,
    readonly seats = 5,
  ) {
    this.seatList = Array.from({ length: seats }, () => null);
  }

  /** Tests: the next cards dealt, in order (the shoe won't be reshuffled). */
  loadShoe(cards: Card[]) {
    this.shoe = [...cards].reverse();
    this.cut = 0;
    this.rigged = true;
  }

  // ---- Seats ----------------------------------------------------------------------------------------

  sit(p: Seated, ctx: CasinoContext): string | void {
    this.clock = ctx.now();
    // Back before the round they walked out of is over: their hands are still here.
    const back = this.seatList.findIndex((s) => s?.owner === p.owner);
    if (back >= 0) {
      const s = this.seatList[back]!;
      s.gone = false;
      s.name = p.name;
      ctx.changed();
      return;
    }
    const free = this.seatList.findIndex((s) => !s);
    if (free < 0) return 'The table is full';
    this.seatList[free] = { owner: p.owner, name: p.name, bet: 0, lastBet: 0, hands: [] };
    ctx.changed();
  }

  stand(owner: string, ctx: CasinoContext) {
    this.clock = ctx.now();
    const i = this.seatOf(owner);
    if (i < 0) return;
    const s = this.seatList[i]!;
    if (s.bet) ctx.pay(owner, s.bet);
    s.bet = 0;
    if (!s.hands.length || this.phase === 'betting') {
      this.seatList[i] = null;
      if (!this.live().length) this.deadline = undefined;
      else this.maybeCloseBetting(ctx);
    } else {
      // Mid-round: whatever they hold stands, and it's settled with everyone's.
      s.gone = true;
      for (const h of s.hands) h.done = true;
      if (this.turn?.seat === i) this.advance(ctx);
    }
    this.refresh(ctx);
    ctx.changed();
  }

  // ---- Play -----------------------------------------------------------------------------------------

  act(p: Seated, action: string, data: unknown, ctx: CasinoContext): string | void {
    this.clock = ctx.now();
    const err = this.play(p, action, data, ctx);
    this.refresh(ctx);
    return err;
  }

  private play(p: Seated, action: string, data: unknown, ctx: CasinoContext): string | void {
    const i = this.seatOf(p.owner);
    if (i < 0) return 'Take a seat first';
    const s = this.seatList[i]!;
    switch (action) {
      case 'bet':
      case 'rebet': {
        if (this.phase !== 'betting') return 'Wait for the next hand to bet';
        const amount = action === 'rebet' ? s.lastBet : data;
        if (action === 'rebet' && !amount) return 'Nothing to bet again yet';
        if (s.bet && amount === s.bet) return;
        // Changing your bet: the old one comes back first, and stays down if the new one won't go.
        const old = s.bet;
        if (old) ctx.pay(p.owner, old);
        const err = ctx.stake(p.owner, amount);
        if (err) {
          if (old) ctx.stake(p.owner, old);
          return err;
        }
        s.bet = amount as number;
        if (this.deadline === undefined) this.deadline = this.clock + BET_MS;
        this.maybeCloseBetting(ctx);
        ctx.changed();
        return;
      }
      case 'clear': {
        if (this.phase !== 'betting') return 'The cards are out: your bet stays';
        if (!s.bet) return;
        ctx.pay(p.owner, s.bet);
        s.bet = 0;
        ctx.changed();
        return;
      }
      case 'hit':
      case 'stand':
      case 'double':
      case 'split': {
        if (this.phase !== 'playing' || this.turn?.seat !== i) return "It isn't your turn";
        const hand = s.hands[this.turn.hand];
        const can = this.legal(s, this.turn.hand, ctx);
        if (!can[action]) return action === 'double' ? 'You can only double on your first two cards (with the chips to match)' : action === 'split' ? 'You can only split a pair, once (with the chips to match)' : 'Not now';
        if (action === 'hit') {
          hand.cards.push(this.draw(ctx));
          if (handValue(hand.cards).total >= 21) hand.done = true;
        } else if (action === 'stand') {
          hand.done = true;
        } else if (action === 'double') {
          const err = ctx.stake(p.owner, hand.bet);
          if (err) return err;
          hand.bet *= 2;
          hand.doubled = true;
          hand.cards.push(this.draw(ctx));
          hand.done = true;
        } else {
          const err = ctx.stake(p.owner, hand.bet);
          if (err) return err;
          const aces = rankOf(hand.cards[0]) === 'A';
          const second: Hand = { cards: [hand.cards.pop()!], bet: hand.bet, split: true };
          hand.split = true;
          s.hands.splice(this.turn.hand + 1, 0, second);
          for (const h of [hand, second]) {
            h.cards.push(this.draw(ctx));
            // Split aces get a card each and no more.
            if (aces || handValue(h.cards).total >= 21) h.done = true;
          }
        }
        if (hand.done) this.advance(ctx);
        else this.deadline = this.clock + TURN_MS;
        ctx.changed();
        return;
      }
      default:
        return 'No such move at blackjack';
    }
  }

  tick(now: number, ctx: CasinoContext) {
    this.clock = now;
    if (this.deadline === undefined || now < this.deadline) return;
    this.step(ctx);
    this.refresh(ctx);
    ctx.changed();
  }

  private step(ctx: CasinoContext) {
    if (this.phase === 'betting') this.deal(ctx);
    else if (this.phase === 'playing') {
      // Time's up: the hand stands.
      const s = this.turn && this.seatList[this.turn.seat];
      if (s && this.turn) s.hands[this.turn.hand].done = true;
      this.advance(ctx);
    } else if (this.phase === 'dealer') this.dealerStep(ctx);
    else this.nextRound(ctx);
  }

  // ---- The round --------------------------------------------------------------------------------------

  private deal(ctx: CasinoContext) {
    const players = this.seatList.filter((s): s is Seat => !!s && s.bet > 0 && !s.gone);
    if (!players.length) {
      // Everyone took their bets back: wait for the next one.
      this.deadline = undefined;
      return;
    }
    if (!this.rigged && this.shoe.length <= this.cut) {
      this.shoe = shuffle(newShoe(DECKS), (n) => ctx.random(n));
      this.cut = Math.round(this.shoe.length * (1 - PENETRATION));
    }
    this.round++;
    this.dealer = [];
    this.revealed = false;
    for (const s of players) {
      s.hands = [{ cards: [], bet: s.bet }];
      s.lastBet = s.bet;
      s.bet = 0;
    }
    for (let k = 0; k < 2; k++) {
      for (const s of players) s.hands[0].cards.push(this.draw(ctx));
      this.dealer.push(this.draw(ctx));
    }
    for (const s of players) if (isBlackjack(s.hands[0].cards)) s.hands[0].done = true;
    // The dealer peeks under an ace or a ten: a blackjack there ends the round before anyone plays.
    const up = this.dealer[0];
    if ((rankOf(up) === 'A' || isTenValue(up)) && isBlackjack(this.dealer)) {
      this.revealed = true;
      this.settle(ctx);
      return;
    }
    this.phase = 'playing';
    this.turn = { seat: -1, hand: 0 };
    this.advance(ctx);
  }

  /** On to the next hand that's still to play, in seat order; the dealer once there's none. */
  private advance(ctx: CasinoContext) {
    const from = this.turn ?? { seat: -1, hand: 0 };
    for (let i = Math.max(0, from.seat); i < this.seatList.length; i++) {
      const s = this.seatList[i];
      if (!s || s.gone) continue;
      for (let k = i === from.seat ? from.hand : 0; k < s.hands.length; k++) {
        if (!s.hands[k].done) {
          this.phase = 'playing';
          this.turn = { seat: i, hand: k };
          this.deadline = ctx.now() + TURN_MS;
          return;
        }
      }
    }
    this.turn = undefined;
    this.phase = 'dealer';
    this.revealed = true;
    this.deadline = ctx.now() + DEALER_STEP_MS;
  }

  /** The dealer's turn, a card at a time: they only draw while somebody still has a hand that isn't bust. */
  private dealerStep(ctx: CasinoContext) {
    const alive = this.seatList.some((s) => s?.hands.some((h) => handValue(h.cards).total <= 21 && !isBlackjack(h.cards, h.split)));
    if (alive && dealerDraws(this.dealer)) {
      this.dealer.push(this.draw(ctx));
      this.deadline = ctx.now() + DEALER_STEP_MS;
      return;
    }
    this.settle(ctx);
  }

  private settle(ctx: CasinoContext) {
    this.phase = 'results';
    this.turn = undefined;
    this.revealed = true;
    this.deadline = ctx.now() + RESULTS_MS;
    for (const s of this.seatList) {
      if (!s || !s.hands.length) continue;
      let staked = 0;
      let paid = 0;
      const said: string[] = [];
      for (const h of s.hands) {
        h.done = true;
        const r = settleHand(h, this.dealer);
        h.outcome = r.outcome;
        h.paid = r.paid;
        staked += h.bet;
        paid += r.paid;
        said.push(outcomeText(r.outcome, r.paid - h.bet));
      }
      if (paid) ctx.pay(s.owner, paid);
      const data: BlackjackResult = { round: this.round, dealer: [...this.dealer], hands: s.hands.map((h) => ({ cards: [...h.cards], bet: h.bet, outcome: h.outcome!, paid: h.paid! })) };
      ctx.result(s.owner, `🃏 ${said.join(' · ')}`, paid - staked, data);
    }
  }

  private nextRound(ctx: CasinoContext) {
    this.phase = 'betting';
    this.deadline = undefined;
    this.dealer = [];
    this.revealed = false;
    this.seatList = this.seatList.map((s) => (!s || s.gone ? null : { ...s, hands: [] }));
    this.maybeCloseBetting(ctx);
  }

  /** Everyone seated has bet: the cards come in ALL_IN_MS. */
  private maybeCloseBetting(ctx: CasinoContext) {
    if (this.phase !== 'betting') return;
    const live = this.live();
    if (live.length && live.every((s) => s.bet > 0)) this.deadline = Math.min(this.deadline ?? Infinity, ctx.now() + ALL_IN_MS);
  }

  private draw(ctx: CasinoContext): Card {
    if (!this.shoe.length) {
      // Only a rigged shoe runs dry (a real one is reshuffled at the cut card long before).
      this.shoe = shuffle(newShoe(DECKS), (n) => ctx.random(n));
      this.cut = Math.round(this.shoe.length * (1 - PENETRATION));
    }
    return this.shoe.pop()!;
  }

  private legal(s: Seat, k: number, ctx: CasinoContext) {
    const h = s.hands[k];
    const total = handValue(h.cards).total;
    const two = h.cards.length === 2;
    const splitAces = h.split && rankOf(h.cards[0]) === 'A';
    const afford = ctx.chips(s.owner) >= h.bet;
    return {
      hit: !h.done && total < 21,
      stand: !h.done,
      double: !h.done && two && !splitAces && afford,
      split: !h.done && two && s.hands.length === 1 && rankOf(h.cards[0]) === rankOf(h.cards[1]) && afford,
    };
  }

  /** What the player whose turn it is may do now (worked out while the chips are at hand: views have no context). */
  private can: { hit: boolean; stand: boolean; double: boolean; split: boolean } | undefined;
  private refresh(ctx: CasinoContext) {
    const s = this.turn && this.phase === 'playing' ? this.seatList[this.turn.seat] : null;
    this.can = s && this.turn ? this.legal(s, this.turn.hand, ctx) : undefined;
  }

  private seatOf(owner: string) {
    return this.seatList.findIndex((s) => s?.owner === owner);
  }

  private live() {
    return this.seatList.filter((s): s is Seat => !!s && !s.gone);
  }

  // ---- What people see ----------------------------------------------------------------------------------

  view(forOwner: string | null): BlackjackView {
    const dealer: (Card | null)[] = this.dealer.map((c, i) => (i === 1 && !this.revealed ? null : c));
    const v: BlackjackView = {
      kind: 'blackjack',
      phase: this.phase,
      round: this.round,
      ...(this.deadline !== undefined ? { left: Math.max(0, this.deadline - this.clock) } : {}),
      dealer,
      seats: this.seatList.map((s) =>
        s
          ? {
              name: s.name,
              bet: s.bet,
              hands: s.hands.map((h) => ({ ...h, cards: [...h.cards] })),
              ...(s.gone ? { gone: true } : {}),
            }
          : null,
      ),
      ...(this.turn ? { turn: { ...this.turn } } : {}),
      seated: this.live().map((s) => s.name),
      shoe: this.rigged ? this.shoe.length : Math.max(0, this.shoe.length - this.cut),
    };
    const i = forOwner ? this.seatOf(forOwner) : -1;
    if (i >= 0) {
      const s = this.seatList[i]!;
      v.you = i;
      v.lastBet = s.lastBet;
      v.can = this.phase === 'playing' && this.turn?.seat === i && this.can ? { ...this.can } : { hit: false, stand: false, double: false, split: false };
    }
    return v;
  }
}

function outcomeText(o: HandOutcome, net: number): string {
  const n = net > 0 ? `+${net}` : `${net}`;
  switch (o) {
    case 'blackjack':
      return `Blackjack! ${n}`;
    case 'win':
      return `You win ${n}`;
    case 'push':
      return 'Push: your stake back';
    case 'bust':
      return `Bust ${n}`;
    default:
      return `Dealer wins ${n}`;
  }
}
