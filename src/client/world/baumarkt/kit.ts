import * as THREE from 'three';
import { canvasTexture } from '../texture';
import { mesh, toon, toonUnique } from '../toon';

// flrnoh fork (see FORK.md "The Baumarkt"): the DIY store's building blocks: its colours, the indoor
// materials that light themselves up after dark (the hall's lamps are on), and signs drawn to canvas.

export const ORANGE = '#f26b1d';
export const BLUE = '#1d4e89';
export const STEEL = '#9aa3ad';

/** How bright the hall's own light is on what's inside it (0 by day, up at night): see indoor. */
export const indoorGlow = { value: 0.12 };

/** Turns `m` into one lit by the hall's lamps too: it glows its own colour (vertex and instance colours included), as bright as indoorGlow. */
export function glowing<M extends THREE.MeshToonMaterial>(m: M): M {
  m.onBeforeCompile = (shader, renderer) => {
    THREE.Material.prototype.onBeforeCompile.call(m, shader, renderer);
    shader.uniforms.bmGlow = indoorGlow;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float bmGlow;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * bmGlow;');
  };
  m.customProgramCacheKey = () => 'bm-indoor';
  return m;
}

const indoorCache = new Map<string, THREE.MeshToonMaterial>();
/** A toon material for something inside the hall (see glowing). */
export function indoor(color: string): THREE.MeshToonMaterial {
  let m = indoorCache.get(color);
  if (!m) indoorCache.set(color, (m = glowing(toonUnique(color))));
  return m;
}

/** A box `w` × `h` × `d` with its bottom middle at (x, y, z). */
export function box(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, shadow = true): THREE.Mesh {
  return mesh(new THREE.BoxGeometry(w, h, d), mat, x, y + h / 2, z, shadow);
}

/** A box between two corners on the ground, `y0` to `y1` up. */
export function slab(minX: number, maxX: number, minZ: number, maxZ: number, y0: number, y1: number, mat: THREE.Material, shadow = true): THREE.Mesh {
  return mesh(new THREE.BoxGeometry(maxX - minX, y1 - y0, maxZ - minZ), mat, (minX + maxX) / 2, (y0 + y1) / 2, (minZ + maxZ) / 2, shadow);
}

/** A flat sign (a plane facing +z), `w` wide, its text drawn in `draw`; lit, so it glows at night. */
export function signPlane(w: number, h: number, px: number, draw: (g: CanvasRenderingContext2D, W: number, H: number) => void): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
  const W = Math.round(px);
  const H = Math.round((px * h) / w);
  const tex = canvasTexture(W, H, (g) => draw(g, W, H));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  return m;
}

/** Fills the canvas `bg` and writes `text` centred, as big as fits. */
export function writeSign(g: CanvasRenderingContext2D, W: number, H: number, text: string, o: { bg: string; fg: string; weight?: number; scale?: number; y?: number }) {
  g.fillStyle = o.bg;
  g.fillRect(0, 0, W, H);
  let size = H * (o.scale ?? 0.62);
  g.font = `${o.weight ?? 900} ${size}px Nunito, ui-rounded, system-ui, sans-serif`;
  const fits = W * 0.92;
  const wide = g.measureText(text).width;
  if (wide > fits) {
    size *= fits / wide;
    g.font = `${o.weight ?? 900} ${size}px Nunito, ui-rounded, system-ui, sans-serif`;
  }
  g.fillStyle = o.fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, W / 2, H * (o.y ?? 0.53));
}

/**
 * An unseen box the crosshair lands on (first person aims by ray, see input/pointer.ts): the feature
 * puts what it's for in its `userData.interact`. Drawn never, hit always (its material's hidden, not it).
 */
export function pickBox(w: number, h: number, d: number, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ visible: false }));
  m.position.set(x, y + h / 2, z);
  return m;
}

/** The paint everything outside is in. */
export const paint = (color: string) => toon(color);
