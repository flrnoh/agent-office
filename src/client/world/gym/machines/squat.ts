import * as THREE from 'three';
import { C, beam, box, led, loadedBar, plate, setGlow, tube, type Machine, type V3 } from './kit';

/*
 * A power cage (flrnoh fork, see kit.ts): four uprights with numbered holes, a pull-up bar across the
 * top, J-hooks holding a loaded bar at shoulder height, safety bars down both sides, plates on storage
 * pegs and band pegs at the feet, and a lime light along the top. The lifter steps under the bar,
 * takes it on their back, squats it rep by rep, and puts it back in the hooks.
 */

const BAR_ON_BACK: V3 = [0, 1.0, -0.3];
const FRONT = 0.6;
const BACK = -0.37;
const XU = 0.64;

export function squat(): Machine {
  const statics = new THREE.Group();
  const live = new THREE.Group();
  for (const s of [-1, 1]) {
    for (const z of [BACK, FRONT]) {
      statics.add(beam([s * XU, 0, z], [s * XU, 2.1, z], 0.08));
      // Numbered holes: a row of dark dots up the inside face.
      for (let i = 0; i < 14; i++) statics.add(box(0.012, 0.022, 0.03, C.rubber, s * (XU - 0.041), 0.35 + i * 0.1, z));
      statics.add(box(0.14, 0.02, 0.14, C.rubber, s * XU, 0.01, z));
    }
    // Side rails at the top and the floor.
    statics.add(box(0.08, 0.08, FRONT - BACK, C.frame, s * XU, 2.06, (FRONT + BACK) / 2));
    statics.add(box(0.08, 0.06, FRONT - BACK + 0.3, C.frame, s * XU, 0.03, (FRONT + BACK) / 2));
    // J-hooks on the back uprights, where the bar sits.
    statics.add(box(0.07, 0.12, 0.04, C.frame2, s * (XU - 0.07), BAR_ON_BACK[1] - 0.02, BACK + 0.02));
    statics.add(box(0.07, 0.04, 0.08, C.frame2, s * (XU - 0.07), BAR_ON_BACK[1] - 0.07, BACK + 0.06));
    statics.add(box(0.075, 0.012, 0.085, C.lime, s * (XU - 0.07), BAR_ON_BACK[1] - 0.045, BACK + 0.06));
    // Safety bars along both sides, at the bottom of a squat.
    statics.add(box(0.05, 0.05, FRONT - BACK + 0.1, C.steel, s * (XU - 0.07), 0.62, (FRONT + BACK) / 2));
    // Plate storage pegs on the back uprights, with bumpers on them, and band pegs at the feet.
    statics.add(tube([s * XU, 0.36, BACK - 0.04], [s * XU, 0.36, BACK - 0.36], 0.025, C.chrome));
    for (let i = 0; i < 3; i++) {
      const pl = plate([25, 20, 15][i], true);
      pl.rotation.y = Math.PI / 2;
      pl.position.set(s * XU, 0.36, BACK - 0.1 - i * 0.08);
      statics.add(pl);
    }
    statics.add(tube([s * XU, 0.12, FRONT], [s * XU, 0.12, FRONT + 0.1], 0.015, C.chrome));
  }
  statics.add(box(2 * XU, 0.08, 0.08, C.frame, 0, 2.06, BACK));
  statics.add(tube([-XU - 0.08, 2.02, FRONT + 0.1], [XU + 0.08, 2.02, FRONT + 0.1], 0.02, C.chrome));
  statics.add(box(2 * XU, 0.08, 0.08, C.frame, 0, 2.1, FRONT));
  statics.add(box(0.5, 0.06, 0.01, C.lime, 0, 2.1, FRONT + 0.045));
  // A lifting mat under it.
  statics.add(box(1.5, 0.02, 1.2, C.rubber, 0, 0.01, 0.15));

  const bar = loadedBar(true);
  live.add(bar.group);
  const glowStrip = led(2 * XU - 0.1, 0.015, 0.02, '#a3e635', 0, 2.02, FRONT - 0.05);
  live.add(glowStrip);
  const onBack = new THREE.Vector3();
  let poseBar: V3 | null = null;
  const racked: V3 = [BAR_ON_BACK[0], BAR_ON_BACK[1], BAR_ON_BACK[2]];

  return {
    statics,
    live,
    spot: [0, 0, 0],
    off: [0, 1.05],
    size: { w: 2 * XU + 0.2, d: FRONT - BACK + 0.2, top: 2.2, cz: (FRONT + BACK) / 2 },
    cam: { eye: [2.2, 2.0, 2.2], look: [0, 0.5, 0] },
    update(s) {
      bar.load(s.weight);
      // In the hooks, or on the lifter's back wherever the pose put it (posed first, see equipment.ts).
      const hold = s.set?.hold ?? 0;
      const at = poseBar && s.on ? poseBar : racked;
      bar.group.position.set(
        THREE.MathUtils.lerp(racked[0], at[0], hold),
        THREE.MathUtils.lerp(racked[1], at[1], hold) + hold * 0.03,
        THREE.MathUtils.lerp(racked[2], at[2], hold),
      );
      setGlow(glowStrip, s.set && s.set.stage === 'rep' ? 0.9 + 0.3 * s.set.extent : 0.45 + 0.12 * Math.sin(s.t * 0.8));
    },
    pose(p, s) {
      const e = s.set?.extent ?? 0;
      // Down: hips drop and sit back, the chest leans over the feet, knees push out.
      p.hips([0, 0.42 - 0.2 * e, -0.02 - 0.12 * e], 0.08 + 0.5 * e);
      p.bodyPoint(0, 1.0, -0.3, onBack);
      poseBar = [0, onBack.y - 0.03, onBack.z];
      const hold = s.set?.hold ?? 0;
      const barY = THREE.MathUtils.lerp(racked[1], poseBar[1], hold) + hold * 0.03;
      const barZ = THREE.MathUtils.lerp(racked[2], poseBar[2], hold);
      for (const side of [-1, 1] as const) {
        p.foot(side, [side * (0.17 + 0.06 * e), 0.06, 0.02]);
        p.hand(side, [side * 0.42, barY, barZ]);
      }
      p.head(-0.15 * e);
    },
  };
}
