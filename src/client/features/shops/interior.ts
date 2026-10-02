import * as THREE from 'three';
import { SHOP_H, SHOP_KIND_BY_ID, type Shop, type ShopKind } from '../../../shared/shops';
import { shopRoom, type Piece } from '../../../shared/shop-rooms';
import { litBoxMaterial } from '../../world/town/boxes';
import { G } from '../../world/town/kit';
import { mergeByColor, mesh, toon } from '../../world/toon';
import { kindDecor, type Live } from './decor';
import { furnishRide } from './decor-ride'; // bikes, pets, laundry

// flrnoh fork (see FORK.md "Shops to walk into"): what stands in a shop, built only while you're near
// it (index.ts keeps a handful) and let go of again: the counter, shelves of goods, tables and chairs,
// the barber's chairs and mirrors, crates of records, and the things only one kind of shop has
// (decor.ts). It's laid out in the shop's own frame (shared/shop-rooms.ts): here x is u along the
// front, z is -v (into the shop is -z), y up from the street. Everything that doesn't move is merged
// into a mesh or two, lit from inside like the room around it (its colors glow a little by day, warm
// at night: see light).

/** Everything plain in every interior: toon shading in its own colors, glowing as the room's lit. */
const LIT = litBoxMaterial();

/** A material made for one interior, let go of with it. */
export function own<M extends THREE.Material>(m: M): M {
  m.userData.own = true;
  return m;
}

/** Where (u, y, v) of a shop is in its interior's frame. */
export const at = (u: number, y: number, v: number) => new THREE.Vector3(u, y, -v);
/** The heading in an interior's frame that faces along (du, dv) of the shop. */
export const yawOf = (du: number, dv: number) => Math.atan2(du, -dv);

export interface Interior {
  shop: Shop;
  kind: ShopKind;
  /** In the town's frame (street at G): put into the town's group. */
  group: THREE.Group;
  /** What moves: the döner's spit, the toy train, a record turning. */
  live: Live[];
  /** What E is aimed at: invisible boxes over the counter, the chairs, the crates. */
  hits: THREE.Mesh[];
  dispose(): void;
}

/** A box `w` × `h` × `d` with its bottom middle at (u, y, v). */
function box(parent: THREE.Object3D, w: number, h: number, d: number, color: THREE.ColorRepresentation | THREE.Material, u: number, y: number, v: number) {
  const m = mesh(new THREE.BoxGeometry(w, h, d), color instanceof THREE.Material ? color : toon(color), u, y + h / 2, -v, false);
  parent.add(m);
  return m;
}
const cyl = (parent: THREE.Object3D, r0: number, r1: number, h: number, color: string, u: number, y: number, v: number, segs = 12) => {
  const m = mesh(new THREE.CylinderGeometry(r0, r1, h, segs), toon(color), u, y + h / 2, -v, false);
  parent.add(m);
  return m;
};

/** Goods on shelves: little boxes and jars in the shop's colors, `rows` shelves up, along a shelf facing (du, dv). */
function goods(parent: THREE.Object3D, p: Piece, colors: string[], rows: number, seed: number, bottles = false) {
  const alongU = Math.abs(p.du) < 0.5;
  const len = alongU ? p.u1 - p.u0 : p.v1 - p.v0;
  const deep = alongU ? p.v1 - p.v0 : p.u1 - p.u0;
  const n = Math.max(1, Math.floor((len - 0.1) / 0.16));
  for (let r = 0; r < rows; r++) {
    const y = 0.35 + (r * (p.h - 0.45)) / Math.max(1, rows);
    // The shelf board.
    const bu = alongU ? (p.u0 + p.u1) / 2 : p.du > 0 ? p.u0 + deep / 2 : p.u1 - deep / 2;
    const bv = alongU ? (p.v0 + p.v1) / 2 : (p.v0 + p.v1) / 2;
    box(parent, alongU ? len - 0.04 : deep - 0.04, 0.03, alongU ? deep - 0.04 : len - 0.04, '#d9cbb5', bu, y - 0.03, bv);
    for (let i = 0; i < n; i++) {
      const k = (i * 7 + r * 3 + seed) % 11;
      if (k === 0) continue;
      const along = (alongU ? p.u0 : p.v0) + 0.1 + i * ((len - 0.2) / Math.max(1, n - 1 || 1));
      const color = colors[(i + r + seed) % colors.length];
      const h = bottles ? 0.22 : 0.08 + (k % 4) * 0.035;
      const u = alongU ? along : bu;
      const v = alongU ? bv : along;
      if (bottles) {
        cyl(parent, 0.025, 0.03, h * 0.7, color, u, y, v, 8);
        cyl(parent, 0.01, 0.025, h * 0.3, color, u, y + h * 0.7, v, 8);
      } else box(parent, 0.1, h, 0.1, color, u, y, v);
    }
  }
}

/** The pieces anyone might have: what shared/shop-rooms.ts lays out, in the shop's colors. */
function furnish(still: THREE.Group, s: Shop, k: ShopKind, p: Piece) {
  const w = p.u1 - p.u0;
  const d = p.v1 - p.v0;
  const cu = (p.u0 + p.u1) / 2;
  const cv = (p.v0 + p.v1) / 2;
  const wood = k.neon ? '#2b2024' : k.id === 'apotheke' || k.id === 'friseur' ? '#f1ece4' : '#8d6e63';
  switch (p.what) {
    case 'counter':
      box(still, w, p.h - 0.06, d, wood, cu, 0, cv);
      box(still, w + 0.08, 0.06, d + 0.1, k.id === 'bar' ? '#6b4226' : '#e6e1d8', cu, p.h - 0.06, cv);
      // A kick plate in the shop's color, along its front.
      box(still, w, 0.18, 0.02, k.frame, cu, 0, p.v0 - 0.01);
      // The till at one end.
      box(still, 0.34, 0.16, 0.3, '#343a40', p.u1 - 0.3, p.h, cv);
      box(still, 0.3, 0.12, 0.02, '#8ecae6', p.u1 - 0.3, p.h + 0.18, cv + 0.05);
      return;
    case 'vitrine': {
      box(still, w, 0.85, d, wood, cu, 0, cv);
      const glass = new THREE.Mesh(new THREE.BoxGeometry(w - 0.06, 0.32, d - 0.06), own(new THREE.MeshBasicMaterial({ color: '#d7f0fa', transparent: true, opacity: 0.25, depthWrite: false })));
      glass.position.copy(at(cu, 0.85 + 0.16, cv));
      glass.material.userData.outlineParameters = { visible: false };
      still.add(glass);
      const n = Math.floor((w - 0.2) / 0.22);
      for (let i = 0; i < n; i++) {
        const c = k.id === 'doener' ? ['#7cb518', '#e63946', '#f1f1f1', '#ffd166', '#6a994e'][i % 5] : k.goods[i % k.goods.length];
        const g = mesh(new THREE.SphereGeometry(0.08, 8, 6), toon(c), p.u0 + 0.16 + i * 0.22, 0.9, -cv, false);
        g.scale.set(1, 0.45, 1.2);
        still.add(g);
      }
      return;
    }
    case 'backshelf':
    case 'shelf':
    case 'tallshelf': {
      const back = Math.abs(p.du) < 0.5;
      // The frame: a back panel and two sides.
      box(still, back ? w : 0.04, p.h, back ? 0.04 : d, wood, back ? cu : p.du > 0 ? p.u0 + 0.02 : p.u1 - 0.02, 0, back ? p.v1 - 0.02 : cv);
      const bottles = k.id === 'bar' || (k.id === 'spaeti' && p.what === 'backshelf');
      const colors = k.id === 'buchladen' ? ['#e07a5f', '#81b29a', '#f2cc8f', '#3d405b', '#9c6644', '#264653'] : k.id === 'bar' ? ['#ffb703', '#8ecae6', '#e0aaff', '#2a9d8f', '#d62828'] : k.goods;
      goods(still, p, colors, p.h > 2.1 ? 5 : p.h > 1.7 ? 4 : 3, s.i + Math.round(p.u0 * 10), bottles);
      return;
    }
    case 'fridge': {
      box(still, w, p.h, d, '#e9ecef', cu, 0, cv);
      const glow = own(new THREE.MeshToonMaterial({ color: '#dff6ff', emissive: '#bfefff', emissiveIntensity: 0.6, gradientMap: (toon('#fff') as THREE.MeshToonMaterial).gradientMap }));
      const front = p.du > 0 ? p.u1 + 0.005 : p.u0 - 0.005;
      const door = mesh(new THREE.PlaneGeometry(d - 0.12, p.h - 0.3), glow, front, p.h / 2 + 0.05, -cv, false);
      door.rotation.y = p.du > 0 ? Math.PI / 2 : -Math.PI / 2;
      still.add(door);
      for (let r = 0; r < 4; r++) for (let i = 0; i < Math.floor((d - 0.2) / 0.13); i++) {
        const c = ['#d62828', '#fca311', '#2a9d8f', '#8a5a12', '#2b59c3'][(i + r) % 5];
        cyl(still, 0.03, 0.03, 0.2, c, front - p.du * 0.12, 0.3 + r * 0.42, p.v0 + 0.12 + i * 0.13, 8);
      }
      return;
    }
    case 'table':
    case 'hightable': {
      const top = k.id === 'pizza' ? '#fefae0' : k.id === 'cafe' ? '#f6e7cb' : '#adb5bd';
      cyl(still, Math.min(w, d) / 2, Math.min(w, d) / 2, 0.04, top, cu, p.h - 0.04, cv, 20);
      if (k.id === 'pizza') cyl(still, Math.min(w, d) / 2 - 0.05, Math.min(w, d) / 2 - 0.05, 0.005, '#d62828', cu, p.h, cv, 4);
      cyl(still, 0.04, 0.04, p.h - 0.04, '#495057', cu, 0, cv, 8);
      cyl(still, 0.22, 0.24, 0.03, '#495057', cu, 0, cv, 12);
      if (p.what === 'table') {
        // Two chairs, either side along u.
        for (const side of [-1, 1]) {
          const x = cu + side * (w / 2 + 0.3);
          box(still, 0.38, 0.05, 0.38, wood, x, 0.45, cv);
          box(still, 0.04, 0.45, 0.38, wood, x + side * 0.17, 0.5, cv);
          for (const [a, b] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) box(still, 0.03, 0.45, 0.03, '#495057', x + a * 0.16, 0, cv + b * 0.16);
        }
        // A cup or two on it.
        cyl(still, 0.04, 0.035, 0.07, '#fffaf3', cu - 0.1, p.h, cv + 0.05, 10);
      }
      return;
    }
    case 'oven': {
      box(still, w, 0.9, d, '#9c6644', cu, 0, cv);
      const dome = mesh(new THREE.SphereGeometry(Math.min(w, d * 1.4) / 2, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), toon('#b5651d'), cu, 0.9, -cv, false);
      dome.scale.set(1, 0.9, d / w);
      still.add(dome);
      const mouth = own(new THREE.MeshToonMaterial({ color: '#ff7b00', emissive: '#ff5400', emissiveIntensity: 0.9, gradientMap: (toon('#fff') as THREE.MeshToonMaterial).gradientMap }));
      const m = mesh(new THREE.CircleGeometry(0.22, 16, 0, Math.PI), mouth, cu, 0.92, -(p.v0 - 0.01), false);
      still.add(m);
      return;
    }
    case 'buckets': {
      const n = Math.max(1, Math.floor(w / 0.35)) * Math.max(1, Math.floor(d / 0.35));
      const cols = Math.max(1, Math.floor(w / 0.35));
      for (let i = 0; i < n; i++) {
        const u = p.u0 + 0.18 + (i % cols) * 0.35;
        const v = p.v0 + 0.18 + Math.floor(i / cols) * 0.35;
        cyl(still, 0.14, 0.11, 0.32, '#9aa5b1', u, 0, v, 10);
        for (let f = 0; f < 6; f++) {
          const a = f * 1.3 + i;
          const c = ['#ff8fab', '#ffd166', '#c77dff', '#d62828', '#ffffff', '#ff7b00'][(i + f) % 6];
          cyl(still, 0.006, 0.006, 0.3, '#3f7f3a', u + Math.cos(a) * 0.06, 0.3, v + Math.sin(a) * 0.06, 4);
          still.add(mesh(new THREE.SphereGeometry(0.045, 8, 6), toon(c), u + Math.cos(a) * 0.07, 0.62 + (f % 3) * 0.04, -(v + Math.sin(a) * 0.07), false));
        }
      }
      return;
    }
    case 'newsrack': {
      box(still, w, p.h, d, '#6c757d', cu, 0, cv);
      for (let r = 0; r < 4; r++) for (let i = 0; i < Math.floor(d / 0.3); i++) {
        const paper = box(still, 0.02, 0.28, 0.22, ['#f1f1ee', '#ffd6a5', '#e5e5e5', '#caf0f8'][(i + r) % 4], p.u1 + 0.01, 0.2 + r * 0.32, p.v0 + 0.16 + i * 0.3);
        paper.rotation.z = -0.15;
      }
      return;
    }
    case 'crates':
      for (let i = 0; i < 3; i++) {
        box(still, 0.4, 0.3, 0.3, ['#d62828', '#2a9d8f', '#fca311'][i], cu - 0.22 + (i % 2) * 0.44, Math.floor(i / 2) * 0.3, cv);
        for (let b = 0; b < 4; b++) cyl(still, 0.025, 0.025, 0.1, '#6b3d12', cu - 0.34 + (i % 2) * 0.44 + b * 0.08, Math.floor(i / 2) * 0.3 + 0.3, cv, 6);
      }
      return;
    case 'mirror': {
      box(still, 0.04, 1.3, d + 0.1, '#c9a227', p.u0 + 0.02, 1.0, cv);
      const glass = own(new THREE.MeshToonMaterial({ color: '#cfe8f2', emissive: '#a9d6f5', emissiveIntensity: 0.35, gradientMap: (toon('#fff') as THREE.MeshToonMaterial).gradientMap }));
      const m = mesh(new THREE.PlaneGeometry(d - 0.02, 1.15), glass, p.u0 + 0.05 * Math.sign(p.du || 1), 1.65, -cv, false);
      m.rotation.y = p.du > 0 ? Math.PI / 2 : -Math.PI / 2;
      still.add(m);
      // A shelf under it with bottles and a pair of scissors.
      box(still, 0.25, 0.03, d, '#f1ece4', p.u0 + 0.12 * Math.sign(p.du || 1), 0.95, cv);
      for (let i = 0; i < 3; i++) cyl(still, 0.025, 0.03, 0.14, ['#b5838d', '#ffffff', '#6d6875'][i], p.u0 + 0.12 * Math.sign(p.du || 1), 0.98, p.v0 + 0.15 + i * 0.12, 8);
      return;
    }
    case 'barberchair':
    case 'tattoochair': {
      const leather = p.what === 'barberchair' ? '#1d3557' : '#111111';
      cyl(still, 0.06, 0.2, 0.42, '#adb5bd', cu, 0, cv, 12);
      const seatY = p.what === 'barberchair' ? 0.5 : 0.55;
      box(still, 0.55, 0.12, 0.55, leather, cu, seatY, cv);
      // The back, behind whoever sits (against du), a headrest; arms either side.
      const back = cu - p.du * 0.27;
      const b = box(still, 0.1, p.what === 'tattoochair' ? 0.5 : 0.75, 0.52, leather, back, seatY + 0.1, cv);
      if (p.what === 'tattoochair') b.rotation.z = p.du * 0.6;
      else box(still, 0.08, 0.16, 0.26, leather, back - p.du * 0.02, seatY + 0.9, cv);
      for (const side of [-1, 1]) box(still, 0.45, 0.06, 0.07, '#adb5bd', cu, seatY + 0.28, cv + side * 0.28);
      // A footrest out in front.
      box(still, 0.12, 0.05, 0.4, '#adb5bd', cu + p.du * 0.42, 0.18, cv);
      return;
    }
    case 'stool':
      cyl(still, 0.03, 0.03, p.h - 0.06, '#adb5bd', cu, 0, cv, 8);
      cyl(still, 0.18, 0.18, 0.06, k.id === 'bar' ? '#5a189a' : '#343a40', cu, p.h - 0.06, cv, 14);
      return;
    case 'traintable':
      box(still, w, p.h - 0.05, d, '#386641', cu, 0, cv);
      box(still, w + 0.04, 0.05, d + 0.04, '#8ecae6', cu, p.h - 0.05, cv);
      return;
    case 'recordcrate':
      box(still, w, p.h - 0.35, d, '#5e503f', cu, 0, cv);
      box(still, w, 0.35, 0.03, '#a68a64', cu, p.h - 0.35, p.v0 + 0.015);
      box(still, w, 0.35, 0.03, '#a68a64', cu, p.h - 0.35, p.v1 - 0.015);
      return;
    case 'listening':
      box(still, w, p.h, d, '#343a40', cu, 0, cv);
      return;
    default:
      furnishRide(still, s, k, p);
  }
}

/** Lamps on the ceiling: little glowing discs, a row down the middle of the room. */
function lamps(live: THREE.Group, s: Shop, k: ShopKind) {
  const mat = own(new THREE.MeshBasicMaterial({ color: k.neon ? '#ffb4e6' : '#fff2d6' })); // the neon kinds' (the bar, the tattoo studio, the Spielhalle)
  mat.userData.outlineParameters = { visible: false };
  const n = Math.max(1, Math.round(s.len / 3));
  for (let i = 0; i < n; i++) for (const v of [s.depth * 0.35, s.depth * 0.72]) {
    const m = mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.04, 16), mat, (i + 0.5) * (s.len / n), SHOP_H - 0.1, -v, false);
    live.add(m);
  }
}

/** Builds what's in shop `s`, in the town's frame (street at G). */
export function buildInterior(s: Shop): Interior {
  const k = SHOP_KIND_BY_ID.get(s.kind)!;
  const room = shopRoom(s);
  const still = new THREE.Group();
  const liveGroup = new THREE.Group();
  for (const p of room.pieces) furnish(still, s, k, p);
  // The step behind the counter the keeper stands on.
  const c = room.pieces.find((p) => p.what === 'counter' || p.what === 'vitrine');
  if (c) box(still, c.u1 - c.u0, 0.3, room.keeper.v + 0.45 - c.v1, '#6c757d', (c.u0 + c.u1) / 2, 0, (c.v1 + room.keeper.v + 0.45) / 2);
  const live: Live[] = kindDecor(still, liveGroup, s, k, room);
  lamps(liveGroup, s, k);
  const merged = mergeByColor(still);
  merged.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && (m.material as THREE.MeshToonMaterial).vertexColors) m.material = LIT;
  });
  // What was built to be merged goes now; what's merged and what moves stays.
  still.traverse((o) => (o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry.dispose());
  const group = new THREE.Group();
  group.position.set(s.ox, G, s.oz);
  group.rotation.y = Math.atan2(-s.uz, s.ux);
  group.add(merged, liveGroup);
  // What E lands on: a box over each station's thing, invisible but there for the aim.
  const hits: THREE.Mesh[] = [];
  const hitMat = own(new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
  hitMat.userData.outlineParameters = { visible: false };
  for (const t of room.stations) {
    const size = t.at === 'counter' ? [Math.min(3.4, s.len - 1), 1.3, 1.2] : [1, 1.4, 1];
    const v = t.at === 'counter' ? t.v + 0.6 : t.v;
    const u = t.at === 'chair' && t.seat ? t.seat.u : t.at === 'listen' ? t.u - 0.6 : t.u;
    const hv = t.at === 'crate' ? t.v + 0.85 : v;
    const hit = t.hit ? new THREE.Mesh(new THREE.BoxGeometry(t.hit.w, t.hit.h, t.hit.d), hitMat) : new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), hitMat);
    hit.position.copy(t.hit ? at(t.hit.u, t.hit.h / 2, t.hit.v) : at(u, size[1] / 2, hv));
    hit.userData.station = t;
    hits.push(hit);
    group.add(hit);
  }
  return {
    shop: s,
    kind: k,
    group,
    live,
    hits,
    dispose() {
      group.removeFromParent();
      group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.geometry.dispose();
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mat of mats) if ((mat as THREE.Material).userData.own) (mat as THREE.Material).dispose();
      });
    },
  };
}

/** The interiors' light: a little by day (it's under the building), warm at night. */
export function interiorLight(dark: number) {
  LIT.emissiveIntensity = 0.12 + 0.18 * dark;
}
