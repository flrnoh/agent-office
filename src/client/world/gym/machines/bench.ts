import * as THREE from 'three';
import { C, beam, box, foot, loadedBar, pad, plate, tube, type Machine, type V3 } from './kit';

/*
 * A flat bench press (flrnoh fork, see kit.ts): a padded bench on a steel frame, two uprights at the
 * head end with lime-lined J-hooks and spotter arms, plate horns loaded with spare plates, and an
 * Olympic bar in the hooks carrying the weight that's set. The lifter lies on it, feet up on the end,
 * unracks, lowers the bar to the chest and presses it back up, rep after rep, and racks it.
 */

const TOP = 0.36;
const RACK: V3 = [0, 1.08, -0.31];
const LOCK: V3 = [0, 1.05, -0.2];
const CHEST: V3 = [0, 0.94, -0.17];
const HIPS: V3 = [0, 0.66, 0.24];

export function bench(): Machine {
  const statics = new THREE.Group();
  const live = new THREE.Group();
  // The bench.
  statics.add(pad(0.32, 0.09, 1.1, 0, TOP - 0.045, 0.02));
  statics.add(box(0.2, 0.06, 1.0, C.frame, 0, TOP - 0.12, 0.02));
  statics.add(beam([0, 0.02, 0.48], [0, TOP - 0.1, 0.42], 0.06), beam([0, 0.02, -0.4], [0, TOP - 0.1, -0.3], 0.06));
  statics.add(foot(0.42, 0, 0.5), foot(0.42, 0, -0.42));
  // The uprights, J-hooks, spotter arms and plate horns.
  for (const s of [-1, 1]) {
    const x = s * 0.5;
    statics.add(beam([x, 0, -0.38], [x, 1.26, -0.38], 0.07));
    statics.add(box(0.08, 0.03, 0.08, C.lime, x, 1.265, -0.38));
    // A J-hook: a back plate and a lip, lined in lime.
    statics.add(box(0.07, 0.1, 0.03, C.frame2, x - s * 0.06, 1.07, -0.36));
    statics.add(box(0.07, 0.04, 0.07, C.frame2, x - s * 0.06, 1.03, -0.32));
    statics.add(box(0.075, 0.012, 0.075, C.lime, x - s * 0.06, 1.055, -0.32));
    // Spotter arm at chest height.
    statics.add(box(0.06, 0.05, 0.34, C.steel, x - s * 0.05, 0.86, -0.2));
    // Base legs and the plate horn.
    statics.add(box(0.08, 0.06, 0.6, C.frame, x, 0.03, -0.38));
    statics.add(tube([x, 0.28, -0.46], [x + s * 0.3, 0.28, -0.46], 0.025, C.chrome));
    for (let i = 0; i < 3; i++) {
      const pl = plate([20, 10, 5][i], false);
      pl.position.set(x + s * (0.1 + i * 0.05), 0.28, -0.46);
      statics.add(pl);
    }
  }
  statics.add(box(1.07, 0.06, 0.08, C.frame, 0, 0.03, -0.66));
  statics.add(box(1.0, 0.05, 0.05, C.frame, 0, 1.2, -0.42));

  // Live: the bar.
  const bar = loadedBar(false);
  live.add(bar.group);

  const barAt = (s: { set: { extent: number; hold: number } | null }): V3 => {
    const hold = s.set?.hold ?? 0;
    const e = s.set?.extent ?? 0;
    const up: V3 = [0, THREE.MathUtils.lerp(LOCK[1], CHEST[1], e), THREE.MathUtils.lerp(LOCK[2], CHEST[2], e)];
    return [0, THREE.MathUtils.lerp(RACK[1], up[1], hold), THREE.MathUtils.lerp(RACK[2], up[2], hold)];
  };
  return {
    statics,
    live,
    spot: [0, 0, 0.35],
    off: [-0.95, 0.35],
    size: { w: 1.3, d: 1.35, top: 1.25, cz: -0.08 },
    cam: { eye: [1.8, 1.9, 1.2], look: [0, 0.35, -0.1] },
    update(s) {
      bar.load(s.weight);
      bar.group.position.set(...barAt(s));
    },
    pose(p, s) {
      // Lying back, head toward the rack, feet up on the end of the bench.
      p.hips(HIPS, -Math.PI / 2);
      const b = barAt(s);
      const e = s.set?.extent ?? 0;
      const w = 0.4 + e * 0.05;
      for (const side of [-1, 1] as const) {
        p.hand(side, [side * w, b[1] - 0.01, b[2]]);
        p.foot(side, [side * 0.15, TOP + 0.08, 0.6]);
      }
      p.head(0);
    },
  };
}
