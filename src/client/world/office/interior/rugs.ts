import * as THREE from 'three';
import type { RugKind } from '../../../../shared/interiors';
import { mulberry32 } from '../../../../shared/rng';
import { mesh, roundedBox, toon } from '../../toon';
import { shade } from './paint';

// flrnoh fork (see FORK.md, "Each storey its own interior"): the rug under a desk pod, as an interior
// lays it: 6.2 by 4.6 m (the office's as it always was), or round, woven, Persian, shaggy, edged in
// neon or a tatami. Its origin is on the floor under its middle; the rugs fixture (room.ts) puts it
// under its pod.

const W = 6.2;
const D = 4.6;
const Y = 0.011;

/** Textures by kind and color, made once. */
const MADE = new Map<string, THREE.Material>();
function made(key: string, make: () => THREE.Material): THREE.Material {
  let m = MADE.get(key);
  if (!m) MADE.set(key, (m = make()));
  return m;
}

/** A flat rug's material: a canvas `w` by `h` px painted by `paint`, without an outline. */
function painted(w: number, h: number, paint: (g: CanvasRenderingContext2D) => void, emissive?: string): THREE.MeshToonMaterial {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  paint(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  const m = toon('#ffffff').clone();
  m.map = t;
  if (emissive) {
    m.emissive = new THREE.Color(emissive);
    m.emissiveMap = t;
  }
  m.userData.outlineParameters = { visible: false };
  return m;
}

/** A plane lying on the floor, `w` by `d`, or an ellipse that size. */
function flat(mat: THREE.Material, w: number, d: number, round = false): THREE.Mesh {
  const geo = round ? new THREE.CircleGeometry(0.5, 48).scale(w, d, 1) : new THREE.PlaneGeometry(w, d);
  const m = mesh(geo, mat, 0, Y, 0, false);
  m.rotation.x = -Math.PI / 2;
  return m;
}

/** A Persian rug: a field in `color` with a medallion, a patterned border and a fringe. */
function persian(color: string): THREE.Material {
  return painted(310, 230, (g) => {
    const dark = shade(color, -0.15);
    const cream = '#efe2c4';
    const gold = '#c9a24a';
    g.fillStyle = cream;
    g.fillRect(0, 0, 310, 230);
    // Fringe at the ends.
    g.fillStyle = '#e8dcc0';
    for (let y = 0; y < 230; y += 4) {
      g.fillRect(0, y, 8, 2);
      g.fillRect(302, y, 8, 2);
    }
    g.fillStyle = dark;
    g.fillRect(10, 6, 290, 218);
    g.fillStyle = gold;
    g.fillRect(18, 14, 274, 202);
    // The border's little diamonds.
    g.fillStyle = dark;
    for (let x = 26; x < 290; x += 14) {
      for (const y of [18, 206]) diamond(g, x, y + 3, 5);
    }
    for (let y = 30; y < 206; y += 14) {
      for (const x of [22, 288]) diamond(g, x, y, 5);
    }
    g.fillStyle = color;
    g.fillRect(34, 30, 242, 170);
    // The medallion and the corners.
    g.fillStyle = cream;
    diamond(g, 155, 115, 62, 0.62);
    g.fillStyle = dark;
    diamond(g, 155, 115, 46, 0.62);
    g.fillStyle = gold;
    diamond(g, 155, 115, 22, 0.62);
    g.fillStyle = shade(color, 0.12);
    for (const [x, y] of [[34, 30], [276, 30], [34, 200], [276, 200]]) {
      g.beginPath();
      g.arc(x, y, 30, 0, Math.PI * 2);
      g.fill();
    }
  });
}

function diamond(g: CanvasRenderingContext2D, x: number, y: number, r: number, squash = 1) {
  g.beginPath();
  g.moveTo(x, y - r * squash);
  g.lineTo(x + r, y);
  g.lineTo(x, y + r * squash);
  g.lineTo(x - r, y);
  g.closePath();
  g.fill();
}

/** Jute, woven round and round. */
function jute(color: string): THREE.Material {
  return painted(256, 256, (g) => {
    g.fillStyle = color;
    g.fillRect(0, 0, 256, 256);
    for (let r = 124; r > 0; r -= 6) {
      g.strokeStyle = (r / 6) % 2 ? shade(color, -0.1) : shade(color, 0.06);
      g.lineWidth = 3;
      g.beginPath();
      g.arc(128, 128, r, 0, Math.PI * 2);
      g.stroke();
    }
  });
}

/** A shaggy pile, in `color` and lighter and darker tufts. */
function shag(color: string): THREE.Material {
  return painted(256, 256, (g) => {
    g.fillStyle = color;
    g.fillRect(0, 0, 256, 256);
    const rnd = mulberry32(17);
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = i % 3 ? shade(color, -0.12) : shade(color, 0.12);
      g.fillRect(rnd() * 256, rnd() * 256, 2, 5);
    }
  });
}

/** A dark rug edged with a glowing line in `color`. */
function neon(color: string): THREE.Material {
  return painted(310, 230, (g) => {
    g.fillStyle = '#12131c';
    g.fillRect(0, 0, 310, 230);
    g.strokeStyle = color;
    g.lineWidth = 5;
    g.strokeRect(12, 12, 286, 206);
    g.globalAlpha = 0.35;
    g.lineWidth = 2;
    g.strokeRect(26, 26, 258, 178);
    g.globalAlpha = 1;
  }, '#ffffff');
}

/** A tatami mat, edged in black. */
function tatamiMat(color: string): THREE.Material {
  return painted(310, 230, (g) => {
    g.fillStyle = '#1f1f1f';
    g.fillRect(0, 0, 310, 230);
    g.fillStyle = color;
    g.fillRect(10, 10, 290, 210);
    g.fillStyle = shade(color, -0.08);
    for (let x = 14; x < 298; x += 5) g.fillRect(x, 10, 1, 210);
    // The seam between two mats.
    g.fillStyle = '#1f1f1f';
    g.fillRect(153, 10, 4, 210);
  });
}

/** The rug under a desk pod in `kind` and `color`. */
export function rug(kind: RugKind, color: string): THREE.Object3D {
  switch (kind) {
    case 'rect':
      return mesh(roundedBox(W, 0.02, D, 0.6), toon(color), 0, Y, 0, false);
    case 'round':
      return mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.02, 48).scale(W * 0.92, 1, D * 0.98), toon(color), 0, Y, 0, false);
    case 'oriental':
      return flat(made(`persian|${color}`, () => persian(color)), W, D);
    case 'jute':
      return flat(made(`jute|${color}`, () => jute(color)), W * 0.95, D, true);
    case 'shag':
      return flat(made(`shag|${color}`, () => shag(color)), W * 0.9, D * 0.95, true);
    case 'neon':
      return flat(made(`neon|${color}`, () => neon(color)), W, D);
    case 'tatami':
      return flat(made(`tatami|${color}`, () => tatamiMat(color)), W, D);
  }
}
