import * as THREE from 'three';
import { BIKES, type BikeKind } from '../../shared/ride';
import type { Bones } from './character/person-bones';
import { HIPS } from './character/rig';
import { mesh, toon } from './toon';

// flrnoh fork (see FORK.md "Shops to walk into"): a bicycle from the city's bike shop, sized for the
// office's chibi people (their hips are HIPS over their feet): the town rides them (features/ride),
// the bike shop hangs them on its walls and parks them out front (features/shops/decor-ride.ts).
// Forward is +z, the wheels stand on y = 0.

export interface BikeModel {
  group: THREE.Group;
  /** Turns the wheels and the cranks to `meters` ridden, and the front wheel to `steer` (radians). */
  roll(meters: number, steer: number): void;
}

/** The saddle's height over the ground, a little under where the rider's hips sit. */
export const saddleOf = (k: BikeKind) => BIKES[k].hips - 0.05;
const wheelR = (k: BikeKind) => (k === 'bmx' ? 0.22 : k === 'racer' ? 0.3 : 0.28);

/** A tube from a to b, `r` thick. */
function tube(parent: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material) {
  const len = a.distanceTo(b);
  const m = mesh(new THREE.CylinderGeometry(r, r, len, 6), mat, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, false);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  parent.add(m);
  return m;
}

function wheel(r: number, rim: THREE.Material, tyre: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const t = mesh(new THREE.TorusGeometry(r, 0.025, 6, 20), tyre, 0, 0, 0, false);
  t.rotation.y = Math.PI / 2;
  g.add(t);
  // Spokes: a few, so a turning wheel shows it.
  for (let i = 0; i < 4; i++) {
    const s = mesh(new THREE.BoxGeometry(0.008, r * 2 - 0.04, 0.008), rim, 0, 0, 0, false);
    s.rotation.x = (i * Math.PI) / 4;
    g.add(s);
  }
  g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.06, 8).rotateZ(Math.PI / 2), rim, 0, 0, 0, false));
  return g;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** A bike of kind `k`. */
export function bikeModel(k: BikeKind): BikeModel {
  const spec = BIKES[k];
  const group = new THREE.Group();
  const frame = toon(spec.color);
  const trim = toon(spec.trim);
  const steel = toon('#adb5bd');
  const tyre = toon('#1d1d1d');
  const r = wheelR(k);
  const half = spec.length / 2 - r * 0.6;
  // The cargo bike's box is in front of its handlebars, so its front wheel's further out.
  const front = k === 'cargo' ? half + 0.35 : half;
  const back = k === 'cargo' ? -half + 0.35 : -half;
  const rear = wheel(r, steel, tyre);
  rear.position.set(0, r, back);
  group.add(rear);
  const fork = new THREE.Group();
  fork.position.set(0, r, front);
  const fw = wheel(r, steel, tyre);
  fork.add(fw);
  group.add(fork);
  const saddle = saddleOf(k);
  const crank = V(0, r * 0.95, back + (k === 'cargo' ? 0.55 : 0.42));
  const seat = V(0, saddle - 0.04, back + (k === 'cargo' ? 0.45 : 0.3));
  const head = V(0, saddle + (k === 'racer' ? -0.02 : 0.06), k === 'cargo' ? 0.25 : front - 0.12);
  // The frame: seat tube, down tube, top tube, the stays back to the rear hub, the fork to the front one.
  tube(group, crank, seat, 0.022, frame);
  tube(group, crank, head, 0.026, frame);
  tube(group, seat.clone().setY(seat.y - 0.06), head.clone().setY(head.y - 0.06), 0.02, frame);
  for (const x of [-0.04, 0.04]) {
    tube(group, crank.clone().setX(x), V(x, r, back), 0.012, frame);
    tube(group, seat.clone().setX(x), V(x, r, back), 0.012, frame);
  }
  if (k === 'cargo') {
    // The long front: a beam out to the front wheel, the box on it.
    tube(group, crank, V(0, r * 0.9, front), 0.024, frame);
    const box = mesh(new THREE.BoxGeometry(0.5, 0.32, 0.62), toon('#c8955c'), 0, r + 0.2, front - 0.45, false);
    group.add(box);
    group.add(mesh(new THREE.BoxGeometry(0.46, 0.02, 0.58), toon('#9c6644'), 0, r + 0.36, front - 0.45, false));
    tube(group, head, V(0, r + 0.05, head.z + 0.05), 0.02, frame);
  } else {
    for (const x of [-0.035, 0.035]) tube(fork, V(x, head.y - r - 0.04, head.z - front), V(x, 0, 0), 0.012, frame);
  }
  // The saddle and the seat post.
  group.add(mesh(new THREE.BoxGeometry(0.1, 0.04, k === 'racer' ? 0.22 : 0.2), trim, 0, saddle, seat.z - 0.02, false));
  // The handlebars: drops on the racer, up and back on the others, grips in the trim's color.
  const bar = new THREE.Group();
  bar.position.copy(head);
  group.add(bar);
  tube(bar, V(0, 0, 0), V(0, 0.12, -0.02), 0.016, steel);
  tube(bar, V(-0.24, 0.12, -0.04), V(0.24, 0.12, -0.04), 0.014, steel);
  for (const x of [-0.24, 0.24]) {
    if (k === 'racer') tube(bar, V(x, 0.12, -0.04), V(x, 0.02, 0.06), 0.014, trim);
    else bar.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.08, 8).rotateZ(Math.PI / 2), trim, x * 0.9, 0.12, -0.04, false));
  }
  // A bell on the bar, a basket on the city bike, a number plate on the BMX.
  bar.add(mesh(new THREE.SphereGeometry(0.025, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), toon('#e9ecef'), 0.14, 0.135, -0.04, false));
  if (k === 'city') {
    const basket = mesh(new THREE.BoxGeometry(0.3, 0.2, 0.24), toon('#a47148'), 0, saddle + 0.02, front + 0.02, false);
    group.add(basket);
  }
  if (k === 'bmx') group.add(mesh(new THREE.BoxGeometry(0.2, 0.16, 0.01), toon('#ffffff'), 0, head.y + 0.05, head.z + 0.06, false));
  // The cranks and pedals, turning.
  const cranks = new THREE.Group();
  cranks.position.copy(crank);
  group.add(cranks);
  cranks.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 12).rotateZ(Math.PI / 2), steel, 0.05, 0, 0, false));
  for (const side of [-1, 1]) {
    const arm = mesh(new THREE.BoxGeometry(0.015, 0.15, 0.02), steel, side * 0.07, side * 0.06, 0, false);
    cranks.add(arm);
    cranks.add(mesh(new THREE.BoxGeometry(0.08, 0.02, 0.05), tyre, side * 0.11, side * 0.13, 0, false));
  }
  return {
    group,
    roll(meters, steer) {
      const a = meters / r;
      rear.rotation.x = a;
      fw.rotation.x = a;
      fork.rotation.y = steer;
      bar.rotation.y = k === 'cargo' ? 0 : steer;
      cranks.rotation.x = meters * spec.cadence * Math.PI * 2;
    },
  };
}

/** Lets go of a bike's geometry (its materials are the shared toon ones). */
export function disposeBike(b: BikeModel) {
  b.group.removeFromParent();
  b.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
}

/**
 * Poses a rider on bike `k` (see Person.setWorkout): up on the saddle, leaning to the bars, legs going
 * round with the cranks at `phase()` radians.
 */
export function ridingPose(k: BikeKind, phase: () => number) {
  const lean = k === 'racer' ? 0.42 : k === 'bmx' ? 0.25 : 0.1;
  const lift = BIKES[k].hips - HIPS;
  return (b: Bones) => {
    const a = phase();
    b.body.position.set(0, lift, k === 'cargo' ? -0.04 : -0.02);
    b.body.rotation.x = lean;
    b.legR.rotation.set(-0.95 + Math.sin(a) * 0.45, 0, 0);
    b.legL.rotation.set(-0.95 - Math.sin(a) * 0.45, 0, 0);
    b.armR.rotation.set(-1.15 - lean, 0, -0.15);
    b.armL.rotation.set(-1.15 - lean, 0, 0.15);
  };
}
