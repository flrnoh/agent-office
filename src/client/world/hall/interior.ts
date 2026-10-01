import * as THREE from 'three';
import { COURT, COURTS, GALLERY, HALL_DOOR_INSIDE, HALL_ROOM } from '../../../shared/hall';
import { CAFE_CHAIR_OFF, CAFE_COUNTER, CAFE_ORDER, CAFE_TABLES, DOOR_BENCH, GALLERY_PILLARS, GALLERY_SLAB, HALL_STAIRS, HALL_STAND, LOCKERS, RECEPTION, stairStep } from '../../../shared/hall-building';
import { SEATING_BY_ID } from '../../../shared/layout';
import type { Collider, Interactable } from '../types';
import { mergeByMaterial, mesh, textPlane, toon } from '../toon';
import { box, canvasTexture, glow, FONT } from '../casino/parts';
import { padelSign } from './exterior';

/*
 * Inside the padel hall (flrnoh fork, see FORK.md "The padel hall"): a place of its own, like the
 * casino, built the first time anyone goes in (client/hall.ts), in the hall's own coordinates
 * (HALL_ROOM, the floor at y 0). A bright sports hall: a grey sports floor with the two courts'
 * footprints on it (the courts themselves, their glass, fence, net and lights, are the padel game's,
 * drawn on top), windows high up, a steel truss with rows of lights; the entrance down the south end
 * with the reception, lockers and a bench; at the north end a low stand, and over it the gallery with
 * the café, reached by the stairs along the east wall.
 */

export interface HallInterior {
  group: THREE.Group;
  colliders: Collider[];
  interactables: Interactable[];
  pickables: THREE.Object3D[];
  /** The way out (E at the doors). */
  exit: Interactable;
  /** The café's counter (E to order). */
  counter: Interactable;
  update(t: number, dt: number): void;
}

const R = HALL_ROOM;
const W = R.maxX - R.minX;
const D = R.maxZ - R.minZ;
const CX = (R.minX + R.maxX) / 2;
const CZ = (R.minZ + R.maxZ) / 2;
const T = 0.3;
const H = R.height;
const GY = GALLERY.y;

/** Somewhere to sit (a SEATING id with `hall`): E at `obj`, or near it. */
function seatable(obj: THREE.Object3D, seatId: string, radius: number, interactables: Interactable[]) {
  const seat = SEATING_BY_ID.get(seatId)!;
  const it: Interactable = { kind: 'seat', seatId, x: seat.x, y: seat.y, z: seat.z, radius };
  interactables.push(it);
  obj.traverse((o) => (o.userData.interact = it));
}

/** The chalkboard menu behind the counter. */
function menuBoard(): THREE.CanvasTexture {
  return canvasTexture(768, 384, (g) => {
    g.fillStyle = '#23302a';
    g.fillRect(0, 0, 768, 384);
    g.strokeStyle = '#8a6a44';
    g.lineWidth = 18;
    g.strokeRect(9, 9, 750, 366);
    g.fillStyle = '#f4f1e8';
    g.textBaseline = 'middle';
    g.font = `800 40px ${FONT}`;
    g.textAlign = 'center';
    g.fillText('Café Netzroller', 384, 52);
    g.font = `600 24px ${FONT}`;
    g.textAlign = 'left';
    const cols = [
      ['Cappuccino', 'Latte Macchiato', 'Espresso', 'Chai Latte', 'Iced Coffee', 'Apfelschorle'],
      ['Iso drink', 'Weißbier (alk.frei)', 'Käsekuchen', 'Apfelstrudel', 'Brezn', 'Bananenbrot'],
    ];
    cols.forEach((col, c) =>
      col.forEach((name, i) => {
        g.fillStyle = i % 2 ? '#ffd6a5' : '#f4f1e8';
        g.fillText(`· ${name}`, 50 + c * 360, 118 + i * 42);
      }),
    );
    g.fillStyle = '#c6ff3d';
    g.font = `700 22px ${FONT}`;
    g.textAlign = 'center';
    g.fillText('all on the house ♥', 384, 358);
  });
}

/** The sports floor: dark grey rubber, faint sweep marks. */
function floorTexture(): THREE.CanvasTexture {
  const t = canvasTexture(256, 256, (g) => {
    g.fillStyle = '#4b5361';
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 90; i++) {
      g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${0.02 + Math.random() * 0.03})`;
      g.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 3, 1 + Math.random() * 3);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** The sky through the windows high up. */
function skyTexture(): THREE.CanvasTexture {
  return canvasTexture(64, 64, (g) => {
    const grd = g.createLinearGradient(0, 0, 0, 64);
    grd.addColorStop(0, '#9fcbef');
    grd.addColorStop(1, '#e3f1fb');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
  });
}

export function buildHallInterior(): HallInterior {
  const group = new THREE.Group();
  const colliders: Collider[] = [];
  const interactables: Interactable[] = [];
  const parts = new THREE.Group();
  const gradientMap = (toon('#fff') as THREE.MeshToonMaterial).gradientMap;
  const wallMat = toon('#e3e7ec');
  const kick = toon('#56606e');
  const steel = toon('#aab2bd');
  const darkSteel = toon('#3b424d');
  const oak = toon('#c49262');
  const oakDark = toon('#8a5f3a');

  // ---- Floor, walls, ceiling ------------------------------------------------------------------
  const ft = floorTexture();
  ft.repeat.set(W / 4, D / 4);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshToonMaterial({ map: ft, gradientMap }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(CX, 0, CZ);
  floor.receiveShadow = true;
  group.add(floor);
  colliders.push({ minX: R.minX - T, maxX: R.maxX + T, minZ: R.minZ - T, maxZ: R.maxZ + T, bottom: -1, top: 0 });
  // The courts' own blue under them (the padel game draws its lines, glass and nets on top).
  const courtBlue = toon('#2d6cb5');
  for (const c of COURTS) {
    const f = mesh(new THREE.PlaneGeometry(COURT.width, COURT.length), courtBlue, c.x, 0.003, c.z, false);
    f.rotation.x = -Math.PI / 2;
    f.receiveShadow = true;
    group.add(f);
  }

  const walls: [number, number, number, number][] = [
    [R.minX - T, R.maxX + T, R.minZ - T, R.minZ],
    [R.minX - T, R.maxX + T, R.maxZ, R.maxZ + T],
    [R.minX - T, R.minX, R.minZ, R.maxZ],
    [R.maxX, R.maxX + T, R.minZ, R.maxZ],
  ];
  for (const [x0, x1, z0, z1] of walls) {
    parts.add(mesh(box(x1 - x0, H, z1 - z0), wallMat, (x0 + x1) / 2, H / 2, (z0 + z1) / 2, false));
    const inX = x0 === R.minX - T && x1 === R.minX ? 0.03 : x0 === R.maxX ? -0.03 : 0;
    const inZ = z0 === R.minZ - T ? 0.03 : z0 === R.maxZ ? -0.03 : 0;
    // (the south wall's stops either side of the doors)
    const spans: [number, number][] = z0 === R.maxZ ? [[x0, HALL_DOOR_INSIDE.x - HALL_DOOR_INSIDE.width / 2 - 0.2], [HALL_DOOR_INSIDE.x + HALL_DOOR_INSIDE.width / 2 + 0.2, x1]] : [[x0, x1]];
    for (const [a, b] of spans) parts.add(mesh(box(b - a + Math.abs(inX) * 2, 1.1, z1 - z0 + Math.abs(inZ) * 2), kick, (a + b) / 2 + inX, 0.55, (z0 + z1) / 2 + inZ, false));
    colliders.push({ minX: x0, maxX: x1, minZ: z0, maxZ: z1, bottom: 0, top: H });
  }
  const ceiling = mesh(new THREE.PlaneGeometry(W + 2 * T, D + 2 * T), toon('#4a515c'), CX, H, CZ, false);
  ceiling.rotation.x = Math.PI / 2;
  group.add(ceiling);
  colliders.push({ minX: R.minX - T, maxX: R.maxX + T, minZ: R.minZ - T, maxZ: R.maxZ + T, bottom: H, top: H + 0.3 });

  // Windows high up along both long walls: daylight, behind slim frames.
  const skyMat = glow(skyTexture(), '#ffffff');
  for (const s of [-1, 1]) {
    const x = s < 0 ? R.minX + 0.02 : R.maxX - 0.02;
    for (let z = R.minZ + 2.2; z < R.maxZ - 2; z += 4.2) {
      const pane = mesh(new THREE.PlaneGeometry(3.4, 1.6), skyMat, x, 7, z + 1.7, false);
      pane.rotation.y = s < 0 ? Math.PI / 2 : -Math.PI / 2;
      group.add(pane);
      parts.add(mesh(box(0.08, 0.1, 3.6), darkSteel, x - s * 0.02, 6.15, z + 1.7, false));
      parts.add(mesh(box(0.08, 0.1, 3.6), darkSteel, x - s * 0.02, 7.85, z + 1.7, false));
      parts.add(mesh(box(0.08, 1.8, 0.08), darkSteel, x - s * 0.02, 7, z + 1.7, false));
    }
  }

  // ---- The truss under the roof, and its rows of lights -----------------------------------------
  const lamp = glow(null, '#fffaf0');
  const lamps = new THREE.Group();
  for (let z = R.minZ + 2; z <= R.maxZ - 1.9; z += 4) {
    parts.add(mesh(box(W, 0.14, 0.14), darkSteel, CX, 8.7, z, false));
    parts.add(mesh(box(W, 0.14, 0.14), darkSteel, CX, 9.7, z, false));
    for (let x = R.minX + 1; x < R.maxX; x += 2) {
      const d = mesh(box(0.06, 1.3, 0.06), darkSteel, x + 0.5, 9.2, z, false);
      d.rotation.z = (Math.floor(x) % 4 === 0 ? 1 : -1) * 0.75;
      parts.add(d);
    }
    for (const x of [-12, -7, -2, 2, 7, 12]) {
      parts.add(mesh(box(1.8, 0.12, 0.5), darkSteel, x, 8.5, z, false));
      lamps.add(mesh(box(1.6, 0.04, 0.36), lamp, x, 8.43, z, false));
    }
  }
  for (const x of [R.minX + 0.2, R.maxX - 0.2]) parts.add(mesh(box(0.2, 0.2, D), darkSteel, x, 8.7, CZ, false));
  group.add(mergeByMaterial(lamps));

  // Banners high on the south wall, over the doors: PADEL, and the hall's colors.
  const banner = mesh(new THREE.PlaneGeometry(10, 2.5), glow(padelSign(1024, 256, '#2f3540')), 0, 6.2, R.maxZ - 0.04, false);
  banner.rotation.y = Math.PI;
  group.add(banner);

  // ---- The gallery: its floor over the north end, pillars under the edge, a glass railing -----------
  const slabMinX = R.minX;
  const slabMaxX = R.maxX;
  parts.add(mesh(box(slabMaxX - slabMinX, GALLERY_SLAB, GALLERY.maxZ - GALLERY.minZ), toon('#8d96a2'), (slabMinX + slabMaxX) / 2, GY - GALLERY_SLAB / 2, (GALLERY.minZ + GALLERY.maxZ) / 2));
  const deck = mesh(new THREE.PlaneGeometry(slabMaxX - slabMinX, GALLERY.maxZ - GALLERY.minZ), oak, (slabMinX + slabMaxX) / 2, GY + 0.005, (GALLERY.minZ + GALLERY.maxZ) / 2, false);
  deck.rotation.x = -Math.PI / 2;
  deck.receiveShadow = true;
  group.add(deck);
  colliders.push({ minX: slabMinX, maxX: slabMaxX, minZ: GALLERY.minZ, maxZ: GALLERY.maxZ, bottom: GY - GALLERY_SLAB, top: GY });
  // The edge beam, and the pillars under it.
  parts.add(mesh(box(W, 0.45, 0.3), darkSteel, CX, GY - 0.45, GALLERY.maxZ - 0.15, false));
  for (const p of GALLERY_PILLARS) {
    parts.add(mesh(box(0.3, GY - 0.3, 0.3), darkSteel, p.x, (GY - 0.3) / 2, p.z));
    colliders.push({ minX: p.x - 0.15, maxX: p.x + 0.15, minZ: p.z - 0.15, maxZ: p.z + 0.15, bottom: 0, top: GY - 0.3 });
  }
  // The railing: glass panels between posts, a steel handrail on top; open at the top of the stairs.
  const railTo = HALL_STAIRS.minX;
  const railZ = GALLERY.maxZ - 0.06;
  const pane = new THREE.MeshToonMaterial({ color: '#cfe8f5', transparent: true, opacity: 0.28, gradientMap, depthWrite: false, side: THREE.DoubleSide });
  const railGlass = mesh(new THREE.PlaneGeometry(railTo - R.minX, 1), pane, (R.minX + railTo) / 2, GY + 0.55, railZ, false);
  railGlass.renderOrder = 2;
  group.add(railGlass);
  parts.add(mesh(box(railTo - R.minX, 0.06, 0.08), steel, (R.minX + railTo) / 2, GY + 1.08, railZ, false));
  for (let x = R.minX + 0.3; x <= railTo; x += 2) parts.add(mesh(box(0.05, 1.08, 0.05), steel, x, GY + 0.54, railZ, false));
  colliders.push({ minX: R.minX, maxX: railTo, minZ: railZ - 0.06, maxZ: railZ + 0.06, bottom: GY, top: GY + 1.1, fence: true });

  // ---- The stairs up, along the east wall ----------------------------------------------------------
  const tread = toon('#b98a5c');
  for (let i = 1; i <= HALL_STAIRS.steps; i++) {
    const s = stairStep(i);
    parts.add(mesh(box(s.maxX - s.minX, s.top, s.maxZ - s.minZ), toon('#98a1ad'), (s.minX + s.maxX) / 2, s.top / 2, (s.minZ + s.maxZ) / 2, false));
    parts.add(mesh(box(s.maxX - s.minX, 0.05, s.maxZ - s.minZ + 0.02), tread, (s.minX + s.maxX) / 2, s.top - 0.02, (s.minZ + s.maxZ) / 2, false));
    colliders.push({ minX: s.minX, maxX: s.maxX, minZ: s.minZ, maxZ: s.maxZ, top: s.top });
  }
  // A glass balustrade down its open (west) side, a handrail along it.
  {
    const x = HALL_STAIRS.minX - 0.04;
    const len = HALL_STAIRS.footZ - HALL_STAIRS.topZ;
    const rise = GY;
    const tilt = Math.atan2(rise, len);
    const g = mesh(new THREE.PlaneGeometry(Math.hypot(len, rise), 1), pane, x, rise / 2 + 0.55, (HALL_STAIRS.footZ + HALL_STAIRS.topZ) / 2, false);
    g.rotation.set(0, Math.PI / 2, tilt, 'YXZ');
    g.renderOrder = 2;
    group.add(g);
    const rail = mesh(box(0.06, 0.06, Math.hypot(len, rise)), steel, x, rise / 2 + 1.08, (HALL_STAIRS.footZ + HALL_STAIRS.topZ) / 2, false);
    rail.rotation.x = tilt;
    parts.add(rail);
    colliders.push({ minX: x - 0.06, maxX: x + 0.06, minZ: HALL_STAIRS.topZ, maxZ: HALL_STAIRS.footZ, bottom: 0, top: GY + 1.1, fence: true });
  }

  // ---- The stand under the gallery ---------------------------------------------------------------
  const riserMat = toon('#6c7684');
  for (const r of HALL_STAND.risers) {
    parts.add(mesh(box(HALL_STAND.maxX - HALL_STAND.minX, r.top, r.maxZ - r.minZ), riserMat, (HALL_STAND.minX + HALL_STAND.maxX) / 2, r.top / 2, (r.minZ + r.maxZ) / 2, false));
    parts.add(mesh(box(HALL_STAND.maxX - HALL_STAND.minX, 0.04, 0.08), toon('#ffd166'), (HALL_STAND.minX + HALL_STAND.maxX) / 2, r.top - 0.01, r.maxZ - 0.05, false));
    colliders.push({ minX: HALL_STAND.minX, maxX: HALL_STAND.maxX, minZ: r.minZ, maxZ: r.maxZ, top: r.top });
  }
  const seatColors = ['#e63946', '#1d7fbf', '#2a9d8f'];
  HALL_STAND.rows.forEach((row, r) => {
    HALL_STAND.benchXs.forEach((x, b) => {
      const bench = new THREE.Group();
      const len = HALL_STAND.benchLength;
      bench.add(mesh(box(len, 0.07, 0.42), toon(seatColors[r]), 0, 0.44, 0));
      for (const lx of [-len / 2 + 0.3, 0, len / 2 - 0.3]) bench.add(mesh(box(0.08, 0.42, 0.34), darkSteel, lx, 0.21, 0));
      bench.position.set(x, row.y, row.z);
      group.add(bench);
      seatable(bench, `hall-stand-${r + 1}-${b + 1}`, len / 2 + 0.3, interactables);
      colliders.push({ minX: x - len / 2, maxX: x + len / 2, minZ: row.z - 0.2, maxZ: row.z + 0.2, bottom: row.y, top: row.y + 0.47, fence: true });
    });
  });

  // ---- Down by the doors: the way out, reception, lockers, a bench --------------------------------
  const dx = HALL_DOOR_INSIDE.x;
  const dw = HALL_DOOR_INSIDE.width;
  const dh = 2.8;
  parts.add(mesh(box(dw + 0.4, 0.25, 0.12), darkSteel, dx, dh + 0.12, R.maxZ - 0.05, false));
  for (const s of [-1, 1]) parts.add(mesh(box(0.2, dh, 0.12), darkSteel, dx + s * (dw / 2 + 0.1), dh / 2, R.maxZ - 0.05, false));
  const doorGlass = mesh(
    new THREE.PlaneGeometry(dw, dh),
    glow(
      canvasTexture(128, 128, (g) => {
        const grd = g.createLinearGradient(0, 0, 0, 128);
        grd.addColorStop(0, '#b9dcf2');
        grd.addColorStop(1, '#8a9aa8');
        g.fillStyle = grd;
        g.fillRect(0, 0, 128, 128);
        g.fillStyle = '#3b424d';
        g.fillRect(62, 0, 4, 128);
      }),
    ),
    dx,
    dh / 2,
    R.maxZ - 0.02,
    false,
  );
  doorGlass.rotation.y = Math.PI;
  group.add(doorGlass);
  const exitSign = textPlane('🚪 EXIT · street', { bg: '#2f3540', color: '#c6ff3d', size: 56, border: '#c6ff3d' });
  exitSign.position.set(dx, dh + 0.6, R.maxZ - 0.07);
  exitSign.rotation.y = Math.PI;
  group.add(exitSign);
  const exit: Interactable = { kind: 'hall', x: dx, z: HALL_DOOR_INSIDE.z - 0.4, y: 0, radius: 1.4 };
  interactables.push(exit);
  doorGlass.userData.interact = exit;
  exitSign.userData.interact = exit;
  // A doormat.
  const mat = mesh(new THREE.PlaneGeometry(dw + 0.6, 1.4), toon('#2b2d34'), dx, 0.006, R.maxZ - 0.8, false);
  mat.rotation.x = -Math.PI / 2;
  group.add(mat);

  // Reception: a white counter with a lime stripe, a screen and a bowl of balls.
  {
    const { x, z, length, depth } = RECEPTION;
    parts.add(mesh(box(length, 1.05, depth), toon('#f4f6f8'), x, 0.525, z));
    parts.add(mesh(box(length + 0.1, 0.06, depth + 0.15), oak, x, 1.08, z));
    parts.add(mesh(box(length + 0.02, 0.12, depth + 0.02), toon('#b5e61d'), x, 0.8, z, false));
    parts.add(mesh(box(0.5, 0.32, 0.03), darkSteel, x + 0.9, 1.3, z + 0.1));
    parts.add(mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.12, 8), darkSteel, x + 0.9, 1.14, z + 0.1));
    parts.add(mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.1, 12), steel, x - 1, 1.16, z - 0.1));
    for (let i = 0; i < 6; i++) parts.add(mesh(new THREE.SphereGeometry(0.034, 8, 6), toon('#e6ff5c'), x - 1.06 + (i % 3) * 0.06, 1.23 + Math.floor(i / 3) * 0.05, z - 0.12 + (i % 2) * 0.05, false));
    colliders.push({ minX: x - length / 2, maxX: x + length / 2, minZ: z - depth / 2, maxZ: z + depth / 2, bottom: 0, top: 1.1 });
    const hello = textPlane('🎾 Reception', { bg: '#2f3540', color: '#ffffff', size: 44, border: '#c6ff3d' });
    hello.position.set(x, 2.2, z + depth / 2 + 0.02);
    group.add(hello);
  }
  // Lockers along the south wall, west of the doors.
  {
    const { minX, maxX, z, depth, height } = LOCKERS;
    const n = 10;
    const w = (maxX - minX) / n;
    const colors = ['#1d7fbf', '#2a9d8f', '#e9c46a', '#f4a261', '#e76f51'];
    for (let i = 0; i < n; i++) {
      const x = minX + (i + 0.5) * w;
      parts.add(mesh(box(w - 0.03, height, depth), toon(colors[i % colors.length]), x, height / 2, z - depth / 2 + 0.25));
      parts.add(mesh(box(0.04, 0.16, 0.03), steel, x + w * 0.3, height * 0.55, z - depth + 0.24, false));
      for (const y of [0.4, height * 0.5 + 0.2]) parts.add(mesh(box(w * 0.6, 0.03, 0.01), darkSteel, x, y, z - depth + 0.245, false));
    }
    colliders.push({ minX, maxX, minZ: z - depth + 0.25, maxZ: R.maxZ, bottom: 0, top: height });
  }
  // A bench by the doors, to swap shoes on, facing the courts.
  {
    const { x, z, length } = DOOR_BENCH;
    const bench = new THREE.Group();
    bench.add(mesh(box(length, 0.07, 0.42), oak, 0, 0.44, 0));
    bench.add(mesh(box(length, 0.45, 0.06), oak, 0, 0.75, 0.22));
    for (const lx of [-length / 2 + 0.25, length / 2 - 0.25]) bench.add(mesh(box(0.08, 0.42, 0.36), darkSteel, lx, 0.21, 0));
    bench.position.set(x, 0, z);
    group.add(bench);
    seatable(bench, 'hall-bench', length / 2 + 0.3, interactables);
    colliders.push({ minX: x - length / 2, maxX: x + length / 2, minZ: z - 0.22, maxZ: z + 0.25, bottom: 0, top: 0.47, fence: true });
  }
  // Big plants either side of the doors.
  for (const x of [dx - 3, dx + 3]) plant(parts, colliders, x, 0, R.maxZ - 0.7, 1);

  // ---- Up on the gallery: the café ---------------------------------------------------------------
  // The counter: oak front, a light top, the espresso machine, a grinder, the cake display.
  const cc = CAFE_COUNTER;
  // (all of it one thing to look at and press E at: the counter)
  const bar = new THREE.Group();
  const ccx = (cc.minX + cc.maxX) / 2;
  const ccLen = cc.maxX - cc.minX;
  bar.add(mesh(box(ccLen, cc.height, cc.depth), oakDark, ccx, GY + cc.height / 2, cc.z));
  for (let x = cc.minX + 0.35; x < cc.maxX; x += 0.35) bar.add(mesh(box(0.14, cc.height - 0.12, 0.02), oak, x, GY + cc.height / 2, cc.z + cc.depth / 2 + 0.01, false));
  bar.add(mesh(box(ccLen + 0.1, 0.05, cc.depth + 0.12), toon('#f0ede6'), ccx, GY + cc.height + 0.025, cc.z));
  colliders.push({ minX: cc.minX - 0.05, maxX: cc.maxX + 0.05, minZ: R.minZ, maxZ: cc.z + cc.depth / 2, bottom: GY, top: GY + cc.height });
  const top = GY + cc.height + 0.05;
  // The espresso machine: a steel body, a red side, two group heads, a steam wand, cups on top.
  const mx = cc.maxX - 1.3;
  bar.add(mesh(box(0.9, 0.46, 0.5), steel, mx, top + 0.23, cc.z - 0.05));
  bar.add(mesh(box(0.92, 0.3, 0.02), toon('#c1121f'), mx, top + 0.25, cc.z + 0.21, false));
  for (const s of [-1, 1]) {
    bar.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.08, 10), darkSteel, mx + s * 0.22, top + 0.16, cc.z + 0.26, false));
    bar.add(mesh(box(0.03, 0.03, 0.16), darkSteel, mx + s * 0.22, top + 0.16, cc.z + 0.36, false));
    bar.add(mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.06, 10), toon('#fbfaf6'), mx + s * 0.22, top + 0.03, cc.z + 0.24, false));
  }
  bar.add(mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.22, 6), steel, mx + 0.42, top + 0.16, cc.z + 0.26, false));
  for (let i = 0; i < 6; i++) bar.add(mesh(new THREE.CylinderGeometry(0.04, 0.03, 0.06, 10), toon('#fbfaf6'), mx - 0.3 + (i % 3) * 0.12, top + 0.49 + Math.floor(i / 3) * 0.06, cc.z - 0.1, false));
  // The grinder beside it.
  bar.add(mesh(box(0.2, 0.3, 0.26), darkSteel, mx - 0.75, top + 0.15, cc.z - 0.05));
  bar.add(mesh(new THREE.ConeGeometry(0.1, 0.22, 10), toon('#e6e1d6'), mx - 0.75, top + 0.42, cc.z - 0.05, false));
  // The cake display: a glass case, cakes on two tiers.
  const cakeX = cc.minX + 1.3;
  const caseMat = new THREE.MeshToonMaterial({ color: '#e6f4fb', transparent: true, opacity: 0.3, gradientMap, depthWrite: false });
  const cake = mesh(box(1.6, 0.55, 0.55), caseMat, cakeX, top + 0.275, cc.z, false);
  bar.add(cake);
  bar.add(mesh(box(1.6, 0.03, 0.55), steel, cakeX, top + 0.28, cc.z, false));
  for (const [dx2, y, color, r] of [
    [-0.5, 0, '#f4dca0', 0.17],
    [0, 0, '#6b3e26', 0.16],
    [0.5, 0, '#d9a05b', 0.15],
    [-0.35, 0.29, '#f7b2bd', 0.13],
    [0.35, 0.29, '#a86b3c', 0.14],
  ] as const) {
    bar.add(mesh(new THREE.CylinderGeometry(r, r, 0.1, 16), toon(color), cakeX + dx2, top + y + 0.06, cc.z, false));
    bar.add(mesh(new THREE.CylinderGeometry(r + 0.03, r + 0.03, 0.01, 16), toon('#fbfaf6'), cakeX + dx2, top + y + 0.01, cc.z, false));
  }
  // A basket of Brezn, and the till.
  bar.add(mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.12, 12), toon('#b07a4a'), cakeX + 1.35, top + 0.06, cc.z + 0.05, false));
  for (let i = 0; i < 3; i++) {
    const b = mesh(new THREE.TorusGeometry(0.07, 0.022, 6, 12), toon('#9c4f1c'), cakeX + 1.3 + i * 0.05, top + 0.15, cc.z + 0.02 + (i - 1) * 0.06, false);
    b.rotation.x = -1.2;
    bar.add(b);
  }
  bar.add(mesh(box(0.34, 0.2, 0.28), darkSteel, ccx + 0.3, top + 0.1, cc.z));
  // The back wall behind it: a tiled splashback, shelves of cups and jars, the chalkboard menu, the café's sign.
  bar.add(mesh(box(ccLen + 0.4, 1.5, 0.04), toon('#e8dccb'), ccx, GY + 1.1 + 0.75, R.minZ + 0.02, false));
  for (const y of [1.5, 2]) {
    bar.add(mesh(box(ccLen - 0.6, 0.05, 0.3), oak, ccx, GY + y, R.minZ + 0.15, false));
    for (let x = cc.minX + 0.5; x < cc.maxX - 0.4; x += 0.28) bar.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.14, 8), toon(Math.round(x * 3) % 2 ? '#fbfaf6' : '#e9c46a'), x, GY + y + 0.1, R.minZ + 0.15, false));
  }
  const board = mesh(new THREE.PlaneGeometry(3.2, 1.6), new THREE.MeshToonMaterial({ map: menuBoard(), gradientMap }), cc.minX + 1.9, GY + 3.1, R.minZ + 0.03, false);
  group.add(board);
  const cafeSign = mesh(new THREE.PlaneGeometry(4.4, 1), glow(canvasTexture(640, 144, (g) => {
    g.fillStyle = '#2b1d14';
    g.fillRect(0, 0, 640, 144);
    g.shadowColor = '#ffb347';
    g.shadowBlur = 24;
    g.fillStyle = '#ffd6a5';
    g.font = `italic 800 76px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('☕ Café Netzroller', 320, 76);
  })), cc.maxX - 1.6, GY + 3.2, R.minZ + 0.03, false);
  group.add(cafeSign);
  const counter: Interactable = { kind: 'cafe', x: CAFE_ORDER.x, z: cc.z + 0.7, y: GY, radius: 2.6 };
  interactables.push(counter);
  cafeSign.userData.interact = counter;
  const barMerged = mergeByMaterial(bar);
  barMerged.traverse((o) => (o.userData.interact = counter));
  group.add(barMerged);
  board.userData.interact = counter;

  // Warm pendant lights over the counter and the tables, hanging from the truss.
  const warm = glow(null, '#ffc56b');
  const pendants = new THREE.Group();
  // (the cables are hairlines: no outline round them)
  const cable = new THREE.MeshBasicMaterial({ color: '#2f3540' });
  cable.userData.outlineParameters = { visible: false };
  const pendant = (x: number, z: number, low: number) => {
    pendants.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 8.6 - low, 4), cable, x, (8.6 + low) / 2, z, false));
    pendants.add(mesh(new THREE.ConeGeometry(0.2, 0.22, 14, 1, true), toon('#2f3540'), x, low + 0.11, z, false));
    pendants.add(mesh(new THREE.SphereGeometry(0.08, 10, 8), warm, x, low + 0.02, z, false));
  };
  for (let x = cc.minX + 0.8; x < cc.maxX; x += 1.8) pendant(x, cc.z + 0.1, GY + 2.3);
  for (const t of CAFE_TABLES) pendant(t.x, t.z, GY + 2.1);
  group.add(mergeByMaterial(pendants));

  // The tables: little round ones, two bistro chairs at each.
  CAFE_TABLES.forEach((t, i) => {
    parts.add(mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.04, 18), toon('#f0ede6'), t.x, GY + 0.75, t.z));
    parts.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.72, 8), darkSteel, t.x, GY + 0.37, t.z));
    parts.add(mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.03, 12), darkSteel, t.x, GY + 0.015, t.z));
    parts.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.12, 8), toon('#8ecae6'), t.x + 0.1, GY + 0.83, t.z - 0.1, false));
    colliders.push({ minX: t.x - 0.4, maxX: t.x + 0.4, minZ: t.z - 0.4, maxZ: t.z + 0.4, bottom: GY, top: GY + 0.77, fence: true });
    for (const s of [-1, 1]) {
      const chair = bistroChair();
      chair.position.set(t.x + s * CAFE_CHAIR_OFF, GY, t.z);
      chair.rotation.y = s < 0 ? Math.PI / 2 : -Math.PI / 2;
      group.add(chair);
      seatable(chair, `cafe-chair-${i + 1}-${s < 0 ? 'w' : 'e'}`, 0.9, interactables);
    }
  });
  // Plants round the café.
  for (const [x, z] of [
    [R.minX + 0.6, GALLERY.maxZ - 0.7],
    [R.minX + 0.6, R.minZ + 0.6],
    [cc.maxX + 0.8, R.minZ + 0.6],
    [HALL_STAIRS.minX - 1.1, R.minZ + 0.6],
  ]) plant(parts, colliders, x, GY, z, 1.1);

  group.add(mergeByMaterial(parts));

  const update = (t: number) => {
    // The lamps over the café breathe a little, like candles.
    warm.color.setRGB(1, 0.77 + Math.sin(t * 1.3) * 0.02, 0.42);
  };

  return { group, colliders, interactables, pickables: [group], exit, counter, update: (t) => update(t) };
}

/** A pot and a leafy plant, standing on `y`. */
function plant(parts: THREE.Group, colliders: Collider[], x: number, y: number, z: number, s: number) {
  parts.add(mesh(new THREE.CylinderGeometry(0.3 * s, 0.24 * s, 0.55 * s, 12), toon('#f0ede6'), x, y + 0.275 * s, z));
  parts.add(mesh(new THREE.SphereGeometry(0.5 * s, 12, 10), toon('#2f7d4a'), x, y + 0.95 * s, z));
  parts.add(mesh(new THREE.SphereGeometry(0.35 * s, 10, 8), toon('#4caf6a'), x + 0.2 * s, y + 1.3 * s, z - 0.1 * s));
  colliders.push({ minX: x - 0.33 * s, maxX: x + 0.33 * s, minZ: z - 0.33 * s, maxZ: z + 0.33 * s, bottom: y, top: y + 1.4 * s });
}

/** A bistro chair: a round seat, a curved back, thin black legs. Faces +z. */
function bistroChair(): THREE.Group {
  const g = new THREE.Group();
  const black = toon('#23262c');
  g.add(mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.05, 16), toon('#c49262'), 0, 0.47, 0));
  for (const [x, z] of [
    [-0.14, -0.14],
    [0.14, -0.14],
    [-0.14, 0.14],
    [0.14, 0.14],
  ])
    g.add(mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.46, 6), black, x, 0.23, z));
  const back = mesh(new THREE.TorusGeometry(0.2, 0.02, 6, 14, Math.PI), black, 0, 0.72, -0.17);
  g.add(back);
  for (const x of [-0.2, 0.2]) g.add(mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.26, 6), black, x, 0.6, -0.17));
  return g;
}
