import * as THREE from 'three';
import { HAIR_COLORS, HAIR_STYLES, METAL_COLORS, hairShows, marksKey, piercingKindOf, type Look, type Metal, type Tattoo } from '../../../shared/avatar';
import { mesh, toonUnique } from '../toon';
import { beardParts } from './person-beard';
import { tattooMaterial } from './tattoo-art';
import { Outfit } from './person-clothes';

// flrnoh fork (see FORK.md "Beards, tattoos and piercings"): what a Person wears on their skin. A beard
// (person-beard.ts) in the hair's color, tattoos as decals hugging an arm, a hand or the neck (the
// arm's sleeve rolled up, or short, so the ink sits on skin), and piercings as little bits of metal.
//
// Where things are: the head is a sphere of 0.34 at the head group's origin, the face down +z. An arm
// is a pivot at the shoulder with the arm hanging down -y: a capsule of 0.08 by 0.24 centred at
// y = -0.16 (the upper arm above -0.17, the forearm below) and the fist, a ball of 0.085, at -0.38.

/** The parts of a Person the marks go on. `left` is the character's own left arm (the one on +x). */
export interface MarkParts {
  head: THREE.Object3D;
  left: THREE.Object3D;
  right: THREE.Object3D;
  /** The person's own skin and shirt, for a bared arm and its rolled-up sleeve. */
  skin: THREE.Material;
  shirt: THREE.Material;
  /** For the outfit (person-clothes.ts): the body the torso's on, and the trousers. */
  body: THREE.Object3D;
  pants: THREE.MeshToonMaterial;
  /** The hair, hidden from the start under a hat it would poke through (later, person.ts' dress asks hairShows). */
  hair: THREE.Object3D;
}

const metals = new Map<Metal, THREE.MeshToonMaterial>();
/** Shiny enough to read at a distance: a touch of glow, and no outline to drown them. */
function metal(m: Metal): THREE.MeshToonMaterial {
  let mat = metals.get(m);
  if (!mat) {
    mat = toonUnique(METAL_COLORS[m]);
    mat.emissive = new THREE.Color(METAL_COLORS[m]).multiplyScalar(0.35);
    mat.userData.outlineParameters = { visible: false };
    metals.set(m, mat);
  }
  return mat;
}

/** A point on the head `out` beyond its skin, in the direction of x, y, z. */
const onHead = (x: number, y: number, z: number, out: number) => new THREE.Vector3(x, y, z).setLength(0.34 + out);

const SLEEVE_R = 0.084;
const INK_R = 0.0865;

export class Marks {
  private head = new THREE.Group();
  private left = new THREE.Group();
  private right = new THREE.Group();
  private beard = toonUnique('#000000');
  private stubble = toonUnique('#000000');
  private key: string | null = null;
  private outfit: Outfit;

  constructor(
    private parts: MarkParts,
    look: Look,
  ) {
    this.beard.side = THREE.DoubleSide;
    this.stubble.transparent = true;
    this.stubble.opacity = 0.42;
    this.stubble.depthWrite = false;
    this.stubble.userData.outlineParameters = { visible: false };
    parts.head.add(this.head);
    parts.left.add(this.left);
    parts.right.add(this.right);
    this.outfit = new Outfit(parts);
    this.set(look);
    parts.hair.visible = this.hairShows(look);
  }

  /** Puts on `look`'s beard, tattoos and piercings, redrawing only when they changed (the beard just follows the hair's color). */
  set(look: Look) {
    const color = HAIR_COLORS[look.hair] ?? HAIR_COLORS[0];
    this.beard.color.set(color);
    this.stubble.color.set(color);
    this.outfit.set(look);
    const key = marksKey(look);
    if (key === this.key) return;
    this.key = key;
    this.clear();
    if (look.beard) for (const part of beardParts(look.beard, this.beard, this.stubble)) this.head.add(part);
    const tattoos = look.tattoos ?? [];
    this.arm(this.left, 1, tattoos, '-l');
    this.arm(this.right, -1, tattoos, '-r');
    const neck = tattoos.find((t) => t.spot === 'neck');
    if (neck) this.neck(neck.motif);
    for (const p of look.piercings ?? []) this.pierce(p.kind, metal(p.metal));
  }

  /** Whether the hair shows under what's on the head (person.ts' dress). */
  hairShows(look: Look): boolean {
    return hairShows(look, HAIR_STYLES[look.style]);
  }

  private clear() {
    for (const g of [this.head, this.left, this.right]) {
      g.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      g.clear();
    }
  }

  /** An arm's tattoos (`side` 1 is the character's left, on +x), on skin: a rolled-up sleeve for the forearm, a short one for the upper arm. */
  private arm(g: THREE.Group, side: 1 | -1, tattoos: Tattoo[], suffix: string) {
    const at = (spot: string) => tattoos.find((t) => t.spot === spot + suffix);
    const upper = at('upperarm');
    const fore = at('forearm');
    const hand = at('hand');
    if (upper || fore) {
      // Bare from the sleeve's edge down to the fist, a little over the sleeve, and the sleeve's hem
      // (narrowing at the wrist into the fist, so there's no gap to see up from below).
      const top = upper ? -0.045 : -0.17;
      const wrist = -0.3;
      g.add(mesh(new THREE.CylinderGeometry(SLEEVE_R, SLEEVE_R, top - wrist, 14, 1, true), this.parts.skin, 0, (top + wrist) / 2, 0));
      g.add(mesh(new THREE.CylinderGeometry(SLEEVE_R, 0.066, 0.035, 14, 1, true), this.parts.skin, 0, wrist - 0.0175, 0));
      const hem = mesh(new THREE.TorusGeometry(SLEEVE_R + 0.003, upper ? 0.012 : 0.02, 6, 16), this.parts.shirt, 0, top, 0);
      hem.rotation.x = Math.PI / 2;
      g.add(hem);
    }
    // Front and out to the side, where you see it: theta 0 is +z, π/2 is +x.
    const facing = side * (Math.PI / 4);
    if (upper) g.add(this.armInk(upper.motif, -0.115, facing + side * 0.35));
    if (fore) g.add(this.armInk(fore.motif, -0.243, facing));
    if (hand) {
      // On the back of the fist, which faces out to the side: phi π is +x, 0 is -x.
      const phi = side > 0 ? Math.PI : 0;
      const patch = new THREE.SphereGeometry(0.088, 12, 10, phi - 0.75, 1.5, Math.PI / 2 - 0.7, 1.4);
      g.add(mesh(patch, tattooMaterial(hand.motif), 0, -0.38, 0, false));
    }
  }

  /** A curved patch round the arm at height `y`, centred on `theta`; a tribal band goes all the way round. */
  private armInk(motif: string, y: number, theta: number): THREE.Mesh {
    const band = motif === 'tribal';
    const h = band ? 0.07 : 0.11;
    const len = band ? Math.PI * 2 : h / INK_R;
    const geo = new THREE.CylinderGeometry(INK_R, INK_R, h, band ? 32 : 10, 1, true, theta - len / 2, len);
    if (band) {
      // Four turns of the pattern round the arm.
      const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 4);
    }
    return mesh(geo, tattooMaterial(motif), 0, y, 0, false);
  }

  /** On the left side of the neck, low on the head under where an ear would be. */
  private neck(motif: string) {
    const patch = new THREE.SphereGeometry(0.346, 14, 10, Math.PI - 0.3, 0.6, 0.6 * Math.PI, 0.25 * Math.PI);
    this.head.add(mesh(patch, tattooMaterial(motif), 0, 0, 0, false));
  }

  /** A stud, a ring or the eyebrow's little bar, where PIERCING_KINDS says. */
  private pierce(kind: string, m: THREE.Material) {
    if (!piercingKindOf(kind)) return;
    const sx = kind.endsWith('-r') || /^helix-r/.test(kind) ? -1 : 1;
    const stud = (p: THREE.Vector3, r = 0.016) => this.head.add(mesh(new THREE.SphereGeometry(r, 10, 8), m, p.x, p.y, p.z, false));
    const ring = (p: THREE.Vector3, r: number, rx: number, ry: number, tube = 0.0055) => {
      const o = mesh(new THREE.TorusGeometry(r, tube, 6, 16), m, p.x, p.y, p.z, false);
      o.rotation.set(rx, ry, 0);
      this.head.add(o);
    };
    switch (kind) {
      case 'lobe-stud-l':
      case 'lobe-stud-r':
        return stud(onHead(sx * 0.33, -0.12, 0.08, 0.004));
      case 'lobe-ring-l':
      case 'lobe-ring-r':
        return ring(onHead(sx * 0.33, -0.17, 0.06, 0.006), 0.026, 0, sx * 0.5);
      case 'nose-stud':
        return stud(new THREE.Vector3(0.036, -0.03, 0.338), 0.012);
      case 'nose-ring':
        return ring(new THREE.Vector3(0.042, -0.046, 0.334), 0.017, 0, 0.7, 0.0045);
      case 'septum':
        return ring(new THREE.Vector3(0, -0.052, 0.342), 0.019, 0.5, 0, 0.005);
      case 'lip-ring':
        return ring(new THREE.Vector3(0.032, -0.155, 0.306), 0.017, 0, 1.1, 0.005);
      case 'brow-l':
      case 'brow-r':
        for (const y of [0.088, 0.138]) stud(onHead(sx * 0.165, y, 0.28, 0.006), 0.011);
        return;
    }
    // A helix ring: up the back of the ear, the first lowest.
    const n = Number(kind.slice(-1)) - 1;
    ring(onHead(sx * 0.31, -0.03 + n * 0.05, -0.05 - n * 0.03, 0.012), 0.024, 0, sx * 0.5);
  }
}
