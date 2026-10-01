import * as THREE from 'three';
import { STREET_Y, roofDrop } from '../../../shared/layout';
import { mulberry32 } from '../../../shared/rng';
import { tilingCanvasTexture } from '../texture';
import { toon } from '../toon';

// flrnoh fork (see FORK.md): the city's building blocks (see town/index.ts): its paints and window
// textures, the walls and flat strips it piles up into a few meshes, and how tall it stands.

/** Down on the street, in the office's frame on its bottom floor (and the town's own). */
export const G = STREET_Y;
/** One storey, and one bay of windows, in meters. */
const STOREY = 3.3;
const BAY = 2.8;
/** How far down the street was from the roof the buildings' heights were picked for: six floors. */
export const LAID_OUT = roofDrop(6);
/** How tall a street lamp is, and how far apart they stand along a street. */
export const LAMP_H = 5.2;
export const LAMP_EVERY = 28;

/** How a building's walls look: its paint, and the windows in it (glass towers are nearly all window). */
export interface Paint {
  wall: string;
  glass: string;
  /** The window's share of a bay across and of a storey up. */
  wide: number;
  tall: number;
}

export const PAINTS: Paint[] = [
  { wall: '#d9a27e', glass: '#a9d6f5', wide: 0.5, tall: 0.55 },
  { wall: '#c96f5a', glass: '#b8e0f7', wide: 0.45, tall: 0.55 },
  { wall: '#e9dcc3', glass: '#9cc9ea', wide: 0.55, tall: 0.6 },
  { wall: '#b9c0c9', glass: '#bfe3ff', wide: 0.6, tall: 0.55 },
  { wall: '#a7c4d9', glass: '#e6f4ff', wide: 0.5, tall: 0.6 },
  { wall: '#e8b4b8', glass: '#bfe3ff', wide: 0.5, tall: 0.55 },
  { wall: '#f1e3b3', glass: '#a9d6f5', wide: 0.45, tall: 0.5 },
  // Glass towers.
  { wall: '#4f6d8a', glass: '#7fb8d8', wide: 0.9, tall: 0.82 },
  { wall: '#3e7c7c', glass: '#8fd3d0', wide: 0.9, tall: 0.82 },
];
/** One bay of one storey: the wall with a window in it. */
export function bayTexture(p: Paint): THREE.CanvasTexture {
  const S = 128;
  return tilingCanvasTexture(S, S, (g) => {
    g.fillStyle = p.wall;
    g.fillRect(0, 0, S, S);
    const w = S * p.wide;
    const h = S * p.tall;
    const x = (S - w) / 2;
    const y = S * 0.18;
    g.fillStyle = p.glass;
    g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(255,255,255,0.45)';
    g.fillRect(x + w * 0.12, y, w * 0.1, h);
    // Its frame and a cross of glazing bars (glass towers' panes are bigger, with a bar across).
    const glassy = p.wide > 0.8;
    g.strokeStyle = 'rgba(30,34,44,0.55)';
    g.lineWidth = glassy ? 2 : 3;
    g.strokeRect(x, y, w, h);
    g.beginPath();
    if (!glassy) {
      g.moveTo(x + w / 2, y);
      g.lineTo(x + w / 2, y + h);
    }
    g.moveTo(x, y + h * 0.38);
    g.lineTo(x + w, y + h * 0.38);
    g.stroke();
    // A lintel over it and a sill under it.
    g.fillStyle = 'rgba(0,0,0,0.10)';
    g.fillRect(x - 3, y - 5, w + 6, 4);
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.fillRect(x - 4, y + h, w + 8, 5);
    // The line where one storey's floor slab meets the next.
    g.fillStyle = 'rgba(0,0,0,0.06)';
    g.fillRect(0, S - 3, S, 3);
  });
}

/** Which windows are lit at night: 16 × 16 bays of them, each building showing a different part. */
export function litTexture(p: Paint, seed: number): THREE.CanvasTexture {
  const N = 16;
  const C = 16;
  const r = mulberry32(seed);
  return tilingCanvasTexture(N * C, N * C, (g) => {
    g.fillStyle = '#000000';
    g.fillRect(0, 0, N * C, N * C);
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        if (r() < 0.5) continue;
        const k = r();
        g.fillStyle = k < 0.12 ? '#9ec9ff' : k < 0.55 ? '#ffd27a' : '#ffe6b0';
        const w = C * p.wide;
        const h = C * p.tall;
        g.fillRect(i * C + (C - w) / 2, j * C + C * 0.18, w, h);
      }
    }
  });
}

/** Wall faces piling up for one material, to be one mesh. */
export class Walls {
  pos: number[] = [];
  norm: number[] = [];
  uv: number[] = [];
  index: number[] = [];

  /** A quad from its bottom-left corner `a` along `u` (across) and up `h`, facing `n`; `uv` is [u0, v0, u1, v1]. */
  quad(a: [number, number, number], u: [number, number, number], h: number, n: [number, number, number], uv: [number, number, number, number]) {
    const i = this.pos.length / 3;
    const [x, y, z] = a;
    const up: [number, number, number] = n[1] === 1 ? [0, 0, -h] : [0, h, 0];
    this.pos.push(x, y, z, x + u[0], y + u[1], z + u[2], x + u[0] + up[0], y + u[1] + up[1], z + u[2] + up[2], x + up[0], y + up[1], z + up[2]);
    for (let k = 0; k < 4; k++) this.norm.push(...n);
    const [u0, v0, u1, v1] = uv;
    this.uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
    this.index.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }

  /** The four walls of a box from y0 to y1, windows a bay across and a storey up, lit windows from (ou, ov) of the pattern. */
  box(cx: number, cz: number, w: number, d: number, y0: number, y1: number, ou: number, ov: number) {
    const hw = w / 2;
    const hd = d / 2;
    const floors = Math.max(1, Math.round((y1 - y0) / STOREY));
    const h = y1 - y0;
    const across = (span: number) => Math.max(1, Math.round(span / BAY));
    const cw = across(w);
    const cd = across(d);
    this.quad([cx - hw, y0, cz + hd], [w, 0, 0], h, [0, 0, 1], [ou, ov, ou + cw, ov + floors]);
    this.quad([cx + hw, y0, cz - hd], [-w, 0, 0], h, [0, 0, -1], [ou + 3, ov, ou + 3 + cw, ov + floors]);
    this.quad([cx + hw, y0, cz + hd], [0, 0, -d], h, [1, 0, 0], [ou + 7, ov, ou + 7 + cd, ov + floors]);
    this.quad([cx - hw, y0, cz - hd], [0, 0, d], h, [-1, 0, 0], [ou + 11, ov, ou + 11 + cd, ov + floors]);
  }

  /** A flat top at y. */
  top(cx: number, cz: number, w: number, d: number, y: number) {
    this.quad([cx - w / 2, y, cz + d / 2], [w, 0, 0], d, [0, 1, 0], [0, 0, 1, 1]);
  }

  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.norm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.index);
    g.computeBoundingSphere();
    return g;
  }
}

/** Flat rectangles lying on the ground, piling up for one material: [minX, maxX, minZ, maxZ], with the texture's u along `alongX`. */
export class Flats {
  pos: number[] = [];
  uv: number[] = [];
  add(minX: number, maxX: number, minZ: number, maxZ: number, y: number, uv?: { alongX: boolean; per: number }) {
    this.pos.push(minX, y, maxZ, maxX, y, maxZ, maxX, y, minZ, minX, y, maxZ, maxX, y, minZ, minX, y, minZ);
    if (!uv) {
      for (let k = 0; k < 6; k++) this.uv.push(0, 0);
      return;
    }
    // Along the street, a repeat every `per` meters; across it, the texture's whole height.
    const u = (x: number, z: number) => (uv.alongX ? x : z) / uv.per;
    const v = (x: number, z: number) => (uv.alongX ? (z - minZ) / (maxZ - minZ) : (maxX - x) / (maxX - minX));
    for (const [x, z] of [
      [minX, maxZ],
      [maxX, maxZ],
      [maxX, minZ],
      [minX, maxZ],
      [maxX, minZ],
      [minX, minZ],
    ])
      this.uv.push(u(x, z), v(x, z));
  }
  mesh(mat: THREE.Material): THREE.Mesh {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true;
    return m;
  }
}

/**
 * For something lying flat on the ground: drawn over whatever's under it (the higher `over`, the more
 * it wins), and never outlined, which would ink a flat strip's edges up off the ground.
 */
export function flat(color: string, over: number, map: THREE.Texture | null = null): THREE.MeshToonMaterial {
  const m = new THREE.MeshToonMaterial({ color, map, gradientMap: (toon('#fff') as THREE.MeshToonMaterial).gradientMap, polygonOffset: true, polygonOffsetFactor: -over, polygonOffsetUnits: -over * 2 });
  m.userData.outlineParameters = { visible: false };
  return m;
}

/** Soft round blob, for lamps seen from far off. */
export function glowTexture(): THREE.CanvasTexture {
  return tilingCanvasTexture(64, 64, (g) => {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.25, 'rgba(255,255,255,0.7)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  });
}

/**
 * How much of its laid-out height a building in `ring` stands with the street `drop` below the roof.
 * Close by they come down with the roof, to stay under it; further out a bit less, and the skyline
 * stays the skyline. Up to six floors, where they were laid out; no taller past that.
 */
export function rise(ring: number, drop: number): number {
  const k = Math.min(1, drop / LAID_OUT);
  return ring === 0 ? k : ring === 1 ? Math.sqrt(k) : 1;
}

/** Puts geometries (position and normal only) into one. */
export function mergeGeometries(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const norm: number[] = [];
  for (const g of geos) {
    const f = g.index ? g.toNonIndexed() : g;
    pos.push(...(f.getAttribute('position').array as Float32Array));
    norm.push(...(f.getAttribute('normal').array as Float32Array));
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
  return out;
}
