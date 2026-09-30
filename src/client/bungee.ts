import * as THREE from 'three';
import { ANCHOR, BUNGEE, NO_BUNGEE, bungeePlan, bungeePose, type BungeePose, type BungeeState } from '../shared/bungee';
import { FLOOR, WALL_T } from '../shared/layout';
import type { ClientMsg, ServerMsg } from '../shared/protocol';
import { EYE_HEIGHT, type PlayerController } from './player';
import type { Interactable } from './world/office';
import type { BungeeJetty } from './world/bungee';
import { toon } from './world/toon';

// Bungee off the roof (flrnoh fork, see FORK.md): E on the jetty's platform asks the office for the
// rope; once it says you're on it, a countdown, the dive, the bounces on the rope, a moment hanging
// head down, the winch back up and over onto the platform. Everyone on the roof works the same curve
// out of the state's `startedAt` and `drop` (shared/bungee.ts), so they see the same jump; the
// jumper's own page moves nobody else, and its player stays put on the platform all along (so a
// reload mid-jump finds you there). This draws the rope, poses the jumper's body, and in the jumper's
// page flies the camera; client/sound.ts has its sounds, world/bungee.ts the jetty.

/** The building's south face: the camera never goes through it. */
const FACADE = FLOOR.maxZ + WALL_T;
const SEGMENTS = 28;
/** Looking ahead off the platform, straight down, and head down out at the city. */
const Q_AHEAD = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.15, Math.PI, 0, 'YXZ'));
const Q_DOWN = new THREE.Quaternion().setFromEuler(new THREE.Euler(-1.15, Math.PI, 0, 'YXZ'));
const Q_HANG = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.45, Math.PI, Math.PI, 'YXZ'));
const X_AXIS = new THREE.Vector3(1, 0, 0);
const UP = new THREE.Vector3(0, 1, 0);

const smooth = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

export interface BungeeDeps {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  player: PlayerController;
  /** Your own body. */
  me: THREE.Object3D;
  /** Someone else's body, by their id. */
  bodyOf(id: string): THREE.Object3D | undefined;
  you(): string;
  officeNow(): number;
  /** The jetty, once the roof's built. */
  jetty(): BungeeJetty | null;
  /** How far below the roof the street is now. */
  drop(): number;
  send(msg: ClientMsg): void;
  toast(text: string, level?: 'info' | 'warn'): void;
  sound: {
    bungee(kind: 'count' | 'go' | 'twang', at?: { x: number; y: number; z: number }): void;
    bungeeWind(level: number): void;
  };
}

type Part = HTMLElement | string;

export class Bungee {
  private state: BungeeState = { ...NO_BUNGEE };
  private rope: THREE.InstancedMesh;
  private overlay: HTMLDivElement | null = null;
  /** You're on the rope: the player's held on the platform by this. */
  private hold: ((dt: number) => void) | null = null;
  private asked = 0;
  /** The jump we last toasted, beeped and twanged for. */
  private seen = { startedAt: -1, beep: -1, taut: false, toast: false };
  /** The salto: when it started (office ms), or 0. */
  private flipAt = 0;
  private poseNow: BungeePose | null = null;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private q2 = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private v2 = new THREE.Vector3();
  private posed: THREE.Object3D | null = null;

  constructor(private d: BungeeDeps) {
    const geo = new THREE.CylinderGeometry(0.03, 0.03, 1, 6).translate(0, 0.5, 0);
    const mat = toon('#ff6b35');
    mat.userData.outlineParameters = { visible: false };
    this.rope = new THREE.InstancedMesh(geo, mat, SEGMENTS);
    this.rope.frustumCulled = false;
    this.rope.visible = false;
    this.rope.raycast = () => {};
    d.scene.add(this.rope);
  }

  /** You're on the rope right now. */
  get jumping(): boolean {
    return this.hold !== null;
  }

  onMessage(msg: ServerMsg) {
    if (msg.t === 'bungee') this.state = msg.state;
    else if (msg.t === 'welcome' || msg.t === 'floor.enter') this.state = msg.bungee ?? { ...NO_BUNGEE };
  }

  /** E at the platform: asks the office for the rope. True when it was about the jetty (or you're on the rope: nothing else is in reach). */
  use(target: Interactable, key: string): boolean {
    if (this.jumping) return true;
    if (target.kind !== 'bungee') return false;
    if (key !== 'E') return true;
    const t = this.elapsed();
    if (this.state.jumper && t !== null && t < bungeePlan(this.state.drop).end) {
      this.d.toast(`🪂 Someone's on the rope — ${this.state.name} is jumping`, 'warn');
      return true;
    }
    const now = performance.now();
    if (now - this.asked < 1500) return true;
    this.asked = now;
    this.d.send({ t: 'bungee.jump' });
    return true;
  }

  /** The hint at the platform. */
  hint(title: (t: string) => HTMLElement, key: (k: string, label: string) => HTMLElement, aside: (t: string) => HTMLElement): { k: string; parts: Part[] } {
    if (this.jumping) return { k: 'jumping', parts: [title('🪂 On the rope'), key('F', 'Flip')] };
    const t = this.elapsed();
    const busy = this.state.jumper && t !== null && t < bungeePlan(this.state.drop).end;
    const today = this.state.today;
    if (busy) return { k: `busy|${this.state.name}`, parts: [title('🪂 Bungee'), aside(`${this.state.name} is on the rope`)] };
    const about = `${Math.round(this.d.drop())} m to the street · ${today} jump${today === 1 ? '' : 's'} today`;
    return { k: `free|${about}`, parts: [title('🪂 Bungee'), aside(about), key('E', 'Jump!')] };
  }

  /** Keys while you're on the rope: F (or Space) flips, nothing else is in reach. True when it took the key. */
  key(e: KeyboardEvent): boolean {
    if (!this.jumping) return false;
    if (e.code === 'KeyF' || e.code === 'Space') {
      e.preventDefault();
      const pose = this.poseNow;
      const now = this.d.officeNow();
      if (pose?.phase === 'fall' && !e.repeat && (!this.flipAt || now - this.flipAt > 1000)) this.flipAt = now;
      return true;
    }
    return /^Key[A-Z]$/.test(e.code) && !['KeyM', 'KeyT', 'KeyV'].includes(e.code) ? true : /^(?:Digit|Numpad)\d$/.test(e.code);
  }

  /** Seconds since the jump on the rope started, or null with nobody on it. */
  private elapsed(): number | null {
    if (!this.state.jumper) return null;
    return (this.d.officeNow() - this.state.startedAt) / 1000;
  }

  /** Every frame, after everyone's been moved: poses the jumper and the rope, and flies your camera if it's you. */
  update(up: boolean, firstPerson: boolean) {
    const s = this.state;
    const jetty = this.d.jetty();
    jetty?.setToday(s.today);
    const t = up ? this.elapsed() : null;
    const plan = s.jumper ? bungeePlan(s.drop) : null;
    const live = t !== null && plan !== null && t < plan.end;
    const mine = live && s.jumper === this.d.you();
    if (mine && !this.hold) this.start();
    if (!mine && this.hold) this.stop(up);
    if (jetty) jetty.setGate(plan && t !== null ? smooth((t - (plan.jump - 0.9)) / 0.6) * (1 - smooth((t - plan.end) / 0.6)) : 0);
    if (!live || !plan || t === null) {
      this.unpose();
      this.rope.visible = false;
      this.poseNow = null;
      this.showCount('');
      this.d.sound.bungeeWind(0);
      return;
    }
    const pose = bungeePose(s.drop, t);
    this.poseNow = pose;
    const body = mine ? this.d.me : this.d.bodyOf(s.jumper!);
    if (this.posed && this.posed !== body) this.unpose();
    const flip = mine && this.flipAt ? smooth((this.d.officeNow() - this.flipAt) / 900) * Math.PI * 2 : 0;
    if (flip >= Math.PI * 2 - 1e-6) this.flipAt = 0;
    // The body: its feet (where the rope's tied) at the pose, tipped forward by its pitch, facing out.
    this.q.setFromAxisAngle(X_AXIS, pose.pitch + flip);
    if (body) {
      body.position.set(pose.x, pose.y, pose.z);
      body.quaternion.copy(this.q);
      body.visible = !(mine && firstPerson);
      this.posed = body;
    }
    this.drawRope(pose, plan.length);
    // On the platform the rope hangs from the arm right in front of your eyes: out of your own first-person view there.
    if (mine && firstPerson && (pose.phase === 'count' || pose.phase === 'climb')) this.rope.visible = false;
    this.events(s, t, pose, plan, mine);
    if (mine) this.fly(pose, t, plan, flip, firstPerson);
  }

  private start() {
    const p = this.d.player;
    p.stopWalking();
    this.hold = () => {};
    p.rig = this.hold;
    p.pos.set(BUNGEE.x, BUNGEE.deckY, BUNGEE.standZ);
    p.vy = 0;
    p.facing = 0;
    p.camYaw = Math.PI;
    p.lookPitch = -0.15;
    if (p.camDist < 5) p.camDist = 6;
    this.flipAt = 0;
  }

  /** Off the rope: back on your feet on the platform (unless you've gone off the roof meanwhile). */
  private stop(up: boolean) {
    const p = this.d.player;
    if (p.rig === this.hold) p.rig = null;
    this.hold = null;
    if (up) {
      p.pos.set(BUNGEE.x, BUNGEE.deckY, BUNGEE.standZ);
      p.vy = 0;
      p.camYaw = Math.PI;
      p.lookPitch = -0.1;
      p.updateCamera(true);
    }
    this.unpose();
    this.showCount('');
    this.d.sound.bungeeWind(0);
  }

  /** Stands whoever was posed back upright (their own frame puts them where they are). */
  private unpose() {
    if (!this.posed) return;
    this.posed.rotation.set(0, this.posed.rotation.y, 0);
    this.posed = null;
  }

  /**
   * The rope from the anchor to the ankles: straight when it's pulling, else hanging in a loop below.
   * Standing on the platform, it runs from the ankles along the grating and over the front edge first,
   * so it hangs down off the edge rather than across the jumper's face.
   */
  private drawRope(pose: BungeePose, length: number) {
    const a = this.v.set(ANCHOR.x, ANCHOR.y, ANCHOR.z);
    const p = this.v2.set(pose.x, pose.y + 0.08, pose.z);
    const rest = Math.hypot(ANCHOR.y - BUNGEE.deckY, ANCHOR.z - BUNGEE.standZ) + length;
    const onDeck = !pose.taut && pose.y > BUNGEE.deckY - 0.3 && pose.z < BUNGEE.edgeZ;
    const e = onDeck ? new THREE.Vector3(pose.x, BUNGEE.deckY + 0.04, BUNGEE.edgeZ + 0.04) : p;
    const flat = onDeck ? e.distanceTo(p) : 0;
    const slack = pose.taut ? 0 : Math.max(0, rest - flat - a.distanceTo(e));
    const mid = new THREE.Vector3().addVectors(a, e).multiplyScalar(0.5);
    const bottom = mid.clone();
    if (slack > 0) bottom.y = Math.min(a.y, e.y) - slack / 2;
    const c = bottom.multiplyScalar(2).sub(mid);
    const loop = onDeck ? SEGMENTS - 3 : SEGMENTS;
    const at = (i: number, out: THREE.Vector3) => {
      if (i > loop) return out.lerpVectors(e, p, (i - loop) / (SEGMENTS - loop));
      const u = i / loop;
      const k0 = (1 - u) * (1 - u);
      const k1 = 2 * u * (1 - u);
      const k2 = u * u;
      return out.set(k0 * a.x + k1 * c.x + k2 * e.x, k0 * a.y + k1 * c.y + k2 * e.y, k0 * a.z + k1 * c.z + k2 * e.z);
    };
    const from = new THREE.Vector3();
    const to = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const scale = new THREE.Vector3();
    for (let i = 0; i < SEGMENTS; i++) {
      at(i, from);
      at(i + 1, to);
      dir.subVectors(to, from);
      const len = dir.length() || 1e-4;
      this.q2.setFromUnitVectors(UP, dir.multiplyScalar(1 / len));
      this.m.compose(from, this.q2, scale.set(1, len, 1));
      this.rope.setMatrixAt(i, this.m);
    }
    this.rope.instanceMatrix.needsUpdate = true;
    this.rope.visible = true;
  }

  /** The countdown, the toast for everyone else, the rope's twang, the wind. */
  private events(s: BungeeState, t: number, pose: BungeePose, plan: ReturnType<typeof bungeePlan>, mine: boolean) {
    const seen = this.seen;
    if (seen.startedAt !== s.startedAt) {
      // Coming up mid-jump: nothing already past goes off again.
      this.seen = { startedAt: s.startedAt, beep: t < 1 ? -1 : Math.floor(t), taut: pose.taut, toast: t > plan.jump + 0.5 };
      return;
    }
    // A beep a second, and the go (even if a slow frame skipped past its moment).
    const beat = Math.min(Math.floor(t), plan.jump);
    if (mine && beat > seen.beep && beat >= 0 && t < plan.jump + 2) {
      seen.beep = beat;
      this.d.sound.bungee(beat >= plan.jump ? 'go' : 'count');
    }
    if (mine && t < plan.jump + 0.8) {
      this.showCount(t < plan.jump ? String(Math.max(1, Math.ceil(plan.jump - t))) : '🪂 JUMP!', t >= plan.jump);
    } else this.showCount(mine && pose.phase === 'fall' && t < plan.jump + 3 ? 'F · flip' : '', false, true);
    if (!seen.toast && t >= plan.jump) {
      seen.toast = true;
      if (!mine) this.d.toast(`🪂 ${s.name} jumped!`);
    }
    if (pose.taut !== seen.taut) {
      seen.taut = pose.taut;
      if (pose.taut && pose.phase === 'fall') this.d.sound.bungee('twang', mine ? undefined : { x: pose.x, y: pose.y, z: pose.z });
    }
    if (mine) this.d.sound.bungeeWind(pose.phase === 'fall' || pose.phase === 'hang' ? Math.min(1, Math.abs(pose.speed) / 22) : pose.phase === 'winch' ? 0.08 : 0);
  }

  /** Your camera on the rope: in your head in first person, following you in third. */
  private fly(pose: BungeePose, t: number, plan: ReturnType<typeof bungeePlan>, flip: number, firstPerson: boolean) {
    const cam = this.d.camera;
    const p = this.d.player;
    const bodyUp = new THREE.Vector3(0, 1, 0).applyQuaternion(this.q);
    if (firstPerson) {
      cam.position.set(pose.x, pose.y, pose.z).addScaledVector(bodyUp, EYE_HEIGHT);
      const q = cam.quaternion;
      if (t < plan.jump) q.copy(Q_AHEAD);
      else if (t < plan.hang) q.slerpQuaternions(Q_AHEAD, Q_DOWN, smooth((t - plan.jump) / 1.0));
      else if (t < plan.winch + 0.2) q.slerpQuaternions(Q_DOWN, Q_HANG, smooth((t - plan.hang) / 1.0));
      else if (t < plan.climb) q.copy(Q_HANG);
      else q.slerpQuaternions(Q_HANG, Q_AHEAD, smooth((t - plan.climb) / (plan.end - plan.climb)));
      if (flip) q.multiply(this.q2.setFromAxisAngle(X_AXIS, -flip));
      return;
    }
    // Third person: round the body's middle, where the mouse has the camera, never through the facade or under the street.
    const center = new THREE.Vector3(pose.x, pose.y, pose.z).addScaledVector(bodyUp, 0.9);
    const dist = Math.max(5, p.camDist);
    cam.position.set(Math.sin(p.camYaw) * Math.cos(p.camPitch), Math.sin(p.camPitch), Math.cos(p.camYaw) * Math.cos(p.camPitch)).multiplyScalar(dist).add(center);
    if (cam.position.y < 0.3) cam.position.z = Math.max(cam.position.z, FACADE + 1.2);
    cam.position.y = Math.max(cam.position.y, BUNGEE.deckY - this.state.drop + 0.8);
    cam.lookAt(center);
  }

  /** The big countdown in the middle of the screen (empty hides it). */
  private showCount(text: string, go = false, small = false) {
    if (!text && !this.overlay) return;
    if (!this.overlay) {
      const el = document.createElement('div');
      el.style.cssText =
        'position:fixed;left:50%;top:38%;transform:translate(-50%,-50%);z-index:30;pointer-events:none;font:900 96px Nunito,ui-rounded,system-ui,sans-serif;color:#ffd23f;text-shadow:0 4px 0 #1f1f24,0 0 24px rgba(0,0,0,.45);letter-spacing:.02em;white-space:nowrap';
      document.body.appendChild(el);
      this.overlay = el;
    }
    const el = this.overlay;
    el.hidden = !text;
    if (el.textContent !== text) el.textContent = text;
    el.style.fontSize = small ? '22px' : go ? '72px' : '96px';
    el.style.top = small ? '82%' : '38%';
    el.style.opacity = small ? '0.8' : '1';
  }
}
