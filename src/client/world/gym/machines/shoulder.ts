import * as THREE from 'three';
import { stackPlates } from '../../../../shared/gym-motion';
import { C, beam, box, cable, foot, pad, pulley, tube, weightStack, rigid, type Machine, type V3 } from './kit';

/*
 * A seated shoulder press (flrnoh fork, see kit.ts): a seat and a tall back pad, two raked chrome
 * guide rods either side with the handles riding up them on a yoke round the back, and the weight
 * stack behind the seat on a cable over two pulleys. Pressing, the handles go up the rods and the
 * pinned plates climb with them.
 */

/** How high the handles start and finish. */
const Y0 = 1.02;
const Y1 = 1.28;
/** Where the raked rods are at height y. */
const rodZ = (y: number) => 0.25 - ((y - 0.8) / 0.82) * 0.2;
const STACK_Z = -0.66;
const TRAVEL = 0.3;

export function shoulder(): Machine {
  const statics = new THREE.Group();
  const live = new THREE.Group();
  statics.add(foot(0.9, 0, 0.35), foot(0.8, 0, STACK_Z));
  statics.add(box(0.1, 0.06, 1.05, C.frame, 0, 0.05, -0.15));
  // Seat and back pad.
  statics.add(pad(0.4, 0.07, 0.34, 0, 0.37, 0.0));
  statics.add(beam([0, 0.05, 0.0], [0, 0.34, 0.0], 0.07));
  const back = pad(0.42, 0.07, 0.66, 0, 0.8, -0.27);
  back.rotation.x = Math.PI / 2 - 0.1;
  statics.add(back);
  statics.add(beam([0, 0.05, -0.36], [0, 1.1, -0.34], 0.08));
  // The raked guide rods, with their frame and end stops.
  for (const s of [-1, 1] as const) {
    const lo: V3 = [s * 0.41, 0.8, 0.25];
    const hi: V3 = [s * 0.37, 1.62, 0.05];
    statics.add(tube(lo, hi, 0.016, C.chrome));
    statics.add(beam([s * 0.41, 0.05, 0.27], lo, 0.06));
    statics.add(beam(hi, [s * 0.3, 1.66, -0.36], 0.06));
    statics.add(box(0.06, 0.04, 0.06, C.rubber, lo[0], lo[1] + 0.03, lo[2] - 0.01));
  }
  // The stack's tower behind the seat, and its pulleys.
  for (const s of [-1, 1]) statics.add(beam([s * 0.23, 0, STACK_Z], [s * 0.23, 1.9, STACK_Z], 0.07));
  statics.add(box(0.52, 0.07, 0.1, C.frame, 0, 1.9, STACK_Z));
  statics.add(box(0.44, 0.05, 0.012, C.lime, 0, 1.9, STACK_Z + 0.056));
  statics.add(beam([0, 1.9, STACK_Z], [0, 1.9, -0.36], 0.06));
  const pA = pulley();
  pA.position.set(0, 1.98, STACK_Z);
  const pB = pulley();
  pB.position.set(0, 1.98, -0.42);
  statics.add(pA, pB);

  // Live: the stack, the handles on their yoke, the cable.
  const stack = weightStack(12, 0.3, 0.14);
  stack.group.position.set(0, 0, STACK_Z);
  live.add(stack.group);
  const yoke = new THREE.Group();
  for (const s of [-1, 1]) {
    yoke.add(tube([s * 0.4, 0, 0], [s * 0.4, 0, -0.62], 0.016, C.frame));
    yoke.add(box(0.06, 0.1, 0.06, C.frame2, s * 0.4, 0, 0));
    // The handle: out from the sleeve toward the lifter's hand.
    yoke.add(tube([s * 0.4, 0, 0], [s * 0.4, -0.02, 0.1], 0.02, C.grip));
  }
  yoke.add(tube([-0.4, 0, -0.62], [0.4, 0, -0.62], 0.016, C.frame));
  live.add(rigid(yoke));
  const c1 = cable();
  const c2 = cable();
  const c3 = cable();
  live.add(c1.mesh, c2.mesh, c3.mesh);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const handleAt = (e: number): V3 => {
    const y = THREE.MathUtils.lerp(Y0, Y1, e);
    return [0, y, rodZ(y)];
  };

  return {
    statics,
    live,
    spot: [0, 0, 0],
    off: [-0.95, 0.25],
    size: { w: 1.0, d: 1.3, top: 1.9, cz: -0.2 },
    cam: { eye: [1.8, 2.0, 1.6], look: [0, 0.65, -0.1] },
    update(s) {
      const e = s.set?.extent ?? 0;
      stack.set(stackPlates(s.weight, s.max, 12), e * TRAVEL);
      const h = handleAt(e);
      yoke.position.set(0, h[1], h[2]);
      a.set(0, stack.top.y + e * TRAVEL, STACK_Z);
      b.set(0, 1.94, STACK_Z);
      c1.set(a, b);
      a.set(0, 2.04, STACK_Z + 0.02);
      b.set(0, 2.04, -0.44);
      c2.set(a, b);
      a.set(0, 1.94, -0.42);
      b.set(0, h[1], h[2] - 0.62);
      c3.set(a, b);
    },
    pose(p, s) {
      const e = s.set?.extent ?? 0;
      p.hips([0, 0.44, -0.02], -0.06);
      const h = handleAt(e);
      for (const side of [-1, 1] as const) {
        p.foot(side, [side * 0.16, 0.06, 0.3]);
        p.hand(side, [side * 0.4, h[1] - 0.015, h[2] + 0.08]);
      }
      p.head(-0.05);
    },
  };
}
