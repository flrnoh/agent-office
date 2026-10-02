import * as THREE from 'three';
import { TOP_COLORS } from '../../../shared/avatar';
import { FRONT_T, shopRect, type Shop, type ShopKind } from '../../../shared/shops';
import { shopRoom, type Piece, type Room } from '../../../shared/shop-rooms';
import { canvasTexture } from '../../world/texture';
import { mesh, toon } from '../../world/toon';
import type { Live } from './decor';

// flrnoh fork (see FORK.md "Shops to walk into", the boutique and the optician): what stands in
// those two (decor.ts calls wearDecor for them). The boutique: rails of clothes on hangers, changing
// cubicles whose curtains draw shut while someone's in one, a tall mirror, mannequins in the window.
// The optician: a wall of glasses, frames on a table and in the window, an eye chart, a mirror.
// `still` is merged by color; `live` is kept as it is (the curtains move, the chart is a picture).

const at = (u: number, y: number, v: number) => new THREE.Vector3(u, y, -v);
function box(parent: THREE.Object3D, w: number, h: number, d: number, color: string | THREE.Material, u: number, y: number, v: number) {
  const m = mesh(new THREE.BoxGeometry(w, h, d), typeof color === 'string' ? toon(color) : color, u, y + h / 2, -v, false);
  parent.add(m);
  return m;
}
function cyl(parent: THREE.Object3D, r: number, h: number, color: string, u: number, y: number, v: number, segs = 10) {
  const m = mesh(new THREE.CylinderGeometry(r, r, h, segs), toon(color), u, y + h / 2, -v, false);
  parent.add(m);
  return m;
}
const own = <M extends THREE.Material>(m: M): M => {
  m.userData.own = true;
  return m;
};

/** Who's standing where on the street (wear.ts fills it in), and whether one of them is in a cubicle. */
export const cubicles = {
  who: (): { x: number; z: number }[] => [],
  /** Whether (x, z) is in shop `s`'s cubicle `n`, inside its walls and curtain. */
  holds(s: Shop, n: number, x: number, z: number): boolean {
    const p = shopRoom(s).pieces.filter((q) => q.what === 'cubicle')[n];
    if (!p) return false;
    const r = shopRect(s, p.u0 + 0.1, p.u1 - 0.1, p.v0 + 0.1, p.v1 - 0.1);
    return x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ;
  },
};

let chart: THREE.CanvasTexture | null = null;
/** The eye chart: rows of letters getting smaller. */
const eyeChart = () =>
  (chart ??= canvasTexture(256, 384, (g) => {
    g.fillStyle = '#fbfbf8';
    g.fillRect(0, 0, 256, 384);
    g.fillStyle = '#111111';
    g.textAlign = 'center';
    const rows = ['E', 'F P', 'T O Z', 'L P E D', 'P E C F D', 'E D F C Z P', 'F E L O P Z D'];
    rows.forEach((r, i) => {
      g.font = `bold ${Math.round(78 - i * 10.5)}px Georgia, serif`;
      g.fillText(r, 128, 78 + i * 46 - i * i * 1.2);
    });
    g.fillStyle = '#d62828';
    g.fillRect(24, 360, 208, 3);
  }));

/** A garment on a hanger, hanging from a rail at height `y`, its front facing along u (side -1/1) or v. */
function garment(parent: THREE.Object3D, u: number, y: number, v: number, alongV: boolean, color: string, kind: number) {
  const long = kind % 4 === 3;
  const h = long ? 0.95 : 0.6;
  const w = 0.42;
  const [bw, bd] = alongV ? [w, 0.05] : [0.05, w];
  // The hanger's hook and shoulders.
  cyl(parent, 0.006, 0.08, '#adb5bd', u, y - 0.08, v, 6);
  box(parent, alongV ? 0.36 : 0.02, 0.02, alongV ? 0.02 : 0.36, '#8d6e63', u, y - 0.1, v);
  box(parent, bw, h, bd, color, u, y - 0.1 - h, v);
  // Sleeves on the shirts and jackets, a flare on the dresses.
  if (long) box(parent, alongV ? w + 0.14 : 0.04, 0.3, alongV ? 0.04 : w + 0.14, color, u, y - 0.1 - h, v);
  else box(parent, alongV ? w + 0.16 : 0.04, 0.16, alongV ? 0.04 : w + 0.16, color, u, y - 0.26, v);
}

/** A clothes rail: two posts and a bar along its long side, garments on hangers. */
function rack(still: THREE.Group, p: Piece, seed: number) {
  const alongV = p.v1 - p.v0 > p.u1 - p.u0;
  const cu = (p.u0 + p.u1) / 2;
  const cv = (p.v0 + p.v1) / 2;
  const len = alongV ? p.v1 - p.v0 : p.u1 - p.u0;
  const bar = p.h - 0.05;
  for (const e of [-1, 1]) {
    const u = alongV ? cu : cu + e * (len / 2 - 0.05);
    const v = alongV ? cv + e * (len / 2 - 0.05) : cv;
    cyl(still, 0.02, bar, '#c0c4c8', u, 0, v, 8);
    box(still, alongV ? 0.45 : 0.06, 0.03, alongV ? 0.06 : 0.45, '#6c757d', u, 0, v);
  }
  box(still, alongV ? 0.03 : len - 0.1, 0.03, alongV ? len - 0.1 : 0.03, '#c0c4c8', cu, bar, cv);
  const n = Math.floor((len - 0.2) / 0.13);
  for (let i = 0; i < n; i++) {
    const a = -len / 2 + 0.16 + i * 0.13;
    const color = TOP_COLORS[(i * 5 + seed) % TOP_COLORS.length];
    garment(still, alongV ? cu : cu + a, bar, alongV ? cv + a : cv, !alongV, color, i + seed);
  }
}

/** A mannequin on the display at (u, y, v), in a top (and on some a skirt) of `color`. */
function mannequin(still: THREE.Group, u: number, y: number, v: number, color: string, dress: boolean) {
  const skin = '#ece6dc';
  cyl(still, 0.12, 0.03, '#2b2d42', u, y, v, 14);
  cyl(still, 0.02, 0.7, '#2b2d42', u, y, v, 6);
  const body = mesh(new THREE.CapsuleGeometry(0.17, 0.28, 4, 10), toon(color), u, y + 1.0, -v, false);
  still.add(body);
  if (dress) still.add(mesh(new THREE.CylinderGeometry(0.17, 0.27, 0.36, 14), toon(color), u, y + 0.68, -v, false));
  else for (const x of [-0.07, 0.07]) still.add(mesh(new THREE.CapsuleGeometry(0.06, 0.32, 4, 8), toon('#3d405b'), u + x, y + 0.62, -v, false));
  still.add(mesh(new THREE.SphereGeometry(0.13, 12, 10), toon(skin), u, y + 1.42, -v, false));
  for (const x of [-0.21, 0.21]) still.add(mesh(new THREE.CapsuleGeometry(0.045, 0.3, 4, 8), toon(color), u + x, y + 0.98, -v, false));
}

/** A pair of glasses `w` wide at (u, y, v), facing along (du, dv): two rings and a bridge. */
function specs(still: THREE.Group, u: number, y: number, v: number, du: number, dv: number, color: string, i: number) {
  const g = new THREE.Group();
  g.position.copy(at(u, y, v));
  g.rotation.y = Math.atan2(du, -dv);
  const r = 0.032;
  const square = i % 3 === 1;
  for (const x of [-0.04, 0.04]) {
    const ring = mesh(new THREE.TorusGeometry(r, i % 3 === 2 ? 0.007 : 0.004, 4, square ? 4 : 14), toon(color), x, 0, 0, false);
    if (square) ring.rotation.z = Math.PI / 4;
    g.add(ring);
  }
  g.add(mesh(new THREE.BoxGeometry(0.02, 0.005, 0.005), toon(color), 0, 0.01, 0, false));
  still.add(g);
}

/** The curtain in front of cubicle `p`: folds that bunch up at one end, and draw shut while someone's in. */
function curtain(live: THREE.Group, s: Shop, p: Piece, n: number): Live {
  const front = p.du > 0 ? p.u1 : p.u0;
  const W = p.v1 - p.v0 - 0.1;
  box(live, 0.03, 0.03, W + 0.1, '#c0c4c8', front, 2.05, (p.v0 + p.v1) / 2);
  const N = 6;
  const folds: THREE.Mesh[] = [];
  const mats = [own(toon('#b56576').clone()), own(toon('#9e4f63').clone())];
  for (let i = 0; i < N; i++) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.035, 1.82, W / N + 0.01), mats[i % 2]);
    f.castShadow = false;
    f.receiveShadow = true;
    live.add(f);
    folds.push(f);
  }
  let k = 0.18;
  const place = () =>
    folds.forEach((f, i) => {
      // From the far end (v1) back toward v0: open, they're bunched against the far wall.
      const w = (W / N) * k;
      f.scale.z = k;
      f.position.copy(at(front + (i % 2 ? 0.025 : -0.025), 0.2 + 0.91, p.v1 - 0.05 - (i + 0.5) * w));
    });
  place();
  let since = 1;
  let shut = false;
  return {
    update: (_t, dt) => {
      since += dt;
      if (since > 0.15) {
        since = 0;
        shut = cubicles.who().some((q) => cubicles.holds(s, n, q.x, q.z));
      }
      const want = shut ? 1 : 0.18;
      if (Math.abs(want - k) < 0.002) return;
      k += (want - k) * Math.min(1, dt * 5);
      place();
    },
  };
}

/** The boutique's and the optician's own things; the curtains (and the chart) go in `live`. */
export function wearDecor(still: THREE.Group, live: THREE.Group, s: Shop, k: ShopKind, room: Room): Live[] {
  const out: Live[] = [];
  const pieces = (what: Piece['what']) => room.pieces.filter((p) => p.what === what);
  const windowDisplay = pieces('display').find((p) => p.v0 <= FRONT_T + 0.2);
  for (const p of pieces('rack')) rack(still, p, s.i + Math.round(p.v0 * 3));
  for (const w of pieces('cubiclewall')) box(still, w.u1 - w.u0, w.h, w.v1 - w.v0, '#e9e2d8', (w.u0 + w.u1) / 2, 0, (w.v0 + w.v1) / 2);
  pieces('cubicle').forEach((p, n) => {
    // A mirror on the wall inside, a stool and a hook.
    const back = p.du > 0 ? p.u0 + 0.02 : p.u1 - 0.02;
    box(still, 0.03, 1.3, 0.5, '#c9a227', back, 0.5, (p.v0 + p.v1) / 2);
    box(still, 0.04, 1.2, 0.42, '#cfe8f2', back + p.du * 0.01, 0.55, (p.v0 + p.v1) / 2);
    cyl(still, 0.16, 0.42, '#8d6e63', back + p.du * 0.35, 0, p.v0 + 0.3, 12);
    out.push(curtain(live, s, p, n));
  });
  for (const p of pieces('standmirror')) {
    const cu = (p.u0 + p.u1) / 2;
    box(still, p.u1 - p.u0 + 0.1, p.h + 0.1, 0.04, k.id === 'optiker' ? '#1d3557' : '#c9a227', cu, 0.05, p.v1 - 0.02);
    box(still, p.u1 - p.u0 - 0.04, p.h - 0.1, 0.02, '#d6ecf5', cu, 0.15, p.v0);
  }
  if (k.id === 'boutique' && windowDisplay) {
    const p = windowDisplay;
    for (let u = p.u0 + 0.5, i = 0; u < p.u1 - 0.3; u += 0.95, i++) mannequin(still, u, p.h, (p.v0 + p.v1) / 2, k.goods[(i + s.i) % k.goods.length], (i + s.i) % 3 === 1);
  }
  if (k.id === 'optiker') {
    for (const p of pieces('glasswall')) {
      box(still, 0.06, p.h, p.v1 - p.v0, '#f4f1ea', p.du > 0 ? p.u0 + 0.03 : p.u1 - 0.03, 0, (p.v0 + p.v1) / 2);
      const face = p.du > 0 ? p.u1 : p.u0;
      for (let r = 0; r < 6; r++) {
        const y = 0.75 + r * 0.25;
        box(still, p.u1 - p.u0, 0.02, p.v1 - p.v0, '#d9cbb5', (p.u0 + p.u1) / 2, y - 0.05, (p.v0 + p.v1) / 2);
        for (let v = p.v0 + 0.15, i = 0; v < p.v1 - 0.1; v += 0.22, i++) specs(still, face - p.du * 0.05, y, v, p.du, 0, k.goods[(i + r + s.i) % k.goods.length], i + r);
      }
    }
    for (const p of pieces('display'))
      for (let u = p.u0 + 0.15, i = 0; u < p.u1 - 0.1; u += 0.22, i++) {
        // On the window display, on little stands; on the table, lying open.
        const stand = p === windowDisplay;
        if (stand) cyl(still, 0.01, 0.16, '#adb5bd', u, p.h, p.v0 + 0.2, 6);
        specs(still, u, p.h + (stand ? 0.18 : 0.03), stand ? p.v0 + 0.2 : (p.v0 + p.v1) / 2, 0, -1, k.goods[(i + s.i) % k.goods.length], i);
      }
    for (const p of pieces('eyechart')) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(p.v1 - p.v0, (p.v1 - p.v0) * 1.5), own(new THREE.MeshBasicMaterial({ map: eyeChart() })));
      m.position.copy(at(p.du < 0 ? p.u0 - 0.005 : p.u1 + 0.005, 1.35, (p.v0 + p.v1) / 2));
      m.rotation.y = Math.atan2(p.du, 0);
      live.add(m);
    }
  }
  return out;
}
