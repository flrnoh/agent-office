import * as THREE from 'three';
import { FRIDGE_BY_ID, type FridgeItemId } from '../../shared/fridge';
import type { Drink } from '../../shared/rooftop';
import { mesh, toon } from './toon';
import { cafeItem } from './hall/cafeitems'; // fork: the padel hall's café
import { kioskItem } from './kioskitems'; // fork: the beach kiosk
import { isKioskGlass } from '../../shared/kiosk';
import { isShopGlass } from '../../shared/shopwares'; // fork: the city's shops
import { shopItem } from './shopitems';

// What comes out of the kitchen fridge (flrnoh fork, see FORK.md), held like a glass from the bar:
// character.ts's drinkGlass hands anything that isn't one of the bar's glasses over to here. Each is
// a handful of simple shapes standing on y = 0, sized like the bar's glasses (a pint is 0.15 tall).

const CAP = '#c9a227';
const TIN = '#c0c4cc';

/** A bottle, a can or a snack from the fridge, `S` times its size. */
export function fridgeItem(d: Drink, S = 1): THREE.Group {
  const g = new THREE.Group();
  const item = FRIDGE_BY_ID.get(d.id as FridgeItemId);
  const label = toon(item?.label ?? '#ffffff');
  const body = toon(d.color);
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z = 0) => {
    const m = mesh(geo, mat, x * S, y * S, z * S, false);
    g.add(m);
    return m;
  };
  const cyl = (rTop: number, rBottom: number, h: number, mat: THREE.Material, y: number, segs = 14) =>
    add(new THREE.CylinderGeometry(rTop * S, rBottom * S, h * S, segs), mat, 0, y);
  switch (d.glass) {
    case 'bottle':
      // A half-litre: body, shoulders, a long neck and a crown cap, with a paper label round the middle.
      cyl(0.03, 0.03, 0.12, body, 0.06);
      cyl(0.0305, 0.0305, 0.055, label, 0.06);
      cyl(0.012, 0.03, 0.04, body, 0.14);
      cyl(0.012, 0.012, 0.045, body, 0.182);
      cyl(0.0135, 0.0135, 0.009, toon(CAP), 0.207, 10);
      break;
    case 'can':
      cyl(0.029, 0.029, 0.11, body, 0.058);
      cyl(0.0295, 0.0295, 0.03, label, 0.07);
      cyl(0.025, 0.029, 0.008, toon(TIN), 0.117);
      cyl(0.026, 0.029, 0.006, toon(TIN), 0.003);
      // The ring pull, popped.
      add(new THREE.BoxGeometry(0.012 * S, 0.003 * S, 0.018 * S), toon(TIN), 0.006, 0.123);
      break;
    case 'pretzel': {
      // The loop, and the two arms knotted across it, dusted with salt.
      const loop = add(new THREE.TorusGeometry(0.045 * S, 0.012 * S, 8, 20), body, 0, 0.07);
      loop.scale.set(1.15, 1, 1);
      for (const s of [-1, 1]) {
        const arm = add(new THREE.CylinderGeometry(0.009 * S, 0.009 * S, 0.1 * S, 8), body, 0.012 * s, 0.07, 0.006);
        arm.rotation.z = 0.75 * s;
      }
      for (const [x, y] of [
        [-0.04, 0.1],
        [0.03, 0.108],
        [0.05, 0.06],
        [-0.02, 0.03],
        [0.0, 0.07],
      ])
        add(new THREE.BoxGeometry(0.006 * S, 0.006 * S, 0.006 * S), label, x, y, 0.012);
      break;
    }
    case 'crisps': {
      // A pillowy bag, a print on the front, crimped shut at the top and the bottom.
      const bag = add(new THREE.SphereGeometry(0.05 * S, 12, 10), body, 0, 0.065);
      bag.scale.set(1, 1.3, 0.45);
      add(new THREE.CylinderGeometry(0.022 * S, 0.022 * S, 0.004 * S, 12), label, 0, 0.07, 0.022).rotation.x = Math.PI / 2;
      add(new THREE.BoxGeometry(0.075 * S, 0.012 * S, 0.012 * S), toon(TIN), 0, 0.128);
      add(new THREE.BoxGeometry(0.075 * S, 0.012 * S, 0.012 * S), toon(TIN), 0, 0.004);
      break;
    }
    case 'chocolate':
      // In its wrapper, peeled back at the top: foil, then the chocolate.
      add(new THREE.BoxGeometry(0.05 * S, 0.09 * S, 0.012 * S), label, 0, 0.045);
      add(new THREE.BoxGeometry(0.051 * S, 0.012 * S, 0.013 * S), toon(TIN), 0, 0.094);
      add(new THREE.BoxGeometry(0.046 * S, 0.028 * S, 0.01 * S), body, 0, 0.112);
      break;
    case 'apple': {
      const apple = add(new THREE.SphereGeometry(0.036 * S, 14, 10), body, 0, 0.036);
      apple.scale.set(1, 0.92, 1);
      add(new THREE.CylinderGeometry(0.003 * S, 0.003 * S, 0.02 * S, 6), toon('#6b4226'), 0, 0.076);
      const leaf = add(new THREE.SphereGeometry(0.01 * S, 8, 6), label, 0.01, 0.078);
      leaf.scale.set(1.4, 0.35, 0.8);
      break;
    }
    case 'sandwich': {
      // A crusty Semmel, and a thick slice of Leberkäs with mustard sticking out of it.
      const top = add(new THREE.SphereGeometry(0.045 * S, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), toon('#d9a05b'), 0, 0.034);
      top.scale.set(1, 0.7, 1);
      cyl(0.049, 0.049, 0.016, body, 0.025, 16);
      cyl(0.047, 0.047, 0.004, toon('#c8a13a'), 0.034, 16);
      const bottom = add(new THREE.SphereGeometry(0.045 * S, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), toon('#d9a05b'), 0, 0.017);
      bottom.scale.set(1, 0.35, 1);
      break;
    }
    default:
      // A cup, a glass or a slice of cake from the padel hall's café; or (fork) something from the beach kiosk.
      g.add(isShopGlass(d.glass) ? shopItem(d, S) : isKioskGlass(d.glass) ? kioskItem(d, S) : cafeItem(d, S)); // the shops': fork
  }
  return g;
}
