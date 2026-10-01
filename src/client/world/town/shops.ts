import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BLOCK_INNER, CITY_X, CITY_Z, PERIOD, onCityStreet, type Lot } from '../../../shared/city';
import { ROAD } from '../../../shared/layout';
import { STREET_END, onLoop } from '../../../shared/scenic';
import type { NightParts } from '../outside';
import { canvasTexture, tilingCanvasTexture } from '../texture';
import { mergeByMaterial, mesh, toon } from '../toon';
import { G, Walls } from './kit';

// flrnoh fork (see FORK.md): the city at eye level (see town/index.ts). The buildings close by have
// shops on their ground floor where they face a street: shop windows with something on display and a
// door, an awning over them and a sign with the shop's name, lit from inside at night. Over them the
// building's own walls and windows go on up (town/buildings.ts starts them at SHOP_H).

/** How tall a ground floor with shops is. */
export const SHOP_H = 4.2;
/** One shop window and its share of the wall, along the street. */
const SHOP_BAY = 6;

interface Shop {
  name: string;
  /** The frame and the wall round the windows, the awning's two stripes, the sign's ground and its letters. */
  frame: string;
  awning: [string, string];
  sign: string;
  ink: string;
  /** What's in the window: a row of these colors, standing on shelves. */
  goods: string[];
}

const SHOPS: Shop[] = [
  { name: 'BÄCKEREI', frame: '#7a4b2a', awning: ['#e9c46a', '#fff4d6'], sign: '#fff4d6', ink: '#7a4b2a', goods: ['#d9a35b', '#e8c07d', '#b9773e'] },
  { name: 'CAFÉ', frame: '#2f3e46', awning: ['#2a9d8f', '#e9f5f2'], sign: '#2f3e46', ink: '#f6e7cb', goods: ['#f6e7cb', '#c08552', '#8c5e3c'] },
  { name: 'PIZZA', frame: '#9b2226', awning: ['#bb3e03', '#fefae0'], sign: '#fefae0', ink: '#9b2226', goods: ['#ee9b00', '#ca6702', '#94d2bd'] },
  { name: 'APOTHEKE', frame: '#e9ecef', awning: ['#2b9348', '#ffffff'], sign: '#2b9348', ink: '#ffffff', goods: ['#ffffff', '#80ed99', '#caf0f8'] },
  { name: 'BLUMEN', frame: '#386641', awning: ['#ff8fab', '#fff0f3'], sign: '#fff0f3', ink: '#386641', goods: ['#ff8fab', '#ffd166', '#c77dff', '#6a994e'] },
  { name: 'BUCHLADEN', frame: '#3d405b', awning: ['#81b29a', '#f4f1de'], sign: '#f4f1de', ink: '#3d405b', goods: ['#e07a5f', '#81b29a', '#f2cc8f', '#3d405b'] },
  { name: 'KIOSK', frame: '#264653', awning: ['#e76f51', '#ffffff'], sign: '#e76f51', ink: '#ffffff', goods: ['#e9c46a', '#f4a261', '#2a9d8f', '#e76f51'] },
  { name: 'BAR', frame: '#1b1b1e', awning: ['#5a189a', '#e0aaff'], sign: '#1b1b1e', ink: '#e0aaff', goods: ['#ffb703', '#8ecae6', '#e0aaff'] },
  { name: 'SPÄTI', frame: '#14213d', awning: ['#fca311', '#ffffff'], sign: '#fca311', ink: '#14213d', goods: ['#fca311', '#e5e5e5', '#d62828'] },
  { name: 'FRISEUR', frame: '#6d6875', awning: ['#b5838d', '#ffcdb2'], sign: '#ffcdb2', ink: '#6d6875', goods: ['#ffcdb2', '#e5989b', '#ffffff'] },
];

/** One shop bay: the frame, a big window with shelves of goods, and a door in it; and what of it glows at night. */
function bayTextures(s: Shop): { map: THREE.CanvasTexture; lit: THREE.CanvasTexture } {
  const W = 192;
  const H = 128;
  const draw = (g: CanvasRenderingContext2D, night: boolean) => {
    g.fillStyle = night ? '#000000' : s.frame;
    g.fillRect(0, 0, W, H);
    // The window: from the bay's left edge to the door, under the sign band at the top.
    const top = 26;
    const bottom = H - 8;
    const wx0 = 10;
    const wx1 = 128;
    g.fillStyle = night ? '#ffd9a0' : '#a8c8d8';
    g.fillRect(wx0, top, wx1 - wx0, bottom - top);
    // Shelves of goods in it.
    for (let row = 0; row < 3; row++) {
      const y = top + 18 + row * 26;
      g.fillStyle = night ? '#7a5a3a' : '#e6e1d8';
      g.fillRect(wx0 + 4, y + 14, wx1 - wx0 - 8, 3);
      for (let k = 0; k < 7; k++) {
        g.fillStyle = s.goods[(k + row) % s.goods.length];
        const h = 8 + ((k * 5 + row * 3) % 6);
        g.fillRect(wx0 + 8 + k * 15, y + 14 - h, 10, h);
      }
    }
    if (!night) {
      // A glint across the glass.
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.beginPath();
      g.moveTo(wx0 + 20, bottom);
      g.lineTo(wx0 + 44, top);
      g.lineTo(wx0 + 56, top);
      g.lineTo(wx0 + 32, bottom);
      g.fill();
    }
    // The door: glass in a frame, a handle.
    const dx0 = 142;
    const dx1 = 180;
    g.fillStyle = night ? '#000000' : '#1f2328';
    g.fillRect(dx0 - 3, top - 3, dx1 - dx0 + 6, H - top + 3);
    g.fillStyle = night ? '#c99a5a' : '#8fb3c4';
    g.fillRect(dx0, top, dx1 - dx0, H - top);
    g.fillStyle = night ? '#000000' : '#d9d9d9';
    g.fillRect(dx0 + 4, top + 40, 4, 20);
    // Mullions round the window.
    if (!night) {
      g.strokeStyle = '#1f2328';
      g.lineWidth = 4;
      g.strokeRect(wx0, top, wx1 - wx0, bottom - top);
    }
  };
  return { map: tilingCanvasTexture(W, H, (g) => draw(g, false)), lit: tilingCanvasTexture(W, H, (g) => draw(g, true)) };
}

/** The sign over a shop: its name on its own ground. */
function signTexture(s: Shop): THREE.CanvasTexture {
  return canvasTexture(512, 96, (g) => {
    g.fillStyle = s.sign;
    g.fillRect(0, 0, 512, 96);
    g.strokeStyle = s.ink;
    g.lineWidth = 6;
    g.strokeRect(6, 6, 500, 84);
    g.fillStyle = s.ink;
    g.font = 'bold 58px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(s.name, 256, 52);
  });
}

/** Striped canvas for an awning, the stripes running out from the wall. */
function awningTexture(s: Shop): THREE.CanvasTexture {
  return tilingCanvasTexture(64, 16, (g) => {
    g.fillStyle = s.awning[0];
    g.fillRect(0, 0, 64, 16);
    g.fillStyle = s.awning[1];
    g.fillRect(0, 0, 32, 16);
  });
}

/** Meshes put together by material, keeping their textures' coordinates (mergeByMaterial drops them). */
function mergeTextured(meshes: THREE.Mesh[]): THREE.Object3D[] {
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const m of meshes) {
    m.updateMatrix();
    const geo = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrix);
    const mat = m.material as THREE.Material;
    byMat.set(mat, [...(byMat.get(mat) ?? []), geo]);
  }
  return [...byMat].map(([mat, geos]) => {
    const out = new THREE.Mesh(mergeGeometries(geos)!, mat);
    for (const g of geos) g.dispose();
    out.receiveShadow = true;
    return out;
  });
}

/** Whether there's a road within 12 m out from (x, z) along (dx, dz): a city street, the office's, or the loop. */
function roadOut(x: number, z: number, dx: number, dz: number): boolean {
  for (let d = 1; d <= 12; d += 0.5) {
    const px = x + dx * d;
    const pz = z + dz * d;
    if (onCityStreet(px, pz) || onLoop(px, pz) || (pz > ROAD.minZ && pz < ROAD.maxZ && Math.abs(px) < STREET_END)) return true;
  }
  return false;
}

/** Which sides of `lot` face a street (not the next lot on its block, nor the country): +z, -z, +x, -x. */
export function streetSides(lot: Lot): { pz: boolean; nz: boolean; px: boolean; nx: boolean } {
  const i = Math.round((lot.x - CITY_X + PERIOD / 2) / PERIOD);
  const j = Math.round((lot.z - CITY_Z + PERIOD / 2) / PERIOD);
  const bx = CITY_X - PERIOD / 2 + i * PERIOD;
  const bz = CITY_Z - PERIOD / 2 + j * PERIOD;
  const edge = BLOCK_INNER / 2 - 5;
  const hw = lot.w / 2;
  const hd = lot.d / 2;
  return {
    pz: lot.z + hd > bz + edge && roadOut(lot.x, lot.z + hd, 0, 1),
    nz: lot.z - hd < bz - edge && roadOut(lot.x, lot.z - hd, 0, -1),
    px: lot.x + hw > bx + edge && roadOut(lot.x + hw, lot.z, 1, 0),
    nx: lot.x - hw < bx - edge && roadOut(lot.x - hw, lot.z, -1, 0),
  };
}

/** Whether a lot gets shops: the buildings close enough to walk to (see Lot.ring). */
export const hasShops = (lot: Lot) => lot.ring < 2;

/** The shops on the ground floors of `lots`, built into `group`. */
export function buildShops(group: THREE.Group, lots: readonly Lot[], night: NightParts) {
  const gradient = (toon('#fff') as THREE.MeshToonMaterial).gradientMap;
  const fronts = SHOPS.map(() => new Walls());
  const parts = new THREE.Group();
  /** The signs and awnings: textured, so merged keeping their UVs. */
  const textured: THREE.Mesh[] = [];
  const signMats = new Map<number, THREE.Material>();
  const awnMats = new Map<number, THREE.Material>();
  const signOf = (k: number) => signMats.get(k) ?? (signMats.set(k, new THREE.MeshBasicMaterial({ map: signTexture(SHOPS[k]) })), signMats.get(k)!);
  const awningOf = (k: number) => awnMats.get(k) ?? (awnMats.set(k, new THREE.MeshToonMaterial({ map: awningTexture(SHOPS[k]), gradientMap: gradient })), awnMats.get(k)!);
  const plinth = toon('#5b5f69');
  let n = 0;
  for (const lot of lots) {
    if (!hasShops(lot)) continue;
    const sides = streetSides(lot);
    const hw = lot.w / 2;
    const hd = lot.d / 2;
    /** One side: from corner `a` along `u` (length `len`), facing out along `n`. */
    const side = (a: [number, number], u: [number, number], len: number, nrm: [number, number], on: boolean) => {
      const k = (Math.abs(Math.round(lot.x * 7 + lot.z * 13)) + n++) % SHOPS.length;
      const bays = Math.max(1, Math.round(len / SHOP_BAY));
      // The shop front, or on a side to the next lot plain wall: the frame color without windows.
      const w = fronts[on ? k : 0];
      if (!on) {
        // A plain stretch of wall low down (the frame's color, no window): drawn with the bay's left edge.
        w.quad([a[0], G, a[1]], [u[0] * len, 0, u[1] * len], SHOP_H, [nrm[0], 0, nrm[1]], [0, 0, 0.04, 0.1]);
        return;
      }
      w.quad([a[0], G, a[1]], [u[0] * len, 0, u[1] * len], SHOP_H, [nrm[0], 0, nrm[1]], [0, 0, bays, 1]);
      const mid: [number, number] = [a[0] + (u[0] * len) / 2, a[1] + (u[1] * len) / 2];
      const yaw = Math.atan2(nrm[0], nrm[1]);
      // The awning: tilted down away from the wall, along most of the front.
      const awGeo = new THREE.BoxGeometry(len - 0.6, 0.08, 1.4);
      // A stripe pair every 1.2 m, however long the front.
      const uv = awGeo.getAttribute('uv');
      for (let q = 0; q < uv.count; q++) uv.setX(q, uv.getX(q) * ((len - 0.6) / 1.2));
      const aw = mesh(awGeo, awningOf(k), 0, 0, 0, false);
      // Hung from just under the sign band (the top 0.85 m of the front), over the windows.
      aw.position.set(mid[0] + nrm[0] * 0.68, G + SHOP_H - 1.12, mid[1] + nrm[1] * 0.68);
      aw.rotation.set(0, yaw, 0, 'YXZ');
      aw.rotateX(0.32);
      textured.push(aw);
      // The sign over it, on the wall: as long as the name needs, up to the front's length.
      const sh = 0.66;
      const sw = Math.min(len - 1, sh * (512 / 96));
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(sw, sw * (96 / 512)), signOf(k));
      sign.position.set(mid[0] + nrm[0] * 0.06, G + SHOP_H - 0.44, mid[1] + nrm[1] * 0.06);
      sign.rotation.y = yaw;
      textured.push(sign);
      // A dark plinth along the bottom, and a ledge over the shop front.
      const pl = mesh(new THREE.BoxGeometry(len, 0.25, 0.12), plinth, mid[0] + nrm[0] * 0.04, G + 0.12, mid[1] + nrm[1] * 0.04, false);
      pl.rotation.y = yaw;
      parts.add(pl);
      const ledge = mesh(new THREE.BoxGeometry(len + 0.2, 0.18, 0.35), plinth, mid[0] + nrm[0] * 0.15, G + SHOP_H, mid[1] + nrm[1] * 0.15, false);
      ledge.rotation.y = yaw;
      parts.add(ledge);
    };
    side([lot.x - hw, lot.z + hd], [1, 0], lot.w, [0, 1], sides.pz);
    side([lot.x + hw, lot.z - hd], [-1, 0], lot.w, [0, -1], sides.nz);
    side([lot.x + hw, lot.z + hd], [0, -1], lot.d, [1, 0], sides.px);
    side([lot.x - hw, lot.z - hd], [0, 1], lot.d, [-1, 0], sides.nx);
  }
  fronts.forEach((w, k) => {
    if (!w.pos.length) return;
    const { map, lit } = bayTextures(SHOPS[k]);
    const m = new THREE.MeshToonMaterial({ map, emissive: '#ffffff', emissiveMap: lit, emissiveIntensity: 0, gradientMap: gradient });
    night.windows.push(m);
    const front = new THREE.Mesh(w.geometry(), m);
    front.receiveShadow = true;
    group.add(front);
  });
  for (const m of signMats.values()) (m as THREE.MeshBasicMaterial).color.setScalar(0.92);
  group.add(mergeByMaterial(parts), ...mergeTextured(textured));
}
