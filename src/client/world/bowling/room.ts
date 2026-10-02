import * as THREE from 'three';
import { BOWLING_DOOR_INSIDE, BOWLING_ROOM, BOWLING_WALL, ZONES } from '../../../shared/bowling';
import type { Collider, Interactable } from '../types';
import { mergeByMaterial, mesh, toon } from '../toon';
import { box, canvasTexture, glow, neonSign } from '../casino/parts';
import { carpetTextures } from './carpet';
import { HouseLighting } from './lighting';
import { RETRO, drawStar, starTexture } from './signs';

/*
 * The bowling centre's room (flrnoh fork, see FORK.md "The bowling centre"): the shell the building's
 * half builds the first time anyone goes in. The 90s carpet over the whole floor, the walls (a teal
 * wainscot, cream above, a band of retro stripes that glows under black light; plain dark inside the
 * mini golf room, whose own walls and look are its half's), the dark ceiling with steel trusses, rows
 * of house lights under them and violet UV tubes beside those, and the glass doors back out with the
 * green AUSGANG over them. Interior coordinates (shared/bowling.ts), the floor at y 0.
 */

const R = BOWLING_ROOM;
const T = BOWLING_WALL;
const H = R.height;
const W = R.maxX - R.minX;
const D = R.maxZ - R.minZ;
/** Under the trusses: the house lights' and the UV tubes' rows run across the room at these z. */
export const TRUSS_Z: readonly number[] = [-17.5, -12.5, -7.5, -2.5, 2.5, 7.5, 12.5, 17.5];
const TRUSS_Y = 6.4;

export interface BowlingShell {
  group: THREE.Group;
  colliders: Collider[];
  interactables: Interactable[];
  /** The doors inside (E: back out onto the street). */
  exit: Interactable;
  lighting: HouseLighting;
  /** The carpet's glow, for the parts' own floors to match. */
  update(t: number, dt: number): void;
}

/** The band of stripes round the walls: its colours, and the same stripes alone on black (what glows under UV). */
function bandTextures(): { map: THREE.CanvasTexture; glow: THREE.CanvasTexture } {
  const draw = (lit: boolean) => (g: CanvasRenderingContext2D) => {
    g.fillStyle = lit ? '#000000' : RETRO.cream;
    g.fillRect(0, 0, 256, 64);
    const c = (normal: string, neon: string) => (lit ? neon : normal);
    g.fillStyle = c(RETRO.cherry, '#ff3f8e');
    g.fillRect(0, 4, 256, 10);
    g.fillStyle = c(RETRO.mustard, '#ffe14d');
    g.fillRect(0, 18, 256, 5);
    g.fillStyle = c(RETRO.teal, RETRO.aqua);
    g.fillRect(0, 50, 256, 10);
    // A zigzag between, and a star every so often.
    g.strokeStyle = c(RETRO.tealDark, '#7dff5c');
    g.lineWidth = 4;
    g.beginPath();
    for (let x = 0; x <= 256; x += 16) g.lineTo(x, x % 32 ? 30 : 42);
    g.stroke();
    drawStar(g, 128, 36, 11, 4, c(RETRO.cherry, '#ff8a3d'), 0.35);
  };
  const map = canvasTexture(256, 64, draw(false));
  const lit = canvasTexture(256, 64, draw(true));
  for (const t of [map, lit]) t.wrapS = THREE.RepeatWrapping;
  return { map, glow: lit };
}

export function buildBowlingShell(): BowlingShell {
  const group = new THREE.Group();
  group.name = 'bowling-room';
  const colliders: Collider[] = [];
  const interactables: Interactable[] = [];
  const lighting = new HouseLighting();
  const parts = new THREE.Group();
  const gradientMap = (toon('#fff') as THREE.MeshToonMaterial).gradientMap;

  // ---- The carpet ------------------------------------------------------------------------------------
  const carpet = carpetTextures();
  carpet.map.repeat.set(W / 4, D / 4);
  carpet.glow.repeat.set(W / 4, D / 4);
  const carpetMat = new THREE.MeshToonMaterial({ map: carpet.map, gradientMap, emissive: new THREE.Color('#ffffff'), emissiveMap: carpet.glow });
  lighting.level((v) => (carpetMat.emissiveIntensity = v), 0, 1.15);
  const floor = mesh(new THREE.PlaneGeometry(W, D), carpetMat, 0, 0, 0, false);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);
  colliders.push({ minX: R.minX - T, maxX: R.maxX + T, minZ: R.minZ - T, maxZ: R.maxZ + T, bottom: -1, top: 0 });

  // ---- The walls -------------------------------------------------------------------------------------
  const cream = toon('#efdcbc');
  const darkWall = toon('#15122b');
  const wainscot = toon('#1d6f66');
  const chrome = toon('#cfd6de');
  const doorL = BOWLING_DOOR_INSIDE.x - BOWLING_DOOR_INSIDE.width / 2 - 0.15;
  const doorR = BOWLING_DOOR_INSIDE.x + BOWLING_DOOR_INSIDE.width / 2 + 0.15;
  const golf = ZONES.minigolf;
  const karaoke = ZONES.karaoke;
  /** A stretch of wall `a`..`b` along one side, with whether it's inside the mini golf room (dark, nothing on it) or the karaoke bar's (its own look). */
  type Run = { side: 'n' | 's' | 'w' | 'e'; a: number; b: number; plain: boolean; band: boolean };
  const runs: Run[] = [
    { side: 'n', a: R.minX, b: golf.minX, plain: false, band: true },
    { side: 'n', a: golf.minX, b: R.maxX, plain: true, band: false },
    { side: 's', a: R.minX, b: doorL, plain: false, band: true },
    { side: 's', a: doorR, b: R.maxX, plain: false, band: true },
    { side: 'w', a: R.minZ, b: R.maxZ, plain: false, band: true },
    { side: 'e', a: R.minZ, b: golf.maxZ, plain: true, band: false },
    { side: 'e', a: golf.maxZ, b: karaoke.maxZ, plain: false, band: false },
    { side: 'e', a: karaoke.maxZ, b: R.maxZ, plain: false, band: true },
  ];
  const bands = bandTextures();
  const bandMat = new THREE.MeshToonMaterial({ map: bands.map, gradientMap, emissive: new THREE.Color('#ffffff'), emissiveMap: bands.glow });
  lighting.level((v) => (bandMat.emissiveIntensity = v), 0, 1.3);
  const bandMats = new Map<number, THREE.MeshToonMaterial>();
  const bandFor = (len: number) => {
    const n = Math.max(1, Math.round(len / 2.4));
    if (!bandMats.has(n)) {
      const m = bandMat.clone();
      m.map = bands.map.clone();
      m.map.repeat.set(n, 1);
      m.map.needsUpdate = true;
      m.emissiveMap = bands.glow.clone();
      m.emissiveMap.repeat.set(n, 1);
      m.emissiveMap.needsUpdate = true;
      lighting.level((v) => (m.emissiveIntensity = v), 0, 1.3);
      bandMats.set(n, m);
    }
    return bandMats.get(n)!;
  };
  for (const r of runs) {
    const len = r.b - r.a;
    const mid = (r.a + r.b) / 2;
    const alongX = r.side === 'n' || r.side === 's';
    const at = r.side === 'n' ? R.minZ - T / 2 : r.side === 's' ? R.maxZ + T / 2 : r.side === 'w' ? R.minX - T / 2 : R.maxX + T / 2;
    const inward = r.side === 'n' || r.side === 'w' ? 1 : -1;
    const wx = alongX ? mid : at;
    const wz = alongX ? at : mid;
    parts.add(mesh(alongX ? box(len, H, T) : box(T, H, len), r.plain ? darkWall : cream, wx, H / 2, wz, false));
    colliders.push(alongX ? { minX: r.a, maxX: r.b, minZ: at - T / 2, maxZ: at + T / 2, bottom: 0, top: H } : { minX: at - T / 2, maxX: at + T / 2, minZ: r.a, maxZ: r.b, bottom: 0, top: H });
    if (r.plain) continue;
    // The wainscot, a chrome rail along its top.
    const face = at + inward * (T / 2 + 0.02);
    const wsx = alongX ? mid : face;
    const wsz = alongX ? face : mid;
    parts.add(mesh(alongX ? box(len, 1.2, 0.04) : box(0.04, 1.2, len), wainscot, wsx, 0.6, wsz, false));
    parts.add(mesh(alongX ? box(len, 0.05, 0.06) : box(0.06, 0.05, len), chrome, wsx, 1.22, wsz, false));
    if (!r.band) continue;
    const band = mesh(new THREE.PlaneGeometry(len, 0.62), bandFor(len), alongX ? mid : face + inward * 0.01, 3.5, alongX ? face + inward * 0.01 : mid, false);
    band.rotation.y = r.side === 'n' ? 0 : r.side === 's' ? Math.PI : r.side === 'w' ? Math.PI / 2 : -Math.PI / 2;
    group.add(band);
  }
  // Over the doors the wall carries on above them, and the door's frame.
  const lintel = BOWLING_DOOR_INSIDE.width + 0.3;
  parts.add(mesh(box(lintel, H - 2.9, T), cream, BOWLING_DOOR_INSIDE.x, 2.9 + (H - 2.9) / 2, R.maxZ + T / 2, false));
  colliders.push({ minX: doorL, maxX: doorR, minZ: R.maxZ, maxZ: R.maxZ + T, bottom: 0, top: H });

  // ---- The ceiling, the trusses, the house lights and the UV tubes --------------------------------
  const ceiling = mesh(new THREE.PlaneGeometry(W + 2 * T, D + 2 * T), toon('#1c1a2e'), 0, H, 0, false);
  ceiling.rotation.x = Math.PI / 2;
  group.add(ceiling);
  colliders.push({ minX: R.minX - T, maxX: R.maxX + T, minZ: R.minZ - T, maxZ: R.maxZ + T, bottom: H, top: H + 0.3 });
  const steel = toon('#3d4152');
  const lamps = new THREE.Group();
  const tubes = new THREE.Group();
  const halos = new THREE.Group();
  const lampMat = glow(null, '#fff4dc');
  lighting.tint(lampMat.color, '#fff4dc', '#231d33');
  const tubeMat = glow(null, '#4a4058');
  lighting.tint(tubeMat.color, '#4a4058', '#c46bff', true);
  const haloTex = canvasTexture(64, 64, (g) => {
    const grd = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
  });
  const haloMat = new THREE.MeshBasicMaterial({ map: haloTex, color: '#a64dff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  haloMat.userData.outlineParameters = { visible: false };
  lighting.level((v) => (haloMat.opacity = v), 0, 0.55);
  for (const z of TRUSS_Z) {
    // A flat Warren truss across the room: two chords and the diagonals between.
    parts.add(mesh(box(W, 0.14, 0.14), steel, 0, TRUSS_Y + 0.5, z, false));
    parts.add(mesh(box(W, 0.14, 0.14), steel, 0, TRUSS_Y - 0.1, z, false));
    for (let x = R.minX + 0.6; x < R.maxX - 0.6; x += 1.2) {
      const d = mesh(box(0.06, 0.82, 0.06), steel, x + 0.3, TRUSS_Y + 0.2, z, false);
      d.rotation.z = Math.round((x - R.minX) / 1.2) % 2 ? 0.6 : -0.6;
      parts.add(d);
    }
    for (let x = R.minX + 2.4; x < R.maxX - 1; x += 4.8) {
      // A house light panel hanging under it, and a violet tube along each side.
      parts.add(mesh(box(2.2, 0.1, 0.6), steel, x, TRUSS_Y - 0.25, z, false));
      lamps.add(mesh(box(2, 0.03, 0.46), lampMat, x, TRUSS_Y - 0.31, z, false));
      for (const s of [-1, 1]) {
        const tube = mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 6), tubeMat, x, TRUSS_Y - 0.22, z + s * 0.42, false);
        tube.rotation.z = Math.PI / 2;
        tubes.add(tube);
      }
      const halo = mesh(new THREE.PlaneGeometry(3.4, 1.8), haloMat, x, TRUSS_Y - 0.33, z, false);
      halo.rotation.x = Math.PI / 2;
      halos.add(halo);
    }
  }
  // UV tubes along the walls too, high up, and their haze on the wall.
  for (const r of runs) {
    if (r.plain) continue;
    const alongX = r.side === 'n' || r.side === 's';
    const at = r.side === 'n' ? R.minZ + 0.12 : r.side === 's' ? R.maxZ - 0.12 : r.side === 'w' ? R.minX + 0.12 : R.maxX - 0.12;
    for (let u = r.a + 1; u < r.b - 1.4; u += 3.2) {
      const tube = mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 6), tubeMat, alongX ? u + 0.6 : at, 5.2, alongX ? at : u + 0.6, false);
      tube.rotation[alongX ? 'z' : 'x'] = Math.PI / 2;
      tubes.add(tube);
      const halo = mesh(new THREE.PlaneGeometry(2.2, 1.4), haloMat, alongX ? u + 0.6 : at + (r.side === 'w' ? 0.02 : -0.02), 5.2, alongX ? at + (r.side === 'n' ? 0.02 : -0.02) : u + 0.6, false);
      halo.rotation.y = r.side === 'n' ? 0 : r.side === 's' ? Math.PI : r.side === 'w' ? Math.PI / 2 : -Math.PI / 2;
      halos.add(halo);
    }
  }
  group.add(mergeByMaterial(lamps), mergeByMaterial(tubes), mergeByMaterial(halos));

  // ---- The doors back out: glass leaves, the street's light behind, AUSGANG over them -----------------
  const dw = BOWLING_DOOR_INSIDE.width;
  const dz = R.maxZ - 0.03;
  const street = mesh(
    new THREE.PlaneGeometry(dw, 2.8),
    glow(
      canvasTexture(64, 128, (g) => {
        const grd = g.createLinearGradient(0, 0, 0, 128);
        grd.addColorStop(0, '#f6e7c8');
        grd.addColorStop(0.6, '#d9c8a8');
        grd.addColorStop(1, '#8d8478');
        g.fillStyle = grd;
        g.fillRect(0, 0, 64, 128);
      }),
    ),
    BOWLING_DOOR_INSIDE.x,
    1.4,
    R.maxZ + T - 0.02,
    false,
  );
  street.rotation.y = Math.PI;
  group.add(street);
  const leafGlass = new THREE.MeshToonMaterial({ color: '#a7e3ea', transparent: true, opacity: 0.35, gradientMap, depthWrite: false });
  leafGlass.userData.outlineParameters = { visible: false };
  const exit: Interactable = { kind: 'bowling', x: BOWLING_DOOR_INSIDE.x, z: BOWLING_DOOR_INSIDE.z, radius: 2 };
  interactables.push(exit);
  for (const s of [-1, 1]) {
    const leaf = mesh(box(dw / 2 - 0.04, 2.74, 0.04), leafGlass, BOWLING_DOOR_INSIDE.x + (s * dw) / 4, 1.4, dz, false);
    leaf.userData.interact = exit;
    group.add(leaf);
    parts.add(mesh(box(0.06, 2.8, 0.08), chrome, BOWLING_DOOR_INSIDE.x + s * (dw / 2 + 0.03), 1.4, dz));
    parts.add(mesh(box(dw / 2 - 0.3, 0.05, 0.05), toon(RETRO.cherry), BOWLING_DOOR_INSIDE.x + (s * dw) / 4, 1.1, dz - 0.05));
  }
  parts.add(mesh(box(dw + 0.2, 0.1, 0.1), chrome, BOWLING_DOOR_INSIDE.x, 2.85, dz));
  street.userData.interact = exit;
  const ausgang = mesh(new THREE.PlaneGeometry(1.2, 0.36), glow(neonSign('AUSGANG', '#3dff8a', 512, 154, '#0c2a18')), BOWLING_DOOR_INSIDE.x, 3.25, R.maxZ - 0.04, false);
  ausgang.rotation.y = Math.PI;
  group.add(ausgang);
  // Over it, the house's name in pink neon, for the way out; starbursts either side that glow under UV.
  const name = mesh(new THREE.PlaneGeometry(5.6, 1.4), glow(neonSign('BOWLING CENTER', '#ff4fa3', 1024, 256, '#1a0d24')), BOWLING_DOOR_INSIDE.x, 4.9, R.maxZ - 0.05, false);
  name.rotation.y = Math.PI;
  group.add(name);
  const starMat = new THREE.MeshToonMaterial({ map: starTexture(RETRO.mustard), transparent: true, alphaTest: 0.1, gradientMap, emissive: new THREE.Color('#ffe14d') });
  lighting.level((v) => (starMat.emissiveIntensity = v), 0.1, 1.4);
  const starMat2 = new THREE.MeshToonMaterial({ map: starTexture(RETRO.aqua), transparent: true, alphaTest: 0.1, gradientMap, emissive: new THREE.Color(RETRO.aqua) });
  lighting.level((v) => (starMat2.emissiveIntensity = v), 0.1, 1.4);
  for (const [x, y, s, m] of [
    [-4.6, 5.3, 1.3, starMat],
    [-6.4, 4.4, 0.8, starMat2],
    [4.6, 5.3, 1.3, starMat2],
    [6.4, 4.4, 0.8, starMat],
  ] as const) {
    const st = mesh(new THREE.PlaneGeometry(s, s), m, x, y, R.maxZ - 0.05, false);
    st.rotation.y = Math.PI;
    group.add(st);
  }

  group.add(mergeByMaterial(parts));

  return {
    group,
    colliders,
    interactables,
    exit,
    lighting,
    update: (_t, dt) => lighting.update(dt),
  };
}
