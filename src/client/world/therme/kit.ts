import * as THREE from 'three';
import type { TRect } from '../../../shared/therme';
import type { Collider, Interactable } from '../types';
import { mesh, toon } from '../toon';
import { canvasTexture, FONT } from '../casino/parts';

/*
 * What the thermal baths' builders share (flrnoh fork, see shared/therme.ts): where their pieces go,
 * and a few shorthands. Like the gym's kit: plain toon pieces go in `still` and are merged by colour
 * at the end (one draw call), anything textured, see-through or moving goes straight in `group`
 * (merging would throw a texture's UVs away).
 */

export interface ThermeParts {
  /** Textured, animated or see-through things, as they are. */
  group: THREE.Group;
  /** Plain toon pieces that never move: merged by colour at the end. */
  still: THREE.Group;
  colliders: Collider[];
  interactables: Interactable[];
}

export const wrap = (t: THREE.CanvasTexture, x = 1, y = 1) => {
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(x, y);
  t.needsUpdate = true;
  return t;
};

export function rand(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** A box of `color` centred at x, y, z (plain: it goes in `still`). */
export function blk(p: ThermeParts, w: number, h: number, d: number, color: THREE.ColorRepresentation, x: number, y: number, z: number): THREE.Mesh {
  const m = mesh(new THREE.BoxGeometry(w, h, d), toon(color), x, y, z, false);
  p.still.add(m);
  return m;
}

/** A flat textured plane `w` × `h` at x, y, z facing `rotY` (0: +z). */
export function plane(p: ThermeParts, w: number, h: number, mat: THREE.Material, x: number, y: number, z: number, rotY: number): THREE.Mesh {
  const m = mesh(new THREE.PlaneGeometry(w, h), mat, x, y, z, false);
  m.rotation.y = rotY;
  p.group.add(m);
  return m;
}

/** A plane lying over `r` at height `y`, facing up (or down, for a ceiling). */
export function flat(p: ThermeParts, r: TRect, mat: THREE.Material, y: number, down = false): THREE.Mesh {
  const m = mesh(new THREE.PlaneGeometry(r.maxX - r.minX, r.maxZ - r.minZ), mat, (r.minX + r.maxX) / 2, y, (r.minZ + r.maxZ) / 2, false);
  m.rotation.x = down ? Math.PI / 2 : -Math.PI / 2;
  p.group.add(m);
  return m;
}

/** A toon material over a texture. */
export function tex(map: THREE.Texture, color: THREE.ColorRepresentation = '#ffffff', opts: THREE.MeshToonMaterialParameters = {}): THREE.MeshToonMaterial {
  const base = toon('#ffffff');
  return new THREE.MeshToonMaterial({ map, color, gradientMap: base.gradientMap, ...opts });
}

/** Lit from inside: a sign's face. */
export function glow(map: THREE.Texture, transparent = false): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ map, transparent, alphaTest: transparent ? 0.05 : 0 });
  m.toneMapped = false;
  m.userData.outlineParameters = { visible: false };
  return m;
}

/** Tiles in shades of `base`, `n` to the side, with grout between. */
export function tiles(base: string, grout: string, n: number, vary = 0.06, seed = 7): THREE.CanvasTexture {
  const r = rand(seed);
  return canvasTexture(256, 256, (g) => {
    g.fillStyle = grout;
    g.fillRect(0, 0, 256, 256);
    const s = 256 / n;
    const c = new THREE.Color(base);
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        const k = 1 + (r() - 0.5) * vary * 2;
        g.fillStyle = `#${c.clone().multiplyScalar(k).getHexString()}`;
        g.fillRect(i * s + 1.5, j * s + 1.5, s - 3, s - 3);
      }
  });
}

/** A sign: big words, a smaller line under them, on a colour. */
export function sign(big: string, small: string, bg: string, fg: string, w = 1024, h = 256): THREE.CanvasTexture {
  return canvasTexture(w, h, (g) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.fillStyle = fg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `800 ${Math.round(h * 0.36)}px ${FONT}`;
    g.fillText(big, w / 2, small ? h * 0.4 : h / 2, w - 32);
    if (small) {
      g.globalAlpha = 0.85;
      g.font = `600 ${Math.round(h * 0.17)}px ${FONT}`;
      g.fillText(small, w / 2, h * 0.76, w - 32);
    }
  });
}

/** Red and white barrier tape. */
export function stripes(): THREE.CanvasTexture {
  return wrap(
    canvasTexture(128, 16, (g) => {
      for (let i = 0; i < 8; i++) {
        g.fillStyle = i % 2 ? '#ffffff' : '#d62828';
        g.beginPath();
        g.moveTo(i * 16, 0);
        g.lineTo(i * 16 + 16, 0);
        g.lineTo(i * 16 + 8, 16);
        g.lineTo(i * 16 - 8, 16);
        g.fill();
      }
    }),
    6,
    1,
  );
}
