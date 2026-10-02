import * as THREE from 'three';
import { DIVE, POOL_DECK, diveFloors } from '../../../shared/roofpool';
import type { PlayerController } from '../../player';
import { mesh, toon } from '../../world/toon';
import type { Collider } from '../../world/types';

// The diving tower at the pool on the roof (flrnoh fork, see FORK.md "Pool party on the roof"): legs on
// the deck's north side, a platform 3.5 m over the deck reaching out over the water, a springy board on
// out from it, a rail round the rest, and a ladder up its west side. E at the ladder climbs up (and E up
// top climbs back down); off the board you go into the water, as high as it is, with the splash to match.

/** The tower, built, and what's in its way: its legs, its platform and board to walk on, its rails. */
export function buildDiveTower(): { group: THREE.Group; colliders: Collider[] } {
  const group = new THREE.Group();
  const colliders: Collider[] = [];
  const d = DIVE;
  const white = toon('#f4f1ea');
  const blue = toon('#118ab2');
  const steel = toon('#d7dde3', { emissive: '#2a2f36' });
  const deck = POOL_DECK.top;
  const legZ = [d.minZ + 0.15, POOL_DECK.minZ + 0.65];
  // Four legs on the deck, cross-braced, under the platform's back half.
  for (const x of [d.minX + 0.15, d.maxX - 0.15]) {
    for (const z of legZ) group.add(mesh(new THREE.BoxGeometry(0.22, d.top - deck, 0.22), white, x, (deck + d.top) / 2, z));
    const brace = mesh(new THREE.BoxGeometry(0.06, Math.hypot(d.top - deck, legZ[1] - legZ[0]), 0.06), blue, x, (deck + d.top) / 2, (legZ[0] + legZ[1]) / 2, false);
    brace.rotation.x = Math.atan2(legZ[1] - legZ[0], d.top - deck);
    group.add(brace);
  }
  // The platform and the board, blue tops with a white edge.
  for (const f of diveFloors()) {
    const h = f.top - f.bottom;
    group.add(mesh(new THREE.BoxGeometry(f.maxX - f.minX, h, f.maxZ - f.minZ), f.maxZ - f.minZ < 1 ? toon('#ffd166') : blue, (f.minX + f.maxX) / 2, f.bottom + h / 2, (f.minZ + f.maxZ) / 2));
    colliders.push({ ...f });
  }
  // Rails round its sides and back, the front open onto the board.
  const railH = 1.0;
  const rail = (x0: number, x1: number, z0: number, z1: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    group.add(mesh(alongX ? new THREE.BoxGeometry(len, 0.05, 0.05) : new THREE.BoxGeometry(0.05, 0.05, len), steel, (x0 + x1) / 2, d.top + railH, (z0 + z1) / 2, false));
    for (let k = 0; k <= Math.ceil(len / 0.8); k++) {
      const t = k / Math.ceil(len / 0.8);
      group.add(mesh(new THREE.BoxGeometry(0.04, railH, 0.04), steel, x0 + (x1 - x0) * t, d.top + railH / 2, z0 + (z1 - z0) * t, false));
    }
    colliders.push({ minX: Math.min(x0, x1) - 0.05, maxX: Math.max(x0, x1) + 0.05, minZ: Math.min(z0, z1) - 0.05, maxZ: Math.max(z0, z1) + 0.05, bottom: d.top, top: d.top + railH });
  };
  rail(d.minX, d.maxX, d.minZ + 0.05, d.minZ + 0.05);
  rail(d.minX + 0.05, d.minX + 0.05, d.minZ, d.front);
  rail(d.maxX - 0.05, d.maxX - 0.05, d.minZ, d.front);
  rail(d.minX, d.board.minX, d.front - 0.05, d.front - 0.05);
  rail(d.board.maxX, d.maxX, d.front - 0.05, d.front - 0.05);
  // The ladder up its west side.
  const lx = d.minX - 0.06;
  for (const z of [d.foot.z - 0.22, d.foot.z + 0.22]) group.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, d.top - deck + 1.0, 6), steel, lx, (deck + d.top + 1.0) / 2, z, false));
  for (let y = deck + 0.3; y < d.top; y += 0.3) group.add(mesh(new THREE.BoxGeometry(0.04, 0.04, 0.44), steel, lx, y, d.foot.z, false));
  // Something to aim at over the whole ladder, so looking at it is looking at it, not between its rungs.
  const aim = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  aim.userData.outlineParameters = { visible: false };
  group.add(mesh(new THREE.BoxGeometry(0.5, d.top - deck + 1.0, 0.9), aim, lx - 0.1, (deck + d.top + 1.0) / 2, d.foot.z, false));
  // Its legs and the ladder are in the way down on the deck.
  colliders.push({ minX: d.minX - 0.12, maxX: d.maxX + 0.05, minZ: d.minZ, maxZ: legZ[1] + 0.15, bottom: deck, top: d.top - 0.2 });
  // A big 3 m sign on its front, and a flag on top.
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 128, 64);
  g.fillStyle = '#ef476f';
  g.font = '900 48px Nunito, ui-rounded, system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('3,5 m', 64, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  group.add(mesh(new THREE.PlaneGeometry(0.9, 0.45), new THREE.MeshBasicMaterial({ map: tex }), (d.minX + d.maxX) / 2, d.top - 0.42, d.front + 0.01, false));
  group.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.6, 6), steel, d.maxX - 0.05, d.top + 1.8, d.minZ + 0.05, false));
  group.add(mesh(new THREE.PlaneGeometry(0.6, 0.38), new THREE.MeshBasicMaterial({ color: '#06d6a0', side: THREE.DoubleSide }), d.maxX + 0.25, d.top + 2.4, d.minZ + 0.05, false));
  return { group, colliders };
}

/** Up (or down) the diving tower's ladder: held a moment on the rungs, then off at the top (or the bottom). */
export class DiveClimb {
  active = false;
  private t = 0;
  private up = true;

  constructor(private player: PlayerController) {}

  /** Up from the deck, or with `up` false back down to it. */
  start(up: boolean) {
    if (this.active) return;
    const p = this.player;
    this.active = true;
    this.up = up;
    this.t = 0;
    p.stopWalking();
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
    const k = Math.min(1, this.t / 1.6);
    const from = this.up ? POOL_DECK.top : DIVE.top;
    const to = this.up ? DIVE.top : POOL_DECK.top;
    p.pos.set(DIVE.foot.x, from + (to - from) * k, DIVE.foot.z);
    p.facing = Math.PI / 2;
    if (k < 1) return;
    const at = this.up ? DIVE.up : DIVE.foot;
    p.pos.set(at.x, to, at.z);
    p.grounded = true;
    // Up top, facing the board and the water.
    if (this.up && p.view === 'first') {
      p.camYaw = Math.PI;
      p.camPitch = -0.2;
    }
    this.stop();
  }
}
