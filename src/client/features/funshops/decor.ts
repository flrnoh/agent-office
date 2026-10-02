import * as THREE from 'three';
import { WALL_T, type Shop, type ShopKind } from '../../../shared/shops';
import type { Piece, Room } from '../../../shared/shop-rooms';
import { PLUSH_BY_ID, clawPile } from '../../../shared/funshops';
import { H as SCREEN_H, W as SCREEN_W, paintScreen } from '../cabinet/blocks';
import { buildCabinet } from '../cabinet/world';
import { at, box, cyl, glowMat, painted, picture, tm, type Live } from '../shops/decor';
import { mesh, toon } from '../../world/toon';
import { boothDrawn, clawNow } from './motion';

// flrnoh fork (see FORK.md "Shops to walk into"): what stands in the Spielhalle and the Post, drawn
// in the shop's frame like the other kinds' (shops/decor.ts hands over to here): the office's own
// arcade cabinets in a row with BLOCKFALL's attract screen on them, neon along the walls, the claw
// machine (its claw moves as anyone's drop plays out: motion.ts), the photo booth with its curtain,
// a coin pusher; the post office's PO boxes, parcels, the yellow letterbox and its sign.

/** One attract screen for every cabinet in town, painted a few times a second. */
let attract: {
  canvas: HTMLCanvasElement;
  tex: THREE.CanvasTexture;
  at: number;
} | null = null;
function attractScreen(): THREE.CanvasTexture {
  if (!attract) {
    const canvas = document.createElement('canvas');
    canvas.width = SCREEN_W / 2;
    canvas.height = SCREEN_H / 2;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    attract = { canvas, tex, at: -1 };
  }
  return attract.tex;
}
function paintAttract(t: number) {
  if (!attract || t - attract.at < 0.4) return;
  attract.at = t;
  const g = attract.canvas.getContext('2d')!;
  g.save();
  g.scale(0.5, 0.5);
  paintScreen(g, { frame: null, scores: [], prompt: 'E: SPIELEN', t });
  g.restore();
  attract.tex.needsUpdate = true;
}

/** A plush toy, small: a round body, a head, ears in its second color. */
export function plushModel(id: string, s = 1): THREE.Group {
  const p = PLUSH_BY_ID.get(id);
  const g = new THREE.Group();
  const body = toon(p?.color ?? '#deb887');
  const ear = toon(p?.label ?? '#ffffff');
  g.add(mesh(new THREE.SphereGeometry(0.07 * s, 10, 8), body, 0, 0.06 * s, 0, false));
  g.add(mesh(new THREE.SphereGeometry(0.055 * s, 10, 8), body, 0, 0.15 * s, 0, false));
  for (const x of [-0.04, 0.04]) g.add(mesh(new THREE.SphereGeometry(0.022 * s, 8, 6), ear, x * s, 0.2 * s, 0, false));
  for (const x of [-0.02, 0.02]) g.add(mesh(new THREE.SphereGeometry(0.008 * s, 6, 5), toon('#1d1d1d'), x * s, 0.16 * s, 0.05 * s, false));
  return g;
}

/** The facing of a piece's front (du, dv) as a turn of the shop's group (+u is x, +v is -z there). */
const yawOf = (du: number, dv: number) => Math.atan2(du, -dv);

/** The claw machine: a cabinet, a glass case with the pile in it, the gantry and the claw, and its sign. */
function clawMachine(still: THREE.Group, live: THREE.Group, s: Shop, p: Piece, out: Live[]) {
  const cu = (p.u0 + p.u1) / 2;
  const cv = (p.v0 + p.v1) / 2;
  const w = p.u1 - p.u0;
  const d = p.v1 - p.v0;
  box(still, w, 0.85, d, '#ff2e88', cu, 0, cv);
  box(still, w + 0.02, 0.05, d + 0.02, '#ffd60a', cu, 0.85, cv);
  // The chute's hatch at the front, the coin slot, the joystick.
  const front = p.du < 0 ? p.u0 : p.u1;
  box(still, 0.04, 0.3, 0.3, '#1d1d1d', front + p.du * 0.01, 0.25, p.v0 + 0.25);
  box(still, 0.03, 0.12, 0.06, '#c0c0c0', front + p.du * 0.01, 0.55, p.v1 - 0.2);
  cyl(still, 0.015, 0.015, 0.14, '#1d1d1d', front + p.du * 0.06, 0.85, cv, 6);
  still.add(mesh(new THREE.SphereGeometry(0.035, 8, 6), toon('#e63946'), front + p.du * 0.06, 1.0, -cv, false));
  // The glass case, corner posts, the top and its sign.
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(w - 0.04, 1.0, d - 0.04),
    new THREE.MeshBasicMaterial({
      color: '#d7f0fa',
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
    }),
  );
  glass.material.userData.own = true;
  glass.material.userData.outlineParameters = { visible: false };
  glass.position.copy(at(cu, 1.4, cv));
  live.add(glass);
  for (const [a, b] of [
    [0, 0],
    [0, 1],
    [1, 0],
    [1, 1],
  ])
    box(still, 0.04, 1.0, 0.04, '#ffd60a', p.u0 + 0.02 + a * (w - 0.04), 0.9, p.v0 + 0.02 + b * (d - 0.04));
  box(still, w, 0.2, d, '#ff2e88', cu, 1.9, cv);
  const sign = painted('claw-sign', 256, 64, (g) => {
    g.fillStyle = '#14002e';
    g.fillRect(0, 0, 256, 64);
    g.font = 'bold 40px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#ffe600';
    g.fillText('GREIFER', 128, 34);
  });
  picture(
    live,
    tm(sign, {
      emissive: '#ffffff',
      emissiveIntensity: 0.8,
      emissiveMap: sign,
    }),
    d - 0.1,
    0.17,
    front + p.du * 0.012,
    1.9 + 0.1,
    cv,
    p.du,
    0,
  );
  // The field: x across (left to right as you stand in front), z from the front to the back.
  const m = 0.06;
  const fu = (z: number) => front - p.du * (m + z * (w - 2 * m));
  const fv = (x: number) => (p.du > 0 ? p.v0 + m + x * (d - 2 * m) : p.v1 - m - x * (d - 2 * m));
  const floorY = 0.9;
  box(still, 0.22, 0.02, 0.22, '#1d1d1d', fu(0.14), floorY + 0.12, fv(0.14));
  for (const pl of clawPile(s.i)) {
    const toy = plushModel(pl.id, pl.r / 0.09);
    toy.position.copy(at(fu(pl.z), floorY, fv(pl.x)));
    toy.rotation.y = yawOf(p.du, 0) + (pl.x - 0.5) * 2;
    live.add(toy);
  }
  // The gantry and the claw: a cable down to a hub and three prongs.
  const rail = box(live, 0.03, 0.03, d - 0.08, '#c0c0c0', cu, 1.82, cv);
  const claw = new THREE.Group();
  const cable = mesh(new THREE.CylinderGeometry(0.006, 0.006, 1, 5), toon('#adb5bd'), 0, -0.5, 0, false);
  claw.add(cable);
  const hub = mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.05, 10), toon('#c0c0c0'), 0, 0, 0, false);
  claw.add(hub);
  const prongs: THREE.Object3D[] = [];
  for (let i = 0; i < 3; i++) {
    const arm = new THREE.Group();
    arm.rotation.y = (i / 3) * Math.PI * 2;
    const prong = mesh(new THREE.BoxGeometry(0.012, 0.1, 0.012), toon('#c0c0c0'), 0, -0.05, 0, false);
    const pivot = new THREE.Group();
    pivot.position.set(0, -0.02, 0.03);
    pivot.add(prong);
    arm.add(pivot);
    prongs.push(pivot);
    claw.add(arm);
  }
  let held: THREE.Group | null = null;
  live.add(claw);
  const pile = clawPile(s.i);
  out.push({
    update: () => {
      const pose = clawNow(s.i, performance.now() / 1000);
      const top = 1.78;
      const y = top - pose.down * 0.62;
      claw.position.copy(at(fu(pose.z), y, fv(pose.x)));
      rail.position.x = fu(pose.z);
      cable.scale.y = Math.max(0.02, top + 0.02 - y + 0.02);
      cable.position.y = (top + 0.02 - y) / 2;
      for (const pr of prongs) pr.rotation.x = -(0.7 - pose.shut * 0.85);
      // What it carries: the plush nearest where it came down.
      if (pose.carrying && !held) {
        const near = [...pile].sort((a, b) => Math.hypot(a.x - pose.x, a.z - pose.z) - Math.hypot(b.x - pose.x, b.z - pose.z))[0];
        held = plushModel(near?.id ?? 'plushkatze', 0.8);
        held.position.y = -0.2;
        claw.add(held);
      } else if (!pose.carrying && held) {
        claw.remove(held);
        held.traverse((o) => (o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry.dispose());
        held = null;
      }
    },
  });
}

/** The photo booth: walls on three sides, a roof with its sign, a stool and the camera's glass, the curtain across its open side. */
function photoBooth(still: THREE.Group, live: THREE.Group, s: Shop, p: Piece, out: Live[]) {
  const w = p.u1 - p.u0;
  const d = p.v1 - p.v0;
  const cu = (p.u0 + p.u1) / 2;
  const cv = (p.v0 + p.v1) / 2;
  const back = p.du < 0 ? p.u1 : p.u0;
  const open = p.du < 0 ? p.u0 : p.u1;
  box(still, 0.05, p.h, d, '#2b2d42', back + p.du * 0.025, 0, cv);
  for (const v of [p.v0 + 0.025, p.v1 - 0.025]) box(still, w, p.h, 0.05, '#2b2d42', cu, 0, v);
  box(still, w, 0.06, d, '#2b2d42', cu, p.h - 0.06, cv);
  box(still, 0.04, 0.3, 0.3, '#111111', back + p.du * 0.06, 1.35, cv);
  cyl(still, 0.06, 0.06, 0.02, '#8ecae6', back + p.du * 0.08, 1.45, cv, 12).rotation.z = Math.PI / 2;
  cyl(still, 0.2, 0.2, 0.06, '#e63946', cu + p.du * 0.1, 0.5, cv, 14);
  cyl(still, 0.03, 0.03, 0.5, '#adb5bd', cu + p.du * 0.1, 0, cv, 6);
  const sign = painted('booth-sign', 256, 64, (g) => {
    g.fillStyle = '#e63946';
    g.fillRect(0, 0, 256, 64);
    g.font = 'bold 38px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#ffffff';
    g.fillText('📸 FOTOS', 128, 34);
  });
  picture(
    live,
    tm(sign, {
      emissive: '#ffffff',
      emissiveIntensity: 0.7,
      emissiveMap: sign,
    }),
    d - 0.1,
    0.24,
    open + p.du * 0.01,
    p.h - 0.2,
    cv,
    p.du,
    0,
  );
  // The curtain: half drawn, all the way while someone's taking photos in there.
  const curtain = box(live, 0.02, p.h - 0.45, d - 0.1, '#9b2226', open + p.du * 0.02, 0.3, cv);
  out.push({
    update: () => {
      const want = boothDrawn.has(s.i) ? 1 : 0.4;
      curtain.scale.z += (want - curtain.scale.z) * 0.15;
      curtain.position.z = -(p.v0 + 0.05 + ((d - 0.1) * curtain.scale.z) / 2);
    },
  });
}

/** Neon along the top of the walls, in two colors, flickering a little. */
function neon(live: THREE.Group, s: Shop, out: Live[]) {
  const pink = glowMat('#ff00aa', 1.2);
  const cyan = glowMat('#00f0ff', 1.2);
  const strip = (mat: THREE.Material, w: number, d: number, u: number, v: number) => box(live, w, 0.05, d, mat, u, 3.55, v);
  strip(pink, 0.04, s.depth - 0.6, WALL_T + 0.03, s.depth / 2);
  strip(cyan, 0.04, s.depth - 0.6, s.len - WALL_T - 0.03, s.depth / 2);
  const backStrip = strip(cyan, s.len - 0.6, 0.04, s.len / 2, s.depth - WALL_T - 0.03);
  out.push({ update: (t) => (backStrip.visible = Math.sin(t * 3.1) > -0.9) });
}

export function funDecor(still: THREE.Group, live: THREE.Group, s: Shop, k: ShopKind, room: Room): Live[] {
  const out: Live[] = [];
  const back = s.depth - WALL_T;
  const counter = room.pieces.find((p) => p.what === 'counter');
  const cu = counter ? (counter.u0 + counter.u1) / 2 : s.len / 2;
  if (k.id === 'spielhalle') {
    neon(live, s, out);
    picture(live, glowMat('#00f0ff'), 1.6, 0.08, cu, 2.8, back - 0.02, 0, -1);
    picture(live, glowMat('#ff00aa'), 1.2, 0.06, cu, 2.65, back - 0.02, 0, -1);
    const screen = attractScreen();
    let painter = false;
    for (const p of room.pieces) {
      const pcu = (p.u0 + p.u1) / 2;
      const pcv = (p.v0 + p.v1) / 2;
      if (p.what === 'arcadecab') {
        const cab = buildCabinet();
        cab.group.userData.interact = undefined;
        cab.group.position.copy(at(pcu, 0, pcv));
        cab.group.rotation.y = yawOf(p.du, p.dv);
        cab.group.scale.setScalar(0.92);
        const mat = cab.screen.material as THREE.MeshBasicMaterial;
        mat.map = screen;
        mat.color.set('#ffffff');
        cab.group.traverse((o) => {
          const mm = (o as THREE.Mesh).material as THREE.Material | undefined;
          if (mm && (mm as THREE.MeshBasicMaterial).isMeshBasicMaterial && mm !== mat) mm.userData.own = true;
        });
        live.add(cab.group);
        if (!painter) {
          painter = true;
          out.push({ update: (t) => paintAttract(t) });
        }
      } else if (p.what === 'claw') clawMachine(still, live, s, p, out);
      else if (p.what === 'photobooth') photoBooth(still, live, s, p, out);
      else if (p.what === 'pushers') {
        // The coin pusher: a cabinet, glass, a shelf of coins and the plate sliding to and fro.
        box(still, p.u1 - p.u0, 0.9, p.v1 - p.v0, '#3a0ca3', pcu, 0, pcv);
        box(still, p.u1 - p.u0, 0.12, p.v1 - p.v0, '#ffd60a', pcu, 1.38, pcv);
        for (let i = 0; i < 14; i++) cyl(still, 0.035, 0.035, 0.01, '#ffd60a', p.u0 + 0.12 + (i % 7) * 0.11, 0.92 + Math.floor(i / 7) * 0.012, p.v0 + 0.2 + (i % 3) * 0.12, 10);
        const plate = box(live, p.u1 - p.u0 - 0.1, 0.08, 0.2, '#c0c0c0', pcu, 0.92, p.v1 - 0.2);
        const lights = box(live, p.u1 - p.u0, 0.04, 0.04, glowMat('#ff00aa', 1.2), pcu, 1.36, p.v0);
        out.push({
          update: (t) => ((plate.position.z = -(p.v1 - 0.22 - Math.abs(Math.sin(t * 0.9)) * 0.15)), (lights.visible = Math.sin(t * 6) > -0.3)),
        });
      }
    }
  } else if (k.id === 'post') {
    const sign = painted('post-sign', 512, 128, (g) => {
      g.fillStyle = '#ffcc00';
      g.fillRect(0, 0, 512, 128);
      g.fillStyle = '#1d1d1b';
      g.font = 'bold 72px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('📯 POST', 256, 68);
    });
    picture(
      live,
      tm(sign, {
        emissive: '#ffffff',
        emissiveIntensity: 0.35,
        emissiveMap: sign,
      }),
      1.6,
      0.4,
      cu,
      2.75,
      back - 0.02,
      0,
      -1,
    );
    // A scale on the counter, and stamps.
    if (counter) {
      box(still, 0.34, 0.06, 0.3, '#adb5bd', counter.u0 + 0.35, counter.h, (counter.v0 + counter.v1) / 2);
      box(still, 0.3, 0.02, 0.26, '#e9ecef', counter.u0 + 0.35, counter.h + 0.06, (counter.v0 + counter.v1) / 2);
    }
    for (const p of room.pieces) {
      const pcu = (p.u0 + p.u1) / 2;
      const pcv = (p.v0 + p.v1) / 2;
      if (p.what === 'poboxes') {
        // A wall of little brass doors with numbers on them.
        const face = p.du > 0 ? p.u1 : p.u0;
        box(still, p.u1 - p.u0, p.h, p.v1 - p.v0, '#6c584c', pcu, 0, pcv);
        const rows = 7;
        const cols = Math.max(2, Math.floor((p.v1 - p.v0 - 0.1) / 0.32));
        for (let r = 0; r < rows; r++)
          for (let c = 0; c < cols; c++) {
            const v = p.v0 + 0.1 + (c + 0.5) * ((p.v1 - p.v0 - 0.2) / cols);
            box(still, 0.02, 0.24, 0.26, (r + c) % 5 === 0 ? '#b08d57' : '#c9a227', face + p.du * 0.01, 0.15 + r * 0.29, v);
            box(still, 0.02, 0.03, 0.03, '#1d1d1b', face + p.du * 0.02, 0.24 + r * 0.29, v + 0.08);
          }
      } else if (p.what === 'parcels') {
        const colors = ['#c8a165', '#b5895a', '#d4a373', '#a98467'];
        let i = 0;
        for (let v = p.v0 + 0.05; v < p.v1 - 0.35; v += 0.42)
          for (let y = 0, n = 0; n < 3 && y < p.h - 0.2; n++, i++) {
            const sz = 0.28 + ((i * 7) % 4) * 0.04;
            box(still, Math.min(sz, p.u1 - p.u0 - 0.05), sz * 0.7, sz, colors[i % 4], pcu, y, v + sz / 2);
            box(still, Math.min(sz, p.u1 - p.u0 - 0.05) + 0.005, 0.03, sz + 0.005, '#ffcc00', pcu, y + sz * 0.35, v + sz / 2);
            y += sz * 0.7;
          }
      } else if (p.what === 'letterbox') {
        box(still, p.u1 - p.u0, 0.8, p.v1 - p.v0, '#ffcc00', pcu, 0.45, pcv);
        box(still, 0.06, 0.45, 0.06, '#1d1d1b', pcu, 0, pcv);
        box(still, 0.02, 0.04, 0.24, '#1d1d1b', (p.du < 0 ? p.u0 : p.u1) + p.du * 0.01, 1.05, pcv);
        cyl(still, 0.06, 0.06, 0.02, '#1d1d1b', (p.du < 0 ? p.u0 : p.u1) + p.du * 0.01, 0.75, pcv, 12).rotation.z = Math.PI / 2;
      }
    }
  }
  return out;
}
