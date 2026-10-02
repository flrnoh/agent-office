import * as THREE from 'three';
import { STREET_Y } from '../../../shared/layout';
import type { Collider } from '../types';
import { canvasTexture } from '../texture';
import { mesh, toon } from '../toon';

// flrnoh fork (see FORK.md "The petrol station"): the petrol station's building blocks: its colours,
// boxes standing on the street, signs drawn on canvases, and colliders off shared/tankstelle.ts.

/** Down on the street, in the office's frame on its bottom floor (the town's, and the station's). */
export const G = STREET_Y;

/** FLOGGE OIL's colours: a deep teal, a sunny yellow, white, and the ink round its signs. */
export const TEAL = '#0b7a83';
export const TEAL_DARK = '#075a61';
export const YELLOW = '#ffcf33';
export const WHITE = '#f7f7f2';
export const INK = '#20232f';
export const STEEL = '#b8bec8';

/** A box `w` × `h` × `d` standing on the street with its middle at (x, z), `y` up off it. */
export function block(group: THREE.Object3D, w: number, h: number, d: number, mat: THREE.Material, x: number, z: number, y = 0, shadow = true): THREE.Mesh {
  const m = mesh(new THREE.BoxGeometry(w, h, d), mat, x, G + y + h / 2, z, shadow);
  group.add(m);
  return m;
}

/** A collider off one of shared/tankstelle.ts's boxes (`top` meters up off the street). */
export const collider = (r: { minX: number; maxX: number; minZ: number; maxZ: number; top: number }, bottom = 0): Collider => ({ minX: r.minX, maxX: r.maxX, minZ: r.minZ, maxZ: r.maxZ, bottom: G + bottom, top: G + r.top });

/** A sign drawn once on a canvas (`w` × `h` px), as a plane `pw` m wide facing +z; lit (unlit material) or toon-shaded. */
export function signPlane(w: number, h: number, pw: number, draw: (g: CanvasRenderingContext2D) => void, lit = true): THREE.Mesh {
  const tex = canvasTexture(w, h, draw);
  const mat = lit ? new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }) : new THREE.MeshToonMaterial({ map: tex, gradientMap: (toon('#fff') as THREE.MeshToonMaterial).gradientMap });
  mat.userData.outlineParameters = { visible: false };
  return new THREE.Mesh(new THREE.PlaneGeometry(pw, (pw * h) / w), mat);
}

/** A canvas you redraw (a pump's display, the wash's sign): the plane, and `draw` to paint it again. */
export interface LiveSign {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  draw(paint: (g: CanvasRenderingContext2D, w: number, h: number) => void): void;
}

export function liveSign(w: number, h: number, pw: number): LiveSign {
  const tex = canvasTexture(w, h);
  const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  mat.userData.outlineParameters = { visible: false };
  const m = new THREE.Mesh(new THREE.PlaneGeometry(pw, (pw * h) / w), mat);
  const c = tex.image as HTMLCanvasElement;
  const g = c.getContext('2d')!;
  return {
    mesh: m,
    draw(paint) {
      paint(g, w, h);
      tex.needsUpdate = true;
    },
  };
}

/** The brand's logo: a yellow drop on a teal disc, with the name beside it. */
export function drawLogo(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.fillStyle = TEAL;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = YELLOW;
  g.beginPath();
  g.moveTo(x, y - r * 0.72);
  g.bezierCurveTo(x + r * 0.55, y - r * 0.05, x + r * 0.5, y + r * 0.55, x, y + r * 0.6);
  g.bezierCurveTo(x - r * 0.5, y + r * 0.55, x - r * 0.55, y - r * 0.05, x, y - r * 0.72);
  g.fill();
}

export const FONT = 'Nunito, ui-rounded, system-ui, sans-serif';

const HIT = new THREE.MeshBasicMaterial({ visible: false });
HIT.userData.outlineParameters = { visible: false };

/** Something to aim at in first person (unseen): a box over (minX..maxX, 0..top, minZ..maxZ) that stands for `it`. */
export function hitBox(group: THREE.Object3D, r: { minX: number; maxX: number; minZ: number; maxZ: number }, top: number, it: unknown) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(r.maxX - r.minX, top, r.maxZ - r.minZ), HIT);
  m.position.set((r.minX + r.maxX) / 2, G + top / 2, (r.minZ + r.maxZ) / 2);
  m.userData.interact = it;
  group.add(m);
}
