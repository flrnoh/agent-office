import { ROOF_SWIM } from '../../../shared/roofpool';
import type { PlayerController } from '../../player';
import { Swimmer } from '../../swim';

// In the pool on the roof yourself (flrnoh fork, see FORK.md "Pool party on the roof"): the one swim
// controller (client/swim/) with the roof pool's data (ROOF_SWIM). Jumping in is the roof's to see
// (it shares the deck with the slide and the diving tower, features/roofpool/index.ts), which then
// puts you in with `enter`; E at a wall climbs out onto the deck. Everyone else sees it from where you
// are (inPoolAt in shared/roofpool.ts).

export interface PoolHooks {
  stroke(at: { x: number; z: number }): void;
  out(): void;
}

const POOLS = [ROOF_SWIM] as const;

export class PoolSwim extends Swimmer {
  constructor(player: PlayerController, hooks: PoolHooks) {
    super(player, () => POOLS, { stroke: (x, z) => hooks.stroke({ x, z }), out: () => hooks.out() });
  }

  get active(): boolean {
    return this.swimming;
  }

  /** Into the water where you are, `jump` 0..1 how hard you went in. */
  enter(jump: number) {
    this.into(ROOF_SWIM, jump);
  }
}
