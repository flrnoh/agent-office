import * as THREE from 'three';
import { MG_ROOM } from '../../../shared/minigolf';
import { headingToHole, headingToRoom, toRoom, type HoleDef } from '../../../shared/minigolf-holes';
import { BALL_R, wrapAngle } from '../../../shared/minigolf-physics';
import { isTyping, type PlayerController } from '../../player';
import { modalOpen } from '../../ui/dom';
import type { Person } from '../../world/character';
import { feltAt } from './course';

/*
 * Putting (flrnoh fork, see FORK.md "Black-light mini golf"): over your ball with the putter, the
 * camera low behind it looking down the line. The mouse (or A and D) aims, holding Space runs the
 * power meter up and down (like the street golf's tee), letting go putts. The camera follows the ball
 * until it stops, then you're over it again for the next one (if it's still yours to play), or let go
 * to walk on. E puts the putter down (you keep it), Q picks the ball up (a "+").
 */

/** The meter runs from nothing to full in this long, then back down. */
const METER = 1.6;
/** A and D turn the aim this fast (rad/s). */
const TURN = 0.35;
/** You stand this far from the ball, square to the line. */
const STANCE = 0.5;
/** Let go under this and it's no putt. */
const MIN_POWER = 0.02;

export type PuttStage = 'aim' | 'charge' | 'watch';

export interface PuttHooks {
  /** Where your ball lies now (its hole and where on it, the hole's frame), or null with nothing to play. */
  lie(): { def: HoleDef; x: number; z: number } | null;
  /** Whether it's yours to putt now (alone, or your turn in your group), and whose it is if not. */
  turn(): { mine: boolean; whose: string | null };
  /** Your ball in the room now, and whether it's still rolling (null: none to follow). */
  ball(): { at: THREE.Vector3; rolling: boolean; holed: boolean } | null;
  /** Off it goes: heading `dir` in the hole's frame, `power` 0–1. */
  putt(def: HoleDef, dir: number, power: number): void;
  /** Q: picks the ball up. */
  pickup(): void;
  /** Room ↔ world (the room's group may stand anywhere in the scene). */
  toWorld(v: THREE.Vector3): THREE.Vector3;
  /** The putter's down (by you, or because you've nothing to play). */
  done(): void;
  /** Redraw the hint. */
  changed(): void;
}

const wrap = wrapAngle;
const lookAt = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);

export class Putter {
  private stage: PuttStage | null = null;
  /** Which way you aim, a room heading (0 toward +z, turning toward +x). */
  aim = 0;
  private chargeAt = 0;
  private lastPower = -1;
  private watchedAt = 0;
  private stoppedAt = 0;
  private def: HoleDef | null = null;
  private camPos = new THREE.Vector3();
  private camQuat = new THREE.Quaternion();
  private chaseDir = 0;
  /** Where the ball was last seen while watching it. */
  private seen = new THREE.Vector3();
  private seenAny = false;
  /** The aim line on the felt: shown while aiming. */
  readonly guide: THREE.Mesh;

  constructor(
    private readonly player: PlayerController,
    private readonly me: Person,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly hooks: PuttHooks,
  ) {
    const g = new THREE.PlaneGeometry(0.03, 1);
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0, 0.5);
    this.guide = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, depthWrite: false }));
    this.guide.visible = false;
    this.guide.raycast = () => {}; // the crosshair goes through it
    window.addEventListener('keydown', (e) => this.key(e, true));
    window.addEventListener('keyup', (e) => this.key(e, false));
    window.addEventListener('blur', () => this.stage === 'charge' && this.cancel());
  }

  get active(): boolean {
    return this.stage !== null;
  }

  get doing(): PuttStage | null {
    return this.stage;
  }

  /** How far the meter's up (0–1) while Space is held. */
  get power(): number {
    if (this.stage !== 'charge') return 0;
    const p = ((performance.now() - this.chargeAt) / 1000 / METER) % 2;
    return p > 1 ? 2 - p : p;
  }

  get last(): number {
    return this.lastPower;
  }

  /** Over your ball, aiming at the cup. */
  start(): boolean {
    const lie = this.hooks.lie();
    if (!lie) return false;
    this.def = lie.def;
    const c = lie.def.course.cup;
    this.aim = headingToRoom(lie.def, Math.atan2(c.x - lie.x, c.z - lie.z));
    const first = this.stage === null;
    this.stage = 'aim';
    this.player.rig = () => this.stand();
    this.stand();
    this.player.camYaw = this.aim + Math.PI;
    if (first) {
      this.camPos.copy(this.camera.position);
      this.camQuat.copy(this.camera.quaternion);
    }
    this.me.setGolf(true);
    this.hooks.changed();
    return true;
  }

  /** The putter down: on your feet beside the ball. */
  stop() {
    if (!this.stage) return;
    this.stage = null;
    this.guide.visible = false;
    const p = this.player;
    p.rig = null;
    p.lookPitch = -0.08;
    if (p.view === 'third') p.camYaw = p.facing + Math.PI;
    this.me.setGolf(false);
    this.stoppedAt = performance.now();
    this.hooks.done();
  }

  /** Just put down (so E doesn't pick it straight back up). */
  get justStopped(): boolean {
    return performance.now() - this.stoppedAt < 300;
  }

  private stand() {
    const lie = this.hooks.lie();
    if (!lie) return;
    const at = toRoom(lie.def, lie.x, lie.z);
    const w = this.hooks.toWorld(new THREE.Vector3(at.x + Math.cos(this.aim) * STANCE, 0, at.z - Math.sin(this.aim) * STANCE));
    const p = this.player;
    p.pos.set(w.x, p.pos.y, w.z);
    p.facing = this.aim - Math.PI / 2;
    p.moving = false;
  }

  update(dt: number) {
    if (!this.stage) return;
    const p = this.player;
    if (this.stage === 'aim' || this.stage === 'charge') {
      let aim = wrap(p.camYaw - Math.PI);
      if (p.holding('KeyA', 'ArrowLeft')) aim += TURN * dt;
      if (p.holding('KeyD', 'ArrowRight')) aim -= TURN * dt;
      this.aim = aim;
      p.camYaw = aim + Math.PI;
      if (this.stage === 'charge') this.me.golfBack(this.power * 0.35);
    }
    if (this.stage === 'watch') {
      const b = this.hooks.ball();
      const now = performance.now();
      if (!b || !b.rolling) {
        if (!this.watchedAt) this.watchedAt = now;
        if (now - this.watchedAt > (b?.holed ? 2600 : 700)) this.next();
      }
    }
    this.placeGuide();
    this.placeCamera(dt);
  }

  /** The ball's stopped: over it again if it's still yours to play, else the putter down. */
  private next() {
    this.watchedAt = 0;
    const lie = this.hooks.lie();
    if (!lie || lie.def !== this.def || !this.hooks.turn().mine) return this.stop();
    this.start();
  }

  private key(e: KeyboardEvent, down: boolean) {
    if (!this.stage || e.code !== 'Space') return;
    if (down && (e.repeat || isTyping(e) || modalOpen() || e.metaKey || e.ctrlKey || e.altKey)) return;
    if (down && this.stage === 'aim') {
      if (!this.hooks.turn().mine) return;
      this.stage = 'charge';
      this.chargeAt = performance.now();
    } else if (!down && this.stage === 'charge') {
      const power = this.power;
      if (power < MIN_POWER) return this.cancel();
      this.lastPower = power;
      this.me.golfBack(0);
      this.stage = 'watch';
      this.watchedAt = 0;
      this.chaseDir = this.aim;
      this.seenAny = false;
      if (this.def) this.hooks.putt(this.def, wrap(headingToHole(this.def, this.aim)), power);
      this.hooks.changed();
    }
  }

  /** A swing you didn't follow through. */
  private cancel() {
    this.stage = 'aim';
    this.me.golfBack(0);
  }

  /** Q while aiming: the ball's picked up. */
  pickup() {
    if (this.stage !== 'aim' || !this.hooks.turn().mine) return;
    this.hooks.pickup();
    this.stop();
  }

  private placeGuide() {
    const lie = this.stage === 'aim' || this.stage === 'charge' ? this.hooks.lie() : null;
    this.guide.visible = !!lie;
    if (!lie) return;
    const at = toRoom(lie.def, lie.x, lie.z);
    this.guide.position.set(at.x, lie.def.base + feltAt(lie.def, lie.x, lie.z) + 0.006, at.z);
    this.guide.rotation.y = this.aim;
    const k = this.stage === 'charge' ? this.power : 0;
    this.guide.scale.set(1, 1, 0.5 + k * 2.2);
    (this.guide.material as THREE.MeshBasicMaterial).opacity = this.hooks.turn().mine ? 0.55 : 0.18;
  }

  private placeCamera(dt: number) {
    const want = new THREE.Vector3();
    const target = new THREE.Vector3();
    const b = this.stage === 'watch' ? this.hooks.ball() : null;
    if (b) {
      this.seen.copy(b.at);
      this.seenAny = true;
    }
    if (b || (this.stage === 'watch' && this.seenAny)) {
      // Behind the ball the way it's going, a little above it; while it's out of sight (in a tunnel,
      // down a pipe) further back and higher, over where it went in.
      const sin = Math.sin(this.chaseDir);
      const cos = Math.cos(this.chaseDir);
      if (b) {
        want.set(this.seen.x - sin * 1.6, this.seen.y + 1.2, this.seen.z - cos * 1.6);
        target.copy(this.seen);
      } else {
        want.set(this.seen.x - sin * 0.8, this.seen.y + 3, this.seen.z - cos * 0.8);
        target.set(this.seen.x + sin * 2.6, this.seen.y, this.seen.z + cos * 2.6);
      }
    } else {
      const lie = this.hooks.lie();
      if (!lie) return;
      const at = toRoom(lie.def, lie.x, lie.z);
      const y = lie.def.base + feltAt(lie.def, lie.x, lie.z) + BALL_R;
      const sin = Math.sin(this.aim);
      const cos = Math.cos(this.aim);
      // Behind the ball, a little to the side away from you (you stand on its left), looking down the line.
      want.set(at.x - sin * 1.3 - cos * 0.32, y + 0.95, at.z - cos * 1.3 + sin * 0.32);
      target.set(at.x + sin * 2.2 - cos * 0.12, y, at.z + cos * 2.2 + sin * 0.12);
    }
    // In the room, under its ceiling.
    want.x = THREE.MathUtils.clamp(want.x, MG_ROOM.minX + 0.2, MG_ROOM.maxX - 0.2);
    want.z = THREE.MathUtils.clamp(want.z, MG_ROOM.minZ + 0.2, MG_ROOM.maxZ - 0.2);
    want.y = THREE.MathUtils.clamp(want.y, 0.3, MG_ROOM.ceiling - 0.25);
    const k = 1 - Math.exp(-dt * (b ? 4.5 : 7));
    this.camPos.lerp(this.hooks.toWorld(want), k);
    lookAt.lookAt(this.camPos, this.hooks.toWorld(target), UP);
    this.camQuat.slerp(new THREE.Quaternion().setFromRotationMatrix(lookAt), k);
    this.camera.position.copy(this.camPos);
    this.camera.quaternion.copy(this.camQuat);
  }

  /** While watching: which way the ball goes (a room heading), so the camera swings round behind it. */
  steer(vx: number, vz: number, dt: number) {
    if (this.stage !== 'watch' || Math.hypot(vx, vz) < 0.25) return;
    const want = Math.atan2(vx, vz);
    this.chaseDir += wrap(want - this.chaseDir) * Math.min(1, dt * 2.5);
  }
}
