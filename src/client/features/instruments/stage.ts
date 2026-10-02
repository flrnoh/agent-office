import * as THREE from 'three';
import { STAGE_HEIGHT, ZONES } from '../../../shared/venue';
import { mergeByColor, mesh, toon } from '../../world/toon';
import type { Collider } from '../../world/types';
import { bassRig, guitarStack, rotaryCab, sideFill, wedge } from './gear/amps';
import { keyboard } from './gear/keys';

// ---- The Schallwerk's stage (flrnoh fork, see FORK.md "The instruments") --------------------------------
// The riser across the back of the hall (ZONES.stage, 1.2 m), facing the floor (-z): a deck of black
// stage platforms with their seams, scuffs and coloured spike marks, a rounded lip with white glow
// tape along its front edge, a pleated black skirt down to the floor, steps up at stage left with a
// handrail and taped noses. On it the backline: the drum riser with its rug, two full stacks, the
// bass rig, the keyboard's upper tier and the organ's rotating speaker, wedges at every mic and for
// the drummer, side-fills on both wings, pedalboards, the stage box with the cables taped down to it,
// setlists on the floor, towels and water. The back edge (z 11) is left clear: the band comes up
// from backstage there (the building's stairs).

const Z = ZONES.stage;
const H = STAGE_HEIGHT;
/** The steps at stage left (west), up from the floor toward the back. */
export const STAGE_STEPS = { minX: Z.minX, maxX: Z.minX + 1.2, minZ: Z.minZ, maxZ: Z.minZ + 2.2, n: 5 } as const;
/** The drum riser, on the deck under the kit. */
export const DRUM_RISER = { minX: 0.4, maxX: 4.6, minZ: 7.4, maxZ: 10.2, h: 0.28 } as const;
/** The back line's own stacks and cabs (where they stand on the deck, which way they face). */
const BACKLINE = {
  stack1: { x: -3.5, z: 9.6 },
  stack2: { x: 8.5, z: 9.6 },
  bassRig: { x: 6.3, z: 9.65 },
  rotary: { x: -9.4, z: 8.5 },
} as const;

/** The deck's platforms: black boards, the seams of 2 × 1 m platforms, scuffs and spike tape. */
function deckTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 2048;
  c.height = 512;
  const g = c.getContext('2d')!;
  g.fillStyle = '#17161a';
  g.fillRect(0, 0, c.width, c.height);
  // Scuffs: grey smears where feet and cases have dragged.
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(${120 + Math.random() * 60},${120 + Math.random() * 60},${130 + Math.random() * 60},${Math.random() * 0.05})`;
    const x = Math.random() * c.width;
    const y = Math.random() * c.height;
    g.fillRect(x, y, 4 + Math.random() * 60, 1 + Math.random() * 3);
  }
  // The platforms' seams: every 2 m across, every 1 m deep (27 × 7 m drawn on 2048 × 512).
  const px = c.width / (Z.maxX - Z.minX);
  const pz = c.height / (Z.maxZ - Z.minZ);
  g.strokeStyle = '#050506';
  g.lineWidth = 3;
  for (let x = 0; x <= Z.maxX - Z.minX; x += 2) {
    g.beginPath();
    g.moveTo(x * px, 0);
    g.lineTo(x * px, c.height);
    g.stroke();
  }
  for (let z = 0; z <= Z.maxZ - Z.minZ; z += 1) {
    g.beginPath();
    g.moveTo(0, z * pz);
    g.lineTo(c.width, z * pz);
    g.stroke();
  }
  // Spike tape: where everything goes, in each player's colour.
  const spikes: [number, number, string][] = [
    [-3.5, 6.8, '#ffd23a'],
    [8.5, 6.8, '#3ad1ff'],
    [5.5, 7.8, '#ff4fa3'],
    [-7.5, 7.6, '#8cff5a'],
    [2.5, 5.0, '#ffffff'],
    [-3.5, 5.0, '#ffffff'],
    [8.5, 5.0, '#ffffff'],
  ];
  for (const [x, z, col] of spikes) {
    g.fillStyle = col;
    const cx = (x - Z.minX) * px;
    const cz = (z - Z.minZ) * pz;
    g.fillRect(cx - 6, cz - 2, 12, 4);
    g.fillRect(cx - 2, cz - 6, 4, 12);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** The skirt's pleats: soft vertical folds of black wool. */
function skirtTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 16;
  const g = c.getContext('2d')!;
  for (let x = 0; x < 256; x++) {
    const v = 14 + Math.round(10 * (0.5 + 0.5 * Math.sin((x / 256) * Math.PI * 2 * 8)));
    g.fillStyle = `rgb(${v},${v},${v + 3})`;
    g.fillRect(x, 0, 1, 16);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.set(14, 1);
  return t;
}

/** The drum riser's rug: a deep red with a border and a medallion, as every drummer's is. */
function rugTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 384;
  const g = c.getContext('2d')!;
  g.fillStyle = '#6e1420';
  g.fillRect(0, 0, 512, 384);
  g.strokeStyle = '#1b2240';
  g.lineWidth = 26;
  g.strokeRect(20, 20, 472, 344);
  g.strokeStyle = '#d9b26a';
  g.lineWidth = 4;
  g.strokeRect(38, 38, 436, 308);
  g.strokeRect(8, 8, 496, 368);
  for (let i = 0; i < 40; i++) {
    g.fillStyle = i % 2 ? '#d9b26a' : '#e8e0c8';
    const a = (i / 40) * Math.PI * 2;
    g.beginPath();
    g.arc(256 + Math.cos(a) * 110, 192 + Math.sin(a) * 80, 6, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = '#1b2240';
  g.beginPath();
  g.ellipse(256, 192, 80, 56, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#d9b26a';
  g.beginPath();
  g.ellipse(256, 192, 34, 24, 0, 0, Math.PI * 2);
  g.fill();
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`;
    g.fillRect(Math.random() * 512, Math.random() * 384, 2, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A setlist on a sheet of paper, felt-tipped (the band's own songs). */
function setlistTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 210;
  c.height = 300;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f7f5ee';
  g.fillRect(0, 0, 210, 300);
  g.fillStyle = '#16161c';
  g.font = '700 22px "Marker Felt", "Comic Sans MS", cursive';
  g.fillText('SCHALLWERK', 18, 34);
  g.font = '600 17px "Marker Felt", "Comic Sans MS", cursive';
  const songs = ['Intro (laut!)', 'Kaffee schwarz', 'Merge-Konflikt-Blues', 'Regen über Viechtach', 'Grüner Build', 'Feierabend', '— Ansage —', 'Bassline ohne Ende', 'Strike!', 'Zugabe?'];
  songs.forEach((s, i) => g.fillText(`${i + 1}. ${s}`, 14, 68 + i * 23));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A cable lying on the deck from `a` to `b`, sagging into a curve or two. */
function cable(points: [number, number][], y: number, mat: THREE.Material): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, y + 0.012, z)));
  return mesh(new THREE.TubeGeometry(curve, points.length * 8, 0.012, 5, false), mat, 0, 0, 0, false);
}

export interface StageBuilt {
  group: THREE.Group;
  colliders: Collider[];
}

export function buildStage(): StageBuilt {
  const group = new THREE.Group();
  group.name = 'stage';
  const still = new THREE.Group();
  const colliders: Collider[] = [];
  const S = STAGE_STEPS;
  const w = Z.maxX - Z.minX;
  const black = toon('#121115');

  // ---- The deck --------------------------------------------------------------------------------------
  // The riser's body: in front of the steps from the lip to the back, and behind them at stage left.
  still.add(mesh(new THREE.BoxGeometry(Z.maxX - S.maxX, H - 0.02, Z.maxZ - Z.minZ), black, (S.maxX + Z.maxX) / 2, (H - 0.02) / 2, (Z.minZ + Z.maxZ) / 2));
  still.add(mesh(new THREE.BoxGeometry(S.maxX - S.minX, H - 0.02, Z.maxZ - S.maxZ), black, (S.minX + S.maxX) / 2, (H - 0.02) / 2, (S.maxZ + Z.maxZ) / 2));
  colliders.push({ minX: S.maxX, maxX: Z.maxX, minZ: Z.minZ, maxZ: Z.maxZ, top: H });
  colliders.push({ minX: S.minX, maxX: S.maxX, minZ: S.maxZ, maxZ: Z.maxZ, top: H });
  // Its top: the platforms, one textured plane over the whole zone (the steps' corner cut out below it).
  const deckShape = new THREE.Shape();
  deckShape.moveTo(S.maxX, Z.minZ);
  deckShape.lineTo(Z.maxX, Z.minZ);
  deckShape.lineTo(Z.maxX, Z.maxZ);
  deckShape.lineTo(Z.minX, Z.maxZ);
  deckShape.lineTo(Z.minX, S.maxZ);
  deckShape.lineTo(S.maxX, S.maxZ);
  deckShape.closePath();
  const deckGeo = new THREE.ShapeGeometry(deckShape);
  // Shape coordinates are (x, z): its UVs, across the zone.
  const uv = deckGeo.attributes.uv;
  const p = deckGeo.attributes.position;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) - Z.minX) / w, 1 - (p.getY(i) - Z.minZ) / (Z.maxZ - Z.minZ));
  deckGeo.rotateX(Math.PI / 2);
  const deck = mesh(deckGeo, new THREE.MeshToonMaterial({ map: deckTexture(), side: THREE.DoubleSide }), 0, H, 0, false);
  deck.receiveShadow = true;
  group.add(deck);
  // The skirt down the front, pleated.
  const skirt = mesh(new THREE.PlaneGeometry(Z.maxX - S.maxX, H - 0.04), new THREE.MeshToonMaterial({ map: skirtTexture() }), (S.maxX + Z.maxX) / 2, (H - 0.04) / 2, Z.minZ - 0.012, false);
  skirt.rotation.y = Math.PI;
  group.add(skirt);
  // The lip: a rounded nosing along the front, white glow tape just behind it.
  const lip = mesh(new THREE.CylinderGeometry(0.035, 0.035, Z.maxX - S.maxX, 10).rotateZ(Math.PI / 2), toon('#1e1d23'), (S.maxX + Z.maxX) / 2, H - 0.03, Z.minZ + 0.01, false);
  still.add(lip);
  const tape = new THREE.MeshBasicMaterial({ color: '#f4f4ea' });
  tape.userData.outlineParameters = { visible: false };
  const edge = new THREE.Mesh(new THREE.PlaneGeometry(Z.maxX - S.maxX - 0.2, 0.05), tape);
  edge.rotation.x = -Math.PI / 2;
  edge.position.set((S.maxX + Z.maxX) / 2, H + 0.004, Z.minZ + 0.09);
  group.add(edge);

  // ---- The steps at stage left --------------------------------------------------------------------------
  const tread = (S.maxZ - S.minZ) / S.n;
  const rise = H / S.n;
  for (let i = 0; i < S.n; i++) {
    const z0 = S.minZ + i * tread;
    const top = rise * (i + 1);
    still.add(mesh(new THREE.BoxGeometry(S.maxX - S.minX, top, S.maxZ - z0), toon(i % 2 ? '#1a191e' : '#16151a'), (S.minX + S.maxX) / 2, top / 2, (z0 + S.maxZ) / 2));
    colliders.push({ minX: S.minX, maxX: S.maxX, minZ: z0, maxZ: S.maxZ, top });
    // The nose taped white, so nobody misses a step in the dark.
    const nose = new THREE.Mesh(new THREE.PlaneGeometry(S.maxX - S.minX - 0.1, 0.04), tape);
    nose.rotation.x = -Math.PI / 2;
    nose.position.set((S.minX + S.maxX) / 2, top + 0.003, z0 + 0.04);
    group.add(nose);
  }
  // The handrail on the wall side, up the steps and on along the stage's west edge.
  const rail = toon('#2b2c33');
  const railX = S.minX + 0.06;
  for (let i = 0; i <= S.n; i++) {
    const z = S.minZ + 0.1 + i * tread * 0.98;
    const y0 = Math.min(H, rise * Math.max(1, i));
    still.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.95, 8), rail, railX, y0 + 0.47, z));
  }
  const slope = new THREE.Vector3(0, H - rise, S.maxZ - S.minZ - 0.2);
  const handrail = mesh(new THREE.CylinderGeometry(0.025, 0.025, slope.length(), 8), rail, railX, rise + 0.94 + (H - rise) / 2, (S.minZ + S.maxZ) / 2);
  handrail.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), slope.clone().normalize());
  still.add(handrail);
  colliders.push({ minX: S.minX, maxX: S.minX + 0.1, minZ: S.minZ, maxZ: S.maxZ, top: H + 1, fence: true });

  // ---- The drum riser ----------------------------------------------------------------------------------
  const D = DRUM_RISER;
  still.add(mesh(new THREE.BoxGeometry(D.maxX - D.minX, D.h, D.maxZ - D.minZ), toon('#1b1a20'), (D.minX + D.maxX) / 2, H + D.h / 2, (D.minZ + D.maxZ) / 2));
  colliders.push({ minX: D.minX, maxX: D.maxX, minZ: D.minZ, maxZ: D.maxZ, top: H + D.h });
  const rug = mesh(new THREE.PlaneGeometry(3.3, 2.4), new THREE.MeshToonMaterial({ map: rugTexture() }), (D.minX + D.maxX) / 2, H + D.h + 0.004, (D.minZ + D.maxZ) / 2 - 0.1, false);
  rug.rotation.x = -Math.PI / 2;
  rug.receiveShadow = true;
  group.add(rug);
  const riserEdge = edgeStrip(D.maxX - D.minX, '#f4f4ea');
  riserEdge.position.set((D.minX + D.maxX) / 2, H + D.h - 0.02, D.minZ - 0.006);
  riserEdge.rotation.y = Math.PI;
  group.add(riserEdge);

  // ---- The backline ----------------------------------------------------------------------------------------
  const place = (o: THREE.Object3D, x: number, z: number, rotY: number, y = H) => {
    o.position.set(x, y, z);
    o.rotation.y = rotY;
    group.add(o);
    return o;
  };
  for (const s of [BACKLINE.stack1, BACKLINE.stack2]) {
    place(guitarStack(), s.x, s.z, Math.PI);
    colliders.push({ minX: s.x - 0.4, maxX: s.x + 0.4, minZ: s.z - 0.22, maxZ: s.z + 0.22, top: H + 1.8 });
  }
  place(bassRig(), BACKLINE.bassRig.x, BACKLINE.bassRig.z, Math.PI);
  colliders.push({ minX: BACKLINE.bassRig.x - 0.33, maxX: BACKLINE.bassRig.x + 0.33, minZ: BACKLINE.bassRig.z - 0.26, maxZ: BACKLINE.bassRig.z + 0.26, top: H + 1.6 });
  place(rotaryCab(), BACKLINE.rotary.x, BACKLINE.rotary.z, Math.PI * 0.85);
  colliders.push({ minX: BACKLINE.rotary.x - 0.36, maxX: BACKLINE.rotary.x + 0.36, minZ: BACKLINE.rotary.z - 0.36, maxZ: BACKLINE.rotary.z + 0.36, top: H + 1 });
  // The keyboard's upper tier: a synth over the stage piano, on its own posts.
  const upper = keyboard('#1d1e24', 1.17, false);
  place(upper.group, -7.5, 7.6 - 0.56, Math.PI);
  for (const dx of [-0.4, 0.4]) still.add(mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.32, 6), toon('#1d1d22'), -7.5 + dx, H + 0.99, 7.6 - 0.58));
  // Wedges: at the three mics, the bass, the keys, and one beside the drummer.
  // The singers' beside their mic stands, turned in at them.
  for (const [x, z, r] of [
    [-4.15, 4.32, 0.45],
    [1.85, 4.32, 0.45],
    [7.85, 4.32, 0.45],
    [5.5, 6.75, 0],
    [-7.5, 6.5, 0],
  ] as const) {
    place(wedge(), x, z, r);
    colliders.push({ minX: x - 0.3, maxX: x + 0.3, minZ: z - 0.25, maxZ: z + 0.28, top: H + 0.34 });
  }
  place(wedge(), 4.25, 8.7, -Math.PI / 2, H + D.h);
  // Side-fills on both wings, facing across the stage.
  place(sideFill(), Z.minX + 0.5, 9.8, Math.PI / 2);
  colliders.push({ minX: Z.minX + 0.15, maxX: Z.minX + 0.85, minZ: 9.45, maxZ: 10.15, top: H + 1.8 });
  place(sideFill(), Z.maxX - 0.5, 9.8, -Math.PI / 2);
  colliders.push({ minX: Z.maxX - 0.85, maxX: Z.maxX - 0.15, minZ: 9.45, maxZ: 10.15, top: H + 1.8 });

  // Pedalboards in front of the guitarists and the bassist.
  for (const [x, z, n] of [
    [-3.5, 6.3, 5],
    [8.5, 6.3, 5],
    [5.5, 7.3, 3],
  ] as const)
    pedalboard(still, group, x, z, n);

  // The stage box, and the cables taped down from every mic, wedge and amp to it.
  const box = { x: -1.2, z: 10.3 };
  still.add(mesh(new THREE.BoxGeometry(0.5, 0.3, 0.22), toon('#2a2b31'), box.x, H + 0.15, box.z));
  still.add(mesh(new THREE.BoxGeometry(0.44, 0.2, 0.01), toon('#9da3ad'), box.x, H + 0.16, box.z - 0.112, false));
  const wire = toon('#0a0a0c');
  for (const pts of [
    [[2.5, 5.55], [2.0, 7.0], [0.2, 8.5], [box.x + 0.1, box.z - 0.12]],
    [[-3.5, 5.55], [-2.7, 7.5], [-1.6, 9.2], [box.x - 0.1, box.z - 0.12]],
    [[8.5, 5.55], [7.4, 7.2], [5.2, 10.4], [1.0, 10.45], [box.x + 0.2, box.z - 0.1]],
    [[-3.5, 4.5], [-4.6, 5.6], [-3.8, 9.3]],
    [[-3.3, 6.3], [-3.4, 8.2], [-3.5, 9.4]],
    [[8.7, 6.3], [8.6, 8.2], [8.5, 9.4]],
    [[5.6, 7.3], [5.9, 8.6], [6.3, 9.4]],
    [[-7.5, 7.2], [-8.5, 8.0], [-9.2, 8.3]],
    [[-7.2, 7.4], [-5, 9.6], [-2, 10.4], [box.x - 0.2, box.z - 0.1]],
  ] as [number, number][][])
    still.add(cable(pts, H, wire));
  // Gaffer tape holding the long runs down.
  const gaffer = toon('#3a3a40');
  for (const [x, z, r] of [
    [1.2, 7.9, 0.6],
    [-2.3, 8.2, -0.4],
    [6.6, 8.4, 0.9],
    [-6.2, 8.9, 0.6],
  ] as const) {
    const g = mesh(new THREE.BoxGeometry(0.3, 0.004, 0.05), gaffer, x, H + 0.022, z, false);
    g.rotation.y = r;
    still.add(g);
  }
  // Setlists at the mics and by the drummer.
  const list = new THREE.MeshToonMaterial({ map: setlistTexture() });
  for (const [x, z, r] of [
    [2.95, 4.55, 0.12],
    [-3.95, 4.6, -0.1],
    [8.05, 4.58, 0.06],
    [3.9, 9.6, Math.PI / 2 - 0.2],
  ] as const) {
    const sheet = mesh(new THREE.PlaneGeometry(0.21, 0.3), list, x, H + 0.006 + (z > 7.4 ? D.h : 0), z, false);
    // Read from where the player stands: its top away from them.
    sheet.rotation.set(-Math.PI / 2, 0, Math.PI + r);
    group.add(sheet);
  }
  // A towel over each stack, water bottles by the drummer and the mics.
  const towel = toon('#e9e6dd');
  for (const s of [BACKLINE.stack1, BACKLINE.stack2]) still.add(mesh(new THREE.BoxGeometry(0.3, 0.02, 0.24), towel, s.x - 0.12, H + 1.81, s.z - 0.02, false));
  for (const [x, z, y] of [
    [3.95, 9.3, D.h],
    [2.95, 5.4, 0],
    [-3.05, 5.45, 0],
    [8.95, 5.42, 0],
  ] as const) {
    still.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 10), toon('#9fd3ef', { opacity: 0.85 }), x, H + y + 0.1, z, false));
    still.add(mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.03, 8), toon('#2b6fd6'), x, H + y + 0.215, z, false));
  }
  group.add(mergeByColor(still));
  return { group, colliders };
}

/** A strip of tape down a vertical edge `w` long. */
function edgeStrip(w: number, color: string): THREE.Mesh {
  const m = new THREE.MeshBasicMaterial({ color });
  m.userData.outlineParameters = { visible: false };
  return new THREE.Mesh(new THREE.PlaneGeometry(w, 0.03), m);
}

/** A pedalboard on the deck: a black board, `n` pedals in their colours, their LEDs, the patch cables. */
function pedalboard(still: THREE.Group, group: THREE.Group, x: number, z: number, n: number) {
  const w = 0.12 * n + 0.08;
  still.add(mesh(new THREE.BoxGeometry(w, 0.05, 0.3), toon('#19191d'), x, H + 0.025, z));
  const colors = ['#e8c21f', '#2a8b3f', '#c7302c', '#2e63c4', '#e07a1c'];
  for (let i = 0; i < n; i++) {
    const px = x - w / 2 + 0.1 + i * 0.12;
    still.add(mesh(new THREE.BoxGeometry(0.075, 0.045, 0.12), toon(colors[i % colors.length]), px, H + 0.072, z - 0.03));
    still.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.02, 8), toon('#c9ced8'), px, H + 0.1, z - 0.07, false));
    group.add(mesh(new THREE.SphereGeometry(0.006, 6, 4), toon('#ff4040', { emissive: '#ff2020' }), px + 0.025, H + 0.097, z + 0.005, false));
  }
}
