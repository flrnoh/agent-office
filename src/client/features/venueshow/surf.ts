import { STAGE_HEIGHT } from '../../../shared/venue';
import { SURF_END_Z, SURF_HEIGHT, SURF_SPEED, crowdArea } from '../../../shared/venueshow';
import type { PlayerController } from '../../player';
import type { Bones } from '../../world/character';

// Crowd-surfing in the SCHALLWERK (flrnoh fork, see FORK.md "The show"): E at the stage's front edge
// and you dive. With a crowd there, its hands catch you and pass you back over their heads, rolling
// a little from side to side, to the back of the floor, where they set you down on your feet; with
// nobody there to catch you, you land flat on the floor in front of the stage. Everyone sees you go
// (your `move`s, and lying on your back: `show.surf`).

export type SurfEnd = 'down' | 'fell' | 'stopped';

export class Surf {
  active = false;
  private phase: 'lift' | 'carry' | 'down' | 'fall' = 'lift';
  private t = 0;
  private from = { x: 0, y: 0, z: 0 };
  private x = 0;
  private z = 0;
  private seed = 0;

  constructor(
    private player: PlayerController,
    private hooks: { ended(how: SurfEnd): void; landed(): void },
  ) {}

  /** Off the edge: `caught` when there's a crowd to catch you. */
  start(caught: boolean) {
    const p = this.player;
    this.active = true;
    this.t = 0;
    this.seed = Math.random() * 100;
    this.from = { x: p.pos.x, y: p.pos.y, z: p.pos.z };
    const area = crowdArea('club');
    this.x = Math.max(area.minX + 0.5, Math.min(area.maxX - 0.5, p.pos.x));
    this.z = p.pos.z;
    this.phase = caught ? 'lift' : 'fall';
    p.stopWalking();
    p.vy = 0;
    p.eyeDrop = 0;
    p.rig = (dt) => this.step(dt);
  }

  stop(how: SurfEnd = 'stopped') {
    if (!this.active) return;
    this.active = false;
    const p = this.player;
    if (p.rig) p.rig = null;
    p.eyeDrop = 0;
    if (p.pos.y > 0.05 && how !== 'stopped') p.pos.y = 0;
    this.hooks.ended(how);
  }

  /** Where you are on the way: for the crowd's hands. */
  where(): { x: number; z: number } | null {
    return this.active && this.phase !== 'fall' ? { x: this.player.pos.x, z: this.player.pos.z } : null;
  }

  private step(dt: number) {
    const p = this.player;
    this.t += dt;
    if (this.phase === 'fall') {
      // A belly flop off the front of the stage.
      const k = Math.min(1, this.t / 0.55);
      p.pos.set(this.from.x, Math.max(0, this.from.y + 0.6 * Math.sin(k * Math.PI) - this.from.y * k * k), this.from.z - 1.6 * k);
      p.eyeDrop = 1.1 * k;
      if (k >= 1) {
        this.hooks.landed();
        this.stop('fell');
      }
      return;
    }
    if (this.phase === 'lift') {
      // Off the edge, onto the first hands.
      const k = Math.min(1, this.t / 0.7);
      p.pos.set(this.from.x + (this.x - this.from.x) * k, this.from.y + (SURF_HEIGHT - this.from.y) * k + 0.4 * Math.sin(k * Math.PI), this.from.z - 1.2 * k);
      p.eyeDrop = 1.25 * k;
      if (k >= 1) {
        this.phase = 'carry';
        this.z = p.pos.z;
      }
      p.facing = Math.PI;
      return;
    }
    if (this.phase === 'carry') {
      // Passed back hand over hand, rolling a little, wobbling sideways.
      this.z -= SURF_SPEED * dt * (0.8 + 0.4 * Math.abs(Math.sin(this.t * 1.7 + this.seed)));
      const wob = 0.6 * Math.sin(this.t * 0.9 + this.seed) + 0.25 * Math.sin(this.t * 2.3);
      p.pos.set(this.x + wob, SURF_HEIGHT + 0.07 * Math.abs(Math.sin(this.t * 5)), this.z);
      p.facing = Math.PI;
      p.eyeDrop = 1.25;
      if (this.z <= SURF_END_Z + 0.6) {
        this.phase = 'down';
        this.t = 0;
        this.from = { x: p.pos.x, y: p.pos.y, z: p.pos.z };
      }
      return;
    }
    // Set down on your feet at the back.
    const k = Math.min(1, this.t / 0.8);
    p.pos.set(this.from.x, this.from.y * (1 - k), this.from.z - 0.6 * k);
    p.eyeDrop = 1.25 * (1 - k);
    if (k >= 1) this.stop('down');
  }
}

/** Lying on your back on the crowd's hands, arms out, legs kicking a little (a Person's workout pose). */
export function surfPose(b: Bones, _dt: number, t: number) {
  b.root.rotation.x = -1.45;
  b.armR.rotation.set(0.2, 0, -2.2 + 0.35 * Math.sin(t * 3));
  b.armL.rotation.set(0.2, 0, 2.2 - 0.35 * Math.sin(t * 3 + 1));
  b.legR.rotation.set(-0.3 + 0.2 * Math.sin(t * 4), 0, -0.15);
  b.legL.rotation.set(-0.3 - 0.2 * Math.sin(t * 4), 0, 0.15);
  b.head.rotation.x = -0.2;
}

/** Back on their feet: the lying down undone (setWorkout(null) does the rest). */
export function unSurf(b: Bones) {
  b.root.rotation.x = 0;
}

/** Whether you could dive from the stage at all: standing up there. */
export const onStageTop = (y: number) => y > STAGE_HEIGHT - 0.3;
