import { SWIM_SINK } from '../../../shared/beach';
import type { Bones } from '../../world/character/person';
import { HIPS } from '../../world/character/rig';

// How a body looks in the sea and in a boat (flrnoh fork, see FORK.md "A day at the beach"), laid over
// a Person each frame by its `setWorkout` (it runs after the Person's own update): wading, swimming
// breaststroke with the head up, treading water, and sitting in a jetski's saddle or on a boat's
// bench. Bones' arms: `armR` is on -x (the character's right), and an arm swings out to its own
// side with -z on the right, +z on the left; -x is forward, for arms and legs alike.

/** Everything a pose turns, back to standing, before it lays its own over it. */
function reset(b: Bones) {
  for (const limb of [b.armL, b.armR, b.legL, b.legR]) limb.rotation.set(0, 0, 0);
  b.body.position.set(0, 0, 0);
  b.body.rotation.set(0, 0, 0);
  b.head.rotation.set(0, 0, 0);
}

/**
 * In the sea, `depth` m down (0 on the sand … SWIM_SINK swimming), `moving` or not, `t` seconds on
 * the clock (`phase` keeps two swimmers out of step).
 */
export function seaPose(b: Bones, depth: number, moving: boolean, t: number, phase = 0) {
  reset(b);
  const swim = depth >= SWIM_SINK * 0.75;
  if (!swim) {
    // Wading: walking with high steps, arms out a little for balance, held up out of the water.
    const s = moving ? Math.sin(t * 8 + phase) : 0;
    b.legL.rotation.x = -0.6 * s - (moving ? 0.25 : 0);
    b.legR.rotation.x = 0.6 * s - (moving ? 0.25 : 0);
    const out = 0.25 + Math.min(0.6, depth);
    b.armR.rotation.set(-0.2 - 0.2 * s, 0, -out);
    b.armL.rotation.set(-0.2 + 0.2 * s, 0, out);
    b.body.rotation.z = 0.04 * s;
    return;
  }
  const bob = Math.sin(t * 2.2 + phase) * 0.04;
  if (moving) {
    // Breaststroke, head up: lean in, arms reach forward and sweep round, a frog kick behind.
    const lean = 0.85;
    b.body.rotation.x = lean;
    // Lifted as far as the lean drops the head, and a little more: chin on the water.
    b.body.position.y = 1.32 * (1 - Math.cos(lean)) + 0.06 + bob;
    b.body.position.z = -1.32 * Math.sin(lean) * 0.55;
    b.head.rotation.x = -lean * 0.8;
    const p = t * 4.2 + phase;
    const reach = (Math.sin(p) + 1) / 2;
    const sweep = Math.max(0, Math.cos(p));
    for (const [arm, side] of [
      [b.armR, -1],
      [b.armL, 1],
    ] as const) arm.rotation.set(-1.6 - 1.1 * reach, 0, side * (0.15 + 0.9 * sweep));
    const kick = (Math.sin(p + Math.PI * 0.6) + 1) / 2;
    for (const [leg, side] of [
      [b.legR, -1],
      [b.legL, 1],
    ] as const) leg.rotation.set(0.5 + 0.5 * kick, 0, side * 0.45 * (1 - kick));
    return;
  }
  // Treading water: upright, arms sculling out to the sides, legs cycling.
  b.body.position.y = 0.08 + bob;
  b.body.rotation.x = 0.12;
  const scull = Math.sin(t * 3.4 + phase);
  b.armR.rotation.set(-0.5 + 0.25 * scull, 0, -1.15 - 0.2 * scull);
  b.armL.rotation.set(-0.5 - 0.25 * scull, 0, 1.15 + 0.2 * scull);
  b.legR.rotation.x = 0.45 * Math.sin(t * 4 + phase) - 0.2;
  b.legL.rotation.x = -0.45 * Math.sin(t * 4 + phase) - 0.2;
}

/** In a craft: sitting `hips` m up, astride a jetski's saddle or on a bench, hands on the bars if `driving`. */
export function ridePose(b: Bones, hips: number, astride: boolean, driving: boolean, lean: number) {
  reset(b);
  b.body.position.y = hips - HIPS;
  b.body.rotation.x = astride ? 0.18 + lean * 0.3 : lean * 0.15;
  b.legR.rotation.set(astride ? -1.0 : -1.35, 0, astride ? -0.35 : 0);
  b.legL.rotation.set(astride ? -1.0 : -1.35, 0, astride ? 0.35 : 0);
  if (driving) {
    b.armR.rotation.set(-1.25, 0, astride ? -0.28 : 0.15);
    b.armL.rotation.set(-1.25, 0, astride ? 0.28 : -0.15);
  } else {
    b.armR.rotation.set(-0.55, 0, 0);
    b.armL.rotation.set(-0.55, 0, 0);
  }
}
