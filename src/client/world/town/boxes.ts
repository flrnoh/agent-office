import * as THREE from 'three';
import { toon } from '../toon';

// flrnoh fork (see FORK.md "Shops to walk into"): boxes standing square to the world, piled up with a
// color each into one geometry, for the shops' fronts and rooms (town/shops.ts) and what's in them
// (features/shops): one draw call for hundreds of boxes in a dozen colors.

export interface Box3 {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

const FACES: [number[], number[][]][] = [
  // normal, and its four corners as (x, y, z) picks of [min, max] (0 or 1), counter-clockwise seen from outside.
  [[1, 0, 0], [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]]],
  [[-1, 0, 0], [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]]],
  [[0, 1, 0], [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]]],
  [[0, -1, 0], [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]]],
  [[0, 0, 1], [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]]],
  [[0, 0, -1], [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]]],
];

/** Which faces of a box to draw: +x, -x, +y, -y, +z, -z. */
export type FaceMask = [boolean, boolean, boolean, boolean, boolean, boolean];
const ALL: FaceMask = [true, true, true, true, true, true];

export class ColorBoxes {
  pos: number[] = [];
  norm: number[] = [];
  col: number[] = [];
  index: number[] = [];
  private c = new THREE.Color();

  /** A box over `r` from y0 to y1, in `color` (sRGB hex), with the faces `mask` says. */
  box(r: Box3, y0: number, y1: number, color: THREE.ColorRepresentation, mask: FaceMask = ALL) {
    if (r.maxX - r.minX < 1e-4 || r.maxZ - r.minZ < 1e-4 || y1 - y0 < 1e-4) return;
    this.c.set(color);
    const xs = [r.minX, r.maxX];
    const ys = [y0, y1];
    const zs = [r.minZ, r.maxZ];
    FACES.forEach(([n, corners], f) => {
      if (!mask[f]) return;
      const i = this.pos.length / 3;
      for (const [a, b, c] of corners) {
        this.pos.push(xs[a], ys[b], zs[c]);
        this.norm.push(n[0], n[1], n[2]);
        this.col.push(this.c.r, this.c.g, this.c.b);
      }
      this.index.push(i, i + 1, i + 2, i, i + 2, i + 3);
    });
  }

  get empty(): boolean {
    return !this.pos.length;
  }

  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.norm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.index);
    g.computeBoundingSphere();
    return g;
  }
}

/** Toon shading in each vertex's own color: the colors of a ColorBoxes. */
export function colorBoxMaterial(): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: (toon('#fff') as THREE.MeshToonMaterial).gradientMap });
}

/**
 * Like colorBoxMaterial, but lit from inside: it glows in each vertex's own color as much as
 * `emissiveIntensity` says (a room's lights), on top of whatever light falls on it.
 */
export function litBoxMaterial(): THREE.MeshToonMaterial {
  const m = colorBoxMaterial();
  m.emissive.set('#ffffff');
  m.emissiveIntensity = 0.3;
  m.onBeforeCompile = (shader, renderer) => {
    // The office's own patch first (the haze and the sky's lights, see world/sky.ts).
    THREE.Material.prototype.onBeforeCompile.call(m, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace('vec3 totalEmissiveRadiance = emissive;', 'vec3 totalEmissiveRadiance = emissive * vColor.rgb;');
  };
  m.customProgramCacheKey = () => 'shop-lit';
  return m;
}
