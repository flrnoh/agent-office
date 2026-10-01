import * as THREE from 'three';
import { STREET_Y } from '../../../shared/layout';
import { GYM_HEIGHT, GYM_STREET_BOX, GYM_STREET_DOOR, GYM_STREET_SPOT } from '../../../shared/gym';
import type { Collider, Interactable } from '../types';
import type { NightParts } from '../outside';
import { mergeByMaterial, mesh, toon, toonUnique } from '../toon';
import { box, canvasTexture, chaser, glow, neonSign } from './parts';

/*
 * The gym's outside, on the street across from the office to the east (flrnoh fork, see FORK.md): a
 * steel-and-glass fitness club with a lime-green FITNESS sign, a barbell logo, a glass front that
 * glows with the machines inside, and doors that slide apart as someone comes up. E at the doors
 * takes you inside (client/gym.ts). Built into the street, so it drops with it per floor. Mirrors
 * world/casino/exterior.ts.
 */

const G = STREET_Y;
const B = GYM_STREET_BOX; // fork: next to the padel hall (shared/gym.ts GYM_SHIFT)
const H = GYM_HEIGHT;
const W = B.maxX - B.minX;
const D = B.maxZ - B.minZ;
const CX = (B.minX + B.maxX) / 2;
const CZ = (B.minZ + B.maxZ) / 2;
const DX = GYM_STREET_DOOR.x;
/** The front face (north, toward the street). */
const FRONT = B.minZ;

export interface GymDoor {
  x: number;
  y: number;
  z: number;
  open: number;
  show(open: number): void;
}

export interface GymExterior {
  door: GymDoor;
  interactable: Interactable;
  setStreet(y: number): void;
  update(t: number): void;
}

/** A barbell painted on a board: two plates on a bar, the gym's logo. */
function barbell(w = 256, h = 256): THREE.CanvasTexture {
  return canvasTexture(w, h, (g) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#c9d1d9';
    // bar
    g.fillRect(w * 0.12, h * 0.44, w * 0.76, h * 0.12);
    // plates
    for (const cx of [w * 0.22, w * 0.78]) {
      g.fillStyle = '#a3e635';
      g.fillRect(cx - w * 0.05, h * 0.24, w * 0.1, h * 0.52);
    }
    for (const cx of [w * 0.32, w * 0.68]) {
      g.fillStyle = '#c9d1d9';
      g.fillRect(cx - w * 0.035, h * 0.3, w * 0.07, h * 0.4);
    }
  });
}

export function buildGymExterior(group: THREE.Group, colliders: Collider[], interactables: Interactable[], night: NightParts): GymExterior {
  const root = new THREE.Group();
  const parts = new THREE.Group();
  const steel = toon('#41505c');
  const dark = toon('#232a31');
  const lime = toon('#8fce3f');
  const panel = toon('#c9d1d9');

  // The block, a plinth, a lime band near the top and a cornice.
  parts.add(mesh(box(W, H, D), steel, CX, G + H / 2, CZ));
  parts.add(mesh(box(W + 0.3, 0.6, D + 0.3), dark, CX, G + 0.3, CZ));
  parts.add(mesh(box(W + 0.4, 0.35, D + 0.4), lime, CX, G + H - 1.0, CZ, false));
  parts.add(mesh(box(W + 0.8, 0.5, D + 0.8), dark, CX, G + H + 0.25, CZ));
  // Mullions down the front.
  for (const x of [B.minX + 0.5, B.minX + 6.5, DX - 3.4, DX + 3.4, B.maxX - 6.5, B.maxX - 0.5]) {
    parts.add(mesh(box(0.5, H - 1.4, 0.4), panel, x, G + (H - 1.4) / 2, FRONT - 0.16));
  }

  // Big glass storefront either side of the doors, glowing with the machines inside, brighter at night.
  const glassTex = canvasTexture(128, 256, (g) => {
    const grd = g.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0, '#dff3ff');
    grd.addColorStop(1, '#5f8fa8');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 256);
    // Faint silhouettes of equipment.
    g.fillStyle = 'rgba(30,50,60,0.35)';
    g.fillRect(20, 150, 26, 70);
    g.fillRect(70, 120, 16, 100);
    g.fillRect(96, 160, 20, 60);
    g.strokeStyle = '#232a31';
    g.lineWidth = 8;
    g.strokeRect(0, 0, 128, 256);
  });
  const glassMat = toonUnique('#bfe0ef');
  glassMat.map = glassTex;
  glassMat.emissive.set('#ffffff');
  glassMat.emissiveMap = glassTex;
  night.bulbs.push({ mat: glassMat, day: 0.22 });
  const windows = new THREE.Group();
  for (const [x0, x1] of [
    [B.minX + 1.4, DX - 4.2],
    [DX + 4.2, B.maxX - 1.4],
  ]) {
    const ww = x1 - x0;
    const w = mesh(new THREE.PlaneGeometry(ww, 4.2), glassMat, (x0 + x1) / 2, G + 3.0, FRONT - 0.02, false);
    w.rotation.y = Math.PI;
    windows.add(w);
  }
  root.add(windows);

  // The doorway: a lime frame round glass doors, which slide apart.
  const dw = GYM_STREET_DOOR.width;
  const dh = GYM_STREET_DOOR.height;
  parts.add(mesh(box(dw + 0.5, 0.35, 0.3), lime, DX, G + dh + 0.17, FRONT - 0.1));
  for (const s of [-1, 1]) parts.add(mesh(box(0.25, dh, 0.3), lime, DX + s * (dw / 2 + 0.12), G + dh / 2, FRONT - 0.1));
  const glimpse = canvasTexture(128, 160, (g) => {
    const grd = g.createLinearGradient(0, 0, 0, 160);
    grd.addColorStop(0, '#e8f7ff');
    grd.addColorStop(1, '#7fa8bb');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 160);
    g.fillStyle = 'rgba(40,60,70,0.3)';
    g.fillRect(30, 70, 20, 70);
    g.fillRect(80, 60, 14, 80);
  });
  const inside = mesh(new THREE.PlaneGeometry(dw, dh), glow(glimpse), DX, G + dh / 2, FRONT - 0.03, false);
  inside.rotation.y = Math.PI;
  root.add(inside);
  const glass = new THREE.MeshToonMaterial({ color: '#cfe8ef', transparent: true, opacity: 0.55 });
  const leaves = [-1, 1].map((s) => {
    const leaf = new THREE.Group();
    leaf.add(mesh(box(dw / 2 - 0.04, dh - 0.05, 0.05), glass, 0, 0, 0, false));
    leaf.add(mesh(box(0.05, 0.9, 0.08), lime, -s * (dw / 4 - 0.12), 0, -0.05, false));
    leaf.position.set(DX + (s * dw) / 4, G + dh / 2, FRONT - 0.12);
    root.add(leaf);
    return { leaf, s };
  });

  // A steel awning over the entrance, on lime poles, a lime valance along its edge.
  const awningZ0 = FRONT - 3.0;
  const aw = dw + 3;
  const awning = mesh(box(aw, 0.18, FRONT - awningZ0), steel, DX, G + dh + 0.75, (FRONT + awningZ0) / 2);
  awning.rotation.x = -0.08;
  root.add(awning);
  root.add(mesh(new THREE.PlaneGeometry(aw, 0.4), new THREE.MeshToonMaterial({ color: '#8fce3f', side: THREE.DoubleSide }), DX, G + dh + 0.45, awningZ0 - 0.05, false));
  for (const s of [-1, 1]) {
    const px = DX + s * (aw / 2 - 0.15);
    parts.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, dh + 0.7, 10), lime, px, G + (dh + 0.7) / 2, awningZ0 + 0.1));
    colliders.push({ minX: px - 0.12, maxX: px + 0.12, minZ: awningZ0, maxZ: awningZ0 + 0.25, bottom: G, top: G + dh + 0.7 });
  }
  // A rubber entrance mat.
  const mat = mesh(new THREE.PlaneGeometry(dw + 0.6, FRONT - (GYM_STREET_SPOT.z - 1.2)), toon('#2b333a'), DX, G + 0.015, (FRONT + (GYM_STREET_SPOT.z - 1.2)) / 2, false);
  mat.rotation.x = -Math.PI / 2;
  mat.receiveShadow = true;
  root.add(mat);

  // The sign: FITNESS in lime neon on a dark board over the doors, ringed with chaser bulbs, with a
  // barbell logo, and a vertical blade down each front corner.
  const signW = 9.2;
  const signH = 2.4;
  const signY = G + H - 2.4;
  const sign = mesh(new THREE.PlaneGeometry(signW, signH), glow(neonSign('FITNESS', '#a3e635', 896, 240, '#0f1a12')), DX, signY, FRONT - 0.36, false);
  sign.rotation.y = Math.PI;
  root.add(sign);
  parts.add(mesh(box(signW + 0.5, signH + 0.5, 0.3), dark, DX, signY, FRONT - 0.18));
  const bulbs = chaser(signW + 0.2, signH + 0.2, 0.32, 0.07, ['#d9ffa8', '#a3e635', '#d9ffa8']);
  bulbs.group.position.set(DX, signY, FRONT - 0.4);
  root.add(bulbs.group);
  const logo = glow(barbell());
  for (const x of [B.minX + 0.2, B.maxX - 0.2]) {
    const b = mesh(new THREE.PlaneGeometry(1.6, 1.6), logo, x, G + H / 2 + 1.2, FRONT - 0.55, false);
    b.rotation.y = Math.PI;
    root.add(b);
    const blade = mesh(new THREE.PlaneGeometry(5.4, 1.2), glow(neonSign('GYM · 24/7', '#35e0d0', 512, 128, '#0f1a12')), x, G + H / 2 - 0.9, FRONT - 0.55, false);
    blade.rotation.set(0, Math.PI, Math.PI / 2);
    root.add(blade);
    parts.add(mesh(box(1.7, 6.6, 0.3), dark, x, G + H / 2 - 0.1, FRONT - 0.35));
  }
  // Neon strips along the top of the front and down its sides.
  const limeGlow = glow(null, '#a3e635');
  const teal = glow(null, '#35e0d0');
  root.add(mesh(box(W, 0.08, 0.08), limeGlow, CX, G + H - 0.6, FRONT - 0.3, false));
  for (const [x0, x1] of [
    [B.minX, DX - dw / 2 - 0.4],
    [DX + dw / 2 + 0.4, B.maxX],
  ]) root.add(mesh(box(x1 - x0, 0.08, 0.08), teal, (x0 + x1) / 2, G + 1.0, FRONT - 0.3, false));
  for (const x of [B.minX - 0.02, B.maxX + 0.02]) root.add(mesh(box(0.08, 0.08, D), limeGlow, x, G + H - 0.6, CZ, false));
  night.halos.push({ at: new THREE.Vector3(DX, signY, FRONT - 1), size: 7, color: '#a3e635', ground: true });
  night.halos.push({ at: new THREE.Vector3(DX, G + dh + 0.5, awningZ0), size: 2.2, color: '#35e0d0', ground: true });

  root.add(mergeByMaterial(parts));
  group.add(root);

  // In the way: the whole building (you go in by the doors, with E), coarse like the neighbours'.
  colliders.push({ minX: B.minX, maxX: B.maxX, minZ: B.minZ - 0.2, maxZ: B.maxZ, bottom: G, top: G + H + 0.5 });

  const interactable: Interactable = { kind: 'gym', x: DX, z: FRONT - 1.1, y: G, radius: 2.4 };
  interactables.push(interactable);
  inside.userData.interact = interactable;
  for (const { leaf } of leaves) leaf.userData.interact = interactable;
  sign.userData.interact = interactable;

  const door: GymDoor = {
    x: DX,
    y: G,
    z: FRONT - 0.2,
    open: 0,
    show: (k) => {
      const e = k * k * (3 - 2 * k);
      for (const { leaf, s } of leaves) leaf.position.x = DX + (s * dw) / 4 + s * e * (dw / 2 - 0.1);
    },
  };

  return {
    door,
    interactable,
    setStreet(y) {
      door.y = y;
      interactable.y = y;
    },
    update(t) {
      bulbs.update(t);
      const flick = Math.sin(t * 17) > 0.98 ? 0.4 : 1;
      teal.color.setRGB(0.2 * flick, 0.88 * flick, 0.82 * flick);
    },
  };
}

// ---- Seen from the roof (world/city.ts) ------------------------------------------------------------

/** Whether a lot of the roof's city (centered at x, z, w × d) would stand where the gym does. */
export function onGymLot(x: number, z: number, w: number, d: number): boolean {
  return x + w / 2 > B.minX - 2 && x - w / 2 < B.maxX + 2 && z + d / 2 > B.minZ - 2 && z - d / 2 < B.maxZ + 2;
}

/** The gym as the roof sees it, far below: its block and the sign on its front, on the city's street (y 0). */
export function cityGym(): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(box(W, H, D), toon('#41505c'), CX, H / 2, CZ));
  g.add(mesh(box(W + 0.8, 0.5, D + 0.8), toon('#232a31'), CX, H + 0.25, CZ));
  const sign = mesh(new THREE.PlaneGeometry(9.2, 2.4), glow(neonSign('FITNESS', '#a3e635', 896, 240, '#0f1a12')), DX, H - 2.4, FRONT - 0.2, false);
  sign.rotation.y = Math.PI;
  g.add(sign);
  const top = mesh(new THREE.PlaneGeometry(W - 4, 4), glow(neonSign('GYM', '#a3e635', 1024, 160, '#0f1a12')), CX, H + 0.52, CZ, false);
  top.rotation.x = -Math.PI / 2;
  g.add(top);
  return g;
}
