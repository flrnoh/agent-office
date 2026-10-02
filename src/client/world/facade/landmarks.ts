import * as THREE from 'three';
import type { NightParts } from '../outside';
import { mesh, toon } from '../toon';
import { B } from './frame';
import { BUNGEE } from '../../../shared/bungee';

// flrnoh fork (see FORK.md, "A facade for creatives"): what makes the building a landmark: lights up
// its corners going round the rainbow, FLOGGE OFFICE in lit letters on the roof, a neon blade on the
// street corner spelling CREATE, a giant light bulb having an idea up on the north-west corner, a paper
// plane gliding by the street side, and a pencil as long as a car stuck in the east wall.

const INK = '#2b2d42';
const COLORS = ['#ef476f', '#ff8a5b', '#ffd166', '#06d6a0', '#4cc9f0', '#8a5cff', '#f72585'];

/** A letter on a canvas: `ch` in `color`, ink-outlined (or glowing, for neon), `w` by `h` px. */
function glyph(ch: string, color: string, neon: boolean, w = 160, h = 220): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.font = `900 ${Math.round(h * 0.82)}px Nunito, ui-rounded, system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  if (neon) {
    g.shadowColor = color;
    g.shadowBlur = 24;
    g.lineWidth = 12;
    g.strokeStyle = color;
    g.strokeText(ch, w / 2, h / 2 + 6);
    g.shadowBlur = 0;
    g.lineWidth = 4;
    g.strokeStyle = '#ffffff';
    g.strokeText(ch, w / 2, h / 2 + 6);
  } else {
    g.lineWidth = 16;
    g.strokeStyle = INK;
    g.strokeText(ch, w / 2, h / 2 + 6);
    g.fillStyle = color;
    g.fillText(ch, w / 2, h / 2 + 6);
    // A row of bulbs down the middle of each stroke would be a lot of canvas: a shine does.
    g.globalAlpha = 0.4;
    g.fillStyle = '#ffffff';
    g.fillText(ch, w / 2 - 3, h / 2);
    g.globalAlpha = 1;
    g.fillStyle = color;
    g.fillText(ch, w / 2, h / 2 + 9);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** A see-through material showing `tex`, lit `day` much by day and fully at night. */
function litSign(night: NightParts, tex: THREE.Texture, day: number): THREE.MeshToonMaterial {
  const m = new THREE.MeshToonMaterial({ map: tex, transparent: true, alphaTest: 0.05 });
  m.emissive = new THREE.Color('#ffffff');
  m.emissiveMap = tex;
  m.emissiveIntensity = day;
  m.userData.outlineParameters = { visible: false };
  night.bulbs.push({ mat: m, day });
  return m;
}

/** A glowing tube in `color`, `day` lit by day. */
function tube(night: NightParts, color: string, day: number): THREE.MeshToonMaterial {
  const m = new THREE.MeshToonMaterial({ color });
  m.emissive.set(color);
  m.emissiveIntensity = day;
  m.userData.outlineParameters = { visible: false };
  night.bulbs.push({ mat: m, day });
  return m;
}

/** Lights up the four corners and round the top of the building, their colors going round the rainbow. */
export function cornerLights(night: NightParts) {
  const group = new THREE.Group();
  const mats = [0, 1, 2, 3].map(() => tube(night, '#4cc9f0', 0.7));
  const D = 0.16;
  const unit = new THREE.BoxGeometry(D, 1, D);
  const corners = [
    [B.minX - D / 2, B.minZ - D / 2],
    [B.maxX + D / 2, B.minZ - D / 2],
    [B.maxX + D / 2, B.maxZ + D / 2],
    [B.minX - D / 2, B.maxZ + D / 2],
  ];
  const posts = corners.map(([x, z], i) => {
    const m = new THREE.Mesh(unit, mats[i]);
    m.position.set(x, 0, z);
    group.add(m);
    return m;
  });
  // Round the top of the cornice, each side in its corner's color.
  const w = B.maxX - B.minX + 0.6;
  const d = B.maxZ - B.minZ + 0.6;
  const cx = (B.minX + B.maxX) / 2;
  const cz = (B.minZ + B.maxZ) / 2;
  const top = new THREE.Group();
  top.add(new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, 0.08), mats[0]).translateX(cx).translateZ(B.minZ - 0.26));
  top.add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, d), mats[1]).translateX(B.maxX + 0.26).translateZ(cz));
  top.add(new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, 0.08), mats[2]).translateX(cx).translateZ(B.maxZ + 0.26));
  top.add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, d), mats[3]).translateX(B.minX - 0.26).translateZ(cz));
  group.add(top);
  const c = new THREE.Color();
  return {
    group,
    /** From the street (`from` up) to the top of the cornice (`to` up). */
    place(from: number, to: number) {
      for (const p of posts) {
        p.scale.y = to - from;
        p.position.y = (from + to) / 2;
      }
      top.position.y = to + 0.04;
    },
    update(t: number) {
      mats.forEach((m, i) => {
        c.setHSL((t * 0.04 + i * 0.25) % 1, 0.9, 0.6);
        m.color.copy(c);
        m.emissive.copy(c);
      });
    },
  };
}

/** The neon blade on the south-west corner, CREATE down it, both ways round, its letters lighting up one by one. */
export function blade(night: NightParts) {
  const group = new THREE.Group();
  const word = 'CREATE';
  const LH = 0.95;
  const W = 1.5;
  const H = word.length * LH + 0.6;
  const board = toon('#1b1e2c');
  const rim = tube(night, '#f72585', 0.8);
  group.add(mesh(new THREE.BoxGeometry(W, H, 0.22), board, 0, H / 2, 0, false));
  for (const x of [-W / 2, W / 2]) group.add(mesh(new THREE.BoxGeometry(0.06, H, 0.26), rim, x, H / 2, 0, false));
  for (const y of [0, H]) group.add(mesh(new THREE.BoxGeometry(W + 0.06, 0.06, 0.26), rim, 0, y, 0, false));
  // The brackets back to the corner of the building.
  for (const y of [0.4, H - 0.4]) group.add(mesh(new THREE.BoxGeometry(0.08, 0.08, 1.35), toon('#8d99ae'), 0, y, -0.85, false));
  const letters: THREE.MeshToonMaterial[] = [];
  [...word].forEach((ch, i) => {
    const color = COLORS[(i * 2) % COLORS.length];
    const mat = litSign(night, glyph(ch, color, true), 0.9);
    letters.push(mat);
    for (const side of [1, -1]) {
      const p = mesh(new THREE.PlaneGeometry(W - 0.2, LH), mat, 0, H - 0.3 - LH * (i + 0.5), side * 0.115, false);
      if (side < 0) p.rotation.y = Math.PI;
      group.add(p);
    }
  });
  // Out from the corner, half way between the street and the west side, facing both.
  group.position.set(B.minX - 1.1, 0, B.maxZ + 1.1);
  group.rotation.y = -Math.PI / 4; // its brackets (-z) back toward the corner
  return {
    group,
    /** On the bottom floor (`ground` up), whatever the height of the building. */
    place(ground: number, _count: number) {
      group.position.y = ground + 0.8;
    },
    /** One letter after another, then all of them, then a blink. */
    update(t: number) {
      const k = (t * 2.2) % (word.length + 4);
      letters.forEach((m, i) => (m.opacity = k < word.length ? (i <= k ? 1 : 0.25) : k < word.length + 3 ? 1 : 0.25));
    },
  };
}

/** FLOGGE OFFICE up on the roof along the street side, a letter at a time on a steel frame, lit at night. */
export function rooftopLetters(night: NightParts) {
  const group = new THREE.Group();
  const text = 'FLOGGE OFFICE';
  const LW = 2.1;
  const LH = 3.2;
  // West of the bungee jetty (shared/bungee.ts, off the south edge at x 11), which needs its way out clear.
  const x0 = BUNGEE.x - 2.6 - (text.length - 1) * LW;
  const z = B.maxZ + 0.1;
  const steel = toon('#8d99ae');
  const back = toon('#5c636e');
  [...text].forEach((ch, i) => {
    if (ch === ' ') return;
    const x = x0 + i * LW;
    const mat = litSign(night, glyph(ch, COLORS[i % COLORS.length], false), 0.18);
    group.add(mesh(new THREE.PlaneGeometry(LW * 1.05, LH), mat, x, LH / 2 + 0.25, z + 0.02, false));
    const b = mesh(new THREE.PlaneGeometry(LW * 0.8, LH * 0.8), back, x, LH / 2 + 0.25, z - 0.02, false);
    b.rotation.y = Math.PI;
    group.add(b);
    // A post up behind each letter.
    group.add(mesh(new THREE.BoxGeometry(0.08, LH + 0.2, 0.08), steel, x, (LH + 0.2) / 2, z - 0.12, false));
  });
  const span = (text.length - 1) * LW + 1;
  for (const y of [0.35, LH - 0.2]) group.add(mesh(new THREE.BoxGeometry(span, 0.08, 0.08), steel, x0 + ((text.length - 1) * LW) / 2, y, z - 0.18, false));
  return {
    group,
    /** Standing on the cornice, `y` up. */
    place(y: number) {
      group.position.y = y;
    },
  };
}

/** A giant light bulb having an idea, on an arm off the north-west corner near the top. */
export function bulbSculpture(night: NightParts) {
  const group = new THREE.Group();
  const glass = tube(night, '#fff3b0', 0.45);
  glass.transparent = true;
  glass.opacity = 0.92;
  group.add(mesh(new THREE.SphereGeometry(1.25, 24, 18), glass, 0, 0.6, 0, false));
  group.add(mesh(new THREE.CylinderGeometry(0.62, 0.75, 0.9, 20), glass, 0, -0.45, 0, false));
  const metal = toon('#adb5bd');
  for (let i = 0; i < 4; i++) group.add(mesh(new THREE.TorusGeometry(0.62, 0.07, 6, 20).rotateX(Math.PI / 2), metal, 0, -0.95 - i * 0.16, 0, false));
  group.add(mesh(new THREE.CylinderGeometry(0.3, 0.2, 0.3, 14), toon(INK), 0, -1.65, 0, false));
  // The filament, a heart, and rays round it.
  const hot = tube(night, '#ff8a3d', 1);
  group.add(mesh(new THREE.TorusGeometry(0.3, 0.05, 6, 20, Math.PI * 1.2), hot, 0, 0.55, 0, false));
  const ray = toon('#ffd166');
  for (let i = 0; i < 9; i++) {
    const a = (i / 8) * Math.PI - Math.PI / 2;
    const r = mesh(new THREE.BoxGeometry(0.14, 0.7, 0.14), ray, Math.sin(a) * 2.1, 0.6 + Math.cos(a) * 2.1, 0, false);
    r.rotation.z = -a;
    group.add(r);
  }
  // The arm back to the corner.
  const arm = mesh(new THREE.BoxGeometry(0.16, 0.16, 2.6), toon('#8d99ae'), 0, -1.7, 1.2, false);
  group.add(arm);
  group.scale.setScalar(1.6);
  const at = new THREE.Group();
  at.add(group);
  at.position.set(B.minX - 2.6, 0, B.minZ - 2.6);
  at.rotation.y = Math.PI / 4; // its arm (+z) back toward the corner
  return {
    group: at,
    /** Its base level with the top of the wall, `top` up. */
    place(top: number) {
      at.position.y = top + 0.6;
    },
  };
}

/** A paper plane gliding by the street side on a thin wire, bobbing. */
export function paperPlane() {
  const group = new THREE.Group();
  const plane = new THREE.Group();
  const paper = toon('#fdfdfd');
  const fold = toon('#dfe7ef');
  const wing = (s: number, mat: THREE.Material) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 1.6, s * 1.1, 0.1, -1.2, 0, -0.25, -1.2], 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat);
    m.material = (mat as THREE.MeshToonMaterial).clone();
    (m.material as THREE.MeshToonMaterial).side = THREE.DoubleSide;
    return m;
  };
  plane.add(wing(1, paper), wing(-1, paper));
  const keel = new THREE.BufferGeometry();
  keel.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 1.6, 0, -0.25, -1.2, 0, -0.55, -1.0], 3));
  keel.computeVertexNormals();
  const k = new THREE.Mesh(keel, Object.assign(fold.clone(), { side: THREE.DoubleSide }));
  plane.add(k);
  plane.rotation.set(-0.15, Math.PI / 2 - 0.4, 0.2);
  plane.scale.setScalar(2.4);
  group.add(plane);
  const wire = new THREE.MeshBasicMaterial({ color: '#8d99ae' });
  group.add(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 3, 3), wire).translateY(1.5));
  group.position.set(14.8, 0, B.maxZ + 3.2);
  let base = 0;
  return {
    group,
    /** Up by the storey `y` up. */
    place(y: number) {
      base = y + 4.2;
      group.position.y = base;
    },
    update(t: number) {
      group.position.y = base + Math.sin(t * 0.9) * 0.18;
      plane.rotation.z = 0.2 + Math.sin(t * 0.7) * 0.08;
    },
  };
}

/** A pencil as long as a car stuck point first into the east wall, its eraser up and out. */
export function pencil(): THREE.Group {
  const g = new THREE.Group();
  const L = 6;
  const R = 0.32;
  const body = new THREE.Group();
  body.add(mesh(new THREE.CylinderGeometry(R, R, L, 6), toon('#ffd166'), 0, L / 2, 0));
  body.add(mesh(new THREE.CylinderGeometry(R * 1.04, R * 1.04, 0.45, 16), toon('#adb5bd'), 0, L + 0.2, 0));
  body.add(mesh(new THREE.CylinderGeometry(R, R, 0.5, 16), toon('#ef476f'), 0, L + 0.65, 0));
  body.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 6), toon(INK), 0, L + 0.91, 0, false));
  // The point, sunk into the wall.
  body.add(mesh(new THREE.ConeGeometry(R, 1.0, 6).rotateX(Math.PI), toon('#f6d7a7'), 0, -0.5, 0));
  body.add(mesh(new THREE.ConeGeometry(R * 0.35, 0.35, 6).rotateX(Math.PI), toon(INK), 0, -0.85, 0));
  // Up and out from the wall, pointing in.
  body.rotation.z = -Math.PI / 2 + 0.55;
  body.position.set(B.maxX + 0.35, 2.8, 5.4);
  g.add(body);
  return g;
}
