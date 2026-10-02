import * as THREE from 'three';
import { FOOD_GLASSES, iceScoops, type FoodGlass } from '../../shared/shopwares-food';
import { SHOP_ITEM_BY_ID, type ShopItemId } from '../../shared/shopwares';
import type { Drink } from '../../shared/rooftop';
import { mesh, toon } from './toon';

// What the ice cream parlour, the sushi bar and the butcher's hand you (flrnoh fork, see FORK.md
// "Shops to walk into", food round 2), held like everything from the shops: shopitems.ts hands their
// shapes over to here. Sized like the bar's glasses (a pint is 0.15 tall), standing on y = 0 in your fist.

export const isFoodGlass = (g: string): g is FoodGlass => (FOOD_GLASSES as readonly string[]).includes(g);

const SEMMEL = '#d9a35b';

/** A cone of two or three scoops, a cup, a Spaghettieis, a plate of sushi with chopsticks, a Leberkässemmel…, `S` times its size. */
export function foodItem(d: Drink, S = 1): THREE.Group {
  const g = new THREE.Group();
  const item = SHOP_ITEM_BY_ID.get(d.id as ShopItemId);
  const body = toon(d.color);
  const label = toon(item?.label ?? '#ffffff');
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z = 0) => {
    const m = mesh(geo, mat, x * S, y * S, z * S, false);
    g.add(m);
    return m;
  };
  const box = (w: number, h: number, dd: number, mat: THREE.Material, x: number, y: number, z = 0) => add(new THREE.BoxGeometry(w * S, h * S, dd * S), mat, x, y, z);
  const cyl = (rTop: number, rBottom: number, h: number, mat: THREE.Material, y: number, segs = 12, x = 0, z = 0) => add(new THREE.CylinderGeometry(rTop * S, rBottom * S, h * S, segs), mat, x, y, z);
  const ball = (r: number, mat: THREE.Material, x: number, y: number, z = 0) => add(new THREE.SphereGeometry(r * S, 12, 9), mat, x, y, z);
  const scoops = (colors: string[], y0: number) =>
    colors.forEach((c, i) => {
      // Two side by side, a third on top: the way a parlour stacks them.
      const top = colors.length === 3 && i === 2;
      ball(0.034, toon(c), top ? 0 : colors.length === 1 ? 0 : i === 0 ? -0.022 : 0.022, y0 + (top ? 0.045 : 0), top ? 0 : (i % 2) * 0.006);
    });
  switch (d.glass as FoodGlass) {
    case 'scoopcone': {
      const cone = add(new THREE.ConeGeometry(0.035 * S, 0.12 * S, 12), label, 0, 0.06);
      cone.rotation.z = Math.PI;
      scoops(iceScoops(d.id) ?? [d.color, d.color], 0.13);
      // A wafer stuck in the top.
      box(0.012, 0.05, 0.03, toon('#e9c46a'), 0.03, 0.17).rotation.z = -0.4;
      break;
    }
    case 'scoopcup': {
      cyl(0.055, 0.04, 0.05, label, 0.025, 16);
      scoops(iceScoops(d.id) ?? [d.color, d.color], 0.065);
      // A little plastic spoon and a wafer.
      box(0.008, 0.08, 0.004, toon('#ffffff'), -0.035, 0.1).rotation.z = 0.35;
      box(0.012, 0.05, 0.03, toon('#e9c46a'), 0.035, 0.11).rotation.z = -0.4;
      break;
    }
    case 'spaghettieis': {
      // A glass bowl: vanilla spaghetti, strawberry sauce over it, white chocolate flakes.
      cyl(0.075, 0.05, 0.035, toon('#d7f0fa'), 0.02, 16);
      cyl(0.015, 0.02, 0.02, toon('#d7f0fa'), 0.0, 10);
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const strand = add(new THREE.TorusGeometry(0.03 * S, 0.006 * S, 5, 10, Math.PI), body, Math.cos(a) * 0.02, 0.045, Math.sin(a) * 0.02);
        strand.rotation.set(Math.PI / 2, 0, a);
      }
      const sauce = ball(0.04, label, 0, 0.05);
      sauce.scale.set(1, 0.3, 1);
      for (let i = 0; i < 6; i++) box(0.01, 0.003, 0.01, toon('#fffaf0'), Math.cos(i * 1.1) * 0.025, 0.065, Math.sin(i * 1.1) * 0.025);
      break;
    }
    case 'eiskaffee': {
      // A tall glass: coffee, a scoop sinking, cream on top, a straw and a long spoon.
      const glass = new THREE.MeshToonMaterial({ color: '#d7f0fa', transparent: true, opacity: 0.45, gradientMap: (toon('#fff') as THREE.MeshToonMaterial).gradientMap });
      cyl(0.035, 0.03, 0.15, glass, 0.075, 14);
      cyl(0.031, 0.027, 0.11, body, 0.055, 14);
      ball(0.024, toon('#fff3c4'), 0, 0.11);
      const cream = ball(0.034, label, 0, 0.155);
      cream.scale.set(1, 0.7, 1);
      cyl(0.004, 0.004, 0.12, toon('#e63946'), 0.17, 6, 0.015).rotation.z = -0.2;
      break;
    }
    case 'sushiplate': {
      // A small plate with its colored rim, two pieces on it, chopsticks across.
      cyl(0.065, 0.055, 0.012, toon('#fbfaf6'), 0.006, 20);
      const rim = add(new THREE.TorusGeometry(0.06 * S, 0.006 * S, 6, 24), label, 0, 0.013);
      rim.rotation.x = Math.PI / 2;
      for (const x of [-0.022, 0.022]) {
        if (d.id === 'sushimaki' || d.id === 'sushitamago') {
          cyl(0.016, 0.016, 0.022, toon(d.id === 'sushimaki' ? '#1b4332' : d.color), 0.025, 12, x);
          if (d.id === 'sushimaki') cyl(0.012, 0.012, 0.023, toon('#ffffff'), 0.025, 10, x);
          continue;
        }
        box(0.03, 0.016, 0.018, toon('#fbfaf6'), x, 0.02);
        const top = box(0.034, 0.008, 0.021, body, x, 0.032);
        if (d.id === 'sushiinari') top.scale.y = 3;
      }
      for (const z of [0.03, 0.038]) box(0.14, 0.004, 0.004, toon('#b08968'), 0.01, 0.045, z).rotation.y = -0.15;
      break;
    }
    case 'greentea':
      cyl(0.03, 0.025, 0.045, toon('#dad7cd'), 0.022, 14);
      cyl(0.027, 0.027, 0.003, body, 0.044, 14);
      break;
    case 'leberkaessemmel': {
      // A Semmel cut open, a thick slice of Leberkäs hanging out, mustard.
      const lower = ball(0.048, toon(SEMMEL), 0, 0.02);
      lower.scale.set(1, 0.45, 1);
      box(0.085, 0.022, 0.07, body, 0.01, 0.038);
      box(0.06, 0.004, 0.05, label, 0.01, 0.05);
      const upper = ball(0.048, toon(SEMMEL), 0, 0.058);
      upper.scale.set(1, 0.5, 1);
      break;
    }
    case 'wienerpaar': {
      // A paper plate, a pair of Wiener, a blob of mustard and a roll beside.
      cyl(0.07, 0.065, 0.006, toon('#fbfaf6'), 0.003, 18);
      for (const z of [-0.012, 0.012]) {
        const w = add(new THREE.CapsuleGeometry(0.011 * S, 0.1 * S, 4, 8), body, 0, 0.018, z);
        w.rotation.z = Math.PI / 2;
      }
      ball(0.012, label, 0.045, 0.012, 0.035);
      const roll = ball(0.022, toon(SEMMEL), -0.04, 0.02, 0.04);
      roll.scale.set(1, 0.7, 1);
      break;
    }
    case 'pflanzerl': {
      const lower = ball(0.048, toon(SEMMEL), 0, 0.02);
      lower.scale.set(1, 0.45, 1);
      cyl(0.045, 0.045, 0.022, body, 0.04, 14);
      const upper = ball(0.048, toon(SEMMEL), 0, 0.062);
      upper.scale.set(1, 0.5, 1);
      break;
    }
    case 'wurstsemmel': {
      const lower = ball(0.048, toon(SEMMEL), 0, 0.02);
      lower.scale.set(1, 0.45, 1);
      for (let i = 0; i < 2; i++) cyl(0.05, 0.05, 0.005, body, 0.036 + i * 0.006, 16, i * 0.008);
      const upper = ball(0.048, toon(SEMMEL), 0, 0.058);
      upper.scale.set(1, 0.5, 1);
      break;
    }
  }
  return g;
}
