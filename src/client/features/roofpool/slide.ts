import * as THREE from 'three';
import { POOL_DECK, SLIDE, SLIDE_ZONE } from '../../../shared/roofpool';
import type { PlayerController } from '../../player';
import { mesh, toon } from '../../world/toon';
import type { Collider } from '../../world/types';

// The water slide into the pool on the roof (flrnoh fork, see FORK.md "Pool party on the roof"): a
// tower on the deck's south-east corner with a ladder up its north face, and a tube once round it and
// down into the water. E at the foot of the ladder: up you go, sit, and down, faster and faster, into
// the pool with a big splash. Everyone else sees you go from where you are (your `move`s).

/** The slide's curve, through its points. */
export const slideCurve = () => new THREE.CatmullRomCurve3(SLIDE.path.map(([x, y, z]) => new THREE.Vector3(x, y, z)), false, 'catmullrom', 0.3);

/** The tower and the tube, built, and what they put in the way. */
export function buildSlide(): { group: THREE.Group; colliders: Collider[] } {
  const group = new THREE.Group();
  const colliders: Collider[] = [];
  const { x, z, half, top } = SLIDE;
  const steel = toon('#e9ecef');
  const yellow = toon('#ffd166');
  // Four legs from the deck up to the platform, braced, and the platform with a rail round three sides.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) group.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, top + 1.1 - POOL_DECK.top, 8), steel, x + sx * half, (POOL_DECK.top + top + 1.1) / 2, z + sz * half));
  }
  for (const y of [POOL_DECK.top + 0.9, POOL_DECK.top + 1.8]) {
    group.add(mesh(new THREE.BoxGeometry(half * 2, 0.05, 0.05), steel, x, y, z + half, false));
    group.add(mesh(new THREE.BoxGeometry(0.05, 0.05, half * 2), steel, x + half, y, z, false));
  }
  group.add(mesh(new THREE.BoxGeometry(half * 2 + 0.1, 0.08, half * 2 + 0.1), yellow, x, top - 0.04, z));
  for (const [dx, dz, w, d] of [
    [half, 0, 0.05, half * 2],
    [0, half, half * 2, 0.05],
    [-half, 0, 0.05, half * 2],
  ] as const) group.add(mesh(new THREE.BoxGeometry(w || 0.05, 0.05, d || 0.05), steel, x + dx, top + 1.0, z + dz, false));
  // The ladder up the north face.
  for (const sx of [-0.22, 0.22]) group.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, top - POOL_DECK.top + 0.9, 6), steel, x + sx, (POOL_DECK.top + top + 0.9) / 2, z - half - 0.04, false));
  for (let y = POOL_DECK.top + 0.3; y < top; y += 0.3) group.add(mesh(new THREE.BoxGeometry(0.44, 0.04, 0.04), steel, x, y, z - half - 0.04, false));
  // A flag on top, for the party.
  group.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.4, 6), steel, x + half, top + 1.1 + 0.7, z + half, false));
  group.add(mesh(new THREE.PlaneGeometry(0.6, 0.38), new THREE.MeshBasicMaterial({ color: '#ff3dcb', side: THREE.DoubleSide }), x + half + 0.3, top + 2.55, z + half, false));

  // The tube: an open trough, bright and glossy, striped where its sections meet, on struts down to the deck or the roof.
  const curve = slideCurve();
  const R = 0.42;
  const trough = new THREE.TubeGeometry(curve, 120, R, 14, false);
  // Only its lower half: a trough you can see into.
  const pos = trough.attributes.position as THREE.BufferAttribute;
  const pts = curve.getSpacedPoints(120);
  const keep: number[] = [];
  const idx = trough.index!;
  for (let i = 0; i < idx.count; i += 3) {
    const ok = [0, 1, 2].every((k) => {
      const v = idx.getX(i + k);
      const seg = Math.floor(v / 15);
      return pos.getY(v) <= pts[Math.min(seg, pts.length - 1)].y + 0.12;
    });
    if (ok) keep.push(idx.getX(i), idx.getX(i + 1), idx.getX(i + 2));
  }
  trough.setIndex(keep);
  const plastic = toon('#00b4d8').clone();
  plastic.side = THREE.DoubleSide;
  group.add(mesh(trough, plastic, 0, 0, 0, false));
  const rim = toon('#ff8a5b');
  for (let s = 0.08; s < 1; s += 0.1) {
    const p = curve.getPointAt(s);
    const t = curve.getTangentAt(s);
    const ring = mesh(new THREE.TorusGeometry(R + 0.02, 0.035, 6, 16, Math.PI), rim, p.x, p.y, p.z, false);
    ring.lookAt(p.clone().add(t));
    ring.rotateZ(Math.PI);
    group.add(ring);
    // A strut down from under it, where it isn't over the water or the tower's own legs.
    if (s < 0.82) {
      const below = p.y - R;
      const ground = p.x > 9.8 || p.z > POOL_DECK.maxZ ? 0 : POOL_DECK.top;
      if (Math.abs(p.x - x) > half + 0.2 || Math.abs(p.z - z) > half + 0.2) group.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, below - ground, 6), steel, p.x, (below + ground) / 2, p.z, false));
    }
  }

  // The tower's legs, and the stretch of deck the tube runs low over, are in the way.
  colliders.push({ minX: x - half - 0.08, maxX: x + half + 0.08, minZ: z - half, maxZ: z + half + 0.08, bottom: POOL_DECK.top, top: 99 });
  colliders.push({ ...SLIDE_ZONE, bottom: POOL_DECK.top, top: 99 });
  return { group, colliders };
}

/** Riding it: up the ladder, a moment on the platform, then down the tube and into the pool. */
export class SlideRide {
  active = false;
  /** 'climb' up the ladder, then 'slide' down. */
  phase: 'climb' | 'slide' = 'climb';
  private t = 0;
  private s = 0;
  private v = 0;
  private readonly curve = slideCurve();
  private readonly len = this.curve.getLength();

  constructor(
    private player: PlayerController,
    private hooks: { splashDown(): void; whoosh(): void },
  ) {}

  start() {
    if (this.active) return;
    const p = this.player;
    this.active = true;
    this.phase = 'climb';
    this.t = 0;
    p.stopWalking();
    p.pos.set(SLIDE.foot.x, POOL_DECK.top, SLIDE.foot.z);
    p.vy = 0;
    p.rig = (dt) => this.step(dt);
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    if (this.player.rig) this.player.rig = null;
  }

  private step(dt: number) {
    const p = this.player;
    this.t += dt;
    if (this.phase === 'climb') {
      // Up the rungs at the north face, then over onto the platform.
      const k = Math.min(1, this.t / 1.6);
      p.pos.set(SLIDE.x, POOL_DECK.top + (SLIDE.top - POOL_DECK.top) * k, SLIDE.z - SLIDE.half - 0.35 + (k > 0.9 ? (k - 0.9) * 3.5 : 0));
      p.facing = Math.PI;
      if (k >= 1) {
        this.phase = 'slide';
        this.s = 0;
        this.v = 1.5;
        this.hooks.whoosh();
      }
      return;
    }
    // Down the tube: faster all the way.
    this.v = Math.min(9, this.v + dt * 5);
    this.s += (this.v * dt) / this.len;
    const at = this.curve.getPointAt(Math.min(1, this.s));
    const ahead = this.curve.getTangentAt(Math.min(1, this.s));
    p.pos.set(at.x, at.y, at.z);
    p.facing = Math.atan2(ahead.x, ahead.z);
    if (p.view === 'first') {
      p.camYaw = Math.atan2(-ahead.x, -ahead.z);
      p.camPitch = Math.max(-0.6, Math.min(0.2, Math.asin(ahead.y)));
    }
    if (this.s >= 1) {
      this.stop();
      this.hooks.splashDown();
    }
  }
}
