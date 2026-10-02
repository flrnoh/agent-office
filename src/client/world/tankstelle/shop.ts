import * as THREE from 'three';
import { mulberry32 } from '../../../shared/rng';
import { BACK_COUNTER, BRAND, COFFEE_MACHINE, COUNTER, FRIDGES, SHELVES, SHOP, SHOP_DOOR, TILL_WALL } from '../../../shared/tankstelle';
import type { Door } from '../office/shell';
import { bulb, type NightParts } from '../outside';
import { mergeByMaterial, mesh, toon } from '../toon';
import { Flats, flat } from '../town/kit';
import { FONT, G, INK, STEEL, TEAL, TEAL_DARK, WHITE, YELLOW, block, drawLogo, signPlane } from './kit';

// flrnoh fork (see FORK.md "The petrol station"): the shop: a glass front toward the pumps with an
// automatic sliding door (it opens for anyone who comes up to it, like the office's own doors), the
// brand over it, and inside shelves of snacks, drinks fridges along the back wall, the counter with
// the till, and the coffee machine behind it. The cashier is the feature's (features/tankstelle/shop.ts).

/** How high the ceiling is inside (the fascia hides the rest of the front). */
const CEIL = 3.05;
const GOODS = ['#e63946', '#ffd166', '#06d6a0', '#118ab2', '#f4a261', '#9b5de5', '#ef476f', '#2a9d8f', '#fefae0', '#bc6c25'];

const glassMat = () => {
  const m = new THREE.MeshToonMaterial({ color: '#cfe9f2', transparent: true, opacity: 0.32, depthWrite: false, gradientMap: (toon('#fff') as THREE.MeshToonMaterial).gradientMap });
  m.userData.outlineParameters = { visible: false };
  return m;
};

/** Shelves of goods: boxes and bottles in rows, `levels` shelves up, along x from x0 to x1 at z, facing `face` (+1 south). */
function goods(g: THREE.Group, r: () => number, x0: number, x1: number, z: number, face: number, levels: number, y0: number, dy: number) {
  for (let l = 0; l < levels; l++) {
    let x = x0 + 0.05;
    while (x < x1 - 0.12) {
      const w = 0.1 + r() * 0.16;
      const h = 0.14 + r() * 0.22;
      const c = GOODS[Math.floor(r() * GOODS.length)];
      g.add(mesh(new THREE.BoxGeometry(w, h, 0.18), toon(c), x + w / 2, G + y0 + l * dy + h / 2, z + face * 0.02, false));
      x += w + 0.02;
    }
  }
}

/** The shop, built into `group` (with its solid parts merged); hands back its door, for the office to slide open. */
export function buildShop(group: THREE.Group, night: NightParts): Door {
  const S = SHOP;
  const t = S.wall;
  const solid = new THREE.Group();
  const wall = toon('#f2efe6');
  const base = toon(TEAL_DARK);
  const cx = (S.minX + S.maxX) / 2;
  const cz = (S.minZ + S.maxZ) / 2;
  const w = S.maxX - S.minX;
  const d = S.maxZ - S.minZ;
  // The floor, tiled.
  const tiles = new Flats();
  tiles.add(S.minX + t, S.maxX - t, S.minZ + t, S.maxZ, G + 0.02);
  const tileTex = new THREE.CanvasTexture(
    (() => {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const g = c.getContext('2d')!;
      g.fillStyle = '#e4e1da';
      g.fillRect(0, 0, 64, 64);
      g.strokeStyle = '#c9c4b8';
      g.lineWidth = 2;
      g.strokeRect(0, 0, 64, 64);
      return c;
    })(),
  );
  tileTex.wrapS = tileTex.wrapT = THREE.RepeatWrapping;
  tileTex.repeat.set(w / 0.8, d / 0.8);
  tileTex.colorSpace = THREE.SRGBColorSpace;
  const floor = tiles.mesh(flat('#ffffff', 4, tileTex));
  floor.geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 0], 2));
  group.add(floor);
  // The back and the sides, a teal band along their foot, up to the roof.
  block(solid, w, S.h, t, wall, cx, S.minZ + t / 2);
  block(solid, t, S.h, d, wall, S.minX + t / 2, cz);
  block(solid, t, S.h, d, wall, S.maxX - t / 2, cz);
  for (const [bw, bd, bx, bz] of [
    [w + 0.04, t + 0.04, cx, S.minZ + t / 2],
    [t + 0.04, d + 0.04, S.minX + t / 2, cz],
    [t + 0.04, d + 0.04, S.maxX - t / 2, cz],
  ])
    block(solid, bw, 0.5, bd, base, bx, bz, 0);
  // The roof, out over the front a little, and the ceiling inside.
  block(solid, w + 0.4, 0.3, d + 1.6, toon('#d9d6cf'), cx, cz + 0.6, S.h);
  block(solid, w - 2 * t, 0.06, d - t, toon(WHITE), cx, cz + t / 2, CEIL);
  // The front: a fascia over the glass with the brand, posts between the panes, glass either side of the door.
  // The fascia stands a centimeter proud of the side walls' ends and faces, so it doesn't flicker into them.
  block(solid, w + 0.01, S.h - CEIL, t + 0.01, toon(TEAL), cx, S.maxZ - t / 2 + 0.005, CEIL);
  block(solid, w + 0.02, 0.16, t + 0.04, bulb(night, YELLOW, 0.25), cx, S.maxZ - t / 2, CEIL + 0.08);
  const brand = signPlane(1024, 128, 8, (g) => {
    g.fillStyle = TEAL;
    g.fillRect(0, 0, 1024, 128);
    drawLogo(g, 70, 64, 46);
    g.fillStyle = WHITE;
    g.font = `900 74px ${FONT}`;
    g.textBaseline = 'middle';
    g.fillText(`${BRAND} SHOP`, 135, 68);
    g.fillStyle = YELLOW;
    g.textAlign = 'right';
    g.fillText('24h', 1004, 68);
  });
  brand.position.set(cx, G + CEIL + 0.62, S.maxZ + 0.03);
  group.add(brand);
  const glass = glassMat();
  const door = SHOP_DOOR;
  const dl = door.x - door.w / 2;
  const dr = door.x + door.w / 2;
  for (const [x0, x1] of [
    [S.minX, dl],
    [dr, S.maxX],
  ]) {
    // The glass ends a centimeter inside the end posts, so their ends aren't one plane.
    group.add(mesh(new THREE.BoxGeometry(x1 - x0 - 0.02, CEIL, 0.04), glass, (x0 + x1) / 2, G + CEIL / 2, S.maxZ - t / 2, false));
    for (let x = x0; x <= x1 + 0.01; x += (x1 - x0) / Math.max(1, Math.round((x1 - x0) / 2.2))) block(solid, 0.12, CEIL, t + 0.02, toon(STEEL), Math.min(x1 - 0.06, Math.max(x0 + 0.06, x)), S.maxZ - t / 2, 0);
    block(solid, x1 - x0, 0.35, t + 0.02, toon(STEEL), (x0 + x1) / 2, S.maxZ - t / 2, 0);
  }
  // Stickers in the windows: coffee, the opening hours.
  for (const [x, text] of [
    [-109, '☕ Kaffee to go'],
    [-98.5, '🌭 Heiße Bockwurst'],
  ] as const) {
    const s = signPlane(512, 128, 2.6, (g) => {
      g.fillStyle = 'rgba(255,207,51,0.92)';
      g.beginPath();
      g.roundRect(4, 4, 504, 120, 40);
      g.fill();
      g.fillStyle = INK;
      g.font = `900 56px ${FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, 256, 68);
    }, false);
    (s.material as THREE.MeshToonMaterial).transparent = true;
    s.position.set(x, G + 1.6, S.maxZ + 0.03);
    group.add(s);
  }
  block(solid, door.w + 0.3, 0.2, t + 0.06, toon(STEEL), door.x, S.maxZ - t / 2, door.h);
  block(solid, door.w + 0.3, CEIL - door.h - 0.2, 0.04, glass, door.x, S.maxZ - t / 2, door.h + 0.2, false);
  // The mat at the door.
  block(solid, 2.2, 0.025, 1.4, toon('#3b3f4a'), door.x, S.maxZ - 0.9, 0, false);

  // ---- Inside -------------------------------------------------------------------------------------
  const r = mulberry32(4242);
  const inside = new THREE.Group();
  // The counter: a teal front, a white top, the till and the card reader, sweets in front.
  const C = COUNTER;
  block(inside, C.maxX - C.minX, C.h - 0.05, C.maxZ - C.minZ, toon(TEAL), (C.minX + C.maxX) / 2, (C.minZ + C.maxZ) / 2, 0);
  block(inside, C.maxX - C.minX + 0.1, 0.05, C.maxZ - C.minZ + 0.2, toon(WHITE), (C.minX + C.maxX) / 2, (C.minZ + C.maxZ) / 2, C.h - 0.05);
  block(inside, 0.42, 0.14, 0.36, toon(INK), -110.6, -13.05, C.h);
  const till = mesh(new THREE.BoxGeometry(0.36, 0.26, 0.03), bulb(night, '#7fd1ff', 0.8), -110.6, G + C.h + 0.32, -13.15, false);
  till.rotation.x = -0.35;
  inside.add(till);
  block(inside, 0.1, 0.16, 0.14, toon('#2b2d42'), -109.4, -12.85, C.h);
  goods(inside, r, -112.3, -111.3, -12.45, 1, 2, 0.15, 0.4);
  // The newspapers on a rack beside the counter.
  block(inside, 0.8, 0.9, 0.4, toon(STEEL), -106.2, -11.7, 0);
  // Each a little smaller than the one under it, so the stack's sides aren't one plane.
  for (let i = 0; i < 3; i++) block(inside, 0.7 - i * 0.02, 0.04, 0.32 - i * 0.02, toon(i === 1 ? '#f1efe8' : '#e8e2d0'), -106.2, -11.7, 0.9 + i * 0.02);
  // Behind the cashier: the back counter, the coffee machine, cups, the sausage warmer, the cigarettes.
  const B = BACK_COUNTER;
  block(inside, B.maxX - B.minX, B.h, B.maxZ - B.minZ, toon('#d9d6cf'), (B.minX + B.maxX) / 2, (B.minZ + B.maxZ) / 2, 0);
  const cm = COFFEE_MACHINE;
  block(inside, 0.7, 0.85, 0.55, toon('#2b2d42'), cm.x, cm.z, B.h);
  block(inside, 0.6, 0.18, 0.04, bulb(night, '#ffb703', 0.6), cm.x, cm.z + 0.28, B.h + 0.6);
  block(inside, 0.2, 0.08, 0.04, toon(STEEL), cm.x, cm.z + 0.29, B.h + 0.25);
  for (let i = 0; i < 5; i++) inside.add(mesh(new THREE.CylinderGeometry(0.045, 0.035, 0.11, 10), toon(i % 2 ? WHITE : '#e8e2d0'), cm.x - 0.6, G + B.h + 0.055 + i * 0.1, cm.z, false));
  const warmer = glassMat();
  inside.add(mesh(new THREE.BoxGeometry(0.7, 0.35, 0.45), warmer, -111.6, G + B.h + 0.175, -16.5, false));
  for (let i = 0; i < 5; i++) {
    const w = mesh(new THREE.CapsuleGeometry(0.03, 0.22, 4, 8), toon('#c0603a'), -111.85 + i * 0.12, G + B.h + 0.08, -16.5, false);
    w.rotation.x = Math.PI / 2;
    inside.add(w);
  }
  block(inside, B.maxX - B.minX, 1.4, 0.3, toon('#c9c4b8'), (B.minX + B.maxX) / 2, B.minZ - 0.2, 1.1);
  goods(inside, r, B.minX + 0.1, B.maxX - 0.1, B.minZ + 0.05, 1, 3, 1.15, 0.42);
  block(inside, TILL_WALL.maxX - TILL_WALL.minX, 1.2, TILL_WALL.maxZ - TILL_WALL.minZ, toon(TEAL), (TILL_WALL.minX + TILL_WALL.maxX) / 2, (TILL_WALL.minZ + TILL_WALL.maxZ) / 2, 0);
  // The shelves down the shop, goods both sides.
  for (const sh of SHELVES) {
    const x = (sh.minX + sh.maxX) / 2;
    const z = (sh.minZ + sh.maxZ) / 2;
    const len = sh.maxZ - sh.minZ;
    block(inside, 0.3, 1.7, len, toon('#d9d6cf'), x, z, 0);
    for (let l = 0; l < 4; l++) block(inside, sh.maxX - sh.minX, 0.04, len - 0.02, toon(STEEL), x, z, 0.12 + l * 0.42); // ends a hair inside the shelf's
    block(inside, sh.maxX - sh.minX + 0.02, 0.3, 0.06, toon(YELLOW), x, sh.maxZ, 1.7);
    for (const face of [-1, 1]) {
      const g = new THREE.Group();
      goods(g, r, -len / 2, len / 2, 0, 1, 4, 0.16, 0.42);
      g.rotation.y = Math.PI / 2;
      g.position.set(x + face * 0.32, 0, z);
      inside.add(g);
    }
  }
  // The drinks fridges along the back wall: glass doors, lit inside, bottles in rows.
  const F = FRIDGES;
  block(inside, F.maxX - F.minX, 2.2, F.maxZ - F.minZ, toon('#3b3f4a'), (F.minX + F.maxX) / 2, (F.minZ + F.maxZ) / 2, 0);
  const lit = bulb(night, '#e9f6ff', 0.55);
  block(inside, F.maxX - F.minX - 0.2, 1.8, 0.02, lit, (F.minX + F.maxX) / 2, F.maxZ - 0.25, 0.2, false);
  for (let l = 0; l < 4; l++) {
    for (let x = F.minX + 0.2; x < F.maxX - 0.15; x += 0.14) {
      const c = GOODS[Math.floor(r() * GOODS.length)];
      inside.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.28, 8), toon(c), x, G + 0.38 + l * 0.44, F.maxZ - 0.15, false));
    }
  }
  inside.add(mesh(new THREE.BoxGeometry(F.maxX - F.minX - 0.1, 1.95, 0.03), glassMat(), (F.minX + F.maxX) / 2, G + 1.15, F.maxZ + 0.02, false));
  // The posts between the doors a centimeter further out than the glass's back, so they're not one plane.
  for (let x = F.minX + 1.1; x < F.maxX; x += 1.1) block(inside, 0.05, 2, 0.05, toon(STEEL), x, F.maxZ + 0.04, 0.1);
  // The ceiling's lights.
  const panel = bulb(night, '#fffdf2', 0.55);
  for (let x = S.minX + 2.5; x < S.maxX - 1; x += 4) for (let z = S.minZ + 2.5; z < S.maxZ - 1; z += 3.5) inside.add(mesh(new THREE.BoxGeometry(1.4, 0.04, 0.5), panel, x, G + CEIL - 0.03, z, false));
  // A glow out of the windows onto the forecourt at night.
  for (let x = S.minX + 3; x < S.maxX; x += 5) night.halos.push({ at: new THREE.Vector3(x, G + 2.4, S.maxZ + 0.6), size: 3.2, color: '#fff2c8', ground: true });
  group.add(mergeByMaterial(solid), mergeByMaterial(inside));

  // ---- The sliding door: two glass leaves that part to the sides ------------------------------------------
  const leaves = [-1, 1].map((side) => {
    const leaf = new THREE.Group();
    leaf.add(mesh(new THREE.BoxGeometry(door.w / 2, door.h, 0.04), glassMat(), 0, door.h / 2, 0, false));
    leaf.add(mesh(new THREE.BoxGeometry(door.w / 2, 0.08, 0.06), toon(STEEL), 0, 0.04, 0, false));
    leaf.add(mesh(new THREE.BoxGeometry(0.05, door.h, 0.06), toon(STEEL), (-side * door.w) / 4 + side * 0.02, door.h / 2, 0, false));
    leaf.position.set(door.x + (side * door.w) / 4, G, S.maxZ - t / 2 + 0.06);
    group.add(leaf);
    return { leaf, side };
  });
  return {
    x: door.x,
    y: G,
    z: S.maxZ,
    open: 0,
    show(open) {
      for (const { leaf, side } of leaves) leaf.position.x = door.x + (side * door.w) / 4 + side * open * (door.w / 2 - 0.05);
    },
  };
}
