import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { DOOR_H, DOOR_W, SHOP_H, SHOP_KIND_BY_ID, SHOP_KINDS, SHOPS, SILL, WINDOW_TOP, shopPoint, shopRect, type Shop, type ShopKind } from '../../../shared/shops';
import { frontStyle, neonLevel, shopOpen } from '../../../shared/shopfronts';
import { CHAIR_OFF, OUTSIDE, outsideSolids, type OutsidePiece } from '../../../shared/shop-outside';
import type { Collider } from '../types';
import { CLAD_TILE, chalkTexture, claddingTexture, numberAtlas, shutterTexture, signTexture } from './shopfront-looks';
import { ColorBoxes, colorBoxMaterial } from './boxes';
import { G, glowTexture } from './kit';
import { mergeTextured } from './shops';

// flrnoh fork (see FORK.md "Shop fronts"): the shops' fronts as each kind has them (shared/shopfronts.ts):
// the cladding round the windows (boards, tiles, brick, dark panels, stripes), the window frames with a
// transom, a step at the door, a house number, the sign (a painted board, a lightbox, or neon letters that
// glow at night and, on some, stutter now and then on the office's clock), and what's put out in front by
// day (shared/shop-outside.ts). At closing time on the office's clock a roller shutter comes down, the
// door's locked (a collider in it), the goods outside go in, and the sign goes dark. Everything for a
// kind is merged into a few meshes, so it's shown or hidden, lit or dark, a kind at a time: a few dozen
// draw calls for the whole city.

/** How long a shutter takes to come down or go up (s). */
const ROLL = 2.5;
const FAR = 1e7;

interface KindParts {
  kind: ShopKind;
  /** What's out in front while it's open. */
  goods: THREE.Object3D[];
  shutter: THREE.Mesh | null;
  sign: THREE.MeshBasicMaterial;
  glow: THREE.MeshBasicMaterial | null;
  /** 0 open … 1 shut (the shutter's way down). */
  shut: number;
  open: boolean;
  /** The colliders in its doors, and what's out in front, with where they are when they're there. */
  doors: { c: Collider; at: Pick<Collider, 'minX' | 'maxX' | 'minZ' | 'maxZ'>; shop: number }[];
  props: { c: Collider; at: Pick<Collider, 'minX' | 'maxX' | 'minZ' | 'maxZ'> }[];
}

export interface ShopFronts {
  /**
   * Each frame: `t` seconds and `hour` (0–24) on the office's clock, how dark it is (0–1), and the shop
   * you're in (its door stays open for you to get out), or -1.
   */
  update(t: number, dt: number, hour: number, dark: number, inside: number): void;
  /** Whether a shop is open now (as last updated). */
  isOpen(shop: number): boolean;
  /** For a look from the console: draw calls and triangles of all of it. */
  stats(): { meshes: number; triangles: number };
}

/** Somewhere for geometry to be placed from, in a shop's frame. */
const o3 = new THREE.Object3D();
function placed(geo: THREE.BufferGeometry, s: Shop, u: number, v: number, y: number, turn = 0, tilt = 0): THREE.BufferGeometry {
  const p = shopPoint(s, u, v);
  o3.position.set(p.x, G + y, p.z);
  o3.rotation.set(tilt, Math.atan2(s.nx, s.nz) + turn, 0, 'YXZ');
  o3.updateMatrix();
  return geo.applyMatrix4(o3.matrix);
}

/** Round things in a color, for merging with the rest of a kind's (position, normal, color). */
function tinted(geo: THREE.BufferGeometry, color: string): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  const c = new THREE.Color(color);
  const n = g.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** A plane on a shop's front (facing out), u0..u1 along, y0..y1 up, `v` out from it (negative), its UVs a tile per CLAD_TILE. */
function facePlane(s: Shop, u0: number, u1: number, y0: number, y1: number, v: number, tile = CLAD_TILE): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(u1 - u0, y1 - y0);
  const uv = g.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (u0 + uv.getX(i) * (u1 - u0)) / tile, (y0 + uv.getY(i) * (y1 - y0)) / tile);
  return placed(g, s, (u0 + u1) / 2, v, (y0 + y1) / 2);
}

export function buildShopFronts(group: THREE.Group, colliders: Collider[]): ShopFronts {
  const boxMat = colorBoxMaterial();
  const gradient = boxMat.gradientMap;
  const statics = new ColorBoxes();
  const textured: THREE.Mesh[] = [];
  const atlas = numberAtlas(SHOPS.length);
  const numberMat = new THREE.MeshBasicMaterial({ map: atlas.tex });
  const shutterMat = new THREE.MeshToonMaterial({ map: shutterTexture(), gradientMap: gradient });
  const glowTex = glowTexture();
  const parts = new Map<string, KindParts>();
  const meshes: THREE.Object3D[] = [];

  const kinds = [...new Set(SHOPS.map((s) => s.kind))];
  for (const id of kinds) {
    const k = SHOP_KIND_BY_ID.get(id) ?? SHOP_KINDS[0];
    const style = frontStyle(id);
    const shops = SHOPS.filter((s) => s.kind === id);
    const clad = new THREE.MeshToonMaterial({ map: claddingTexture(k, style), gradientMap: gradient });
    const neon = style.sign === 'neon';
    const sign = new THREE.MeshBasicMaterial({ map: signTexture(k, neon), transparent: neon, depthWrite: !neon });
    sign.userData.outlineParameters = { visible: false };
    const glow = neon ? new THREE.MeshBasicMaterial({ map: glowTex, color: k.ink, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }) : null;
    if (glow) glow.userData.outlineParameters = { visible: false };
    const cladGeos: THREE.BufferGeometry[] = [];
    const goods = new ColorBoxes();
    const rounds: THREE.BufferGeometry[] = [];
    const chalk: THREE.BufferGeometry[] = [];
    const shutters: THREE.BufferGeometry[] = [];
    const kp: KindParts = { kind: k, goods: [], shutter: null, sign, glow, shut: 0, open: true, doors: [], props: [] };
    parts.set(id, kp);

    for (const s of shops) {
      const L = s.len;
      const d0 = s.doorU - DOOR_W / 2;
      const d1 = s.doorU + DOOR_W / 2;
      const sb = (out: ColorBoxes, u0: number, u1: number, v0: number, v1: number, y0: number, y1: number, color: string) => out.box(shopRect(s, u0, u1, v0, v1), G + y0, G + y1, color);
      // The cladding, a hair out from the front: the ends, under the windows, and the band over them.
      const v = -0.012;
      cladGeos.push(facePlane(s, 0, 0.3, 0.25, SHOP_H - 0.09, v), facePlane(s, L - 0.3, L, 0.25, SHOP_H - 0.09, v), facePlane(s, 0.3, L - 0.3, WINDOW_TOP + 0.26, SHOP_H - 0.09, v));
      for (const [w0, w1] of [[0.3, d0 - 0.22], [d1 + 0.22, L - 0.3]]) if (w1 - w0 > 0.05) cladGeos.push(facePlane(s, w0, w1, 0.25, SILL, v));
      cladGeos.push(facePlane(s, d0 - 0.22, d0, 0.25, WINDOW_TOP, v), facePlane(s, d1, d1 + 0.22, 0.25, WINDOW_TOP, v), facePlane(s, d0, d1, DOOR_H, WINDOW_TOP + 0.26, v));
      // The windows' frames: round each, with a transom across, and the door's.
      const trim = k.frame;
      for (const [w0, w1] of [[0.3, d0 - 0.22], [d1 + 0.22, L - 0.3]]) {
        if (w1 - w0 < 0.2) continue;
        sb(statics, w0, w1, -0.05, 0.02, SILL - 0.04, SILL + 0.04, trim);
        sb(statics, w0, w1, -0.05, 0.02, WINDOW_TOP - 0.06, WINDOW_TOP, trim);
        sb(statics, w0, w0 + 0.06, -0.05, 0.02, SILL, WINDOW_TOP, trim);
        sb(statics, w1 - 0.06, w1, -0.05, 0.02, SILL, WINDOW_TOP, trim);
        sb(statics, w0, w1, -0.04, 0.02, 2.45, 2.51, trim);
        // A ledge under the window to sit things on.
        sb(statics, w0 - 0.03, w1 + 0.03, -0.14, 0.02, SILL - 0.08, SILL - 0.03, '#d9d4cc');
      }
      sb(statics, d0 - 0.06, d0, -0.05, 0.02, 0, DOOR_H, trim);
      sb(statics, d1, d1 + 0.06, -0.05, 0.02, 0, DOOR_H, trim);
      sb(statics, d0 - 0.06, d1 + 0.06, -0.05, 0.02, DOOR_H - 0.06, DOOR_H, trim);
      // A step up to the door.
      sb(statics, d0 - 0.12, d1 + 0.12, -0.34, 0.0, 0, 0.12, '#9aa1ab');
      // The shutter's box over the windows and the door, and the shutter itself (down, scaled up out of sight while open).
      if (style.shutter) {
        sb(statics, 0.3, L - 0.3, -0.2, 0.0, WINDOW_TOP, WINDOW_TOP + 0.26, '#8e959c');
        shutters.push(facePlane(s, 0.3, L - 0.3, 0, WINDOW_TOP, -0.11, 0.5));
      }
      // The house number, on the jamb by the door.
      {
        const n = s.i;
        const g = new THREE.PlaneGeometry(0.2, 0.2);
        const cu = (n % atlas.cols) / atlas.cols;
        const cv = 1 - (Math.floor(n / atlas.cols) + 1) / atlas.cols;
        const uv = g.getAttribute('uv');
        for (let i = 0; i < uv.count; i++) uv.setXY(i, cu + uv.getX(i) / atlas.cols, cv + uv.getY(i) / atlas.cols);
        textured.push(new THREE.Mesh(placed(g, s, s.doorU < L / 2 ? d1 + 0.11 : d0 - 0.11, -0.03, 2.25), numberMat));
      }
      // The sign: on a board or in a lit box, or neon letters on the wall with their glow round them.
      const sh = 0.66;
      const sw = Math.min(L - 1, sh * (512 / 96));
      const hgt = sw * (96 / 512);
      const sy = SHOP_H - 0.44;
      const depth = style.sign === 'lightbox' ? 0.18 : style.sign === 'board' ? 0.06 : 0;
      if (depth) sb(statics, L / 2 - sw / 2 - 0.04, L / 2 + sw / 2 + 0.04, -depth, 0, sy - hgt / 2 - 0.04, sy + hgt / 2 + 0.04, style.sign === 'board' ? trim : '#2b2d33');
      // A hair out from its board or box, or for neon from the cladding (itself at v); the glow clear of the frames' faces (-0.05).
      textured.push(new THREE.Mesh(placed(new THREE.PlaneGeometry(sw, hgt), s, L / 2, (depth ? -depth : v) - 0.012, sy), sign));
      if (glow) textured.push(new THREE.Mesh(placed(new THREE.PlaneGeometry(sw * 1.25, hgt * 2.6), s, L / 2, -0.07, sy), glow));
      // The door's lock: a collider in its gap, there only while it's shut.
      const door = shopRect(s, d0, d1, -0.02, 0.25);
      const c: Collider = { minX: FAR, maxX: FAR, minZ: FAR, maxZ: FAR, bottom: G, top: G + DOOR_H, fence: true };
      colliders.push(c);
      kp.doors.push({ c, at: door, shop: s.i });
      // What's out in front.
      OUTSIDE[s.i].forEach((p) => props(s, k, p, goods, rounds, chalk));
    }
    for (const sol of outsideSolids().filter((x) => SHOPS[x.shop].kind === id)) {
      const c: Collider = { minX: sol.minX, maxX: sol.maxX, minZ: sol.minZ, maxZ: sol.maxZ, bottom: G, top: G + sol.top, fence: true };
      colliders.push(c);
      kp.props.push({ c, at: { minX: sol.minX, maxX: sol.maxX, minZ: sol.minZ, maxZ: sol.maxZ } });
    }
    const add = (m: THREE.Mesh) => {
      m.receiveShadow = true;
      group.add(m);
      meshes.push(m);
      return m;
    };
    add(new THREE.Mesh(mergeGeometries(cladGeos)!, clad));
    if (!goods.empty) kp.goods.push(add(new THREE.Mesh(goods.geometry(), boxMat)));
    if (rounds.length) kp.goods.push(add(new THREE.Mesh(mergeGeometries(rounds)!, boxMat)));
    if (chalk.length && style.chalk) {
      const m = new THREE.MeshBasicMaterial({ map: chalkTexture(style.chalk) });
      kp.goods.push(add(new THREE.Mesh(mergeGeometries(chalk)!, m)));
    }
    if (shutters.length) {
      kp.shutter = add(new THREE.Mesh(mergeGeometries(shutters)!, shutterMat));
      kp.shutter.visible = false;
    }
  }
  const staticMesh = new THREE.Mesh(statics.geometry(), boxMat);
  staticMesh.receiveShadow = true;
  group.add(staticMesh);
  meshes.push(staticMesh);
  for (const m of mergeTextured(textured)) {
    group.add(m);
    meshes.push(m);
  }

  const openNow = new Map<number, boolean>();
  return {
    update(t, dt, hour, dark, inside) {
      for (const [id, kp] of parts) {
        const open = shopOpen(id, hour);
        kp.open = open;
        // The shutter rolls down after closing time and up in the morning.
        kp.shut = THREE.MathUtils.clamp(kp.shut + (open ? -dt : dt) / ROLL, 0, 1);
        if (kp.shutter) {
          const k = Math.max(0.001, kp.shut);
          kp.shutter.visible = kp.shut > 0.002;
          // Rolled up into its box over the windows.
          kp.shutter.scale.y = k;
          kp.shutter.position.y = (G + WINDOW_TOP) * (1 - k);
        }
        for (const g of kp.goods) g.visible = open;
        for (const d of kp.doors) {
          const lock = !open && d.shop !== inside;
          Object.assign(d.c, lock ? d.at : { minX: FAR, maxX: FAR, minZ: FAR, maxZ: FAR });
          openNow.set(d.shop, open);
        }
        for (const p of kp.props) Object.assign(p.c, open ? p.at : { minX: FAR, maxX: FAR, minZ: FAR, maxZ: FAR });
        // The sign: a painted board in the street's light, a lightbox lit while it's open, neon glowing (and stuttering).
        const style = frontStyle(id);
        const lvl = style.sign === 'neon' ? (open ? neonLevel(id, 0, t) : 0) : 1;
        const lit = style.sign === 'board' ? 0.92 - 0.55 * dark : open ? 0.92 + 0.08 * dark : 0.92 - 0.6 * dark;
        kp.sign.color.setScalar(style.sign === 'neon' ? (open ? 0.55 + 0.45 * dark : 0.35) * (0.25 + 0.75 * lvl) : lit);
        if (kp.glow) kp.glow.opacity = open ? (0.12 + 0.5 * dark) * lvl : 0;
      }
    },
    isOpen: (shop) => openNow.get(shop) ?? true,
    stats() {
      let triangles = 0;
      for (const m of meshes) {
        const g = (m as THREE.Mesh).geometry;
        triangles += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
      }
      return { meshes: meshes.length, triangles };
    },
  };
}

/** What `p` is, put together out of boxes and round things in `s`'s frame. */
function props(s: Shop, k: ShopKind, p: OutsidePiece, boxes: ColorBoxes, rounds: THREE.BufferGeometry[], chalk: THREE.BufferGeometry[]) {
  const b = (u0: number, u1: number, v0: number, v1: number, y0: number, y1: number, color: string) => boxes.box(shopRect(s, u0, u1, v0, v1), G + y0, G + y1, color);
  const mid = (p.u0 + p.u1) / 2;
  const vm = (p.v0 + p.v1) / 2;
  const goods = k.goods.length ? k.goods : ['#e76f51', '#2a9d8f', '#e9c46a'];
  switch (p.what) {
    case 'tables': {
      // A round table between two chairs facing the street, under a parasol in the awning's colors.
      const v = vm + 0.05;
      rounds.push(placed(tinted(new THREE.CylinderGeometry(0.32, 0.32, 0.04, 16), '#e9e5dc'), s, mid, v, 0.74));
      rounds.push(placed(tinted(new THREE.CylinderGeometry(0.03, 0.03, 2.3, 5, 1, true), '#555b61'), s, mid, v, 1.15));
      rounds.push(placed(tinted(new THREE.CylinderGeometry(0.22, 0.25, 0.04, 12), '#555b61'), s, mid, v, 0.02));
      rounds.push(placed(tinted(new THREE.ConeGeometry(1.15, 0.45, 8), k.awning[0]), s, mid, v, 2.35));
      rounds.push(placed(tinted(new THREE.SphereGeometry(0.05, 6, 4), k.awning[1]), s, mid, v, 2.6));
      for (const side of [-1, 1]) {
        const u = mid + side * CHAIR_OFF;
        b(u - 0.21, u + 0.21, v - 0.2, v + 0.2, 0.43, 0.48, '#3c3f45');
        // The back against the wall, legs under it.
        b(u - 0.21, u + 0.21, v + 0.16, v + 0.2, 0.48, 0.92, '#3c3f45');
        for (const du of [-0.18, 0.18]) for (const dv of [-0.17, 0.17]) b(u + du - 0.02, u + du + 0.02, v + dv - 0.02, v + dv + 0.02, 0, 0.43, '#2b2d31');
      }
      break;
    }
    case 'crates': {
      // A stand of three crates sloping toward the street, heaped with fruit and vegetables.
      b(p.u0, p.u1, p.v0 + 0.1, p.v1, 0, 0.45, '#8a6a48');
      for (let i = 0; i < 3; i++) {
        const u0 = p.u0 + 0.04 + i * ((p.u1 - p.u0) / 3);
        const u1 = u0 + (p.u1 - p.u0) / 3 - 0.08;
        b(u0, u1, p.v0 + 0.05, p.v1 - 0.03, 0.45, 0.62, '#c49a6c');
        const col = goods[i % goods.length];
        const fruit = ['#e63946', '#f4a261', '#7cb518', '#ffd166', '#6a994e'][(i + s.i) % 5];
        for (let q = 0; q < 6; q++) {
          const fu = u0 + 0.07 + (q % 3) * ((u1 - u0 - 0.14) / 2);
          const fv = p.v0 + 0.15 + Math.floor(q / 3) * 0.28;
          rounds.push(placed(tinted(new THREE.SphereGeometry(0.075, 5, 3), q % 2 ? fruit : col === '#ffffff' ? fruit : fruit), s, fu, fv, 0.66));
        }
      }
      break;
    }
    case 'flowers': {
      // Zinc buckets of flowers on two steps.
      b(p.u0, p.u1, p.v0 + 0.25, p.v1, 0, 0.3, '#6b705c');
      const cols = ['#ff8fab', '#ffd166', '#c77dff', '#ef476f', '#ffffff', '#f77f00'];
      for (let i = 0; i < 6; i++) {
        const u = p.u0 + 0.15 + (i % 3) * ((p.u1 - p.u0 - 0.3) / 2);
        const back = i < 3;
        const v = back ? p.v1 - 0.17 : p.v0 + 0.15;
        const y = back ? 0.3 : 0;
        rounds.push(placed(tinted(new THREE.CylinderGeometry(0.13, 0.1, 0.3, 7, 1, true), '#9aa5ad'), s, u, v, y + 0.15));
        rounds.push(placed(tinted(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 3, 1, true), '#386641'), s, u, v, y + 0.42));
        rounds.push(placed(tinted(new THREE.SphereGeometry(0.17, 6, 4).scale(1, 0.75, 1), cols[(i + s.i) % cols.length]), s, u, v, y + 0.58));
      }
      break;
    }
    case 'papers': {
      // A wire rack of papers by the door.
      b(p.u0 + 0.05, p.u0 + 0.08, p.v0 + 0.05, p.v0 + 0.08, 0, 1.3, '#3d4148');
      b(p.u1 - 0.08, p.u1 - 0.05, p.v0 + 0.05, p.v0 + 0.08, 0, 1.3, '#3d4148');
      for (let r = 0; r < 4; r++) {
        const y = 0.3 + r * 0.26;
        b(p.u0 + 0.05, p.u1 - 0.05, p.v0 + 0.03 + r * 0.06, p.v1, y - 0.02, y, '#3d4148');
        b(p.u0 + 0.08, p.u1 - 0.08, p.v0 + 0.06 + r * 0.06, p.v0 + 0.1 + r * 0.06, y, y + 0.24, ['#f1faee', '#e63946', '#f1faee', '#ffd166'][r]);
      }
      break;
    }
    case 'board': {
      // A sandwich board, chalk on both sides, its legs splayed.
      const h = 0.95;
      for (const side of [-1, 1]) {
        const g = new THREE.PlaneGeometry(0.56, h);
        if (side > 0) g.rotateY(Math.PI);
        chalk.push(placed(g, s, mid, vm + side * 0.12, h / 2, 0, side * 0.2));
      }
      break;
    }
    case 'bikes': {
      // Two bikes leaning on the front, side by side along it.
      const cols = ['#264653', '#e63946', '#2a9d8f', '#f4a261', '#3a86ff'];
      for (let i = 0; i < 2; i++) {
        const u = p.u0 + 0.5 + i * 0.85;
        const v = p.v1 - 0.12 - i * 0.22;
        const col = cols[(s.i + i) % cols.length];
        for (const du of [-0.38, 0.38]) rounds.push(placed(tinted(new THREE.TorusGeometry(0.31, 0.025, 3, 12), '#1f2328'), s, u + du, v, 0.33));
        // Frame: the top tube, the down tube (as boxes), the saddle and the bars.
        b(u - 0.33, u + 0.3, v - 0.02, v + 0.02, 0.62, 0.66, col);
        b(u - 0.05, u + 0.05, v - 0.02, v + 0.02, 0.3, 0.64, col);
        b(u - 0.38, u - 0.34, v - 0.02, v + 0.02, 0.33, 0.66, col);
        b(u + 0.34, u + 0.38, v - 0.02, v + 0.02, 0.33, 0.84, col);
        b(u - 0.4, u - 0.24, v - 0.05, v + 0.05, 0.72, 0.76, '#2b2d31');
        b(u + 0.34, u + 0.38, v - 0.24, v + 0.24, 0.84, 0.87, '#2b2d31');
      }
      break;
    }
    case 'gumball': {
      // A bubblegum machine on the wall: a red body, a glass globe of colored balls.
      b(mid - 0.12, mid + 0.12, p.v1 - 0.22, p.v1, 0.85, 1.12, '#d62828');
      b(mid - 0.04, mid + 0.04, p.v1 - 0.25, p.v1 - 0.22, 0.95, 1.02, '#c0c0c0');
      rounds.push(placed(tinted(new THREE.SphereGeometry(0.15, 10, 8), '#e8f4f8'), s, mid, p.v1 - 0.12, 1.26));
      for (let q = 0; q < 5; q++) rounds.push(placed(tinted(new THREE.SphereGeometry(0.035, 4, 3), goods[q % goods.length]), s, mid - 0.08 + q * 0.04, p.v1 - 0.18, 1.18 + (q % 2) * 0.05));
      b(mid - 0.12, mid + 0.12, p.v1 - 0.22, p.v1, 1.38, 1.44, '#d62828');
      break;
    }
  }
}
