import { RELEASE_S } from '../../../shared/bowling-game';
import type { Bones } from '../../world/character';

/*
 * A bowler's delivery (flrnoh fork, see FORK.md "Bowling lanes"), as a pose for the character
 * (Person.setWorkout): the push-away, the swing back as they step, the slide on the last step with
 * the body low, the ball let go at the bottom of the swing as RELEASE_S runs out, the follow-through
 * up past the shoulder, held a moment, then back to standing. Where they walk is their own (the
 * bowler's page moves them); this is only their limbs. Forward is +z; armR is their right arm.
 */

/** How long the pose lasts from the first step. */
export const POSE_S = RELEASE_S + 1.7;

const lerp = (a: number, b: number, k: number) => a + (b - a) * Math.min(1, Math.max(0, k));
const smooth = (k: number) => {
  const x = Math.min(1, Math.max(0, k));
  return x * x * (3 - 2 * x);
};
/** A value along keyframes [time, value], eased between them. */
function track(keys: [number, number][], t: number): number {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) return lerp(keys[i - 1][1], keys[i][1], smooth((t - keys[i - 1][0]) / (keys[i][0] - keys[i - 1][0])));
  return keys[keys.length - 1][1];
}

const R = RELEASE_S;
/** The bowling arm: forward is negative x rotation, back positive. */
const ARM: [number, number][] = [[0, -0.2], [0.22, -0.75], [0.45, 0.1], [0.78, 1.45], [R, -0.35], [R + 0.3, -2.1], [R + 1.05, -1.9], [R + 1.6, 0]];
/** The other arm out to the side for balance. */
const BALANCE: [number, number][] = [[0, 0.1], [0.5, 0.6], [R, 1.2], [R + 1.05, 1.1], [R + 1.6, 0.1]];
const LEAN: [number, number][] = [[0, 0], [0.6, 0.15], [R, 0.42], [R + 1.05, 0.36], [R + 1.6, 0]];
const LOW: [number, number][] = [[0, 0], [0.75, -0.05], [R, -0.2], [R + 1.05, -0.18], [R + 1.6, 0]];

/** The pose from `t0` (seconds on performance.now()'s clock, when the first step starts). */
export function deliveryPose(t0: number): (b: Bones, dt: number, t: number) => void {
  return (b) => {
    const t = performance.now() / 1000 - t0;
    if (t < 0) return;
    b.armR.rotation.set(track(ARM, t), 0, 0.08);
    b.armL.rotation.set(-0.3, 0, track(BALANCE, t));
    b.body.rotation.x = track(LEAN, t);
    b.body.position.y = track(LOW, t);
    // Four steps, then the slide: the left foot forward, the right leg trailing behind and across.
    if (t < R - 0.25) {
      const phase = (t / (R - 0.25)) * Math.PI * 4;
      const sw = Math.sin(phase) * 0.6;
      b.legL.rotation.set(sw, 0, 0);
      b.legR.rotation.set(-sw, 0, 0);
    } else {
      const k = smooth((t - (R - 0.25)) / 0.3) * (1 - smooth((t - R - 1.05) / 0.55));
      b.legL.rotation.set(-0.55 * k, 0, 0);
      b.legR.rotation.set(0.95 * k, 0, -0.35 * k);
    }
  };
}
