import * as THREE from 'three';
import { CAFE_BY_ID, type CafeItemId } from '../../../shared/cafe';
import type { Drink } from '../../../shared/rooftop';
import { mesh, toon } from '../toon';

// What the padel hall's café hands you (flrnoh fork, see FORK.md "The padel hall"), held like a glass
// from the bar: fridgeitems.ts hands the café's shapes over to here. Each is a handful of simple
// shapes standing on y = 0, sized like the bar's glasses (a pint is 0.15 tall).

const GLASS = new THREE.MeshToonMaterial({ color: '#dff3ff', transparent: true, opacity: 0.42 });
const CHINA = '#fbfaf6';
const PLATE = '#f2efe8';

/** A cup, a glass or a plate with a slice on it, `S` times its size. */
export function cafeItem(d: Drink, S = 1): THREE.Group {
  const g = new THREE.Group();
  const item = CAFE_BY_ID.get(d.id as CafeItemId);
  const body = toon(d.color);
  const label = toon(item?.label ?? '#ffffff');
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z = 0) => {
    const m = mesh(geo, mat, x * S, y * S, z * S, false);
    g.add(m);
    return m;
  };
  const cyl = (rTop: number, rBottom: number, h: number, mat: THREE.Material, y: number, segs = 14, x = 0) =>
    add(new THREE.CylinderGeometry(rTop * S, rBottom * S, h * S, segs), mat, x, y);
  const handle = (r: number, y: number, x: number) => {
    const t = add(new THREE.TorusGeometry(r * S, 0.005 * S, 6, 12, Math.PI * 1.2), toon(CHINA), x, y);
    t.rotation.z = -Math.PI * 0.6;
  };
  switch (d.glass) {
    case 'cappuccino':
      // A wide cup on its saucer, foam heaped up, cocoa dusted on it.
      cyl(0.055, 0.055, 0.006, toon(CHINA), 0.003, 18);
      cyl(0.042, 0.03, 0.055, toon(CHINA), 0.034);
      cyl(0.04, 0.04, 0.008, label, 0.06);
      cyl(0.02, 0.02, 0.002, body, 0.065, 10);
      handle(0.014, 0.036, 0.046);
      break;
    case 'espresso':
      cyl(0.04, 0.04, 0.005, toon(CHINA), 0.0025, 16);
      cyl(0.024, 0.018, 0.035, toon(CHINA), 0.022);
      cyl(0.022, 0.022, 0.004, toon('#b07a47'), 0.037, 12);
      handle(0.009, 0.024, 0.028);
      break;
    case 'mug':
      cyl(0.034, 0.03, 0.09, toon('#e9dcc8'), 0.045);
      cyl(0.0345, 0.0345, 0.018, label, 0.05);
      cyl(0.031, 0.031, 0.004, body, 0.088);
      handle(0.02, 0.05, 0.04);
      break;
    case 'latte':
      // A tall glass: milk at the bottom, the shot in the middle, foam on top, a long spoon.
      cyl(0.03, 0.026, 0.15, GLASS, 0.075);
      cyl(0.027, 0.024, 0.06, toon('#f4ede1'), 0.032);
      cyl(0.027, 0.027, 0.04, body, 0.082);
      cyl(0.027, 0.027, 0.035, label, 0.12);
      add(new THREE.CylinderGeometry(0.0025 * S, 0.0025 * S, 0.2 * S, 6), toon('#c0c4cc'), 0.01, 0.12).rotation.z = -0.1;
      break;
    case 'iced': {
      // A clear plastic cup with a domed lid and a straw, ice in the coffee.
      cyl(0.036, 0.028, 0.13, GLASS, 0.065);
      cyl(0.033, 0.026, 0.1, body, 0.052);
      const lid = add(new THREE.SphereGeometry(0.037 * S, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), GLASS, 0, 0.13);
      lid.scale.y = 0.45;
      for (const [x, y] of [
        [-0.01, 0.1],
        [0.012, 0.085],
      ]) {
        const cube = add(new THREE.BoxGeometry(0.018 * S, 0.018 * S, 0.018 * S), toon('#f4fbff'), x, y, 0.004);
        cube.rotation.set(0.4, 0.6, 0.2);
      }
      add(new THREE.CylinderGeometry(0.004 * S, 0.004 * S, 0.2 * S, 6), toon('#1b998b'), 0.008, 0.15).rotation.z = -0.15;
      break;
    }
    case 'schorle':
      // A tall glass of cloudy gold with a slice of apple on the rim.
      cyl(0.032, 0.028, 0.15, GLASS, 0.075);
      cyl(0.029, 0.025, 0.12, body, 0.062);
      cyl(0.029, 0.029, 0.008, label, 0.126);
      add(new THREE.CylinderGeometry(0.018 * S, 0.018 * S, 0.006 * S, 10, 1, false, 0, Math.PI), toon('#8ac926'), 0.026, 0.15);
      break;
    case 'sport': {
      // A squeeze bottle, its pop-up cap and a stripe.
      cyl(0.03, 0.03, 0.14, body, 0.07);
      cyl(0.031, 0.031, 0.03, label, 0.08);
      cyl(0.016, 0.03, 0.02, toon('#f1faee'), 0.15);
      cyl(0.006, 0.008, 0.02, toon('#f1faee'), 0.17, 8);
      break;
    }
    case 'weizen': {
      // The tall, curvy wheat beer glass, cloudy gold under a thick white head.
      const pts = [
        [0.02, 0],
        [0.024, 0.02],
        [0.022, 0.07],
        [0.028, 0.13],
        [0.034, 0.17],
        [0.033, 0.2],
      ].map(([r, y]) => new THREE.Vector2(r * S, y * S));
      g.add(mesh(new THREE.LatheGeometry(pts, 16), GLASS, 0, 0, 0, false));
      const beer = pts.slice(0, 5).map((p) => new THREE.Vector2(p.x * 0.9, p.y));
      g.add(mesh(new THREE.LatheGeometry(beer, 16), body, 0, 0.004 * S, 0, false));
      cyl(0.031, 0.031, 0.03, label, 0.183);
      break;
    }
    case 'cake':
    case 'strudel':
    case 'loaf': {
      // A slice on a little plate, with a fork.
      cyl(0.06, 0.055, 0.008, toon(PLATE), 0.004, 18);
      if (d.glass === 'cake') {
        // A wedge of cheesecake: pale, tall, a golden top and a crust.
        const wedge = add(new THREE.CylinderGeometry(0.05 * S, 0.05 * S, 0.045 * S, 12, 1, false, 0, Math.PI / 3), body, -0.02, 0.034, -0.02);
        wedge.rotation.y = 0.6;
        const crust = add(new THREE.CylinderGeometry(0.05 * S, 0.05 * S, 0.008 * S, 12, 1, false, 0, Math.PI / 3), toon('#a8743a'), -0.02, 0.012, -0.02);
        crust.rotation.y = 0.6;
        const top = add(new THREE.CylinderGeometry(0.05 * S, 0.05 * S, 0.004 * S, 12, 1, false, 0, Math.PI / 3), label, -0.02, 0.058, -0.02);
        top.rotation.y = 0.6;
      } else if (d.glass === 'strudel') {
        // A rolled slice, flaky pastry round apple, sugar on top.
        const roll = add(new THREE.CylinderGeometry(0.028 * S, 0.028 * S, 0.06 * S, 14), body, 0, 0.036);
        roll.rotation.z = Math.PI / 2;
        const face = add(new THREE.CylinderGeometry(0.022 * S, 0.022 * S, 0.062 * S, 14), toon('#e9c46a'), 0, 0.036);
        face.rotation.z = Math.PI / 2;
        add(new THREE.BoxGeometry(0.05 * S, 0.004 * S, 0.02 * S), label, 0, 0.064);
      } else {
        // A thick slice of banana bread, a banana coin on top.
        add(new THREE.BoxGeometry(0.07 * S, 0.05 * S, 0.022 * S), body, 0, 0.034);
        add(new THREE.BoxGeometry(0.066 * S, 0.046 * S, 0.023 * S), toon('#c8955a'), 0, 0.034);
        add(new THREE.CylinderGeometry(0.012 * S, 0.012 * S, 0.006 * S, 10), label, 0.01, 0.062);
      }
      add(new THREE.BoxGeometry(0.006 * S, 0.003 * S, 0.07 * S), toon('#c0c4cc'), 0.045, 0.01);
      break;
    }
  }
  return g;
}
