import * as THREE from 'three';
import { FRONT_T, SHOP_H, WALL_T, type Shop, type ShopKind } from '../../../shared/shops';
import type { Piece, Room } from '../../../shared/shop-rooms';
import { RECORDS } from '../../../shared/records';
import { TATTOO_MOTIFS } from '../../../shared/avatar';
import { sleeveTexture } from '../../world/sleeves';
import { tattooMaterial } from '../../world/character/tattoo-art';
import { canvasTexture } from '../../world/texture';
import { mesh, toon } from '../../world/toon';
import { wearDecor } from './decor-wear'; // the boutique and the optician

// flrnoh fork (see FORK.md "Shops to walk into"): what only one kind of shop has, on top of its
// counter and shelves (interior.ts): the café's espresso machine, the bar's taps, the pharmacy's
// green cross, the döner's turning spit and its menu, the toy train going round its table and the
// teddies in the window, the record shop's crates, sleeves and turntable, the tattoo studio's flash
// art, the barber's pole by the door. `still` is merged; `live` is kept as it is (it moves, or it has
// a picture on it).

/** Something in a shop that moves while you're near: `t` is seconds on the page's clock. */
export interface Live {
  update(t: number, dt: number): void;
}

const at = (u: number, y: number, v: number) => new THREE.Vector3(u, y, -v);
const tm = (map: THREE.Texture, opts: THREE.MeshToonMaterialParameters = {}) => {
  const m = new THREE.MeshToonMaterial({ map, gradientMap: (toon('#fff') as THREE.MeshToonMaterial).gradientMap, ...opts });
  m.userData.own = true;
  return m;
};
const glowMat = (color: string, strength = 1) => {
  const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(strength) });
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
/** A picture on a wall at (u, y, v), facing (du, dv), `w` × `h`. */
function picture(parent: THREE.Object3D, mat: THREE.Material, w: number, h: number, u: number, y: number, v: number, du: number, dv: number) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.position.copy(at(u, y, v));
  m.rotation.y = Math.atan2(du, -dv);
  parent.add(m);
  return m;
}

const textures = new Map<string, THREE.CanvasTexture>();
/** A canvas picture drawn once and kept (a few per kind of shop at most). */
function painted(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  let t = textures.get(key);
  if (!t) textures.set(key, (t = canvasTexture(w, h, draw)));
  return t;
}

/** The döner shop's menu board. */
const doenerMenu = () =>
  painted('doener-menu', 512, 192, (g) => {
    g.fillStyle = '#1b1b1e';
    g.fillRect(0, 0, 512, 192);
    g.fillStyle = '#ffcc00';
    g.font = 'bold 30px system-ui, sans-serif';
    g.fillText('DÖNER KEBAB', 20, 40);
    g.font = '22px system-ui, sans-serif';
    g.fillStyle = '#ffffff';
    ['Döner mit alles', 'Dürüm', 'Lahmacun', 'Pommes', 'Ayran'].forEach((n, i) => g.fillText(n, 24 + (i % 2) * 250, 82 + Math.floor(i / 2) * 36));
    g.fillStyle = '#e63946';
    g.fillText('🌶️ scharf? Gerne!', 274, 154);
  });

/** A sheet of tattoo flash: the studio's motifs in a grid. */
const flashSheet = (n: number) =>
  painted(`flash-${n}`, 256, 320, (g) => {
    g.fillStyle = '#f4ecd8';
    g.fillRect(0, 0, 256, 320);
    g.strokeStyle = '#1b1b1e';
    g.lineWidth = 4;
    g.strokeRect(4, 4, 248, 312);
    const motifs = TATTOO_MOTIFS.slice(n % 3, (n % 3) + 6);
    motifs.forEach((m, i) => {
      const img = tattooMaterial(m.id).map!.image as HTMLCanvasElement;
      g.drawImage(img, 14 + (i % 2) * 120, 14 + Math.floor(i / 2) * 100, 108, 92);
    });
  });

/** The pharmacy's green cross. */
const crossTex = () =>
  painted('cross', 128, 128, (g) => {
    g.fillStyle = '#2b9348';
    g.fillRect(44, 8, 40, 112);
    g.fillRect(8, 44, 112, 40);
  });

export function kindDecor(still: THREE.Group, live: THREE.Group, s: Shop, k: ShopKind, room: Room): Live[] {
  const out: Live[] = [];
  const counter = room.pieces.find((p) => p.what === 'counter' || p.what === 'vitrine')!;
  const ctop = counter.h;
  const cu = (counter.u0 + counter.u1) / 2;
  const cv = (counter.v0 + counter.v1) / 2;
  const back = s.depth - WALL_T;
  const piece = (what: Piece['what']) => room.pieces.filter((p) => p.what === what);
  /** The window, just behind the glass, from the end away from the door: u0..u1. */
  const mirrored = s.doorU < s.len / 2;
  const win = mirrored ? { u0: s.doorU + 1.0, u1: s.len - 0.4 } : { u0: 0.4, u1: s.doorU - 1.0 };
  switch (k.id) {
    case 'boutique':
    case 'optiker':
      return wearDecor(still, live, s, k, room);
    case 'cafe': {
      // The espresso machine: chrome, two group heads, cups on top.
      const u = counter.u0 + 0.5;
      box(still, 0.6, 0.42, 0.4, '#ced4da', u, ctop, cv + 0.05);
      box(still, 0.62, 0.06, 0.42, '#2a9d8f', u, ctop + 0.42, cv + 0.05);
      for (const du of [-0.14, 0.14]) cyl(still, 0.04, 0.04, 0.08, '#343a40', u + du, ctop + 0.22, cv - 0.2, 10);
      for (let i = 0; i < 3; i++) cyl(still, 0.035, 0.03, 0.06, '#fffaf3', u - 0.18 + i * 0.18, ctop + 0.48, cv + 0.05, 10);
      // A cake stand.
      cyl(still, 0.16, 0.16, 0.02, '#fffaf3', cu + 0.3, ctop + 0.1, cv, 16);
      cyl(still, 0.02, 0.02, 0.1, '#fffaf3', cu + 0.3, ctop, cv, 6);
      cyl(still, 0.12, 0.12, 0.08, '#f4dca0', cu + 0.3, ctop + 0.12, cv, 16);
      break;
    }
    case 'bar': {
      // Taps on the bar, and a neon sign on the back wall.
      for (let i = 0; i < 3; i++) {
        const u = cu - 0.3 + i * 0.3;
        cyl(still, 0.025, 0.025, 0.35, '#ced4da', u, ctop, cv, 8);
        box(still, 0.03, 0.12, 0.03, ['#ffb703', '#d62828', '#06d6a0'][i], u, ctop + 0.35, cv);
      }
      const neon = picture(live, glowMat('#e0aaff'), 1.2, 0.08, cu, 2.75, back - 0.02, 0, -1);
      picture(live, glowMat('#ff2e63'), 0.9, 0.06, cu, 2.6, back - 0.02, 0, -1);
      out.push({ update: (t) => (neon.visible = Math.sin(t * 2.3) > -0.85) });
      break;
    }
    case 'pizza': {
      cyl(still, 0.2, 0.2, 0.02, '#e9c46a', cu, ctop, cv, 18);
      cyl(still, 0.18, 0.18, 0.01, '#d62828', cu, ctop + 0.02, cv, 18);
      for (let i = 0; i < 5; i++) cyl(still, 0.025, 0.025, 0.012, '#9b2226', cu - 0.1 + (i % 3) * 0.1, ctop + 0.03, cv - 0.06 + Math.floor(i / 3) * 0.12, 8);
      box(still, 0.12, 1.4, 0.04, '#c8813c', counter.u0 + 0.1, 0, back - 0.6);
      break;
    }
    case 'apotheke':
      picture(live, tm(crossTex(), { transparent: true, emissive: '#2b9348', emissiveIntensity: 0.6 }), 0.6, 0.6, cu, 2.75, back - 0.02, 0, -1);
      break;
    case 'baeckerei':
      for (let i = 0; i < 4; i++) {
        const loaf = mesh(new THREE.SphereGeometry(0.12, 10, 8), toon(['#d9a35b', '#b9773e', '#e8c07d', '#9c4f1c'][i]), counter.u0 + 0.3 + i * 0.3, ctop + 0.4, -(back - 0.2), false);
        loaf.scale.set(1.4, 0.6, 0.8);
        still.add(loaf);
      }
      break;
    case 'blumen': {
      cyl(still, 0.08, 0.06, 0.25, '#e9ecef', cu, ctop, cv, 10);
      for (let i = 0; i < 7; i++) still.add(mesh(new THREE.SphereGeometry(0.05, 8, 6), toon(['#ff8fab', '#ffd166', '#c77dff', '#d62828'][i % 4]), cu + Math.cos(i) * 0.08, ctop + 0.32 + (i % 2) * 0.04, -(cv + Math.sin(i) * 0.08), false));
      // Flowers in the window too.
      for (let u = win.u0; u < win.u1 - 0.2; u += 0.5) for (let f = 0; f < 4; f++) still.add(mesh(new THREE.SphereGeometry(0.05, 8, 6), toon(['#ff8fab', '#ffd166', '#c77dff', '#ffffff'][(f + Math.round(u)) % 4]), u + Math.cos(f * 1.6) * 0.07, 0.95 + (f % 2) * 0.06, -(FRONT_T + 0.22 + Math.sin(f * 1.6) * 0.07), false));
      break;
    }
    case 'buchladen': {
      // A reading armchair by the window, and a lamp.
      const u = win.u0 + 0.6;
      box(still, 0.7, 0.4, 0.7, '#9c6644', u, 0, FRONT_T + 1.2);
      box(still, 0.7, 0.6, 0.15, '#9c6644', u, 0.4, FRONT_T + 1.5);
      cyl(still, 0.02, 0.02, 1.4, '#343a40', u + 0.5, 0, FRONT_T + 1.4, 6);
      cyl(live, 0.14, 0.2, 0.18, glowMat('#ffe8b0'), u + 0.5, 1.4, FRONT_T + 1.4, 12);
      break;
    }
    case 'kiosk':
    case 'spaeti': {
      for (let i = 0; i < 3; i++) {
        cyl(still, 0.07, 0.07, 0.22, '#e9f5f2', counter.u0 + 0.25 + i * 0.18, ctop, cv, 10);
        for (let j = 0; j < 4; j++) still.add(mesh(new THREE.SphereGeometry(0.025, 6, 5), toon(['#ff595e', '#ffca3a', '#8ac926', '#1982c4'][(i + j) % 4]), counter.u0 + 0.25 + i * 0.18, ctop + 0.05 + j * 0.04, -cv, false));
      }
      if (k.id === 'spaeti') picture(live, glowMat('#fca311'), 1.0, 0.18, cu, 2.7, back - 0.02, 0, -1);
      break;
    }
    case 'friseur': {
      // The barber's pole by the door, turning; a hair dryer on a stand.
      const pole = new THREE.Group();
      const tex = painted('pole', 64, 128, (g) => {
        g.fillStyle = '#ffffff';
        g.fillRect(0, 0, 64, 128);
        for (let i = -2; i < 8; i++) {
          g.fillStyle = i % 2 ? '#d62828' : '#1d3557';
          g.beginPath();
          g.moveTo(0, i * 24);
          g.lineTo(64, i * 24 + 32);
          g.lineTo(64, i * 24 + 44);
          g.lineTo(0, i * 24 + 12);
          g.fill();
        }
      });
      const p = mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.7, 16), tm(tex), 0, 0, 0, false);
      pole.add(p);
      pole.position.copy(at(s.doorU + (mirrored ? 1.1 : -1.1), 2.2, -0.12));
      live.add(pole);
      out.push({ update: (t) => (p.rotation.y = t * 2.5) });
      const chair = piece('barberchair')[0];
      if (chair) {
        cyl(still, 0.02, 0.02, 1.3, '#adb5bd', chair.u1 + 0.5, 0, chair.v0 - 0.3, 6);
        const hood = mesh(new THREE.SphereGeometry(0.22, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), toon('#ffcdb2'), chair.u1 + 0.5, 1.3, -(chair.v0 - 0.3), false);
        hood.rotation.x = Math.PI;
        still.add(hood);
      }
      break;
    }
    case 'tattoo': {
      // Flash on the walls, and in the window facing out; a lamp over the chair, ink on a tray.
      piece('flash').forEach((f, i) => {
        const n = Math.max(1, Math.floor((f.v1 - f.v0) / 0.9));
        for (let j = 0; j < n; j++) {
          const v = f.v0 + 0.45 + j * ((f.v1 - f.v0 - 0.9) / Math.max(1, n - 1));
          picture(live, tm(flashSheet(i * 3 + j)), 0.7, 0.88, f.du > 0 ? f.u1 + 0.01 : f.u0 - 0.01, 1.7, v, f.du, 0);
        }
      });
      for (let u = win.u0 + 0.4, j = 0; u < win.u1 - 0.3; u += 0.95, j++) picture(live, tm(flashSheet(j + 1)), 0.66, 0.84, u, 1.6, FRONT_T + 0.08, 0, -1);
      const chair = piece('tattoochair')[0];
      if (chair) {
        const lu = (chair.u0 + chair.u1) / 2 + chair.du * 0.6;
        cyl(still, 0.02, 0.02, 1.7, '#343a40', lu, 0, chair.v1 + 0.2, 6);
        cyl(live, 0.16, 0.06, 0.12, glowMat('#ffffff', 0.95), lu - chair.du * 0.3, 1.72, chair.v1 + 0.2, 12);
        box(still, 0.4, 0.03, 0.3, '#adb5bd', lu, 0.9, chair.v1 + 0.55);
        for (let i = 0; i < 4; i++) cyl(still, 0.02, 0.02, 0.05, ['#1b1b1e', '#d62828', '#08d9d6', '#ffd60a'][i], lu - 0.12 + i * 0.08, 0.93, chair.v1 + 0.55, 6);
      }
      // A neon sign on the back wall.
      picture(live, glowMat('#ff2e63'), 1.1, 0.07, cu, 2.8, back - 0.02, 0, -1);
      break;
    }
    case 'doener': {
      // The spit: a cone of meat turning before its heater, and the menu over the counter.
      const spit = piece('spit')[0];
      if (spit) {
        const su = (spit.u0 + spit.u1) / 2;
        const sv = (spit.v0 + spit.v1) / 2;
        cyl(still, 0.015, 0.015, 1.7, '#adb5bd', su, 0.9, sv, 6);
        const meat = mesh(new THREE.CylinderGeometry(0.17, 0.11, 0.62, 14), toon('#8b5a2b'), 0, 0, 0, false);
        const crust = mesh(new THREE.CylinderGeometry(0.175, 0.115, 0.6, 7, 1, true), toon('#5e3a1a'), 0, 0, 0, false);
        const turn = new THREE.Group();
        turn.add(meat, crust);
        turn.position.copy(at(su, 1.55, sv));
        live.add(turn);
        box(live, 0.5, 0.75, 0.04, glowMat('#ff7b00', 0.9), su, 1.2, sv + 0.28);
        out.push({ update: (t) => (turn.rotation.y = t * 0.6) });
      }
      const board = piece('menuboard')[0];
      if (board) picture(live, tm(doenerMenu(), { emissive: '#ffffff', emissiveIntensity: 0.35, emissiveMap: doenerMenu() }), Math.min(2.4, board.u1 - board.u0), 0.9, (board.u0 + board.u1) / 2, 2.55, back - 0.02, 0, -1);
      break;
    }
    case 'spielzeug': {
      // The train going round its table, teddies piled in a corner and sitting in the window.
      const t = piece('traintable')[0];
      if (t) {
        const tu = (t.u0 + t.u1) / 2;
        const tv = (t.v0 + t.v1) / 2;
        const rx = (t.u1 - t.u0) / 2 - 0.15;
        const rz = (t.v1 - t.v0) / 2 - 0.15;
        const track = mesh(new THREE.TorusGeometry(1, 0.012, 4, 40), toon('#6c757d'), tu, t.h + 0.01, -tv, false);
        track.rotation.x = Math.PI / 2;
        track.scale.set(rx, rz, 1);
        still.add(track);
        const train = new THREE.Group();
        const cars: THREE.Group[] = [];
        ['#e63946', '#ffbe0b', '#3a86ff'].forEach((c, i) => {
          const car = new THREE.Group();
          car.add(mesh(new THREE.BoxGeometry(0.14, 0.08, 0.07), toon(c), 0, 0.06, 0, false));
          if (i === 0) car.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.06, 8), toon('#1d1d1d'), 0.04, 0.12, 0, false));
          for (const x of [-0.04, 0.04]) for (const z of [-0.04, 0.04]) car.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.01, 8).rotateX(Math.PI / 2), toon('#1d1d1d'), x, 0.02, z, false));
          cars.push(car);
          train.add(car);
        });
        live.add(train);
        out.push({
          update: (time) => {
            cars.forEach((car, i) => {
              const a = time * 0.9 - i * 0.32;
              car.position.copy(at(tu + Math.cos(a) * rx, t.h, tv + Math.sin(a) * rz));
              car.rotation.y = Math.atan2(-Math.sin(a) * rx, -Math.cos(a) * rz) + Math.PI / 2;
            });
          },
        });
      }
      const teddy = (u: number, y: number, v: number, c: string, sc = 1) => {
        const g = new THREE.Group();
        g.add(mesh(new THREE.SphereGeometry(0.12 * sc, 10, 8), toon(c), 0, 0.12 * sc, 0, false));
        g.add(mesh(new THREE.SphereGeometry(0.09 * sc, 10, 8), toon(c), 0, 0.3 * sc, 0, false));
        for (const x of [-0.07, 0.07]) g.add(mesh(new THREE.SphereGeometry(0.035 * sc, 8, 6), toon(c), x * sc, 0.38 * sc, 0, false));
        g.add(mesh(new THREE.SphereGeometry(0.035 * sc, 8, 6), toon('#deb887'), 0, 0.29 * sc, 0.08 * sc, false));
        g.position.copy(at(u, y, v));
        g.rotation.y = Math.PI; // facing out of the shop (+v is in)
        still.add(g);
      };
      const plush = piece('plush')[0];
      if (plush) for (let i = 0; i < 6; i++) teddy(plush.u0 + 0.2 + (i % 3) * 0.3, (Math.floor(i / 3) * 0.2), plush.v0 + 0.2 + (i % 2) * 0.2, ['#a0522d', '#deb887', '#ffffff', '#f4a261'][i % 4], 1.1);
      for (let u = win.u0 + 0.3; u < win.u1 - 0.2; u += 0.7) teddy(u, 0.55, FRONT_T + 0.22, ['#a0522d', '#deb887', '#f4a261'][Math.round(u * 3) % 3], 0.8);
      // A little train in the window too.
      for (let i = 0; i < 3; i++) box(still, 0.18, 0.1, 0.08, ['#e63946', '#ffbe0b', '#3a86ff'][i], win.u0 + 0.5 + i * 0.2, 0.56, FRONT_T + 0.38);
      break;
    }
    case 'platten': {
      // Records in the crates (the front one's sleeve showing), sleeves on the walls and in the window, a turntable on the counter.
      piece('recordcrate').forEach((c, ci) => {
        // Two rows of sleeves standing in the crate, facing whoever's digging (-v), leaning back a little.
        for (const side of [-1, 1])
          for (let i = 0; i < 5; i++) {
            const rec = RECORDS[(i * 3 + ci * 5 + (side > 0 ? 7 : 0) + s.i) % RECORDS.length];
            const mat = i === 0 ? tm(sleeveTexture(rec)) : toon(rec.sleeve);
            const sl = mesh(new THREE.BoxGeometry(0.32, 0.32, 0.01), mat, (c.u0 + c.u1) / 2 + side * 0.28, c.h - 0.12, -(c.v0 + 0.1 + i * 0.09), false);
            sl.rotation.x = -0.28;
            (i === 0 ? live : still).add(sl);
          }
      });
      for (let i = 0; i < 6; i++) {
        const rec = RECORDS[(i * 2 + s.i) % RECORDS.length];
        picture(live, tm(sleeveTexture(rec)), 0.4, 0.4, s.len - WALL_T - 0.01 - (mirrored ? s.len - 2 * WALL_T - 0.02 : 0), 1.5 + (i % 2) * 0.5, FRONT_T + 1.9 + Math.floor(i / 2) * 0.55, mirrored ? 1 : -1, 0);
      }
      for (let u = win.u0 + 0.3, j = 0; u < win.u1 - 0.2; u += 0.55, j++) picture(live, tm(sleeveTexture(RECORDS[(j * 5 + s.i) % RECORDS.length])), 0.38, 0.38, u, 1.0 + (j % 2) * 0.25, FRONT_T + 0.1, 0, -1);
      // The turntable: its plinth, the platter and a record turning.
      const tu = counter.u0 + 0.45;
      box(still, 0.5, 0.08, 0.38, '#3d405b', tu, ctop, cv);
      const rec = mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.01, 24), toon('#111111'), tu - 0.05, ctop + 0.09, -cv, false);
      rec.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.012, 16), toon('#ef233c'), 0, 0, 0, false));
      live.add(rec);
      out.push({ update: (t) => (rec.rotation.y = -t * 3.5) });
      // Headphones hanging at the listening stand.
      const l = piece('listening')[0];
      if (l) {
        const phones = mesh(new THREE.TorusGeometry(0.1, 0.015, 6, 16, Math.PI), toon('#1d1d1d'), (l.u0 + l.u1) / 2, l.h + 0.15, -((l.v0 + l.v1) / 2), false);
        phones.rotation.y = Math.PI / 2;
        still.add(phones);
        for (const dz of [-0.1, 0.1]) cyl(still, 0.045, 0.045, 0.04, '#ef233c', (l.u0 + l.u1) / 2, l.h + 0.12, (l.v0 + l.v1) / 2 + dz, 10).rotation.x = Math.PI / 2;
        box(still, 0.3, 0.06, 0.25, '#8d99ae', (l.u0 + l.u1) / 2, l.h, (l.v0 + l.v1) / 2);
      }
      break;
    }
  }
  void SHOP_H;
  return out;
}
