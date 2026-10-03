import * as THREE from 'three';
import { BUS_H, BUS_L, BUS_W, DOORS, type BusLine } from '../../../shared/citybus';
import { CAB, DOOR_W, FLOOR_Y, PRAM, SEATS, VALIDATORS } from '../../../shared/buscabin';
import { lookFromSeed } from '../../../shared/avatar';
import { Person } from '../character';
import { noOutline } from '../../core/outline';
import { mergeByMaterial, toon } from '../toon';
import { BUS_ADS, RouteStrip, StopDisplay, adTexture } from './bus-signs';

// flrnoh fork (see FORK.md "Traffic lights and the city bus"): a city bus's insides, as the plan in
// shared/buscabin.ts has them: the seats (the ones by the middle doors red, for those who need them
// most), yellow poles with red stop buttons, rails and straps under the ceiling, a validator by each
// door, the pram space with its sign, the driver in the cab, two displays over the aisle with the next
// stop, the line's stops along the wall, and the town's ads over the windows. All in the bus's own
// frame (its nose +x), merged into a few meshes; only the displays and the driver change.

const HL = BUS_L / 2;
const HW = BUS_W / 2;
const box = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const rod = (r: number, len: number, x: number, y: number, z: number, axis: 'x' | 'y' | 'z' = 'y') => {
  const g = new THREE.CylinderGeometry(r, r, len, 8);
  if (axis === 'x') g.rotateZ(Math.PI / 2);
  if (axis === 'z') g.rotateX(Math.PI / 2);
  return g.translate(x, y, z);
};

/** The materials every bus's insides share. */
interface CabinMats {
  seat: THREE.Material;
  priority: THREE.Material;
  frame: THREE.Material;
  yellow: THREE.Material;
  red: THREE.Material;
  floor: THREE.Material;
  dark: THREE.Material;
  blue: THREE.Material;
}

let shared: CabinMats | null = null;
const mats = (): CabinMats =>
  (shared ??= {
    seat: toon('#2f5aa8'),
    priority: toon('#b23a48'),
    frame: toon('#9aa1aa'),
    yellow: toon('#f2c230'),
    red: toon('#e01e37'),
    floor: toon('#6b7078'),
    dark: toon('#22252b'),
    blue: toon('#1d6fd1'),
  });

export interface Cabin {
  display: StopDisplay;
  strip: RouteStrip;
  driver: Person;
}

/** Builds the insides of `line`'s bus into `group` (the bus, its nose +x); `seed` picks its ads and its driver. */
export function buildCabin(group: THREE.Group, line: BusLine, seed: number): Cabin {
  const m = mats();
  const parts = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material) => parts.add(new THREE.Mesh(geo, mat));
  // A non-slip floor, and yellow edges at the doors.
  add(box(BUS_L - 0.2, 0.02, BUS_W - 0.14, 0, FLOOR_Y + 0.01, 0), m.floor);
  for (const u of DOORS) add(box(DOOR_W, 0.025, 0.12, u, FLOOR_Y + 0.02, HW - 0.12), m.yellow);
  // The seats: a cushion and a back on a frame, the back row raised a little.
  SEATS.forEach((s, i) => {
    const near = Math.abs(s.x - DOORS[1]) < 2.6 && s.x > -3;
    const mat = near ? m.priority : m.seat;
    add(box(0.44, 0.1, 0.44, s.x, FLOOR_Y + 0.45, s.z), mat);
    add(box(0.08, 0.56, 0.44, s.x - 0.22, FLOOR_Y + 0.78, s.z), mat);
    add(box(0.06, 0.4, 0.06, s.x, FLOOR_Y + 0.2, s.z), m.frame);
    // A handle on the back of the aisle seats, a stop button on every other.
    if (Math.abs(s.z) < 0.6 && i >= 5) {
      add(rod(0.018, 0.4, s.x - 0.27, FLOOR_Y + 1.08, s.z, 'z'), m.yellow);
      if (i % 2) add(box(0.04, 0.06, 0.06, s.x - 0.28, FLOOR_Y + 0.95, s.z + (s.z > 0 ? -0.12 : 0.12)), m.red);
    }
  });
  // Poles floor to ceiling down the aisle's edges, each with a stop button at hand height.
  const poles: [number, number][] = [
    [DOORS[0] - 0.75, 0.42],
    [DOORS[1] + 0.75, 0.42],
    [DOORS[1] - 0.75, 0.42],
    [2.25, -0.26],
    [-2.0, -0.26],
    [-3.7, -0.26],
    [-3.7, 0.7],
    [0.5, 0.7],
  ];
  for (const [x, z] of poles) {
    add(rod(0.025, BUS_H - FLOOR_Y - 0.08, x, (BUS_H + FLOOR_Y) / 2, z), m.yellow);
    add(box(0.06, 0.09, 0.06, x + 0.04, FLOOR_Y + 1.25, z), m.red);
  }
  // Rails under the ceiling either side of the aisle, with straps hanging off them.
  for (const z of [-0.3, 0.55]) {
    add(rod(0.02, BUS_L - 3.2, -0.8, BUS_H - 0.32, z, 'x'), m.yellow);
    for (let x = -HL + 1.2; x < HL - 2.3; x += 0.62) {
      add(rod(0.01, 0.22, x, BUS_H - 0.44, z), m.dark);
      add(new THREE.TorusGeometry(0.06, 0.012, 5, 12).translate(x, BUS_H - 0.6, z), m.dark);
    }
  }
  // The validators, orange boxes on their poles, a slot and a little screen.
  for (const v of VALIDATORS) {
    add(rod(0.025, BUS_H - FLOOR_Y - 0.08, v.x, (BUS_H + FLOOR_Y) / 2, v.z), m.yellow);
    add(box(0.18, 0.26, 0.16, v.x - 0.07, FLOOR_Y + 1.12, v.z), toon('#ef7d00'));
    add(box(0.01, 0.07, 0.1, v.x - 0.165, FLOOR_Y + 1.18, v.z), m.dark);
    add(box(0.01, 0.015, 0.08, v.x - 0.165, FLOOR_Y + 1.06, v.z), m.dark);
  }
  // The pram and wheelchair space: a padded board and a bar on the wall, the sign over it.
  add(box(PRAM.maxX - PRAM.minX - 0.3, 0.5, 0.06, (PRAM.minX + PRAM.maxX) / 2, FLOOR_Y + 0.75, PRAM.z + 0.1), m.frame);
  add(rod(0.02, PRAM.maxX - PRAM.minX - 0.4, (PRAM.minX + PRAM.maxX) / 2, FLOOR_Y + 0.95, PRAM.z + 0.2, 'x'), m.yellow);
  add(box(0.36, 0.36, 0.01, (PRAM.minX + PRAM.maxX) / 2, FLOOR_Y + 1.35, PRAM.z + 0.065), m.blue);
  // The driver's cab: a screen behind the seat, the dashboard right across.
  add(box(0.04, 1.3, CAB.maxZ - CAB.minZ - 0.1, CAB.minX, FLOOR_Y + 0.9, (CAB.minZ + CAB.maxZ) / 2), toon('#c8d6df', { transparent: true, opacity: 0.4 }));
  add(box(0.5, 0.75, BUS_W - 0.14, HL - 0.3, FLOOR_Y + 0.38, 0), m.dark);
  add(box(0.5, 0.55, 0.5, HL - 1.15, FLOOR_Y + 0.28, -HW + 0.6), m.dark);
  add(box(0.08, 0.6, 0.5, HL - 1.42, FLOOR_Y + 0.8, -HW + 0.6), m.dark);
  add(new THREE.TorusGeometry(0.2, 0.03, 6, 16).rotateY(Math.PI / 2).rotateZ(0.5).translate(HL - 0.62, FLOOR_Y + 1.02, -HW + 0.6), m.dark);
  group.add(mergeByMaterial(parts));

  // The displays over the aisle: one behind the cab, one over the middle doors, facing back.
  const display = new StopDisplay(line);
  const screen = new THREE.MeshBasicMaterial({ map: display.texture });
  for (const x of [CAB.minX - 0.05, DOORS[1] - 0.2]) {
    const d = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.275), screen);
    d.position.set(x, BUS_H - 0.42, 0.15);
    d.rotation.y = -Math.PI / 2;
    group.add(d);
    const back = new THREE.Mesh(box(0.04, 0.32, 1.16, x + 0.025, BUS_H - 0.42, 0.15), m.dark);
    group.add(back);
  }
  // The line's stops along the left wall, over the windows.
  const strip = new RouteStrip(line);
  const route = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 0.26), new THREE.MeshBasicMaterial({ map: strip.texture }));
  route.position.set(-0.9, BUS_H - 0.3, -HW + 0.075);
  group.add(route);
  // Ads over the right-hand windows, between and behind the doors.
  const ads = [...BUS_ADS.keys()].sort((a, b) => ((a * 7 + seed * 3) % 11) - ((b * 7 + seed * 3) % 11)).slice(0, 2);
  [[-3.2, ads[0]], [1.7, ads[1]]].forEach(([x, i]) => {
    const [head, sub, bg] = BUS_ADS[i];
    const ad = new THREE.Mesh(new THREE.PlaneGeometry(1.04, 0.26), new THREE.MeshBasicMaterial({ map: adTexture(head, sub, bg) }));
    ad.position.set(x, BUS_H - 0.3, HW - 0.075);
    ad.rotation.y = Math.PI;
    group.add(ad);
  });
  // The driver, in the cab, hands on the wheel.
  const driver = new Person('Fahrer', '#2b4c7e', lookFromSeed(`busfahrer-${line.no}-${seed}`));
  driver.showLabel(false);
  driver.sit(0.5);
  driver.wheel = true;
  driver.root.position.set(HL - 1.15, FLOOR_Y, -HW + 0.6);
  driver.root.rotation.y = Math.PI / 2;
  noOutline(driver.root);
  group.add(driver.root);
  return { display, strip, driver };
}
