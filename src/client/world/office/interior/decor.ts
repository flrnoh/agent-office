import * as THREE from 'three';
import { DESK_SIZE, FLOOR, LADDER, LOFT, POLES, WALL_HEIGHT, WING, type Side } from '../../../../shared/layout';
import type { InteriorStyle } from '../../../../shared/interiors';
import { mulberry32 } from '../../../../shared/rng';
import { mesh, toon } from '../../toon';
import { wire } from './lamps';

// flrnoh fork (see FORK.md, "Each storey its own interior"): the bits that make an interior a place of
// its own, past its floor, walls, lamps and rugs: up under the ceiling (a loft's ducts and steel, an
// Altbau's stucco, a jungle's hanging plants, a disco ball, neon strips, dark beams), on the desks (a
// banker's lamp, a lava lamp, pampas grass, a bonsai, a glow under the top), and neon signs on the wall.
// Nothing here is in anyone's way: it's all up out of reach, on a desk, or flat on a wall.

/** What an interior adds to a storey. */
export interface Decor {
  /** Up under the ceiling and along the walls, in the room's coordinates. */
  room: THREE.Group;
  /** On desk `id`, in its own frame (see buildDesk): the desk carries it wherever its storey puts it. */
  desks: { id: string; obj: THREE.Object3D }[];
  /** Signs on wall `wall`, `u` along it, `y` up, `w` by `h`: pictures don't go over them. */
  signs: { wall: Side; u: number; y: number; w: number; h: number }[];
  /** Spins the disco ball, flickers the neon. */
  update?(t: number): void;
}

/** What a storey gives the decor to go round. */
export interface DecorSite {
  /** The room's desks' ids, `desk-1`.. (DESKS' order). */
  deskIds: readonly string[];
  /** The wall its finish goes on (see wallFinish). */
  accent: Side;
}

const { width: DW, depth: DD, height: DH } = DESK_SIZE;
/** A free back corner of the `i`th desk (the succulent has the left one on every third, the mug or books the right on the rest). */
const corner = (i: number): [number, number] => (i % 3 === 1 ? [DW / 2 - 0.3, -0.32] : [-DW / 2 + 0.3, -0.32]);

/** The ceiling over the room, clear of the loft, the ladder's hatch, the pole's hole and the back office. */
function clearOverhead(x: number, z: number, r: number): boolean {
  if (x + r > LOFT.minX - 0.3 && z + r > LOFT.minZ - 0.3) return false;
  if (Math.hypot(x - LADDER.x, z - LADDER.z) < 1.4 + r) return false;
  if (POLES.some((p) => Math.hypot(x - p.x, z - p.z) < 1.2 + r)) return false;
  if (x + r > WING.minX - 0.2 && z - r < -7) return false;
  return x - r > FLOOR.minX + 0.2 && x + r < FLOOR.maxX - 0.2 && z - r > FLOOR.minZ + 0.2 && z + r < FLOOR.maxZ - 0.2;
}

/** A box from (x0, y0, z0) to (x1, y1, z1). */
function slab(mat: THREE.Material, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): THREE.Mesh {
  return mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, false);
}

/** A horizontal cylinder along x from x0 to x1, or along z. */
function pipe(mat: THREE.Material, r: number, along: 'x' | 'z', from: number, to: number, y: number, at: number): THREE.Mesh {
  const m = mesh(new THREE.CylinderGeometry(r, r, to - from, 16), mat, along === 'x' ? (from + to) / 2 : at, y, along === 'x' ? at : (from + to) / 2, false);
  m.rotation[along === 'x' ? 'z' : 'x'] = Math.PI / 2;
  return m;
}

// ---- Industrie-Loft: spiral ducts on hangers, steel I-beams across the room ----

function loft(): Decor {
  const room = new THREE.Group();
  const zinc = toon('#b7bcc3');
  const seam = toon('#8f959d');
  const steel = toon('#2f3238');
  const strap = wire('#5c636e');
  const y = WALL_HEIGHT - 0.6;
  for (const z of [-6.8, 5.2]) {
    room.add(pipe(zinc, 0.34, 'x', FLOOR.minX + 0.3, LOFT.minX - 0.6, y, z));
    for (let x = FLOOR.minX + 1.2; x < LOFT.minX - 0.6; x += 1.4) {
      const band = mesh(new THREE.TorusGeometry(0.345, 0.025, 4, 20), seam, x, y, z, false);
      band.rotation.y = Math.PI / 2;
      room.add(band);
    }
    for (let x = FLOOR.minX + 2; x < LOFT.minX - 1; x += 4) room.add(slab(strap, x - 0.03, x + 0.03, y + 0.3, WALL_HEIGHT, z - 0.03, z + 0.03));
    // Vents down into the room.
    for (const x of [-12, -4, 4]) room.add(mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.4, 14), zinc, x, y - 0.42, z, false));
  }
  // I-beams across: a web and two flanges, spanning the room under the ceiling.
  for (const x of [-13.5, -6, 1.5]) {
    const z0 = FLOOR.minZ;
    const z1 = FLOOR.maxZ;
    room.add(slab(steel, x - 0.04, x + 0.04, WALL_HEIGHT - 0.45, WALL_HEIGHT - 0.05, z0, z1));
    room.add(slab(steel, x - 0.16, x + 0.16, WALL_HEIGHT - 0.5, WALL_HEIGHT - 0.44, z0, z1));
    room.add(slab(steel, x - 0.16, x + 0.16, WALL_HEIGHT - 0.06, WALL_HEIGHT, z0, z1));
    // Rivets along the bottom flange.
    for (let z = z0 + 0.6; z < z1; z += 1.2) room.add(mesh(new THREE.SphereGeometry(0.025, 6, 4), seam, x + 0.11, WALL_HEIGHT - 0.51, z, false));
  }
  return { room, desks: [], signs: [] };
}

// ---- Skandi: pale beams, pampas grass in ceramic vases ----

function pampas(rnd: () => number): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.22, 14), toon('#efe9df'), 0, 0.11, 0));
  g.add(mesh(new THREE.TorusGeometry(0.06, 0.012, 6, 14).rotateX(Math.PI / 2), toon('#d8cfc2'), 0, 0.22, 0, false));
  const plume = toon('#eadcc0');
  for (let k = 0; k < 5; k++) {
    const lean = (k - 2) * 0.12 + (rnd() - 0.5) * 0.08;
    const len = 0.45 + rnd() * 0.2;
    const s = new THREE.Group();
    s.position.set(0, 0.2, 0);
    s.rotation.set(lean * 0.6, k * 1.3, lean);
    s.add(mesh(new THREE.CylinderGeometry(0.004, 0.006, len, 4), wire('#cdb78e'), 0, len / 2, 0, false));
    s.add(mesh(new THREE.SphereGeometry(0.05, 8, 6).scale(1, 2.6, 1), plume, 0, len + 0.06, 0, false));
    g.add(s);
  }
  return g;
}

function skandi(site: DecorSite): Decor {
  const room = new THREE.Group();
  const pale = toon('#e3cfae');
  for (let z = -10; z <= 10; z += 5) room.add(slab(pale, FLOOR.minX, z > LOFT.minZ - 1 ? LOFT.minX : FLOOR.maxX, WALL_HEIGHT - 0.22, WALL_HEIGHT, z - 0.1, z + 0.1));
  const rnd = mulberry32(3);
  const desks = site.deskIds.flatMap((id, i) => {
    if (i % 3 !== 0) return [];
    const obj = pampas(rnd);
    const [x, z] = corner(i);
    obj.position.set(x, DH, z);
    return [{ id, obj }];
  });
  return { room, desks, signs: [] };
}

// ---- Altbau: stucco rosettes and frames on the ceiling, banker's lamps on the desks ----

function bankersLamp(): THREE.Group {
  const g = new THREE.Group();
  const brass = toon('#c9a24a', { emissive: '#2a1e00' });
  g.add(mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.03, 16), brass, 0, 0.015, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 6), brass, 0, 0.17, 0, false));
  const shadeMesh = mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.34, 16, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), toon('#1f6b4a', { emissive: '#0b2a1c' }), 0, 0.33, 0.02);
  g.add(shadeMesh);
  g.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.26, 8).rotateZ(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#fff1c2' }), 0, 0.31, 0.03, false));
  return g;
}

function altbau(site: DecorSite, lamps: readonly (readonly [number, number])[]): Decor {
  const room = new THREE.Group();
  const stucco = toon('#fbf9f3');
  const y = WALL_HEIGHT - 0.02;
  for (const [x, z] of lamps) {
    if (x > LOFT.minX && z > LOFT.minZ) continue;
    for (const [r, t, dy] of [[0.75, 0.05, 0], [0.55, 0.06, -0.03], [0.32, 0.07, -0.06]]) {
      const ring = mesh(new THREE.TorusGeometry(r, t, 6, 36), stucco, x, y + dy, z, false);
      ring.rotation.x = Math.PI / 2;
      room.add(ring);
    }
    // Leaves round the rosette.
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const leaf = mesh(new THREE.SphereGeometry(0.11, 8, 4).scale(1, 0.35, 0.45), stucco, x + Math.sin(a) * 0.95, y - 0.02, z + Math.cos(a) * 0.95, false);
      leaf.rotation.y = a;
      room.add(leaf);
    }
  }
  // Ceiling frames (a beaded moulding) over the desks.
  const frame = (x0: number, x1: number, z0: number, z1: number) => {
    room.add(slab(stucco, x0, x1, y - 0.06, y, z0 - 0.04, z0 + 0.04));
    room.add(slab(stucco, x0, x1, y - 0.06, y, z1 - 0.04, z1 + 0.04));
    room.add(slab(stucco, x0 - 0.04, x0 + 0.04, y - 0.06, y, z0, z1));
    room.add(slab(stucco, x1 - 0.04, x1 + 0.04, y - 0.06, y, z0, z1));
  };
  frame(-15.5, -0.5, -10, -1.2);
  frame(-15.5, -0.5, 1.2, 8.5);
  const desks = site.deskIds.map((id, i) => {
    const obj = bankersLamp();
    const [x, z] = corner(i);
    obj.position.set(x, DH, z);
    return { id, obj };
  });
  return { room, desks, signs: [] };
}

// ---- Urban Jungle: baskets hanging from the ceiling, vines along the top of the walls ----

function hangingPlant(rnd: () => number, drop: number): THREE.Group {
  const g = new THREE.Group();
  const rope = wire('#c9b48a');
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    const w = mesh(new THREE.CylinderGeometry(0.006, 0.006, drop, 3), rope, Math.sin(a) * 0.1, drop / 2 + 0.15, Math.cos(a) * 0.1, false);
    w.rotation.set(Math.cos(a) * -0.06, 0, Math.sin(a) * 0.06);
    g.add(w);
  }
  g.add(mesh(new THREE.SphereGeometry(0.24, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), toon('#c4673f'), 0, 0.15, 0));
  const greens = [toon('#4f8a3c'), toon('#6aa84f'), toon('#3d7a35')];
  // A mound of leaves, and vines trailing down over the edge.
  for (let k = 0; k < 7; k++) g.add(mesh(new THREE.SphereGeometry(0.1 + rnd() * 0.06, 8, 6), greens[k % 3], (rnd() - 0.5) * 0.3, 0.2 + rnd() * 0.08, (rnd() - 0.5) * 0.3, false));
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + rnd();
    const len = 0.5 + rnd() * 0.9;
    for (let s = 0; s < len / 0.09; s++) {
      const y = 0.12 - s * 0.09;
      const out = 0.22 + Math.min(0.12, s * 0.015);
      g.add(mesh(new THREE.SphereGeometry(0.05 - s * 0.002, 6, 4).scale(1.3, 0.6, 1), greens[(k + s) % 3], Math.sin(a) * out, y, Math.cos(a) * out, false));
    }
  }
  return g;
}

function jungle(): Decor {
  const room = new THREE.Group();
  const rnd = mulberry32(19);
  for (const [x, z] of [[-15, -9], [-7, -9.5], [0.5, -8.5], [-14, 9], [-6, 6.5], [1.5, 7.5], [-16, -2], [5, -4], [-10.5, 0], [-2, 0]] as const) {
    if (!clearOverhead(x, z, 0.4)) continue;
    const drop = 1.6 + rnd() * 0.9;
    const p = hangingPlant(rnd, drop);
    p.position.set(x, WALL_HEIGHT - drop - 0.15, z);
    room.add(p);
  }
  // Vines draped along the top of the west and south walls, in swags.
  const greens = [toon('#4f8a3c'), toon('#6aa84f'), toon('#3d7a35')];
  const swag = (along: 'x' | 'z', from: number, to: number, at: number) => {
    for (let u = from; u < to; u += 0.22) {
      const sag = Math.sin(((u - from) / 2.4) * Math.PI) ** 2 * 0.5;
      const x = along === 'x' ? u : at;
      const z = along === 'x' ? at : u;
      room.add(mesh(new THREE.SphereGeometry(0.09, 6, 4), greens[Math.floor(u * 7) % 3 < 0 ? 0 : Math.floor(u * 7) % 3], x, WALL_HEIGHT - 0.25 - Math.abs(sag), z, false));
    }
  };
  swag('z', FLOOR.minZ + 0.3, FLOOR.maxZ - 0.3, FLOOR.minX + 0.2);
  swag('x', FLOOR.minX + 0.3, LOFT.minX - 0.3, FLOOR.maxZ - 0.2);
  return { room, desks: [], signs: [] };
}

// ---- 70er: a disco ball over the lounge, lava lamps on the desks ----

function lavaLamp(color: string, glowColor: string): { obj: THREE.Group; blobs: THREE.Mesh[] } {
  const g = new THREE.Group();
  const chrome = toon('#c0c4c9', { emissive: '#202226' });
  g.add(mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.12, 14), chrome, 0, 0.06, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.05, 0.035, 0.26, 14), new THREE.MeshBasicMaterial({ color: glowColor, transparent: true, opacity: 0.55 }), 0, 0.25, 0, false));
  g.add(mesh(new THREE.CylinderGeometry(0.02, 0.05, 0.07, 14), chrome, 0, 0.415, 0));
  const blobMat = new THREE.MeshBasicMaterial({ color });
  const blobs = [0, 1, 2].map((k) => {
    const b = mesh(new THREE.SphereGeometry(0.022 + k * 0.006, 8, 6), blobMat, 0, 0.18 + k * 0.06, 0, false);
    g.add(b);
    return b;
  });
  return { obj: g, blobs };
}

function retro(site: DecorSite): Decor {
  const room = new THREE.Group();
  // The disco ball, over the lounge clear of its lamp.
  const ball = new THREE.Group();
  ball.position.set(11.5, WALL_HEIGHT - 1.3, -3.4);
  room.add(slab(wire('#c0c4c9'), 11.49, 11.51, WALL_HEIGHT - 1.0, WALL_HEIGHT, -3.41, -3.39));
  const mirror = toon('#e6ebf0', { emissive: '#4a5560' });
  const dark = toon('#8a95a3', { emissive: '#1a2028' });
  const geo = new THREE.SphereGeometry(0.3, 14, 10);
  const facets = new THREE.Mesh(geo, mirror);
  ball.add(facets);
  // Squares of mirror over it.
  for (let i = 0; i < 10; i++) {
    for (let j = 0; j < 14; j++) {
      const phi = ((i + 0.5) / 10) * Math.PI;
      const th = (j / 14) * Math.PI * 2;
      const n = new THREE.Vector3(Math.sin(phi) * Math.cos(th), Math.cos(phi), Math.sin(phi) * Math.sin(th));
      const tile = mesh(new THREE.BoxGeometry(0.05, 0.05, 0.01), (i + j) % 3 ? mirror : dark, n.x * 0.305, n.y * 0.305, n.z * 0.305, false);
      tile.lookAt(n.clone().multiplyScalar(2));
      ball.add(tile);
    }
  }
  room.add(ball);
  const lamps: THREE.Mesh[][] = [];
  const colors: [string, string][] = [['#ff5a1f', '#ffd27a'], ['#ff2e88', '#ffe08a'], ['#ffb400', '#ff8a5b'], ['#7bdc3a', '#ffe9a8']];
  const desks = site.deskIds.flatMap((id, i) => {
    if (i % 2) return [];
    const [color, glowColor] = colors[(i / 2) % colors.length];
    const lava = lavaLamp(color, glowColor);
    lamps.push(lava.blobs);
    const [x, z] = corner(i);
    lava.obj.position.set(x, DH, z);
    return [{ id, obj: lava.obj }];
  });
  return {
    room,
    desks,
    signs: [],
    update: (t) => {
      ball.rotation.y = t * 0.5;
      lamps.forEach((blobs, n) =>
        blobs.forEach((b, k) => {
          b.position.y = 0.25 + Math.sin(t * (0.35 + k * 0.13) + n * 1.7 + k * 2.1) * 0.09;
          b.scale.y = 1.2 + Math.sin(t * 0.8 + k) * 0.3;
        }),
      );
    },
  };
}

// ---- Neon: LED strips round the ceiling and the skirting, signs on the wall, desks glowing underneath ----

/** A sign in neon tubes: `text` glowing `color` on a dark board, 0.42 m tall letters. */
function neonSign(text: string, color: string): { obj: THREE.Group; w: number; h: number; tube: THREE.MeshBasicMaterial } {
  const size = 96;
  const c = document.createElement('canvas');
  const g2 = c.getContext('2d')!;
  const font = `800 ${size}px Nunito, ui-rounded, system-ui, sans-serif`;
  g2.font = font;
  c.width = Math.ceil(g2.measureText(text).width) + size;
  c.height = Math.ceil(size * 1.7);
  g2.font = font;
  g2.textAlign = 'center';
  g2.textBaseline = 'middle';
  // The glow round the tube, then the tube, then its hot white core.
  g2.shadowColor = color;
  g2.shadowBlur = 28;
  g2.lineWidth = 9;
  g2.strokeStyle = color;
  g2.strokeText(text, c.width / 2, c.height / 2);
  g2.shadowBlur = 0;
  g2.lineWidth = 3;
  g2.strokeStyle = '#ffffff';
  g2.strokeText(text, c.width / 2, c.height / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const perPx = 0.42 / size;
  const sw = c.width * perPx;
  const sh = c.height * perPx;
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(sw + 0.2, sh + 0.1, 0.04), toon('#11121a'), 0, 0, -0.03, false));
  const tube = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
  tube.userData.own = true; // this sign's alone: disposed with it
  g.add(mesh(new THREE.PlaneGeometry(sw, sh), tube, 0, 0, 0.001, false));
  return { obj: g, w: sw + 0.2, h: sh + 0.1, tube };
}

function neon(site: DecorSite, style: InteriorStyle): Decor {
  const room = new THREE.Group();
  const cyan = new THREE.MeshBasicMaterial({ color: style.paint?.trim ?? '#19e3ff' });
  const magenta = new THREE.MeshBasicMaterial({ color: '#ff3dcb' });
  const t = 0.05;
  // Round the top of the walls, and along the skirting.
  for (const [mat, y] of [[cyan, WALL_HEIGHT - 0.15], [magenta, 0.06]] as const) {
    room.add(slab(mat, FLOOR.minX + 0.02, FLOOR.maxX - 0.02, y, y + t, FLOOR.minZ + 0.02, FLOOR.minZ + 0.02 + t));
    room.add(slab(mat, FLOOR.minX + 0.02, FLOOR.maxX - 0.02, y, y + t, FLOOR.maxZ - 0.02 - t, FLOOR.maxZ - 0.02));
    room.add(slab(mat, FLOOR.minX + 0.02, FLOOR.minX + 0.02 + t, y, y + t, FLOOR.minZ, FLOOR.maxZ));
    room.add(slab(mat, FLOOR.maxX - 0.02 - t, FLOOR.maxX - 0.02, y, y + t, FLOOR.minZ, FLOOR.maxZ));
  }
  // Light lines across the ceiling, over the desks.
  for (const z of [-8, -3, 3, 8]) room.add(slab(z % 2 ? cyan : magenta, -16, 6, WALL_HEIGHT - 0.04, WALL_HEIGHT - 0.01, z - 0.04, z + 0.04));

  // Two signs on the accent wall, high up over the boards and windows.
  const signs: Decor['signs'] = [];
  const tubes: THREE.MeshBasicMaterial[] = [];
  const wall = site.accent;
  const along = wall === 'north' || wall === 'south';
  const [lo, hi] = along ? [FLOOR.minX + 2, (wall === 'north' ? WING.minX : LOFT.minX) - 2] : [FLOOR.minZ + 2, FLOOR.maxZ - (wall === 'east' ? 6 : 2)];
  const words: [string, string][] = [['SHIP IT', '#19e3ff'], ['</> AGENTS AT WORK', '#ff3dcb']];
  words.forEach(([text, color], k) => {
    const sign = neonSign(text, color);
    const u = lo + ((k + 0.5) / words.length) * (hi - lo);
    const y = 4.9 + (k % 2) * 0.35;
    const inward = 0.05;
    const pos = { north: [u, y, FLOOR.minZ + inward, 0], south: [u, y, FLOOR.maxZ - inward, Math.PI], west: [FLOOR.minX + inward, y, u, Math.PI / 2], east: [FLOOR.maxX - inward, y, u, -Math.PI / 2] }[wall];
    sign.obj.position.set(pos[0], pos[1], pos[2]);
    sign.obj.rotation.y = pos[3];
    room.add(sign.obj);
    tubes.push(sign.tube);
    signs.push({ wall, u, y, w: sign.w, h: sign.h });
  });

  // A glow under every desk, in its chair's color.
  const desks = site.deskIds.map((id, i) => {
    const color = ['#19e3ff', '#ff3dcb', '#8a5cff', '#2bff88'][i % 4];
    const strip = mesh(new THREE.BoxGeometry(DW - 0.4, 0.02, 0.03), new THREE.MeshBasicMaterial({ color }), 0, DH - 0.1, DD / 2 - 0.08, false);
    return { id, obj: strip };
  });
  return {
    room,
    desks,
    signs,
    // Now and then a tube flickers.
    update: (t) => tubes.forEach((m, k) => (m.opacity = Math.sin(t * 13 + k * 5) > 0.985 || Math.sin(t * 0.7 + k) > 0.995 ? 0.35 : 1)),
  };
}

// ---- Zen: a grid of dark beams under the ceiling, a bonsai on every other desk ----

function bonsai(rnd: () => number): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.22, 0.05, 0.14), toon('#2f3e52'), 0, 0.025, 0));
  const bark = toon('#5a3d28');
  const trunk = mesh(new THREE.CylinderGeometry(0.012, 0.025, 0.18, 6), bark, 0.01, 0.13, 0);
  trunk.rotation.z = -0.35;
  g.add(trunk);
  const branch = mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.12, 5), bark, -0.03, 0.2, 0);
  branch.rotation.z = 0.9;
  g.add(branch);
  const leaf = [toon('#4f7a3a'), toon('#6a9a4c')];
  for (const [x, y, s] of [[0.05, 0.24, 0.07], [-0.08, 0.23, 0.06], [0.0, 0.29, 0.055]] as const) g.add(mesh(new THREE.SphereGeometry(s + rnd() * 0.01, 10, 6).scale(1.4, 0.6, 1.1), leaf[Math.floor(rnd() * 2)], x, y, 0, false));
  return g;
}

function zen(site: DecorSite, style: InteriorStyle): Decor {
  const room = new THREE.Group();
  const wood = toon(style.paint?.trim ?? '#3a2a1e');
  const y0 = WALL_HEIGHT - 0.28;
  for (let x = -15; x <= 7; x += 4.4) room.add(slab(wood, x - 0.12, x + 0.12, y0, WALL_HEIGHT, FLOOR.minZ, x > LOFT.minX - 0.5 ? LOFT.minZ : FLOOR.maxZ));
  for (let z = -10; z <= 10; z += 5) room.add(slab(wood, FLOOR.minX, z > LOFT.minZ - 0.5 ? LOFT.minX : FLOOR.maxX, y0 + 0.08, WALL_HEIGHT, z - 0.08, z + 0.08));
  const rnd = mulberry32(29);
  const desks = site.deskIds.flatMap((id, i) => {
    if (i % 2 === 0) return [];
    const obj = bonsai(rnd);
    const [x, z] = corner(i);
    obj.position.set(x, DH, z);
    return [{ id, obj }];
  });
  return { room, desks, signs: [] };
}

/** What interior `style` adds to a storey (see Decor), with the room's lamps at `lamps`. */
export function decor(style: InteriorStyle, site: DecorSite, lamps: readonly (readonly [number, number])[]): Decor {
  switch (style.id) {
    case 'loft':
      return loft();
    case 'skandi':
      return skandi(site);
    case 'altbau':
      return altbau(site, lamps);
    case 'jungle':
      return jungle();
    case 'retro':
      return retro(site);
    case 'neon':
      return neon(site, style);
    case 'zen':
      return zen(site, style);
    default:
      return { room: new THREE.Group(), desks: [], signs: [] };
  }
}
