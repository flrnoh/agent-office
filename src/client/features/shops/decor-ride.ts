import * as THREE from 'three';
import { FRONT_T, SHOP_H, type Shop, type ShopKind } from '../../../shared/shops';
import type { Piece, Room } from '../../../shared/shop-rooms';
import { BIKE_KINDS, busyMachine, type BikeKind } from '../../../shared/ride';
import { bikeModel } from '../../world/bike';
import { mesh, toon } from '../../world/toon';
import type { Live } from './decor';

// flrnoh fork (see FORK.md "Shops to walk into"): the bike shop, the pet shop and the laundromat,
// inside (interior.ts and decor.ts hand these kinds over to here): bikes on the walls, in rows and on
// the repair stand (its back wheel spinning), tyres, and bikes parked out front on the sidewalk; a
// wall of aquariums with fish swimming up and down, budgies in their cages, a hamster in its wheel,
// bags of food; washing machines whose drums tumble colorful laundry while they run (yours, started
// with E, or somebody's: see busyMachine), dryers, the folding table, plastic chairs, the vending
// machine. `still` is merged; `live` moves.

const at = (u: number, y: number, v: number) => new THREE.Vector3(u, y, -v);
const own = <M extends THREE.Material>(m: M): M => {
  m.userData.own = true;
  m.userData.outlineParameters = { visible: false };
  return m;
};
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
const ball = (parent: THREE.Object3D, r: number, color: string, u: number, y: number, v: number) => {
  const m = mesh(new THREE.SphereGeometry(r, 10, 8), toon(color), u, y, -v, false);
  parent.add(m);
  return m;
};

/** A bike standing at (u, v) along `alongV` (else along u), its wheels at `y`. */
function bikeAt(parent: THREE.Object3D, k: BikeKind, u: number, y: number, v: number, alongV: boolean, lean = 0) {
  const b = bikeModel(k);
  b.group.position.copy(at(u, y, v));
  b.group.rotation.set(0, alongV ? 0 : Math.PI / 2, lean);
  b.roll(u * 3 + v, 0);
  parent.add(b.group);
  return b;
}

// ---- The laundromat's machines: yours that you started, and everyone's ---------------------------

const washes = new Map<string, number>();
/** Starts a wash in shop `shop`'s machine `n`, done at `until` (ms on the page's clock). */
export function startWash(shop: number, n: number, until: number) {
  washes.set(`${shop}-${n}`, until);
}
/** Seconds left of your wash in that machine, or 0. */
export function washLeft(shop: number, n: number): number {
  return Math.max(0, ((washes.get(`${shop}-${n}`) ?? 0) - Date.now()) / 1000);
}
/** Whether that machine's running: your wash, or someone's (busyMachine). */
export const running = (shop: number, n: number) => washLeft(shop, n) > 0 || busyMachine(shop, n, Date.now());

const LAUNDRY = ['#f72585', '#4cc9f0', '#ffd60a', '#ffffff', '#80ed99', '#ff7b00', '#7209b7'];

/** A round door at (u, y, v) facing +u (or -u), with laundry in its drum: what turns when it runs. */
function drum(live: THREE.Group, u: number, y: number, v: number, du: number, r: number) {
  const g = new THREE.Group();
  g.position.copy(at(u, y, v));
  g.rotation.y = du > 0 ? 0 : Math.PI;
  live.add(g);
  const ring = mesh(new THREE.TorusGeometry(r, r * 0.16, 8, 24), toon('#ced4da'), 0.01, 0, 0, false);
  ring.rotation.y = Math.PI / 2;
  g.add(ring);
  const back = mesh(new THREE.CircleGeometry(r, 20), own(new THREE.MeshBasicMaterial({ color: '#1b263b' })), -0.04, 0, 0, false);
  back.rotation.y = Math.PI / 2;
  g.add(back);
  const clothes = new THREE.Group();
  g.add(clothes);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const c = mesh(new THREE.BoxGeometry(0.03, r * 0.5, r * 0.32), toon(LAUNDRY[i % LAUNDRY.length]), -0.02, Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, false);
    c.rotation.x = a;
    clothes.add(c);
  }
  // The glass, a little blue, catching the light.
  const glass = mesh(new THREE.CircleGeometry(r, 20), own(new THREE.MeshBasicMaterial({ color: '#a9def9', transparent: true, opacity: 0.22, depthWrite: false })), 0.02, 0, 0, false);
  glass.rotation.y = Math.PI / 2;
  g.add(glass);
  return { group: g, clothes };
}

/** The machines' running lamps: lit green while running. */
const lampOn = new THREE.Color('#38b000');
const lampOff = new THREE.Color('#495057');

/** A machine's drum turning while it runs: churning one way and back, then the spin; still and low when it's off. */
function machine(out: Live[], live: THREE.Group, s: Shop, n: number, u: number, y: number, v: number, du: number, r: number, lampAt: [number, number, number]) {
  const d = drum(live, u, y, v, du, r);
  const lamp = own(new THREE.MeshBasicMaterial({ color: lampOff }));
  const l = mesh(new THREE.BoxGeometry(0.02, 0.03, 0.08), lamp, lampAt[0], lampAt[1], -lampAt[2], false);
  live.add(l);
  let a = 0;
  out.push({
    update: (t, dt) => {
      const on = running(s.i, n);
      lamp.color.copy(on ? lampOn : lampOff);
      if (!on) {
        // Settled in a heap at the bottom.
        a += (Math.round(a / (Math.PI * 2)) * Math.PI * 2 - a) * Math.min(1, dt * 2);
        d.clothes.rotation.x = a;
        d.group.position.y = y;
        return;
      }
      const phase = (t + n * 7.3) % 20;
      const spin = phase > 15 ? 14 : Math.sin(phase * 0.9) > 0 ? 3.2 : -3.2;
      a += dt * spin;
      d.clothes.rotation.x = a;
      // The whole door shudders a little in the spin.
      d.group.position.y = y + (phase > 15 ? Math.sin(t * 60) * 0.004 : 0);
    },
  });
}

/** The pieces only these kinds have; false if it isn't one. */
export function furnishRide(still: THREE.Group, s: Shop, k: ShopKind, p: Piece): boolean {
  const w = p.u1 - p.u0;
  const d = p.v1 - p.v0;
  const cu = (p.u0 + p.u1) / 2;
  const cv = (p.v0 + p.v1) / 2;
  const wallU = p.du > 0 ? p.u0 : p.u1;
  switch (p.what) {
    case 'bikewall': {
      // Hooks on a board, bikes hung up high and standing below.
      box(still, 0.04, 2.0, d, '#8d6e63', wallU + p.du * 0.02, 0.3, cv);
      const n = Math.max(1, Math.floor(d / 1.45));
      for (let i = 0; i < n; i++) {
        const v = p.v0 + 0.7 + i * ((d - 1.4) / Math.max(1, n - 1 || 1));
        bikeAt(still, BIKE_KINDS[(i + s.i) % 3], wallU + p.du * 0.22, 1.25, v, true);
        bikeAt(still, BIKE_KINDS[(i + s.i + 1) % 3], wallU + p.du * 0.25, 0, v, true, p.du * 0.06);
      }
      return true;
    }
    case 'bikerow': {
      // A floor rack, a bike in every slot (price tags on the bars).
      box(still, w, 0.06, 0.08, '#6c757d', cu, 0, cv);
      for (let u = p.u0 + 0.25, i = 0; u < p.u1 - 0.1; u += 0.45, i++) {
        bikeAt(still, BIKE_KINDS[(i + s.i) % BIKE_KINDS.length], u, 0, cv, true);
        box(still, 0.06, 0.05, 0.01, '#ffd60a', u + 0.1, 0.92, cv - 0.25);
      }
      return true;
    }
    case 'repairstand': {
      // A stand with a clamp, tools on a board behind.
      cyl(still, 0.025, 0.025, 1.0, '#e63946', cu - w / 2 + 0.15, 0, cv, 8);
      cyl(still, 0.2, 0.22, 0.03, '#343a40', cu - w / 2 + 0.15, 0, cv, 12);
      box(still, 0.12, 0.06, 0.06, '#1d1d1d', cu - w / 2 + 0.15, 1.0, cv);
      for (let i = 0; i < 5; i++) box(still, 0.03, 0.2, 0.01, '#adb5bd', p.u0 + 0.15 + i * 0.15, 1.2, p.v1 - 0.02);
      return true;
    }
    case 'tyres': {
      box(still, 0.04, 1.8, d, '#6c757d', wallU + p.du * 0.02, 0.1, cv);
      const n = Math.floor(d / 0.5);
      for (let r = 0; r < 3; r++)
        for (let i = 0; i < n; i++) {
          const t = mesh(new THREE.TorusGeometry(0.2, 0.035, 6, 18), toon('#1d1d1d'), wallU + p.du * 0.08, 0.5 + r * 0.55, -(p.v0 + 0.25 + i * 0.5), false);
          t.rotation.y = Math.PI / 2;
          still.add(t);
        }
      // Boxes of inner tubes on the floor.
      for (let i = 0; i < n; i++) box(still, 0.25, 0.18, 0.3, ['#ffbe0b', '#2a9d8f', '#e63946'][i % 3], wallU + p.du * 0.2, 0, p.v0 + 0.25 + i * 0.5);
      return true;
    }
    case 'aquarium':
      // The cabinet; the tanks themselves are live (their water and fish).
      box(still, w, 0.8, d, '#264653', cu, 0, cv);
      box(still, w, 0.06, d, '#1d3557', cu, p.h - 0.06, cv);
      return true;
    case 'foodshelf': {
      box(still, 0.04, p.h, d, '#8d6e63', wallU + p.du * 0.02, 0, cv);
      for (let r = 0; r < 4; r++) {
        const y = 0.1 + r * 0.45;
        box(still, w - 0.04, 0.03, d, '#d9cbb5', cu, y, cv);
        for (let i = 0; i < Math.floor(d / 0.22); i++) {
          const bag = box(still, 0.16, 0.3, 0.18, ['#f77f00', '#90be6d', '#4cc9f0', '#ffd60a', '#e63946'][(i + r + s.i) % 5], cu, y + 0.03, p.v0 + 0.12 + i * 0.22);
          bag.rotation.y = ((i % 3) - 1) * 0.15;
        }
      }
      return true;
    }
    case 'hamster':
      box(still, w, p.h - 0.04, d, '#f1ece4', cu, 0, cv);
      box(still, w * 0.8, 0.04, d * 0.8, '#ffd6a5', cu, p.h - 0.04, cv);
      // The cage's wire: its corners and its lid's frame.
      for (const [a, b] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) box(still, 0.015, 0.4, 0.015, '#ced4da', cu + a * w * 0.4, p.h, cv + b * d * 0.4);
      box(still, w * 0.8, 0.015, 0.015, '#ced4da', cu, p.h + 0.4, cv - d * 0.4);
      box(still, w * 0.8, 0.015, 0.015, '#ced4da', cu, p.h + 0.4, cv + d * 0.4);
      box(still, 0.015, 0.015, d * 0.8, '#ced4da', cu - w * 0.4, p.h + 0.4, cv);
      box(still, 0.015, 0.015, d * 0.8, '#ced4da', cu + w * 0.4, p.h + 0.4, cv);
      box(still, 0.18, 0.1, 0.12, '#bc6c25', cu - w * 0.25, p.h, cv + 0.1);
      return true;
    case 'birdstand':
      cyl(still, 0.03, 0.03, 1.2, '#adb5bd', cu, 0, cv, 8);
      cyl(still, 0.22, 0.25, 0.03, '#343a40', cu, 0, cv, 12);
      cyl(still, 0.2, 0.2, 0.03, '#c9a227', cu, 1.2, cv, 16);
      return true;
    case 'birdcage':
      // Hanging from the ceiling: the chain, here; the cage's bars and its bird are live.
      cyl(still, 0.006, 0.006, SHOP_H - 2.15, '#c9a227', cu, 2.15, cv, 4);
      return true;
    case 'washer':
    case 'dryers': {
      const two = p.what === 'dryers';
      const n = two ? Math.max(1, Math.floor(d / 0.75)) : 1;
      for (let i = 0; i < n; i++) {
        const v = two ? p.v0 + 0.375 + i * 0.75 : cv;
        const dd = two ? 0.72 : d;
        for (let r = 0; r < (two ? 2 : 1); r++) {
          box(still, w, two ? 0.9 : p.h, dd, '#f8f9fa', cu, r * 0.92, v);
          box(still, 0.02, 0.12, dd - 0.06, '#ced4da', wallU + p.du * (w + 0.005), r * 0.92 + (two ? 0.75 : p.h - 0.15), v);
        }
      }
      return true;
    }
    case 'foldtable': {
      box(still, w, 0.05, d, '#e9ecef', cu, p.h - 0.05, cv);
      for (const [a, b] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) box(still, 0.04, p.h - 0.05, 0.04, '#6c757d', cu + a * (w / 2 - 0.06), 0, cv + b * (d / 2 - 0.06));
      // Folded piles of laundry, a basket.
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3 - i; j++) box(still, 0.28, 0.05, 0.22, LAUNDRY[(i * 3 + j + s.i) % LAUNDRY.length], cu - w / 2 + 0.3 + i * 0.35, p.h + j * 0.05, cv - 0.05);
      box(still, 0.4, 0.22, 0.3, '#4cc9f0', cu + w / 2 - 0.3, p.h, cv);
      return true;
    }
    case 'plasticchair': {
      const c = ['#ff7b00', '#4361ee', '#ff7b00', '#2a9d8f'][Math.round(cu * 1.6) % 4];
      box(still, 0.42, 0.04, 0.4, c, cu, 0.43, cv);
      box(still, 0.42, 0.4, 0.04, c, cu, 0.47, p.v0 + 0.02);
      for (const [a, b] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) box(still, 0.03, 0.43, 0.03, '#adb5bd', cu + a * 0.18, 0, cv + b * 0.17);
      return true;
    }
    case 'vending': {
      box(still, w, p.h, d, '#c1121f', cu, 0, cv);
      const front = p.du > 0 ? p.u1 : p.u0;
      box(still, 0.02, 0.5, 0.25, '#343a40', front + p.du * 0.01, 0.9, p.v1 - 0.2);
      for (let r = 0; r < 5; r++) for (let i = 0; i < 4; i++) box(still, 0.06, 0.14, 0.1, ['#ffd60a', '#4cc9f0', '#80ed99', '#f72585', '#ff7b00'][(r + i) % 5], front + p.du * 0.08, 0.55 + r * 0.24, p.v0 + 0.15 + i * 0.16);
      return true;
    }
    default:
      return false;
  }
}

/** What moves in these kinds of shop (and what's out front), on top of furnishRide's. */
export function rideDecor(still: THREE.Group, live: THREE.Group, s: Shop, k: ShopKind, room: Room, win: { u0: number; u1: number }): Live[] {
  const out: Live[] = [];
  const piece = (what: Piece['what']) => room.pieces.filter((p) => p.what === what);
  switch (k.id) {
    case 'fahrrad': {
      // Bikes parked out front on the sidewalk, at a stand, and one in the window.
      const bar = (win.u0 + win.u1) / 2;
      box(still, Math.max(0.5, win.u1 - win.u0 - 0.4), 0.05, 0.05, '#adb5bd', bar, 0.55, -1.25);
      for (let u = win.u0 + 0.3, i = 0; u < win.u1 - 0.2; u += 0.6, i++) bikeAt(still, BIKE_KINDS[(i + s.i) % BIKE_KINDS.length], u, 0, -1.2, true, 0.05);
      bikeAt(still, 'racer', (win.u0 + win.u1) / 2, 0.55, FRONT_T + 0.25, false);
      // The bike on the repair stand, up in its clamp, its back wheel spinning now and then.
      const st = piece('repairstand')[0];
      if (st) {
        const b = bikeAt(live, 'city', (st.u0 + st.u1) / 2 + 0.1, 0.45, (st.v0 + st.v1) / 2, false);
        let m = 0;
        out.push({ update: (t, dt) => b.roll((m += dt * (Math.sin(t * 0.4) > 0.2 ? 6 : 0)), 0) });
      }
      break;
    }
    case 'zoo': {
      for (const p of piece('aquarium')) {
        // The tank: water, gravel, weed, and fish going up and down its length.
        const len = p.v1 - p.v0 - 0.1;
        const cu = (p.u0 + p.u1) / 2;
        const cv = (p.v0 + p.v1) / 2;
        const h = p.h - 0.86;
        const water = mesh(new THREE.BoxGeometry(p.u1 - p.u0 - 0.06, h, len), own(new THREE.MeshBasicMaterial({ color: '#48cae4', transparent: true, opacity: 0.3, depthWrite: false })), cu, 0.8 + h / 2, -cv, false);
        live.add(water);
        box(still, p.u1 - p.u0 - 0.08, 0.06, len, '#e9c46a', cu, 0.8, cv);
        for (let i = 0; i < Math.floor(len / 0.35); i++) {
          const weed = box(still, 0.03, 0.2 + (i % 3) * 0.12, 0.05, '#2d6a4f', cu + ((i % 2) - 0.5) * 0.2, 0.86, p.v0 + 0.2 + i * 0.35);
          weed.rotation.z = ((i % 3) - 1) * 0.2;
        }
        for (let f = 0; f < 9; f++) {
          const fish = new THREE.Group();
          const c = ['#f77f00', '#ffd60a', '#e63946', '#4cc9f0', '#ff006e'][f % 5];
          const body = mesh(new THREE.SphereGeometry(0.045, 8, 6), toon(c), 0, 0, 0, false);
          body.scale.set(0.5, 0.8, 1.3);
          fish.add(body);
          const tail = mesh(new THREE.ConeGeometry(0.035, 0.06, 4), toon(c), 0, 0, 0.07, false);
          tail.rotation.x = -Math.PI / 2;
          fish.add(tail);
          live.add(fish);
          const speed = 0.25 + (f % 4) * 0.08;
          const y = 0.95 + ((f * 37) % 10) / 10 * (h - 0.25);
          const du = ((f * 13) % 7) / 7 - 0.5;
          out.push({
            update: (t) => {
              const ph = t * speed + f * 1.7;
              const v = cv + Math.sin(ph) * (len / 2 - 0.12);
              fish.position.copy(at(cu + du * 0.25, y + Math.sin(t * 2 + f) * 0.02, v));
              // Facing the way it's going (-v is +z in here), the tail flicking.
              fish.rotation.y = Math.cos(ph) > 0 ? Math.PI : 0;
              tail.rotation.y = Math.sin(t * 12 + f) * 0.5;
            },
          });
        }
        // Bubbles going up from the pump at one end.
        const bubbles = [0, 1, 2, 3].map(() => ball(live, 0.015, '#e0fbfc', cu, 0.9, p.v0 + 0.1));
        out.push({ update: (t) => bubbles.forEach((b, i) => (b.position.y = 0.9 + ((t * 0.5 + i / 4) % 1) * (h - 0.1))) });
      }
      // The budgies: in the cages over the window, and on the stand, hopping and bobbing.
      const budgie = (u: number, y: number, v: number, c: string) => {
        const g = new THREE.Group();
        g.add(mesh(new THREE.SphereGeometry(0.05, 8, 6), toon(c), 0, 0.05, 0, false));
        g.add(mesh(new THREE.SphereGeometry(0.035, 8, 6), toon('#ffd60a'), 0, 0.11, 0.02, false));
        const tail = mesh(new THREE.BoxGeometry(0.02, 0.08, 0.02), toon(c), 0, 0.02, -0.05, false);
        tail.rotation.x = -0.6;
        g.add(tail);
        g.position.copy(at(u, y, v));
        live.add(g);
        return g;
      };
      const cage = (u: number, y: number, v: number) => {
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          cyl(live, 0.004, 0.004, 0.42, '#c9a227', u + Math.cos(a) * 0.2, y, v + Math.sin(a) * 0.2, 3);
        }
        cyl(live, 0.21, 0.21, 0.02, '#c9a227', u, y, v, 16);
        const top = mesh(new THREE.SphereGeometry(0.2, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), own(new THREE.MeshBasicMaterial({ color: '#c9a227', wireframe: true })), u, y + 0.42, -v, false);
        live.add(top);
      };
      const birds: { g: THREE.Group; y: number; n: number }[] = [];
      for (const p of piece('birdcage')) {
        const u = (p.u0 + p.u1) / 2;
        const v = (p.v0 + p.v1) / 2;
        cage(u, 1.55, v);
        birds.push({ g: budgie(u - 0.05, 1.68, v, '#80b918'), y: 1.68, n: birds.length }, { g: budgie(u + 0.07, 1.68, v + 0.05, '#4cc9f0'), y: 1.68, n: birds.length + 1 });
      }
      const st = piece('birdstand')[0];
      if (st) {
        const u = (st.u0 + st.u1) / 2;
        const v = (st.v0 + st.v1) / 2;
        cage(u, 1.23, v);
        birds.push({ g: budgie(u, 1.36, v, '#80b918'), y: 1.36, n: 9 });
      }
      out.push({
        update: (t) => {
          for (const b of birds) {
            const ph = t * 1.3 + b.n * 2.1;
            b.g.position.y = b.y + Math.max(0, Math.sin(ph * 3)) * 0.04 * (Math.sin(ph * 0.5) > 0.3 ? 1 : 0);
            b.g.rotation.y = Math.round(Math.sin(ph * 0.4) * 2) * 0.8;
          }
        },
      });
      // The hamster in its wheel.
      const hp = piece('hamster')[0];
      if (hp) {
        const u = (hp.u0 + hp.u1) / 2 + 0.15;
        const v = (hp.v0 + hp.v1) / 2;
        const wheel = new THREE.Group();
        wheel.position.copy(at(u, hp.h + 0.2, v));
        const rim = mesh(new THREE.TorusGeometry(0.17, 0.012, 6, 20), toon('#4cc9f0'), 0, 0, 0, false);
        wheel.add(rim);
        for (let i = 0; i < 6; i++) {
          const r = mesh(new THREE.BoxGeometry(0.01, 0.34, 0.01), toon('#4cc9f0'), 0, 0, 0, false);
          r.rotation.z = (i * Math.PI) / 6;
          wheel.add(r);
        }
        live.add(wheel);
        box(still, 0.03, 0.2, 0.03, '#adb5bd', u, hp.h, v + 0.06);
        const hamster = ball(live, 0.05, '#e9c46a', u, hp.h + 0.08, v);
        hamster.scale.set(1, 0.85, 1.3);
        hamster.rotation.y = Math.PI / 2;
        out.push({
          update: (t) => {
            const run = Math.sin(t * 0.35) > -0.2;
            wheel.rotation.z = run ? -t * 7 : wheel.rotation.z;
            hamster.position.y = hp.h + 0.08 + (run ? Math.abs(Math.sin(t * 14)) * 0.012 : 0);
          },
        });
      }
      break;
    }
    case 'waschsalon': {
      piece('washer').forEach((p, n) => {
        const front = p.du > 0 ? p.u1 : p.u0;
        machine(out, live, s, n, front + p.du * 0.005, 0.42, (p.v0 + p.v1) / 2, p.du, 0.2, [front + p.du * 0.012, 0.82, p.v0 + 0.12]);
      });
      // The dryers: their drums go round too, somebody's always drying something.
      for (const p of piece('dryers')) {
        const front = p.du > 0 ? p.u1 : p.u0;
        const n = Math.max(1, Math.floor((p.v1 - p.v0) / 0.75));
        for (let i = 0; i < n; i++) for (let r = 0; r < 2; r++) machine(out, live, s, 100 + i * 2 + r, front + p.du * 0.005, 0.42 + r * 0.92, p.v0 + 0.375 + i * 0.75, p.du, 0.22, [front + p.du * 0.012, 0.8 + r * 0.92, p.v0 + 0.1 + i * 0.75]);
      }
      // The vending machine's lit window.
      for (const p of piece('vending')) {
        const front = p.du > 0 ? p.u1 : p.u0;
        const glow = mesh(new THREE.PlaneGeometry(p.v1 - p.v0 - 0.45, 1.25), own(new THREE.MeshBasicMaterial({ color: '#e0fbfc', transparent: true, opacity: 0.35, depthWrite: false })), front + p.du * 0.13, 1.15, -(p.v0 + 0.38), false);
        glow.rotation.y = p.du > 0 ? Math.PI / 2 : -Math.PI / 2;
        live.add(glow);
      }
      // A sign in the window: the opening hours.
      box(still, Math.max(0.4, win.u1 - win.u0 - 0.6), 0.25, 0.02, '#3a0ca3', (win.u0 + win.u1) / 2, 2.4, FRONT_T + 0.05);
      break;
    }
  }
  return out;
}
