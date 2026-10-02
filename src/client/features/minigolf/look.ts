import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/*
 * The black light's look (flrnoh fork, see FORK.md "Black-light mini golf"). In the mini golf room the
 * UV tubes are the only light, whatever the bowling centre's own lights do, so nothing in there is lit
 * by the scene: every surface is unlit, its shading baked into its vertex colours (a soft violet light
 * from above), and what's painted with fluorescent paint glows in its own colour, with a soft halo
 * round it (additive). Static pieces are merged into one mesh per material, so a whole hole draws in a
 * handful of calls.
 */

/** Where the baked light comes from, and how violet the UV makes what isn't fluorescent. */
const LIGHT = new THREE.Vector3(0.35, 1, 0.45).normalize();
const UV = new THREE.Color('#2a1050');

const basic = new Map<string, THREE.MeshBasicMaterial>();

/** Plain unlit paint, shared by colour. */
export function unlit(color: THREE.ColorRepresentation, opts: { transparent?: boolean; opacity?: number; side?: THREE.Side } = {}): THREE.MeshBasicMaterial {
  const key = `${new THREE.Color(color).getHexString()}|${opts.opacity ?? 1}|${opts.side ?? 0}`;
  let m = basic.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color, transparent: !!opts.transparent || (opts.opacity ?? 1) < 1, opacity: opts.opacity ?? 1, side: opts.side ?? THREE.FrontSide });
    basic.set(key, m);
  }
  return m;
}

const halos = new Map<string, THREE.MeshBasicMaterial>();

/** A glow: added on top of what's behind it, never hiding anything. */
export function halo(color: THREE.ColorRepresentation, opacity = 0.35): THREE.MeshBasicMaterial {
  const key = `${new THREE.Color(color).getHexString()}|${opacity}`;
  let m = halos.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, map: glowTexture() });
    halos.set(key, m);
  }
  return m;
}

let glowTex: THREE.CanvasTexture | null = null;

/** A soft falloff across (v) for the halos: brightest along the middle. */
export function glowTexture(): THREE.CanvasTexture {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.5, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 64);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

let dotTex: THREE.CanvasTexture | null = null;

/** A round soft glow, for sprites (the balls' halos, the cup lights). */
export function dotTexture(): THREE.CanvasTexture {
  if (dotTex) return dotTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  dotTex = new THREE.CanvasTexture(c);
  dotTex.colorSpace = THREE.SRGBColorSpace;
  return dotTex;
}

/** The one material every baked piece shares. */
export const BAKED = new THREE.MeshBasicMaterial({ vertexColors: true });

const tmp = new THREE.Vector3();
const col = new THREE.Color();

/**
 * Bakes `color` into `geo`'s vertex colours, shaded by the violet light from above (`glow` 0–1: how
 * much of it is fluorescent paint, which shines whatever way it faces). Returns the geometry (non-indexed, ready to merge).
 */
export function bake(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, glow = 0): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  g.deleteAttribute('uv');
  const n = g.getAttribute('normal');
  const base = new THREE.Color(color);
  const colors = new Float32Array(n.count * 3);
  for (let i = 0; i < n.count; i++) {
    tmp.fromBufferAttribute(n, i);
    const d = Math.max(0, tmp.dot(LIGHT));
    const k = glow + (1 - glow) * (0.38 + 0.62 * d);
    col.copy(base).multiplyScalar(k);
    // What isn't fluorescent picks up the UV's violet.
    col.r += UV.r * (1 - glow) * 0.6;
    col.g += UV.g * (1 - glow) * 0.6;
    col.b += UV.b * (1 - glow) * 0.6;
    colors[i * 3] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

/** A piece placed: `geo` moved and turned into place (for merging). */
export function placed(geo: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): THREE.BufferGeometry {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));
  return geo.applyMatrix4(m);
}

/** Collects pieces by material and makes one mesh of each lot. */
export class Batch {
  private lots = new Map<THREE.Material, THREE.BufferGeometry[]>();

  add(geo: THREE.BufferGeometry, mat: THREE.Material = BAKED) {
    const lot = this.lots.get(mat) ?? [];
    lot.push(geo);
    this.lots.set(mat, lot);
  }

  /** A baked piece. */
  baked(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, glow = 0) {
    this.add(bake(geo, color, glow));
  }

  /** Everything collected, merged: into `into`. */
  build(into: THREE.Object3D, renderOrder = 0) {
    for (const [mat, geos] of this.lots) {
      // Merging needs the same attributes everywhere: what one has and another hasn't goes.
      const names = geos.map((g) => new Set(Object.keys(g.attributes)));
      const common = [...names[0]].filter((a) => names.every((s) => s.has(a)));
      const clean = geos.map((g) => {
        const c = g.index ? g.toNonIndexed() : g;
        for (const a of Object.keys(c.attributes)) if (!common.includes(a)) c.deleteAttribute(a);
        c.morphAttributes = {};
        return c;
      });
      const merged = mergeGeometries(clean, false);
      if (!merged) continue;
      const m = new THREE.Mesh(merged, mat);
      m.renderOrder = renderOrder;
      m.matrixAutoUpdate = false;
      m.updateMatrix();
      into.add(m);
      for (const g of geos) g.dispose();
    }
    this.lots.clear();
  }
}

/** A glowing strip along the line a→b at height y (its halo lying flat, `w` wide). */
export function stripGeo(ax: number, az: number, bx: number, bz: number, y: number, w: number, upright = false): THREE.BufferGeometry {
  const len = Math.hypot(bx - ax, bz - az);
  const g = new THREE.PlaneGeometry(len, w);
  if (!upright) g.rotateX(-Math.PI / 2);
  // Across the strip is v, the halo's falloff.
  g.rotateY(-Math.atan2(bz - az, bx - ax));
  g.translate((ax + bx) / 2, y, (az + bz) / 2);
  return g;
}
