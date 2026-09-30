import { type Ball, ballFromWire, centreBall, kick, stepBall } from '../../shared/soccer-ball';
import type { BallWire } from '../../shared/soccer';

/*
 * The soccer hall's ball on this page (flrnoh fork, see FORK.md "The soccer hall"). The office says
 * where it is about 15 times a second; in between, this page runs the same physics on from the last
 * snapshot (shared/soccer-ball.ts), so it rolls and flies smoothly. When a snapshot disagrees with
 * where it's shown (someone ran it along, a kick from someone far away), the difference is kept as an
 * offset that melts away over a few frames rather than the ball jumping; only a big one (a kickoff,
 * a reconnect) snaps.
 */

/** Further off than this (m), the ball just goes where the office says. */
const SNAP = 2.5;
/** How fast a correction melts away (per second). */
const MELT = 9;

export class BallView {
  /** Where the physics has it (the last snapshot, run on). */
  readonly b: Ball = centreBall();
  /** What's shown: the physics plus the correction still melting. */
  readonly shown = { x: this.b.x, y: this.b.y, z: this.b.z };
  private off = { x: 0, y: 0, z: 0 };

  /** A snapshot from the office. */
  snapshot(w: BallWire) {
    const s = ballFromWire(w);
    const ox = this.shown.x - s.x;
    const oy = this.shown.y - s.y;
    const oz = this.shown.z - s.z;
    Object.assign(this.b, s);
    if (Math.hypot(ox, oy, oz) > SNAP) this.off = { x: 0, y: 0, z: 0 };
    else this.off = { x: ox, y: oy, z: oz };
    this.show();
  }

  /** Your own kick, before the office has it: the ball goes at once (the office's next snapshot confirms or corrects it). */
  kick(power: number, dir: number, loft: number) {
    kick(this.b, power, dir, loft);
  }

  /** On by `dt` seconds. Returns how far it moved along the floor (for rolling it). */
  update(dt: number): { dx: number; dz: number } {
    const x0 = this.shown.x;
    const z0 = this.shown.z;
    stepBall(this.b, Math.min(dt, 0.1));
    const k = Math.exp(-dt * MELT);
    this.off.x *= k;
    this.off.y *= k;
    this.off.z *= k;
    this.show();
    return { dx: this.shown.x - x0, dz: this.shown.z - z0 };
  }

  private show() {
    this.shown.x = this.b.x + this.off.x;
    this.shown.y = Math.max(0, this.b.y + this.off.y);
    this.shown.z = this.b.z + this.off.z;
  }
}
