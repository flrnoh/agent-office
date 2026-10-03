import type * as THREE from 'three';
import { basementRoomAt, type BasementRoom, type ShowerKind } from '../../../../shared/gym-basement';
import type { GymParts } from '../kit';
import { buildPoolHall } from './hall';
import { buildRooms } from './rooms';
import { buildShell } from './shell';

/*
 * The gym's basement (flrnoh fork, see shared/gym-basement.ts and FORK.md "The gym's basement"): built
 * with the rest of the gym's inside the first time anyone goes in (world/gym/interior.ts). Its shell
 * and stair (shell.ts), the rooms off the foyer (rooms.ts) and the pool hall (hall.ts). Swimming in the
 * lap pool is the page's (client/gym-pool.ts).
 */

export interface GymBasement {
  /** The lap pool's water (what you look at to jump in). */
  surface: THREE.Mesh;
  setStation(id: string, state: unknown): void;
  /** Every frame: who's down here (feet's height included), so showers run and the whirlpool bubbles. Says which showers are running. */
  update(t: number, dt: number, people: readonly { x: number; y: number; z: number }[]): ShowerKind[];
  /** The room or pool down here at x, z, if any (for the page's hint and ambience). */
  roomAt(x: number, z: number): BasementRoom | undefined;
}

export function buildGymBasement(p: GymParts): GymBasement {
  buildShell(p);
  const rooms = buildRooms(p);
  const hall = buildPoolHall(p);
  return {
    surface: hall.surface,
    setStation: (id, state) => rooms.setStation(id, state),
    update(t, dt, people) {
      hall.update(t, dt, people);
      return rooms.update(t, dt, people);
    },
    roomAt: (x, z) => basementRoomAt(x, z),
  };
}
