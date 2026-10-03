import type * as THREE from 'three';
import type { Ctx } from '../../core/context';
import type { Dancer } from './poses';

/*
 * Dancing in first person (flrnoh fork, see FORK.md "Dancing on the roof"): you don't see your own
 * body, so the dance comes to you through what you do see. The view goes with your body (the hips
 * bouncing and hopping on the beat, swaying from side to side, the shoulders tilting, the head
 * nodding, turning and cocking, banging in a Headbang), and your hands do the move's arms in front
 * of your eyes: up over your head for Hands Up (going up out of sight, as they would), out to the
 * sides for the Arm Wave, across for the Floss, framing your face for Vogue. It's all read off the
 * same eased shape your character's body is in (poses.ts), so it's on the beat as everyone sees you.
 * The spins stay out of it: the room going round once a drop lands is a bit much.
 */

/** How much of the head's and the body's turns the view takes: enough to feel, not to lose the room. */
const NOD = 0.45;
const TURN = 0.35;
const ROLL = 0.6;

/** An arm's shape (see Shape): forward and out, in radians, 0 hanging down, ~2.9 overhead. */
function moveHand(g: THREE.Group, side: 1 | -1, f: number, o: number) {
  const up = Math.min(1, Math.max(0, Math.max(f, o) - 0.25) / 2.6);
  const lift = up * up * (3 - 2 * up);
  // Up into view and, overhead, past its top; out to the side (or in, across the body); forward as it's raised in front.
  g.position.y += 0.34 * lift;
  g.position.x += side * 0.13 * Math.sin(Math.max(-0.9, Math.min(Math.PI / 2, o))) * (1 - 0.4 * lift);
  g.position.z -= 0.12 * Math.sin(Math.min(Math.PI / 2, Math.max(0, f)));
  // The palm turns toward you as it comes up, and tips out to the side with the arm.
  g.rotation.x += 0.7 * lift;
  g.rotation.z += side * 0.45 * Math.sin(Math.max(-0.9, Math.min(Math.PI / 2, o)));
}

/** While `dancer()` has you, in first person: the view and the hands, each frame once they're placed. */
export function danceInFirstPerson(ctx: Ctx, dancer: () => Dancer | null) {
  const { camera, hands, player } = ctx;
  const you = () => (player.view === 'first' ? dancer() : null);
  hands.dancing = (r, l) => {
    const d = you();
    if (!d) return;
    const s = d.shape;
    // The right hand is the one on +x in camera space (its arm is R in the shape).
    moveHand(r, 1, s.rf, s.ro);
    moveHand(l, -1, s.lf, s.lo);
  };
  ctx.view.add({
    update() {
      const d = you();
      if (!d) return;
      const s = d.shape;
      // Your eyes ride on your hips: the bounce, the hops and the dips; and over to the side as they sway.
      camera.position.y += d.bodyY;
      const yaw = player.camYaw;
      // (Their left is the view's left: -right, right being (cos yaw, 0, -sin yaw); forward is (-sin yaw, 0, -cos yaw).)
      camera.position.x += -Math.cos(yaw) * s.hx - Math.sin(yaw) * s.hz;
      camera.position.z += Math.sin(yaw) * s.hx - Math.cos(yaw) * s.hz;
      // The head nods (down is a look down), turns and cocks; the shoulders tilt.
      camera.rotation.x -= NOD * s.nod;
      camera.rotation.y += TURN * (s.turn + 0.5 * s.twist);
      camera.rotation.z += ROLL * (s.cock + 0.5 * s.tilt);
    },
  });
}
