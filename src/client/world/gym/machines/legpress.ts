import * as THREE from 'three';
import { barPlates } from '../../../../shared/gym-motion';
import { mergeByColor } from '../../toon';
import { C, beam, box, pad, plate, rbox, tube, rigid, type Machine, type V3 } from './kit';

/*
 * A 45° leg press (flrnoh fork, see kit.ts): a reclined seat and back pad with side handles, two
 * chrome rails climbing away at 45° on a steel frame, and the sled riding them: a big footplate with
 * a lime-edged grip, and plate horns loaded with iron for the weight that's set. The lifter lies back,
 * feet on the plate, lets the sled down and drives it back up.
 */

const S2 = Math.SQRT1_2;
const DIR = new THREE.Vector3(0, S2, S2);
const F0: V3 = [0, 0.68, 0.12];
const F1: V3 = [0, 0.55, -0.01];
const HIPS: V3 = [0, 0.4, -0.15];

export function legpress(): Machine {
  const statics = new THREE.Group();
  const live = new THREE.Group();
  // The frame: a long base, the rails on it and a post under their top end.
  statics.add(box(0.14, 0.08, 1.8, C.frame, 0, 0.04, 0.05));
  statics.add(box(0.9, 0.06, 0.1, C.frame, 0, 0.03, -0.72), box(0.9, 0.06, 0.1, C.frame, 0, 0.03, 0.85));
  for (const s of [-1, 1]) {
    const a: V3 = [s * 0.22, 0.34, -0.08];
    const b: V3 = [s * 0.22, 0.34 + 1.0 * S2, -0.08 + 1.0 * S2];
    statics.add(tube(a, b, 0.022, C.chrome));
    statics.add(beam([s * 0.22, 0.0, b[2]], [s * 0.22, b[1] - 0.04, b[2]], 0.07));
    statics.add(beam([s * 0.22, 0.06, -0.1], [s * 0.22, 0.34, -0.1], 0.06));
    // Rubber stops at the rails' foot and the sled's safety catches.
    statics.add(box(0.07, 0.07, 0.07, C.rubber, s * 0.22, 0.34, -0.08));
    statics.add(box(0.05, 0.04, 0.12, C.lime, s * 0.3, 0.48, 0.1).rotateX(-Math.PI / 4));
  }
  statics.add(box(0.5, 0.06, 0.06, C.frame, 0, 0.34 + S2 - 0.02, 0.62));
  // The seat, the reclined back pad, the handles.
  statics.add(pad(0.42, 0.07, 0.3, 0, 0.3, -0.17));
  statics.add(beam([0, 0.02, -0.2], [0, 0.26, -0.2], 0.08));
  const back = pad(0.44, 0.07, 0.62, 0, 0.36, -0.56);
  back.rotation.x = 0.57;
  statics.add(back);
  statics.add(beam([0, 0.02, -0.62], [0, 0.3, -0.56], 0.07));
  for (const s of [-1, 1]) {
    statics.add(tube([s * 0.25, 0.4, -0.25], [s * 0.38, 0.44, -0.25], 0.02, C.frame));
    statics.add(tube([s * 0.38, 0.47, -0.4], [s * 0.38, 0.47, -0.18], 0.024, C.grip));
    statics.add(tube([s * 0.38, 0.44, -0.25], [s * 0.38, 0.47, -0.28], 0.02, C.frame));
  }

  // Live: the sled with its footplate and plates.
  const sled = new THREE.Group();
  const face = new THREE.Group();
  face.rotation.x = Math.PI / 4; // square to the rails, facing the lifter
  face.add(rbox(0.66, 0.035, 0.5, C.frame2, 0, 0, 0, 0.05));
  face.add(rbox(0.6, 0.012, 0.44, C.rubber, 0, -0.02, 0, 0.05));
  face.add(box(0.62, 0.006, 0.02, C.lime, 0, -0.027, -0.2));
  face.add(box(0.62, 0.006, 0.02, C.lime, 0, -0.027, 0.2));
  sled.add(rigid(face));
  const carriage = new THREE.Group();
  carriage.add(box(0.5, 0.08, 0.3, C.frame, 0, 0.09, 0.09).rotateX(Math.PI / 4));
  for (const s of [-1, 1]) carriage.add(box(0.06, 0.1, 0.16, C.steel, s * 0.22, 0.02, 0.03).rotateX(Math.PI / 4));
  for (const s of [-1, 1]) carriage.add(tube([s * 0.3, 0.12, 0.12], [s * 0.56, 0.12, 0.12], 0.024, C.chrome));
  sled.add(mergeByColor(carriage));
  const loaded = new THREE.Group();
  sled.add(loaded);
  live.add(sled);
  let loadKey = '';
  const load = (weight: number) => {
    const plates = barPlates(weight + 20, 5);
    const k = plates.join(',');
    if (k === loadKey) return;
    loadKey = k;
    for (const c of [...loaded.children]) {
      loaded.remove(c);
      c.traverse((m) => (m as THREE.Mesh).geometry?.dispose());
    }
    const g = new THREE.Group();
    for (const s of [-1, 1]) {
      let x = 0.33;
      for (const kg of plates) {
        const pl = plate(kg, false);
        const t = pl.userData.thick as number;
        pl.position.set(s * (x + t / 2), 0.12, 0.12);
        x += t + 0.004;
        g.add(pl);
      }
    }
    if (g.children.length) loaded.add(mergeByColor(g));
  };
  const footAt = (e: number): V3 => [0, THREE.MathUtils.lerp(F0[1], F1[1], e), THREE.MathUtils.lerp(F0[2], F1[2], e)];

  return {
    statics,
    live,
    spot: [0, 0, -0.2],
    off: [-0.95, -0.25],
    size: { w: 1.2, d: 1.75, top: 1.1, cz: 0.05 },
    cam: { eye: [2.0, 1.8, -1.2], look: [0, 0.3, 0.1] },
    update(s) {
      load(s.weight);
      const f = footAt(s.set?.extent ?? 0);
      // The footplate's face sits just in front of the feet, the sled behind it along the rails.
      sled.position.set(f[0], f[1], f[2]).addScaledVector(DIR, 0.05);
    },
    pose(p, s) {
      p.hips(HIPS, -1.0);
      const f = footAt(s.set?.extent ?? 0);
      for (const side of [-1, 1] as const) {
        p.foot(side, [side * 0.14, f[1], f[2]]);
        p.hand(side, [side * 0.38, 0.47, -0.3]);
      }
      p.head(0.35);
    },
  };
}
