import * as THREE from 'three';
import { FORKLIFT, LOAD_H, PALLET, type PalletLoad, type ToolId } from '../../../shared/baumarkt-play';
import { mergeByMaterial, mesh, toon } from '../toon';
import { BLUE, ORANGE, box, indoor } from './kit';

// flrnoh fork (see FORK.md "The Baumarkt"): what moves about at the DIY store: the forklift (its forks
// on a carriage that slides up the mast), the pallets and what's stacked on them, the shopping trolleys,
// and what you hold: the tools off the wall and a can of paint from the shaker.

const cyl = (r: number, h: number, seg = 12) => new THREE.CylinderGeometry(r, r, h, seg);

export interface ForkliftModel {
  group: THREE.Group;
  /** Slides up the mast with the forks (y is the lift). */
  carriage: THREE.Group;
  /** The rear (steering) wheels, turned by the steer. */
  steerWheels: THREE.Object3D[];
  /** Every wheel, rolled by the speed. */
  wheels: THREE.Mesh[];
  /** The amber beacon on the guard, on while someone's driving. */
  beacon: THREE.MeshToonMaterial;
}

/** The forklift: its nose (and forks) to +z, its rear at FORKLIFT.REAR. */
/**
 * `g`'s parts that never move against it (all its children but `keep`) as one mesh per material, so a
 * model costs a handful of draw calls rather than one per box. What's in `keep` stays as it is.
 */
function compact(g: THREE.Group, keep: readonly THREE.Object3D[] = []): THREE.Group {
  const still = new THREE.Group();
  for (const c of [...g.children]) if (!keep.includes(c)) still.add(c);
  g.add(mergeByMaterial(still));
  return g;
}

export function forkliftModel(): ForkliftModel {
  const g = new THREE.Group();
  const yellow = indoor('#f6b31b');
  const dark = indoor('#2b2d36');
  const grey = indoor('#6d7480');
  const { HALF_W, REAR, NOSE, FRONT_AXLE, REAR_AXLE, FORK_LEN } = FORKLIFT;
  const len = NOSE - REAR;
  // The body, the counterweight at the back, the seat and the steering column.
  g.add(box(HALF_W * 2, 0.75, len - 0.35, yellow, 0, 0.28, (NOSE + REAR + 0.35) / 2));
  g.add(box(HALF_W * 2 + 0.04, 0.85, 0.5, dark, 0, 0.25, REAR + 0.27));
  g.add(box(0.5, 0.12, 0.45, dark, 0, 1.03, -0.45));
  g.add(box(0.5, 0.5, 0.1, dark, 0, 1.12, -0.7));
  const column = mesh(cyl(0.035, 0.6, 6), dark, 0, 1.25, 0.35);
  column.rotation.x = -0.5;
  g.add(column);
  const wheel = mesh(new THREE.TorusGeometry(0.13, 0.03, 6, 14), dark, 0, 1.52, 0.2);
  wheel.rotation.x = -0.5 - Math.PI / 2;
  g.add(wheel);
  // The overhead guard: four posts and a grid on top.
  for (const [x, z] of [
    [HALF_W - 0.05, 0.75],
    [-HALF_W + 0.05, 0.75],
    [HALF_W - 0.05, -0.8],
    [-HALF_W + 0.05, -0.8],
  ])
    g.add(box(0.06, 1.25, 0.06, dark, x, 1.03, z));
  for (let k = 0; k < 5; k++) g.add(box(HALF_W * 2 - 0.05, 0.04, 0.05, dark, 0, 2.27, -0.8 + k * 0.39));
  const beacon = indoor('#ff9f1c').clone();
  beacon.emissive = new THREE.Color('#ff7b00');
  beacon.emissiveIntensity = 0;
  g.add(mesh(cyl(0.07, 0.12), beacon, 0, 2.37, -0.75));
  // Wheels: the drive wheels under the front, the steering ones under the counterweight.
  const wheels: THREE.Mesh[] = [];
  const steerWheels: THREE.Object3D[] = [];
  const tyre = cyl(0.27, 0.22, 14).rotateZ(Math.PI / 2);
  const small = cyl(0.21, 0.18, 12).rotateZ(Math.PI / 2);
  for (const side of [-1, 1]) {
    const w = mesh(tyre, dark, side * (HALF_W - 0.08), 0.27, FRONT_AXLE);
    g.add(w);
    wheels.push(w);
    const pivot = new THREE.Group();
    pivot.position.set(side * (HALF_W - 0.12), 0.21, REAR_AXLE);
    const r = mesh(small, dark, 0, 0, 0);
    pivot.add(r);
    g.add(pivot);
    wheels.push(r);
    steerWheels.push(pivot);
  }
  // The mast at the nose, and the carriage with its backrest and forks.
  for (const side of [-1, 1]) g.add(box(0.09, 2.7, 0.12, grey, side * 0.38, 0.08, NOSE + 0.02));
  g.add(box(0.85, 0.08, 0.12, grey, 0, 2.72, NOSE + 0.02));
  const carriage = new THREE.Group();
  carriage.add(box(0.95, 0.45, 0.06, dark, 0, 0.02, NOSE + 0.1));
  for (let k = 0; k < 4; k++) carriage.add(box(0.04, 0.55, 0.04, dark, -0.4 + k * 0.27, 0.45, NOSE + 0.1));
  for (const side of [-1, 1]) {
    carriage.add(box(0.1, 0.05, FORK_LEN, grey, side * 0.28, 0.0, NOSE + 0.1 + FORK_LEN / 2));
    carriage.add(box(0.1, 0.45, 0.05, grey, side * 0.28, 0.0, NOSE + 0.12));
  }
  g.add(carriage);
  // A stripe of warning tape down each side, the brand on the counterweight.
  for (const side of [-1, 1]) g.add(box(0.02, 0.12, len - 0.6, indoor('#1d1d1d'), side * (HALF_W + 0.005), 0.75, (NOSE + REAR) / 2 + 0.1));
  g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
  compact(carriage);
  // The beacon's mesh keeps its own material (it lights up), so it stays out of the merge.
  const beaconMesh = g.children.find((c) => (c as THREE.Mesh).material === beacon)!;
  compact(g, [carriage, beaconMesh, ...steerWheels, ...wheels.filter((w) => w.parent === g)]);
  return { group: g, carriage, steerWheels, wheels, beacon };
}

// ---- Pallets ----------------------------------------------------------------------------------

/** A Euro pallet (its runners along z) with its load on it. */
export function palletModel(load: PalletLoad): THREE.Group {
  const g = new THREE.Group();
  const wood = indoor('#c8a26a');
  const { HALF_L, HALF_W, H } = PALLET;
  for (const x of [-HALF_W + 0.05, 0, HALF_W - 0.05]) g.add(box(0.1, 0.1, HALF_L * 2, wood, x, 0, 0));
  for (const z of [-HALF_L + 0.05, -HALF_L / 3, HALF_L / 3, HALF_L - 0.05]) g.add(box(HALF_W * 2, 0.022, 0.1, wood, 0, 0.1, z));
  for (const x of [-HALF_W + 0.07, -HALF_W / 3, HALF_W / 3, HALF_W - 0.07]) g.add(box(0.12, 0.022, HALF_L * 2, wood, x, 0.122, 0));
  const top = H;
  const h = LOAD_H[load];
  switch (load) {
    case 'cement':
    case 'soil': {
      // Sacks, three layers of three, crossed.
      const mat = indoor(load === 'cement' ? '#d9d4c7' : '#3a7d44');
      const band = indoor(load === 'cement' ? '#d62828' : '#ffd166');
      for (let layer = 0; layer < 3; layer++)
        for (let k = 0; k < 3; k++) {
          const across = layer % 2 === 0;
          const s = mesh(new THREE.BoxGeometry(across ? HALF_W * 2 - 0.04 : 0.26, 0.24, across ? 0.38 : HALF_L * 2 - 0.06), mat, across ? 0 : -0.27 + k * 0.27, top + 0.12 + layer * 0.25, across ? -0.39 + k * 0.39 : 0);
          g.add(s);
          if (k === 1) g.add(box(across ? HALF_W * 2 - 0.02 : 0.27, 0.06, across ? 0.39 : HALF_L * 2 - 0.05, band, s.position.x, s.position.y - 0.03, s.position.z));
        }
      break;
    }
    case 'boxes': {
      const mat = indoor('#c49a6c');
      for (let layer = 0; layer < 2; layer++) for (const x of [-0.2, 0.2]) for (const z of [-0.3, 0.3]) g.add(box(0.38, 0.45, 0.56, mat, x, top + layer * 0.47, z));
      g.add(box(0.8, 0.02, 0.3, indoor('#f8f9fa'), 0, top + 0.94, 0));
      break;
    }
    case 'tiles':
      for (const z of [-0.3, 0.3]) g.add(box(0.74, h, 0.56, indoor('#9e9e9e'), 0, top, z));
      g.add(box(0.76, 0.04, 1.16, indoor('#264653'), 0, top + h - 0.06, 0));
      break;
    case 'bricks':
      for (let layer = 0; layer < 5; layer++) g.add(box(0.76, 0.13, 1.16, indoor(layer % 2 ? '#b5523b' : '#c2603f'), 0, top + layer * 0.14, 0));
      break;
    case 'timber':
      for (let layer = 0; layer < 4; layer++) for (let k = 0; k < 5; k++) g.add(box(0.14, 0.11, 1.18, indoor(k % 2 ? '#deb887' : '#d2a679'), -0.3 + k * 0.15, top + layer * 0.12, 0));
      break;
  }
  g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
  return compact(g);
}

// ---- Trolleys ---------------------------------------------------------------------------------

/** A shopping trolley, its handle at -z and its nose to +z; `wheels` roll. */
export function trolleyModel(): { group: THREE.Group; wheels: THREE.Mesh[] } {
  const g = new THREE.Group();
  const wire = indoor('#c9ced6');
  const red = indoor('#d62828');
  const dark = indoor('#2b2d36');
  const wireEdge = (w: number, h: number, d: number, x: number, y: number, z: number) => g.add(box(w, h, d, wire, x, y, z, false));
  // The basket: a floor, two sides and a nose, a little narrower at the front.
  wireEdge(0.52, 0.02, 0.85, 0, 0.5, 0.02);
  for (const s of [-1, 1]) {
    wireEdge(0.02, 0.4, 0.85, s * 0.27, 0.5, 0.02);
    for (let k = 0; k < 6; k++) wireEdge(0.022, 0.4, 0.015, s * 0.275, 0.5, -0.38 + k * 0.16);
  }
  wireEdge(0.54, 0.4, 0.02, 0, 0.5, 0.45);
  for (let k = 0; k < 4; k++) wireEdge(0.54, 0.015, 0.86, 0, 0.6 + k * 0.1, 0.02);
  // The child seat flap at the back, the handle, the frame down to the wheels, the bottom tray.
  wireEdge(0.52, 0.35, 0.02, 0, 0.55, -0.41);
  g.add(box(0.6, 0.05, 0.05, red, 0, 0.98, -0.52));
  for (const s of [-1, 1]) {
    g.add(box(0.03, 0.55, 0.03, dark, s * 0.25, 0.08, -0.4));
    g.add(box(0.03, 0.5, 0.03, dark, s * 0.2, 0.08, 0.4));
    g.add(box(0.03, 0.03, 0.16, red, s * 0.27, 0.95, -0.47));
  }
  wireEdge(0.42, 0.02, 0.7, 0, 0.12, 0.02);
  const wheels: THREE.Mesh[] = [];
  const tyre = cyl(0.05, 0.035, 10).rotateZ(Math.PI / 2);
  for (const [x, z] of [
    [-0.25, -0.4],
    [0.25, -0.4],
    [-0.2, 0.4],
    [0.2, 0.4],
  ]) {
    const w = mesh(tyre, dark, x, 0.05, z, false);
    g.add(w);
    wheels.push(w);
  }
  return { group: compact(g, wheels), wheels };
}

// ---- What you hold ----------------------------------------------------------------------------

/** A tool in your hand: its grip at the origin, its business end forward (-z, like the camera looks); `spin` turns on use. */
export function toolModel(id: ToolId): { group: THREE.Group; spin: THREE.Object3D | null } {
  const g = new THREE.Group();
  const body = toon(id === 'chainsaw' ? ORANGE : id === 'hammer' ? '#7a4b2a' : id === 'screwdriver' ? '#2a9d8f' : BLUE);
  const black = toon('#23262e');
  const steel = toon('#c0c7d0');
  let spin: THREE.Object3D | null = null;
  switch (id) {
    case 'drill':
    case 'screwdriver': {
      const big = id === 'drill';
      // A pistol grip, the motor housing over it, the chuck and the bit (or a screwdriver tip) ahead.
      g.add(box(0.06, 0.16, 0.08, black, 0, -0.12, 0));
      g.add(box(0.075, 0.09, big ? 0.24 : 0.18, body, 0, 0.0, -0.04));
      g.add(box(0.07, 0.04, 0.09, body, 0, -0.16, 0.0));
      g.add(box(0.08, 0.05, 0.1, black, 0, -0.2, 0.0));
      spin = new THREE.Group();
      spin.position.set(0, 0.045, big ? -0.17 : -0.14);
      const chuck = mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.05, 8).rotateX(Math.PI / 2), black, 0, 0, 0, false);
      const bit = mesh(new THREE.CylinderGeometry(0.006, 0.006, big ? 0.12 : 0.07, 6).rotateX(Math.PI / 2), steel, 0, 0, big ? -0.08 : -0.06, false);
      // A flat on the chuck, so you see it turn.
      const flat = mesh(new THREE.BoxGeometry(0.05, 0.008, 0.02), steel, 0, 0.022, 0, false);
      spin.add(chuck, bit, flat);
      g.add(spin);
      break;
    }
    case 'hammer':
      g.add(box(0.03, 0.32, 0.03, body, 0, -0.12, 0));
      g.add(box(0.04, 0.05, 0.16, steel, 0, 0.18, -0.03));
      g.add(box(0.034, 0.08, 0.034, black, 0, -0.14, 0));
      break;
    case 'chainsaw': {
      g.add(box(0.12, 0.13, 0.28, body, 0, -0.05, 0.03));
      g.add(box(0.03, 0.1, 0.03, black, 0, 0.08, 0.06));
      g.add(box(0.1, 0.02, 0.03, black, 0, 0.17, 0.06));
      const bar = box(0.02, 0.08, 0.42, steel, 0, -0.02, -0.3);
      g.add(bar);
      spin = new THREE.Group();
      spin.position.set(0, 0.02, -0.3);
      for (let k = 0; k < 8; k++) spin.add(box(0.026, 0.012, 0.02, black, 0, 0.035, -0.19 + k * 0.055));
      g.add(spin);
      break;
    }
  }
  return { group: g, spin };
}

/** A can of paint, `color` on its label and lid, its handle up. */
export function paintCanModel(color: string): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(cyl(0.09, 0.17, 16), toon('#d7dce2'), 0, -0.05, 0, false));
  g.add(mesh(cyl(0.092, 0.1, 16), toon(color), 0, -0.05, 0, false));
  g.add(mesh(cyl(0.085, 0.012, 16), toon(color), 0, 0.04, 0, false));
  const handle = mesh(new THREE.TorusGeometry(0.085, 0.006, 4, 12, Math.PI), toon('#8d949e'), 0, 0.04, 0, false);
  g.add(handle);
  return g;
}
