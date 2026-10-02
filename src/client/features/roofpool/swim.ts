import { POOL, POOL_DECK, POOL_SINK, atPoolEdge, climbOutAt } from '../../../shared/roofpool';
import type { PlayerController } from '../../player';
import { stepTo } from '../../player/collide';

// In the pool on the roof yourself (flrnoh fork, see FORK.md "Pool party on the roof"): jump in off
// the deck and you're swimming, the pool holding you (PlayerController.rig) like the sea does
// (features/beach/swim.ts): slower going, your head bobbing at the surface, E at a wall to climb out
// onto the deck. Everyone else sees it from where you are (inPoolAt in shared/roofpool.ts).

const SWIM = 1.8;
const SWIM_FAST = 2.8;

export interface PoolHooks {
  stroke(at: { x: number; z: number }): void;
  out(): void;
}

export class PoolSwim {
  active = false;
  /** Further down for a moment after jumping in, easing back up. */
  private dunk = 0;
  private strokeT = 0;
  private t = 0;

  constructor(
    private player: PlayerController,
    private hooks: PoolHooks,
  ) {}

  /** At a wall, near enough to climb out. */
  get atEdge(): boolean {
    return this.active && atPoolEdge(this.player.pos.x, this.player.pos.z);
  }

  /** Into the water where you are, `jump` 0..1 how hard you went in. */
  enter(jump: number) {
    if (this.active) return;
    const p = this.player;
    this.active = true;
    this.dunk = 0.1 + 0.3 * jump;
    p.stopWalking();
    p.vy = 0;
    p.rig = (dt) => this.step(dt);
  }

  leave() {
    if (!this.active) return;
    this.active = false;
    this.dunk = 0;
    if (this.player.rig) this.player.rig = null;
  }

  /** Up over the nearest wall onto the deck. */
  climbOut() {
    if (!this.atEdge) return;
    const p = this.player;
    const at = climbOutAt(p.pos.x, p.pos.z);
    this.leave();
    p.pos.set(at.x, POOL_DECK.top, at.z);
    p.vy = 0;
    p.grounded = true;
    this.hooks.out();
  }

  private step(dt: number) {
    const p = this.player;
    this.t += dt;
    let ix = 0;
    let iz = 0;
    if (p.holding('KeyW', 'ArrowUp')) iz -= 1;
    if (p.holding('KeyS', 'ArrowDown')) iz += 1;
    if (p.holding('KeyA', 'ArrowLeft')) ix -= 1;
    if (p.holding('KeyD', 'ArrowRight')) ix += 1;
    const steering = ix !== 0 || iz !== 0;
    p.moving = steering;
    if (p.view === 'first') p.facing = Math.atan2(Math.sin(p.camYaw + Math.PI), Math.cos(p.camYaw + Math.PI));
    if (steering) {
      const len = Math.hypot(ix, iz);
      ix /= len;
      iz /= len;
      const sin = Math.sin(p.camYaw);
      const cos = Math.cos(p.camYaw);
      const dx = ix * cos + iz * sin;
      const dz = -ix * sin + iz * cos;
      const speed = p.holding('ShiftLeft', 'ShiftRight') ? SWIM_FAST : SWIM;
      p.grounded = false;
      // What's in your way as just over the roof's floor: your feet are down in it (the roof's deck is
      // a slab you'd only ever get out of toward its edge), and the pool's walls still keep you in.
      const sunk = p.pos.y;
      p.pos.y = 0.05;
      stepTo(p, p.pos.x + dx * speed * dt, p.pos.z);
      stepTo(p, p.pos.x, p.pos.z + dz * speed * dt);
      p.pos.y = sunk;
      if (p.view === 'third') {
        const want = Math.atan2(dx, dz);
        p.facing += Math.atan2(Math.sin(want - p.facing), Math.cos(want - p.facing)) * Math.min(1, dt * 8);
      }
      this.strokeT += dt;
      if (this.strokeT > 0.75) {
        this.strokeT = 0;
        this.hooks.stroke(p.pos);
      }
    }
    this.dunk *= Math.exp(-dt * 2.5);
    const want = POOL.surface - POOL_SINK - this.dunk + Math.sin(this.t * 2.2) * 0.04;
    p.pos.y += (want - p.pos.y) * Math.min(1, dt * 9);
  }
}
