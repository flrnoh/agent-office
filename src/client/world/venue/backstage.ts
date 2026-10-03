import * as THREE from 'three';
import { makeMirror } from './mirror';
import { STAGE_HEIGHT, VENUE_ROOM, ZONES } from '../../../shared/venue';
import { BACK_WALL, CASES, GREEN_TABLE, MIRRORS, RIDER, SOFAS, SOFA_DEPTH, STAGE_STAIRS, STAIRS_LANDING, sofaSeats, stairSteps } from '../../../shared/venue-house';
import type { Collider, Interactable } from '../types';
import { mergeByMaterial, mesh, toon } from '../toon';
import { box, canvasTexture, glow } from '../casino/parts';
import { BOLD, setlistTexture, stickersTexture } from './signs';
import type { Look } from './lighting';
import { pickBox } from './pick';

/*
 * Backstage (flrnoh fork, see FORK.md "The Schallwerk"), behind the hall's back wall in
 * ZONES.backstage: the green room (worn leather sofas round a low table with a fruit bowl and empty
 * bottles, the make-up mirrors framed in bulbs, the rider in a glass-door fridge plastered with band
 * stickers, the setlist taped to the wall, a rail of stage clothes, a rug), and the band's way up: steel
 * stairs with a handrail to the landing in the back wall's opening, the riser's back edge beyond. East
 * of the stairs flight cases, a cable spool and the loading door. Bare bulbs on cables.
 */

const R = VENUE_ROOM;
/** Backstage's own low ceiling. */
const CEILING = 3.9;

export interface VenueBackstage {
  update(look: Look, t: number): void;
}

export function buildBackstage(group: THREE.Group, colliders: Collider[], interactables: Interactable[]): VenueBackstage {
  const parts = new THREE.Group();
  const gradientMap = (toon('#fff') as THREE.MeshToonMaterial).gradientMap;
  const steel = toon('#3a3d45');
  const tread = toon('#5a5d66');

  // ---- The stairs up onto the stage ---------------------------------------------------------------
  for (const s of stairSteps()) {
    const cx = (s.minX + s.maxX) / 2;
    parts.add(mesh(box(s.maxX - s.minX, 0.05, s.maxZ - s.minZ), tread, cx, s.top - 0.025, (s.minZ + s.maxZ) / 2));
    // The riser under each tread (open stairs: a plate and the stringers).
    parts.add(mesh(box(s.maxX - s.minX, s.top - 0.05, 0.03), toon('#26282e'), cx, (s.top - 0.05) / 2, s.maxZ - 0.015, false));
    colliders.push({ minX: s.minX, maxX: s.maxX, minZ: s.minZ, maxZ: s.maxZ, bottom: 0, top: s.top });
  }
  {
    const L = STAIRS_LANDING;
    const cx = (L.minX + L.maxX) / 2;
    parts.add(mesh(box(L.maxX - L.minX, 0.08, L.maxZ - L.minZ), tread, cx, L.top - 0.04, (L.minZ + L.maxZ) / 2));
    parts.add(mesh(box(L.maxX - L.minX, L.top - 0.08, L.maxZ - BACK_WALL.z1), toon('#26282e'), cx, (L.top - 0.08) / 2, (BACK_WALL.z1 + L.maxZ) / 2, false));
    colliders.push({ minX: L.minX, maxX: L.maxX, minZ: L.minZ, maxZ: L.maxZ, bottom: 0, top: L.top });
    // Stringers either side and a handrail on the open (west) side; the east side runs along a wall of cases.
    const run = STAGE_STAIRS.foot - L.maxZ;
    const slope = Math.atan2(STAGE_HEIGHT, run);
    for (const x of [STAGE_STAIRS.minX - 0.03, STAGE_STAIRS.maxX + 0.03]) {
      const st = mesh(box(0.06, 0.25, Math.hypot(run, STAGE_HEIGHT)), steel, x, STAGE_HEIGHT / 2, (STAGE_STAIRS.foot + L.maxZ) / 2);
      st.rotation.x = slope;
      parts.add(st);
    }
    for (const x of [STAGE_STAIRS.minX - 0.06, STAGE_STAIRS.maxX + 0.06]) {
      const rail = mesh(new THREE.CylinderGeometry(0.025, 0.025, Math.hypot(run, STAGE_HEIGHT) + 0.4, 8), toon('#c9a227'), x, STAGE_HEIGHT / 2 + 0.95, (STAGE_STAIRS.foot + L.maxZ) / 2);
      rail.rotation.x = slope - Math.PI / 2; // (up toward the landing)
      parts.add(rail);
      for (const k of [0, 0.5, 1]) parts.add(mesh(box(0.04, 0.95, 0.04), steel, x, STAGE_HEIGHT * (1 - k) + 0.47, L.maxZ + k * run));
    }
    // ON STAGE: a red light over the opening that's lit while the band's on.
    const sign = mesh(new THREE.PlaneGeometry(1.04, 0.26), glow(canvasTexture(256, 64, (g) => {
      g.fillStyle = '#3a0508';
      g.fillRect(0, 0, 256, 64);
      g.fillStyle = '#ff3b3b';
      g.font = `48px ${BOLD}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('ON STAGE', 128, 34);
    })), cx, STAGE_HEIGHT + 2.55, BACK_WALL.z1 + 0.02, false);
    group.add(sign);
  }

  // ---- The green room ----------------------------------------------------------------------------
  const leather = toon('#5a2e1e');
  const leatherDark = toon('#3f1f14');
  for (const s of SOFAS) {
    const sofa = new THREE.Group();
    sofa.add(mesh(box(s.len, 0.42, SOFA_DEPTH), leather, 0, 0.21, 0));
    sofa.add(mesh(box(s.len, 0.5, 0.22), leatherDark, 0, 0.62, -SOFA_DEPTH / 2 + 0.11));
    for (const e of [-1, 1]) sofa.add(mesh(box(0.2, 0.62, SOFA_DEPTH), leatherDark, e * (s.len / 2 - 0.1), 0.31, 0));
    // Cushions, one a little askew.
    const n = Math.max(1, Math.floor(s.len / 0.8));
    for (let i = 0; i < n; i++) {
      const c = mesh(box(s.len / n - 0.08, 0.1, SOFA_DEPTH - 0.3), leather, (i - (n - 1) / 2) * (s.len / n), 0.47, 0.06);
      if (i === 1) c.rotation.y = 0.06;
      sofa.add(c);
    }
    sofa.position.set(s.x, 0, s.z);
    sofa.rotation.y = s.rotY;
    parts.add(sofa);
    colliders.push({ minX: s.x - s.len / 2, maxX: s.x + s.len / 2, minZ: s.z - SOFA_DEPTH / 2, maxZ: Math.min(R.maxZ, s.z + SOFA_DEPTH / 2), bottom: 0, top: 0.42, fence: true });
  }
  for (const seat of sofaSeats()) {
    const it: Interactable = { kind: 'venueseat', seatId: seat.key, x: seat.x, z: seat.z, radius: 0.8, y: 0 };
    interactables.push(it);
    pickBox(group, it, { minX: seat.x - 0.38, maxX: seat.x + 0.38, minZ: seat.z - 0.4, maxZ: seat.z + 0.4 }, 0.3, 0.9);
  }
  // The low table: bottles, a fruit bowl, a laminate.
  {
    const T = GREEN_TABLE;
    parts.add(mesh(box(T.w, 0.06, T.d), toon('#2b211b'), T.x, 0.42, T.z));
    for (const e of [-1, 1]) for (const f of [-1, 1]) parts.add(mesh(box(0.05, 0.4, 0.05), steel, T.x + e * (T.w / 2 - 0.08), 0.2, T.z + f * (T.d / 2 - 0.08)));
    for (let i = 0; i < 5; i++) parts.add(mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.24, 8), toon(['#2f6b3a', '#7a3b12', '#2f6b3a', '#8a5a12', '#c9c2a8'][i]), T.x - 0.7 + i * 0.22, 0.57, T.z + (i % 2 ? 0.15 : -0.12)));
    parts.add(mesh(new THREE.SphereGeometry(0.2, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), toon('#d9d2c2'), T.x + 0.6, 0.62, T.z));
    for (const [dx, c] of [
      [0.52, '#ffd60a'],
      [0.64, '#e63946'],
      [0.6, '#2b9348'],
    ] as const) parts.add(mesh(new THREE.SphereGeometry(0.06, 8, 6), toon(c), T.x + dx, 0.62, T.z + (dx - 0.58) * 2));
    colliders.push({ minX: T.x - T.w / 2, maxX: T.x + T.w / 2, minZ: T.z - T.d / 2, maxZ: T.z + T.d / 2, bottom: 0, top: 0.45, fence: true });
  }
  // A rug under it all.
  const rug = mesh(new THREE.PlaneGeometry(9, 3.6).rotateX(-Math.PI / 2), new THREE.MeshToonMaterial({ gradientMap, map: canvasTexture(256, 128, (g) => {
    g.fillStyle = '#5b1a1f';
    g.fillRect(0, 0, 256, 128);
    g.strokeStyle = '#c9a227';
    g.lineWidth = 6;
    g.strokeRect(10, 10, 236, 108);
    g.strokeStyle = '#2b4f6b';
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      g.moveTo(40 + i * 35, 30);
      g.lineTo(58 + i * 35, 64);
      g.lineTo(40 + i * 35, 98);
      g.stroke();
    }
  }) }), -4.4, 0.01, 14.2, false);
  group.add(rug);

  // The make-up mirrors in their bulbs, the counter under them, a chair or two.
  const bulbs = glow(null, '#fff1cf');
  const bulbGroup = new THREE.Group();
  {
    const M = MIRRORS;
    const cz = (M.minZ + M.maxZ) / 2;
    parts.add(mesh(box(M.maxX - M.minX, 0.06, M.maxZ - M.minZ), toon('#e9e2d6'), (M.minX + M.maxX) / 2, M.top, cz));
    for (const e of [-1, 1]) parts.add(mesh(box(0.06, M.top, M.maxZ - M.minZ - 0.05), steel, (M.minX + M.maxX) / 2 + e * ((M.maxX - M.minX) / 2 - 0.05), M.top / 2, cz));
    const mirrorMat = new THREE.MeshToonMaterial({
      gradientMap,
      emissive: new THREE.Color('#2a3440'),
      map: canvasTexture(128, 96, (g) => {
        const grd = g.createLinearGradient(0, 0, 128, 96);
        grd.addColorStop(0, '#c9d6e3');
        grd.addColorStop(0.45, '#7d8fa3');
        grd.addColorStop(0.55, '#a9bacb');
        grd.addColorStop(1, '#5d6e80');
        g.fillStyle = grd;
        g.fillRect(0, 0, 128, 96);
        g.strokeStyle = 'rgba(255,255,255,0.5)';
        g.lineWidth = 3;
        for (const x of [30, 44]) {
          g.beginPath();
          g.moveTo(x, 0);
          g.lineTo(x + 40, 96);
          g.stroke();
        }
      }),
    });
    // One real mirror behind all three bulb frames (see mirror.ts), seen from backstage only.
    const glass = makeMirror(5.2, 0.9, (cam) => cam.position.z > BACK_WALL.z1 + 0.2 && cam.position.x < M.maxX + 6);
    glass.position.set(M.minX + 3, M.top + 0.75, BACK_WALL.z1 + 0.035);
    group.add(glass);
    parts.add(mesh(box(5.4, 1.06, 0.03), mirrorMat, M.minX + 3, M.top + 0.75, BACK_WALL.z1 + 0.015, false));
    for (let i = 0; i < 3; i++) {
      const x = M.minX + 1 + i * 2;
      for (let k = 0; k < 5; k++) {
        bulbGroup.add(mesh(new THREE.SphereGeometry(0.045, 8, 6), bulbs, x - 0.66, M.top + 0.35 + k * 0.2, BACK_WALL.z1 + 0.06, false));
        bulbGroup.add(mesh(new THREE.SphereGeometry(0.045, 8, 6), bulbs, x + 0.66, M.top + 0.35 + k * 0.2, BACK_WALL.z1 + 0.06, false));
      }
      for (let k = 0; k < 6; k++) bulbGroup.add(mesh(new THREE.SphereGeometry(0.045, 8, 6), bulbs, x - 0.5 + k * 0.2, M.top + 1.26, BACK_WALL.z1 + 0.06, false));
      // Make-up, a can, a hairdryer.
      parts.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.14, 8), toon(['#e63946', '#2b2d42', '#ffd166'][i]), x - 0.3, M.top + 0.1, cz));
      parts.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.12, 8), toon('#7d8597'), x + 0.25, M.top + 0.09, cz));
    }
    colliders.push({ minX: M.minX, maxX: M.maxX, minZ: M.minZ, maxZ: M.maxZ, bottom: 0, top: M.top });
  }
  group.add(mergeByMaterial(bulbGroup));

  // The rider: a glass-door drinks fridge, stickers all over its side, a printout on the door.
  {
    const F = RIDER;
    const cx = (F.minX + F.maxX) / 2;
    const cz = (F.minZ + F.maxZ) / 2;
    const w = F.maxX - F.minX;
    parts.add(mesh(box(w, F.top, F.maxZ - F.minZ), toon('#1b1b1f'), cx, F.top / 2, cz));
    const inside = glow(null, '#d8f1ff');
    parts.add(mesh(box(w - 0.16, F.top - 0.3, 0.02), inside, cx, F.top / 2 + 0.05, F.minZ - 0.005, false));
    const bottles = new THREE.Group();
    for (let shelf = 0; shelf < 4; shelf++)
      for (let i = 0; i < 6; i++) bottles.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.24, 6), toon(['#3f7f3a', '#8a5a12', '#bfe3f5', '#4a2511', '#2b59c3', '#9c4f1c'][(i + shelf) % 6]), F.minX + 0.15 + i * 0.14, 0.35 + shelf * 0.38, F.minZ - 0.04, false));
    group.add(mergeByMaterial(bottles));
    const glassDoor = new THREE.MeshToonMaterial({ color: '#cfe7ef', transparent: true, opacity: 0.22, gradientMap, depthWrite: false });
    glassDoor.userData.outlineParameters = { visible: false };
    group.add(mesh(box(w - 0.06, F.top - 0.1, 0.03), glassDoor, cx, F.top / 2, F.minZ - 0.06, false));
    const note = mesh(new THREE.PlaneGeometry(0.3, 0.42), new THREE.MeshToonMaterial({ gradientMap, map: canvasTexture(128, 180, (g) => {
      g.fillStyle = '#fbfaf4';
      g.fillRect(0, 0, 128, 180);
      g.fillStyle = '#1b1b2f';
      g.font = 'bold 18px sans-serif';
      g.fillText('RIDER', 10, 26);
      g.font = '13px sans-serif';
      ['24× Mate', '1 Kiste Helles', 'Wasser still', 'Spezi!!', 'Brezn', 'KEINE grünen', 'Gummibärchen'].forEach((t, i) => g.fillText(t, 10, 50 + i * 18));
    }) }), cx, 1.35, F.minZ - 0.08, false);
    note.rotation.y = Math.PI;
    group.add(note);
    const stickers = mesh(new THREE.PlaneGeometry(F.maxZ - F.minZ - 0.05, F.top - 0.2), new THREE.MeshToonMaterial({ gradientMap, map: stickersTexture(9), transparent: true, alphaTest: 0.1 }), F.maxX + 0.005, F.top / 2, cz, false);
    stickers.rotation.y = Math.PI / 2;
    group.add(stickers);
    colliders.push({ minX: F.minX, maxX: F.maxX, minZ: F.minZ, maxZ: F.maxZ, bottom: 0, top: F.top });
    const rider: Interactable = { kind: 'venuerider', x: cx, z: F.minZ - 0.4, radius: 1.4 };
    interactables.push(rider);
    pickBox(group, rider, { ...F, minZ: F.minZ - 0.15 }, 0, F.top);
  }
  // The setlist taped to the wall, stickers on the back wall, a clothes rail of stage outfits.
  const setlist = mesh(new THREE.PlaneGeometry(0.42, 0.6), new THREE.MeshToonMaterial({ gradientMap, map: setlistTexture() }), 4.4, 1.6, R.maxZ - 0.02, false);
  setlist.rotation.y = Math.PI;
  group.add(setlist);
  for (const [x, w, h] of [
    [0.5, 2.2, 1.6],
    [9.6, 1.6, 1.2],
  ] as const) {
    const st = mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshToonMaterial({ gradientMap, map: stickersTexture(Math.round(x * 10) + 4), transparent: true, alphaTest: 0.1 }), x, 1.4, BACK_WALL.z1 + 0.01, false);
    group.add(st);
  }
  {
    const x0 = 8.5;
    parts.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.6, 8).rotateZ(Math.PI / 2), toon('#c8cdd4'), x0, 1.7, R.maxZ - 0.45));
    for (const s of [-1, 1]) parts.add(mesh(box(0.04, 1.7, 0.04), steel, x0 + s * 0.8, 0.85, R.maxZ - 0.45));
    ['#111111', '#c4121f', '#e9d8a6', '#3d405b', '#111111'].forEach((c, i) => parts.add(mesh(box(0.12, 0.8, 0.42), toon(c), x0 - 0.6 + i * 0.3, 1.25, R.maxZ - 0.45)));
    colliders.push({ minX: x0 - 0.85, maxX: x0 + 0.85, minZ: R.maxZ - 0.7, maxZ: R.maxZ - 0.2, bottom: 0, top: 1.75, fence: true });
  }

  // ---- Flight cases, a cable spool --------------------------------------------------------------
  const caseMat = toon('#202126');
  const corner = toon('#b8bec6');
  for (const c of CASES) {
    const cx = (c.minX + c.maxX) / 2;
    const cz = (c.minZ + c.maxZ) / 2;
    parts.add(mesh(box(c.maxX - c.minX, c.top, c.maxZ - c.minZ), caseMat, cx, c.top / 2, cz));
    for (const y of [0.03, c.top - 0.03]) parts.add(mesh(box(c.maxX - c.minX + 0.03, 0.05, c.maxZ - c.minZ + 0.03), corner, cx, y, cz));
    const stencil = mesh(new THREE.PlaneGeometry(Math.min(0.9, c.maxX - c.minX - 0.2), 0.2), new THREE.MeshBasicMaterial({ transparent: true, map: canvasTexture(256, 56, (g) => {
      g.fillStyle = '#f4ead8';
      g.font = `40px ${BOLD}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('SCHALLWERK', 128, 30);
    }) }), cx, c.top * 0.6, c.minZ - 0.005, false);
    stencil.rotation.y = Math.PI;
    (stencil.material as THREE.Material).userData.outlineParameters = { visible: false };
    group.add(stencil);
    colliders.push({ minX: c.minX, maxX: c.maxX, minZ: c.minZ, maxZ: c.maxZ, bottom: 0, top: c.top });
  }
  const spool = mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.4, 18).rotateX(Math.PI / 2), toon('#7b5636'), 18.6, 0.45, 15.2);
  parts.add(spool);
  parts.add(mesh(new THREE.TorusGeometry(0.32, 0.12, 8, 20), toon('#ffb000'), 18.6, 0.45, 15.2));
  colliders.push({ minX: 18.1, maxX: 19.1, minZ: 14.95, maxZ: 15.45, bottom: 0, top: 0.9 });

  // ---- Bare bulbs on cables, the light back here -----------------------------------------------
  const bare = glow(null, '#ffd9a0');
  const cables = new THREE.Group();
  for (let x = -8; x < ZONES.backstage.maxX; x += 4.2) {
    cables.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, CEILING - 3, 4), toon('#111'), x, (CEILING + 3) / 2, 13.5, false));
    cables.add(mesh(new THREE.SphereGeometry(0.07, 8, 6), bare, x, 2.95, 13.5, false));
  }
  group.add(mergeByMaterial(cables));
  const lamps = [-5, 6, 17].map((x) => {
    const l = new THREE.PointLight('#ffcf8a', 2.2, 10, 1.4);
    l.position.set(x, 2.8, 13.6);
    group.add(l);
    return l;
  });

  // A low ceiling of black boards over it all, with the pipes along it (the hall's roof is far above).
  {
    const x0 = ZONES.wing.maxX + 0.1;
    const w = R.maxX - x0;
    const d = R.maxZ - BACK_WALL.z1;
    const cz = (BACK_WALL.z1 + R.maxZ) / 2;
    parts.add(mesh(box(w, 0.12, d), toon('#1d1c21'), x0 + w / 2, CEILING + 0.06, cz, false));
    colliders.push({ minX: x0, maxX: R.maxX, minZ: BACK_WALL.z1, maxZ: R.maxZ, bottom: CEILING, top: CEILING + 0.12 });
    for (const [z, r, c] of [
      [15.3, 0.09, '#8a8f96'],
      [15.0, 0.06, '#c4121f'],
      [11.6, 0.11, '#5c6470'],
    ] as const)
      parts.add(mesh(new THREE.CylinderGeometry(r, r, w, 10).rotateZ(Math.PI / 2), toon(c), x0 + w / 2, CEILING - 0.18, z, false));
  }

  group.add(mergeByMaterial(parts));

  return {
    update(look, t) {
      // The ON STAGE light and the bulbs: steady; the lamps a touch warmer while the show's on.
      for (const l of lamps) l.intensity = 2.2 + (look.mode === 'club' ? -0.3 : 0);
      bulbs.color.setRGB(1, 0.95, 0.8).multiplyScalar(0.95 + 0.05 * Math.sin(t * 50));
    },
  };
}
