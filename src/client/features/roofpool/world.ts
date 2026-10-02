import * as THREE from 'three';
import { FLOATS, POOL, POOL_DECK, floatAt, poolDeck, poolSteps, type FloatKind } from '../../../shared/roofpool';
import type { NightParts } from '../../world/outside';
import { mergeByMaterial, mesh, toon } from '../../world/toon';
import type { Collider } from '../../world/types';
import { buildSlide } from './slide';
import { buildDiveTower } from './dive';

// The pool on the roof (flrnoh fork, see FORK.md "Pool party on the roof"), as built: a raised basin on
// a wooden deck with steps up from the south, tiled inside, its water lit from under the surface in
// party colors that go round at night, floats drifting on it (a flamingo, a donut, a beach ball, a
// unicorn; where each is comes from the office's clock, so everyone sees the same), palms in pots on
// the deck's corners, chrome ladders, POOL PARTY in neon along the east side, a water slide and a
// diving tower.

const INK = '#2b2d42';

export interface RoofPool {
  group: THREE.Group;
  /** The water's surface, the slide's tower and the diving tower: what you look at to use them. */
  surface: THREE.Object3D;
  tower: THREE.Object3D;
  diving: THREE.Object3D;
  /** The deck, the steps, the palms' pots and the sign's posts. */
  colliders: Collider[];
  /** `t` seconds on the office's clock; `dark` how dark it is (0 day … 1 night); the floats keep clear of `you` (in the water, or coming down the slide). */
  update(t: number, dark: number, you?: { x: number; z: number } | null): void;
}

/** Pool tiles: pale blue squares, grouted, 0.25 m each, `n` by `m` of them across a canvas. */
function tiles(n: number, m: number, base: string, grout: string, stripe?: string): THREE.CanvasTexture {
  const S = 32;
  const c = document.createElement('canvas');
  c.width = n * S;
  c.height = m * S;
  const g = c.getContext('2d')!;
  g.fillStyle = grout;
  g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      g.fillStyle = (i + j) % 5 === 0 ? '#bfe8f5' : base;
      g.fillRect(i * S + 2, j * S + 2, S - 4, S - 4);
    }
  }
  if (stripe) {
    // A lane down the middle of the floor, with a T at each end.
    g.fillStyle = stripe;
    const mid = (m * S) / 2;
    g.fillRect(S * 1.5, mid - 6, c.width - S * 3, 12);
    g.fillRect(S * 1.5, mid - 30, 12, 60);
    g.fillRect(c.width - S * 1.5 - 12, mid - 30, 12, 60);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** The water's ripples: soft light caustics on a blue that the material tints. */
function ripples(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(120,200,255,0.45)';
  g.lineWidth = 5;
  for (let i = 0; i < 26; i++) {
    const x = (i * 97) % 256;
    const y = (i * 61) % 256;
    for (const [dx, dy] of [[0, 0], [256, 0], [0, 256], [-256, 0], [0, -256]]) {
      g.beginPath();
      g.ellipse(x + dx, y + dy, 26 + (i % 5) * 6, 12 + (i % 3) * 5, (i % 7) * 0.4, 0, Math.PI * 2);
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 1.5);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A sign in neon: `text` in `color`, glowing, on a dark board. */
function neonBoard(text: string, color: string, night: NightParts): { group: THREE.Group; w: number } {
  const size = 96;
  const c = document.createElement('canvas');
  const g = c.getContext('2d')!;
  const font = `900 ${size}px Nunito, ui-rounded, system-ui, sans-serif`;
  g.font = font;
  c.width = Math.ceil(g.measureText(text).width) + size;
  c.height = Math.ceil(size * 1.6);
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = color;
  g.shadowBlur = 26;
  g.lineWidth = 10;
  g.strokeStyle = color;
  g.strokeText(text, c.width / 2, c.height / 2);
  g.shadowBlur = 0;
  g.lineWidth = 3;
  g.strokeStyle = '#ffffff';
  g.strokeText(text, c.width / 2, c.height / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshToonMaterial({ map: tex, transparent: true, alphaTest: 0.05 });
  mat.emissive = new THREE.Color('#ffffff');
  mat.emissiveMap = tex;
  mat.emissiveIntensity = 0.7;
  mat.userData.outlineParameters = { visible: false };
  night.bulbs.push({ mat, day: 0.7 });
  const per = 0.55 / size;
  const w = c.width * per;
  const h = c.height * per;
  const group = new THREE.Group();
  group.add(mesh(new THREE.BoxGeometry(w + 0.3, h + 0.2, 0.08), toon('#1b1e2c'), 0, 0, -0.05, false));
  group.add(mesh(new THREE.PlaneGeometry(w, h), mat, 0, 0, 0.001, false));
  return { group, w: w + 0.3 };
}

/** A palm in a big pot: a curved, ringed trunk and a crown of drooping fronds. */
function palm(): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.34, 0.26, 0.6, 14), toon('#e9e4d8'), 0, 0.3, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 14), toon('#6b4226'), 0, 0.6, 0, false));
  const bark = toon('#9c6b3f');
  const ring = toon('#7f5539');
  let x = 0;
  for (let i = 0; i < 9; i++) {
    const y = 0.6 + i * 0.32;
    x = Math.sin(i * 0.22) * 0.35;
    g.add(mesh(new THREE.CylinderGeometry(0.1 - i * 0.004, 0.12 - i * 0.004, 0.32, 8), i % 2 ? bark : ring, x, y + 0.16, 0));
  }
  const top = new THREE.Vector3(x, 0.6 + 9 * 0.32, 0);
  const frond = toon('#4f9a45');
  const frondDark = toon('#3d7a35');
  for (let k = 0; k < 8; k++) {
    const f = new THREE.Group();
    f.position.copy(top);
    f.rotation.y = (k / 8) * Math.PI * 2;
    // A frond arching out and down, a few leaves along it.
    for (let s = 0; s < 6; s++) {
      const out = 0.25 + s * 0.28;
      const y = Math.sin((s / 5) * Math.PI * 0.8) * 0.35 - s * s * 0.025;
      const leaf = mesh(new THREE.SphereGeometry(0.2 - s * 0.018, 6, 4).scale(1.6, 0.18, 0.9), s % 2 ? frond : frondDark, out, y, 0, false);
      f.add(leaf);
    }
    g.add(f);
  }
  for (let k = 0; k < 3; k++) g.add(mesh(new THREE.SphereGeometry(0.09, 8, 6), toon('#8b5a2b'), top.x + Math.cos(k * 2.1) * 0.12, top.y - 0.12, Math.sin(k * 2.1) * 0.12));
  return g;
}

/** A chrome pool ladder over the wall at `side` of the water, `along` the wall. */
function ladder(chrome: THREE.Material, x: number, z: number, rotY: number): THREE.Group {
  const g = new THREE.Group();
  for (const s of [-0.25, 0.25]) {
    // Up out of the water, over the coping, and down onto the deck.
    g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.5, 8), chrome, s, 0.45, -0.12, false));
    const bend = mesh(new THREE.TorusGeometry(0.18, 0.03, 6, 12, Math.PI), chrome, s, 1.2, 0.06, false);
    bend.rotation.y = Math.PI / 2;
    g.add(bend);
  }
  for (const y of [0.15, 0.45]) g.add(mesh(new THREE.BoxGeometry(0.5, 0.04, 0.12), chrome, 0, y, -0.12, false));
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

/** A flamingo float: a pink ring with a long neck and head. */
function flamingo(): THREE.Group {
  const g = new THREE.Group();
  const pink = toon('#ff7eb6');
  g.add(mesh(new THREE.TorusGeometry(0.5, 0.2, 10, 24).rotateX(Math.PI / 2), pink, 0, 0.1, 0));
  const neck = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.2, -0.5), new THREE.Vector3(0, 0.9, -0.55), new THREE.Vector3(0, 1.3, -0.3), new THREE.Vector3(0, 1.25, -0.05)]);
  g.add(mesh(new THREE.TubeGeometry(neck, 16, 0.09, 8), pink, 0, 0, 0));
  g.add(mesh(new THREE.SphereGeometry(0.16, 12, 10), pink, 0, 1.28, 0.0));
  g.add(mesh(new THREE.ConeGeometry(0.07, 0.22, 8).rotateX(Math.PI / 2 + 0.6), toon('#2b2d42'), 0, 1.2, 0.17));
  for (const s of [-1, 1]) g.add(mesh(new THREE.SphereGeometry(0.03, 6, 4), toon(INK), s * 0.1, 1.33, 0.08, false));
  // A tail on the back of the ring.
  g.add(mesh(new THREE.ConeGeometry(0.18, 0.4, 8).rotateX(-Math.PI / 2 - 0.5), pink, 0, 0.3, 0.62));
  return g;
}

/** A donut ring with icing and sprinkles. */
function donut(): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.TorusGeometry(0.45, 0.2, 10, 24).rotateX(Math.PI / 2), toon('#e9b872'), 0, 0.1, 0));
  g.add(mesh(new THREE.TorusGeometry(0.45, 0.17, 8, 24, Math.PI * 2).rotateX(Math.PI / 2).scale(1, 0.6, 1), toon('#ff5fa2'), 0, 0.2, 0, false));
  const colors = ['#ffd166', '#06d6a0', '#4cc9f0', '#ffffff', '#8a5cff'];
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2;
    const r = 0.45 + Math.sin(i * 2.7) * 0.1;
    const s = mesh(new THREE.BoxGeometry(0.08, 0.02, 0.025), toon(colors[i % colors.length]), Math.cos(a) * r, 0.3, Math.sin(a) * r, false);
    s.rotation.y = i * 1.3;
    g.add(s);
  }
  return g;
}

/** A beach ball, striped. */
function ball(): THREE.Group {
  const g = new THREE.Group();
  const colors = ['#ef476f', '#ffffff', '#ffd166', '#ffffff', '#118ab2', '#ffffff'];
  colors.forEach((c, i) => g.add(mesh(new THREE.SphereGeometry(0.32, 6, 12, (i / 6) * Math.PI * 2, Math.PI / 3), toon(c), 0, 0.28, 0, false)));
  return g;
}

/** A unicorn float: a white ring, a neck, a golden horn and a rainbow mane. */
function unicorn(): THREE.Group {
  const g = new THREE.Group();
  const white = toon('#fbf8ff');
  g.add(mesh(new THREE.TorusGeometry(0.55, 0.22, 10, 24).rotateX(Math.PI / 2), white, 0, 0.1, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.14, 0.2, 0.8, 10), white, 0, 0.55, -0.55));
  g.add(mesh(new THREE.BoxGeometry(0.28, 0.26, 0.42), white, 0, 1.0, -0.42));
  g.add(mesh(new THREE.ConeGeometry(0.06, 0.38, 8), toon('#ffd166'), 0, 1.3, -0.5));
  ['#ef476f', '#ff8a5b', '#ffd166', '#06d6a0', '#4cc9f0', '#8a5cff'].forEach((c, i) => g.add(mesh(new THREE.SphereGeometry(0.08, 6, 5), toon(c), 0, 0.95 - i * 0.12, -0.72 - i * 0.02, false)));
  for (const s of [-1, 1]) g.add(mesh(new THREE.SphereGeometry(0.03, 6, 4), toon(INK), s * 0.14, 1.05, -0.28, false));
  return g;
}

const MAKERS: Record<FloatKind, () => THREE.Group> = { flamingo, donut, ball, unicorn };

/** The pool, built: on the roof (y 0 its deck's foot), or as seen from below on the tower's roof. */
export function buildRoofPool(night: NightParts): RoofPool {
  const group = new THREE.Group();
  const colliders: Collider[] = [];
  const statics = new THREE.Group();
  const d = POOL_DECK;
  const p = POOL;

  // The deck: four boxes round the water, planked on top, and the steps up from the south.
  const wood = toon('#b9814c');
  const plank = toon('#9b6a3c');
  for (const b of [...poolDeck(), ...poolSteps()]) {
    statics.add(mesh(new THREE.BoxGeometry(b.maxX - b.minX, b.top, b.maxZ - b.minZ), wood, (b.minX + b.maxX) / 2, b.top / 2, (b.minZ + b.maxZ) / 2));
    // The planks' seams, along x.
    for (let z = b.minZ + 0.16; z < b.maxZ - 0.05; z += 0.16) statics.add(mesh(new THREE.BoxGeometry(b.maxX - b.minX, 0.005, 0.02), plank, (b.minX + b.maxX) / 2, b.top + 0.003, z, false));
    colliders.push({ ...b });
  }
  // The coping round the water: white stone, a little proud of the deck.
  const stone = toon('#f4f1ea');
  const C = 0.28;
  for (const [x0, x1, z0, z1] of [
    [p.minX - C, p.maxX + C, p.minZ - C, p.minZ],
    [p.minX - C, p.maxX + C, p.maxZ, p.maxZ + C],
    [p.minX - C, p.minX, p.minZ, p.maxZ],
    [p.maxX, p.maxX + C, p.minZ, p.maxZ],
  ]) statics.add(mesh(new THREE.BoxGeometry(x1 - x0, 0.06, z1 - z0), stone, (x0 + x1) / 2, d.top + 0.03, (z0 + z1) / 2));

  // Inside: tiled walls and floor.
  const W = p.maxX - p.minX;
  const D = p.maxZ - p.minZ;
  const wall = new THREE.MeshToonMaterial({ map: tiles(Math.round(W * 4), 4, '#8fd3ea', '#e6f6fb') });
  const wallSide = new THREE.MeshToonMaterial({ map: tiles(Math.round(D * 4), 4, '#8fd3ea', '#e6f6fb') });
  const floor = new THREE.MeshToonMaterial({ map: tiles(Math.round(W * 4), Math.round(D * 4), '#7cc6e0', '#d9f1f8', '#2f6f9a') });
  for (const m of [wall, wallSide, floor]) m.userData.outlineParameters = { visible: false };
  const H = d.top;
  const inner = (geo: THREE.PlaneGeometry, mat: THREE.Material, x: number, z: number, rotY: number) => {
    const m = mesh(geo, mat, x, H / 2, z, false);
    m.rotation.y = rotY;
    group.add(m);
  };
  inner(new THREE.PlaneGeometry(W, H), wall, (p.minX + p.maxX) / 2, p.minZ + 0.001, 0);
  inner(new THREE.PlaneGeometry(W, H), wall, (p.minX + p.maxX) / 2, p.maxZ - 0.001, Math.PI);
  inner(new THREE.PlaneGeometry(D, H), wallSide, p.minX + 0.001, (p.minZ + p.maxZ) / 2, Math.PI / 2);
  inner(new THREE.PlaneGeometry(D, H), wallSide, p.maxX - 0.001, (p.minZ + p.maxZ) / 2, -Math.PI / 2);
  const bottom = mesh(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2), floor, (p.minX + p.maxX) / 2, 0.012, (p.minZ + p.maxZ) / 2, false);
  group.add(bottom);

  // Lights in the walls under the water, in party colors.
  const lamps = ['#19e3ff', '#ff3dcb', '#8a5cff', '#2bff88', '#ffd166', '#ff8a3d'].map((c) => {
    const m = new THREE.MeshBasicMaterial({ color: c });
    return m;
  });
  let li = 0;
  for (const [x, z, rotY] of [
    [p.minX + W * 0.25, p.minZ + 0.01, 0],
    [p.minX + W * 0.75, p.minZ + 0.01, 0],
    [p.minX + W * 0.25, p.maxZ - 0.01, Math.PI],
    [p.minX + W * 0.75, p.maxZ - 0.01, Math.PI],
    [p.minX + 0.01, (p.minZ + p.maxZ) / 2, Math.PI / 2],
    [p.maxX - 0.01, (p.minZ + p.maxZ) / 2, -Math.PI / 2],
  ] as const) {
    const disc = mesh(new THREE.CircleGeometry(0.16, 16), lamps[li++ % lamps.length], x, 0.45, z, false);
    disc.rotation.y = rotY;
    group.add(disc);
  }

  // The water.
  const ripple = ripples();
  const water = new THREE.MeshToonMaterial({ color: '#4cc9f0', map: ripple, transparent: true, opacity: 0.72, depthWrite: false });
  water.emissive = new THREE.Color('#19e3ff');
  water.emissiveIntensity = 0.1;
  water.userData.outlineParameters = { visible: false };
  const surface = mesh(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2), water, (p.minX + p.maxX) / 2, p.surface, (p.minZ + p.maxZ) / 2, false);
  surface.renderOrder = 2;
  group.add(surface);

  // Ladders at the two short ends.
  const chrome = toon('#d7dde3', { emissive: '#2a2f36' });
  group.add(ladder(chrome, p.minX + 0.12, p.minZ + 1.2, Math.PI / 2));
  group.add(ladder(chrome, p.maxX - 0.12, p.maxZ - 1.2, -Math.PI / 2));

  // Palms in pots on three of the deck's corners; the water slide has the fourth (slide.ts).
  for (const [x, z] of [
    [d.minX + 0.4, d.minZ + 0.4],
    [d.maxX - 0.4, d.minZ + 0.4],
    [d.minX + 0.4, d.maxZ - 0.4],
  ]) {
    const t = palm();
    t.position.set(x, d.top, z);
    t.rotation.y = x * 1.7 + z;
    group.add(t);
    colliders.push({ minX: x - 0.36, maxX: x + 0.36, minZ: z - 0.36, maxZ: z + 0.36, bottom: d.top, top: 99 });
  }

  // POOL PARTY in neon along the east side, facing the terrace, on two posts on the deck.
  const sign = neonBoard('POOL PARTY 🍹', '#ff3dcb', night);
  const signX = d.maxX - 0.35;
  const signZ = (p.minZ + p.maxZ) / 2;
  sign.group.position.set(signX, d.top + 2.0, signZ);
  sign.group.rotation.y = -Math.PI / 2;
  group.add(sign.group);
  const post = toon('#8d99ae');
  for (const s of [-1, 1]) {
    const z = signZ + s * (sign.w / 2 - 0.15);
    statics.add(mesh(new THREE.BoxGeometry(0.1, 2.3, 0.1), post, signX + 0.07, d.top + 1.15, z));
    colliders.push({ minX: signX - 0.01, maxX: signX + 0.15, minZ: z - 0.08, maxZ: z + 0.08, bottom: d.top, top: 99 });
  }
  group.add(mergeByMaterial(statics));

  // The water slide on the south-east corner.
  const slide = buildSlide();
  group.add(slide.group);
  colliders.push(...slide.colliders);

  // The diving tower on the north side.
  const dive = buildDiveTower();
  group.add(dive.group);
  colliders.push(...dive.colliders);

  // The floats.
  const floats = FLOATS.map((k) => {
    const f = MAKERS[k]();
    group.add(f);
    return f;
  });

  const tint = new THREE.Color();
  return {
    group,
    surface,
    tower: slide.group,
    diving: dive.group,
    colliders,
    update(t, dark, you) {
      ripple.offset.set((t * 0.03) % 1, (t * 0.017) % 1);
      // By day clear blue; at night the lights under it take over, going round the party colors.
      tint.setHSL((t * 0.03) % 1, 0.9, 0.55);
      water.emissive.copy(tint).lerp(new THREE.Color('#19e3ff'), 1 - dark);
      water.emissiveIntensity = 0.1 + dark * 0.55;
      lamps.forEach((m, i) => m.color.setHSL((t * 0.03 + i / lamps.length) % 1, 0.95, 0.55 + 0.1 * dark));
      floats.forEach((f, i) => {
        const at = floatAt(i, t);
        // Nudged out of your way, so you never come up inside one.
        if (you) {
          const dx = at.x - you.x;
          const dz = at.z - you.z;
          const d = Math.hypot(dx, dz);
          if (d < 1.3) {
            const k = (1.3 - d) / Math.max(d, 0.01);
            at.x += dx * k;
            at.z += dz * k;
          }
        }
        f.position.set(at.x, p.surface - 0.05 + Math.sin(t * 1.6 + i * 2) * 0.03, at.z);
        f.rotation.set(Math.sin(t * 1.1 + i) * 0.05, at.turn, Math.cos(t * 0.9 + i) * 0.05);
      });
    },
  };
}
