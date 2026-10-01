import { SMOOTHIE_BY_ID, type JuiceBarView } from '../../shared/gym.js';
import type { GymContext, GymGame, Seated } from './game.js';

/*
 * The juice bar (flrnoh fork, see shared/gym.ts): the gym's version of the casino's cashier, but a
 * place to sit. Pull up a stool to see your fitness at a glance and the building's leaderboard, and
 * order a smoothie (`order`, data: {smoothie}) for a quick energy top-up. Nothing costs anything.
 */
export class JuiceBar implements GymGame {
  readonly kind = 'juicebar' as const;
  private occ = new Map<string, string>();

  constructor(
    readonly id: string,
    readonly seats: number,
  ) {}

  sit(p: Seated, ctx: GymContext) {
    this.occ.set(p.owner, p.name);
    ctx.changed();
  }

  stand(owner: string, ctx: GymContext) {
    if (!this.occ.delete(owner)) return;
    ctx.changed();
  }

  act(p: Seated, action: string, data: unknown, ctx: GymContext): string | void {
    if (!this.occ.has(p.owner)) return 'Take a stool first';
    if (action !== 'order') return 'Order a smoothie';
    const id = (data as { smoothie?: unknown })?.smoothie;
    const smoothie = typeof id === 'string' ? SMOOTHIE_BY_ID.get(id) : undefined;
    if (!smoothie) return 'No such smoothie';
    ctx.addStamina(p.owner, smoothie.energy);
    ctx.result(p.owner, `${smoothie.icon} ${smoothie.name} · +${smoothie.energy} energy`, undefined, { smoothie: smoothie.id });
  }

  tick() {}

  view(forOwner: string | null): JuiceBarView {
    return {
      kind: 'juicebar',
      occupants: [...this.occ.values()],
      seats: this.seats,
      board: forOwner ? this.boardFor(forOwner) : [],
    };
  }

  /** The leaderboard, with `forOwner` flagged; the gym binds this on view via a shim (see index.ts). */
  boardFor: (owner: string) => JuiceBarView['board'] = () => [];
}
