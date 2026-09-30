import * as THREE from 'three';
import { stackPlates } from '../../../../shared/gym-motion';
import { C, beam, box, cable as line, led, pulley, setGlow, tube, weightStack, rigid, type Machine, type V3 } from './kit';

/*
 * A cable crossover (flrnoh fork, see kit.ts): two towers, each with its own weight stack, joined by
 * a header with a pull-up bar and a lime light, high pulleys on sliding carriages, and a D-handle on
 * each cable. The lifter stands between them and flies the handles together in front of the chest:
 * both stacks rise and fall with every rep.
 */

const XT = 0.98;
const TZ = -0.12;
const PULLEY_Y = 1.45;
const OPEN: V3 = [0.62, 1.1, 0.06];
const SHUT: V3 = [0.1, 0.95, 0.32];
const TRAVEL = 0.3;

export function cableCross(): Machine {
  const statics = new THREE.Group();
  const live = new THREE.Group();
  const stacks = [-1, 1].map((s) => {
    const x = s * XT;
    // The tower: two uprights round the stack, a foot, the pulley's track on its inner face.
    for (const dz of [-0.14, 0.14]) statics.add(beam([x, 0, TZ + dz], [x, 2.0, TZ + dz], 0.07));
    statics.add(box(0.5, 0.06, 0.5, C.frame, x, 0.03, TZ));
    statics.add(box(0.05, 1.7, 0.06, C.steel, x - s * 0.1, 1.0, TZ + 0.1));
    for (let i = 0; i < 9; i++) statics.add(box(0.015, 0.02, 0.02, C.lime, x - s * 0.128, 0.4 + i * 0.16, TZ + 0.1));
    const carriage = pulley(0.05);
    carriage.position.set(x - s * 0.14, PULLEY_Y, TZ + 0.1);
    statics.add(carriage);
    statics.add(box(0.1, 0.12, 0.08, C.frame2, x - s * 0.1, PULLEY_Y, TZ + 0.1));
    const pTop = pulley(0.05);
    pTop.position.set(x, 2.08, TZ);
    statics.add(pTop);
    const st = weightStack(12, 0.26, 0.13);
    st.group.position.set(x, 0, TZ);
    live.add(st.group);
    return st;
  });
  // The header between the towers, a pull-up bar under it, the light along it.
  statics.add(box(2 * XT + 0.1, 0.1, 0.1, C.frame, 0, 2.02, TZ));
  statics.add(tube([-XT + 0.1, 1.94, TZ + 0.12], [XT - 0.1, 1.94, TZ + 0.12], 0.02, C.chrome));
  for (const s of [-1, 1]) statics.add(box(0.05, 0.12, 0.08, C.frame, s * (XT - 0.3), 1.98, TZ + 0.1));
  const glowStrip = led(2 * XT - 0.3, 0.02, 0.012, '#a3e635', 0, 2.02, TZ + 0.056);
  live.add(glowStrip);

  const handles = [-1, 1].map(() => {
    const g = new THREE.Group();
    g.add(tube([0, 0.05, 0], [0, -0.05, 0], 0.02, C.rubber));
    g.add(tube([0, 0.06, 0], [0, 0.06, -0.06], 0.008, C.chrome));
    g.add(tube([0, -0.06, 0], [0, -0.06, -0.06], 0.008, C.chrome));
    g.add(tube([0, 0.06, -0.06], [0, -0.06, -0.06], 0.008, C.chrome));
    live.add(rigid(g));
    return g;
  });
  const cables = [-1, 1].map(() => {
    const up = line();
    const down = line();
    live.add(up.mesh, down.mesh);
    return { up, down };
  });
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const handAt = (side: -1 | 1, e: number): V3 => [side * THREE.MathUtils.lerp(OPEN[0], SHUT[0], e), THREE.MathUtils.lerp(OPEN[1], SHUT[1], e), THREE.MathUtils.lerp(OPEN[2], SHUT[2], e)];

  return {
    statics,
    live,
    shift: [-1.7, 0],
    spot: [0, 0, 0.05],
    off: [0, 1.0],
    size: { w: 2 * XT + 0.5, d: 0.5, top: 2.1, cz: TZ },
    cam: { eye: [1.2, 2.0, 2.6], look: [0, 0.65, 0] },
    update(s) {
      const e = s.on ? (s.set?.extent ?? 0) : 0;
      const hold = s.on ? 1 : 0;
      for (const side of [-1, 1] as const) {
        const i = side < 0 ? 0 : 1;
        stacks[i].set(stackPlates(s.weight, s.max, 12), e * TRAVEL);
        const h = hold ? handAt(side, e) : ([side * (XT - 0.16), 1.2, TZ + 0.1] as V3);
        handles[i].position.set(...h);
        handles[i].rotation.y = side * (0.4 + 0.8 * e);
        a.set(side * (XT - 0.14), PULLEY_Y - 0.03, TZ + 0.1);
        b.set(h[0], h[1] + 0.07, h[2]);
        cables[i].down.set(a, b);
        a.set(side * XT, stacks[i].top.y + e * TRAVEL, TZ);
        b.set(side * XT, 2.06, TZ);
        cables[i].up.set(a, b);
      }
      setGlow(glowStrip, s.set && s.set.stage === 'rep' ? 0.8 + 0.4 * e : 0.45 + 0.12 * Math.sin(s.t * 0.7 + 1));
    },
    pose(p, s) {
      const e = s.set?.extent ?? 0;
      // A staggered stance, leaning into it.
      p.hips([0, 0.41, 0.03], 0.18 + 0.08 * e);
      p.foot(-1, [-0.15, 0.06, 0.2]);
      p.foot(1, [0.15, 0.06, -0.12]);
      for (const side of [-1, 1] as const) p.hand(side, handAt(side, e));
      p.head(0.05);
    },
  };
}
