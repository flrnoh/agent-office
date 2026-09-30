import type { CasinoKind } from '../../shared/casino.js';
import { REEL_STOPS, SLOT_EMOJI, SPIN_MS, isSlotBet, slotLine, slotPays, type SlotsResult, type SlotsView } from '../../shared/casino-slots.js';
import type { CasinoContext, CasinoGame, Seated } from './game.js';

/*
 * A slot machine (flrnoh fork, see shared/casino-slots.ts): the casino's reference game. Whoever
 * stands at it spins (`spin`, data: the stake, one of SLOT_BETS); the office draws the three stops,
 * takes the stake, pays the line, and everyone sees the reels turn for SPIN_MS and stop there.
 */
export class SlotMachine implements CasinoGame {
  readonly kind: CasinoKind = 'slots';
  readonly seats = 1;
  private player: Seated | null = null;
  private s: SlotsView = { kind: 'slots', stops: [0, 0, 0], spin: 0, spinning: false };

  constructor(readonly id: string) {
    // Every machine starts on a different line.
    const n = Number(id.replace(/\D/g, '')) || 0;
    this.s.stops = [(n * 7) % REEL_STOPS, (n * 11 + 3) % REEL_STOPS, (n * 5 + 9) % REEL_STOPS];
  }

  sit(p: Seated, ctx: CasinoContext) {
    this.player = p;
    this.s.player = p.name;
    ctx.changed();
  }

  stand(owner: string, ctx: CasinoContext) {
    if (this.player?.owner !== owner) return;
    // A spin that's turning still lands (it's paid already): the machine just has nobody at it.
    this.player = null;
    delete this.s.player;
    ctx.changed();
  }

  act(p: Seated, action: string, data: unknown, ctx: CasinoContext): string | void {
    if (action !== 'spin') return 'The machine only spins';
    if (this.player?.owner !== p.owner) return 'Step up to the machine first';
    if (this.s.spinning) return 'The reels are still turning';
    if (!isSlotBet(data)) return 'Pick a stake: 1, 5, 10 or 25 chips';
    const err = ctx.stake(p.owner, data);
    if (err) return err;
    const stops = [ctx.random(REEL_STOPS), ctx.random(REEL_STOPS), ctx.random(REEL_STOPS)];
    const line = slotLine(stops);
    const won = slotPays(line) * data;
    if (won) ctx.pay(p.owner, won);
    const now = ctx.now();
    this.s = { kind: 'slots', stops, spin: this.s.spin + 1, spinning: true, until: now + SPIN_MS, player: p.name, bet: data, won };
    const result: SlotsResult = { stops, spin: this.s.spin, bet: data, won };
    const shown = line.map((s) => SLOT_EMOJI[s]).join(' ');
    ctx.result(p.owner, won ? `${shown} · you win ${won} chips!` : `${shown} · no luck`, won - data, result);
    ctx.changed();
  }

  tick(now: number, ctx: CasinoContext) {
    if (!this.s.spinning || now < (this.s.until ?? 0)) return;
    this.s.spinning = false;
    delete this.s.until;
    ctx.changed();
  }

  view(): SlotsView {
    return { ...this.s, stops: [...this.s.stops] };
  }
}
