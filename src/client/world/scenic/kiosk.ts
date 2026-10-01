import * as THREE from 'three';
import { mesh, textPlane, toon } from '../toon';
import { G, box } from './kit';

// The snack shack on the beach, open (flrnoh fork, see FORK.md "A day at the beach"): Kiosk zur Möwe,
// its shutter propped up as an awning over the counter, the fryer, the ice cream freezer and the
// soft-serve machine inside, sauces and a bell on the counter, a menu board, and stools out front.
// coast.ts puts it where the closed shack stood; features/beach/kiosk.ts puts Uschi behind the counter.

/** Where the kiosk is, for the feature that serves at it: its counter's front, and where the vendor stands. */
export interface KioskSpot {
  x: number;
  z: number;
  /** Which way it's turned: its counter faces local -z. */
  rotY: number;
  /** Just in front of the counter, where you stand to order. */
  counter: { x: number; z: number };
  /** Behind it: the vendor's feet, and the way they face (out over the counter). */
  vendor: { x: number; z: number; rotY: number };
  /** On the counter, where what you order is put down for a moment. */
  hatch: { x: number; y: number; z: number };
}

const W = 4.4;
const D = 3.2;
const H = 2.6;
const WALL = 0.14;
/** The counter's top, and how far it reaches out over the front. */
const COUNTER = 1.08;

/** A chalkboard menu, drawn once. */
function menuBoard(): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 384;
  const g = c.getContext('2d')!;
  g.fillStyle = '#2f3e36';
  g.fillRect(0, 0, 512, 384);
  g.strokeStyle = '#a0794f';
  g.lineWidth = 18;
  g.strokeRect(9, 9, 494, 366);
  g.fillStyle = '#fefae0';
  g.textAlign = 'center';
  g.font = '800 46px Nunito, ui-rounded, system-ui, sans-serif';
  g.fillText('Kiosk zur Möwe', 256, 68);
  g.font = '700 30px Nunito, ui-rounded, system-ui, sans-serif';
  g.textAlign = 'left';
  const rows = ['🍟 Pommes rot-weiß', '🌭 Currywurst', '🐟 Fischbrötchen', '🍦 Softeis · 🍭 Eis am Stiel', '🥥 Kokosnuss · 🧋 Eistee'];
  rows.forEach((r, i) => g.fillText(r, 40, 122 + i * 46));
  g.fillStyle = '#ffd166';
  g.textAlign = 'center';
  g.font = '800 28px Nunito, ui-rounded, system-ui, sans-serif';
  g.fillText('alles gratis · on the house', 256, 356);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.2), new THREE.MeshBasicMaterial({ map: tex }));
}

/**
 * Builds the kiosk at (x, z) turned `rotY` (its counter facing local -z): the merged parts into
 * `into`, its signs into `labels`. Returns where it is, and its colliders' boxes (round the turned
 * walls, open in front of the counter).
 */
export function buildKiosk(into: THREE.Group, labels: THREE.Group, x: number, z: number, rotY: number): { spot: KioskSpot; boxes: { minX: number; maxX: number; minZ: number; maxZ: number }[] } {
  const k = new THREE.Group();
  const pink = toon('#ffcad4');
  const cream = toon('#fefae0');
  const red = toon('#ef476f');
  const steel = toon('#c0c4cc');
  const wood = toon('#b08968');
  // The walls: back, sides, and under the counter in front, with the window over it.
  k.add(mesh(box(W, H, WALL), pink, 0, H / 2, D / 2 - WALL / 2));
  for (const s of [-1, 1]) k.add(mesh(box(WALL, H, D), pink, s * (W / 2 - WALL / 2), H / 2, 0));
  k.add(mesh(box(W, COUNTER - 0.05, WALL), pink, 0, (COUNTER - 0.05) / 2, -D / 2 + WALL / 2));
  k.add(mesh(box(W, 0.32, WALL), pink, 0, H - 0.16, -D / 2 + WALL / 2));
  // Two cream bands round it, a floor inside, and the roof with its overhang.
  k.add(mesh(box(W + 0.04, 0.12, D + 0.04), cream, 0, 0.5, 0));
  k.add(mesh(box(W - 0.2, 0.06, D - 0.2), toon('#e9d8a6'), 0, 0.03, 0));
  // The duckboard the vendor stands on behind the counter.
  k.add(mesh(box(W - 0.4, 0.3, 1.0), toon('#a47148'), 0, 0.15, -D / 2 + 0.75));
  k.add(mesh(box(W + 0.6, 0.2, D + 0.6), cream, 0, H + 0.1, 0));
  // The counter, sticking out past the front, with a lip.
  k.add(mesh(box(W + 0.1, 0.08, 0.7), wood, 0, COUNTER, -D / 2 + 0.05));
  // The shutter, swung up on its hinge over the window and propped open: an awning in pink and cream stripes.
  const hinge = new THREE.Group();
  hinge.position.set(0, H - 0.2, -D / 2 - 0.02);
  hinge.rotation.x = 1.38;
  for (let i = 0; i < 6; i++) hinge.add(mesh(box(W / 6, 1.25, 0.05), i % 2 ? cream : red, -W / 2 + W / 12 + (i * W) / 6, -0.625, 0));
  k.add(hinge);
  // The props holding it up, from the counter's ends to the shutter's edge.
  const tip = new THREE.Vector3(0, -1.2, 0).applyEuler(hinge.rotation).add(hinge.position);
  for (const s of [-1, 1]) {
    const a = new THREE.Vector3(s * (W / 2 - 0.1), COUNTER + 0.05, -D / 2 - 0.25);
    const b = new THREE.Vector3(s * (W / 2 - 0.1), tip.y, tip.z);
    const len = a.distanceTo(b);
    const prop = mesh(new THREE.CylinderGeometry(0.03, 0.03, len, 6), wood, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    prop.rotation.x = Math.atan2(b.z - a.z, b.y - a.y);
    k.add(prop);
  }
  // Inside, along the back wall: the fryer with its baskets, the freezer with the tubs under glass, the soft-serve machine.
  k.add(mesh(box(1.1, 0.9, 0.7), steel, -1.35, 0.45, D / 2 - 0.5));
  k.add(mesh(box(0.9, 0.06, 0.5), toon('#d4a017'), -1.35, 0.93, D / 2 - 0.5));
  for (const s of [-1, 1]) k.add(mesh(box(0.35, 0.18, 0.3), toon('#6c757d'), -1.35 + s * 0.22, 1.05, D / 2 - 0.45));
  k.add(mesh(box(1.3, 0.85, 0.7), cream, 0.05, 0.425, D / 2 - 0.5));
  const tubs = ['#ff8fab', '#fefae0', '#8d5524', '#a7c957', '#ffd166'];
  tubs.forEach((c, i) => k.add(mesh(box(0.2, 0.06, 0.3), toon(c), -0.45 + i * 0.25, 0.86, D / 2 - 0.5)));
  k.add(mesh(box(0.55, 1.0, 0.55), steel, 1.4, 0.5 + 0.55, D / 2 - 0.45));
  k.add(mesh(box(0.6, 0.55, 0.6), toon('#adb5bd'), 1.4, 0.275, D / 2 - 0.45));
  for (const s of [-1, 1]) k.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.12, 8), toon('#495057'), 1.4 + s * 0.12, 1.0, D / 2 - 0.75));
  // On the counter: ketchup and mustard, napkins, a bell, and a stack of cones.
  k.add(mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.22, 10), toon('#d62828'), -1.7, COUNTER + 0.15, -D / 2 + 0.1));
  k.add(mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.22, 10), toon('#ffd60a'), -1.55, COUNTER + 0.15, -D / 2 + 0.1));
  k.add(mesh(box(0.16, 0.14, 0.12), steel, -1.2, COUNTER + 0.11, -D / 2 + 0.12));
  k.add(mesh(new THREE.SphereGeometry(0.07, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), toon('#d4a017'), 1.65, COUNTER + 0.04, -D / 2 + 0.05));
  for (let i = 0; i < 4; i++) k.add(mesh(new THREE.ConeGeometry(0.05, 0.14, 8).rotateX(Math.PI), toon('#e9c46a'), 1.25, COUNTER + 0.1 + i * 0.03, -D / 2 + 0.12));
  // A life ring on the side wall, and a fishing net with a starfish.
  const ring = mesh(new THREE.TorusGeometry(0.3, 0.08, 8, 20), toon('#f94144'), W / 2 + 0.03, 1.5, 0.4);
  ring.rotation.y = Math.PI / 2;
  k.add(ring);
  for (let i = 0; i < 4; i++) {
    const band = mesh(new THREE.TorusGeometry(0.3, 0.083, 8, 4, 0.35), cream, W / 2 + 0.03, 1.5, 0.4);
    band.rotation.set(0, Math.PI / 2, (i * Math.PI) / 2 + 0.2);
    k.add(band);
  }
  // Two stools and a high table out front, a bin, and a beach flag.
  for (const [sx, sz] of [
    [-1.7, -3.3],
    [1.9, -3.2],
  ]) {
    k.add(mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.7, 6), steel, sx, 0.35, sz));
    k.add(mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.07, 12), red, sx, 0.72, sz));
  }
  k.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.05, 6), steel, 0.2, 0.525, -3.6));
  k.add(mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 14), wood, 0.2, 1.07, -3.6));
  k.add(mesh(new THREE.CylinderGeometry(0.22, 0.2, 0.75, 10), toon('#2a9d8f'), -W / 2 - 0.5, 0.375, -1.2));
  k.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 3.6, 6), toon('#f1f1ee'), W / 2 + 0.6, 1.8, -1.6));
  const flag = mesh(box(0.04, 1.4, 0.55), toon('#06d6a0'), W / 2 + 0.6, 2.8, -1.32);
  flag.rotation.x = 0.08;
  k.add(flag);

  k.position.set(x, G, z);
  k.rotation.y = rotY;
  into.add(k);

  const turn = new THREE.Vector3(0, 1, 0);
  const at = (lx: number, ly: number, lz: number) => new THREE.Vector3(lx, ly, lz).applyAxisAngle(turn, rotY).add(new THREE.Vector3(x, G, z));
  // Its name over the shutter, and the menu on the side wall facing the road.
  const sign = textPlane('🍟 Kiosk zur Möwe 🍦', { color: '#3d2b1f', bg: '#fefae0', size: 56 });
  sign.scale.setScalar(1.05);
  sign.position.copy(at(0, H + 0.62, -D / 2 + 0.2));
  sign.rotation.y = rotY + Math.PI;
  labels.add(sign);
  const menu = menuBoard();
  menu.position.copy(at(-0.1, COUNTER + 0.95, D / 2 - WALL - 0.02));
  menu.rotation.y = rotY + Math.PI;
  labels.add(menu);

  // In the way: the walls and what's inside, as boxes round the turned footprint (a little in from the
  // front, so you can walk right up to the counter).
  const boxes = [] as { minX: number; maxX: number; minZ: number; maxZ: number }[];
  const around = (corners: [number, number][]) => {
    const pts = corners.map(([lx, lz]) => at(lx, 0, lz));
    boxes.push({ minX: Math.min(...pts.map((p) => p.x)), maxX: Math.max(...pts.map((p) => p.x)), minZ: Math.min(...pts.map((p) => p.z)), maxZ: Math.max(...pts.map((p) => p.z)) });
  };
  around([
    [-W / 2, -D / 2 - 0.35],
    [W / 2, -D / 2 - 0.35],
    [-W / 2, D / 2],
    [W / 2, D / 2],
  ]);
  const front = at(0, 0, -D / 2 - 1.25);
  const vendor = at(0.15, 0, -D / 2 + 0.75);
  const hatch = at(0.5, COUNTER + 0.05, -D / 2 + 0.05);
  return {
    spot: { x, z, rotY, counter: { x: front.x, z: front.z }, vendor: { x: vendor.x, z: vendor.z, rotY: rotY + Math.PI }, hatch: { x: hatch.x, y: hatch.y, z: hatch.z } },
    boxes,
  };
}
