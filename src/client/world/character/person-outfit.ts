import * as THREE from 'three';
import { GLASSES, HEADWEAR, LEG_COLORS, OWNER_TOP, TOP_STYLES, outfitKey, type LookOutfit } from '../../../shared/avatar';
import { smokingJacket } from './person-smoking';
import { mesh, toon, toonUnique } from '../toon';

// flrnoh fork (see FORK.md "Shops to walk into", the boutique and the optician): what a Person wears
// over the T-shirt everyone has: a hoodie, a shirt, a blazer, a leather jacket or a dress (in the
// shirt's own color, the profile's), trousers of a color, a cap, a beanie, a hat or a sun hat, and
// glasses. Made by Marks (person-marks.ts) beside the beard and tattoos, so person.ts barely knows.
//
// Where things are: the torso is a capsule of 0.26 by 0.28 centred at y 0.72 of the body (the straight
// part from 0.58 to 0.86), the head a sphere of 0.34 at its group's origin with the face down +z and
// the eyes at (±0.12, 0.02, 0.3). An arm is a pivot at the shoulder hanging down -y (a capsule of 0.08
// by 0.24 centred at y -0.16).

/** The parts of a Person the outfit goes on (MarkParts gives them). */
export interface OutfitParts {
  head: THREE.Object3D;
  body: THREE.Object3D;
  /** The legs, pivots at the hips hanging down -y (a capsule of 0.1 by 0.22 centred at y -0.16): shoes go on their ends. */
  legs: THREE.Object3D[];
  /** The character's own left and right arm. */
  left: THREE.Object3D;
  right: THREE.Object3D;
  /** The shirt (its color is the profile's) and the trousers. */
  shirt: THREE.Material;
  pants: THREE.MeshToonMaterial;
}

const TORSO_Y = 0.72;
const TORSO_R = 0.26;
const TORSO_LEN = 0.28;

/** The lenses: clear, dark, mirrored. */
const lensMats: THREE.Material[] = [];
function lens(tint: number): THREE.Material {
  if (!lensMats.length) {
    const clear = new THREE.MeshBasicMaterial({ color: '#e3f4ff', transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
    const dark = new THREE.MeshBasicMaterial({ color: '#16161a', transparent: true, opacity: 0.88, side: THREE.DoubleSide });
    const mirror = toonUnique('#7fa7d9');
    mirror.emissive = new THREE.Color('#9fd0ff');
    mirror.emissiveIntensity = 0.45;
    mirror.side = THREE.DoubleSide;
    for (const m of [clear, dark, mirror]) m.userData.outlineParameters = { visible: false };
    lensMats.push(clear, dark, mirror);
  }
  return lensMats[tint] ?? lensMats[0];
}

/** A frame's look: its color, the ring's radius and thickness, round or square, and how it's squashed. */
const FRAMES: Record<string, { color: string; r: number; tube: number; sides: number; sx: number; sy: number; tilt: number }> = {
  Round: { color: '#3b2f2f', r: 0.072, tube: 0.008, sides: 24, sx: 1, sy: 1, tilt: 0 },
  Square: { color: '#495057', r: 0.088, tube: 0.009, sides: 4, sx: 1.1, sy: 0.85, tilt: 0 },
  Nerd: { color: '#111111', r: 0.098, tube: 0.02, sides: 4, sx: 1.05, sy: 0.9, tilt: 0 },
  Aviator: { color: '#d4af37', r: 0.082, tube: 0.006, sides: 24, sx: 1.12, sy: 0.95, tilt: 0 },
  'Cat-eye': { color: '#9b2226', r: 0.078, tube: 0.013, sides: 24, sx: 1.18, sy: 0.78, tilt: 0.28 },
};

export class Outfit {
  private torso = new THREE.Group();
  private head = new THREE.Group();
  private left = new THREE.Group();
  private right = new THREE.Group();
  /** On the legs: shoes (and the smoking's satin stripes), one group a leg. */
  private feet: THREE.Group[];
  private key: string | null = null;

  constructor(private parts: OutfitParts) {
    parts.body.add(this.torso);
    parts.head.add(this.head);
    parts.left.add(this.left);
    parts.right.add(this.right);
    this.feet = parts.legs.map((leg) => {
      const g = new THREE.Group();
      leg.add(g);
      return g;
    });
  }

  /** Puts on `o`'s clothes, hat and glasses, redrawing only when they changed. */
  set(o: LookOutfit) {
    // The smoking comes with its own black trousers, whatever color was picked.
    this.parts.pants.color.set(o.top === OWNER_TOP ? '#16161d' : (LEG_COLORS[o.legs ?? 0] ?? LEG_COLORS[0]));
    const key = outfitKey(o);
    if (key === this.key) return;
    this.key = key;
    for (const g of [this.torso, this.head, this.left, this.right, ...this.feet]) {
      g.traverse((x) => (x as THREE.Mesh).geometry?.dispose());
      g.clear();
    }
    this.top(TOP_STYLES[o.top ?? 0]);
    this.hat(HEADWEAR[o.hat ?? 0]);
    this.glasses(GLASSES[o.specs ?? 0], o.tint ?? 0);
  }

  private add(g: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, shadow = false) {
    const m = mesh(geo, mat, x, y, z, shadow);
    g.add(m);
    return m;
  }

  /** A strip round the front of the torso, `w` radians wide, from y0 to y1 (on its straight part). */
  private front(mat: THREE.Material, w: number, y0: number, y1: number, out = 0.004) {
    const geo = new THREE.CylinderGeometry(TORSO_R + out, TORSO_R + out, y1 - y0, 10, 1, true, -w / 2, w);
    return this.add(this.torso, geo, mat, 0, (y0 + y1) / 2, 0);
  }

  /** A jacket over the T-shirt: a shell round the torso and sleeves down the arms. */
  private shell(mat: THREE.Material) {
    this.add(this.torso, new THREE.CapsuleGeometry(TORSO_R + 0.014, TORSO_LEN, 6, 14), mat, 0, TORSO_Y, 0, true);
    for (const arm of [this.left, this.right]) this.add(arm, new THREE.CapsuleGeometry(0.09, 0.28, 4, 10), mat, 0, -0.17, 0, true);
  }

  private top(style: string) {
    const shirt = this.parts.shirt;
    const white = toon('#f8f9fa');
    switch (style) {
      case 'Hoodie': {
        // The hood down the back, the kangaroo pocket, two strings.
        const hood = this.add(this.torso, new THREE.SphereGeometry(0.2, 14, 10), shirt, 0, 1.06, -0.17, true);
        hood.scale.set(1.35, 0.6, 0.85);
        this.add(this.torso, new THREE.TorusGeometry(0.16, 0.035, 8, 20), shirt, 0, 1.04, 0.0).rotation.x = Math.PI / 2;
        this.front(shirt, 1.2, 0.5, 0.66, 0.014);
        for (const x of [-0.05, 0.05]) this.add(this.torso, new THREE.CylinderGeometry(0.008, 0.008, 0.16, 6), white, x, 0.92, 0.245);
        return;
      }
      case 'Shirt': {
        // A white collar, the button placket and its buttons.
        for (const s of [-1, 1]) {
          const c = this.add(this.torso, new THREE.BoxGeometry(0.11, 0.025, 0.07), white, s * 0.065, 1.06, 0.13);
          c.rotation.set(0.5, 0, s * -0.45);
        }
        this.front(white, 0.13, 0.56, 0.86, 0.003);
        for (let y = 0.62; y < 0.86; y += 0.08) this.add(this.torso, new THREE.SphereGeometry(0.012, 8, 6), toon('#adb5bd'), 0, y, TORSO_R + 0.008);
        return;
      }
      case 'Blazer': {
        // A jacket in the shirt's color, open over a white shirt and a dark tie, two buttons.
        this.shell(shirt);
        this.front(white, 0.5, 0.66, 0.88, 0.017);
        this.add(this.torso, new THREE.BoxGeometry(0.05, 0.22, 0.012), toon('#1d1d1d'), 0, 0.77, TORSO_R + 0.025);
        for (const s of [-1, 1]) {
          const lapel = this.add(this.torso, new THREE.BoxGeometry(0.035, 0.26, 0.012), toon('#2b2d42'), s * 0.075, 0.8, TORSO_R + 0.022);
          lapel.rotation.z = s * 0.3;
        }
        for (const y of [0.56, 0.48]) this.add(this.torso, new THREE.SphereGeometry(0.014, 8, 6), toon('#1d1d1d'), 0.0, y, TORSO_R + 0.02);
        return;
      }
      case 'Leather jacket': {
        // Black leather, open over the T-shirt (the shirt's color), a zip, a collar.
        const leather = toon('#26262b');
        this.shell(leather);
        this.front(shirt, 0.62, 0.42, 0.9, 0.018);
        for (const s of [-1, 1]) this.add(this.torso, new THREE.BoxGeometry(0.008, 0.46, 0.01), toon('#c0c4c8'), s * 0.085, 0.66, TORSO_R + 0.018);
        const collar = this.add(this.torso, new THREE.TorusGeometry(0.17, 0.035, 8, 20), leather, 0, 1.04, -0.01);
        collar.rotation.x = Math.PI / 2 - 0.2;
        return;
      }
      case 'Smoking jacket':
        smokingJacket({ torso: this.torso, left: this.left, right: this.right, feet: this.feet }, (mat) => this.shell(mat), (mat, w, y0, y1, out) => this.front(mat, w, y0, y1, out));
        return;
      case 'Dress': {
        // A skirt flaring out from the waist, a ribbon round it.
        this.add(this.torso, new THREE.CylinderGeometry(TORSO_R + 0.01, 0.38, 0.38, 22, 1, true), shirt, 0, 0.36, 0, true);
        this.add(this.torso, new THREE.TorusGeometry(TORSO_R + 0.012, 0.022, 6, 22), white, 0, 0.56, 0).rotation.x = Math.PI / 2;
        return;
      }
    }
  }

  private hat(kind: string) {
    const h = this.head;
    const crown = (r: number, mat: THREE.Material, y: number, sy: number) => {
      const c = this.add(h, new THREE.SphereGeometry(r, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat, 0, y, -0.02, true);
      c.scale.y = sy;
      c.rotation.x = -0.2;
      return c;
    };
    switch (kind) {
      case 'Cap': {
        crown(0.375, this.parts.shirt, 0.04, 0.82);
        const brim = this.add(h, new THREE.CylinderGeometry(0.22, 0.22, 0.025, 18, 1, false, -Math.PI / 2, Math.PI), this.parts.shirt, 0, 0.13, 0.27, true);
        brim.rotation.x = 0.12;
        this.add(h, new THREE.SphereGeometry(0.03, 8, 6), this.parts.shirt, 0, 0.35, -0.08);
        return;
      }
      case 'Beanie': {
        const knit = toon('#e76f51');
        crown(0.385, knit, 0.02, 1.0);
        this.add(h, new THREE.TorusGeometry(0.36, 0.045, 8, 26), knit, 0, 0.08, -0.03).rotation.x = Math.PI / 2 - 0.2;
        this.add(h, new THREE.SphereGeometry(0.075, 10, 8), toon('#fefae0'), 0, 0.42, -0.1, true);
        return;
      }
      case 'Hat': {
        const felt = toon('#3d3d42');
        this.add(h, new THREE.CylinderGeometry(0.28, 0.33, 0.25, 20), felt, 0, 0.33, -0.03, true);
        this.add(h, new THREE.CylinderGeometry(0.335, 0.335, 0.06, 20), toon('#111111'), 0, 0.24, -0.03);
        const brim = this.add(h, new THREE.CylinderGeometry(0.52, 0.52, 0.025, 26), felt, 0, 0.2, -0.03, true);
        brim.rotation.x = 0.08;
        return;
      }
      case 'Sun hat': {
        const straw = toon('#e9c46a');
        crown(0.36, straw, 0.12, 0.75);
        this.add(h, new THREE.CylinderGeometry(0.66, 0.66, 0.02, 30), straw, 0, 0.14, -0.02, true);
        this.add(h, new THREE.CylinderGeometry(0.33, 0.35, 0.06, 24, 1, true), this.parts.shirt, 0, 0.17, -0.02);
        return;
      }
    }
  }

  private glasses(kind: string, tint: number) {
    const f = FRAMES[kind];
    if (!f) return;
    const frame = toon(f.color);
    const g = new THREE.Group();
    g.position.set(0, 0.03, 0.36);
    this.head.add(g);
    for (const s of [-1, 1]) {
      const eye = new THREE.Group();
      eye.position.set(s * 0.125, 0, 0);
      eye.scale.set(f.sx, f.sy, 1);
      eye.rotation.z = s * -f.tilt;
      const ring = mesh(new THREE.TorusGeometry(f.r, f.tube, 6, f.sides), frame, 0, 0, 0, false);
      const glass = mesh(new THREE.CircleGeometry(f.r, f.sides), lens(tint), 0, 0, -0.003, false);
      if (f.sides === 4) ring.rotation.z = glass.rotation.z = Math.PI / 4;
      eye.add(ring, glass);
      if (kind === 'Cat-eye') eye.add(mesh(new THREE.ConeGeometry(0.02, 0.05, 6), frame, s * 0.08, 0.05, 0, false));
      g.add(eye);
      // The arm back to the ear, along the side of the head.
      const from = new THREE.Vector3(s * 0.21, 0, -0.01);
      const to = new THREE.Vector3(s * 0.34, 0, -0.33);
      const arm = mesh(new THREE.BoxGeometry(0.012, 0.014, from.distanceTo(to)), frame, (from.x + to.x) / 2, 0, (from.z + to.z) / 2, false);
      arm.rotation.y = Math.atan2(to.x - from.x, to.z - from.z);
      g.add(arm);
    }
    g.add(mesh(new THREE.BoxGeometry(0.07, 0.012, 0.012), frame, 0, 0.012, 0, false));
    if (kind === 'Aviator') g.add(mesh(new THREE.BoxGeometry(0.3, 0.008, 0.008), frame, 0, 0.07, 0, false));
  }
}
