import * as THREE from 'three';
import { CASHIER, CASINO_DOOR, CASINO_ROOM, CASINO_TABLES, type CasinoTableDef } from '../../../shared/casino';
import { SPIN_MS, type SlotsView } from '../../../shared/casino-slots';
import type { Collider, Interactable } from '../office';
import { mergeByMaterial, mesh, textPlane, toon } from '../toon';
import { Reels, drawReels } from '../../ui/casino/reels';
import { WheelClock } from '../../ui/casino/roulette-wheel';
import type { RouletteView } from '../../../shared/casino-roulette';
import { box, canvasTexture, carpetTexture, chaser, glow, neonSign, FONT } from './parts';

/*
 * Inside the casino (flrnoh fork, see FORK.md): a place of its own, like the roof, built the first
 * time anyone goes in (client/casino.ts). A red-and-gold hall with chandeliers: the slot machines
 * along the west wall, roulette and poker down the middle, two blackjack tables, the cashier's
 * counter on the east wall, and the doors back out to the street. Its floor is at y 0, where the
 * building stands on the street (CASINO_ROOM), whatever floor you came from.
 */

export interface CasinoInterior {
  group: THREE.Group;
  colliders: Collider[];
  interactables: Interactable[];
  pickables: THREE.Object3D[];
  /** The way out (E at the doors). */
  exit: Interactable;
  /** A table's state from the office: a slot machine's reels turn on everyone's screen. */
  setTable(id: string, state: unknown): void;
  update(t: number, dt: number): void;
}

const R = CASINO_ROOM;
const W = R.maxX - R.minX;
const D = R.maxZ - R.minZ;
const CX = (R.minX + R.maxX) / 2;
const CZ = (R.minZ + R.maxZ) / 2;
const T = 0.3;

/** A felt that looks like a table's: a color, a gold line round it, and the game's name. */
function feltTexture(kind: CasinoTableDef['kind'], color: string, w = 512, h = 256): THREE.CanvasTexture {
  return canvasTexture(w, h, (g) => {
    g.fillStyle = color;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,225,150,0.75)';
    g.lineWidth = 5;
    g.strokeRect(18, 18, w - 36, h - 36);
    g.fillStyle = 'rgba(255,235,180,0.85)';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (kind === 'roulette') {
      // The number grid: 3 rows of 12, with the zero.
      const x0 = w * 0.3;
      const cw = (w * 0.65) / 12;
      const ch = (h * 0.5) / 3;
      const y0 = h * 0.22;
      const reds = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
      g.font = `800 ${Math.floor(ch * 0.5)}px ${FONT}`;
      for (let c = 0; c < 12; c++) {
        for (let r = 0; r < 3; r++) {
          const n = c * 3 + (3 - r);
          g.fillStyle = reds.has(n) ? '#b3122e' : '#141414';
          g.fillRect(x0 + c * cw + 1, y0 + r * ch + 1, cw - 2, ch - 2);
          g.fillStyle = '#fff';
          g.fillText(String(n), x0 + c * cw + cw / 2, y0 + r * ch + ch / 2);
        }
      }
      g.fillStyle = '#157a3c';
      g.fillRect(x0 - cw, y0 + 1, cw - 2, ch * 3 - 2);
      g.fillStyle = '#fff';
      g.fillText('0', x0 - cw / 2, y0 + (ch * 3) / 2);
      g.font = `800 ${Math.floor(h * 0.08)}px ${FONT}`;
      g.fillStyle = 'rgba(255,235,180,0.9)';
      for (const [i, label] of ['1st 12', '2nd 12', '3rd 12'].entries()) g.fillText(label, x0 + (i + 0.5) * cw * 4, y0 + ch * 3 + h * 0.08);
      return;
    }
    g.font = `900 ${Math.floor(h * 0.14)}px ${FONT}`;
    g.fillText(kind === 'blackjack' ? 'BLACKJACK PAYS 3 TO 2' : 'TEXAS HOLD’EM', w / 2, h * 0.55);
    g.font = `700 ${Math.floor(h * 0.07)}px ${FONT}`;
    g.fillText(kind === 'blackjack' ? 'Dealer stands on all 17s' : 'No limit · play chips only', w / 2, h * 0.72);
  });
}

/** The roulette wheel's face: 37 pockets, red and black round a green zero. */
function wheelTexture(): THREE.CanvasTexture {
  return canvasTexture(256, 256, (g) => {
    const order = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
    const reds = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
    const c = 128;
    const a = (Math.PI * 2) / order.length;
    order.forEach((n, i) => {
      g.beginPath();
      g.moveTo(c, c);
      g.arc(c, c, 126, i * a, (i + 1) * a);
      g.closePath();
      g.fillStyle = n === 0 ? '#157a3c' : reds.has(n) ? '#b3122e' : '#141414';
      g.fill();
    });
    g.fillStyle = '#6b3e1f';
    g.beginPath();
    g.arc(c, c, 70, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#d4a24c';
    g.beginPath();
    g.arc(c, c, 22, 0, Math.PI * 2);
    g.fill();
  });
}

interface MachineView {
  def: CasinoTableDef;
  reels: Reels;
  canvas: HTMLCanvasElement;
  tex: THREE.CanvasTexture;
  topper: THREE.MeshBasicMaterial;
  state: SlotsView | null;
  /** When it last won, for the topper to flash. */
  wonAt: number;
  dirty: boolean;
}

export function buildCasinoInterior(): CasinoInterior {
  const group = new THREE.Group();
  const colliders: Collider[] = [];
  const interactables: Interactable[] = [];
  const parts = new THREE.Group();
  const wine = toon('#5a1427');
  const gold = toon('#d4a24c');
  const wood = toon('#5b3420');
  const black = toon('#1d1418');

  // The carpet, with its floor under it.
  const carpet = carpetTexture();
  carpet.repeat.set(W / 2.2, D / 2.2);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshToonMaterial({ map: carpet, gradientMap: (toon('#fff') as THREE.MeshToonMaterial).gradientMap }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(CX, 0, CZ);
  floor.receiveShadow = true;
  group.add(floor);
  colliders.push({ minX: R.minX - T, maxX: R.maxX + T, minZ: R.minZ - T, maxZ: R.maxZ + T, bottom: -1, top: 0 });

  // Walls: burgundy over dark wood panelling, a gold rail between; and the ceiling over it all.
  const H = R.height;
  const walls: [number, number, number, number][] = [
    [R.minX - T, R.maxX + T, R.minZ - T, R.minZ],
    [R.minX - T, R.maxX + T, R.maxZ, R.maxZ + T],
    [R.minX - T, R.minX, R.minZ, R.maxZ],
    [R.maxX, R.maxX + T, R.minZ, R.maxZ],
  ];
  for (const [x0, x1, z0, z1] of walls) {
    const w = x1 - x0;
    const d = z1 - z0;
    parts.add(mesh(box(w, H, d), wine, (x0 + x1) / 2, H / 2, (z0 + z1) / 2, false));
    // The panelling and the rail stand a little proud of the wall, on the room's side.
    const inX = x0 === R.minX - T && x1 === R.minX ? 0.04 : x0 === R.maxX ? -0.04 : 0;
    const inZ = z0 === R.minZ - T ? 0.04 : z0 === R.maxZ ? -0.04 : 0;
    parts.add(mesh(box(w + Math.abs(inX) * 2, 1.2, d + Math.abs(inZ) * 2), wood, (x0 + x1) / 2 + inX, 0.6, (z0 + z1) / 2 + inZ, false));
    parts.add(mesh(box(w + Math.abs(inX) * 3, 0.1, d + Math.abs(inZ) * 3), gold, (x0 + x1) / 2 + inX, 1.25, (z0 + z1) / 2 + inZ, false));
    parts.add(mesh(box(w + Math.abs(inX) * 3, 0.14, d + Math.abs(inZ) * 3), gold, (x0 + x1) / 2 + inX, H - 0.3, (z0 + z1) / 2 + inZ, false));
    colliders.push({ minX: x0, maxX: x1, minZ: z0, maxZ: z1, bottom: 0, top: H });
  }
  const ceiling = mesh(new THREE.PlaneGeometry(W + 2 * T, D + 2 * T), toon('#2a0a16'), CX, H, CZ, false);
  ceiling.rotation.x = Math.PI / 2;
  group.add(ceiling);
  // So the camera stays under it.
  colliders.push({ minX: R.minX - T, maxX: R.maxX + T, minZ: R.minZ - T, maxZ: R.maxZ + T, bottom: H, top: H + 0.3 });
  // Gold coffers across the ceiling.
  for (let x = R.minX + 3; x < R.maxX; x += 4) parts.add(mesh(box(0.12, 0.12, D), gold, x, H - 0.06, CZ, false));
  for (let z = R.minZ + 3; z < R.maxZ; z += 4) parts.add(mesh(box(W, 0.12, 0.12), gold, CX, H - 0.06, z, false));

  // Neon round the room, up by the ceiling: pink along the long walls, teal along the short ones.
  const pink = glow(null, '#ff4fa3');
  const teal = glow(null, '#35e0d0');
  for (const z of [R.minZ + 0.06, R.maxZ - 0.06]) group.add(mesh(box(W - 0.4, 0.07, 0.07), teal, CX, H - 0.55, z, false));
  for (const x of [R.minX + 0.06, R.maxX - 0.06]) group.add(mesh(box(0.07, 0.07, D - 0.4), pink, x, H - 0.55, CZ, false));

  // Sconces along the walls: a gold plate and a warm glowing shade, every few meters.
  const shade = glow(null, '#ffd9a0');
  const sconces = new THREE.Group();
  const sconce = (x: number, z: number, nx: number, nz: number) => {
    sconces.add(mesh(box(0.3, 0.42, 0.3).scale(Math.abs(nz) ? 1 : 0.15, 1, Math.abs(nx) ? 1 : 0.15), gold, x, 2.6, z, false));
    sconces.add(mesh(new THREE.SphereGeometry(0.16, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI), shade, x + nx * 0.18, 2.72, z + nz * 0.18, false));
  };
  for (let x = R.minX + 4; x < R.maxX - 1; x += 4.5) {
    if (Math.abs(x - CASINO_DOOR.x) > 2) sconce(x, R.minZ + 0.02, 0, 1);
    sconce(x, R.maxZ - 0.02, 0, -1);
  }
  for (let z = R.minZ + 3.5; z < R.maxZ - 1; z += 4.5) if (Math.abs(z - CASHIER.z) > 4) sconce(R.maxX - 0.02, z, -1, 0);
  group.add(mergeByMaterial(sconces));

  // Chandeliers over the big tables and the middle of the room: a gold ring hung with glowing crystals.
  const crystal = glow(null, '#fff4d6');
  const crystals = new THREE.Group();
  // (between the tables, clear of the signs hung over them)
  for (const [x, z] of [
    [-37, 47.8],
    [-28.5, 46],
    [CASINO_DOOR.x, 40],
    [-41, 40.5],
  ]) {
    parts.add(mesh(new THREE.TorusGeometry(0.75, 0.05, 8, 28).rotateX(Math.PI / 2), gold, x, H - 1.2, z, false));
    parts.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.1, 6), gold, x, H - 0.6, z, false));
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      crystals.add(mesh(new THREE.OctahedronGeometry(0.09), crystal, x + Math.cos(a) * 0.75, H - 1.38, z + Math.sin(a) * 0.75, false));
    }
    crystals.add(mesh(new THREE.SphereGeometry(0.2, 12, 10), crystal, x, H - 1.3, z, false));
  }
  group.add(mergeByMaterial(crystals));

  // A sign hung under the ceiling, readable from both sides.
  const hangSign = (text: string, color: string, x: number, z: number, rotY: number, w = 3) => {
    const mat = glow(neonSign(text, color, 768, 192));
    for (const s of [0, Math.PI]) {
      const p = mesh(new THREE.PlaneGeometry(w, w / 4), mat, x, H - 1.05, z, false);
      p.rotation.y = rotY + s;
      p.position.x += Math.sin(rotY + s) * 0.03;
      p.position.z += Math.cos(rotY + s) * 0.03;
      group.add(p);
    }
    parts.add(mesh(box(Math.abs(Math.cos(rotY)) * w + 0.05, w / 4 + 0.08, Math.abs(Math.sin(rotY)) * w + 0.05), black, x, H - 1.05, z, false));
    for (const s of [-1, 1]) parts.add(mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.7, 4), gold, x + Math.cos(rotY) * s * w * 0.4, H - 0.45, z - Math.sin(rotY) * s * w * 0.4, false));
  };

  // ---- The tables -----------------------------------------------------------------------------------
  const tableMesh = (def: CasinoTableDef, felt: THREE.Mesh, rim: THREE.Object3D, footprint: { w: number; d: number }) => {
    const it: Interactable = { kind: 'casino-table', table: def.id, x: def.x, z: def.z, y: 0, radius: Math.max(footprint.w, footprint.d) / 2 + 1.3 };
    felt.userData.interact = it;
    rim.userData.interact = it;
    interactables.push(it);
    colliders.push({ minX: def.x - footprint.w / 2, maxX: def.x + footprint.w / 2, minZ: def.z - footprint.d / 2, maxZ: def.z + footprint.d / 2, bottom: 0, top: 0.95 });
  };
  const stool = (x: number, z: number) => {
    parts.add(mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.1, 14), toon('#8e1b2f'), x, 0.72, z));
    parts.add(mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.68, 8), gold, x, 0.36, z));
    parts.add(mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.04, 14), gold, x, 0.02, z));
  };
  const legs = (x: number, z: number, w: number, d: number) => {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.add(mesh(box(0.12, 0.8, 0.12), wood, x + sx * (w / 2 - 0.3), 0.4, z + sz * (d / 2 - 0.3)));
  };
  let wheel: THREE.Mesh | null = null;
  // The roulette ball, and where the wheel's hub is (the ball runs round it).
  let ball: THREE.Mesh | null = null;
  const hub = { x: 0, y: 0, z: 0, r: 0.5 };
  const rouletteClock = new WheelClock();
  for (const def of CASINO_TABLES) {
    if (def.kind === 'roulette') {
      const w = 3.6;
      const d = 1.7;
      const felt = mesh(new THREE.PlaneGeometry(w - 0.2, d - 0.2), new THREE.MeshToonMaterial({ map: feltTexture('roulette', '#12663a') }), def.x, 0.93, def.z, false);
      felt.rotation.x = -Math.PI / 2;
      group.add(felt);
      const rim = mesh(box(w, 0.1, d), wood, def.x, 0.87, def.z);
      group.add(rim);
      legs(def.x, def.z, w, d);
      // The wheel, in its wooden bowl at the west end.
      const wx = def.x - w / 2 + 0.75;
      parts.add(mesh(new THREE.CylinderGeometry(0.62, 0.55, 0.16, 32), wood, wx, 0.99, def.z));
      wheel = mesh(new THREE.CircleGeometry(0.5, 37), new THREE.MeshToonMaterial({ map: wheelTexture() }), wx, 1.075, def.z, false);
      wheel.rotation.x = -Math.PI / 2;
      group.add(wheel);
      ball = mesh(new THREE.SphereGeometry(0.035, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffffff' }), wx, 1.11, def.z, false);
      ball.visible = false;
      group.add(ball);
      Object.assign(hub, { x: wx, y: 1.075 + 0.035, z: def.z });
      parts.add(mesh(new THREE.ConeGeometry(0.08, 0.2, 8), gold, wx, 1.17, def.z, false));
      tableMesh(def, felt, rim, { w, d });
      for (let i = 0; i < 3; i++) for (const s of [-1, 1]) stool(def.x - 0.6 + i * 0.9, def.z + s * (d / 2 + 0.55));
      hangSign('ROULETTE', '#ff3b5c', def.x, def.z, 0);
    } else if (def.kind === 'poker') {
      const w = 3.4;
      const d = 1.9;
      const top = new THREE.CylinderGeometry(1, 1, 0.06, 40);
      top.scale(w / 2 - 0.12, 1, d / 2 - 0.12);
      const felt = mesh(top, new THREE.MeshToonMaterial({ color: '#1b5f8a' }), def.x, 0.92, def.z, false);
      group.add(felt);
      const rimGeo = new THREE.TorusGeometry(1, 0.08, 8, 40).rotateX(Math.PI / 2);
      rimGeo.scale(w / 2 - 0.06, 1, d / 2 - 0.06);
      const rim = mesh(rimGeo, black, def.x, 0.93, def.z);
      group.add(rim);
      parts.add(mesh(new THREE.CylinderGeometry(0.4, 0.55, 0.88, 16), wood, def.x, 0.44, def.z));
      const label = mesh(new THREE.PlaneGeometry(1.6, 0.8), new THREE.MeshToonMaterial({ map: feltTexture('poker', '#1b5f8a', 512, 256), transparent: false }), def.x, 0.955, def.z, false);
      label.rotation.x = -Math.PI / 2;
      group.add(label);
      tableMesh(def, felt, rim, { w: w - 0.2, d: d - 0.2 });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
        stool(def.x + Math.cos(a) * (w / 2 + 0.45), def.z + Math.sin(a) * (d / 2 + 0.45));
      }
      hangSign('POKER', '#35e0d0', def.x, def.z, 0);
    } else if (def.kind === 'blackjack') {
      // A half moon: the dealer on its straight east edge, the players round its curve to the west.
      const r = 1.5;
      const top = new THREE.CylinderGeometry(r, r, 0.08, 32, 1, false, Math.PI, Math.PI);
      const felt = mesh(top, new THREE.MeshToonMaterial({ color: '#12663a' }), def.x + 0.45, 0.92, def.z, false);
      group.add(felt);
      const rim = mesh(new THREE.TorusGeometry(r, 0.07, 8, 32, Math.PI).rotateX(Math.PI / 2).rotateY(-Math.PI / 2), black, def.x + 0.45, 0.94, def.z);
      group.add(rim);
      parts.add(mesh(box(0.3, 0.1, 2 * r), wood, def.x + 0.45 + 0.1, 0.92, def.z));
      parts.add(mesh(new THREE.CylinderGeometry(0.35, 0.5, 0.88, 16), wood, def.x, 0.44, def.z));
      const label = mesh(new THREE.PlaneGeometry(1.3, 0.65), new THREE.MeshToonMaterial({ map: feltTexture('blackjack', '#12663a') }), def.x - 0.35, 0.965, def.z, false);
      label.rotation.set(-Math.PI / 2, 0, -Math.PI / 2);
      group.add(label);
      // The dealer's chip rack, and a shoe.
      parts.add(mesh(box(0.25, 0.08, 0.7), black, def.x + 0.35, 1.0, def.z));
      parts.add(mesh(box(0.3, 0.16, 0.2), toon('#7a2236'), def.x + 0.3, 1.02, def.z - 0.8));
      tableMesh(def, felt, rim, { w: 1.9, d: 2 * r });
      for (let i = 0; i < 5; i++) {
        const a = Math.PI / 2 + ((i + 0.5) / 5) * Math.PI;
        stool(def.x + 0.45 + Math.cos(a) * (r + 0.5), def.z - Math.sin(a) * (r + 0.5));
      }
      hangSign('BLACKJACK', '#ffd36b', def.x, def.z, 0);
    }
  }

  // ---- The slot machines ---------------------------------------------------------------------------
  const machines = new Map<string, MachineView>();
  const slotDefs = CASINO_TABLES.filter((t) => t.kind === 'slots');
  const bodyMats = [toon('#b3122e'), toon('#1f4e9c'), toon('#6a2c91')];
  for (const [i, def] of slotDefs.entries()) {
    const x = def.x;
    const z = def.z;
    const body = bodyMats[i % bodyMats.length];
    // The cabinet: a base, the body leaning back a little up top, a chrome trim and the topper.
    parts.add(mesh(box(0.9, 0.85, 1.05), black, x, 0.425, z));
    parts.add(mesh(box(0.85, 1.1, 1.0), body, x - 0.03, 1.4, z));
    parts.add(mesh(box(0.35, 0.06, 0.95), gold, x + 0.4, 0.88, z, false));
    parts.add(mesh(box(0.08, 1.1, 1.02), gold, x + 0.4, 1.4, z, false));
    // The lever on its right-hand side (south, as you face it west).
    parts.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.55, 8), toon('#c0c6cf'), x + 0.05, 1.55, z + 0.56, false));
    parts.add(mesh(new THREE.SphereGeometry(0.08, 12, 10), toon('#e63946'), x + 0.05, 1.85, z + 0.56, false));
    const topper = glow(null, '#ffd36b');
    const top = mesh(box(0.7, 0.35, 0.95), topper, x - 0.05, 2.15, z, false);
    group.add(top);
    // The screen: three reels, as the office last said they stood.
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 160;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const screen = mesh(new THREE.PlaneGeometry(0.82, 0.52), glow(tex), x + 0.451, 1.5, z, false);
    screen.rotation.y = Math.PI / 2;
    group.add(screen);
    const it: Interactable = { kind: 'casino-table', table: def.id, x: x + 0.95, z, y: 0, radius: 0.95 };
    interactables.push(it);
    screen.userData.interact = it;
    top.userData.interact = it;
    const m: MachineView = { def, reels: new Reels(), canvas, tex, topper, state: null, wonAt: -10, dirty: true };
    machines.set(def.id, m);
    stool(x + 0.95, z);
  }
  if (slotDefs.length) {
    const z0 = Math.min(...slotDefs.map((d) => d.z)) - 0.55;
    const z1 = Math.max(...slotDefs.map((d) => d.z)) + 0.55;
    colliders.push({ minX: R.minX, maxX: slotDefs[0].x + 0.45, minZ: z0, maxZ: z1, bottom: 0, top: 2.35 });
    hangSign('SLOTS', '#ff4fa3', slotDefs[0].x + 2.2, (z0 + z1) / 2, Math.PI / 2, 3.4);
  }

  // ---- The cashier's counter, on the east wall ---------------------------------------------------
  const c0 = CASHIER.z - CASHIER.length / 2;
  const c1 = CASHIER.z + CASHIER.length / 2;
  const cx = CASHIER.x;
  parts.add(mesh(box(0.9, 1.15, CASHIER.length), wood, cx, 0.575, CASHIER.z));
  parts.add(mesh(box(1.0, 0.07, CASHIER.length + 0.1), gold, cx, 1.18, CASHIER.z, false));
  // A brass grille over it, with windows.
  for (let z = c0; z <= c1 + 0.01; z += 0.35) parts.add(mesh(box(0.03, 1.2, 0.03), gold, cx - 0.3, 1.8, z, false));
  parts.add(mesh(box(0.05, 0.08, CASHIER.length), gold, cx - 0.3, 2.4, CASHIER.z, false));
  // Chip towers on the counter.
  const chipColors = ['#e63946', '#1d3557', '#2a9d8f', '#f4a261', '#ffffff'];
  for (let i = 0; i < 10; i++) {
    const n = 3 + ((i * 7) % 6);
    parts.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.022 * n, 14), toon(chipColors[i % chipColors.length]), cx + 0.15 + (i % 2) * 0.12, 1.22 + 0.011 * n, c0 + 0.5 + i * 0.6, false));
  }
  colliders.push({ minX: cx - 0.45, maxX: R.maxX, minZ: c0, maxZ: c1, bottom: 0, top: 1.2 });
  const cashierSign = mesh(new THREE.PlaneGeometry(3.6, 0.9), glow(neonSign('CASHIER', '#ffd36b', 768, 192)), R.maxX - 0.05, 3.1, CASHIER.z, false);
  cashierSign.rotation.y = -Math.PI / 2;
  group.add(cashierSign);
  const cashier: Interactable = { kind: 'casino-table', table: 'cashier', x: cx - 1.1, z: CASHIER.z, y: 0, radius: 1.6 };
  interactables.push(cashier);
  cashierSign.userData.interact = cashier;

  // ---- The way out --------------------------------------------------------------------------------
  const dx = CASINO_DOOR.x;
  const dw = CASINO_DOOR.width;
  const dh = CASINO_DOOR.height;
  parts.add(mesh(box(dw + 0.5, 0.3, 0.12), gold, dx, dh + 0.15, R.minZ + 0.05, false));
  for (const s of [-1, 1]) parts.add(mesh(box(0.22, dh, 0.12), gold, dx + s * (dw / 2 + 0.11), dh / 2, R.minZ + 0.05, false));
  const doorGlass = mesh(new THREE.PlaneGeometry(dw, dh), glow(canvasTexture(128, 128, (g) => {
    const grd = g.createLinearGradient(0, 0, 0, 128);
    grd.addColorStop(0, '#8fb8d8');
    grd.addColorStop(1, '#3a4a5c');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#d4a24c';
    g.fillRect(62, 0, 4, 128);
  })), dx, dh / 2, R.minZ + 0.02, false);
  group.add(doorGlass);
  const exitSign = textPlane('🚪 EXIT · street', { bg: '#1a0610', color: '#35e0d0', size: 56, border: '#35e0d0' });
  exitSign.position.set(dx, dh + 0.65, R.minZ + 0.06);
  group.add(exitSign);
  const exit: Interactable = { kind: 'casino', x: dx, z: R.minZ + 0.8, y: 0, radius: 1.3 };
  interactables.push(exit);
  doorGlass.userData.interact = exit;
  exitSign.userData.interact = exit;
  // A velvet rope and a big lit sign over the way in.
  const welcome = chaser(4.4, 1.1, 0.3, 0.05);
  welcome.group.position.set(dx, 4.1, R.minZ + 0.12);
  group.add(welcome.group);
  const welcomeSign = mesh(new THREE.PlaneGeometry(4.2, 0.95), glow(neonSign('♠ GOOD LUCK ♦', '#ff3b5c', 768, 192)), dx, 4.1, R.minZ + 0.1, false);
  group.add(welcomeSign);

  // Plants in the corners, and a few pillars' worth of mirrors: cheap and cheerful.
  for (const [x, z] of [
    [R.minX + 0.6, R.minZ + 0.6],
    [R.maxX - 0.6, R.minZ + 0.6],
    [R.maxX - 0.6, R.maxZ - 0.6],
  ]) {
    parts.add(mesh(new THREE.CylinderGeometry(0.3, 0.24, 0.6, 12), gold, x, 0.3, z));
    parts.add(mesh(new THREE.SphereGeometry(0.55, 12, 10), toon('#2f7d4a'), x, 1.05, z));
    colliders.push({ minX: x - 0.35, maxX: x + 0.35, minZ: z - 0.35, maxZ: z + 0.35, bottom: 0, top: 1.5 });
  }

  group.add(mergeByMaterial(parts));

  const setTable = (id: string, state: unknown) => {
    if (state && typeof state === 'object' && (state as RouletteView).kind === 'roulette') {
      rouletteClock.set(state as RouletteView);
      return;
    }
    const m = machines.get(id);
    if (!m || !state || typeof state !== 'object' || (state as SlotsView).kind !== 'slots') return;
    const s = state as SlotsView;
    const was = m.state;
    m.state = s;
    m.dirty = true;
    if (s.spinning && s.spin !== was?.spin) m.reels.spin(s.stops, SPIN_MS, performance.now());
    else if (!s.spinning && !m.reels.spinning) m.reels.snap(s.stops);
    if (s.won && s.spin !== was?.spin) m.wonAt = performance.now() + SPIN_MS;
  };

  let redrawAt = 0;
  const update = (t: number) => {
    welcome.update(t);
    if (wheel) {
      // The wheel turns (rotation.z turns its face the other way: see ui/casino/roulette-wheel.ts), the ball runs and lands on the drawn number.
      const pose = rouletteClock.pose();
      wheel.rotation.z = -pose.wheel;
      if (ball) {
        ball.visible = pose.ball !== null;
        if (pose.ball !== null) {
          const a = pose.wheel + pose.ball;
          const r = hub.r * pose.ballR;
          ball.position.set(hub.x + Math.cos(a) * r, hub.y, hub.z + Math.sin(a) * r);
        }
      }
    }
    const flick = Math.sin(t * 19) > 0.985 ? 0.3 : 1;
    pink.color.setRGB(flick, 0.31 * flick, 0.64 * flick);
    const now = performance.now();
    // The screens redraw at most 30 times a second, and only when they've something new to show.
    const redraw = now >= redrawAt;
    if (redraw) redrawAt = now + 33;
    for (const m of machines.values()) {
      const turning = m.reels.update(now);
      const flashing = now > m.wonAt && now - m.wonAt < 3000;
      m.topper.color.set(flashing ? (Math.floor(now / 150) % 2 ? '#ffffff' : '#ff3b5c') : m.state?.player ? '#ffd36b' : '#b38a3a');
      if (!redraw || (!turning && !m.dirty && !flashing)) continue;
      m.dirty = false;
      drawReels(m.canvas.getContext('2d')!, m.reels, m.canvas.width, m.canvas.height, { dim: !m.state?.player && !turning, win: flashing });
      m.tex.needsUpdate = true;
    }
  };

  return { group, colliders, interactables, pickables: [group], exit, setTable, update: (t) => update(t) };
}
