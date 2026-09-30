import * as THREE from 'three';
import { SEATING_BY_ID } from '../../../shared/layout';
import type { Rect } from '../../../shared/gym-rooms';
import type { Collider, Interactable } from '../office';
import { mesh, toon } from '../toon';

/*
 * What the gym's room builders share (flrnoh fork, see FORK.md "Rooms, spa and detail"): where
 * their pieces go, and a few shorthands. Plain toon pieces go in `still` and are merged into one
 * draw call per material at the end (world/gym/interior.ts); anything textured, glowing on its own
 * canvas, see-through or moving goes straight in `group`.
 */

export interface GymParts {
  /** Textured, animated or see-through things, as they are. */
  group: THREE.Group;
  /** Plain toon (or plain glowing) pieces that never move: merged by colour at the end. */
  still: THREE.Group;
  colliders: Collider[];
  interactables: Interactable[];
}

/** A box of `color` centred at x, y, z (plain: it goes in `still`). */
export function blk(p: GymParts, w: number, h: number, d: number, color: THREE.ColorRepresentation | THREE.Material, x: number, y: number, z: number, rotY = 0): THREE.Mesh {
  const m = mesh(new THREE.BoxGeometry(w, h, d), color instanceof THREE.Material ? color : toon(color), x, y, z, false);
  m.rotation.y = rotY;
  p.still.add(m);
  return m;
}

/** A cylinder standing upright at x, y (its middle), z. */
export function cyl(p: GymParts, rTop: number, rBottom: number, h: number, color: THREE.ColorRepresentation | THREE.Material, x: number, y: number, z: number, seg = 12): THREE.Mesh {
  const m = mesh(new THREE.CylinderGeometry(rTop, rBottom, h, seg), color instanceof THREE.Material ? color : toon(color), x, y, z, false);
  p.still.add(m);
  return m;
}

/** A flat textured picture facing `rotY` (0: +z), its middle at x, y, z. */
export function picture(p: GymParts, w: number, h: number, mat: THREE.Material, x: number, y: number, z: number, rotY: number): THREE.Mesh {
  const m = mesh(new THREE.PlaneGeometry(w, h), mat, x, y, z, false);
  m.rotation.y = rotY;
  p.group.add(m);
  return m;
}

/** A textured patch of floor over `r`, `y` above the rubber (so zones stack without flicker). */
export function decal(p: GymParts, r: Rect, mat: THREE.Material, y = 0.005): THREE.Mesh {
  const m = mesh(new THREE.PlaneGeometry(r.maxX - r.minX, r.maxZ - r.minZ), mat, (r.minX + r.maxX) / 2, y, (r.minZ + r.maxZ) / 2, false);
  m.rotation.x = -Math.PI / 2;
  m.receiveShadow = true;
  p.group.add(m);
  return m;
}

/** A lit material with a texture (toon-shaded like everything else). */
export function tex(map: THREE.Texture, color: THREE.ColorRepresentation = '#ffffff', opts: THREE.MeshToonMaterialParameters = {}): THREE.MeshToonMaterial {
  const base = toon('#ffffff') as THREE.MeshToonMaterial;
  return new THREE.MeshToonMaterial({ map, color, gradientMap: base.gradientMap, ...opts });
}

/** Somewhere to sit (a SEATING id with `gym`): E at `obj`, or near it. */
export function seatable(p: GymParts, obj: THREE.Object3D | null, seatId: string, radius: number) {
  const seat = SEATING_BY_ID.get(seatId);
  if (!seat) return;
  const it: Interactable = { kind: 'seat', seatId, x: seat.x, y: seat.y, z: seat.z, radius };
  p.interactables.push(it);
  obj?.traverse((o) => (o.userData.interact = it));
}

/** A potted plant: a pot and a few leafy blobs. */
export function plant(p: GymParts, x: number, z: number, h = 1.2, pot = '#e9e4da') {
  cyl(p, 0.2, 0.15, 0.4, pot, x, 0.2, z, 10);
  cyl(p, 0.025, 0.03, h - 0.4, '#5b4a36', x, 0.4 + (h - 0.4) / 2, z, 5);
  const leaf = ['#4f9a4a', '#62b35a', '#3f8a44'];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const r = i === 0 ? 0 : 0.14;
    const m = mesh(new THREE.IcosahedronGeometry(0.2 + (i % 2) * 0.05, 0), toon(leaf[i % 3]), x + Math.cos(a) * r, h - 0.15 + (i % 3) * 0.12 - (i ? 0.1 : -0.1), z + Math.sin(a) * r, false);
    p.still.add(m);
  }
}

/** A wall speaker: a black box with a lime ring, facing `rotY`. */
export function speaker(p: GymParts, x: number, y: number, z: number, rotY: number) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.34, 0.5, 0.26), toon('#15191c'), 0, 0, 0, false));
  const cone = mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.02, 16), toon('#2a3036'), 0, -0.06, 0.135, false);
  cone.rotation.x = Math.PI / 2;
  g.add(cone);
  const ring = mesh(new THREE.TorusGeometry(0.12, 0.012, 6, 18), toon('#a3e635'), 0, -0.06, 0.14, false);
  g.add(ring);
  g.add(mesh(new THREE.BoxGeometry(0.06, 0.2, 0.06), toon('#2a3036'), 0, 0.3, -0.1, false));
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  g.rotation.x = 0;
  p.still.add(g);
}

/** The candles' flame, shared so they merge into one draw call and flicker together (gently). */
export const flameMat = (() => {
  const m = new THREE.MeshBasicMaterial({ color: '#ffcf6b', toneMapped: false });
  m.userData.outlineParameters = { visible: false };
  return m;
})();

/** A small candle, its flame in `flameMat`. */
export function candle(p: GymParts, x: number, y: number, z: number, h = 0.12) {
  cyl(p, 0.035, 0.035, h, '#f4ecd8', x, y + h / 2, z, 10);
  p.still.add(mesh(new THREE.ConeGeometry(0.018, 0.05, 6), flameMat, x, y + h + 0.03, z, false));
}
