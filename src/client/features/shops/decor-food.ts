import * as THREE from 'three';
import { FRONT_T, SHOP_H, WALL_T, type Shop, type ShopKind, type ShopKindId } from '../../../shared/shops';
import type { Piece, Room } from '../../../shared/shop-rooms';
import { beltOf, beltSlots, plateOn, platePoint, type FoodPieceKind } from '../../../shared/shop-rooms-food';
import { FLAVOURS, PLATE_RIMS } from '../../../shared/shopwares-food';
import { MARKET_AISLES } from '../../../shared/trolley';
import { canvasTexture, tilingCanvasTexture } from '../../world/texture';
import { mesh, toon } from '../../world/toon';
import type { Live } from './decor';
import { trolleyModel } from './trolley';

// flrnoh fork (see FORK.md "Shops to walk into", food round 2): what the ice cream parlour, the sushi
// bar, the butcher's and the supermarket have (interior.ts furnishes the pieces everyone has, decor.ts
// the other kinds): the glass case of ice cream tubs, the conveyor belt with its plates going round on
// the office clock, the meat counter, the white tiles and the sausages hanging, the checkouts, the
// trolley bay, the fruit stand and the aisles' signs. `still` is merged; `live` moves or has a picture.

const FOOD = new Set<ShopKindId>(['eisdiele', 'sushi', 'metzgerei', 'supermarkt']);
export const isFoodKind = (k: ShopKindId) => FOOD.has(k);
/** The pieces a keeper stands behind (interior.ts puts them on a step). */
export const FOOD_COUNTERS = new Set<Piece['what']>(['icecase', 'meatcase', 'beltcounter']);

/** The office's clock, in seconds (store.officeNow, set by food.ts): the belt runs on it. */
let clock = () => performance.now() / 1000;
export function setBeltClock(fn: () => number) {
  clock = fn;
}
/** Plates you took off the belt: hidden on your page (only) until they'd have come round again. */
const taken = new Map<string, number>();
export function takePlate(shop: number, k: number, until: number) {
  taken.set(`${shop}:${k}`, until);
}

const at = (u: number, y: number, v: number) => new THREE.Vector3(u, y, -v);
const own = <M extends THREE.Material>(m: M): M => {
  m.userData.own = true;
  return m;
};
const glowMat = (color: string, strength = 1) => {
  const m = own(new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(strength) }));
  m.userData.outlineParameters = { visible: false };
  return m;
};
const tm = (map: THREE.Texture, opts: THREE.MeshToonMaterialParameters = {}) => own(new THREE.MeshToonMaterial({ map, gradientMap: (toon('#fff') as THREE.MeshToonMaterial).gradientMap, ...opts }));
function box(parent: THREE.Object3D, w: number, h: number, d: number, color: string | THREE.Material, u: number, y: number, v: number) {
  const m = mesh(new THREE.BoxGeometry(w, h, d), typeof color === 'string' ? toon(color) : color, u, y + h / 2, -v, false);
  parent.add(m);
  return m;
}
function cyl(parent: THREE.Object3D, r0: number, r1: number, h: number, color: string | THREE.Material, u: number, y: number, v: number, segs = 12) {
  const m = mesh(new THREE.CylinderGeometry(r0, r1, h, segs), typeof color === 'string' ? toon(color) : color, u, y + h / 2, -v, false);
  parent.add(m);
  return m;
}
function ball(parent: THREE.Object3D, r: number, color: string, u: number, y: number, v: number) {
  const m = mesh(new THREE.SphereGeometry(r, 10, 8), toon(color), u, y, -v, false);
  parent.add(m);
  return m;
}
function picture(parent: THREE.Object3D, mat: THREE.Material, w: number, h: number, u: number, y: number, v: number, du: number, dv: number) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.position.copy(at(u, y, v));
  m.rotation.y = Math.atan2(du, -dv);
  parent.add(m);
  return m;
}
const glassMat = () => {
  const m = own(new THREE.MeshBasicMaterial({ color: '#d7f0fa', transparent: true, opacity: 0.25, depthWrite: false }));
  m.userData.outlineParameters = { visible: false };
  return m;
};

/** The glass that leans over a counter's front, toward you. */
function sneezeGuard(still: THREE.Group, w: number, top: number, v0: number, cu: number) {
  const g = new THREE.Mesh(new THREE.BoxGeometry(w - 0.04, 0.42, 0.015), glassMat());
  g.position.copy(at(cu, top - 0.12, v0 + 0.08));
  g.rotation.x = 0.45;
  still.add(g);
}

const textures = new Map<string, THREE.CanvasTexture>();
function painted(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, tile = false): THREE.CanvasTexture {
  let t = textures.get(key);
  if (!t) textures.set(key, (t = tile ? tilingCanvasTexture(w, h, draw) : canvasTexture(w, h, draw)));
  return t;
}
/** A board with a heading and lines on it. */
const board = (key: string, bg: string, ink: string, title: string, lines: string[], w = 512, h = 256) =>
  painted(key, w, h, (g) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.fillStyle = ink;
    g.font = 'bold 34px system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillText(title, w / 2, 44);
    g.font = '24px system-ui, sans-serif';
    lines.forEach((l, i) => g.fillText(l, (w / 4) * (1 + 2 * (i % 2)), 92 + Math.floor(i / 2) * 36));
  });

/** The pieces only these kinds have; whether `p` was one. */
export function furnishFood(still: THREE.Group, s: Shop, k: ShopKind, p: Piece): boolean {
  const w = p.u1 - p.u0;
  const d = p.v1 - p.v0;
  const cu = (p.u0 + p.u1) / 2;
  const cv = (p.v0 + p.v1) / 2;
  switch (p.what as FoodPieceKind) {
    case 'icecase': {
      // A glass case, the tubs of ice sunk in its top in two rows, each with a heap and a scoop.
      box(still, w, p.h - 0.3, d, '#0081a7', cu, 0, cv);
      box(still, w + 0.06, 0.04, d + 0.06, '#e9ecef', cu, p.h - 0.3, cv);
      sneezeGuard(still, w, p.h, p.v0, cu);
      const n = Math.max(2, Math.floor((w - 0.2) / 0.32));
      for (let r = 0; r < 2; r++)
        for (let i = 0; i < n; i++) {
          const f = FLAVOURS[(i + r * 3) % FLAVOURS.length];
          const u = p.u0 + 0.2 + i * ((w - 0.4) / Math.max(1, n - 1));
          const v = p.v0 + 0.2 + r * (d - 0.35);
          box(still, 0.26, 0.06, 0.2, '#adb5bd', u, p.h - 0.28, v);
          const heap = ball(still, 0.11, f.color, u, p.h - 0.2, v);
          heap.scale.set(1.1, 0.55, 0.85);
        }
      return true;
    }
    case 'meatcase': {
      box(still, w, p.h - 0.32, d, '#f8f9fa', cu, 0, cv);
      box(still, w, 0.18, 0.02, '#9d0208', cu, 0, p.v0 - 0.01);
      box(still, w + 0.06, 0.04, d + 0.06, '#dee2e6', cu, p.h - 0.32, cv);
      sneezeGuard(still, w, p.h, p.v0, cu);
      // Trays of meat, rolled sausages and a whole Leberkäs on the counter's white tiles.
      const n = Math.max(2, Math.floor((w - 0.2) / 0.36));
      for (let i = 0; i < n; i++) {
        const u = p.u0 + 0.22 + i * ((w - 0.44) / Math.max(1, n - 1));
        box(still, 0.3, 0.03, d - 0.2, '#e9ecef', u, p.h - 0.29, cv);
        const c = ['#c9184a', '#ff8fa3', '#d08c60', '#9c6644', '#e5989b'][i % 5];
        if (i % 3 === 2) box(still, 0.24, 0.1, 0.14, '#d08c60', u, p.h - 0.26, cv);
        else for (let j = 0; j < 3; j++) ball(still, 0.05, c, u - 0.08 + j * 0.08, p.h - 0.23, cv + (j % 2) * 0.06).scale.set(1, 0.5, 1.4);
      }
      return true;
    }
    case 'beltcounter': {
      box(still, w, p.h - 0.05, d, '#6b4f3a', cu, 0, cv);
      box(still, w + 0.1, 0.05, d + 0.12, '#d4a373', cu, p.h - 0.05, cv);
      // The belt: a dark band round the loop the plates ride on, with its steel edges.
      const bt = beltOf({ pieces: [p], stations: [], keeper: { u: 0, v: 0 }, spot: { u: 0, v: 0 } })!;
      for (const v of [bt.vf, bt.vb]) {
        box(still, bt.b - bt.a, 0.02, 0.2, '#343a40', (bt.a + bt.b) / 2, p.h, v);
        for (const e of [-0.105, 0.105]) box(still, bt.b - bt.a, 0.035, 0.012, '#ced4da', (bt.a + bt.b) / 2, p.h, v + e);
      }
      for (const u of [bt.a, bt.b]) cyl(still, bt.r + 0.1, bt.r + 0.1, 0.02, '#343a40', u, p.h, (bt.vf + bt.vb) / 2, 20);
      // Soy sauce, pickled ginger and a tea tap at every other stool.
      for (let u = p.u0 + 0.45; u < p.u1 - 0.3; u += 1.7) {
        cyl(still, 0.025, 0.03, 0.09, '#1d1d1d', u + 0.15, p.h, p.v0 + 0.06, 8);
        cyl(still, 0.04, 0.03, 0.03, '#ffafcc', u - 0.15, p.h, p.v0 + 0.06, 10);
      }
      return true;
    }
    case 'checkout': {
      // The checkout: its body, a black conveyor along the top running toward the scanner and the till.
      box(still, w, p.h, d, '#e9ecef', cu, 0, cv);
      box(still, w, 0.12, 0.02, '#e63946', cu, 0.05, p.v0 - 0.01);
      box(still, w - 0.12, 0.02, d - 0.6, '#1d1d1d', cu, p.h, cv + 0.25);
      for (let v = p.v0 + 0.85; v < p.v1 - 0.1; v += 0.12) box(still, w - 0.13, 0.022, 0.01, '#495057', cu, p.h, v);
      box(still, w - 0.12, 0.03, 0.3, '#212529', cu, p.h, p.v0 + 0.35);
      box(still, w - 0.3, 0.004, 0.18, '#ff4d6d', cu, p.h + 0.031, p.v0 + 0.35);
      // The till and its screen, on the cashier's side.
      box(still, 0.32, 0.14, 0.28, '#343a40', p.u0 + 0.05, p.h, p.v0 + 0.75);
      box(still, 0.03, 0.22, 0.2, '#8ecae6', p.u0 + 0.05, p.h + 0.14, p.v0 + 0.75);
      // A rack of sweets at the end, where the queue waits.
      box(still, 0.35, 1.1, 0.3, '#adb5bd', cu + 0.05, 0, p.v1 + 0.2);
      for (let r = 0; r < 4; r++) for (let i = 0; i < 3; i++) box(still, 0.08, 0.12, 0.04, ['#e63946', '#ffd60a', '#6f1d1b', '#2a9d8f'][(i + r) % 4], cu - 0.06 + i * 0.1, 0.25 + r * 0.22, p.v1 + 0.04);
      return true;
    }
    case 'trolleybay': {
      // A rail along the wall with trolleys nested in it, their handles toward the way in.
      box(still, w, 0.05, d, '#495057', cu, 0, cv);
      box(still, 0.04, 0.9, d, '#adb5bd', p.u1 - 0.02, 0, cv);
      const n = Math.max(1, Math.floor((d - 0.2) / 0.32));
      for (let i = 0; i < n; i++) {
        const t = trolleyModel();
        t.scale.setScalar(0.92);
        t.position.copy(at(cu, 0.02, p.v0 + 0.25 + i * 0.32));
        t.rotation.y = Math.PI / 2;
        still.add(t);
      }
      return true;
    }
    case 'vegstand': {
      // Sloping crates of fruit and veg, a crate's worth of each.
      box(still, w, p.h - 0.25, d, '#9c6644', cu, 0, cv);
      const crates = ['#d62828', '#ffd60a', '#e63946', '#6a994e', '#f77f00', '#a7c957'];
      const nu = Math.max(1, Math.floor(w / 0.5));
      for (let r = 0; r < 2; r++)
        for (let i = 0; i < nu; i++) {
          const u = p.u0 + 0.25 + i * ((w - 0.5) / Math.max(1, nu - 1));
          const v = p.v0 + 0.28 + r * (d - 0.56);
          const y = p.h - 0.25 + r * 0.12;
          box(still, 0.44, 0.12, 0.44, '#d4a373', u, y, v);
          const c = crates[(i * 2 + r + s.i) % crates.length];
          for (let j = 0; j < 9; j++) ball(still, 0.055, c, u - 0.13 + (j % 3) * 0.13, y + 0.15, v - 0.13 + Math.floor(j / 3) * 0.13);
        }
      return true;
    }
    case 'sausages':
    case 'tiles':
      return true; // drawn by foodDecor, as they are
  }
  void k;
  return false;
}

/** What each of these kinds has besides its pieces. */
export function foodDecor(still: THREE.Group, live: THREE.Group, s: Shop, k: ShopKind, room: Room): Live[] {
  const out: Live[] = [];
  const back = s.depth - WALL_T;
  const piece = (what: Piece['what']) => room.pieces.filter((p) => p.what === what);
  const mirrored = s.doorU < s.len / 2;
  const win = mirrored ? { u0: s.doorU + 1.0, u1: s.len - 0.4 } : { u0: 0.4, u1: s.doorU - 1.0 };
  switch (k.id) {
    case 'eisdiele': {
      const menu = piece('menuboard')[0];
      if (menu) {
        const tex = board('eis-menu', '#0081a7', '#fdfcdc', '🍨 GELATI', [...FLAVOURS.map((f) => f.name), 'Spaghettieis', 'Eiskaffee']);
        picture(live, tm(tex, { emissive: '#ffffff', emissiveIntensity: 0.3, emissiveMap: tex }), Math.min(2.4, menu.u1 - menu.u0), 1.0, (menu.u0 + menu.u1) / 2, 2.55, back - 0.02, 0, -1);
      }
      // Cones in a stand and stacked cups on the shelf behind; a big cone by the door outside.
      const shelf = piece('backshelf')[0];
      if (shelf) for (let i = 0; i < 6; i++) {
        const c = mesh(new THREE.ConeGeometry(0.035, 0.12, 10), toon('#d4a373'), shelf.u0 + 0.2 + i * 0.12, shelf.h + 0.07, -(shelf.v0 + 0.2), false);
        c.rotation.z = Math.PI;
        still.add(c);
        cyl(still, 0.05, 0.04, 0.04 + (i % 3) * 0.04, '#f07167', shelf.u1 - 0.25 - (i % 3) * 0.13, shelf.h, shelf.v0 + 0.2, 12);
      }
      const big = new THREE.Group();
      const cone = mesh(new THREE.ConeGeometry(0.22, 0.75, 14), toon('#d4a373'), 0, 0.38, 0, false);
      cone.rotation.z = Math.PI;
      big.add(cone, mesh(new THREE.SphereGeometry(0.24, 14, 10), toon('#ff8fab'), 0, 0.85, 0, false), mesh(new THREE.SphereGeometry(0.2, 14, 10), toon('#fff3c4'), 0, 1.15, 0, false));
      big.position.copy(at(s.doorU + (mirrored ? 1.2 : -1.2), 0, -0.55));
      live.add(big);
      // Ice in the window: cups of colored scoops on the display.
      for (let u = win.u0 + 0.3, j = 0; u < win.u1 - 0.2; u += 0.45, j++) {
        cyl(still, 0.07, 0.05, 0.08, '#f07167', u, 0.55, FRONT_T + 0.22, 12);
        for (let q = 0; q < 2; q++) ball(still, 0.055, FLAVOURS[(j + q * 2) % FLAVOURS.length].color, u - 0.03 + q * 0.06, 0.68 + q * 0.03, FRONT_T + 0.22);
      }
      break;
    }
    case 'sushi': {
      // The plates going round on the belt: each slot's plate where the office clock says it is.
      const counter = piece('beltcounter')[0];
      const bt = beltOf(room);
      if (counter && bt) {
        const n = beltSlots(bt);
        const plates: { g: THREE.Group; k: number }[] = [];
        for (let k2 = 0; k2 < n; k2++) {
          const what = plateOn(s.i, k2);
          if (!what) continue;
          const g = new THREE.Group();
          g.add(mesh(new THREE.CylinderGeometry(0.085, 0.07, 0.018, 18), toon('#fbfaf6'), 0, 0.009, 0, false));
          const rim = mesh(new THREE.TorusGeometry(0.08, 0.008, 6, 20), toon(PLATE_RIMS[what]), 0, 0.018, 0, false);
          rim.rotation.x = Math.PI / 2;
          g.add(rim);
          const color = { sushilachs: '#f4845f', sushithun: '#c1121f', sushimaki: '#1b4332', sushiebi: '#ffb4a2', sushitamago: '#ffd166', sushiinari: '#bc6c25' }[what];
          for (const x of [-0.03, 0.03]) {
            g.add(mesh(new THREE.BoxGeometry(0.045, 0.022, 0.028), toon(what === 'sushimaki' ? '#1b4332' : '#fbfaf6'), x, 0.03, 0, false));
            g.add(mesh(new THREE.BoxGeometry(0.05, 0.012, 0.032), toon(color), x, 0.046, 0, false));
          }
          live.add(g);
          plates.push({ g, k: k2 });
        }
        const y = counter.h + 0.02;
        out.push({
          update: () => {
            const t = clock();
            for (const p of plates) {
              const until = taken.get(`${s.i}:${p.k}`);
              p.g.visible = !(until && t < until);
              const pt = platePoint(bt, p.k, t);
              p.g.position.copy(at(pt.u, y, pt.v));
            }
          },
        });
      }
      // Red lanterns over the counter, a picture of a wave, a cat waving at the till.
      for (const f of [0.25, 0.75]) {
        const u = counter ? counter.u0 + (counter.u1 - counter.u0) * f : s.len * f;
        const lv = (counter?.v0 ?? s.depth / 2) - 0.2;
        cyl(live, 0.16, 0.16, 0.36, glowMat('#ff4d4d', 0.9), u, 2.9, lv, 14);
        for (const y of [2.86, 3.26]) cyl(still, 0.17, 0.17, 0.04, '#1d1d1d', u, y, lv, 14);
        cyl(still, 0.008, 0.008, SHOP_H - 3.3, '#1d1d1d', u, 3.3, lv, 4);
      }
      const wave = painted('sushi-wave', 256, 128, (g) => {
        g.fillStyle = '#fdf0d5';
        g.fillRect(0, 0, 256, 128);
        g.strokeStyle = '#1d3557';
        g.lineWidth = 6;
        for (let i = 0; i < 4; i++) {
          g.beginPath();
          g.arc(40 + i * 60, 110, 46, Math.PI, Math.PI * 1.8);
          g.stroke();
        }
        g.fillStyle = '#c1121f';
        g.beginPath();
        g.arc(210, 30, 16, 0, Math.PI * 2);
        g.fill();
      });
      picture(live, tm(wave), 1.4, 0.7, s.len / 2, 2.6, back - 0.02, 0, -1);
      if (counter) {
        const cat = new THREE.Group();
        cat.add(mesh(new THREE.SphereGeometry(0.08, 10, 8), toon('#ffffff'), 0, 0.08, 0, false), mesh(new THREE.SphereGeometry(0.065, 10, 8), toon('#ffffff'), 0, 0.2, 0, false));
        const paw = mesh(new THREE.SphereGeometry(0.025, 8, 6), toon('#ffffff'), 0.07, 0.25, 0.03, false);
        cat.add(paw, mesh(new THREE.SphereGeometry(0.02, 8, 6), toon('#e63946'), 0, 0.14, 0.07, false));
        cat.position.copy(at(counter.u1 - 0.15, counter.h, counter.v0 + 0.12));
        cat.rotation.y = Math.PI;
        live.add(cat);
        out.push({ update: (t) => (paw.position.y = 0.25 + Math.sin(t * 4) * 0.03) });
      }
      break;
    }
    case 'metzgerei': {
      // White tiles on the walls, up to head height.
      const tiles = painted('tiles', 128, 128, (g) => {
        g.fillStyle = '#ffffff';
        g.fillRect(0, 0, 128, 128);
        g.strokeStyle = '#ced4da';
        g.lineWidth = 3;
        for (let i = 0; i <= 128; i += 32) {
          g.beginPath();
          g.moveTo(i, 0);
          g.lineTo(i, 128);
          g.moveTo(0, i);
          g.lineTo(128, i);
          g.stroke();
        }
      }, true);
      const tileMat = (w: number) => {
        const t = tiles.clone();
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(w / 0.6, 2.2 / 0.6);
        t.needsUpdate = true;
        return tm(t);
      };
      const inner = s.len - 2 * WALL_T;
      picture(live, tileMat(inner), inner, 2.2, s.len / 2, 1.1, back - 0.015, 0, -1);
      for (const [u, du] of [[WALL_T + 0.015, 1], [s.len - WALL_T - 0.015, -1]] as const) picture(live, tileMat(s.depth - FRONT_T), s.depth - FRONT_T - 0.05, 2.2, u, 1.1, (s.depth + FRONT_T) / 2, du, 0);
      // Sausages hanging off a rail over the block, a cleaver on it, a pig on the wall.
      const rail = piece('sausages')[0];
      if (rail) {
        cyl(still, 0.015, 0.015, rail.u1 - rail.u0, '#adb5bd', (rail.u0 + rail.u1) / 2, 2.25, (rail.v0 + rail.v1) / 2, 8).rotation.z = Math.PI / 2;
        for (let u = rail.u0 + 0.15, i = 0; u < rail.u1 - 0.1; u += 0.16, i++) {
          const len = 0.25 + (i % 3) * 0.1;
          const c = ['#9c4f1c', '#c9733f', '#7f4f24'][i % 3];
          const sz = mesh(new THREE.CapsuleGeometry(0.03, len, 4, 8), toon(c), u, 2.2 - len / 2 - 0.05, -((rail.v0 + rail.v1) / 2), false);
          sz.rotation.z = ((i % 5) - 2) * 0.05;
          still.add(sz);
        }
      }
      const block = piece('backshelf')[0];
      if (block) {
        box(still, 0.5, 0.08, 0.35, '#b08968', block.u0 + 0.4, block.h, (block.v0 + block.v1) / 2);
        box(still, 0.22, 0.01, 0.1, '#ced4da', block.u0 + 0.45, block.h + 0.08, (block.v0 + block.v1) / 2);
        box(still, 0.03, 0.03, 0.12, '#1d1d1d', block.u0 + 0.3, block.h + 0.085, (block.v0 + block.v1) / 2);
      }
      const pig = painted('pig', 256, 160, (g) => {
        g.fillStyle = '#ffffff';
        g.fillRect(0, 0, 256, 160);
        g.fillStyle = '#ffafcc';
        g.beginPath();
        g.ellipse(120, 85, 80, 50, 0, 0, Math.PI * 2);
        g.fill();
        g.beginPath();
        g.ellipse(205, 75, 32, 26, 0, 0, Math.PI * 2);
        g.fill();
        g.fillRect(70, 120, 16, 30);
        g.fillRect(150, 120, 16, 30);
        g.fillStyle = '#9d0208';
        g.font = 'bold 22px system-ui, sans-serif';
        g.fillText('Hausgemacht', 60, 30);
      });
      picture(live, tm(pig), 0.9, 0.56, s.len / 2 + (mirrored ? 1.2 : -1.2), 2.7, back - 0.02, 0, -1);
      // Sausage rings in the window.
      for (let u = win.u0 + 0.3; u < win.u1 - 0.2; u += 0.5) {
        const ring = mesh(new THREE.TorusGeometry(0.1, 0.03, 8, 16), toon('#9c4f1c'), u, 0.68, -(FRONT_T + 0.22), false);
        ring.rotation.x = Math.PI / 2;
        still.add(ring);
      }
      break;
    }
    case 'supermarkt': {
      // The cashier's raised seat behind the first checkout.
      box(still, 0.7, 0.3, 0.8, '#6c757d', room.keeper.u, 0, room.keeper.v);
      // Signs over the aisles, hung from the ceiling.
      room.stations.forEach((t, i) => {
        if (t.at !== 'aisle' && t.at !== 'trolleys') return;
        const a = MARKET_AISLES[t.n];
        const label = t.at === 'trolleys' ? '🛒 Einkaufswagen' : `${a.emoji} ${a.name}`;
        const tex = painted(`aisle-${label}`, 512, 96, (g) => {
          g.fillStyle = '#ffd60a';
          g.fillRect(0, 0, 512, 96);
          g.fillStyle = '#e63946';
          g.font = 'bold 44px system-ui, sans-serif';
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText(label, 256, 50);
        });
        const u = t.aim?.u ?? t.u;
        const v = t.aim?.v ?? t.v;
        // Readable from both sides: two signs back to back.
        const mat = tm(tex);
        const turn = t.at === 'trolleys' || i % 2 ? Math.PI / 2 : -Math.PI / 2;
        for (const flip of [0, Math.PI]) picture(live, mat, 1.3, 0.24, u, 3.2, v, 1, 0).rotation.y = turn + flip;
        cyl(still, 0.006, 0.006, SHOP_H - 3.35, '#adb5bd', u, 3.35, v, 4);
      });
      // Offers in the window: big yellow price stars.
      const star = painted('angebot', 256, 256, (g) => {
        g.fillStyle = '#ffd60a';
        g.beginPath();
        for (let i = 0; i < 24; i++) {
          const r = i % 2 ? 90 : 124;
          const a = (i / 24) * Math.PI * 2;
          g.lineTo(128 + Math.cos(a) * r, 128 + Math.sin(a) * r);
        }
        g.fill();
        g.fillStyle = '#e63946';
        g.font = 'bold 54px system-ui, sans-serif';
        g.textAlign = 'center';
        g.fillText('0,99', 128, 130);
        g.font = 'bold 28px system-ui, sans-serif';
        g.fillText('ANGEBOT', 128, 172);
      });
      const starMat = tm(star, { transparent: true });
      for (let u = win.u0 + 0.6; u < win.u1 - 0.5; u += 2.2) picture(live, starMat, 0.7, 0.7, u, 2.0, FRONT_T + 0.04, 0, -1);
      break;
    }
  }
  return out;
}
