import * as THREE from 'three';
import { STREET_Y } from '../../../shared/layout';
import { CASINO_BOX, CASINO_DOOR, CASINO_HEIGHT, CASINO_STREET_SPOT } from '../../../shared/casino';
import type { Collider, Interactable } from '../types';
import type { NightParts } from '../outside';
import { mergeByMaterial, mesh, toon, toonUnique } from '../toon';
import { box, canvasTexture, chaser, glow, neonSign } from './parts';

/*
 * The casino's outside, on the street across from the office (flrnoh fork, see FORK.md): a
 * burgundy block with gold trim, a big neon CASINO sign ringed with chaser bulbs, an awning over
 * a red carpet out to the sidewalk, and glass doors that slide apart as someone comes up. E at the
 * doors takes you inside (client/casino.ts). Built into the street, so it drops with it per floor.
 */

const G = STREET_Y;
const B = CASINO_BOX;
const H = CASINO_HEIGHT;
const W = B.maxX - B.minX;
const D = B.maxZ - B.minZ;
const CX = (B.minX + B.maxX) / 2;
const CZ = (B.minZ + B.maxZ) / 2;
const DX = CASINO_DOOR.x;
/** The front face (north, toward the street). */
const FRONT = B.minZ;

/** A door that slides open as someone comes up (office.ts's Door). */
export interface CasinoDoor {
  x: number;
  y: number;
  z: number;
  open: number;
  show(open: number): void;
}

export interface CasinoExterior {
  door: CasinoDoor;
  /** E here: in you go. */
  interactable: Interactable;
  /** Your floor's street is `y` down (see streetBelow): the doors and their hint go with it. */
  setStreet(y: number): void;
  update(t: number): void;
}

export function buildCasinoExterior(group: THREE.Group, colliders: Collider[], interactables: Interactable[], night: NightParts): CasinoExterior {
  const root = new THREE.Group();
  const parts = new THREE.Group();
  const wine = toon('#6d1a33');
  const dark = toon('#3a0d1c');
  const gold = toon('#d4a24c');
  const cream = toon('#f3e3c3');

  // The block, a plinth, a gold band at the top and a cornice.
  parts.add(mesh(box(W, H, D), wine, CX, G + H / 2, CZ));
  parts.add(mesh(box(W + 0.3, 0.6, D + 0.3), dark, CX, G + 0.3, CZ));
  parts.add(mesh(box(W + 0.4, 0.35, D + 0.4), gold, CX, G + H - 0.9, CZ, false));
  parts.add(mesh(box(W + 0.8, 0.5, D + 0.8), dark, CX, G + H + 0.25, CZ));
  // Pilasters down the front, gold-capped.
  for (const x of [B.minX + 0.4, B.minX + 6, DX - 3.2, DX + 3.2, B.maxX - 6, B.maxX - 0.4]) {
    parts.add(mesh(box(0.7, H - 1.2, 0.4), cream, x, G + (H - 1.2) / 2, FRONT - 0.18));
    parts.add(mesh(box(0.9, 0.3, 0.55), gold, x, G + H - 1.25, FRONT - 0.2, false));
  }

  // Tall arched windows either side, warm light behind frosted glass, lit brighter at night.
  const windowTex = canvasTexture(128, 256, (g) => {
    const grd = g.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0, '#ffcf73');
    grd.addColorStop(1, '#b3413d');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 256);
    g.strokeStyle = '#3a0d1c';
    g.lineWidth = 8;
    g.strokeRect(0, 0, 128, 256);
    g.beginPath();
    g.moveTo(64, 0);
    g.lineTo(64, 256);
    g.moveTo(0, 110);
    g.lineTo(128, 110);
    g.stroke();
  });
  const windowMat = toonUnique('#e0a46a');
  windowMat.map = windowTex;
  windowMat.emissive.set('#ffffff');
  windowMat.emissiveMap = windowTex;
  night.bulbs.push({ mat: windowMat, day: 0.25 });
  const windows = new THREE.Group();
  for (const x of [B.minX + 3.2, DX - 6.2, DX + 6.2, B.maxX - 3.2]) {
    const w = mesh(new THREE.PlaneGeometry(1.8, 3.4), windowMat, x, G + 3.2, FRONT - 0.02, false);
    w.rotation.y = Math.PI;
    windows.add(w);
    parts.add(mesh(box(2.1, 0.18, 0.3), gold, x, G + 1.4, FRONT - 0.12, false));
  }
  root.add(windows);

  // The doorway: a gold frame round dark glass doors, which slide apart.
  const dw = CASINO_DOOR.width;
  const dh = CASINO_DOOR.height;
  parts.add(mesh(box(dw + 0.5, 0.35, 0.3), gold, DX, G + dh + 0.17, FRONT - 0.1));
  for (const s of [-1, 1]) parts.add(mesh(box(0.25, dh, 0.3), gold, DX + s * (dw / 2 + 0.12), G + dh / 2, FRONT - 0.1));
  // Through the doors: the warm glow of the room, chandeliers and all.
  const glimpse = canvasTexture(128, 160, (g) => {
    const grd = g.createLinearGradient(0, 0, 0, 160);
    grd.addColorStop(0, '#2a0a16');
    grd.addColorStop(0.55, '#8a2a2a');
    grd.addColorStop(1, '#4a1020');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 160);
    for (const [x, y, r] of [
      [30, 34, 9],
      [96, 30, 11],
      [64, 52, 7],
      [20, 80, 5],
      [108, 86, 6],
    ]) {
      const b = g.createRadialGradient(x, y, 0, x, y, r * 2.2);
      b.addColorStop(0, 'rgba(255,230,160,0.95)');
      b.addColorStop(1, 'rgba(255,200,120,0)');
      g.fillStyle = b;
      g.fillRect(x - r * 3, y - r * 3, r * 6, r * 6);
    }
  });
  const inside = mesh(new THREE.PlaneGeometry(dw, dh), glow(glimpse), DX, G + dh / 2, FRONT - 0.03, false);
  inside.rotation.y = Math.PI;
  root.add(inside);
  const glass = new THREE.MeshToonMaterial({ color: '#2a3140', transparent: true, opacity: 0.6 });
  const leaves = [-1, 1].map((s) => {
    const leaf = new THREE.Group();
    leaf.add(mesh(box(dw / 2 - 0.04, dh - 0.05, 0.05), glass, 0, 0, 0, false));
    leaf.add(mesh(box(0.05, 0.9, 0.08), gold, -s * (dw / 4 - 0.12), 0, -0.05, false));
    leaf.position.set(DX + (s * dw) / 4, G + dh / 2, FRONT - 0.12);
    root.add(leaf);
    return { leaf, s };
  });

  // The awning over the carpet, on gold poles, its edge scalloped in stripes.
  const awningZ0 = FRONT - 3.2;
  const aw = dw + 3;
  const stripes = canvasTexture(256, 64, (g) => {
    for (let i = 0; i < 16; i++) {
      g.fillStyle = i % 2 ? '#f3e3c3' : '#a4161a';
      g.fillRect(i * 16, 0, 16, 64);
    }
  });
  const awning = mesh(box(aw, 0.18, FRONT - awningZ0), new THREE.MeshToonMaterial({ color: '#a4161a' }), DX, G + dh + 0.75, (FRONT + awningZ0) / 2);
  awning.rotation.x = -0.08;
  root.add(awning);
  const valance = mesh(new THREE.PlaneGeometry(aw, 0.45), new THREE.MeshToonMaterial({ map: stripes, side: THREE.DoubleSide }), DX, G + dh + 0.45, awningZ0 - 0.05, false);
  root.add(valance);
  for (const s of [-1, 1]) {
    const px = DX + s * (aw / 2 - 0.15);
    parts.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, dh + 0.7, 10), gold, px, G + (dh + 0.7) / 2, awningZ0 + 0.1));
    colliders.push({ minX: px - 0.12, maxX: px + 0.12, minZ: awningZ0, maxZ: awningZ0 + 0.25, bottom: G, top: G + dh + 0.7 });
  }
  // The red carpet, from the sidewalk to the doors, with brass stanchions and a velvet rope either side.
  const carpetZ0 = CASINO_STREET_SPOT.z - 1.4;
  const carpet = mesh(new THREE.PlaneGeometry(dw + 0.4, FRONT - carpetZ0), toon('#b3122e'), DX, G + 0.015, (FRONT + carpetZ0) / 2, false);
  carpet.rotation.x = -Math.PI / 2;
  carpet.receiveShadow = true;
  root.add(carpet);
  for (const s of [-1, 1]) {
    const x = DX + s * (dw / 2 + 0.55);
    for (const z of [carpetZ0 + 0.3, awningZ0 + 1.2]) {
      parts.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.95, 8), gold, x, G + 0.48, z));
      parts.add(mesh(new THREE.SphereGeometry(0.08, 10, 8), gold, x, G + 0.98, z, false));
      parts.add(mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.06, 12), gold, x, G + 0.03, z));
    }
    const rope = mesh(new THREE.CylinderGeometry(0.035, 0.035, awningZ0 + 1.2 - (carpetZ0 + 0.3), 6), toon('#7a0f24'), x, G + 0.82, (carpetZ0 + 0.3 + awningZ0 + 1.2) / 2, false);
    rope.rotation.x = Math.PI / 2;
    parts.add(rope);
  }

  // The sign: CASINO in red neon on a black board over the doors, ringed with chaser bulbs, and
  // a vertical blade down each front corner.
  const signW = 8.4;
  const signH = 2.6;
  const signY = G + H - 2.6;
  const sign = mesh(new THREE.PlaneGeometry(signW, signH), glow(neonSign('CASINO', '#ff3b5c', 832, 256)), DX, signY, FRONT - 0.36, false);
  sign.rotation.y = Math.PI;
  root.add(sign);
  parts.add(mesh(box(signW + 0.5, signH + 0.5, 0.3), dark, DX, signY, FRONT - 0.18));
  const bulbs = chaser(signW + 0.2, signH + 0.2);
  bulbs.group.position.set(DX, signY, FRONT - 0.4);
  root.add(bulbs.group);
  const blade = neonSign('♠ ♥ ♦ ♣', '#ffd36b', 512, 128);
  for (const x of [B.minX + 0.2, B.maxX - 0.2]) {
    const b = mesh(new THREE.PlaneGeometry(6, 1.4), glow(blade), x, G + H / 2 + 0.5, FRONT - 0.55, false);
    b.rotation.set(0, Math.PI, Math.PI / 2);
    root.add(b);
    parts.add(mesh(box(1.6, 6.3, 0.3), dark, x, G + H / 2 + 0.5, FRONT - 0.35));
  }
  // Neon strips along the top of the front and down its sides, pink and teal, flickering a little.
  const pink = glow(null, '#ff4fa3');
  const teal = glow(null, '#35e0d0');
  root.add(mesh(box(W, 0.08, 0.08), pink, CX, G + H - 0.55, FRONT - 0.3, false));
  // (the low one stops either side of the doors)
  for (const [x0, x1] of [
    [B.minX, DX - dw / 2 - 0.4],
    [DX + dw / 2 + 0.4, B.maxX],
  ]) root.add(mesh(box(x1 - x0, 0.08, 0.08), teal, (x0 + x1) / 2, G + 1.0, FRONT - 0.3, false));
  for (const x of [B.minX - 0.02, B.maxX + 0.02]) root.add(mesh(box(0.08, 0.08, D), pink, x, G + H - 0.55, CZ, false));
  // Their glow at night.
  night.halos.push({ at: new THREE.Vector3(DX, signY, FRONT - 1), size: 7, color: '#ff4f6e', ground: true });
  night.halos.push({ at: new THREE.Vector3(DX, G + dh + 0.5, awningZ0), size: 2.4, color: '#ffd36b', ground: true });

  root.add(mergeByMaterial(parts));
  group.add(root);

  // In the way: the whole building (you go in by the doors, with E), coarse like the neighbours'.
  colliders.push({ minX: B.minX, maxX: B.maxX, minZ: B.minZ - 0.2, maxZ: B.maxZ, bottom: G, top: G + H + 0.5 });

  const interactable: Interactable = { kind: 'casino', x: DX, z: FRONT - 1.1, y: G, radius: 2.4 };
  interactables.push(interactable);
  // Clicking the doors (or the sign) uses it too.
  inside.userData.interact = interactable;
  for (const { leaf } of leaves) leaf.userData.interact = interactable;
  sign.userData.interact = interactable;

  const door: CasinoDoor = {
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
      // A tube that's seen better days: now and then it stutters.
      const flick = Math.sin(t * 23) > 0.97 ? 0.35 : 1;
      pink.color.setRGB(1 * flick, 0.31 * flick, 0.64 * flick);
    },
  };
}

// ---- Seen from the roof (world/city.ts) ------------------------------------------------------------

/** Whether a lot of the roof's city (centered at x, z, w × d) would stand where the casino does. */
export function onCasinoLot(x: number, z: number, w: number, d: number): boolean {
  return x + w / 2 > B.minX - 2 && x - w / 2 < B.maxX + 2 && z + d / 2 > B.minZ - 2 && z - d / 2 < B.maxZ + 2;
}

/** The casino as the roof sees it, far below: its block and the sign on its front, on the city's street (y 0). */
export function cityCasino(): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(box(W, H, D), toon('#6d1a33'), CX, H / 2, CZ));
  g.add(mesh(box(W + 0.8, 0.5, D + 0.8), toon('#3a0d1c'), CX, H + 0.25, CZ));
  const sign = mesh(new THREE.PlaneGeometry(8.4, 2.6), glow(neonSign('CASINO', '#ff3b5c', 832, 256)), DX, H - 2.6, FRONT - 0.2, false);
  sign.rotation.y = Math.PI;
  g.add(sign);
  // Lit up on top too, to be seen from above.
  const top = mesh(new THREE.PlaneGeometry(W - 4, 4), glow(neonSign('CASINO', '#ffd36b', 1024, 160)), CX, H + 0.52, CZ, false);
  top.rotation.x = -Math.PI / 2;
  g.add(top);
  return g;
}
