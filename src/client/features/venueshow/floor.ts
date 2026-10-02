import * as THREE from 'three';
import { lookFromSeed } from '../../../shared/avatar';
import { STAGE_HEIGHT } from '../../../shared/venue';
import { BALLS, BARRIER, DIVE_EDGE, POSTER_WALL, SECURITY, type Gig } from '../../../shared/venueshow';
import { BALL_R } from '../../../shared/venueshow-balls';
import { Person } from '../../world/character';
import { mesh, textPlane, toon } from '../../world/toon';
import type { Collider, Interactable } from '../../world/types';
import { POSTER_H, POSTER_W, drawPoster } from './posters';

// The SCHALLWERK's floor, the show's things on it (flrnoh fork, see FORK.md "The show"): the
// Wellenbrecher in front of the stage in concert mode (steel crowd barriers on their footplates,
// sinking into the floor for a club night) with security in the pit, the poster wall with the
// programme on the wing's wall, the stage's front edge to dive off, and the beach balls.

export interface Floor {
  group: THREE.Group;
  colliders: Collider[];
  interactables: Interactable[];
  /** The stage's edge (E there dives), the poster wall, the balls. */
  dive: Interactable;
  diveMesh: THREE.Mesh;
  balls: { mesh: THREE.Mesh; it: Interactable }[];
  /** The posters on the wall, from the gigs coming up. */
  hang(gigs: readonly Gig[]): void;
  /** Every frame: the barrier up (concert) or down (club), security. */
  update(t: number, dt: number, konzert: boolean): void;
}

const SLOTS = 8;

export function buildFloor(): Floor {
  const group = new THREE.Group();
  group.name = 'venue-floor';
  const colliders: Collider[] = [];
  const interactables: Interactable[] = [];

  // ---- The Wellenbrecher ------------------------------------------------------------------------------
  const barrier = new THREE.Group();
  const steel = toon('#9aa1ab');
  const dark = toon('#3a3f47');
  const n = Math.round((BARRIER.maxX - BARRIER.minX) / 1.0);
  const seg = (BARRIER.maxX - BARRIER.minX) / n;
  const H = BARRIER.height;
  for (let i = 0; i < n; i++) {
    const x = BARRIER.minX + seg * (i + 0.5);
    const s = new THREE.Group();
    s.position.set(x, 0, BARRIER.z);
    // The front panel (toward the crowd), its top rail, the frame leaning back into the pit, the footplate under the crowd.
    s.add(mesh(new THREE.BoxGeometry(seg - 0.04, H - 0.1, 0.03), dark, 0, (H - 0.1) / 2 + 0.05, 0));
    s.add(mesh(new THREE.CylinderGeometry(0.045, 0.045, seg - 0.02, 8).rotateZ(Math.PI / 2), steel, 0, H, 0, false));
    for (const sx of [-1, 1]) {
      s.add(mesh(new THREE.BoxGeometry(0.05, H, 0.05), steel, sx * (seg / 2 - 0.05), H / 2, 0, false));
      const brace = mesh(new THREE.BoxGeometry(0.04, 0.04, 1.0), steel, sx * (seg / 2 - 0.08), H / 2, 0.42, false);
      brace.rotation.x = -0.95;
      s.add(brace);
    }
    s.add(mesh(new THREE.BoxGeometry(seg - 0.02, 0.03, 0.7), toon('#596069'), 0, 0.015, -0.36, false));
    s.add(mesh(new THREE.BoxGeometry(seg - 0.02, 0.02, 0.5), steel, 0, 0.01, 0.4, false));
    barrier.add(s);
  }
  group.add(barrier);
  const barrierCollider: Collider = { minX: BARRIER.minX, maxX: BARRIER.maxX, minZ: BARRIER.z - 0.08, maxZ: BARRIER.z + 0.08, top: H, fence: true };
  colliders.push(barrierCollider);
  // Security in the pit: arms crossed, looking along the front row.
  const guard = new Person('Security', '#141414', lookFromSeed('venue-security'));
  guard.showLabel(false);
  guard.root.position.set(SECURITY.x, 0, SECURITY.z);
  guard.root.rotation.y = SECURITY.rotY;
  const back = textPlane('SECURITY', { size: 15, color: '#ffd166' });
  back.position.set(0, 0.8, -0.27);
  back.rotation.y = Math.PI;
  guard.wear(back, 'body');
  guard.setWorkout((b, _dt, t) => {
    b.armR.rotation.set(-1.3, 0, -0.75);
    b.armL.rotation.set(-1.15, 0, 0.8);
    b.head.rotation.y = 0.7 * Math.sin(t * 0.35) + 0.25 * Math.sin(t * 1.1);
  });
  group.add(guard.root);
  colliders.push({ minX: SECURITY.x - 0.3, maxX: SECURITY.x + 0.3, minZ: SECURITY.z - 0.3, maxZ: SECURITY.z + 0.3, top: 1.8 });
  const guardCollider = colliders[colliders.length - 1];
  let down = 0;

  // ---- The poster wall ---------------------------------------------------------------------------------
  const P = POSTER_WALL;
  const wallLen = P.maxZ - P.minZ;
  const wall = new THREE.Group();
  wall.position.set(P.x, 0, (P.minZ + P.maxZ) / 2);
  wall.rotation.y = Math.PI / 2;
  // The board: dark plywood with a light frame, the posters pasted on in two rows of four.
  wall.add(mesh(new THREE.BoxGeometry(wallLen + 0.2, P.top - P.bottom + 0.2, 0.06), toon('#20202a'), 0, (P.top + P.bottom) / 2, 0.03));
  const posterH = (P.top - P.bottom - 0.34) / 2;
  const posterW = (posterH * POSTER_W) / POSTER_H;
  const gap = (wallLen - 4 * posterW) / 5;
  const posters: { canvas: HTMLCanvasElement; tex: THREE.CanvasTexture; mat: THREE.MeshBasicMaterial }[] = [];
  for (let i = 0; i < SLOTS; i++) {
    const c = document.createElement('canvas');
    c.width = 320;
    c.height = Math.round((320 * POSTER_H) / POSTER_W);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const mat = new THREE.MeshBasicMaterial({ map: tex });
    const col = i % 4;
    const row = Math.floor(i / 4);
    const p = mesh(new THREE.PlaneGeometry(posterW, posterH), mat, -wallLen / 2 + gap + col * (posterW + gap) + posterW / 2, P.top - 0.1 - posterH * (row + 0.5) - row * 0.14, 0.065, false);
    p.rotation.z = (((i * 37) % 7) - 3) * 0.006;
    wall.add(p);
    posters.push({ canvas: c, tex, mat });
  }
  const sign = textPlane('PROGRAMM', { size: 64, color: '#ff3d81' });
  sign.position.set(0, P.top + 0.38, 0.08);
  wall.add(sign);
  // Two little spots over it.
  for (const z of [-wallLen / 3, wallLen / 3]) {
    const arm = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6), toon('#111111'), z, P.top + 0.15, 0.3, false);
    arm.rotation.x = Math.PI / 2;
    wall.add(arm);
    wall.add(mesh(new THREE.ConeGeometry(0.09, 0.18, 10).rotateX(-2.3), toon('#111111', { emissive: '#ffe8a8' }), z, P.top + 0.1, 0.55, false));
  }
  const wallLight = new THREE.PointLight('#ffe0b0', 1.4, 6, 2);
  wallLight.position.set(1.6, P.top - 0.4, 0);
  wall.add(wallLight);
  group.add(wall);
  colliders.push({ minX: P.x - 0.05, maxX: P.x + 0.1, minZ: P.minZ - 0.1, maxZ: P.maxZ + 0.1, top: P.top + 0.1 });
  const posterIt: Interactable = { kind: 'venueposter', x: P.x + 0.9, z: (P.minZ + P.maxZ) / 2, radius: 3.2 };
  wall.traverse((o) => (o.userData.interact = posterIt));
  interactables.push(posterIt);

  function hang(gigs: readonly Gig[]) {
    for (let i = 0; i < SLOTS; i++) {
      const g = gigs[i];
      const { canvas, tex } = posters[i];
      if (g) drawPoster(canvas, g);
      else drawSoon(canvas, i);
      tex.needsUpdate = true;
    }
  }
  hang([]);

  // ---- The stage's edge, to dive off ----------------------------------------------------------------------
  // Never drawn, only aimed at (from either side), and only while you stand up there.
  const diveMat = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });
  const diveMesh = new THREE.Mesh(new THREE.PlaneGeometry(DIVE_EDGE.maxX - DIVE_EDGE.minX, 1.5), diveMat);
  diveMesh.position.set((DIVE_EDGE.minX + DIVE_EDGE.maxX) / 2, STAGE_HEIGHT + 0.75, DIVE_EDGE.z - 0.15);
  diveMesh.visible = false;
  const dive: Interactable = { kind: 'venuedive', x: 0, z: DIVE_EDGE.z + 0.1, y: STAGE_HEIGHT, radius: 1.3, off: true };
  diveMesh.userData.interact = dive;
  group.add(diveMesh);
  interactables.push(dive);

  // ---- The beach balls ----------------------------------------------------------------------------------------
  const ballTex = beachBallTexture();
  const balls = Array.from({ length: BALLS }, () => {
    const m = mesh(new THREE.SphereGeometry(BALL_R, 24, 16), new THREE.MeshToonMaterial({ map: ballTex, gradientMap: toon('#fff').gradientMap }), 0, -5, 0);
    m.visible = false;
    const it: Interactable = { kind: 'venueball', x: 0, z: 0, y: 0, radius: 1.6, off: true };
    m.userData.interact = it;
    group.add(m);
    interactables.push(it);
    return { mesh: m, it };
  });

  function update(t: number, dt: number, konzert: boolean) {
    // The barrier sinks into the floor (one segment after the other) for a club night, and comes back up.
    down += ((konzert ? 0 : 1) - down) * Math.min(1, dt * 1.6);
    barrier.visible = down < 0.995;
    barrier.children.forEach((s, i) => {
      const k = Math.min(1, Math.max(0, down * 1.6 - (i / barrier.children.length) * 0.6));
      s.position.y = -(H + 0.1) * k;
    });
    barrierCollider.top = konzert ? H : 0;
    guard.root.visible = down < 0.5;
    guardCollider.top = konzert ? 1.8 : 0;
    if (guard.root.visible) guard.update(dt, t, false, false);
  }

  return { group, colliders, interactables, dive, diveMesh, balls, hang, update };
}

/** An empty slot: a poster for whatever's next. */
function drawSoon(c: HTMLCanvasElement, i: number) {
  const g = c.getContext('2d')!;
  const W = c.width;
  const Hh = c.height;
  g.fillStyle = i % 2 ? '#2b2d42' : '#3d405b';
  g.fillRect(0, 0, W, Hh);
  g.strokeStyle = 'rgba(255,255,255,0.25)';
  g.lineWidth = 6;
  g.strokeRect(14, 14, W - 28, Hh - 28);
  g.fillStyle = '#f1faee';
  g.textAlign = 'center';
  g.font = 'bold 44px "Arial Black", Arial, sans-serif';
  g.fillText('DEMNÄCHST', W / 2, Hh * 0.4, W - 40);
  g.font = 'bold 22px Arial, sans-serif';
  g.fillStyle = '#ffd166';
  g.fillText('IM SCHALLWERK', W / 2, Hh * 0.4 + 40, W - 40);
  g.font = '18px Arial, sans-serif';
  g.fillStyle = 'rgba(241,250,238,0.8)';
  g.fillText('Programm: E am Plakat', W / 2, Hh * 0.82, W - 40);
}

function beachBallTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d')!;
  const cols = ['#e63946', '#f1faee', '#ffd166', '#f1faee', '#3a86ff', '#f1faee'];
  cols.forEach((col, i) => {
    g.fillStyle = col;
    g.fillRect((i * 256) / 6, 0, 256 / 6 + 1, 128);
  });
  g.fillStyle = '#f1faee';
  g.fillRect(0, 0, 256, 12);
  g.fillRect(0, 116, 256, 12);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
