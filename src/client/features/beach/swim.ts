import { JETTY, SWIM_SINK, atLadder, seaDepth, swimDepth } from '../../../shared/beach';
import type { PlayerController } from '../../player';
import { stepTo } from '../../player/collide';

// In the sea yourself (flrnoh fork, see FORK.md "A day at the beach"): walk in off the beach and the
// sand slopes away under you until you're swimming; jump off the jetty and you're in at once, with a
// splash. It takes hold of you (PlayerController.rig) while you're in: slower going, your head
// bobbing at the surface, back out up the jetty's ladder or by swimming in until you can stand.
// Everyone else sees it from where you are (your `move`): see swimmingAt in shared/beach.ts.

const WALK = 4.6;
const SWIM = 1.8;
const SWIM_FAST = 2.9;

export interface SeaHooks {
  /** A stroke through the water, for its sound and a ripple. */
  stroke(at: { x: number; z: number }): void;
  /** Out of the water: up the ladder, or back on the sand. */
  out(how: 'ladder' | 'beach'): void;
}

export class Sea {
  /** In the water at all, wading or swimming. */
  active = false;
  /** How deep you stand (see seaDepth): 0 on the sand … SWIM_SINK swimming. */
  depth = 0;
  /** Further down for a moment after jumping in, easing back up. */
  private dunk = 0;
  private strokeT = 0;
  /** Where you are on the water's surface's bob (seconds). */
  private t = 0;

  constructor(
    private player: PlayerController,
    private hooks: SeaHooks,
  ) {}

  /** Swimming rather than wading. */
  get swimming(): boolean {
    return this.active && this.depth >= SWIM_SINK * 0.75;
  }

  /** Whether you're at the jetty's ladder, to climb out. */
  get atLadder(): boolean {
    return this.swimming && atLadder(this.player.pos.x, this.player.pos.z);
  }

  /** Into the water where you are, `street` being your floor's street: `jump` 0..1 how hard you went in. */
  enter(street: number, jump: number) {
    if (this.active) return;
    this.active = true;
    this.street = street;
    this.depth = seaDepth(this.player.pos.x, this.player.pos.z);
    this.dunk = jump > 0 && swimDepth(this.player.pos.x, this.player.pos.z) ? 0.12 + 0.18 * jump : 0;
    const p = this.player;
    p.stopWalking();
    p.vy = 0;
    p.rig = (dt) => this.step(dt);
  }

  private street = 0;

  /** Out of the water's hold on you, where you are (something else is moving you, or you're out). */
  leave() {
    if (!this.active) return;
    this.active = false;
    this.depth = 0;
    this.dunk = 0;
    if (this.player.rig) this.player.rig = null;
  }

  /** Up the ladder onto the jetty's deck. */
  climbOut() {
    if (!this.atLadder) return;
    const p = this.player;
    this.leave();
    p.pos.set(JETTY.ladder.top.x, this.street + JETTY.deck, JETTY.ladder.top.z);
    p.vy = 0;
    p.grounded = true;
    p.facing = Math.PI;
    if (p.view === 'third') p.camYaw = 0;
    this.hooks.out('ladder');
  }

  /** The floor you're on changed under you (another floor's street): the water's that far down too. */
  setStreet(street: number) {
    this.street = street;
  }

  private step(dt: number) {
    const p = this.player;
    this.t += dt;
    let ix = 0;
    let iz = 0;
    if (p.enabled) {
      if (p.holding('KeyW', 'ArrowUp')) iz -= 1;
      if (p.holding('KeyS', 'ArrowDown')) iz += 1;
      if (p.holding('KeyA', 'ArrowLeft')) ix -= 1;
      if (p.holding('KeyD', 'ArrowRight')) ix += 1;
    }
    const steering = ix !== 0 || iz !== 0;
    p.moving = steering;
    if (p.view === 'first') p.facing = Math.atan2(Math.sin(p.camYaw + Math.PI), Math.cos(p.camYaw + Math.PI));
    const fast = p.holding('ShiftLeft', 'ShiftRight');
    if (steering) {
      const len = Math.hypot(ix, iz);
      ix /= len;
      iz /= len;
      const sin = Math.sin(p.camYaw);
      const cos = Math.cos(p.camYaw);
      const dx = ix * cos + iz * sin;
      const dz = -ix * sin + iz * cos;
      // Wading slows you the deeper it gets; swimming's slower still.
      const swim = this.depth >= SWIM_SINK * 0.75;
      const speed = swim ? (fast ? SWIM_FAST : SWIM) : WALK * (1 - (0.55 * this.depth) / SWIM_SINK) * (fast ? 1.3 : 1);
      p.grounded = false;
      stepTo(p, p.pos.x + dx * speed * dt, p.pos.z);
      stepTo(p, p.pos.x, p.pos.z + dz * speed * dt);
      if (p.view === 'third') {
        const want = Math.atan2(dx, dz);
        p.facing += Math.atan2(Math.sin(want - p.facing), Math.cos(want - p.facing)) * Math.min(1, dt * 8);
      }
      this.strokeT += dt;
      if (swim && this.strokeT > (fast ? 0.5 : 0.75)) {
        this.strokeT = 0;
        this.hooks.stroke(p.pos);
      }
    }
    this.depth = seaDepth(p.pos.x, p.pos.z);
    if (this.depth <= 0.02) {
      // Back on the sand: on your own feet again.
      this.leave();
      p.pos.y = this.street;
      p.grounded = true;
      this.hooks.out('beach');
      return;
    }
    // Your feet as far down as it's deep (and a swimmer's head bobbing at the surface).
    this.dunk *= Math.exp(-dt * 2.5);
    const bob = this.depth >= SWIM_SINK * 0.75 ? Math.sin(this.t * 2.2) * 0.04 : 0;
    const want = this.street - this.depth - this.dunk + bob;
    p.pos.y += (want - p.pos.y) * Math.min(1, dt * 9);
  }
}
