import { SAILBOATS, SAILBOAT_R } from '../../../shared/beach';
import { CRAFT_SPECS, craftFits, craftPoint, steerCraft, specOf } from '../../../shared/boats';
import type { CarPose, Pedals } from '../../../shared/garage';
import type { PlayerController } from '../../player';
import type { Flotilla } from './craft';

// At the helm of a jetski or the motorboat, or riding along (flrnoh fork, see FORK.md "A day at the
// beach"): like the garage's Driver (features/cars/controller.ts), it takes hold of you
// (PlayerController.rig) until you get out. The driver's page runs the craft (shared/boats.ts) and
// tells the office where it's got to; everyone else's follows it.

export interface HelmHooks {
  /** The craft you're driving has got to `pose`: tell the office. */
  moved(craft: number, pose: CarPose): void;
  /** You ran into something at `speed` m/s. */
  bump(at: { x: number; z: number }, speed: number): void;
}

const SEND_EVERY = 0.066;
const BUMP_EVERY = 0.4;
const STEP = 0.3;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export class Helm {
  craft: number | null = null;
  seat: number | null = null;
  /** How hard you're on the throttle (-1 astern), for the engine. */
  gas = 0;
  private clock = 0;
  private sent = { at: -Infinity, x: 0, z: 0, rotY: 0, speed: 0 };
  private bumpedAt = -Infinity;
  private yaw = 0;
  private camWas: { dist: number; pitch: number } | null = null;

  constructor(
    private player: PlayerController,
    private fleet: Flotilla,
    private hooks: HelmHooks,
  ) {}

  get active(): boolean {
    return this.craft !== null;
  }

  get driving(): boolean {
    return this.seat === 0;
  }

  get pose(): CarPose | null {
    return this.craft === null ? null : this.fleet.crafts[this.craft].pose;
  }

  /** Into `seat` of craft `craft`, looking out over the bow. */
  enter(craft: number, seat: number) {
    const v = this.fleet.crafts[craft];
    if (this.active || !v) return;
    this.craft = craft;
    this.seat = seat;
    this.gas = 0;
    const p = this.player;
    p.stopWalking();
    p.moving = false;
    p.vy = 0;
    this.yaw = v.pose.rotY;
    if (p.view === 'first') {
      p.camYaw = v.pose.rotY + Math.PI;
      p.lookPitch = -0.1;
    } else {
      this.camWas = { dist: p.camDist, pitch: p.camPitch };
      p.camDist = Math.max(p.camDist, v.def.kind === 'boat' ? 10 : 8);
      p.camPitch = Math.min(p.camPitch, 0.3);
      p.camYaw = v.pose.rotY + Math.PI;
    }
    p.rig = (dt) => this.step(dt);
    p.riding = true;
    this.sit(0);
  }

  /** Lets go of the craft where it is (getting off, or something else moving you): driving, it stops there. */
  drop() {
    const craft = this.craft;
    if (craft === null) return;
    if (this.driving) {
      const pose = { ...this.fleet.crafts[craft].pose, speed: 0, steer: 0 };
      this.fleet.place(craft, pose);
      this.hooks.moved(craft, pose);
    }
    const p = this.player;
    p.rig = null;
    p.riding = false;
    if (this.camWas) {
      p.camDist = this.camWas.dist;
      p.camPitch = this.camWas.pitch;
      this.camWas = null;
    }
    this.craft = null;
    this.seat = null;
    this.gas = 0;
  }

  private step(dt: number) {
    const craft = this.craft!;
    this.clock += dt;
    if (this.driving) {
      const p = this.player;
      const pedals: Pedals = {
        gas: (p.holding('KeyW', 'ArrowUp') ? 1 : 0) - (p.holding('KeyS', 'ArrowDown') ? 1 : 0),
        turn: (p.holding('KeyA', 'ArrowLeft') ? 1 : 0) - (p.holding('KeyD', 'ArrowRight') ? 1 : 0),
        brake: p.holding('Space'),
      };
      this.gas = pedals.gas;
      const pose = this.move(craft, this.fleet.crafts[craft].pose, pedals, dt);
      this.fleet.place(craft, pose);
      this.send(craft, pose);
    }
    this.sit(dt);
  }

  /** Whether craft `craft` fits at `p`: on open water, clear of the sailboats and the other crafts. */
  private fits(craft: number, p: { x: number; z: number; rotY: number }): boolean {
    if (!craftFits(craft, p)) return false;
    const spec = specOf(craft)!;
    const r = spec.length / 2;
    for (const [x, z] of SAILBOATS) if (Math.hypot(p.x - x, p.z - z) < SAILBOAT_R + r * 0.8) return false;
    for (const o of this.fleet.crafts) {
      if (o.index === craft) continue;
      const or = CRAFT_SPECS[o.def.kind].length / 2;
      // Only the bow end runs into another: they bump bow first, and can lie alongside at the jetty.
      const bow = craftPoint(p, 0, r * 0.7);
      if (Math.hypot(bow.x - o.pose.x, bow.z - o.pose.z) < or * 0.75 + 0.4) return false;
    }
    return true;
  }

  /** The craft `dt` on from `from`, in short steps, bouncing back off whatever's in the way. */
  private move(craft: number, from: CarPose, pedals: Pedals, dt: number): CarPose {
    const n = Math.max(1, Math.ceil((Math.abs(from.speed) * dt) / STEP));
    const h = dt / n;
    const stuck = !this.fits(craft, from);
    let pose = from;
    for (let i = 0; i < n; i++) {
      const next = steerCraft(craft, pose, pedals, h);
      if (stuck ? craftFits(craft, next) || !craftFits(craft, from) : this.fits(craft, next)) {
        pose = next;
        continue;
      }
      this.bumped(pose, Math.abs(pose.speed));
      pose = { ...pose, steer: next.steer, speed: -pose.speed * 0.3 };
      break;
    }
    return pose;
  }

  private bumped(pose: CarPose, speed: number) {
    if (speed < 1.5 || this.clock - this.bumpedAt < BUMP_EVERY) return;
    this.bumpedAt = this.clock;
    this.hooks.bump({ x: pose.x, z: pose.z }, speed);
  }

  private send(craft: number, pose: CarPose) {
    const s = this.sent;
    const changed = Math.abs(pose.x - s.x) + Math.abs(pose.z - s.z) > 0.01 || Math.abs(wrap(pose.rotY - s.rotY)) > 0.004 || pose.speed !== s.speed;
    if (!changed || this.clock - s.at < SEND_EVERY) return;
    this.sent = { at: this.clock, x: pose.x, z: pose.z, rotY: pose.rotY, speed: pose.speed };
    this.hooks.moved(craft, pose);
  }

  /** You in your seat, wherever the craft's got to: in first person turning as it turns, in third the camera swinging round behind it. */
  private sit(dt: number) {
    const p = this.player;
    const at = this.fleet.seatAt(this.craft!, this.seat!)!;
    p.pos.set(at.x, at.y, at.z);
    p.facing = at.rotY;
    p.moving = false;
    const turned = wrap(at.rotY - this.yaw);
    this.yaw = at.rotY;
    if (p.view === 'first') p.camYaw += turned;
    else {
      const speed = Math.abs(this.fleet.crafts[this.craft!].pose.speed);
      const k = Math.min(1, dt * 2.2 * Math.min(1, speed / 4));
      p.camYaw += wrap(at.rotY + Math.PI - p.camYaw) * k;
    }
  }
}
