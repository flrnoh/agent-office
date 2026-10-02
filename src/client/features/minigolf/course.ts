import * as THREE from 'three';
import { LANE_Y } from '../../../shared/minigolf';
import { type HoleDef, type LookedRail } from '../../../shared/minigolf-holes';
import { CUP_R, heightAt, inPoly, type Height, type Surface } from '../../../shared/minigolf-physics';
import { Batch, halo, stripGeo, unlit } from './look';
import { feltTexture, signTexture } from './paint';

/*
 * A hole of the black-light mini golf, built from its course (flrnoh fork, see FORK.md "Black-light
 * mini golf"): the felt on its frame (each surface at its heights, edged down to the floor), the
 * rails glowing along their tops, round posts, the cup with a light round it, the tee mat and the
 * hole's sign. Its moving and themed pieces are obstacles.ts's. In the hole's own frame, its group
 * standing where the hole does.
 */

export interface HoleView {
  def: HoleDef;
  /** The hole, in its own frame (its felt at y 0). */
  group: THREE.Group;
  /** Moving pieces (the bridge's felt and rails), by surface id. */
  moving: Map<string, THREE.Group>;
}

let feltTex: THREE.CanvasTexture | null = null;
let feltMat: THREE.MeshBasicMaterial | null = null;

/** The felt everywhere: vertex colours (its colour, shaded) over a grain. */
function felt(): THREE.MeshBasicMaterial {
  if (!feltMat) {
    feltTex = feltTexture();
    feltMat = new THREE.MeshBasicMaterial({ map: feltTex, vertexColors: true });
  }
  return feltMat;
}

const LIGHT = new THREE.Vector3(0.35, 1, 0.45).normalize();
const n = new THREE.Vector3();

/** Colours a felt mesh: its colour, a touch darker where it slopes away from the light; uv by where it is. */
function shadeFelt(g: THREE.BufferGeometry, color: THREE.Color, h: Height | null) {
  const p = g.getAttribute('position');
  const colors = new Float32Array(p.count * 3);
  const uvs = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    let k = 1;
    if (h) {
      const [, gx, gz] = heightAt(h, x, z);
      n.set(-gx, 1, -gz).normalize();
      k = 0.72 + 0.28 * Math.max(0, n.dot(LIGHT)) / LIGHT.y;
    }
    colors[i * 3] = color.r * k;
    colors[i * 3 + 1] = color.g * k;
    colors[i * 3 + 2] = color.b * k;
    uvs[i * 2] = x * 1.6;
    uvs[i * 2 + 1] = z * 1.6;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
}

/** A flat or tilted surface's felt: its polygon (less any round surfaces inside it), at its heights. */
function flatFelt(s: Surface, holesIn: Surface[], color: THREE.Color): THREE.BufferGeometry {
  const shape = new THREE.Shape(s.poly.map(([x, z]) => new THREE.Vector2(x, -z)));
  for (const r of holesIn) {
    if (r.h.k !== 'radial') continue;
    const outer = r.h.prof[r.h.prof.length - 1][0];
    const path = new THREE.Path();
    path.absarc(r.h.cx, -r.h.cz, outer - 0.002, 0, Math.PI * 2, true);
    shape.holes.push(path);
  }
  const g = new THREE.ShapeGeometry(shape, 24);
  g.rotateX(-Math.PI / 2);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) p.setY(i, heightAt(s.h, p.getX(i), p.getZ(i))[0]);
  g.computeVertexNormals();
  shadeFelt(g, color, s.h);
  return g;
}

/** A round surface's felt (the volcano, a funnel): rings out from its middle, at the profile's heights. */
export function radialFelt(h: Extract<Height, { k: 'radial' }>, color: THREE.Color, segs = 48): THREE.BufferGeometry {
  const radii: number[] = [];
  for (let i = 0; i < h.prof.length; i++) {
    const [r] = h.prof[i];
    if (i > 0) {
      const r0 = h.prof[i - 1][0];
      for (let k = 1; k < 4; k++) radii.push(r0 + ((r - r0) * k) / 4);
    }
    radii.push(r);
  }
  if (radii[0] > 0) radii.unshift(0);
  const pos: number[] = [];
  const idx: number[] = [];
  for (let ri = 0; ri < radii.length; ri++) {
    for (let a = 0; a < segs; a++) {
      const ang = (a / segs) * Math.PI * 2;
      const x = h.cx + Math.cos(ang) * radii[ri];
      const z = h.cz + Math.sin(ang) * radii[ri];
      pos.push(x, heightAt(h, x, z)[0] + 0.002, z);
    }
  }
  for (let ri = 0; ri < radii.length - 1; ri++) {
    for (let a = 0; a < segs; a++) {
      const i0 = ri * segs + a;
      const i1 = ri * segs + ((a + 1) % segs);
      const j0 = i0 + segs;
      const j1 = i1 + segs;
      idx.push(i0, j1, j0, i0, i1, j1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  shadeFelt(g, color, h);
  return g;
}

/** The frame round a surface: from its felt's edge down to the floor. */
function skirt(s: Surface, out: Batch, color: string) {
  const pts = s.h.k === 'radial' ? [] : s.poly;
  for (let i = 0; i < pts.length; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[(i + 1) % pts.length];
    const ya = heightAt(s.h, ax, az)[0];
    const yb = heightAt(s.h, bx, bz)[0];
    const g = new THREE.BufferGeometry();
    const bottom = -LANE_Y;
    g.setAttribute('position', new THREE.Float32BufferAttribute([ax, ya, az, bx, yb, bz, bx, bottom, bz, ax, ya, az, bx, bottom, bz, ax, bottom, az], 3));
    g.computeVertexNormals();
    out.baked(g, color);
    // Both ways: which way a polygon winds doesn't matter.
    const back = g.clone();
    const p = back.getAttribute('position');
    for (let k = 0; k < p.count; k += 3) {
      const x = p.getX(k + 1);
      const y = p.getY(k + 1);
      const z = p.getZ(k + 1);
      p.setXYZ(k + 1, p.getX(k + 2), p.getY(k + 2), p.getZ(k + 2));
      p.setXYZ(k + 2, x, y, z);
    }
    back.computeVertexNormals();
    out.baked(back, color);
  }
}

/** The felt's height under (x, z) on hole `def`: the highest surface there (still). */
export function feltAt(def: HoleDef, x: number, z: number): number {
  let best = -Infinity;
  for (const s of def.course.surfaces) {
    if (s.slide || !inPoly(s.poly, x, z)) continue;
    best = Math.max(best, heightAt(s.h, x, z)[0]);
  }
  return Number.isFinite(best) ? best : 0;
}

/** A rail: a dark body down to the floor, a glowing top and its halo (or clear glass, or nothing). */
export function railInto(r: LookedRail, out: Batch, glow: string) {
  if (r.look === 'hidden') return;
  const [ax, az] = r.a;
  const [bx, bz] = r.b;
  const len = Math.hypot(bx - ax, bz - az);
  const w = Math.max(0.04, (r.w ?? 0.02) * 2);
  const top = r.y1;
  const bottom = Math.max(-LANE_Y, r.y0);
  const ang = -Math.atan2(bz - az, bx - ax);
  const at = (geo: THREE.BufferGeometry, y: number) => {
    geo.rotateY(ang);
    geo.translate((ax + bx) / 2, y, (az + bz) / 2);
    return geo;
  };
  if (r.look === 'glass') {
    out.add(at(new THREE.BoxGeometry(len, top - bottom, 0.02), (top + bottom) / 2), unlit('#9ff6ff', { transparent: true, opacity: 0.12 }));
    out.add(at(new THREE.BoxGeometry(len, 0.012, 0.03), top), unlit(glow));
    return;
  }
  out.baked(at(new THREE.BoxGeometry(len + w * 0.5, top - bottom, w), (top + bottom) / 2), '#160d26');
  out.add(at(new THREE.BoxGeometry(len + w * 0.5, 0.014, w + 0.008), top + 0.007), unlit(glow));
  out.add(stripGeo(ax, az, bx, bz, top + 0.016, 0.16), halo(glow, 0.28));
}

const textCache = new Map<string, THREE.CanvasTexture>();

/** The hole's sign at its tee: its number, its name and par, and a tip. */
function holeSign(def: HoleDef): THREE.Group {
  const sign = new THREE.Group();
  let tex = textCache.get(def.name);
  if (!tex) {
    tex = signTexture(
      [
        { text: `${def.n}`, color: def.glow, size: 120 },
        { text: def.name, color: '#ffffff', size: 46 },
        { text: `PAR ${def.par}`, color: def.glow, size: 40 },
        { text: def.tip, color: '#c9a6ff', size: 22 },
      ],
      320,
      400,
    );
    textCache.set(def.name, tex);
  }
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.48, 0.6), new THREE.MeshBasicMaterial({ map: tex }));
  panel.position.y = 1.25;
  sign.add(panel);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.64), unlit('#0a0614'));
  back.position.set(0, 1.25, -0.005);
  back.rotation.y = Math.PI;
  sign.add(back);
  const frame = new THREE.Mesh(new THREE.PlaneGeometry(0.54, 0.66), unlit(def.glow));
  frame.position.set(0, 1.25, -0.003);
  sign.add(frame);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.95, 8), unlit('#2b2440'));
  post.position.y = 0.47;
  sign.add(post);
  return sign;
}

/** Builds hole `def`'s felt, frame, rails, posts, cup, tee and sign (its obstacles: obstacles.ts). */
export function buildHole(def: HoleDef): HoleView {
  const group = new THREE.Group();
  group.name = `minigolf-hole-${def.n}`;
  group.position.set(def.at.x, LANE_Y, def.at.z);
  group.rotation.y = def.at.rot;
  const c = def.course;
  const color = new THREE.Color(def.felt);
  const still = new Batch();
  const moving = new Map<string, THREE.Group>();
  const radial = c.surfaces.filter((s) => s.h.k === 'radial');
  for (const s of c.surfaces) {
    const target = s.slide ? new Batch() : still;
    if (s.h.k === 'radial') {
      target.add(radialFelt(s.h, s.id === 'volcano' ? new THREE.Color('#3a0c06') : color), felt());
      continue;
    }
    const inside = radial.filter((r) => r.h.k === 'radial' && inPoly(s.poly, r.h.cx, r.h.cz));
    target.add(flatFelt(s, inside, color), felt());
    skirt(s, target, '#1d1230');
    if (s.slide) {
      const g = new THREE.Group();
      for (const r of c.rails) if (r.slide) railInto(r, target, def.glow);
      target.build(g);
      moving.set(s.id, g);
      group.add(g);
    }
  }
  for (const r of c.rails) if (!r.slide) railInto(r, still, def.glow);
  for (const p of c.posts ?? []) {
    if (p.tag === 'bumper' && def.theme === 'pinball') continue; // the pinball's mushrooms are obstacles.ts's
    const top = Math.min(p.y1, feltAt(def, p.x, p.z) + 0.12);
    const body = new THREE.CylinderGeometry(p.r, p.r * 1.05, top + LANE_Y, 20);
    body.translate(p.x, (top - LANE_Y) / 2, p.z);
    still.baked(body, '#2a0d3a');
    const ring = new THREE.TorusGeometry(p.r * 0.92, 0.012, 6, 24);
    ring.rotateX(Math.PI / 2);
    ring.translate(p.x, top, p.z);
    still.add(ring, unlit(def.glow));
  }
  // The cup: a dark hole with a ring of light round it, tilted with the felt.
  const cupY = feltAt(def, c.cup.x, c.cup.z);
  const cup = new THREE.CircleGeometry(CUP_R, 28);
  cup.rotateX(-Math.PI / 2);
  cup.translate(c.cup.x, cupY + 0.004, c.cup.z);
  still.add(cup, unlit('#000000'));
  const ring = new THREE.RingGeometry(CUP_R, CUP_R + 0.018, 28);
  ring.rotateX(-Math.PI / 2);
  ring.translate(c.cup.x, cupY + 0.005, c.cup.z);
  still.add(ring, unlit('#ffffff'));
  const cupGlow = new THREE.PlaneGeometry(0.5, 0.5);
  cupGlow.rotateX(-Math.PI / 2);
  cupGlow.translate(c.cup.x, cupY + 0.006, c.cup.z);
  still.add(cupGlow, cupHalo(def.glow));
  for (const p of c.pipes ?? []) {
    if (!p.hole) continue;
    const y = feltAt(def, p.hole.x, p.hole.z);
    const h = new THREE.CircleGeometry(CUP_R, 28);
    h.rotateX(-Math.PI / 2);
    h.translate(p.hole.x, y + 0.004, p.hole.z);
    still.add(h, unlit('#000000'));
    const hr = new THREE.RingGeometry(CUP_R, CUP_R + 0.02, 28);
    hr.rotateX(-Math.PI / 2);
    hr.translate(p.hole.x, y + 0.005, p.hole.z);
    still.add(hr, unlit('#fffb00'));
  }
  // The tee: a mat in a lighter felt, and a glowing line across.
  const teeY = feltAt(def, def.tee.x, def.tee.z);
  const mat = new THREE.PlaneGeometry(0.5, 0.36);
  mat.rotateX(-Math.PI / 2);
  mat.translate(def.tee.x, teeY + 0.003, def.tee.z + 0.03);
  still.add(mat, unlit(color.clone().multiplyScalar(1.6).getStyle()));
  still.add(stripGeo(def.tee.x - 0.25, def.tee.z - 0.15, def.tee.x + 0.25, def.tee.z - 0.15, teeY + 0.005, 0.02), unlit('#ffffff'));
  still.build(group);
  const sign = holeSign(def);
  const b = c.bounds;
  sign.position.set(b.minX - 0.25, -LANE_Y, 0.55);
  group.add(sign);
  return { def, group, moving };
}

const cupHalos = new Map<string, THREE.MeshBasicMaterial>();

/** The soft light on the felt round a cup. */
function cupHalo(color: string): THREE.MeshBasicMaterial {
  let m = cupHalos.get(color);
  if (!m) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 6, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,0.9)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    m = new THREE.MeshBasicMaterial({ map: t, color, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
    cupHalos.set(color, m);
  }
  return m;
}
