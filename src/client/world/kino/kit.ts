import * as THREE from 'three';
import { STREET_Y } from '../../../shared/layout';
import { canvasTexture } from '../texture';
import { mesh } from '../toon';

// flrnoh fork (see FORK.md "The cinema"): the cinema's building blocks (see kino/index.ts): where the
// street is, boxes and planes at world coordinates, the halls' own lights (unlit materials whose
// brightness the house lights set, so a hall goes dark when the film starts whatever the sun does),
// and canvas lettering.

/** Down on the street, in the office's frame on its bottom floor. */
export const G = STREET_Y;

/** A box from its corners: x and z from–to, y from–to over the street. */
export function slab(g: THREE.Object3D, mat: THREE.Material, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, shadow = false): THREE.Mesh {
  const m = mesh(new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)), mat, (x0 + x1) / 2, G + (y0 + y1) / 2, (z0 + z1) / 2, shadow);
  g.add(m);
  return m;
}

/** A plane `w` by `h` centered at (x, y over the street, z), facing `rotY` (0: +z). */
export function plane(g: THREE.Object3D, mat: THREE.Material, x: number, y: number, z: number, w: number, h: number, rotY: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.position.set(x, G + y, z);
  m.rotation.y = rotY;
  g.add(m);
  return m;
}

/**
 * The lights in a hall: every surface in there is unlit, its colour scaled by how bright the house
 * lights are (`set`), down to `floor` of it (what the screen's glow still shows).
 */
export class HouseLights {
  private mats: { m: THREE.MeshBasicMaterial; base: THREE.Color; floor: number }[] = [];
  level = 1;

  /** An unlit material in this hall, `floor` the share of its colour left with the lights down. */
  mat(color: THREE.ColorRepresentation, floor = 0.12, map: THREE.Texture | null = null): THREE.MeshBasicMaterial {
    const m = new THREE.MeshBasicMaterial({ color, map, fog: false });
    this.mats.push({ m, base: new THREE.Color(color), floor });
    return m;
  }

  /** The house lights at `level` (0 down, 1 up), and a flicker of the screen's light `glow` (0–1) on top. */
  set(level: number, glow = 0) {
    if (Math.abs(level - this.level) < 0.002 && glow === 0) return;
    this.level = level;
    for (const { m, base, floor } of this.mats) {
      const k = floor + (1 - floor) * level + glow * 0.06;
      m.color.copy(base).multiplyScalar(Math.min(1, k));
    }
  }
}

/** A material that glows on its own (signs, bulbs, the screen), untouched by fog or the sun. */
export function glowing(color: THREE.ColorRepresentation, map: THREE.Texture | null = null, opts: { transparent?: boolean; opacity?: number; additive?: boolean } = {}): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    map,
    fog: false,
    toneMapped: false,
    transparent: opts.transparent ?? opts.additive ?? false,
    opacity: opts.opacity ?? 1,
    depthWrite: !opts.additive,
    blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}

/** Lines of `text` no wider than `max` at the canvas' current font. */
export function wrap(g: CanvasRenderingContext2D, text: string, max: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (g.measureText(next).width > max && line) {
      out.push(line);
      line = word;
    } else line = next;
  }
  if (line) out.push(line);
  return out;
}

/** Writes `text` at (x, y), shrinking the font (from `size` px, `weight`) until it fits `max` wide. */
export function fit(g: CanvasRenderingContext2D, text: string, x: number, y: number, max: number, size: number, weight = 900, family = 'Nunito, ui-rounded, system-ui, sans-serif') {
  let s = size;
  g.font = `${weight} ${s}px ${family}`;
  while (s > 10 && g.measureText(text).width > max) {
    s -= 2;
    g.font = `${weight} ${s}px ${family}`;
  }
  g.fillText(text, x, y);
}

/** A sign drawn once: `w` by `h` px. */
export const sign = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) => canvasTexture(w, h, draw);

/** The halls' carpet: deep red with a small gold diamond, tiling. */
export function carpetTexture(base = '#6d0f1a', dot = '#c9a227', size = 64): THREE.CanvasTexture {
  const t = canvasTexture(size, size, (g) => {
    g.fillStyle = base;
    g.fillRect(0, 0, size, size);
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.fillRect(0, size / 2, size, size / 2);
    g.fillStyle = dot;
    g.beginPath();
    g.moveTo(size / 2, size * 0.28);
    g.lineTo(size * 0.72, size / 2);
    g.lineTo(size / 2, size * 0.72);
    g.lineTo(size * 0.28, size / 2);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(201,162,39,0.35)';
    g.fillRect(0, 0, 3, 3);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Folds of a velvet curtain, tiling across. */
export function curtainTexture(color = '#9b111e'): THREE.CanvasTexture {
  const t = canvasTexture(128, 8, (g) => {
    const grad = g.createLinearGradient(0, 0, 128, 0);
    const c = new THREE.Color(color);
    const dark = `#${c.clone().multiplyScalar(0.45).getHexString()}`;
    const lite = `#${c.clone().lerp(new THREE.Color('#ff8080'), 0.25).getHexString()}`;
    for (let i = 0; i <= 4; i++) {
      grad.addColorStop(i / 4, i % 2 ? lite : dark);
    }
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 8);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
