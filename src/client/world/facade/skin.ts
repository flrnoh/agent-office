import * as THREE from 'three';
import { SLAB, WALL_HEIGHT, type Opening, type Side } from '../../../shared/layout';
import type { InteriorStyle } from '../../../shared/interiors';
import type { Balcony } from '../../../shared/storey';
import { mulberry32 } from '../../../shared/rng';
import type { NightParts } from '../outside';
import { mesh, toon } from '../toon';
import { B } from './frame';
import { MURAL, mural } from './mural';
import { FIN, finXs } from '../../../shared/facade-fins';

// flrnoh fork (see FORK.md, "A facade for creatives"): what goes over the tower's walls a storey at a
// time: the murals, the fins, the bands round each storey and the paint dripping off the top.

/** How far off the walls the murals are painted, outside the tower's own planes (0.01 off). */
const OFF = 0.025;

/** Each side's face: its ends (along x or z), the way out, and which way the viewer's right runs along it. */
const FACE: Record<Side, { u0: number; u1: number; at: (u: number, y: number, out: number) => THREE.Vector3; rotY: number; right: 1 | -1 }> = {
  north: { u0: B.minX, u1: B.maxX, at: (u, y, o) => new THREE.Vector3(u, y, B.minZ - o), rotY: Math.PI, right: -1 },
  south: { u0: B.minX, u1: B.maxX, at: (u, y, o) => new THREE.Vector3(u, y, B.maxZ + o), rotY: 0, right: 1 },
  west: { u0: B.minZ, u1: B.maxZ, at: (u, y, o) => new THREE.Vector3(B.minX - o, y, u), rotY: -Math.PI / 2, right: 1 },
  east: { u0: B.minZ, u1: B.maxZ, at: (u, y, o) => new THREE.Vector3(B.maxX + o, y, u), rotY: Math.PI / 2, right: -1 },
};

/** The stretches of `side` from y0 to y1 (a storey's own heights) round `holes`, as [u0, u1, y0, y1]. */
function around(side: Side, holes: readonly Opening[], y0: number, y1: number): [number, number, number, number][] {
  const f = FACE[side];
  const out: [number, number, number, number][] = [];
  const piece = (a: number, b: number, lo: number, hi: number) => {
    lo = Math.max(lo, y0);
    hi = Math.min(hi, y1);
    if (b - a > 0.001 && hi - lo > 0.001) out.push([a, b, lo, hi]);
  };
  let u = f.u0;
  for (const o of [...holes].sort((a, b) => a.u - b.u)) {
    const h0 = Math.max(f.u0, o.u - o.width / 2 - 0.12);
    const h1 = Math.min(f.u1, o.u + o.width / 2 + 0.12);
    piece(u, h0, y0, y1);
    piece(h0, h1, o.y1 + 0.1, y1);
    piece(h0, h1, y0, o.y0 - 0.1);
    u = h1;
  }
  piece(u, f.u1, y0, y1);
  return out;
}

/** A storey's mural on `side`, `y0` up (its floor), round its windows and doors: mural `which` (see mural.ts). */
export function muralWall(parts: THREE.Group, side: Side, y0: number, holes: readonly Opening[], which: number) {
  const f = FACE[side];
  const mat = mural(which);
  const len = f.u1 - f.u0;
  for (const [a, b, lo, hi] of around(side, holes, -SLAB, WALL_HEIGHT)) {
    const geo = new THREE.PlaneGeometry(b - a, hi - lo);
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) {
      // Where along the wall this corner is, from the viewer's left: the mural reads the right way round.
      const u = (a + b) / 2 + pos.getX(i) * f.right;
      const fromLeft = f.right > 0 ? u - f.u0 : f.u1 - u;
      // A wall shorter than the painting shows its middle.
      const s = (fromLeft + (MURAL.width - len) / 2) / MURAL.width;
      const t = ((lo + hi) / 2 + pos.getY(i) + SLAB) / MURAL.height;
      uv.setXY(i, s, t);
    }
    const m = mesh(geo, mat, 0, 0, 0, false);
    m.position.copy(f.at((a + b) / 2, y0 + (lo + hi) / 2, OFF));
    m.rotation.y = f.rotY;
    parts.add(m);
  }
}

/** The fins' colors, round the rainbow. */
const FIN_COLORS = ['#ef476f', '#ff8a5b', '#ffd166', '#06d6a0', '#4cc9f0', '#118ab2', '#8a5cff', '#f72585'];

/**
 * Upright fins down the street side, `y0` up, standing out from the wall between its windows, its
 * balcony doors and the decks along it: round the rainbow from one end to the other, each storey's turned
 * on a little from the one below, so the colors climb the building in a slant.
 */
export function fins(parts: THREE.Group, y0: number, holes: readonly Opening[], balconies: readonly Balcony[], k: number, night: NightParts) {
  const DEPTH = FIN.depth;
  const W = FIN.width;
  // Where they stand is shared (shared/facade-fins.ts): DER BRECHER's brackets keep clear of them.
  for (const u of finXs(holes, balconies)) {
    const n = Math.round((u - (B.minX + 0.5)) / FIN.step);
    const color = FIN_COLORS[(n + k) % FIN_COLORS.length];
    const h = WALL_HEIGHT - 0.3;
    parts.add(mesh(new THREE.BoxGeometry(W, h, DEPTH), toon(color), u, y0 + 0.15 + h / 2, B.maxZ + DEPTH / 2, false));
    // Its front edge a light in its color: by night the street side is a rainbow.
    parts.add(mesh(new THREE.BoxGeometry(W * 0.4, h, 0.03), finGlow(color, night), u, y0 + 0.15 + h / 2, B.maxZ + DEPTH + 0.015, false));
  }
}

const FIN_GLOWS = new Map<string, THREE.MeshToonMaterial>();
/** A fin's front edge in `color`, lit a little by day and fully at night. */
function finGlow(color: string, night: NightParts): THREE.MeshToonMaterial {
  let m = FIN_GLOWS.get(color);
  if (!m) {
    m = new THREE.MeshToonMaterial({ color: '#ffffff' });
    m.emissive.set(color);
    m.emissiveIntensity = 0.25;
    m.userData.outlineParameters = { visible: false };
    night.bulbs.push({ mat: m, day: 0.25 });
    FIN_GLOWS.set(color, m);
  }
  return m;
}

/** What each interior glows with at night, under its storey's band. */
const GLOWS: Record<string, string> = {
  klassik: '#ffd27a',
  loft: '#ffb347',
  skandi: '#fff1d0',
  altbau: '#ffd27a',
  jungle: '#9be564',
  retro: '#ff8a3d',
  neon: '#19e3ff',
  zen: '#ffe2a8',
};
const GLOW_MATS = new Map<string, THREE.MeshToonMaterial>();

/** The light under a storey furnished in `style`, glowing a little by day and fully at night. */
export function glowOf(style: InteriorStyle, night: NightParts): THREE.MeshToonMaterial {
  const color = GLOWS[style.id] ?? '#ffd27a';
  let m = GLOW_MATS.get(color);
  if (!m) {
    m = new THREE.MeshToonMaterial({ color });
    m.emissive.set(color);
    m.emissiveIntensity = 0.35;
    night.bulbs.push({ mat: m, day: 0.35 });
    GLOW_MATS.set(color, m);
  }
  return m;
}

/** The band round a storey at its slab, `y0` up, in its interior's color, and the line of light under it. */
export function bands(parts: THREE.Group, y0: number, style: InteriorStyle, light: THREE.Material) {
  const color = toon(style.accent ?? style.paint?.trim ?? '#e8a87c');
  const OUT = 0.2;
  const cx = (B.minX + B.maxX) / 2;
  const cz = (B.minZ + B.maxZ) / 2;
  // Its top flush with the floor, so it never rises over a balcony's threshold.
  const H = 0.55;
  const y = y0 - H / 2;
  // Four sides of a frame round the building, and a thin light under it a little further in.
  for (const [mat, h, out, yy] of [
    [color, H, OUT, y],
    [light, 0.08, OUT - 0.04, y0 - H - 0.06],
  ] as const) {
    const ww = B.maxX - B.minX + 2 * out;
    const dd = B.maxZ - B.minZ + 2 * out;
    parts.add(mesh(new THREE.BoxGeometry(ww, h, out), mat, cx, yy, B.minZ - out / 2, false));
    parts.add(mesh(new THREE.BoxGeometry(ww, h, out), mat, cx, yy, B.maxZ + out / 2, false));
    parts.add(mesh(new THREE.BoxGeometry(out, h, dd - 2 * out), mat, B.minX - out / 2, yy, cz, false));
    parts.add(mesh(new THREE.BoxGeometry(out, h, dd - 2 * out), mat, B.maxX + out / 2, yy, cz, false));
  }
}

/** Paint running down from the top of the street side (`top` up), in every color, clear of the top storey's windows. */
export function drips(parts: THREE.Group, top: number, windows: readonly Opening[]) {
  const rnd = mulberry32(77);
  const tall = windows.filter((o) => o.wall === 'south');
  for (let i = 0; i < 22; i++) {
    const u = B.minX + 0.8 + rnd() * (B.maxX - B.minX - 1.6);
    const len = 0.6 + rnd() * 1.8;
    // Not down over a window.
    if (tall.some((o) => Math.abs(u - o.u) < o.width / 2 + 0.3 && top - len < o.y1 + (top - WALL_HEIGHT) + 0.2)) continue;
    const mat = toon(FIN_COLORS[i % FIN_COLORS.length]);
    const r = 0.07 + rnd() * 0.07;
    // Down the wall from under the cornice (world/tower.ts's, 0.45 high and 0.22 out), a drop at the end.
    const z = B.maxZ + 0.04 + r;
    parts.add(mesh(new THREE.CylinderGeometry(r, r, len, 8), mat, u, top - len / 2, z, false));
    parts.add(mesh(new THREE.SphereGeometry(r * 1.45, 10, 8), mat, u, top - len, z, false));
    // Spilt over the cornice's edge, and down its front.
    parts.add(mesh(new THREE.SphereGeometry(r * 2.4, 10, 6).scale(1, 0.35, 1), mat, u, top + 0.45, B.maxZ + 0.12, false));
    parts.add(mesh(new THREE.BoxGeometry(r * 2.2, 0.45, 0.04), mat, u, top + 0.22, B.maxZ + 0.24, false));
  }
}
