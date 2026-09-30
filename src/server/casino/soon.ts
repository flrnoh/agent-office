import type { CasinoKind } from '../../shared/casino.js';
import type { CasinoContext, CasinoGame, Seated } from './game.js';

/** A table that's set up but not dealing yet (phase 2 of the casino): you can sit at it, but it answers "Coming soon". */
export interface SoonView {
  kind: CasinoKind;
  soon: true;
  seated: string[];
}

export class ComingSoon implements CasinoGame {
  private seated = new Map<string, string>();

  constructor(
    readonly id: string,
    readonly kind: CasinoKind,
    readonly seats: number,
  ) {}

  sit(p: Seated, ctx: CasinoContext) {
    this.seated.set(p.owner, p.name);
    ctx.changed();
  }

  stand(owner: string, ctx: CasinoContext) {
    if (this.seated.delete(owner)) ctx.changed();
  }

  act(): string {
    return 'Coming soon: the dealer is still learning the rules';
  }

  tick() {}

  view(): SoonView {
    return { kind: this.kind, soon: true, seated: [...this.seated.values()] };
  }
}
