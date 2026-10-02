import * as THREE from 'three';
import { BEARD_STYLES } from '../../../shared/avatar';
import { mesh } from '../toon';

// flrnoh fork (see FORK.md "Beards, tattoos and piercings"): beards, as shapes on the head like the
// hair (person-hair.ts). The head is a sphere of 0.34 at the origin, the face looks down +z; on a
// SphereGeometry phi = π/2 is the face and phi = π the character's left (+x), theta = π the chin.
// The smile's lower arc reaches down to y ≈ -0.155 and out to x ≈ ±0.075, so a beard leaves a gap
// there: cheeks from 0.3 rad either side of the face, the chin from below the mouth (theta 0.67π).

const FACE = Math.PI / 2;

/** A piece of a shell round the head, `r` out, from phi `p0` to `p1` and theta `t0`π to `t1`π. */
function shell(r: number, p0: number, p1: number, t0: number, t1: number, m: THREE.Material): THREE.Mesh {
  return mesh(new THREE.SphereGeometry(r, 24, 8, p0, p1 - p0, t0 * Math.PI, (t1 - t0) * Math.PI), m);
}

/** Under the eyes (out to 0.54 rad off the middle, down to y ≈ -0.035) a beard starts lower, at theta 0.58π. */
const EYES = 0.6;
const UNDER_EYES = 0.58;

/** Both cheeks, `from` to `to` rad off the middle of the face (starting lower under the eyes). */
function cheeks(r: number, from: number, to: number, t0: number, t1: number, m: THREE.Material): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    const side = (a: number, b: number, top: number) => out.push(shell(r, s > 0 ? FACE + a : FACE - b, s > 0 ? FACE + b : FACE - a, top, t1, m));
    if (from < EYES) side(from, Math.min(to, EYES), Math.max(t0, UNDER_EYES));
    if (to > EYES) side(Math.max(from, EYES), to, t0);
  }
  return out;
}

/** A round lump of beard (an ellipsoid) at x, y, z, `sx` by `sy` by `sz`. */
function lump(m: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number): THREE.Mesh {
  const o = mesh(new THREE.SphereGeometry(1, 14, 10), m, x, y, z);
  o.scale.set(sx, sy, sz);
  return o;
}

/** A cartoon moustache over the smile, its two halves tipped down to the sides; `droop` lets its ends hang (the Viking's). */
function moustache(m: THREE.Material, size = 1, droop = false): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    const half = lump(m, s * 0.043 * size, -0.058, 0.322, 0.052 * size, 0.022 * size, 0.03);
    half.rotation.z = s * -0.28;
    out.push(half);
    if (droop) {
      const end = mesh(new THREE.CapsuleGeometry(0.014, 0.07, 4, 8), m, s * 0.088, -0.11, 0.3);
      end.rotation.z = s * 0.15;
      out.push(end);
    }
  }
  return out;
}

/** The parts of beard style `style` (of BEARD_STYLES): `solid` for a beard, `stubble` see-through for the shadow of one. */
export function beardParts(style: number, solid: THREE.Material, stubble: THREE.Material): THREE.Object3D[] {
  switch (BEARD_STYLES[style]) {
    case 'Stubble':
      return [...cheeks(0.343, 0.3, 1.3, 0.52, 0.84, stubble), shell(0.343, FACE - 0.3, FACE + 0.3, 0.665, 0.86, stubble), lump(stubble, 0, -0.05, 0.318, 0.075, 0.018, 0.022)];
    case 'Moustache':
      return moustache(solid, 1.15);
    case 'Goatee':
      return [shell(0.352, FACE - 0.24, FACE + 0.24, 0.67, 0.86, solid), lump(solid, 0, -0.29, 0.22, 0.07, 0.07, 0.06), ...moustache(solid)];
    case 'Chin strap':
      return [shell(0.35, FACE - 1.3, FACE + 1.3, 0.76, 0.83, solid), ...cheeks(0.35, 1.05, 1.3, 0.5, 0.8, solid)];
    case 'Full beard':
      return [...cheeks(0.355, 0.3, 1.35, 0.5, 0.86, solid), shell(0.355, FACE - 0.32, FACE + 0.32, 0.67, 0.9, solid), lump(solid, 0, -0.29, 0.17, 0.2, 0.12, 0.15), ...moustache(solid)];
    case 'Viking': {
      // A full beard, longer, and a braid down the front with two beads in it.
      const braid = mesh(new THREE.ConeGeometry(0.07, 0.34, 10), solid, 0, -0.5, 0.33);
      braid.rotation.x = Math.PI - 0.3;
      const beads = [
        [-0.46, 0.045, 0.318],
        [-0.56, 0.03, 0.349],
      ].map(([y, r, z]) => {
        const b = mesh(new THREE.TorusGeometry(r, 0.012, 6, 14), solid, 0, y, z);
        b.rotation.x = Math.PI / 2 - 0.3;
        return b;
      });
      return [...cheeks(0.36, 0.3, 1.35, 0.5, 0.88, solid), shell(0.36, FACE - 0.32, FACE + 0.32, 0.67, 0.92, solid), lump(solid, 0, -0.32, 0.17, 0.22, 0.15, 0.16), braid, ...beads, ...moustache(solid, 1.2, true)];
    }
    case 'Mutton chops':
      return [...cheeks(0.355, 0.35, 1.35, 0.48, 0.8, solid), ...moustache(solid)];
    default:
      return [];
  }
}
