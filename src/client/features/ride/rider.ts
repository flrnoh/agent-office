import { drive, type CarPose, type Pedals } from '../../../shared/garage';
import { BIKES, rideable, type BikeKind } from '../../../shared/ride';
import type { PlayerController } from '../../player';
import { blockerAt, groundAt } from '../../player/collide';

// On a bike from the bike shop (flrnoh fork, see FORK.md "Shops to walk into"): like the beach's Helm
// it takes hold of you (PlayerController.rig) until you get off: W and S pedal and brake, A and D
// steer (the cars' bicycle model, shared/garage.ts, with the bike's own tuning), Space hops. You go
// where your feet would (what you'd bump into stops you, kerbs are ridden up) but never in through a
// shop's door (shared/ride.ts rideable). Everyone else sees you through your own `move`.

const GRAVITY = 18;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export interface RiderHooks {
  /** Ran into something at `speed` m/s. */
  bump(speed: number): void;
  /** Left the ground (a hop), or came down on it hard. */
  hop(): void;
  land(hard: boolean): void;
}

export class Rider {
  bike: BikeKind | null = null;
  /** Meters ridden: the wheels and the pedals turn with it. */
  meters = 0;
  steer = 0;
  speed = 0;
  private heading = 0;
  private vy = 0;
  private airborne = false;
  private bumpedAt = -Infinity;
  private clock = 0;
  private camWas: { dist: number; pitch: number } | null = null;

  constructor(
    private player: PlayerController,
    private hooks: RiderHooks,
  ) {}

  get active(): boolean {
    return this.bike !== null;
  }

  /** Up onto bike `k` where you stand, facing `rotY`. */
  mount(k: BikeKind, rotY: number) {
    if (this.bike) return;
    const p = this.player;
    p.stopWalking();
    p.moving = false;
    p.vy = 0;
    this.bike = k;
    this.heading = rotY;
    this.speed = 0;
    this.steer = 0;
    this.vy = 0;
    this.airborne = false;
    if (p.view === 'first') p.camYaw = rotY + Math.PI;
    else {
      this.camWas = { dist: p.camDist, pitch: p.camPitch };
      p.camDist = Math.max(p.camDist, 4.5);
      p.camYaw = rotY + Math.PI;
    }
    p.rig = (dt) => this.step(dt);
    p.riding = true;
  }

  /** Off the bike, on your feet where it stood. */
  dismount() {
    if (!this.bike) return;
    const p = this.player;
    p.rig = null;
    p.riding = false;
    p.moving = false;
    p.pos.y = Math.max(groundAt(p.colliders, p.pos.x, p.pos.z, p.pos.y + 0.3), p.street);
    if (this.camWas) {
      p.camDist = this.camWas.dist;
      p.camPitch = this.camWas.pitch;
      this.camWas = null;
    }
    this.bike = null;
    this.speed = 0;
  }

  /** A hop (or the BMX's jump): only with both wheels down. */
  hop() {
    if (!this.bike || this.airborne) return;
    this.vy = BIKES[this.bike].hop;
    this.airborne = true;
    this.hooks.hop();
  }

  /** Where `pose` puts you: no shop's room, nothing in the way at your height. */
  private fits(x: number, z: number, y: number): boolean {
    const p = this.player;
    if (!rideable(x, z)) return false;
    const hit = blockerAt(p, x, z, y, true);
    // A kerb or a step you can ride up.
    return !hit || hit.top - y <= 0.32;
  }

  step(dt: number) {
    const k = this.bike;
    if (!k) return;
    const p = this.player;
    this.clock += dt;
    const pedals: Pedals = {
      gas: (p.holding('KeyW', 'ArrowUp') ? 1 : 0) - (p.holding('KeyS', 'ArrowDown') ? 1 : 0),
      turn: (p.holding('KeyA', 'ArrowLeft') ? 1 : 0) - (p.holding('KeyD', 'ArrowRight') ? 1 : 0),
      brake: false,
    };
    const from: CarPose = { x: p.pos.x, z: p.pos.z, rotY: this.heading, speed: this.speed, steer: this.steer };
    // In the air you roll on as you were: no pedalling, no steering.
    const next = this.airborne ? { ...from, x: from.x + Math.sin(from.rotY) * from.speed * dt, z: from.z + Math.cos(from.rotY) * from.speed * dt } : drive(from, pedals, dt, BIKES[k].tuning);
    if (this.fits(next.x, next.z, p.pos.y)) {
      p.pos.x = next.x;
      p.pos.z = next.z;
    } else if (this.fits(next.x, p.pos.z, p.pos.y)) p.pos.x = next.x;
    else if (this.fits(p.pos.x, next.z, p.pos.y)) p.pos.z = next.z;
    else {
      if (Math.abs(next.speed) > 2 && this.clock - this.bumpedAt > 0.5) {
        this.bumpedAt = this.clock;
        this.hooks.bump(Math.abs(next.speed));
      }
      next.speed = -next.speed * 0.2;
    }
    const moved = Math.hypot(p.pos.x - from.x, p.pos.z - from.z);
    this.meters += moved * Math.sign(next.speed || 1);
    this.speed = next.speed;
    this.steer = next.steer;
    const turned = wrap(next.rotY - this.heading);
    this.heading = next.rotY;
    // Up and down: kerbs, hops.
    const ground = Math.max(groundAt(p.colliders, p.pos.x, p.pos.z, p.pos.y + 0.33), p.street);
    if (this.airborne || p.pos.y > ground + 0.35) {
      this.airborne = true;
      this.vy -= GRAVITY * dt;
      p.pos.y += this.vy * dt;
      if (p.pos.y <= ground) {
        this.hooks.land(this.vy < -5);
        p.pos.y = ground;
        this.vy = 0;
        this.airborne = false;
      }
    } else p.pos.y = ground;
    p.facing = this.heading;
    p.moving = Math.abs(this.speed) > 0.3;
    if (p.view === 'first') p.camYaw += turned;
    else {
      const kk = Math.min(1, dt * 2.5 * Math.min(1, Math.abs(this.speed) / 3));
      p.camYaw += wrap(this.heading + Math.PI - p.camYaw) * kk;
    }
  }
}
