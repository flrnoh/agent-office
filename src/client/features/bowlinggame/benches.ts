import * as THREE from 'three';
import { BENCH_SEATS } from '../../../shared/bowling-game';
import type { SeatPlace } from '../../../shared/layout';
import type { Person } from '../../world/character';
import type { Interactable } from '../../world/types';

/*
 * The curved benches behind the consoles (flrnoh fork, see FORK.md "Bowling lanes"): E sits you down
 * on one of their places, like the lounge's sofas (client/bowling/place.ts): nobody tells the office,
 * everyone sees whoever's standing still on a bench's place sitting on it.
 */

/** How close to a place someone must stand still to be sitting on it, and how high the seat is. */
const ON_SEAT = 0.25;
export const BENCH_HIPS = 0.44;

export const benchPlace = (key: string): SeatPlace | null => {
  const s = BENCH_SEATS.find((b) => b.key === key);
  return s ? { key, seatId: key, x: s.x, y: 0, z: s.z, rotY: s.rotY, hips: BENCH_HIPS, out: 0.6 } : null;
};

/** The benches' places, for E: each with a box you can't see over it for the crosshair to land on (see input/pointer.ts). */
export function benchInteractables(parent: THREE.Object3D): Interactable[] {
  const geo = new THREE.BoxGeometry(0.4, 0.5, 0.4);
  const mat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  mat.userData.outlineParameters = { visible: false };
  return BENCH_SEATS.map((s) => {
    const it: Interactable = { kind: 'bowlbench', x: s.x, z: s.z, radius: 0.42, seatId: s.key };
    const pick = new THREE.Mesh(geo, mat);
    pick.position.set(s.x, 0.6, s.z);
    pick.userData.interact = it;
    parent.add(pick);
    return it;
  });
}

export interface Someone {
  id: string;
  x: number;
  y: number;
  z: number;
  moving: boolean;
  person: Person | undefined;
}

/** The place `who` stands still on, if any. */
export const placeUnder = (who: { x: number; z: number; y: number; moving: boolean }) =>
  who.moving || Math.abs(who.y) > 0.6 ? undefined : BENCH_SEATS.find((s) => Math.abs(s.x - who.x) < ON_SEAT && Math.abs(s.z - who.z) < ON_SEAT);

/** Everyone else standing still on a bench sits down on it, and gets up once they're off it. */
export class BenchSitters {
  private sitting = new Map<string, Person>();

  update(others: Someone[]) {
    const seen = new Set<string>();
    for (const p of others) {
      if (!p.person) continue;
      const s = placeUnder(p);
      if (!s) continue;
      seen.add(p.id);
      p.person.sit(BENCH_HIPS);
      p.person.root.rotation.y = s.rotY;
      this.sitting.set(p.id, p.person);
    }
    for (const [id, person] of this.sitting) {
      if (seen.has(id)) continue;
      person.sit(null);
      this.sitting.delete(id);
    }
  }

  clear() {
    for (const person of this.sitting.values()) person.sit(null);
    this.sitting.clear();
  }
}
