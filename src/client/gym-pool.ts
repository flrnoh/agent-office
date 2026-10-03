import { LAP_SWIM } from '../shared/gym-basement';
import type { PlayerController } from './player';
import { Swimmer } from './swim';

/*
 * Swimming in the gym's lap pool yourself (flrnoh fork, see shared/gym-basement.ts): the one swim
 * controller (client/swim/) with the lap pool's data (LAP_SWIM): jump in off the deck or a starting
 * block (or E at the water for a header), E at a wall to climb out (never onto a block), wall to wall
 * a timed length lane by lane, your best kept in this browser. Everyone else in the pool is posed
 * swimming, from where they are.
 */

export interface PoolHooks {
  splash(x: number, z: number, strength: number): void;
  stroke(x: number, z: number): void;
  out(): void;
  /** A length done: what to say. */
  lap(text: string): void;
}

const POOLS = [LAP_SWIM] as const;

export class GymPool extends Swimmer {
  constructor(player: PlayerController, hooks: PoolHooks) {
    super(player, () => POOLS, hooks);
  }
}
