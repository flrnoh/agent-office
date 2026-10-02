import * as THREE from 'three';
import { KINO_SNACK_BY_ID, type KinoSnackId } from '../../../shared/kino-snacks';
import type { Drink } from '../../../shared/rooftop';
import { mesh, toon } from '../toon';

// What the cinema's counter hands you (flrnoh fork, see FORK.md "The cinema"), held like a glass from
// the bar: fridgeitems.ts hands these shapes over to here. Each stands on y = 0, sized like the bar's
// glasses (a pint is 0.15 tall), `S` times that.

const PAPER = '#fbfaf6';

export function kinoSnack(d: Drink, S = 1): THREE.Group {
  const g = new THREE.Group();
  const item = KINO_SNACK_BY_ID.get(d.id as KinoSnackId);
  const label = toon(item?.label ?? '#e63946');
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z = 0) => {
    const m = mesh(geo, mat, x * S, y * S, z * S, false);
    g.add(m);
    return m;
  };
  const cyl = (rTop: number, rBottom: number, h: number, mat: THREE.Material, y: number, segs = 12) => add(new THREE.CylinderGeometry(rTop * S, rBottom * S, h * S, segs), mat, 0, y);
  switch (d.glass) {
    case 'popcorn': {
      // A red-and-white striped bucket, heaped with popcorn.
      const segs = 12;
      for (let i = 0; i < segs; i++) {
        const a0 = (i / segs) * Math.PI * 2;
        const stripe = new THREE.CylinderGeometry(0.06 * S, 0.042 * S, 0.12 * S, 1, 1, true, a0, (Math.PI * 2) / segs);
        add(stripe, i % 2 ? label : toon(PAPER), 0, 0.06);
      }
      cyl(0.042, 0.042, 0.004, toon(PAPER), 0.002);
      const corn = toon(d.color);
      for (let i = 0; i < 16; i++) {
        const a = i * 2.39996;
        const r = 0.045 * Math.sqrt((i + 0.5) / 16);
        add(new THREE.IcosahedronGeometry(0.014 * S, 0), corn, Math.cos(a) * r, 0.122 + (16 - i) * 0.0016 + (i % 3) * 0.004, Math.sin(a) * r);
      }
      break;
    }
    case 'nachos': {
      // A black tray, chips fanned round a cup of cheese dip.
      add(new THREE.BoxGeometry(0.13 * S, 0.02 * S, 0.1 * S), toon('#222222'), 0, 0.01);
      cyl(0.022, 0.02, 0.026, toon(PAPER), 0.033, 10);
      cyl(0.02, 0.02, 0.004, toon('#ffb703'), 0.047, 10);
      const chip = toon(d.color);
      for (let i = 0; i < 9; i++) {
        const tri = new THREE.CylinderGeometry(0.026 * S, 0.026 * S, 0.003 * S, 3);
        const m = add(tri, chip, -0.035 + (i % 3) * 0.022, 0.026 + Math.floor(i / 3) * 0.004, -0.025 + Math.floor(i / 3) * 0.022);
        m.rotation.set(0.4 * ((i % 2) - 0.5), i * 0.9, 0.3 * ((i % 3) - 1));
      }
      break;
    }
    default: {
      // A big paper cup with the cinema's red band, a lid and a straw.
      cyl(0.042, 0.032, 0.17, toon(PAPER), 0.085, 14);
      cyl(0.0425, 0.036, 0.06, label, 0.11, 14);
      cyl(0.045, 0.045, 0.01, toon('#f1f1f1'), 0.175, 14);
      const straw = add(new THREE.CylinderGeometry(0.004 * S, 0.004 * S, 0.1 * S, 6), toon('#ffffff'), 0.01, 0.22);
      straw.rotation.z = -0.15;
    }
  }
  return g;
}
