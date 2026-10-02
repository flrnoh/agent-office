import * as THREE from 'three';
import { TANK_BY_ID, type TankItemId } from '../../../shared/tankshop';
import type { Drink } from '../../../shared/rooftop';
import { mesh, toon } from '../toon';

// What the petrol station's shop hands you (flrnoh fork, see FORK.md "The petrol station"), held like
// a glass from the bar: fridgeitems.ts hands the shop's shapes over to here. Each is a handful of
// simple shapes standing on y = 0, sized like the bar's glasses (a pint is 0.15 tall).

const PAPER = '#fbfaf6';

/** A coffee to go, a chocolate bar, a bag of crisps, a tall can, a Bockwurst or the paper, `S` times its size. */
export function tankItem(d: Drink, S = 1): THREE.Group {
  const g = new THREE.Group();
  const item = TANK_BY_ID.get(d.id as TankItemId);
  const body = toon(d.color);
  const label = toon(item?.label ?? '#ffffff');
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z = 0) => {
    const m = mesh(geo, mat, x * S, y * S, z * S, false);
    g.add(m);
    return m;
  };
  const cyl = (rTop: number, rBottom: number, h: number, mat: THREE.Material, y: number, segs = 14) => add(new THREE.CylinderGeometry(rTop * S, rBottom * S, h * S, segs), mat, 0, y);
  const cube = (w: number, h: number, dd: number, mat: THREE.Material, x: number, y: number, z = 0) => add(new THREE.BoxGeometry(w * S, h * S, dd * S), mat, x, y, z);
  switch (d.glass) {
    case 'togo':
      // A paper cup, a cardboard sleeve in the station's teal, a domed lid with a sip hole.
      cyl(0.036, 0.027, 0.11, toon(PAPER), 0.055);
      cyl(0.0345, 0.031, 0.04, label, 0.055);
      cyl(0.038, 0.038, 0.012, toon('#f1f1f1'), 0.114);
      cyl(0.03, 0.036, 0.01, toon('#e5e5e5'), 0.124);
      add(new THREE.BoxGeometry(0.012 * S, 0.004 * S, 0.006 * S), toon('#3b2314'), 0.018, 0.13);
      break;
    case 'candybar':
      // Held up on end: the wrapper, a band of its colour, torn open at the top with the bar showing.
      cube(0.03, 0.12, 0.016, label, 0, 0.06);
      cube(0.031, 0.025, 0.017, toon('#ffd166'), 0, 0.07);
      cube(0.026, 0.02, 0.013, body, 0, 0.13);
      break;
    case 'chipsbag': {
      // A pillowy bag, its print, crimped at both ends.
      const bag = add(new THREE.SphereGeometry(0.05 * S, 12, 8), body, 0, 0.07);
      bag.scale.set(1, 1.35, 0.42);
      cube(0.08, 0.008, 0.018, body, 0, 0.135);
      cube(0.08, 0.008, 0.018, body, 0, 0.005);
      const print = add(new THREE.CircleGeometry(0.024 * S, 14), label, 0, 0.075, 0.022);
      print.scale.y = 0.8;
      break;
    }
    case 'tallcan':
      // Half a litre, slim and tall, a black band with a neon stripe.
      cyl(0.026, 0.026, 0.16, body, 0.08);
      cyl(0.0265, 0.0265, 0.07, label, 0.075);
      cyl(0.0268, 0.0268, 0.012, body, 0.075);
      cyl(0.022, 0.026, 0.008, toon('#c0c4cc'), 0.164);
      break;
    case 'bockwurst': {
      // A paper tray, the sausage in a split roll, a blob of mustard.
      cube(0.14, 0.012, 0.06, toon(PAPER), 0, 0.006);
      const roll = add(new THREE.CapsuleGeometry(0.022 * S, 0.08 * S, 4, 10), toon('#d9a05b'), 0, 0.03);
      roll.rotation.z = Math.PI / 2;
      roll.scale.z = 0.8;
      const wurst = add(new THREE.CapsuleGeometry(0.012 * S, 0.12 * S, 4, 10), body, 0, 0.05);
      wurst.rotation.z = Math.PI / 2;
      add(new THREE.SphereGeometry(0.012 * S, 8, 6), label, 0.03, 0.064).scale.y = 0.5;
      break;
    }
    case 'newspaper': {
      // Folded in half, a red masthead, columns of grey.
      cube(0.12, 0.16, 0.012, body, 0, 0.08);
      cube(0.121, 0.025, 0.013, label, 0, 0.145);
      for (let i = 0; i < 4; i++) cube(0.1, 0.006, 0.0135, toon('#9a9a9a'), 0, 0.115 - i * 0.022);
      cube(0.05, 0.04, 0.0135, toon('#6c8ebf'), -0.025, 0.035);
      break;
    }
  }
  return g;
}
