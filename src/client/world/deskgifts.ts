import type * as THREE from 'three';
import { DESKS, DESK_SIZE } from '../../shared/layout';
import { mergeByMaterial } from './toon';
import type { DeskView } from './types';

// flrnoh fork: the Christmas present on every desk (see holiday.ts), riding on its desk rather than
// standing where the bottom floor has it, since each storey lays its desks out its own way
// (shared/storey.ts). Each sits in the back corner the desk's own knick-knack leaves free (see buildDesk).

export interface DeskGifts {
  show(on: boolean): void;
}

/** A present from `make` (the `i`th desk's) on each of the room's desks in `desks`, hidden until shown. */
export function deskGifts(desks: Map<string, DeskView>, make: (i: number) => THREE.Object3D): DeskGifts {
  const gifts: THREE.Object3D[] = [];
  DESKS.forEach((d, i) => {
    const g = mergeByMaterial(make(i));
    g.position.set(i % 3 === 1 ? 0.78 : -0.78, DESK_SIZE.height, -0.28);
    g.rotation.y = 0.3;
    g.visible = false;
    desks.get(d.id)?.group.add(g);
    gifts.push(g);
  });
  return { show: (on) => gifts.forEach((g) => (g.visible = on)) };
}
