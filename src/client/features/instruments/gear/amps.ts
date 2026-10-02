import * as THREE from 'three';
import { mergeByColor, mesh, toon } from '../../../world/toon';

// ---- Amps, cabs and speakers (flrnoh fork, see FORK.md "The instruments") --------------------------------
// The backline in real sizes: a full stack (two 4x12s under a 100-watt head: black tolex, a beige
// grille with its white piping, a gold control panel, a script logo), a bass rig (an 8x10 fridge with
// its head on top), combos for the rehearsal rooms, floor wedges, side-fills and a rotating-speaker
// cabinet for the organ. Each stands on the floor at the origin, its front to +z.

const TOLEX = '#17161b';
const PIPING = '#e9e3d2';
const templates = new Map<string, THREE.Group>();

function once(key: string, build: () => THREE.Group): THREE.Group {
  let t = templates.get(key);
  if (!t) templates.set(key, (t = build()));
  return t.clone();
}

/** A logo plate: white (or gold) script on black, a little canvas. */
function logo(text: string, w: number, h: number, ink = '#f4efe2', bg = '#0d0c10', font = 'italic 900 64px Georgia, serif'): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = Math.max(32, Math.round((256 * h) / w));
  const g = c.getContext('2d')!;
  g.fillStyle = bg;
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = ink;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = font.replace('64px', `${Math.round(c.height * 0.72)}px`);
  g.fillText(text, c.width / 2, c.height / 2 + 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshToonMaterial({ map: t }));
  m.userData.outlineParameters = { visible: false };
  return m;
}

/** A speaker grille's weave on a canvas: cloth (`a` threads over `b`), or perforated metal. */
function grilleTexture(a: string, b: string, metal = false): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = b;
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = a;
  if (metal) {
    for (let y = 2; y < 64; y += 6) for (let x = (y / 6) % 2 ? 2 : 5; x < 64; x += 6) g.fillRect(x, y, 3, 3);
  } else {
    for (let i = 0; i < 64; i += 4) {
      g.globalAlpha = 0.55;
      g.fillRect(i, 0, 2, 64);
      g.globalAlpha = 0.35;
      g.fillRect(0, i, 64, 2);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
const grilles = new Map<string, THREE.Material>();
function grille(a: string, b: string, metal = false, rep = 6): THREE.Material {
  const key = `${a}|${b}|${metal}|${rep}`;
  let m = grilles.get(key);
  if (!m) {
    const t = grilleTexture(a, b, metal);
    t.repeat.set(rep, rep);
    grilles.set(key, (m = new THREE.MeshToonMaterial({ map: t })));
  }
  return m;
}

/** A tolex box with a grille front set in it, piping round the grille, corners: a speaker cabinet. */
function cabinet(still: THREE.Group, out: THREE.Group, w: number, h: number, d: number, y: number, g: THREE.Material, piping = PIPING, slant = 0) {
  const box = mesh(new THREE.BoxGeometry(w, h, d), toon(TOLEX), 0, y + h / 2, 0);
  still.add(box);
  const front = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.07, h - 0.07), g);
  front.position.set(0, y + h / 2, d / 2 + 0.002);
  if (slant) {
    front.rotation.x = -slant;
    front.position.z -= Math.sin(slant) * (h / 2) * 0.5;
  }
  front.receiveShadow = true;
  out.add(front);
  // The piping: four thin strips round the grille.
  const pm = toon(piping);
  const pw = w - 0.07;
  const ph = h - 0.07;
  for (const [x, yy, sw, sh] of [
    [0, ph / 2, pw + 0.01, 0.008],
    [0, -ph / 2, pw + 0.01, 0.008],
    [pw / 2, 0, 0.008, ph],
    [-pw / 2, 0, 0.008, ph],
  ] as const)
    still.add(mesh(new THREE.BoxGeometry(sw, sh, 0.006), pm, x, y + h / 2 + yy, d / 2 + 0.003, false));
  // Metal corners.
  for (const sx of [-1, 1]) for (const sy of [0, 1]) still.add(mesh(new THREE.BoxGeometry(0.045, 0.045, 0.045), toon('#9ea2ab'), (sx * (w - 0.03)) / 2, y + sy * h + (sy ? -0.02 : 0.02), d / 2 - 0.02, false));
}

/** Knobs along a panel: `n` of them from x0 to x1 at height y, sticking out at z. */
function knobs(still: THREE.Group, n: number, x0: number, x1: number, y: number, z: number, color = '#111015', r = 0.014) {
  const geo = new THREE.CylinderGeometry(r, r * 1.1, 0.022, 12).rotateX(Math.PI / 2);
  for (let i = 0; i < n; i++) still.add(mesh(geo, toon(color), x0 + ((x1 - x0) * i) / Math.max(1, n - 1), y, z, false));
}

/** A 4x12 stack under a 100-watt head: about 1.8 m of it. */
export function guitarStack(): THREE.Group {
  return once('stack', () => {
    const g = new THREE.Group();
    const still = new THREE.Group();
    const cloth = grille('#d8cfb2', '#8d8670');
    cabinet(still, g, 0.76, 0.74, 0.36, 0.02, cloth);
    cabinet(still, g, 0.76, 0.74, 0.36, 0.76, cloth, PIPING, 0.12);
    // Casters under the bottom one.
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) still.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.02, 8).rotateZ(Math.PI / 2), toon('#222'), sx * 0.32, 0.012, sz * 0.13, false));
    // The head: tolex, the gold panel with its knobs and switches, the red jewel.
    const hy = 1.5;
    still.add(mesh(new THREE.BoxGeometry(0.76, 0.27, 0.25), toon(TOLEX), 0, hy + 0.135, -0.04));
    still.add(mesh(new THREE.BoxGeometry(0.68, 0.075, 0.01), toon('#c9a247'), 0, hy + 0.06, 0.088, false));
    knobs(still, 8, -0.26, 0.17, hy + 0.06, 0.098);
    for (const x of [0.23, 0.29]) still.add(mesh(new THREE.BoxGeometry(0.012, 0.03, 0.014), toon('#111'), x, hy + 0.06, 0.099, false));
    g.add(mesh(new THREE.SphereGeometry(0.011, 8, 6), toon('#ff3b3b', { emissive: '#c01010' }), 0.31, hy + 0.06, 0.095, false));
    g.add(mesh(new THREE.BoxGeometry(0.66, 0.13, 0.008), grille('#d8cfb2', '#8d8670', false, 3), 0, hy + 0.19, 0.088, false));
    const plate = logo('Donner', 0.2, 0.06, '#f4efe2');
    plate.position.set(0, hy + 0.19, 0.094);
    g.add(plate);
    for (const y of [0.4, 1.12]) {
      const p = logo('Donner', 0.16, 0.05);
      p.position.set(0.24, 0.02 + y + 0.25, 0.186);
      g.add(p);
    }
    // A handle on top.
    still.add(mesh(new THREE.BoxGeometry(0.2, 0.02, 0.04), toon('#0b0b0e'), 0, hy + 0.28, -0.04, false));
    g.add(mergeByColor(still));
    return g;
  });
}

/** The bass rig: an 8x10 cab (1.3 m) with its head on top, a blue jewel. */
export function bassRig(): THREE.Group {
  return once('bassrig', () => {
    const g = new THREE.Group();
    const still = new THREE.Group();
    const metal = grille('#4c5058', '#16171b', true, 8);
    cabinet(still, g, 0.62, 1.3, 0.47, 0.05, metal, '#b9bdc6');
    for (const sx of [-1, 1]) still.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 10).rotateZ(Math.PI / 2), toon('#222'), sx * 0.24, 0.035, -0.15, false));
    const plate = logo('BASSWERK', 0.22, 0.05, '#e9eef5', '#1b3d8c', '900 64px Arial, sans-serif');
    plate.position.set(0, 1.27, 0.238);
    g.add(plate);
    // The head: a silver face, black knobs with blue skirts, the jewel.
    const hy = 1.36;
    still.add(mesh(new THREE.BoxGeometry(0.62, 0.22, 0.36), toon(TOLEX), 0, hy + 0.11, -0.02));
    still.add(mesh(new THREE.BoxGeometry(0.56, 0.12, 0.01), toon('#b8bcc4'), 0, hy + 0.11, 0.162, false));
    knobs(still, 7, -0.2, 0.14, hy + 0.11, 0.172, '#16233f', 0.016);
    g.add(mesh(new THREE.SphereGeometry(0.012, 8, 6), toon('#5aa8ff', { emissive: '#1e5fd0' }), 0.22, hy + 0.11, 0.17, false));
    g.add(mergeByColor(still));
    return g;
  });
}

/** A combo: a guitar's 2x12 (a silver-blue grille, its panel on top at the front) or a bass's 1x15. */
export function combo(bass: boolean): THREE.Group {
  return once(bass ? 'combo-bass' : 'combo', () => {
    const g = new THREE.Group();
    const still = new THREE.Group();
    const [w, h, d] = bass ? [0.56, 0.64, 0.42] : [0.68, 0.5, 0.26];
    cabinet(still, g, w, h - 0.09, d, 0.02, bass ? grille('#3c4048', '#121317', true, 6) : grille('#b9c4cf', '#55606c', false, 6), bass ? '#9aa0aa' : PIPING);
    // The panel across the top front.
    still.add(mesh(new THREE.BoxGeometry(w, 0.09, d), toon(TOLEX), 0, h - 0.045 - 0.02 + 0.02, 0));
    still.add(mesh(new THREE.BoxGeometry(w - 0.06, 0.06, 0.008), toon(bass ? '#26272d' : '#c8ccd2'), 0, h - 0.045, d / 2 + 0.002, false));
    knobs(still, bass ? 6 : 7, -w / 2 + 0.08, w / 2 - 0.12, h - 0.045, d / 2 + 0.01, bass ? '#d6d9de' : '#141318', 0.012);
    g.add(mesh(new THREE.SphereGeometry(0.009, 8, 6), toon(bass ? '#5aa8ff' : '#ff3b3b', { emissive: bass ? '#1e5fd0' : '#c01010' }), w / 2 - 0.05, h - 0.045, d / 2 + 0.008, false));
    still.add(mesh(new THREE.BoxGeometry(0.16, 0.02, 0.04), toon('#0b0b0e'), 0, h + 0.012, 0, false));
    const plate = logo(bass ? 'BASSWERK' : 'Donner', 0.14, 0.04, '#f4efe2', '#0d0c10', bass ? '900 64px Arial, sans-serif' : undefined);
    plate.position.set(-w / 2 + 0.12, 0.12, d / 2 + 0.006);
    g.add(plate);
    g.add(mergeByColor(still));
    return g;
  });
}

/** A floor wedge: its face tipped up at whoever stands behind it (it faces +z). */
export function wedge(): THREE.Group {
  return once('wedge', () => {
    const g = new THREE.Group();
    const still = new THREE.Group();
    const sh = new THREE.Shape();
    sh.moveTo(-0.22, 0);
    sh.lineTo(0.26, 0);
    sh.lineTo(0, 0.34);
    sh.lineTo(-0.22, 0.34);
    sh.closePath();
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.56, bevelEnabled: false });
    geo.translate(0, 0, -0.28);
    geo.rotateY(-Math.PI / 2);
    still.add(mesh(geo, toon(TOLEX)));
    // The sloping face: a metal grille.
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.41), grille('#4c5058', '#16171b', true, 5));
    face.position.set(0, 0.17, 0.134);
    face.rotation.x = -Math.atan2(0.26, 0.34);
    g.add(face);
    g.add(mergeByColor(still));
    return g;
  });
}

/** A side-fill: two big boxes and a horn on top, on the stage's wings, facing across it. */
export function sideFill(): THREE.Group {
  return once('sidefill', () => {
    const g = new THREE.Group();
    const still = new THREE.Group();
    const metal = grille('#3c4048', '#121317', true, 7);
    cabinet(still, g, 0.7, 0.72, 0.6, 0, metal, '#2b2c33');
    cabinet(still, g, 0.7, 0.72, 0.6, 0.72, metal, '#2b2c33');
    still.add(mesh(new THREE.BoxGeometry(0.7, 0.36, 0.6), toon(TOLEX), 0, 1.62, 0));
    // The horn's flare.
    const horn = mesh(new THREE.CylinderGeometry(0.06, 0.24, 0.08, 4, 1, true).rotateX(Math.PI / 2).rotateZ(Math.PI / 4), toon('#0c0c0f'), 0, 1.62, 0.28);
    horn.scale.set(1.3, 0.55, 1);
    still.add(horn);
    g.add(mergeByColor(still));
    return g;
  });
}

/** The organ's rotating speaker: a wooden cabinet with louvres, the rotor's horn seen through them. */
export function rotaryCab(): THREE.Group {
  return once('rotary', () => {
    const g = new THREE.Group();
    const still = new THREE.Group();
    const wood = toon('#6b3d1e');
    still.add(mesh(new THREE.BoxGeometry(0.58, 0.96, 0.5), wood, 0, 0.5, 0));
    still.add(mesh(new THREE.BoxGeometry(0.62, 0.04, 0.54), toon('#4e2b13'), 0, 0.99, 0));
    still.add(mesh(new THREE.BoxGeometry(0.62, 0.06, 0.54), toon('#4e2b13'), 0, 0.03, 0));
    for (let i = 0; i < 7; i++) still.add(mesh(new THREE.BoxGeometry(0.42, 0.014, 0.02), toon('#2a170a'), 0, 0.72 + i * 0.03, 0.255, false));
    for (let i = 0; i < 7; i++) still.add(mesh(new THREE.BoxGeometry(0.42, 0.014, 0.02), toon('#2a170a'), 0, 0.2 + i * 0.03, 0.255, false));
    g.add(mergeByColor(still));
    return g;
  });
}
