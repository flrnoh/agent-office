import * as THREE from 'three';
import { STREET_Y } from '../../../shared/layout';
import { BOWLING_BOX, BOWLING_DOOR, BOWLING_HEIGHT } from '../../../shared/bowling';
import type { Collider, Interactable } from '../types';
import type { Door } from '../office/shell';
import { bulb, type NightParts } from '../outside';
import { mergeByMaterial, mesh, toon } from '../toon';
import { box, canvasTexture, glow } from '../casino/parts';
import { palm } from '../scenic/flora';
import { bikeModel } from '../bike';
import { RETRO, ballTexture, fasciaSign, lobbyTexture, muralTexture, pinProfile, pinTexture, posterTexture, roofSign, starTexture, type PosterKind } from './signs';

/*
 * The bowling centre's outside (flrnoh fork, see FORK.md "The bowling centre"), on its block right next
 * to the office to the east, its front on the office's street: a cream 50s box with teal and cherry
 * stripes round it, a curved glass front under a Googie canopy (a neon edge, downlights) with sliding
 * doors in the middle and the lobby lit behind, BOWLING in huge neon letters on the roof between a
 * giant pin and its ball, starbursts, lit posters (Cosmic Bowling, Karaoke, Schwarzlicht-Minigolf,
 * what the counter has today), palms in planters, a bench, bikes in a rack, and a big mural on the wall
 * that faces the office. E at the doors goes in (client/bowling). Built down on the street with the
 * city, so it's there from every floor's street, the windows and the roof.
 */

const G = STREET_Y;
const B = BOWLING_BOX;
const H = BOWLING_HEIGHT;
const CX = (B.minX + B.maxX) / 2;
const DX = BOWLING_DOOR.x;
/** The front (south, toward the street). */
const FRONT = B.maxZ;
/** The curved glass between the two solid ends of the front: where it starts and ends along x, how far back its ends are, how tall. */
const BAY = { minX: DX - 7.5, maxX: DX + 7.5, back: FRONT - 2.6, glass: 4.4 } as const;
/** The arc the glass runs along: through both ends of the bay and out to the front at the doors. */
const ARC_R = ((BAY.maxX - DX) ** 2 + (FRONT - BAY.back) ** 2) / (2 * (FRONT - BAY.back));
const ARC_Z = FRONT - ARC_R;
/** Where the arc is at x. */
const arcZ = (x: number) => ARC_Z + Math.sqrt(Math.max(0, ARC_R * ARC_R - (x - DX) ** 2));

export interface BowlingExterior {
  door: Door;
  interactable: Interactable;
  /** Your floor's street is `y` down (see streetBelow): the doors and their hint go with it. */
  setStreet(y: number): void;
  update(t: number): void;
}

/** A plain cream render with a little grain. */
function stuccoTexture(): THREE.CanvasTexture {
  const t = canvasTexture(128, 128, (g) => {
    g.fillStyle = RETRO.cream;
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 400; i++) {
      g.fillStyle = i % 2 ? 'rgba(120,90,40,0.05)' : 'rgba(255,255,255,0.25)';
      g.fillRect((i * 37) % 128, (i * 91) % 128, 2, 2);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function buildBowlingExterior(group: THREE.Group, colliders: Collider[], interactables: Interactable[], night: NightParts): BowlingExterior {
  const root = new THREE.Group();
  root.name = 'bowling';
  const parts = new THREE.Group();
  const gradientMap = (toon('#fff') as THREE.MeshToonMaterial).gradientMap;
  const stucco = stuccoTexture();
  stucco.repeat.set(10, 2);
  const wall = new THREE.MeshToonMaterial({ map: stucco, gradientMap });
  const teal = toon(RETRO.teal);
  const cherry = toon(RETRO.cherry);
  const chrome = toon('#d7dde4');
  const dark = toon('#2b2d42');
  const roofMat = toon('#8d8a85');

  // ---- The box: the back and middle, and the front's two solid ends and the fascia over the bay ----
  const back = BAY.back;
  root.add(mesh(box(B.maxX - B.minX, H, back - B.minZ), wall, CX, G + H / 2, (B.minZ + back) / 2));
  root.add(mesh(box(BAY.minX - B.minX, H, FRONT - back), wall, (B.minX + BAY.minX) / 2, G + H / 2, (back + FRONT) / 2));
  root.add(mesh(box(B.maxX - BAY.maxX, H, FRONT - back), wall, (BAY.maxX + B.maxX) / 2, G + H / 2, (back + FRONT) / 2));
  root.add(mesh(box(BAY.maxX - BAY.minX, H - BAY.glass, FRONT - back), wall, DX, G + BAY.glass + (H - BAY.glass) / 2, (back + FRONT) / 2));
  // A flat roof with a teal coping all round.
  parts.add(mesh(box(B.maxX - B.minX - 0.4, 0.1, B.maxZ - B.minZ - 0.4), roofMat, CX, G + H + 0.02, (B.minZ + B.maxZ) / 2, false));
  for (const [x, z, w, d] of [
    [CX, B.minZ, B.maxX - B.minX + 0.3, 0.3],
    [CX, FRONT, B.maxX - B.minX + 0.3, 0.3],
    [B.minX, (B.minZ + B.maxZ) / 2, 0.3, B.maxZ - B.minZ],
    [B.maxX, (B.minZ + B.maxZ) / 2, 0.3, B.maxZ - B.minZ],
  ] as const)
    parts.add(mesh(box(w, 0.45, d), teal, x, G + H + 0.15, z));

  // ---- The stripes round it: a teal plinth, a teal band and a cherry pinstripe under the roof ----------
  const band = (y: number, h: number, mat: THREE.Material, out: number) => {
    parts.add(mesh(box(B.maxX - B.minX + out * 2, h, out * 2 + 0.01), mat, CX, G + y, B.minZ));
    parts.add(mesh(box(out * 2 + 0.01, h, B.maxZ - B.minZ + out * 2), mat, B.minX, G + y, (B.minZ + B.maxZ) / 2));
    parts.add(mesh(box(out * 2 + 0.01, h, B.maxZ - B.minZ + out * 2), mat, B.maxX, G + y, (B.minZ + B.maxZ) / 2));
    // Across the front: the two solid ends, and over the bay on the fascia.
    parts.add(mesh(box(BAY.minX - B.minX + out, h, out * 2), mat, (B.minX - out + BAY.minX) / 2, G + y, FRONT));
    parts.add(mesh(box(B.maxX - BAY.maxX + out, h, out * 2), mat, (BAY.maxX + B.maxX + out) / 2, G + y, FRONT));
    if (y > BAY.glass) parts.add(mesh(box(BAY.maxX - BAY.minX, h, out * 2), mat, DX, G + y, FRONT));
  };
  band(0.45, 0.9, teal, 0.06);
  band(5.55, 0.5, teal, 0.05);
  band(6.05, 0.16, cherry, 0.05);
  band(7.55, 0.12, cherry, 0.05);

  // ---- The curved glass front, the lobby behind it, the sliding doors in the middle ----------------
  const SEG = 14;
  const glass = new THREE.MeshToonMaterial({ color: '#9fd8e0', transparent: true, opacity: 0.32, gradientMap, depthWrite: false });
  glass.userData.outlineParameters = { visible: false };
  const doorHalf = BOWLING_DOOR.width / 2;
  const arcPts: { x: number; z: number }[] = [];
  for (let i = 0; i <= SEG; i++) {
    const x = BAY.minX + ((BAY.maxX - BAY.minX) * i) / SEG;
    arcPts.push({ x, z: arcZ(x) });
  }
  for (let i = 0; i < SEG; i++) {
    const a = arcPts[i];
    const b = arcPts[i + 1];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const mx = (a.x + b.x) / 2;
    const mz = (a.z + b.z) / 2;
    const yaw = Math.atan2(-(b.z - a.z), b.x - a.x);
    // The doors take the two panes in the middle: there the glass is the sliding leaves.
    if (Math.abs(mx - DX) < doorHalf) continue;
    const pane = mesh(new THREE.PlaneGeometry(len, BAY.glass - 0.25), glass, mx, G + 0.15 + (BAY.glass - 0.25) / 2, mz, false);
    pane.rotation.y = yaw;
    root.add(pane);
  }
  // Chrome mullions at every joint, a sill and a head along the curve.
  for (const p of arcPts) {
    if (Math.abs(p.x - DX) < doorHalf - 0.01) continue;
    parts.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, BAY.glass, 8), chrome, p.x, G + BAY.glass / 2, p.z));
  }
  for (const [y, r] of [
    [0.08, 0.09],
    [BAY.glass - 0.06, 0.07],
  ] as const) {
    for (let i = 0; i < SEG; i++) {
      const a = arcPts[i];
      const b = arcPts[i + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const rail = mesh(new THREE.CylinderGeometry(r, r, len + 0.02, 8), chrome, (a.x + b.x) / 2, G + y, (a.z + b.z) / 2);
      rail.rotation.z = Math.PI / 2;
      rail.rotation.y = Math.atan2(-(b.z - a.z), b.x - a.x);
      parts.add(rail);
    }
  }
  // The lobby floor (terrazzo), its back wall with what you see of the inside, and the soffit's lights.
  const lobbyShape = new THREE.Shape();
  lobbyShape.moveTo(BAY.minX, -back);
  for (const p of arcPts) lobbyShape.lineTo(p.x, -p.z);
  lobbyShape.lineTo(BAY.maxX, -back);
  lobbyShape.closePath();
  const terrazzo = canvasTexture(64, 64, (g) => {
    g.fillStyle = '#e9e1d2';
    g.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 70; i++) {
      g.fillStyle = [RETRO.teal, RETRO.cherry, '#8d99ae', RETRO.mustard][i % 4];
      g.fillRect((i * 23) % 64, (i * 41) % 64, 2, 2);
    }
  });
  terrazzo.wrapS = terrazzo.wrapT = THREE.RepeatWrapping;
  terrazzo.repeat.set(0.5, 0.5);
  const floor = mesh(new THREE.ShapeGeometry(lobbyShape), new THREE.MeshToonMaterial({ map: terrazzo, gradientMap }), 0, G + 0.02, 0, false);
  floor.rotation.x = -Math.PI / 2;
  root.add(floor);
  const lobby = mesh(new THREE.PlaneGeometry(BAY.maxX - BAY.minX, BAY.glass), glow(lobbyTexture()), DX, G + BAY.glass / 2, back + 0.01, false);
  root.add(lobby);
  const soffit = mesh(new THREE.ShapeGeometry(lobbyShape), toon('#f3ead7'), 0, G + BAY.glass - 0.02, 0, false);
  soffit.rotation.x = Math.PI / 2;
  soffit.scale.y = -1;
  root.add(soffit);
  const downlight = bulb(night, '#fff1d0', 0.5);
  for (const x of [DX - 5, DX - 2.5, DX, DX + 2.5, DX + 5]) root.add(mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.03, 12), downlight, x, G + BAY.glass - 0.04, back + 1.2, false));

  // The sliding doors: chrome frames, glass leaves with a cherry push bar.
  const dw = BOWLING_DOOR.width;
  const dh = BOWLING_DOOR.height;
  const dz = arcZ(DX) - 0.08;
  parts.add(mesh(box(dw + 0.3, 0.18, 0.2), chrome, DX, G + dh + 0.09, dz));
  parts.add(mesh(box(dw + 0.2, BAY.glass - dh - 0.18, 0.06), glass, DX, G + dh + 0.18 + (BAY.glass - dh - 0.18) / 2, dz));
  const leafGlass = new THREE.MeshToonMaterial({ color: '#a7e3ea', transparent: true, opacity: 0.4, gradientMap, depthWrite: false });
  leafGlass.userData.outlineParameters = { visible: false };
  const leaves = [-1, 1].map((s) => {
    const leaf = new THREE.Group();
    leaf.add(mesh(box(dw / 2 - 0.04, dh - 0.06, 0.04), leafGlass, 0, 0, 0, false));
    leaf.add(mesh(box(dw / 2, 0.06, 0.06), chrome, 0, dh / 2 - 0.03, 0, false));
    leaf.add(mesh(box(dw / 2, 0.06, 0.06), chrome, 0, -dh / 2 + 0.03, 0, false));
    leaf.add(mesh(box(0.05, dh, 0.06), chrome, -s * (dw / 4 - 0.02), 0, 0, false));
    leaf.add(mesh(box(0.05, 0.05, dw / 2 - 0.3).rotateY(Math.PI / 2), cherry, 0, 0.05, 0.06, false));
    leaf.position.set(DX + (s * dw) / 4, G + dh / 2, dz);
    root.add(leaf);
    return { leaf, s };
  });
  // A rubber mat in front of them.
  const mat = mesh(new THREE.PlaneGeometry(3, 1.1), toon('#3a3a46'), DX, G + 0.015, FRONT + 0.55, false);
  mat.rotation.x = -Math.PI / 2;
  root.add(mat);

  // ---- The Googie canopy: a boomerang slab over the bay, a neon edge, downlights ---------------------
  {
    const s = new THREE.Shape();
    const ox = DX;
    // In the slab's own frame: x along the front, y out toward the street (-z of the shape becomes +z).
    s.moveTo(-9.6, 0);
    s.bezierCurveTo(-8.6, 1.8, -3.5, 2.1, 0, 1.55);
    s.bezierCurveTo(3.5, 2.1, 8.6, 1.8, 9.6, 0);
    s.bezierCurveTo(6, -0.3, -6, -0.3, -9.6, 0);
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.24, bevelEnabled: false, curveSegments: 18 });
    geo.rotateX(Math.PI / 2);
    const slab = mesh(geo, toon('#f7f1e3'), ox, G + BAY.glass + 0.28, FRONT, true);
    root.add(slab);
    // The neon round its edge: the outline as a tube.
    const pts = s.getPoints(40).map((p) => new THREE.Vector3(ox + p.x, G + BAY.glass + 0.17, FRONT + p.y));
    const curve = new THREE.CatmullRomCurve3(pts, true);
    const neon = glow(null, RETRO.pink);
    root.add(mesh(new THREE.TubeGeometry(curve, 120, 0.045, 6, true), neon, 0, 0, 0, false));
    const lights = bulb(night, '#fff3d6', 0.25);
    for (const x of [-6.5, -3.5, 0, 3.5, 6.5]) root.add(mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.03, 12), lights, ox + x, G + BAY.glass + 0.03, FRONT + 0.9, false));
    night.halos.push({ at: new THREE.Vector3(DX, G + BAY.glass - 0.2, FRONT + 1), size: 3.2, color: '#ffd8ec', ground: true });
    night.halos.push({ at: new THREE.Vector3(DX - 5, G + BAY.glass - 0.2, FRONT + 0.8), size: 2.2, color: '#fff3d6', ground: true });
    night.halos.push({ at: new THREE.Vector3(DX + 5, G + BAY.glass - 0.2, FRONT + 0.8), size: 2.2, color: '#fff3d6', ground: true });
  }

  // ---- The fascia sign over the canopy, and starbursts on the front ----------------------------------
  const fascia = mesh(new THREE.PlaneGeometry(9, 1.4), glow(fasciaSign(), '#ffffff', { transparent: true }), DX, G + 6.85, FRONT + 0.07, false);
  root.add(fascia);
  const starGold = new THREE.MeshToonMaterial({ map: starTexture(RETRO.mustard), transparent: true, alphaTest: 0.1, gradientMap, emissive: new THREE.Color('#ffd27a') });
  starGold.emissiveIntensity = 0.15;
  night.bulbs.push({ mat: starGold, day: 0.15 });
  const starTeal = new THREE.MeshToonMaterial({ map: starTexture(RETRO.aqua), transparent: true, alphaTest: 0.1, gradientMap, emissive: new THREE.Color('#7ff6ff') });
  night.bulbs.push({ mat: starTeal, day: 0.15 });
  for (const [x, y, s, m] of [
    [B.minX + 3, 6.7, 1.6, starGold],
    [B.minX + 6.5, 7.1, 0.9, starTeal],
    [BAY.minX - 2.2, 6.9, 1.2, starTeal],
    [BAY.maxX + 2.2, 6.9, 1.2, starGold],
    [B.maxX - 6.5, 7.1, 0.9, starGold],
    [B.maxX - 3, 6.7, 1.6, starTeal],
  ] as const) {
    const st = mesh(new THREE.PlaneGeometry(s, s), m, x, G + y, FRONT + 0.08, false);
    root.add(st);
  }

  // ---- Lit posters either side ------------------------------------------------------------------------
  const posters: [PosterKind, number][] = [
    ['cosmic', BAY.minX - 5.6],
    ['karaoke', BAY.minX - 3.9],
    ['minigolf', BAY.maxX + 3.9],
    ['counter', BAY.maxX + 5.6],
  ];
  for (const [kind, x] of posters) {
    parts.add(mesh(box(1.42, 1.98, 0.1), chrome, x, G + 1.75, FRONT + 0.05));
    const tex = posterTexture(kind);
    const m = new THREE.MeshToonMaterial({ map: tex, gradientMap, emissive: new THREE.Color('#ffffff'), emissiveMap: tex });
    night.bulbs.push({ mat: m, day: 0.45 });
    root.add(mesh(new THREE.PlaneGeometry(1.24, 1.76), m, x, G + 1.75, FRONT + 0.11, false));
  }

  // ---- On the roof: BOWLING in neon on a lattice frame, the giant pin and its ball --------------------
  const SIGN = { x: CX + 3, z: FRONT - 2.2, w: 22, h: 4.5 } as const;
  {
    // The frame behind: two posts and a lattice of struts, painted teal.
    for (const s of [-1, 1]) parts.add(mesh(box(0.25, SIGN.h + 0.8, 0.25), teal, SIGN.x + s * (SIGN.w / 2 - 1), G + H + (SIGN.h + 0.8) / 2, SIGN.z - 0.35));
    parts.add(mesh(box(SIGN.w - 1.6, 0.18, 0.18), teal, SIGN.x, G + H + 0.9, SIGN.z - 0.35));
    parts.add(mesh(box(SIGN.w - 1.6, 0.18, 0.18), teal, SIGN.x, G + H + SIGN.h + 0.4, SIGN.z - 0.35));
    for (let i = 0; i < 10; i++) {
      const strut = mesh(box(0.08, SIGN.h * 1.1, 0.08), dark, SIGN.x - SIGN.w / 2 + 1.6 + i * ((SIGN.w - 3.2) / 9), G + H + 0.9 + SIGN.h / 2, SIGN.z - 0.4);
      strut.rotation.z = i % 2 ? 0.45 : -0.45;
      parts.add(strut);
    }
    const sign = mesh(new THREE.PlaneGeometry(SIGN.w, SIGN.w * (420 / 2048)), glow(roofSign(), '#ffffff', { transparent: true }), SIGN.x, G + H + 0.5 + SIGN.h / 2, SIGN.z, false);
    root.add(sign);
    // Its glow on the night, behind and round the letters.
    const soft = canvasTexture(128, 64, (g) => {
      const grd = g.createRadialGradient(64, 32, 4, 64, 32, 64);
      grd.addColorStop(0, 'rgba(255,255,255,1)');
      grd.addColorStop(0.55, 'rgba(255,255,255,0.35)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, 128, 64);
    });
    const haze = new THREE.MeshBasicMaterial({ map: soft, color: '#ff3355', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    haze.userData.outlineParameters = { visible: false };
    night.glows.push({ mat: haze, max: 0.35 });
    root.add(mesh(new THREE.PlaneGeometry(SIGN.w + 8, SIGN.h + 5), haze, SIGN.x, G + H + 0.5 + SIGN.h / 2, SIGN.z - 0.2, false));
  }
  const pinTex = pinTexture();
  const pinMat = new THREE.MeshToonMaterial({ map: pinTex, gradientMap, emissive: new THREE.Color('#8a8a8a'), emissiveMap: pinTex });
  night.bulbs.push({ mat: pinMat, day: 0 });
  const PIN = { x: B.minX + 5.5, z: FRONT - 4.5, h: 8 } as const;
  const pin = mesh(new THREE.LatheGeometry(pinProfile(), 28), pinMat, PIN.x, G + H + 0.1, PIN.z);
  pin.scale.setScalar(PIN.h);
  root.add(pin);
  const ballTex = ballTexture();
  const ballMat = new THREE.MeshToonMaterial({ map: ballTex, gradientMap, emissive: new THREE.Color('#2a1d70'), emissiveMap: ballTex, emissiveIntensity: 0 });
  night.bulbs.push({ mat: ballMat, day: 0 });
  const BALL_R = 1.7;
  const ball = mesh(new THREE.SphereGeometry(BALL_R, 32, 20), ballMat, PIN.x + 4.1, G + H + 0.1 + BALL_R, PIN.z + 0.6);
  ball.rotation.set(0.4, 0.8, 0.2);
  root.add(ball);
  for (const [a, b] of [
    [0.35, -0.2],
    [0.55, 0.05],
    [0.25, 0.25],
  ]) {
    const hole = mesh(new THREE.CircleGeometry(0.17, 14), toon('#0e0a22'), 0, 0, 0, false);
    const dir = new THREE.Vector3(Math.sin(b), Math.sin(a), Math.cos(b)).normalize();
    hole.position.copy(dir.clone().multiplyScalar(BALL_R + 0.005));
    hole.lookAt(dir.clone().multiplyScalar(5));
    ball.add(hole);
  }
  // Floodlights on the roof's edge washing the pin and the ball at night.
  const flood = bulb(night, '#fff6dc', 0.05);
  for (const dx of [-1.5, 2.5]) {
    parts.add(mesh(box(0.35, 0.25, 0.3), dark, PIN.x + dx, G + H + 0.25, FRONT - 0.6));
    root.add(mesh(box(0.28, 0.04, 0.22), flood, PIN.x + dx, G + H + 0.39, FRONT - 0.6, false));
  }

  // ---- The mural on the wall facing the office ---------------------------------------------------
  const mural = mesh(new THREE.PlaneGeometry(B.maxZ - B.minZ - 4, 7.2), new THREE.MeshToonMaterial({ map: muralTexture(), gradientMap }), B.minX - 0.07, G + 3.9, (B.minZ + B.maxZ) / 2, false);
  mural.rotation.y = -Math.PI / 2;
  root.add(mural);

  // ---- Out front: palms in planters, a bench, bikes in a rack ----------------------------------------
  const planter = toon(RETRO.teal);
  const greens = new THREE.Group();
  for (const [x, turn] of [
    [BAY.minX - 1.4, -Math.PI * 0.75],
    [BAY.maxX + 1.4, -Math.PI * 0.25],
  ] as const) {
    parts.add(mesh(new THREE.CylinderGeometry(0.55, 0.45, 0.6, 16), planter, x, G + 0.3, FRONT + 0.5));
    parts.add(mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.04, 16), toon('#6b4f3a'), x, G + 0.6, FRONT + 0.5, false));
    palm(greens, x, FRONT + 0.5, 0.7, turn);
    colliders.push({ minX: x - 0.55, maxX: x + 0.55, minZ: FRONT - 0.05, maxZ: FRONT + 1.05, bottom: G, top: G + 0.6 });
  }
  greens.position.y = G - STREET_Y; // (palm() stands on the street itself)
  root.add(greens);
  {
    // A cherry-red bench against the west end, facing the street.
    const bx = B.minX + 7;
    parts.add(mesh(box(2, 0.08, 0.45), cherry, bx, G + 0.46, FRONT + 0.32));
    parts.add(mesh(box(2, 0.45, 0.06), cherry, bx, G + 0.75, FRONT + 0.1));
    for (const s of [-1, 1]) parts.add(mesh(box(0.06, 0.46, 0.4), chrome, bx + s * 0.9, G + 0.23, FRONT + 0.3));
    colliders.push({ minX: bx - 1, maxX: bx + 1, minZ: FRONT, maxZ: FRONT + 0.6, bottom: G, top: G + 0.5, fence: true });
    // A bin by it.
    parts.add(mesh(new THREE.CylinderGeometry(0.24, 0.22, 0.85, 14), teal, bx + 1.6, G + 0.43, FRONT + 0.35));
    colliders.push({ minX: bx + 1.35, maxX: bx + 1.85, minZ: FRONT + 0.1, maxZ: FRONT + 0.6, bottom: G, top: G + 0.85 });
  }
  {
    // A bike rack of chrome hoops along the east end, two bikes in it.
    const rx = B.maxX - 7.5;
    for (let i = 0; i < 4; i++) {
      const hoop = mesh(new THREE.TorusGeometry(0.38, 0.03, 6, 16, Math.PI), chrome, rx + i * 0.9, G, FRONT + 0.45);
      parts.add(hoop);
    }
    colliders.push({ minX: rx - 0.5, maxX: rx + 3.2, minZ: FRONT + 0.2, maxZ: FRONT + 0.75, bottom: G, top: G + 0.6, fence: true });
    for (const [i, kind] of [
      [0, 'city'],
      [2, 'racer'],
    ] as const) {
      const b = bikeModel(kind);
      b.group.position.set(rx + i * 0.9 + 0.35, G, FRONT + 0.45);
      b.group.rotation.y = Math.PI / 2;
      root.add(b.group);
    }
  }

  root.add(mergeByMaterial(parts));
  group.add(root);

  // In the way: the whole building (you go in by the doors, with E).
  colliders.push({ minX: B.minX, maxX: B.maxX, minZ: B.minZ, maxZ: B.maxZ, bottom: G, top: G + H + 0.5 });

  const interactable: Interactable = { kind: 'bowling', x: DX, z: FRONT + 1.1, y: G, radius: 2.4 };
  interactables.push(interactable);
  lobby.userData.interact = interactable;
  fascia.userData.interact = interactable;
  for (const { leaf } of leaves) leaf.userData.interact = interactable;

  const door: Door = {
    x: DX,
    y: G,
    z: FRONT + 0.2,
    open: 0,
    show: (k) => {
      const e = k * k * (3 - 2 * k);
      for (const { leaf, s } of leaves) leaf.position.x = DX + (s * dw) / 4 + s * e * (dw / 2 - 0.08);
    },
  };

  return {
    door,
    interactable,
    setStreet(y) {
      door.y = y;
      interactable.y = y;
    },
    update(t) {
      // The ball rocks a little on its spot, as if it'd only just rolled up there.
      ball.rotation.y = 0.8 + Math.sin(t * 0.15) * 0.25;
    },
  };
}
