import * as THREE from 'three';
import { KIOSK_BY_ID, type KioskItemId } from '../../shared/kiosk';
import type { Drink } from '../../shared/rooftop';
import { mesh, toon } from './toon';

// What the beach kiosk hands you (flrnoh fork, see FORK.md "A day at the beach"), held like a glass
// from the bar: fridgeitems.ts hands the kiosk's shapes over to here. Each is a handful of simple
// shapes standing on y = 0, sized like the bar's glasses (a pint is 0.15 tall).

const PAPER = '#fbfaf6';
const WAFER = '#e9c46a';

/** A cone of fries, a tray of Currywurst, an ice cream, a coconut…, `S` times its size. */
export function kioskItem(d: Drink, S = 1): THREE.Group {
  const g = new THREE.Group();
  const item = KIOSK_BY_ID.get(d.id as KioskItemId);
  const body = toon(d.color);
  const label = toon(item?.label ?? '#ffffff');
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z = 0) => {
    const m = mesh(geo, mat, x * S, y * S, z * S, false);
    g.add(m);
    return m;
  };
  const cyl = (rTop: number, rBottom: number, h: number, mat: THREE.Material, y: number, segs = 12, x = 0) => add(new THREE.CylinderGeometry(rTop * S, rBottom * S, h * S, segs), mat, x, y);
  switch (d.glass) {
    case 'fries': {
      // A paper cone, red and white, fries sticking out every which way, ketchup and mayo on top.
      cyl(0.045, 0.02, 0.1, toon(PAPER), 0.05, 10);
      cyl(0.0455, 0.032, 0.035, label, 0.08, 10);
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const fry = add(new THREE.BoxGeometry(0.009 * S, 0.07 * S, 0.009 * S), body, Math.cos(a) * 0.025, 0.115 + (i % 3) * 0.008, Math.sin(a) * 0.025);
        fry.rotation.set(Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3);
      }
      add(new THREE.SphereGeometry(0.016 * S, 8, 6), toon('#d62828'), -0.01, 0.14, 0.005).scale.y = 0.5;
      add(new THREE.SphereGeometry(0.014 * S, 8, 6), toon('#fff8e1'), 0.012, 0.142, -0.004).scale.y = 0.5;
      break;
    }
    case 'currywurst': {
      // A paper tray, the sausage in slices under curry sauce and powder, a little wooden fork.
      add(new THREE.BoxGeometry(0.12 * S, 0.02 * S, 0.06 * S), label, 0, 0.01);
      for (let i = 0; i < 6; i++) {
        const slice = add(new THREE.CylinderGeometry(0.012 * S, 0.012 * S, 0.008 * S, 10), toon('#c96d4b'), -0.045 + i * 0.018, 0.024, 0);
        slice.rotation.z = Math.PI / 2 - 0.4;
      }
      add(new THREE.BoxGeometry(0.11 * S, 0.006 * S, 0.045 * S), body, 0, 0.03);
      const fork = add(new THREE.BoxGeometry(0.006 * S, 0.004 * S, 0.06 * S), toon('#deb887'), 0.035, 0.04, 0.01);
      fork.rotation.x = -0.4;
      break;
    }
    case 'fishroll': {
      // A crusty roll, split, the fish and onion rings and a lettuce leaf hanging out.
      const top = add(new THREE.SphereGeometry(0.03 * S, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), body, 0, 0.03);
      top.scale.set(1.8, 0.7, 1);
      add(new THREE.BoxGeometry(0.11 * S, 0.012 * S, 0.045 * S), toon('#d8d0c8'), 0, 0.025);
      add(new THREE.BoxGeometry(0.1 * S, 0.006 * S, 0.05 * S), label, 0, 0.019);
      const bottom = add(new THREE.SphereGeometry(0.03 * S, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), body, 0, 0.018);
      bottom.scale.set(1.8, 0.4, 1);
      for (const x of [-0.025, 0.02]) add(new THREE.TorusGeometry(0.01 * S, 0.0025 * S, 4, 10), toon('#f2e8f7'), x, 0.034, 0.012);
      break;
    }
    case 'cone': {
      // A wafer cone, a swirl of vanilla and strawberry on top, sprinkles.
      add(new THREE.ConeGeometry(0.028 * S, 0.09 * S, 12).rotateX(Math.PI), toon(WAFER), 0, 0.045);
      for (let i = 0; i < 3; i++) {
        const swirl = add(new THREE.TorusGeometry((0.022 - i * 0.006) * S, 0.012 * S, 8, 16), i === 1 ? label : body, 0, 0.098 + i * 0.016);
        swirl.rotation.x = Math.PI / 2;
      }
      add(new THREE.ConeGeometry(0.008 * S, 0.02 * S, 8), body, 0, 0.145);
      for (const [x, z, c] of [
        [0.012, 0.01, '#06d6a0'],
        [-0.01, 0.012, '#118ab2'],
        [0.004, -0.014, '#ffd166'],
      ] as const)
        add(new THREE.BoxGeometry(0.006 * S, 0.003 * S, 0.003 * S), toon(c), x, 0.125, z);
      break;
    }
    case 'popsicle': {
      // A rocket on a stick: orange, then yellow, then a red tip.
      cyl(0.003, 0.003, 0.05, toon('#deb887'), 0.025, 6);
      cyl(0.02, 0.022, 0.05, body, 0.075);
      cyl(0.017, 0.02, 0.03, label, 0.115);
      add(new THREE.ConeGeometry(0.017 * S, 0.03 * S, 12), toon('#e63946'), 0, 0.145);
      break;
    }
    case 'slush': {
      // A clear cup of blue slush, a domed lid and a spoon-straw.
      const cup = new THREE.MeshToonMaterial({ color: '#e8f4ff', transparent: true, opacity: 0.45 });
      cyl(0.035, 0.026, 0.13, cup, 0.065);
      cyl(0.032, 0.025, 0.115, body, 0.06);
      add(new THREE.SphereGeometry(0.035 * S, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), cup, 0, 0.13).scale.y = 0.5;
      const straw = cyl(0.004, 0.004, 0.2, toon('#ef476f'), 0.14, 6, 0.008);
      straw.rotation.z = -0.15;
      break;
    }
    case 'coconut': {
      // A whole coconut, a hole on top, a bendy straw and a paper umbrella.
      add(new THREE.SphereGeometry(0.05 * S, 14, 10), body, 0, 0.05).scale.y = 0.95;
      add(new THREE.CircleGeometry(0.015 * S, 10).rotateX(-Math.PI / 2), toon('#f1e3c6'), 0, 0.098);
      const straw = cyl(0.004, 0.004, 0.11, toon('#06d6a0'), 0.13, 6, 0.006);
      straw.rotation.z = -0.25;
      const umbrella = add(new THREE.ConeGeometry(0.035 * S, 0.018 * S, 10), label, -0.02, 0.17);
      umbrella.rotation.z = 0.4;
      add(new THREE.CylinderGeometry(0.002 * S, 0.002 * S, 0.08 * S, 4), toon('#deb887'), -0.012, 0.13).rotation.z = 0.4;
      break;
    }
    case 'icetea': {
      // A tall paper cup with a lid and a straw.
      cyl(0.034, 0.026, 0.15, toon(PAPER), 0.075);
      cyl(0.0345, 0.03, 0.05, body, 0.09);
      cyl(0.036, 0.036, 0.01, label, 0.153);
      cyl(0.004, 0.004, 0.08, toon('#e63946'), 0.19, 6, 0.01);
      break;
    }
    case 'radlercan':
      cyl(0.029, 0.029, 0.11, body, 0.058);
      cyl(0.0295, 0.0295, 0.03, label, 0.07);
      cyl(0.025, 0.029, 0.008, toon('#c0c4cc'), 0.117);
      break;
  }
  return g;
}
