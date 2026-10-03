import { BASEMENT_FLOOR, LAP_POOL, SWIM_SINK, TOUCH, atLapEdge, inLapPoolAt, lapClimbOut, laneAt, overLapPool } from '../shared/gym-basement';
import type { PlayerController } from './player';
import { stepTo } from './player/collide';
import type { Person } from './world/character';
import { seaPose } from './features/beach/poses';

/*
 * Swimming in the gym's lap pool yourself (flrnoh fork, see shared/gym-basement.ts): jump in off the
 * deck or a starting block (or E at the water for a header) and the pool holds you (PlayerController.rig)
 * like the roof's does (features/roofpool/swim.ts): slower going, your head bobbing at the surface,
 * E at a wall to climb out. Wall to wall is a length: each one is timed, and your best is kept in this
 * browser. Everyone else in the pool is posed swimming, from where they are (inLapPoolAt).
 */

const SWIM = 1.6;
const SWIM_FAST = 2.4;
const BEST_KEY = 'agent-office.gym.best25';

export interface PoolHooks {
  splash(x: number, z: number, strength: number): void;
  stroke(x: number, z: number): void;
  out(): void;
  /** A length done: what to say. */
  lap(text: string): void;
}

export class GymPool {
  swimming = false;
  private dunk = 0;
  private strokeT = 0;
  private t = 0;
  /** How high you've been since you were last on your feet: how hard you go in. */
  private peak = BASEMENT_FLOOR;
  /** The wall the length you're swimming started from, and when. */
  private from: 'w' | 'e' | null = null;
  private since = 0;
  private lengths = 0;
  private posed = new Map<Person, { moving: boolean }>();

  constructor(
    private player: PlayerController,
    private hooks: PoolHooks,
  ) {}

  /** At a wall, near enough to climb out. */
  get atEdge(): boolean {
    return this.swimming && atLapEdge(this.player.pos.x, this.player.pos.z);
  }

  /** E at the water from the deck: a header in, toward the middle of your lane. */
  jumpIn() {
    const p = this.player;
    if (this.swimming || p.rig || p.seat || p.pos.y < BASEMENT_FLOOR - 0.2) return;
    const x = Math.min(LAP_POOL.maxX - 1.2, Math.max(LAP_POOL.minX + 1.2, p.pos.x));
    const z = Math.min(LAP_POOL.maxZ - 1.0, Math.max(LAP_POOL.minZ + 1.0, p.pos.z));
    p.stopWalking();
    p.pos.set(x, Math.max(p.pos.y, BASEMENT_FLOOR) + 0.9, z);
    p.vy = 3.2;
    p.grounded = false;
  }

  /** Every frame in the gym: into the water once you're over it and below its surface. */
  tick(dt: number) {
    const p = this.player;
    if (this.swimming) return;
    if (p.rig || p.seat) {
      this.peak = p.pos.y;
      return;
    }
    this.peak = Math.max(this.peak, p.pos.y);
    if (overLapPool(p.pos.x, p.pos.z, 0.2) && p.pos.y < LAP_POOL.surface) {
      const jump = Math.min(1, Math.max(0, (this.peak - LAP_POOL.surface) / 1.5));
      this.enter(jump);
      this.hooks.splash(p.pos.x, p.pos.z, 0.35 + 0.65 * jump);
      this.peak = p.pos.y;
      return;
    }
    if (p.grounded) this.peak = p.pos.y;
    void dt;
  }

  private enter(jump: number) {
    const p = this.player;
    this.swimming = true;
    this.dunk = 0.15 + 0.35 * jump;
    this.from = null;
    p.stopWalking();
    p.vy = 0;
    p.rig = (dt) => this.step(dt);
  }

  /** Out of the water's hold where you are (something else moved you, or you left the gym). */
  leave() {
    if (!this.swimming) return;
    this.swimming = false;
    this.dunk = 0;
    if (this.player.rig) this.player.rig = null;
  }

  /** Up over the nearest wall onto the deck. */
  climbOut() {
    if (!this.atEdge) return;
    const p = this.player;
    const at = lapClimbOut(p.pos.x, p.pos.z);
    this.leave();
    p.pos.set(at.x, BASEMENT_FLOOR, at.z);
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
      // The deck round the pool reaches down past your feet, so its edge keeps you in.
      stepTo(p, p.pos.x + dx * speed * dt, p.pos.z);
      stepTo(p, p.pos.x, p.pos.z + dz * speed * dt);
      if (p.view === 'third') {
        const want = Math.atan2(dx, dz);
        p.facing += Math.atan2(Math.sin(want - p.facing), Math.cos(want - p.facing)) * Math.min(1, dt * 8);
      }
      this.strokeT += dt;
      if (this.strokeT > 0.7) {
        this.strokeT = 0;
        this.hooks.stroke(p.pos.x, p.pos.z);
      }
    }
    this.dunk *= Math.exp(-dt * 2.5);
    const want = LAP_POOL.surface - SWIM_SINK - this.dunk + Math.sin(this.t * 2.2) * 0.04;
    p.pos.y += (want - p.pos.y) * Math.min(1, dt * 9);
    this.timeLengths();
  }

  /** Wall to wall: a length, timed. */
  private timeLengths() {
    const x = this.player.pos.x;
    const wall = x < LAP_POOL.minX + TOUCH ? 'w' : x > LAP_POOL.maxX - TOUCH ? 'e' : null;
    if (!wall) return;
    const now = performance.now();
    if (this.from && wall !== this.from) {
      const secs = (now - this.since) / 1000;
      this.lengths++;
      let best = Infinity;
      try {
        best = Number(localStorage.getItem(BEST_KEY)) || Infinity;
        if (secs < best) localStorage.setItem(BEST_KEY, secs.toFixed(1));
      } catch {
        // private mode: no best kept
      }
      const record = secs < best ? ' · 🏅 personal best!' : Number.isFinite(best) ? ` · best ${best.toFixed(1)} s` : '';
      this.hooks.lap(`🏊 Length ${this.lengths} · lane ${laneAt(this.player.pos.z) + 1} · 25 m in ${secs.toFixed(1)} s${record}`);
    }
    if (wall !== this.from || !this.from) this.since = now;
    this.from = wall;
  }

  /** Poses whoever is swimming (you and everyone else, by where their feet are), and lets go of whoever got out. */
  pose(bodies: readonly { person: Person; moving: boolean; x: number; y: number; z: number }[]) {
    const now = new Set<Person>();
    for (const b of bodies) {
      if (!inLapPoolAt(b.x, b.y, b.z)) continue;
      now.add(b.person);
      const st = this.posed.get(b.person);
      if (st) {
        st.moving = b.moving;
        continue;
      }
      const mine = { moving: b.moving };
      const phase = this.posed.size * 0.9 + 0.4;
      this.posed.set(b.person, mine);
      b.person.setWorkout((bones, _dt, tt) => seaPose(bones, SWIM_SINK, mine.moving, tt, phase));
    }
    for (const person of [...this.posed.keys()])
      if (!now.has(person)) {
        person.setWorkout(null);
        this.posed.delete(person);
      }
  }

  /** Out of the gym: nobody's posed by the pool any more. */
  release() {
    for (const person of this.posed.keys()) person.setWorkout(null);
    this.posed.clear();
    this.leave();
  }
}
