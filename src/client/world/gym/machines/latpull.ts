import * as THREE from 'three';
import { stackPlates } from '../../../../shared/gym-motion';
import { C, beam, box, cable, foot, pad, pulley, roller, tube, weightStack, rigid, type Machine, type V3 } from './kit';

/*
 * A lat pulldown (flrnoh fork, see kit.ts): a tower with the weight stack between its uprights, a
 * boom out over the seat with pulleys, a cable down to a wide bar with angled, rubber-gripped ends,
 * a padded seat and a knee roller to hold you down. Every rep the bar comes down to the chin as the
 * pinned plates rise up the guide rods, and back.
 */

const TOP: V3 = [0, 1.27, 0.36];
const PULLED: V3 = [0, 0.98, 0.36];
const STACK_Z = 0.7;
const TRAVEL = 0.28;

export function latpull(): Machine {
  const statics = new THREE.Group();
  const live = new THREE.Group();
  statics.add(foot(0.7, 0, STACK_Z), foot(0.5, 0, -0.25));
  statics.add(box(0.1, 0.06, 1.0, C.frame, 0, 0.05, 0.25));
  for (const s of [-1, 1]) statics.add(beam([s * 0.24, 0, STACK_Z], [s * 0.24, 2.06, STACK_Z], 0.08));
  statics.add(box(0.56, 0.08, 0.1, C.frame, 0, 2.06, STACK_Z));
  statics.add(box(0.5, 0.06, 0.012, C.lime, 0, 2.06, STACK_Z - 0.056));
  // The boom out over the seat.
  statics.add(beam([0, 2.02, STACK_Z], [0, 1.98, TOP[2] - 0.02], 0.07));
  const pTop = pulley();
  pTop.position.set(0, 2.12, STACK_Z);
  const pFront = pulley();
  pFront.position.set(0, 1.94, TOP[2]);
  statics.add(pTop, pFront);
  // Stack shroud sides.
  for (const s of [-1, 1]) statics.add(box(0.01, 1.2, 0.2, C.frame2, s * 0.19, 0.7, STACK_Z));
  // Seat and knee roller.
  statics.add(pad(0.38, 0.07, 0.32, 0, 0.36, -0.02));
  statics.add(beam([0, 0.05, -0.02], [0, 0.33, -0.02], 0.07));
  statics.add(beam([0, 0.05, 0.3], [0, 0.6, 0.24], 0.06));
  statics.add(roller(0.46, 0.055, 0, 0.64, 0.22));
  statics.add(tube([-0.24, 0.64, 0.22], [0.24, 0.64, 0.22], 0.015, C.chrome));

  // Live: the stack, the bar and the cable.
  const stack = weightStack(12, 0.3, 0.14);
  stack.group.position.set(0, 0, STACK_Z);
  live.add(stack.group);
  const bar = new THREE.Group();
  bar.add(tube([-0.34, 0, 0], [0.34, 0, 0], 0.016, C.chrome));
  for (const s of [-1, 1]) {
    bar.add(tube([s * 0.34, 0, 0], [s * 0.56, -0.08, 0], 0.016, C.chrome));
    bar.add(tube([s * 0.4, -0.022, 0], [s * 0.54, -0.072, 0], 0.024, C.rubber));
  }
  bar.add(tube([0, 0, 0], [0, 0.06, 0], 0.008, C.steel));
  live.add(rigid(bar));
  const toStack = cable();
  const across = cable();
  const down = cable();
  live.add(toStack.mesh, across.mesh, down.mesh);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const barAt = (e: number): V3 => [0, THREE.MathUtils.lerp(TOP[1], PULLED[1], e), THREE.MathUtils.lerp(TOP[2], PULLED[2], e)];

  return {
    statics,
    live,
    spot: [0, 0, 0],
    off: [-0.85, 0.1],
    size: { w: 0.8, d: 1.3, top: 2.1, cz: 0.3 },
    cam: { eye: [1.8, 2.0, -1.5], look: [0, 0.7, 0.25] },
    update(s) {
      const e = s.set?.extent ?? 0;
      const lift = e * TRAVEL;
      stack.set(stackPlates(s.weight, s.max, 12), lift);
      const bp = barAt(e);
      bar.position.set(...bp);
      a.copy(stack.top).setZ(STACK_Z).setY(stack.top.y + lift);
      b.set(0, 2.06, STACK_Z);
      toStack.set(a, b);
      a.set(0, 2.18, STACK_Z - 0.02);
      b.set(0, 2.0, TOP[2]);
      across.set(a, b);
      a.set(0, 1.9, TOP[2]);
      b.set(bp[0], bp[1] + 0.06, bp[2]);
      down.set(a, b);
    },
    pose(p, s) {
      const e = s.set?.extent ?? 0;
      p.hips([0, 0.44, -0.02], -0.08 - 0.2 * e);
      const bp = barAt(e);
      for (const side of [-1, 1] as const) {
        p.foot(side, [side * 0.15, 0.06, 0.3]);
        p.hand(side, [side * 0.44, bp[1] - 0.04, bp[2]]);
      }
      p.head(-0.2 + 0.1 * e);
    },
  };
}
