import * as THREE from 'three';
import { BOOTH_DESK, BOOTH_RISER, BOOTH_SCREEN, BOOTH_STAIRS, DJ_SPOT } from '../../../shared/venueshow';
import { ZONES } from '../../../shared/venue';
import type { MixFrame } from '../../../shared/venueshow-mix';
import { mesh, roundedBox, toon } from '../../world/toon';
import type { Collider, Interactable } from '../../world/types';

// The SCHALLWERK's DJ booth (flrnoh fork, see FORK.md "The show"): its own riser stage right with
// five steps up its west side, the desk with two CDJs, a four-channel mixer, a laptop on its stand
// and a pair of headphones, a gooseneck lamp, an LED strip under the desk's edge, SCHALLWERK running
// in LEDs across the riser's front, two moving heads on poles at its front corners throwing beams
// over the floor, and an LED screen behind the DJ: all of it moving to the beat that plays.

export interface BoothLook {
  /** The beat (the set's or the house mix's), or null with nothing on. */
  frame: MixFrame | null;
  /** Who's at the decks, and what plays. */
  dj: string | null;
  title: string;
  club: boolean;
}

export interface Booth {
  group: THREE.Group;
  colliders: Collider[];
  interactables: Interactable[];
  /** The decks' interactable (E takes the booth). */
  decks: Interactable;
  update(t: number, dt: number, look: BoothLook): void;
}

const WHITE = new THREE.Color('#ffffff');
const R = BOOTH_RISER;
const D = BOOTH_DESK;
const TOP = R.height;

/** "SCHALLWERK" as a dot mask, cols × rows. */
function textMask(text: string, cols: number, rows: number): Uint8Array {
  const c = document.createElement('canvas');
  c.width = cols;
  c.height = rows;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, cols, rows);
  g.fillStyle = '#fff';
  g.font = `bold ${Math.floor(rows * 0.92)}px "Arial Black", Arial, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, cols / 2, rows / 2 + 1, cols - 2);
  const d = g.getImageData(0, 0, cols, rows).data;
  const out = new Uint8Array(cols * rows);
  for (let i = 0; i < cols * rows; i++) out[i] = d[i * 4] > 110 ? 1 : 0;
  return out;
}

function canvasTex(w: number, h: number): { c: HTMLCanvasElement; g: CanvasRenderingContext2D; tex: THREE.CanvasTexture } {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return { c, g, tex };
}

const glowMat = (tex: THREE.Texture) => {
  const m = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  m.userData.outlineParameters = { visible: false };
  return m;
};

export function buildBooth(): Booth {
  const group = new THREE.Group();
  group.name = 'venue-djbooth';
  const colliders: Collider[] = [];
  const black = toon('#16161c');
  const steel = toon('#8d939e');
  const plate = toon('#2a2c34');
  const deck = new THREE.Group();

  // ---- The riser and its steps ----------------------------------------------------------------------
  const w = R.maxX - R.minX;
  const dd = R.maxZ - R.minZ;
  group.add(mesh(new THREE.BoxGeometry(w, TOP, dd), black, (R.minX + R.maxX) / 2, TOP / 2, (R.minZ + R.maxZ) / 2));
  // A rubber mat on top, a white edge where you'd step off.
  group.add(mesh(new THREE.BoxGeometry(w - 0.1, 0.02, dd - 0.1), toon('#24242c'), (R.minX + R.maxX) / 2, TOP + 0.01, (R.minZ + R.maxZ) / 2, false));
  group.add(mesh(new THREE.BoxGeometry(w, 0.025, 0.06), toon('#f1faee'), (R.minX + R.maxX) / 2, TOP + 0.015, R.minZ + 0.03, false));
  colliders.push({ minX: R.minX, maxX: R.maxX, minZ: R.minZ, maxZ: R.maxZ, top: TOP });
  const S = BOOTH_STAIRS;
  const stepD = (S.maxZ - S.minZ) / S.steps;
  for (let i = 0; i < S.steps; i++) {
    const top = (TOP * (i + 1)) / S.steps;
    const z0 = S.minZ + i * stepD;
    group.add(mesh(new THREE.BoxGeometry(S.maxX - S.minX, top, stepD), black, (S.minX + S.maxX) / 2, top / 2, z0 + stepD / 2));
    group.add(mesh(new THREE.BoxGeometry(S.maxX - S.minX, 0.02, 0.05), toon('#ffd166', { emissive: '#7a5a00' }), (S.minX + S.maxX) / 2, top + 0.005, z0 + 0.03, false));
    colliders.push({ minX: S.minX, maxX: S.maxX, minZ: z0, maxZ: z0 + stepD, top });
  }
  // Between the stage (to x = ZONES.djbooth.minX) and the riser there'd be a pit behind the steps and a slot
  // beside them: the riser runs on west to the stage's edge there, a 0.2 m step down from the stage.
  const fills = [
    { minX: ZONES.djbooth.minX, maxX: R.minX, minZ: S.maxZ, maxZ: ZONES.djbooth.maxZ },
    { minX: ZONES.djbooth.minX, maxX: S.minX, minZ: S.minZ, maxZ: S.maxZ },
  ];
  for (const f of fills) {
    group.add(mesh(new THREE.BoxGeometry(f.maxX - f.minX, TOP, f.maxZ - f.minZ), black, (f.minX + f.maxX) / 2, TOP / 2, (f.minZ + f.maxZ) / 2));
    colliders.push({ ...f, top: TOP });
  }
  // A handrail up the steps' outer (west) side.
  const rail = new THREE.CatmullRomCurve3([new THREE.Vector3(S.minX + 0.05, 0.95, S.minZ), new THREE.Vector3(S.minX + 0.05, TOP + 0.95, S.maxZ + 0.2)]);
  group.add(mesh(new THREE.TubeGeometry(rail, 8, 0.03, 6), steel, 0, 0, 0, false));
  for (const z of [S.minZ + 0.05, S.maxZ + 0.15]) group.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.95 + (z > S.minZ + 1 ? TOP : 0.1)), steel, S.minX + 0.05, (0.95 + (z > S.minZ + 1 ? TOP : 0.1)) / 2, z, false));

  // SCHALLWERK in LEDs across the riser's front.
  const COLS = 128;
  const ROWS = 20;
  const front = canvasTex(COLS * 8, ROWS * 8);
  const mask = textMask('SCHALLWERK', COLS, ROWS - 3);
  const frontMesh = mesh(new THREE.PlaneGeometry(w - 0.2, TOP - 0.16), glowMat(front.tex), (R.minX + R.maxX) / 2, TOP / 2, R.minZ - 0.012, false);
  frontMesh.rotation.y = Math.PI;
  group.add(frontMesh);

  // ---- The desk ----------------------------------------------------------------------------------------
  const deskTop = TOP + D.height;
  deck.add(mesh(roundedBox(D.width, 0.08, D.depth, 0.03), plate, D.x, deskTop - 0.04, D.z));
  deck.add(mesh(new THREE.BoxGeometry(D.width - 0.1, D.height - 0.08, D.depth - 0.1), black, D.x, TOP + (D.height - 0.08) / 2, D.z));
  // Its front panel, toward the floor: the house's name, lit.
  const panel = canvasTex(512, 128);
  {
    const g = panel.g;
    g.fillStyle = '#05050a';
    g.fillRect(0, 0, 512, 128);
    g.font = 'bold 70px "Arial Black", Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = '#ff3d81';
    g.shadowBlur = 24;
    g.fillStyle = '#ffffff';
    g.fillText('SCHALLWERK', 256, 66, 480);
    panel.tex.needsUpdate = true;
  }
  const panelMat = glowMat(panel.tex);
  const panelMesh = mesh(new THREE.PlaneGeometry(D.width - 0.2, 0.5), panelMat, D.x, TOP + 0.5, D.z - D.depth / 2 - 0.006, false);
  panelMesh.rotation.y = Math.PI;
  deck.add(panelMesh);
  // The LED strip under the desk's front edge.
  const stripMat = new THREE.MeshBasicMaterial({ color: '#ff3d81', toneMapped: false });
  stripMat.userData.outlineParameters = { visible: false };
  deck.add(mesh(new THREE.BoxGeometry(D.width, 0.025, 0.025), stripMat, D.x, deskTop - 0.1, D.z - D.depth / 2 - 0.01, false));
  // Two CDJs either side of the mixer, their jog wheels lit round the edge.
  const jogRings: THREE.Mesh[] = [];
  const jogMat = new THREE.MeshBasicMaterial({ color: '#3a86ff', toneMapped: false });
  jogMat.userData.outlineParameters = { visible: false };
  const screenMat = new THREE.MeshBasicMaterial({ color: '#4cc9f0', toneMapped: false });
  screenMat.userData.outlineParameters = { visible: false };
  for (const sx of [-1, 1]) {
    const x = D.x + sx * 0.95;
    deck.add(mesh(roundedBox(0.62, 0.1, 0.62, 0.04), toon('#1d1e24'), x, deskTop + 0.05, D.z));
    const jog = mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 28), toon('#3a3b42'), x, deskTop + 0.11, D.z + 0.08);
    deck.add(jog);
    jogRings.push(jog);
    const ring = mesh(new THREE.TorusGeometry(0.205, 0.012, 6, 32), jogMat, x, deskTop + 0.12, D.z + 0.08, false);
    ring.rotation.x = Math.PI / 2;
    deck.add(ring);
    const scr = mesh(new THREE.PlaneGeometry(0.34, 0.12), screenMat, x, deskTop + 0.13, D.z - 0.2, false);
    scr.rotation.x = -Math.PI / 2 + 0.5;
    scr.rotation.y = Math.PI;
    deck.add(scr);
    for (const bx of [-0.18, 0.18]) deck.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.02, 12), toon(bx < 0 ? '#06d6a0' : '#ffd166'), x + bx, deskTop + 0.11, D.z + 0.25, false));
  }
  // The mixer: four channels of faders and knobs, VU meters.
  deck.add(mesh(roundedBox(0.5, 0.1, 0.6, 0.03), toon('#22232a'), D.x, deskTop + 0.05, D.z));
  const vu: THREE.Mesh[] = [];
  for (let ch = 0; ch < 4; ch++) {
    const x = D.x - 0.18 + ch * 0.12;
    deck.add(mesh(new THREE.BoxGeometry(0.03, 0.03, 0.06), toon('#e9ecef'), x, deskTop + 0.11, D.z + 0.12 - (ch % 2) * 0.05, false));
    for (let k = 0; k < 3; k++) deck.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.03, 10), toon('#adb5bd'), x, deskTop + 0.115, D.z - 0.06 - k * 0.07, false));
    const bar = mesh(new THREE.BoxGeometry(0.025, 0.01, 0.1), new THREE.MeshBasicMaterial({ color: '#06d6a0', toneMapped: false }), x, deskTop + 0.106, D.z - 0.24, false);
    (bar.material as THREE.Material).userData.outlineParameters = { visible: false };
    deck.add(bar);
    vu.push(bar);
  }
  // The laptop on its stand, its screen showing the waveform.
  const lap = canvasTex(256, 160);
  const lapMesh = mesh(new THREE.PlaneGeometry(0.42, 0.27), glowMat(lap.tex), D.x + 1.85, deskTop + 0.34, D.z + 0.05, false);
  lapMesh.rotation.y = Math.PI - 0.5;
  lapMesh.rotation.x = -0.15;
  deck.add(lapMesh);
  deck.add(mesh(new THREE.BoxGeometry(0.44, 0.02, 0.3), toon('#c0c4cc'), D.x + 1.86, deskTop + 0.2, D.z + 0.2, false));
  deck.add(mesh(new THREE.BoxGeometry(0.05, 0.2, 0.05), steel, D.x + 1.86, deskTop + 0.1, D.z + 0.2, false));
  // Headphones on the desk, and the gooseneck lamp over the mixer.
  const cans = new THREE.Group();
  cans.add(mesh(new THREE.TorusGeometry(0.1, 0.012, 6, 16, Math.PI), black, 0, 0.0, 0, false));
  for (const s of [-1, 1]) cans.add(mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 12), black, s * 0.1, -0.01, 0, false));
  cans.position.set(D.x - 1.5, deskTop + 0.04, D.z + 0.2);
  cans.rotation.x = -Math.PI / 2;
  deck.add(cans);
  const neck = new THREE.CatmullRomCurve3([new THREE.Vector3(D.x + 0.32, deskTop, D.z + 0.3), new THREE.Vector3(D.x + 0.3, deskTop + 0.4, D.z + 0.2), new THREE.Vector3(D.x + 0.1, deskTop + 0.45, D.z)]);
  deck.add(mesh(new THREE.TubeGeometry(neck, 10, 0.008, 5), steel, 0, 0, 0, false));
  const bulbMat = new THREE.MeshBasicMaterial({ color: '#fff3c4', toneMapped: false });
  deck.add(mesh(new THREE.SphereGeometry(0.025, 8, 6), bulbMat, D.x + 0.1, deskTop + 0.43, D.z, false));
  const lamp = new THREE.PointLight('#ffe0a8', 0.6, 2.2, 2);
  lamp.position.set(D.x + 0.1, deskTop + 0.38, D.z);
  deck.add(lamp);
  group.add(deck);
  colliders.push({ minX: D.x - D.width / 2, maxX: D.x + D.width / 2, minZ: D.z - D.depth / 2, maxZ: D.z + D.depth / 2, bottom: TOP, top: deskTop + 0.15 });

  // Two monitor wedges beside the DJ.
  for (const sx of [-1, 1]) {
    const wedge = mesh(new THREE.BoxGeometry(0.55, 0.38, 0.45), black, DJ_SPOT.x + sx * 1.95, TOP + 0.19, DJ_SPOT.z - 0.1);
    wedge.rotation.y = sx * 0.4;
    group.add(wedge);
    colliders.push({ minX: DJ_SPOT.x + sx * 1.95 - 0.3, maxX: DJ_SPOT.x + sx * 1.95 + 0.3, minZ: DJ_SPOT.z - 0.35, maxZ: DJ_SPOT.z + 0.15, bottom: TOP, top: TOP + 0.4 });
  }

  // ---- The LED screen behind the DJ ----------------------------------------------------------------------
  const B = BOOTH_SCREEN;
  const screen = canvasTex(512, 296);
  const scr = mesh(new THREE.PlaneGeometry(B.width, B.height), glowMat(screen.tex), B.x, B.bottom + B.height / 2, B.z, false);
  scr.rotation.y = Math.PI;
  group.add(scr);
  group.add(mesh(new THREE.BoxGeometry(B.width + 0.2, B.height + 0.2, 0.12), black, B.x, B.bottom + B.height / 2, B.z + 0.08));
  for (const sx of [-1, 1]) group.add(mesh(new THREE.BoxGeometry(0.12, B.bottom, 0.12), black, B.x + sx * (B.width / 2 - 0.2), B.bottom / 2 + TOP / 2, B.z + 0.08));
  colliders.push({ minX: B.x - B.width / 2 - 0.1, maxX: B.x + B.width / 2 + 0.1, minZ: B.z - 0.05, maxZ: B.z + 0.2, top: B.bottom + B.height + 0.1 });

  // ---- Two moving heads on poles at the riser's front corners ------------------------------------------------
  const heads: { yoke: THREE.Group; beam: THREE.Mesh; mat: THREE.MeshBasicMaterial; lens: THREE.MeshBasicMaterial }[] = [];
  for (const x of [R.minX + 0.3, R.maxX - 0.3]) {
    const pole = mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.3, 8), steel, x, TOP + 1.15, R.minZ + 0.3);
    group.add(pole);
    colliders.push({ minX: x - 0.08, maxX: x + 0.08, minZ: R.minZ + 0.22, maxZ: R.minZ + 0.38, bottom: TOP, top: TOP + 2.3 });
    const yoke = new THREE.Group();
    yoke.position.set(x, TOP + 2.45, R.minZ + 0.3);
    yoke.add(mesh(new THREE.BoxGeometry(0.26, 0.2, 0.26), black, 0, 0, 0, false));
    const lens = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
    lens.userData.outlineParameters = { visible: false };
    const lensMesh = mesh(new THREE.CircleGeometry(0.08, 16), lens, 0, -0.105, 0, false);
    lensMesh.rotation.x = Math.PI / 2;
    yoke.add(lensMesh);
    const mat = new THREE.MeshBasicMaterial({ color: '#ff3d81', transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
    mat.userData.outlineParameters = { visible: false };
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.9, 10, 18, 1, true).translate(0, -5, 0), mat);
    beam.raycast = () => {};
    yoke.add(beam);
    group.add(yoke);
    heads.push({ yoke, beam, mat, lens });
  }

  // ---- E at the decks ------------------------------------------------------------------------------------------
  const decks: Interactable = { kind: 'venuedj', x: DJ_SPOT.x, z: DJ_SPOT.z - 0.4, y: TOP, radius: 1.9 };
  deck.traverse((o) => (o.userData.interact = decks));

  // ---- Every frame -----------------------------------------------------------------------------------------------
  let redraw = 0;
  const col = new THREE.Color();
  const headCol = new THREE.Color();
  function update(t: number, dt: number, look: BoothLook) {
    const f = look.frame;
    const on = !!f;
    const beat = f?.beat ?? 0;
    const hue = f ? f.hue : 0.92;
    for (const j of jogRings) j.rotation.y += dt * (on ? 3.6 : 0);
    col.setHSL(hue, 0.9, 0.55);
    jogMat.color.copy(col).multiplyScalar(0.6 + 0.4 * beat);
    stripMat.color.setHSL((hue + 0.5) % 1, 0.95, 0.35 + 0.3 * (f?.kick ?? 0));
    panelMat.color.setScalar(0.75 + 0.25 * beat);
    vu.forEach((b, i) => (b.scale.z = on ? 0.3 + 0.7 * Math.abs(Math.sin(t * 7 + i * 1.3)) * (0.5 + 0.5 * beat) : 0.05));
    // The heads: sweeping figures of eight on the beat, hard flashes at the drop, still and dim with nothing on.
    heads.forEach((h, i) => {
      const s = i ? -1 : 1;
      const k = f ? f.beats * Math.PI * 0.25 : t * 0.2;
      const drop = f && f.part === 'drop';
      h.yoke.rotation.set(0, 0, 0);
      h.yoke.rotateY(s * 0.5 + Math.sin(k + i) * (drop ? 0.8 : 0.45));
      h.yoke.rotateX(0.75 + 0.3 * Math.sin(k * 2 + i));
      const c = headCol.setHSL((hue + i * 0.33 + (drop ? Math.floor(f!.beats) * 0.17 : 0)) % 1, 1, 0.55);
      h.mat.color.copy(c);
      h.mat.opacity = on ? (look.club ? 0.13 : 0.07) + 0.12 * (drop ? beat : f!.energy * 0.4) : 0.02;
      h.lens.color.copy(c).lerp(WHITE, 0.5);
      h.beam.visible = on || look.club;
    });
    lamp.intensity = look.dj ? 0.7 : 0.25;
    // The canvases at about 20 a second.
    redraw -= dt;
    if (redraw > 0) return;
    redraw = 0.05;
    drawFront(front.g, mask, COLS, ROWS, t, f);
    front.tex.needsUpdate = true;
    drawScreen(screen.g, t, f, look);
    screen.tex.needsUpdate = true;
    drawLaptop(lap.g, t, f, look);
    lap.tex.needsUpdate = true;
  }

  return { group, colliders, interactables: [decks], decks, update };
}

/** The riser's LEDs: SCHALLWERK in a colour that runs across with the beat, a chase underneath. */
const dark = new WeakMap<CanvasRenderingContext2D, HTMLCanvasElement>();
function drawFront(g: CanvasRenderingContext2D, mask: Uint8Array, cols: number, rows: number, t: number, f: MixFrame | null) {
  const cell = 8;
  // Every LED, off: drawn once, laid down first each time.
  let base = dark.get(g);
  if (!base) {
    base = document.createElement('canvas');
    base.width = cols * cell;
    base.height = rows * cell;
    const b = base.getContext('2d')!;
    b.fillStyle = '#050508';
    b.fillRect(0, 0, base.width, base.height);
    b.fillStyle = '#16161e';
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) b.fillRect(x * cell + 1, y * cell + 1, cell - 2, cell - 2);
    dark.set(g, base);
  }
  g.drawImage(base, 0, 0);
  const beats = f ? f.beats : t * 0.5;
  const hue = f ? f.hue : 0.92;
  const pulse = f ? 0.45 + 0.55 * f.beat : 0.55 + 0.1 * Math.sin(t * 2);
  const light = Math.round(40 + 30 * pulse);
  for (let x = 0; x < cols; x++) {
    const wave = (Math.sin(x * 0.12 - beats * Math.PI * 0.5) + 1) / 2;
    g.fillStyle = `hsl(${Math.round(((hue + wave * 0.25) % 1) * 360)},95%,${light}%)`;
    for (let y = 0; y < rows - 2; y++) if (mask[y * cols + x]) g.fillRect(x * cell + 1, y * cell + 1, cell - 2, cell - 2);
  }
  // The chase along the bottom.
  g.fillStyle = `hsl(${Math.round(((hue + 0.5) % 1) * 360)},90%,55%)`;
  for (let x = 0; x < cols; x++) if (Math.floor(x / 4 + beats * 4) % 8 === 0) for (const y of [rows - 2, rows - 1]) g.fillRect(x * cell + 1, y * cell + 1, cell - 2, cell - 2);
}

/** The screen behind the DJ: a picture for each part of the set, the name and what plays along the bottom. */
function drawScreen(g: CanvasRenderingContext2D, t: number, f: MixFrame | null, look: BoothLook) {
  const W = 512;
  const H = 296;
  g.fillStyle = '#04030a';
  g.fillRect(0, 0, W, H);
  const hue = Math.round((f ? f.hue : 0.92) * 360);
  if (!f) {
    // Nothing on: the house's name breathing.
    g.fillStyle = `hsla(${hue},80%,${30 + 8 * Math.sin(t)}%,1)`;
    g.font = 'bold 64px "Arial Black", Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('SCHALLWERK', W / 2, H / 2, W - 40);
    return;
  }
  const b = f.beats;
  if (f.part === 'drop') {
    // Rings bursting out of the middle on every beat.
    for (let k = 0; k < 9; k++) {
      const r = ((b % 1) + k) * 34;
      g.strokeStyle = `hsla(${(hue + k * 25) % 360},95%,60%,${Math.max(0, 1 - k / 9)})`;
      g.lineWidth = 10;
      g.beginPath();
      g.arc(W / 2, H / 2, r, 0, Math.PI * 2);
      g.stroke();
    }
  } else if (f.part === 'build') {
    // Bars climbing with the build, faster and faster.
    const n = 24;
    for (let i = 0; i < n; i++) {
      const h = H * (0.15 + 0.8 * f.rise) * (0.6 + 0.4 * Math.abs(Math.sin(i * 0.7 + b * Math.PI * (1 + f.rise * 3))));
      g.fillStyle = `hsl(${(hue + i * 6) % 360},90%,${45 + 20 * f.beat}%)`;
      g.fillRect(i * (W / n) + 2, H - h, W / n - 4, h);
    }
  } else if (f.part === 'breakdown') {
    // Slow waves.
    for (let y = 0; y < H; y += 8) {
      const v = Math.sin(y * 0.03 + t * 0.8) + Math.sin(y * 0.05 - t * 0.5);
      g.fillStyle = `hsla(${(hue + v * 30 + 360) % 360},70%,${18 + 10 * v}%,1)`;
      g.fillRect(0, y, W, 8);
    }
  } else {
    // A spectrum, kicking.
    const n = 32;
    for (let i = 0; i < n; i++) {
      const h = H * 0.7 * (0.2 + 0.8 * Math.abs(Math.sin(i * 0.9 + b * 1.7))) * (0.5 + 0.5 * f.energy) * (i < 6 ? 0.6 + 0.4 * f.kick : 1);
      g.fillStyle = `hsl(${(hue + i * 4) % 360},85%,50%)`;
      g.fillRect(i * (W / n) + 1, H - 40 - h, W / n - 2, h);
    }
  }
  g.fillStyle = 'rgba(0,0,0,0.55)';
  g.fillRect(0, H - 40, W, 40);
  g.fillStyle = '#ffffff';
  g.font = 'bold 22px "Arial Black", Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const words = f.part === 'build' && f.rise > 0.7 ? `GET READY · ${Math.max(1, Math.ceil((1 - f.rise) * 8))}` : look.dj ? `DJ ${look.dj.toUpperCase()}` : 'SCHALLWERK';
  g.fillText(words, W / 2, H - 20, W - 20);
  if (look.title && f.part !== 'drop') {
    g.font = '16px Arial, sans-serif';
    g.fillText(look.title.slice(0, 60), W / 2, 22, W - 20);
  }
}

/** The laptop's screen: two decks' waveforms scrolling by, the tempo. */
function drawLaptop(g: CanvasRenderingContext2D, t: number, f: MixFrame | null, look: BoothLook) {
  g.fillStyle = '#101218';
  g.fillRect(0, 0, 256, 160);
  for (let deck = 0; deck < 2; deck++) {
    const y0 = 20 + deck * 60;
    g.fillStyle = '#1b1f2a';
    g.fillRect(6, y0, 244, 46);
    g.fillStyle = deck ? '#06d6a0' : '#3a86ff';
    const shift = (f ? f.beats : t) * 12 + deck * 40;
    for (let x = 0; x < 244; x += 2) {
      const a = Math.abs(Math.sin((x + shift) * 0.13) * Math.sin((x + shift) * 0.031)) * 20 + 2;
      g.fillRect(6 + x, y0 + 23 - a, 1.5, a * 2);
    }
    g.fillStyle = '#ff3d81';
    g.fillRect(128, y0, 2, 46);
  }
  g.fillStyle = '#e9ecef';
  g.font = 'bold 14px Arial, sans-serif';
  g.textAlign = 'left';
  g.fillText(f ? `${Math.round(f.bpm)} BPM` : '— BPM', 8, 150);
  g.textAlign = 'right';
  g.fillText(look.dj ? look.dj.slice(0, 16) : 'AUTO', 248, 150);
}
