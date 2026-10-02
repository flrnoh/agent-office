import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LOTS } from '../../../shared/city';
import { DOOR_H, DOOR_W, FRONT_T, LOT_PLANS, SHOP_H, SHOP_KIND_BY_ID, SHOPS, SIDES, SILL, WALL_T, WINDOW_TOP, doorLeaf, faceOf, hasShops, shopRect, type Shop, type ShopKind } from '../../../shared/shops';
import { shopRoom } from '../../../shared/shop-rooms';
import type { NightParts } from '../outside';
import { tilingCanvasTexture } from '../texture';
import { mesh, toon } from '../toon';
import { ColorBoxes, colorBoxMaterial, litBoxMaterial } from './boxes';
import { G, PAINTS } from './kit';

// flrnoh fork (see FORK.md "Shops to walk into"): the shops on the ground floors of the buildings close
// by, as shared/shops.ts lays them out: shop fronts with real windows (glass you see through) and an
// open door, an awning and a sign, and behind them each shop's room: its floor, ceiling and walls, lit
// from inside (a little by day, warm at night), with a window display of goods. What stands in a shop
// is only built for the few near you (features/shops); from afar this is all there is. Over the shops
// the building's own walls and windows go on up (town/buildings.ts starts them at SHOP_H).

export { SHOP_H, hasShops } from '../../../shared/shops';

/** Striped canvas for an awning, the stripes running out from the wall. */
function awningTexture(s: ShopKind): THREE.CanvasTexture {
  return tilingCanvasTexture(64, 16, (g) => {
    g.fillStyle = s.awning[0];
    g.fillRect(0, 0, 64, 16);
    g.fillStyle = s.awning[1];
    g.fillRect(0, 0, 32, 16);
  });
}

/** Meshes put together by material, keeping their textures' coordinates (mergeByMaterial drops them). */
export function mergeTextured(meshes: THREE.Mesh[]): THREE.Object3D[] {
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

/** The see-through glass of the shop windows and doors: you see into the shop, lit at night. */
export const SHOP_GLASS = new THREE.MeshBasicMaterial({ color: '#cfe8f2', transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
SHOP_GLASS.userData.outlineParameters = { visible: false };

export interface TownShops {
  /** The rooms' light: `dark` is how dark it is outside (0–1). */
  light(dark: number): void;
}

/** The shops on the ground floors of the city's buildings, built into `group`. */
export function buildShops(group: THREE.Group, night: NightParts): TownShops {
  const frames = new ColorBoxes();
  const rooms = new ColorBoxes();
  const glass: THREE.BufferGeometry[] = [];
  /** The signs and awnings: textured, so merged keeping their UVs. */
  const textured: THREE.Mesh[] = [];
  const gradient = (toon('#fff') as THREE.MeshToonMaterial).gradientMap;
  const awnMats = new Map<string, THREE.Material>();
  const awningOf = (k: ShopKind) => awnMats.get(k.id) ?? (awnMats.set(k.id, new THREE.MeshToonMaterial({ map: awningTexture(k), gradientMap: gradient })), awnMats.get(k.id)!);
  const plinth = '#5b5f69';
  const pane = (s: Shop, u0: number, u1: number, y0: number, y1: number, v = FRONT_T / 2) => {
    const g = new THREE.PlaneGeometry(u1 - u0, y1 - y0);
    const p = shopRect(s, u0, u1, v, v);
    g.rotateY(s.nx !== 0 ? Math.PI / 2 : 0);
    g.translate((p.minX + p.maxX) / 2, G + (y0 + y1) / 2, (p.minZ + p.maxZ) / 2);
    glass.push(g);
  };

  for (const s of SHOPS) {
    const k = SHOP_KIND_BY_ID.get(s.kind)!;
    const L = s.len;
    const D = s.depth;
    const box = (out: ColorBoxes, u0: number, u1: number, v0: number, v1: number, y0: number, y1: number, color: string) => out.box(shopRect(s, u0, u1, v0, v1), G + y0, G + y1, color);
    const d0 = s.doorU - DOOR_W / 2;
    const d1 = s.doorU + DOOR_W / 2;
    // The front, in the shop's frame color, with windows either side of the door: the outer face
    // in the frame's color, a thin skin inside in the room's.
    const front = (u0: number, u1: number, y0: number, y1: number) => {
      box(frames, u0, u1, 0, FRONT_T - 0.04, y0, y1, k.frame);
      box(rooms, u0, u1, FRONT_T - 0.04, FRONT_T, y0, y1, k.wall);
    };
    front(0, 0.3, 0, SHOP_H);
    front(L - 0.3, L, 0, SHOP_H);
    front(0.3, L - 0.3, WINDOW_TOP, SHOP_H);
    front(d0, d1, DOOR_H, WINDOW_TOP);
    front(d0 - 0.22, d0, 0, WINDOW_TOP);
    front(d1, d1 + 0.22, 0, WINDOW_TOP);
    for (const [w0, w1] of [
      [0.3, d0 - 0.22],
      [d1 + 0.22, L - 0.3],
    ]) {
      if (w1 - w0 < 0.2) {
        if (w1 > w0) front(w0, w1, 0, WINDOW_TOP);
        continue;
      }
      front(w0, w1, 0, SILL);
      // Mullions every couple of meters, and the glass between.
      const n = Math.max(1, Math.round((w1 - w0) / 2.4));
      const step = (w1 - w0) / n;
      for (let i = 1; i < n; i++) box(frames, w0 + i * step - 0.05, w0 + i * step + 0.05, 0.02, FRONT_T - 0.02, SILL, WINDOW_TOP, k.frame);
      pane(s, w0, w1, SILL, WINDOW_TOP);
    }
    // The door, propped open against the inside of the front: a frame round its glass.
    const leaf = doorLeaf(s);
    box(frames, leaf.u0, leaf.u1, leaf.v0, leaf.v1, 0, 0.12, '#1f2328');
    box(frames, leaf.u0, leaf.u1, leaf.v0, leaf.v1, DOOR_H - 0.16, DOOR_H - 0.04, '#1f2328');
    box(frames, leaf.u0, leaf.u1, leaf.v1 - 0.06, leaf.v1, 0, DOOR_H - 0.04, '#1f2328');
    box(frames, leaf.u0, leaf.u1, leaf.v0, leaf.v0 + 0.06, 0, DOOR_H - 0.04, '#1f2328');
    {
      const g = new THREE.PlaneGeometry(DOOR_W - 0.2, DOOR_H - 0.3);
      const p = shopRect(s, leaf.hinge, leaf.hinge, leaf.v0 + 0.07, leaf.v1 - 0.07);
      g.rotateY(s.nx !== 0 ? 0 : Math.PI / 2);
      g.translate((p.minX + p.maxX) / 2, G + 0.12 + (DOOR_H - 0.3) / 2, (p.minZ + p.maxZ) / 2);
      glass.push(g);
    }
    // A step of a threshold, the plinth and the ledge over the front.
    box(frames, d0, d1, -0.02, FRONT_T, -0.02, 0.03, '#8d99ae');
    box(frames, 0, d0, -0.12, 0.02, 0, 0.25, plinth);
    box(frames, d1, L, -0.12, 0.02, 0, 0.25, plinth);
    box(frames, -0.1, L + 0.1, -0.35, 0.02, SHOP_H - 0.09, SHOP_H + 0.09, plinth);
    // The room: its walls, floor and ceiling, lit from inside.
    box(rooms, 0, WALL_T, FRONT_T, D, 0, SHOP_H, k.wall);
    box(rooms, L - WALL_T, L, FRONT_T, D, 0, SHOP_H, k.wall);
    box(rooms, 0, L, D - WALL_T, D, 0, SHOP_H, k.wall);
    rooms.box(shopRect(s, WALL_T, L - WALL_T, FRONT_T, D - WALL_T), G - 0.05, G + 0.01, k.floor, [false, false, true, false, false, false]);
    rooms.box(shopRect(s, WALL_T, L - WALL_T, FRONT_T, D - WALL_T), G + SHOP_H - 0.06, G + SHOP_H - 0.02, '#f8f4ec', [false, false, false, true, false, false]);
    // The window display: low stands behind the glass with goods on them, seen from the street.
    for (const p of shopRoom(s).pieces) {
      if (p.what !== 'display') continue;
      box(rooms, p.u0, p.u1, p.v0, p.v1, 0, p.h, '#e6e1d8');
      if (p.v0 > FRONT_T + 0.2) continue;
      const n = Math.floor((p.u1 - p.u0 - 0.3) / 0.38);
      for (let i = 0; i < n; i++) {
        const u = p.u0 + 0.25 + i * 0.38;
        const h = 0.18 + ((i * 7 + s.i) % 5) * 0.06;
        box(rooms, u, u + 0.24, p.v0 + 0.1, p.v0 + 0.32, p.h, p.h + h, k.goods[(i + s.i) % k.goods.length]);
      }
    }
    // The awning: tilted down away from the wall, along most of the front.
    const mid = shopRect(s, L / 2, L / 2, 0, 0);
    const mx = mid.minX;
    const mz = mid.minZ;
    const yaw = Math.atan2(s.nx, s.nz);
    const awGeo = new THREE.BoxGeometry(L - 0.6, 0.08, 1.4);
    // A stripe pair every 1.2 m, however long the front.
    const uv = awGeo.getAttribute('uv');
    for (let q = 0; q < uv.count; q++) uv.setX(q, uv.getX(q) * ((L - 0.6) / 1.2));
    const aw = mesh(awGeo, awningOf(k), 0, 0, 0, false);
    aw.position.set(mx + s.nx * 0.68, G + SHOP_H - 1.12, mz + s.nz * 0.68);
    aw.rotation.set(0, yaw, 0, 'YXZ');
    aw.rotateX(0.32);
    textured.push(aw);
    // The sign over it, the cladding, shutters and house number: town/shopfronts.ts.
  }

  // The rest of the ground floor of a building with shops: plain wall where there are none.
  LOTS.forEach((lot, li) => {
    if (!hasShops(lot)) return;
    const plan = LOT_PLANS[li];
    const wall = PAINTS[lot.paint].wall;
    for (const side of SIDES) {
      const f = faceOf(lot, side);
      const r = plan.rooms[side];
      const spans: [number, number][] = r ? [[0, r.from], [r.to, f.len]] : [[0, f.len]];
      for (const [a, b] of spans) {
        if (b - a < 0.01) continue;
        const frame = { ox: f.ax, oz: f.az, ux: f.ux, uz: f.uz, nx: f.nx, nz: f.nz };
        // A hair proud of the face, so a corner shop's own side wall behind it never flickers through.
        frames.box(shopRect(frame, a, b, -0.02, 0.1), G, G + SHOP_H, wall);
        frames.box(shopRect(frame, a, b, -0.1, 0.02), G, G + 0.25, plinth);
      }
    }
  });

  const frameMesh = new THREE.Mesh(frames.geometry(), colorBoxMaterial());
  frameMesh.receiveShadow = true;
  const roomMat = litBoxMaterial();
  const roomMesh = new THREE.Mesh(rooms.geometry(), roomMat);
  roomMesh.receiveShadow = true;
  const glassMesh = new THREE.Mesh(mergeGeometries(glass)!, SHOP_GLASS);
  glassMesh.renderOrder = 2;
  for (const g of glass) g.dispose();
  group.add(frameMesh, roomMesh, glassMesh, ...mergeTextured(textured));
  void night;
  return {
    light(dark) {
      // A little by day (it's under the building), warm and bright at night, so the windows glow.
      roomMat.emissiveIntensity = 0.32 + 0.45 * dark;
      SHOP_GLASS.opacity = 0.16 - 0.08 * dark;
    },
  };
}
