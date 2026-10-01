import * as THREE from 'three';
import { onPitch, type SoccerServerMsg, type SoccerView, type Team } from '../../shared/soccer';
import {
  FALL_MS,
  SLIDE,
  SLIDE_MS,
  type Slide,
  makeSlide,
  penaltyPlaces,
  ringPush,
  slideAt,
  slideLow,
  slideRefused,
  slideSpeed,
} from '../../shared/soccer-tackle';
import { defends, other } from '../../shared/soccer';
import type { ClientMsg } from '../../shared/protocol';
import type { Person } from '../world/character';
import { isTyping } from '../player';

/*
 * Slide tackles in the soccer hall, on this page (flrnoh fork, see FORK.md "The soccer hall", the rules
 * in shared/soccer-tackle.ts, the office's side in server/soccer/tackle.ts):
 *
 * - Q (or Ctrl) on the pitch slides you the way you face: the page drives you along the slide's curve
 *   itself (your keys and kicks do nothing until you're up), so your `move`s are where the office has
 *   you, and the view dips down with you;
 * - everyone's slide on everyone's page: the body along the same curve from the office's start, posed low
 *   with a leg out (Person.rig, after the kit's moves), and turf spraying up from the boot;
 * - a foul: the fouled player goes down (and on their own page can't move till they're up);
 * - the set pieces: at a free kick the fouling team is kept out of the ring round the ball for its first
 *   seconds, at a penalty everyone but the taker and the keeper (the taker is put behind the ball, the
 *   keeper on the line); a ring on the floor shows it.
 *
 * SoccerPlace (place.ts) makes it, hands it the office's messages, and calls it every frame.
 */

type Rig = ReturnType<Person['limbs']>;
type Spot = { x: number; y: number; z: number; rotY: number };

export interface TackleHost {
  send(msg: ClientMsg): void;
  you(): string;
  player: {
    pos: THREE.Vector3;
    facing: number;
    view: 'first' | 'third';
    enabled: boolean;
    rig: ((dt: number) => void) | null;
    eyeDrop: number;
  };
  /** The match as the office last said, and when (performance.now()). */
  view(): SoccerView | null;
  viewAt(): number;
  /** Your team, and whether you play (on a team, in the hall). */
  team(): Team | undefined;
  playing(): boolean;
  /** The hall's room (for the ring and the spray), once built. */
  room(): THREE.Group | null;
  body(id: string): THREE.Object3D | undefined;
  placeAt(at: Spot): void;
  sound(kind: 'slide', at: { x: number; y: number; z: number }, strength: number): void;
}

/** The keys that slide, besides Q (Ctrl; nothing else in the hall uses them while you play). */
export const SLIDE_KEYS = ['KeyQ', 'ControlLeft', 'ControlRight'];
/** How far your view sinks at the bottom of a slide (m): first person, third person. */
const DIP = { first: 0.95, third: 0.55 } as const;
/** Lying after a foul, the view sinks this far. */
const FALL_DIP = 1.0;

interface Curve {
  s: Slide;
  t0: number;
}

/** Turf thrown up by the boot: a small pool of bits, flying and falling. */
class Spray {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private next = 0;
  private readonly n = 360;

  constructor() {
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(this.n * 3);
    this.vel = new Float32Array(this.n * 3);
    this.life = new Float32Array(this.n);
    const col = new Float32Array(this.n * 3);
    const turf = new THREE.Color('#5f9f4a');
    const crumb = new THREE.Color('#2b2b2b');
    const light = new THREE.Color('#b9e39b');
    for (let i = 0; i < this.n; i++) {
      const c = i % 5 === 0 ? crumb : i % 3 === 0 ? light : turf;
      col.set([c.r, c.g, c.b], i * 3);
      this.pos[i * 3 + 1] = -10;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({ size: 0.09, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false });
    mat.userData.outlineParameters = { visible: false };
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.name = 'soccer-turf-spray';
  }

  /** `count` bits from (x, z) at the boot, thrown along (ux, uz) at about `speed`. */
  emit(x: number, z: number, ux: number, uz: number, speed: number, count: number) {
    for (let k = 0; k < count; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.n;
      const side = (Math.random() - 0.5) * 2.4;
      this.pos.set([x + (Math.random() - 0.5) * 0.3, 0.03, z + (Math.random() - 0.5) * 0.3], i * 3);
      const along = speed * (0.25 + Math.random() * 0.45);
      this.vel.set([ux * along - uz * side, 1.2 + Math.random() * 2.2, uz * along + ux * side], i * 3);
      this.life[i] = 0.5 + Math.random() * 0.5;
    }
  }

  update(dt: number) {
    let any = false;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      any = true;
      this.life[i] -= dt;
      const j = i * 3;
      this.vel[j + 1] -= 9.81 * dt;
      this.pos[j] += this.vel[j] * dt;
      this.pos[j + 1] += this.vel[j + 1] * dt;
      this.pos[j + 2] += this.vel[j + 2] * dt;
      if (this.pos[j + 1] < 0.02) {
        // Down on the turf: it lies there a moment, then it's gone.
        this.pos[j + 1] = 0.02;
        this.vel[j] *= 0.3;
        this.vel[j + 2] *= 0.3;
        this.vel[j + 1] = 0;
      }
      if (this.life[i] <= 0) this.pos[j + 1] = -10;
    }
    if (any) (this.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    this.points.visible = any;
  }

  clear() {
    this.life.fill(0);
    for (let i = 0; i < this.n; i++) this.pos[i * 3 + 1] = -10;
    (this.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }
}

const ease = (k: number) => k * k * (3 - 2 * k);
const lerp = THREE.MathUtils.lerp;

/** Lays a slide `ms` in over `rig`'s pose: down on the hip leaning back, the leading leg out, the other tucked, a hand behind. */
export function slidePose(rig: Rig, ms: number) {
  const low = slideLow(ms);
  if (low <= 0) return;
  const k = ease(low);
  rig.body.rotation.x = lerp(rig.body.rotation.x, -0.92, k);
  rig.body.rotation.z = lerp(rig.body.rotation.z, 0.3, k);
  rig.body.position.y = lerp(rig.body.position.y, -0.12, k);
  rig.body.position.z = lerp(rig.body.position.z, 0.45, k);
  // The leading leg straight out along the floor, the other bent under.
  rig.legL.rotation.set(lerp(rig.legL.rotation.x, -0.55, k), 0, lerp(rig.legL.rotation.z, -0.05, k));
  rig.legR.rotation.set(lerp(rig.legR.rotation.x, 0.75, k), 0, lerp(rig.legR.rotation.z, 0.25, k));
  // A hand down behind, the other up for balance.
  rig.armR.rotation.set(lerp(rig.armR.rotation.x, 0.9, k), 0, lerp(rig.armR.rotation.z, 0.55, k));
  rig.armL.rotation.set(lerp(rig.armL.rotation.x, -1.2, k), 0, lerp(rig.armL.rotation.z, -0.6, k));
  rig.head.rotation.x = lerp(rig.head.rotation.x, 0.45, k);
}

/** How far down a fouled player is `ms` after the foul (0 standing, 1 on the floor): over fast, a while down, back up. */
export function fallLow(ms: number): number {
  if (ms <= 0 || ms >= FALL_MS) return 0;
  if (ms < 280) return ease(ms / 280);
  if (ms < FALL_MS - 450) return 1;
  return 1 - ease((ms - (FALL_MS - 450)) / 450);
}

/** Lays a fall `ms` after a foul over `rig`'s pose: face down, arms out in front, legs bent up behind. */
export function fallPose(rig: Rig, ms: number) {
  const k = fallLow(ms);
  if (k <= 0) return;
  // A little wobble as they go over.
  const roll = ms < 400 ? Math.sin((ms / 400) * Math.PI) * 0.35 : 0.15;
  rig.body.rotation.x = lerp(rig.body.rotation.x, 1.32, k);
  rig.body.rotation.z = lerp(rig.body.rotation.z, roll, k);
  rig.body.position.y = lerp(rig.body.position.y, 0.06, k);
  rig.body.position.z = lerp(rig.body.position.z, -0.35, k);
  rig.armL.rotation.set(lerp(rig.armL.rotation.x, -2.6, k), 0, lerp(rig.armL.rotation.z, -0.3, k));
  rig.armR.rotation.set(lerp(rig.armR.rotation.x, -2.4, k), 0, lerp(rig.armR.rotation.z, 0.35, k));
  rig.legL.rotation.x = lerp(rig.legL.rotation.x, 0.5, k);
  rig.legR.rotation.x = lerp(rig.legR.rotation.x, 0.15, k);
  rig.head.rotation.x = lerp(rig.head.rotation.x, -0.6, k);
}

export class SoccerTackle {
  /** Your own slide, while it lasts (the page drives you along it), and your fall after a foul on you. */
  private mine: Curve | null = null;
  private down: { t0: number; x: number; z: number } | null = null;
  /** Everyone's slides (yours too) and falls, for their bodies and poses. */
  private curves = new Map<string, Curve>();
  private falls = new Map<string, number>();
  /** When you may slide again (ms). */
  private nextAt = 0;
  private spray = new Spray();
  private ring: THREE.Mesh | null = null;
  private ringR = 0;
  /** The set piece you were last put in place for (a penalty's taker and keeper go there once). */
  private placedFor = '';
  private active = false;
  /** What happened, for checks from the console. */
  readonly log: string[] = [];

  constructor(private host: TackleHost) {
    window.addEventListener('keydown', (e) => this.key(e), true);
    (globalThis as { __soccerTackle?: SoccerTackle }).__soccerTackle = this;
  }

  /** Your keys and kicks do nothing: you're sliding, or down after a foul. */
  get locked(): boolean {
    return !!this.mine || !!this.down;
  }

  /** In the hall or not. */
  setActive(on: boolean) {
    if (on === this.active) return;
    this.active = on;
    if (!on) this.reset();
  }

  private reset() {
    this.stand();
    this.curves.clear();
    this.falls.clear();
    this.spray.clear();
    if (this.ring) this.ring.visible = false;
    this.placedFor = '';
  }

  // ---- Sliding ------------------------------------------------------------------------------------

  private key(e: KeyboardEvent) {
    if (!SLIDE_KEYS.includes(e.code) || !this.host.playing() || isTyping(e)) return;
    // Ours while you play: Q doesn't drop or put back anything on the pitch.
    e.preventDefault();
    e.stopPropagation();
    if (e.repeat || document.querySelector('.backdrop') || !this.host.player.enabled) return;
    this.slide();
  }

  /** Why you can't slide now, or null (the office checks again). */
  refused(now = performance.now()): string | null {
    const v = this.host.view();
    const no = slideRefused(v?.phase, this.host.team(), v?.kickoff);
    if (no) return no;
    if (this.locked) return 'sliding';
    if (now < this.nextAt) return 'too soon';
    const p = this.host.player.pos;
    if (!onPitch(p.x, p.z, -0.05)) return 'off the pitch';
    return null;
  }

  /** Down you go, the way you face. True when you did. */
  slide(now = performance.now()): boolean {
    const no = this.refused(now);
    if (no) {
      this.log.push(`refused:${no}`);
      return false;
    }
    const pl = this.host.player;
    const s = makeSlide(pl.pos.x, pl.pos.z, pl.facing);
    this.mine = { s, t0: now };
    this.curves.set(this.host.you(), { s, t0: now });
    this.nextAt = now + SLIDE.cooldownMs;
    pl.rig = this.drive;
    this.host.send({ t: 'soccer.slide', dir: s.dir, x: s.x, z: s.z });
    this.host.sound('slide', { x: s.x, y: 0.2, z: s.z }, 1);
    this.log.push(`slide:${s.d.toFixed(2)}`);
    return true;
  }

  /** Your legs while you slide (or lie after a foul): along the curve, the view down with you. */
  private drive = () => {
    const now = performance.now();
    const pl = this.host.player;
    const m = this.mine;
    if (m) {
      const ms = now - m.t0;
      const at = slideAt(m.s, ms);
      pl.pos.x = at.x;
      pl.pos.z = at.z;
      pl.pos.y = 0;
      pl.eyeDrop = slideLow(ms) * DIP[pl.view];
      if (at.part === 'done') this.stand();
      return;
    }
    const d = this.down;
    if (d) {
      const ms = now - d.t0;
      pl.pos.x = d.x;
      pl.pos.z = d.z;
      pl.pos.y = 0;
      pl.eyeDrop = fallLow(ms) * FALL_DIP * (pl.view === 'first' ? 1 : 0.6);
      if (ms >= FALL_MS) this.stand();
      return;
    }
    this.stand();
  };

  /** Up again: your legs are yours. */
  private stand() {
    this.mine = null;
    this.down = null;
    const pl = this.host.player;
    if (pl.rig === this.drive) pl.rig = null;
    pl.eyeDrop = 0;
  }

  // ---- The office's news --------------------------------------------------------------------------

  onMessage(m: SoccerServerMsg) {
    const now = performance.now();
    const you = this.host.you();
    if (m.t === 'soccer.slide') {
      if (m.no !== undefined) {
        // Not taken: up again where you are (the office never had you sliding).
        if (m.id === you && this.mine) {
          this.log.push(`no:${m.no}`);
          this.curves.delete(you);
          this.stand();
          this.nextAt = 0;
        }
        return;
      }
      const s: Slide = { x: m.x, z: m.z, dir: m.dir, d: m.d };
      if (m.id === you) {
        // Yours: the office's start, if it put you somewhere else.
        if (this.mine && Math.hypot(this.mine.s.x - s.x, this.mine.s.z - s.z) + Math.abs(this.mine.s.d - s.d) > 0.3) {
          this.mine.s = s;
          this.curves.set(you, { s, t0: this.mine.t0 });
        }
        return;
      }
      this.curves.set(m.id, { s, t0: now });
      this.host.sound('slide', { x: s.x, y: 0.2, z: s.z }, 0.8);
      return;
    }
    if (m.t !== 'soccer') return;
    const ev = m.event;
    if (ev?.kind === 'foul' && ev.victim) {
      this.falls.set(ev.victim, now);
      this.log.push(`foul:${ev.victim}${ev.penalty ? ':penalty' : ''}${ev.card ? `:${ev.card}` : ''}`);
      if (ev.victim === you && this.host.playing()) {
        // Down: you can't move till you're up.
        const p = this.host.player.pos;
        this.mine = null;
        this.down = { t0: now, x: p.x, z: p.z };
        this.host.player.rig = this.drive;
      }
    }
    if (ev?.kind === 'tackle') this.log.push(`tackle:${ev.id}`);
  }

  // ---- Every frame --------------------------------------------------------------------------------

  /** Before the kits' moves: everyone else's slide moves their body, the spray, the set piece's ring and places. */
  frame(dt: number, now = performance.now()) {
    if (!this.active) return;
    const room = this.host.room();
    if (room && this.spray.points.parent !== room) room.add(this.spray.points);
    const you = this.host.you();
    for (const [id, c] of this.curves) {
      const ms = now - c.t0;
      if (ms > SLIDE_MS + 200) {
        this.curves.delete(id);
        continue;
      }
      const at = slideAt(c.s, ms);
      if (id !== you && ms <= SLIDE_MS) {
        const body = this.host.body(id);
        if (body) {
          body.position.x = at.x;
          body.position.z = at.z;
        }
      }
      // Turf flies from the boot while it's going.
      if (at.part === 'slide') {
        const v = slideSpeed(c.s.d, ms);
        const ux = Math.sin(c.s.dir);
        const uz = Math.cos(c.s.dir);
        const n = Math.min(14, Math.round(v * dt * 34));
        if (n > 0) this.spray.emit(at.x + ux * 0.8, at.z + uz * 0.8, ux, uz, v, n);
      }
    }
    for (const [id, t0] of this.falls) if (now - t0 > FALL_MS + 200) this.falls.delete(id);
    this.spray.update(dt);
    this.setPiece(now, room);
  }

  /** Each player's pose, after their kit's moves (show.ts): sliding or down. */
  pose(id: string, rig: Rig, now = performance.now()) {
    const c = this.curves.get(id);
    if (c && now - c.t0 < SLIDE_MS) slidePose(rig, now - c.t0);
    const f = this.falls.get(id);
    if (f !== undefined && now - f < FALL_MS) fallPose(rig, now - f);
  }

  /** Whether `id` is sliding or down on this page (for the dive and the like). */
  busy(id: string, now = performance.now()): boolean {
    const c = this.curves.get(id);
    const f = this.falls.get(id);
    return (!!c && now - c.t0 < SLIDE_MS) || (f !== undefined && now - f < FALL_MS);
  }

  // ---- Set pieces ---------------------------------------------------------------------------------

  private setPiece(now: number, room: THREE.Group | null) {
    const v = this.host.view();
    const sp = v?.setPiece;
    const on = !!sp && (v?.phase === 'freekick' || v?.phase === 'penalty');
    const since = now - this.host.viewAt();
    const ringLeft = sp ? sp.ringMs - since : 0;
    const showRing = on && (sp!.kind === 'penalty' || ringLeft > 0);
    this.ringMesh(room, showRing ? sp! : null, sp?.kind === 'penalty' ? 1e9 : ringLeft);
    if (!on || !sp) {
      this.placedFor = '';
      return;
    }
    const you = this.host.you();
    const team = this.host.team();
    if (!team || !this.host.playing() || this.locked) return;
    const key = `${sp.kind}|${sp.x}|${sp.z}|${sp.taker ?? ''}|${sp.keeper ?? ''}`;
    if (sp.kind === 'penalty' && this.placedFor !== key) {
      this.placedFor = key;
      const places = penaltyPlaces(defends(other(sp.team)));
      if (sp.taker === you) this.host.placeAt({ ...places.taker, y: 0 });
      else if (sp.keeper === you) this.host.placeAt({ ...places.keeper, y: 0 });
    }
    // Out of the ring: the fouling team at a free kick (for its first seconds), everyone but the taker and keeper at a penalty.
    const held = sp.kind === 'penalty' ? sp.taker !== you && sp.keeper !== you : team !== sp.team && ringLeft > 0;
    if (!held) return;
    const p = this.host.player.pos;
    const out = ringPush(p.x, p.z, sp.x, sp.z, sp.ring);
    if (out) {
      p.x = out.x;
      p.z = out.z;
    }
  }

  private ringMesh(room: THREE.Group | null, sp: { x: number; z: number; ring: number; team: Team } | null, left: number) {
    if (!sp || !room) {
      if (this.ring) this.ring.visible = false;
      return;
    }
    if (!this.ring || this.ringR !== sp.ring) {
      this.ring?.removeFromParent();
      this.ring?.geometry.dispose();
      const mat = new THREE.MeshBasicMaterial({ color: '#ffe066', transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
      mat.toneMapped = false;
      mat.userData.outlineParameters = { visible: false };
      this.ring = new THREE.Mesh(new THREE.RingGeometry(sp.ring - 0.07, sp.ring, 96), mat);
      this.ring.rotation.x = -Math.PI / 2;
      this.ring.renderOrder = 4;
      this.ring.name = 'soccer-setpiece-ring';
      this.ringR = sp.ring;
    }
    if (this.ring.parent !== room) room.add(this.ring);
    this.ring.visible = true;
    this.ring.position.set(sp.x, 0.035, sp.z);
    // It fades out over its last half second.
    (this.ring.material as THREE.MeshBasicMaterial).opacity = 0.85 * Math.min(1, Math.max(0.15, left / 500));
  }
}
