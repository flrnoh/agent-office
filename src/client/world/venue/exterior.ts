import * as THREE from 'three';
import { STREET_Y } from '../../../shared/layout';
import { VENUE_BOX, VENUE_DOOR, VENUE_HEIGHT } from '../../../shared/venue';
import type { Collider, Interactable } from '../types';
import type { Door } from '../office/shell';
import { bulb, type NightParts } from '../outside';
import { mergeByMaterial, mesh, toon, toonUnique } from '../toon';
import { box, canvasTexture, glow } from '../casino/parts';
import { BOLD, SW, brickTexture, corrugatedTexture, drawLetterBoard, litWindowTexture, neonWord, posterTexture, softDot } from './signs';
import { billLines, onVenueBill } from './bill';
import { buildYard } from './exterior-yard';

/*
 * The Schallwerk's outside (flrnoh fork, see FORK.md "The Schallwerk"), across the street east of the
 * gym, its front on the street: an old power station of sooty red brick turned concert hall and club.
 * Brick pilasters and tall arched factory windows (lit warm from inside at night), a stone plinth and
 * a cornice, a sawtooth roof whose glazed north faces glow, the old chimney with SCHALLWERK painted
 * down it, SCHALLWERK in big red neon on a steel frame on the roof's front edge, the entrance in a
 * brick portal under a marquee with chaser bulbs and the letter board saying what's on tonight
 * (world/venue/bill.ts), lit poster cases, gooseneck lanterns; the smokers' beer garden, the tour bus
 * and the loading dock are exterior-yard.ts. E at the doors goes in (client/venue). Built down on the
 * street with the city, so it's there from every floor's street, the windows and the roof.
 */

const G = STREET_Y;
const B = VENUE_BOX;
const H = VENUE_HEIGHT;
const CX = (B.minX + B.maxX) / 2;
const DX = VENUE_DOOR.x;
/** The front (north, toward the street). */
const FRONT = B.minZ;
/** The chimney, at the back on the west side. */
export const CHIMNEY = { x: B.minX + 4.5, z: B.maxZ - 4.5, h: 30, r0: 1.7, r1: 1.15 } as const;
/** The marquee over the doors: how far out it reaches, how wide, its underside and its board's height. */
const MARQ = { w: 13, out: 2.7, y: 4.3, h: 1.25 } as const;
/** The neon on the roof's front edge. */
const NEON = { w: 30, h: 4.7, y: H + 0.9 } as const;

export interface VenueExterior {
  door: Door;
  interactable: Interactable;
  /** Your floor's street is `y` down (see streetBelow): the doors and their hint go with it. */
  setStreet(y: number): void;
  update(t: number): void;
}

/** A tall arched window's outline: `w` wide, `h` tall overall, round at the top. */
function archShape(w: number, h: number): THREE.Shape {
  const s = new THREE.Shape();
  const r = w / 2;
  s.moveTo(-r, 0);
  s.lineTo(r, 0);
  s.lineTo(r, h - r);
  s.absarc(0, h - r, r, 0, Math.PI, false);
  s.lineTo(-r, 0);
  return s;
}

/** A plane's UVs from its own x and y over a w × h box (ShapeGeometry's are in metres). */
function fitUv(geo: THREE.BufferGeometry, w: number, h: number) {
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + w / 2) / w, pos.getY(i) / h);
  uv.needsUpdate = true;
  return geo;
}

export function buildVenueExterior(group: THREE.Group, colliders: Collider[], interactables: Interactable[], night: NightParts): VenueExterior {
  const root = new THREE.Group();
  root.name = 'venue';
  const parts = new THREE.Group();
  const gradientMap = (toon('#fff') as THREE.MeshToonMaterial).gradientMap;
  const brickMat = (w: number, h: number, seed = 7, dark = 0) => {
    const t = brickTexture(seed, dark);
    t.repeat.set(w / 1.6, h / 1.2);
    return new THREE.MeshToonMaterial({ map: t, gradientMap });
  };
  const pilasterBrick = toon('#6e2c1c');
  const stone = toon('#8b857c');
  const plinth = toon('#3a3634');
  const steel = toon('#2b2f36');
  const soot = toon(SW.soot);

  // ---- The hall's mass and its four brick faces ------------------------------------------------
  const W = B.maxX - B.minX;
  const D = B.maxZ - B.minZ;
  parts.add(mesh(box(W - 0.1, H, D - 0.1), toon('#5a2a1e'), CX, G + H / 2, (B.minZ + B.maxZ) / 2));
  const face = (w: number, x: number, z: number, rotY: number, seed: number) => {
    const m = mesh(new THREE.PlaneGeometry(w, H), brickMat(w, H, seed), x, G + H / 2, z, false);
    m.rotation.y = rotY;
    root.add(m);
  };
  face(W, CX, FRONT - 0.01, Math.PI, 7);
  face(W, CX, B.maxZ + 0.01, 0, 8);
  face(D, B.minX - 0.01, (B.minZ + B.maxZ) / 2, -Math.PI / 2, 9);
  face(D, B.maxX + 0.01, (B.minZ + B.maxZ) / 2, Math.PI / 2, 10);

  // The plinth (dark stone) and the cornice (stone over a brick corbel) all round.
  const ring = (y: number, h: number, out: number, mat: THREE.Material) => {
    parts.add(mesh(box(W + out * 2, h, out * 2), mat, CX, G + y, FRONT));
    parts.add(mesh(box(W + out * 2, h, out * 2), mat, CX, G + y, B.maxZ));
    parts.add(mesh(box(out * 2, h, D), mat, B.minX, G + y, (B.minZ + B.maxZ) / 2));
    parts.add(mesh(box(out * 2, h, D), mat, B.maxX, G + y, (B.minZ + B.maxZ) / 2));
  };
  ring(0.45, 0.9, 0.12, plinth);
  ring(H - 0.85, 0.3, 0.14, pilasterBrick);
  ring(H - 0.45, 0.5, 0.28, stone);
  ring(H + 0.1, 0.2, 0.32, stone);

  // ---- Pilasters and the tall arched windows between them --------------------------------------
  const winW = 2.3;
  const winH = 5.4;
  const sill = 2.6;
  const winGeo = fitUv(new THREE.ShapeGeometry(archShape(winW, winH), 12), winW, winH);
  const revealGeo = new THREE.ShapeGeometry(archShape(winW + 0.5, winH + 0.3), 12);
  const winMat = new THREE.MeshToonMaterial({ map: litWindowTexture(false), gradientMap, emissive: new THREE.Color('#ffffff'), emissiveMap: litWindowTexture(true) });
  night.bulbs.push({ mat: winMat, day: 0.08 });
  const reveal = toon('#4a1d14');
  /** A window in a wall: (u along it, the wall's line), which way it faces. */
  const windowAt = (x: number, z: number, rotY: number) => {
    const out = new THREE.Vector3(Math.sin(rotY), 0, Math.cos(rotY));
    const r = mesh(revealGeo, reveal, x + out.x * 0.02, G + sill - 0.15, z + out.z * 0.02, false);
    r.rotation.y = rotY;
    root.add(r);
    const w = mesh(winGeo, winMat, x + out.x * 0.04, G + sill, z + out.z * 0.04, false);
    w.rotation.y = rotY;
    root.add(w);
    const s = mesh(box(winW + 0.6, 0.14, 0.3), stone, x + out.x * 0.12, G + sill - 0.1, z + out.z * 0.12);
    s.rotation.y = rotY;
    parts.add(s);
  };
  const pilaster = (x: number, z: number, alongX: boolean, out: number) => {
    parts.add(mesh(alongX ? box(0.8, H - 1, 0.5) : box(0.5, H - 1, 0.8), pilasterBrick, x + (alongX ? 0 : out * 0.2), G + (H - 1) / 2 + 0.5, z + (alongX ? out * 0.2 : 0)));
  };
  // The front: pilasters every 6 m, windows between, none where the entrance is.
  const bayXs: number[] = [];
  for (let x = B.minX + 3; x <= B.maxX - 3 + 1e-6; x += 6) bayXs.push(x);
  for (let x = B.minX; x <= B.maxX + 1e-6; x += 6) if (Math.abs(x - DX) > 4) pilaster(Math.min(B.maxX - 0.4, Math.max(B.minX + 0.4, x)), FRONT, true, -1);
  for (const x of bayXs) if (Math.abs(x - DX) > 5) windowAt(x, FRONT, Math.PI);
  // The sides and the back: the same rhythm, every 6 m.
  for (let z = B.minZ + 4; z < B.maxZ - 2; z += 6) {
    windowAt(B.minX, z, -Math.PI / 2);
    pilaster(B.minX, z + 3, false, -1);
    if (z < B.maxZ - 10) windowAt(B.maxX, z, Math.PI / 2); // (the loading dock is at the east wall's back)
    pilaster(B.maxX, z + 3, false, 1);
  }
  for (let x = B.minX + 9; x < B.maxX - 3; x += 6) windowAt(x, B.maxZ, 0);

  // ---- The sawtooth roof: four teeth, their glazed faces north --------------------------------
  const TEETH = 4;
  const toothD = (D - 4) / TEETH;
  const toothH = 2.6;
  const roofMat = new THREE.MeshToonMaterial({ map: corrugatedTexture('#3a3d44'), gradientMap });
  (roofMat.map as THREE.Texture).repeat.set(12, 3);
  const glaze = (pane: string) => {
    const t = canvasTexture(256, 32, (g) => {
      g.fillStyle = pane;
      g.fillRect(0, 0, 256, 32);
      g.fillStyle = 'rgba(25,22,28,0.9)';
      for (let x = 0; x < 256; x += 16) g.fillRect(x, 0, 3, 32);
      g.fillRect(0, 0, 256, 3);
      g.fillRect(0, 15, 256, 2);
    });
    t.wrapS = THREE.RepeatWrapping;
    t.repeat.set(10, 1);
    return t;
  };
  // By day grey-blue glass; at night the club's light coming up through it, amber and violet.
  const glazeMat = new THREE.MeshToonMaterial({ map: glaze('#6f8399'), gradientMap, emissive: new THREE.Color('#ffffff'), emissiveMap: glaze('#ff9f5a') });
  night.bulbs.push({ mat: glazeMat, day: 0.05 });
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(0, toothH);
  shape.lineTo(toothD, 0);
  shape.lineTo(0, 0);
  const toothGeo = new THREE.ExtrudeGeometry(shape, { depth: W - 2, bevelEnabled: false });
  for (let k = 0; k < TEETH; k++) {
    const z0 = B.minZ + 2 + k * toothD;
    // The prism: its shape is in (z, y), extruded along x.
    const tooth = new THREE.Mesh(toothGeo, roofMat);
    tooth.rotation.y = -Math.PI / 2;
    tooth.position.set(B.maxX - 1, G + H + 0.2, z0); // (rotated, the prism runs from here west)
    tooth.castShadow = true;
    root.add(tooth);
    const glass = mesh(new THREE.PlaneGeometry(W - 2.2, toothH - 0.35), glazeMat, CX, G + H + 0.2 + (toothH - 0.35) / 2 + 0.1, z0 - 0.02, false);
    glass.rotation.y = Math.PI;
    root.add(glass);
  }
  parts.add(mesh(box(W - 0.4, 0.15, D - 0.4), toon('#45403d'), CX, G + H + 0.12, (B.minZ + B.maxZ) / 2, false));

  // ---- The chimney: brick, tapering, SCHALLWERK painted down its north side, a red light on top ----
  {
    const c = CHIMNEY;
    const t = brickTexture(21, 0.25);
    t.repeat.set(6, c.h / 1.2);
    const cm = new THREE.MeshToonMaterial({ map: t, gradientMap });
    root.add(mesh(new THREE.CylinderGeometry(c.r1, c.r0, c.h, 24, 1, true), cm, c.x, G + c.h / 2, c.z));
    const letters = canvasTexture(128, 1024, (g) => {
      g.fillStyle = '#efe7da';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `86px ${BOLD}`;
      'SCHALLWERK'.split('').forEach((ch, i) => g.fillText(ch, 64, 150 + i * 80));
    });
    const lm = new THREE.MeshToonMaterial({ map: letters, gradientMap, transparent: true, alphaTest: 0.2, emissive: new THREE.Color('#ffffff'), emissiveMap: letters });
    night.bulbs.push({ mat: lm, day: 0 });
    root.add(mesh(new THREE.CylinderGeometry(c.r1 + 0.02, c.r0 + 0.02, c.h, 24, 1, true, Math.PI - 0.5, 1.0), lm, c.x, G + c.h / 2, c.z, false));
    for (const y of [c.h * 0.42, c.h * 0.7, c.h - 0.6]) {
      const k = y / c.h;
      const r = c.r0 + (c.r1 - c.r0) * k;
      parts.add(mesh(new THREE.TorusGeometry(r + 0.04, 0.06, 6, 24).rotateX(Math.PI / 2), steel, c.x, G + y, c.z));
    }
    parts.add(mesh(new THREE.CylinderGeometry(c.r1 + 0.12, c.r1 + 0.05, 0.6, 24), soot, c.x, G + c.h + 0.3, c.z));
    root.add(mesh(new THREE.SphereGeometry(0.18, 10, 8), bulb(night, '#ff2020', 0.6), c.x, G + c.h + 0.75, c.z, false));
    night.halos.push({ at: new THREE.Vector3(c.x, G + c.h + 0.8, c.z), size: 2.2, color: '#ff3030' });
    // An uplight at its foot washing it at night.
    const wash = new THREE.MeshBasicMaterial({ map: softDot(), color: '#ffb070', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    wash.userData.outlineParameters = { visible: false };
    night.glows.push({ mat: wash, max: 0.4 });
    const up = mesh(new THREE.PlaneGeometry(5, 26), wash, c.x, G + H + 9, c.z - c.r0 - 0.3, false);
    up.rotation.y = Math.PI;
    root.add(up);
  }

  // ---- SCHALLWERK in red neon on a steel frame on the front edge of the roof --------------------
  {
    const sz = FRONT + 0.6;
    for (const s of [-1, -0.33, 0.33, 1]) parts.add(mesh(box(0.2, NEON.h + 0.6, 0.2), steel, CX + (s * NEON.w) / 2.15, G + NEON.y + (NEON.h + 0.6) / 2 - 0.5, sz + 0.35));
    parts.add(mesh(box(NEON.w, 0.16, 0.16), steel, CX, G + NEON.y + 0.2, sz + 0.35));
    parts.add(mesh(box(NEON.w, 0.16, 0.16), steel, CX, G + NEON.y + NEON.h - 0.1, sz + 0.35));
    for (let i = 0; i < 14; i++) {
      const d = mesh(box(0.07, NEON.h, 0.07), steel, CX - NEON.w / 2 + 1 + i * ((NEON.w - 2) / 13), G + NEON.y + NEON.h / 2, sz + 0.4);
      d.rotation.z = i % 2 ? 0.5 : -0.5;
      parts.add(d);
    }
    const sign = mesh(new THREE.PlaneGeometry(NEON.w, NEON.h), glow(neonWord('SCHALLWERK', SW.red, 2048, 320), '#ffffff', { transparent: true }), CX, G + NEON.y + NEON.h / 2, sz, false);
    sign.rotation.y = Math.PI;
    root.add(sign);
    const haze = new THREE.MeshBasicMaterial({ map: softDot(), color: '#ff2a3a', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    haze.userData.outlineParameters = { visible: false };
    night.glows.push({ mat: haze, max: 0.45 });
    const h = mesh(new THREE.PlaneGeometry(NEON.w + 10, NEON.h + 7), haze, CX, G + NEON.y + NEON.h / 2, sz + 0.2, false);
    h.rotation.y = Math.PI;
    root.add(h);
  }

  // ---- The entrance: a brick portal with a round arch, steel-and-glass doors that slide apart ----
  const dw = VENUE_DOOR.width;
  const dh = VENUE_DOOR.height;
  const PORTAL = { w: dw + 2.4, h: 5.6 } as const;
  let recess: THREE.Mesh | null = null;
  const glassMat = new THREE.MeshToonMaterial({ color: '#ffd9a0', transparent: true, opacity: 0.55, gradientMap, emissive: new THREE.Color('#ffb060'), depthWrite: false });
  glassMat.userData.outlineParameters = { visible: false };
  night.bulbs.push({ mat: glassMat, day: 0.15 });
  {
    const pz = FRONT - 0.3;
    for (const s of [-1, 1]) parts.add(mesh(box(1.0, PORTAL.h, 0.6), pilasterBrick, DX + s * (PORTAL.w / 2 - 0.5), G + PORTAL.h / 2, pz));
    // The arch over it: a half ring of brick, a keystone.
    const arch = mesh(new THREE.RingGeometry(PORTAL.w / 2 - 1, PORTAL.w / 2, 24, 1, 0, Math.PI), pilasterBrick, DX, G + PORTAL.h - 0.4, FRONT - 0.61, false);
    arch.rotation.y = Math.PI;
    root.add(arch);
    parts.add(mesh(box(0.7, 0.9, 0.7), stone, DX, G + PORTAL.h + PORTAL.w / 2 - 0.85, pz));
    // The fanlight in the arch, lit from inside at night.
    root.add(mesh(new THREE.CircleGeometry(PORTAL.w / 2 - 1, 24, 0, Math.PI).rotateY(Math.PI), glassMat, DX, G + PORTAL.h - 0.4, FRONT - 0.04, false));
    root.add(mesh(new THREE.PlaneGeometry(0.08, PORTAL.w / 2 - 1).rotateY(Math.PI), steel, DX, G + PORTAL.h - 0.4 + (PORTAL.w / 2 - 1) / 2, FRONT - 0.06, false));
    // Behind the doors, the foyer as you see it through them: warm light, the posters, people at the box office.
    const lobby = canvasTexture(256, 320, (g) => {
      const grd = g.createLinearGradient(0, 0, 0, 320);
      grd.addColorStop(0, '#1a0f10');
      grd.addColorStop(0.35, '#6b3a22');
      grd.addColorStop(1, '#2a1a14');
      g.fillStyle = grd;
      g.fillRect(0, 0, 256, 320);
      // Downlights' pools, posters on the far wall, the box office's lit window.
      for (const x of [40, 128, 216]) {
        const r = g.createRadialGradient(x, 120, 2, x, 150, 70);
        r.addColorStop(0, 'rgba(255,214,150,0.9)');
        r.addColorStop(1, 'rgba(255,214,150,0)');
        g.fillStyle = r;
        g.fillRect(0, 60, 256, 200);
      }
      [['#ff2d3d', 20], ['#2ee6ff', 90], ['#ffd166', 196]].forEach(([c, x]) => {
        g.fillStyle = c as string;
        g.fillRect(x as number, 150, 34, 48);
      });
      g.fillStyle = '#ffcf8a';
      g.fillRect(140, 200, 70, 34);
      // Heads and shoulders in silhouette.
      g.fillStyle = 'rgba(15,8,10,0.9)';
      for (const [x, y] of [[60, 268], [96, 276], [170, 262], [210, 280]]) {
        g.beginPath();
        g.arc(x, y, 13, 0, Math.PI * 2);
        g.fill();
        g.fillRect(x - 20, y + 10, 40, 60);
      }
    });
    const lobbyMat = new THREE.MeshToonMaterial({ map: lobby, gradientMap, emissive: new THREE.Color('#ffffff'), emissiveMap: lobby });
    night.bulbs.push({ mat: lobbyMat, day: 0.55 });
    recess = mesh(new THREE.PlaneGeometry(PORTAL.w - 2, PORTAL.h - 0.4).rotateY(Math.PI), lobbyMat, DX, G + (PORTAL.h - 0.4) / 2, FRONT - 0.03, false);
    root.add(recess);
  }
  const dz = FRONT - 0.12;
  parts.add(mesh(box(dw + 0.3, 0.2, 0.2), steel, DX, G + dh + 0.1, dz));
  const transom = mesh(new THREE.PlaneGeometry(dw, 1.2).rotateY(Math.PI), glow(canvasTexture(512, 192, (g) => {
    g.fillStyle = '#1a1416';
    g.fillRect(0, 0, 512, 192);
    g.fillStyle = '#ffe2b0';
    g.font = `110px ${BOLD}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('EINGANG', 256, 100);
  })), DX, G + dh + 0.8, dz - 0.02, false);
  root.add(transom);
  const leaves = [-1, 1].map((s) => {
    const leaf = new THREE.Group();
    leaf.add(mesh(box(dw / 2 - 0.04, dh - 0.06, 0.05), glassMat, 0, 0, 0, false));
    leaf.add(mesh(box(dw / 2, 0.1, 0.08), steel, 0, dh / 2 - 0.05, 0, false));
    leaf.add(mesh(box(dw / 2, 0.16, 0.08), steel, 0, -dh / 2 + 0.08, 0, false));
    leaf.add(mesh(box(0.08, dh, 0.08), steel, -s * (dw / 4 - 0.04), 0, 0, false));
    leaf.add(mesh(box(0.08, dh, 0.08), steel, s * (dw / 4 - 0.04), 0, 0, false));
    leaf.add(mesh(box(dw / 2 - 0.1, 0.05, 0.05), toon(SW.red), 0, 0.05, -0.07, false));
    leaf.position.set(DX + (s * dw) / 4, G + dh / 2, dz);
    root.add(leaf);
    return { leaf, s };
  });
  // A steel grate in front of them.
  root.add(mesh(new THREE.PlaneGeometry(4, 1.4).rotateX(-Math.PI / 2), toon('#3b3b40'), DX, G + 0.015, FRONT - 0.8, false));

  // ---- The marquee over the doors: a steel canopy, chaser bulbs, the letter board ---------------
  const board = document.createElement('canvas');
  board.width = 1536;
  board.height = 116;
  const boardTex = new THREE.CanvasTexture(board);
  boardTex.colorSpace = THREE.SRGBColorSpace;
  boardTex.anisotropy = 4;
  const redraw = () => {
    drawLetterBoard(board.getContext('2d')!, board.width, board.height, billLines().slice(0, 2));
    boardTex.needsUpdate = true;
  };
  redraw();
  onVenueBill(redraw);
  const boardMat = new THREE.MeshToonMaterial({ map: boardTex, gradientMap, emissive: new THREE.Color('#ffffff'), emissiveMap: boardTex });
  night.bulbs.push({ mat: boardMat, day: 0.35 });
  const chaseA = toonUnique('#ffe9b0');
  const chaseB = toonUnique('#ffe9b0');
  for (const m of [chaseA, chaseB]) m.emissive.set('#ffd27a');
  const sense = toonUnique('#000000');
  night.bulbs.push({ mat: sense, day: 0 });
  {
    const mz = FRONT - MARQ.out / 2;
    const top = MARQ.y + MARQ.h;
    parts.add(mesh(box(MARQ.w, MARQ.h + 0.1, MARQ.out), toon('#1c1c22'), DX, G + MARQ.y + MARQ.h / 2, mz));
    // The board on its three faces.
    const front = mesh(new THREE.PlaneGeometry(MARQ.w - 0.4, MARQ.h - 0.3).rotateY(Math.PI), boardMat, DX, G + MARQ.y + MARQ.h / 2, FRONT - MARQ.out - 0.06, false);
    root.add(front);
    for (const s of [-1, 1]) {
      const sideTex = canvasTexture(256, 96, (g) => {
        g.fillStyle = '#f6f1e4';
        g.fillRect(0, 0, 256, 96);
        g.fillStyle = '#c4121f';
        g.font = `64px ${BOLD}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('SCHALLWERK', 128, 52, 240);
      });
      const sm = new THREE.MeshToonMaterial({ map: sideTex, gradientMap, emissive: new THREE.Color('#ffffff'), emissiveMap: sideTex });
      night.bulbs.push({ mat: sm, day: 0.35 });
      const side = mesh(new THREE.PlaneGeometry(MARQ.out - 0.4, MARQ.h - 0.3), sm, DX + s * (MARQ.w / 2 + 0.06), G + MARQ.y + MARQ.h / 2, mz, false);
      side.rotation.y = (s * Math.PI) / 2;
      root.add(side);
    }
    // Chaser bulbs along the top and bottom of the front and round the underside.
    const bulbGeo = new THREE.SphereGeometry(0.07, 8, 6);
    const chasers = [new THREE.Group(), new THREE.Group()];
    let n = 0;
    for (let x = -MARQ.w / 2 + 0.25; x <= MARQ.w / 2 - 0.2; x += 0.42) {
      for (const y of [MARQ.y + 0.06, top - 0.02]) chasers[n % 2].add(mesh(bulbGeo, n % 2 ? chaseB : chaseA, DX + x, G + y, FRONT - MARQ.out - 0.1, false));
      n++;
    }
    for (let z = FRONT - MARQ.out + 0.3; z < FRONT - 0.2; z += 0.42) {
      for (const s of [-1, 1]) chasers[n % 2].add(mesh(bulbGeo, n % 2 ? chaseB : chaseA, DX + s * (MARQ.w / 2 + 0.1), G + top - 0.02, z, false));
      n++;
    }
    root.add(mergeByMaterial(chasers[0]), mergeByMaterial(chasers[1]));
    // Downlights in the underside, their pools on the pavement at night.
    const down = bulb(night, '#fff1d0', 0.4);
    for (const x of [-4.5, -1.5, 1.5, 4.5]) root.add(mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.03, 12), down, DX + x, G + MARQ.y - 0.03, FRONT - MARQ.out / 2, false));
    for (const x of [-3, 0, 3]) night.halos.push({ at: new THREE.Vector3(DX + x, G + MARQ.y - 0.2, FRONT - 1.3), size: 3.2, color: '#ffe0b0', ground: true });
    // Tie rods up to the wall.
    for (const s of [-1, -0.33, 0.33, 1]) {
      // From the canopy's front edge up to an anchor plate on the wall.
      const from = new THREE.Vector3(DX + s * (MARQ.w / 2 - 0.6), G + top, FRONT - MARQ.out + 0.25);
      const to = new THREE.Vector3(from.x, G + top + 2.1, FRONT - 0.02);
      const rod = mesh(new THREE.CylinderGeometry(0.03, 0.03, from.distanceTo(to), 6), steel, (from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
      rod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
      parts.add(rod);
      parts.add(mesh(box(0.22, 0.22, 0.04), steel, to.x, to.y, FRONT - 0.03));
    }
  }

  // ---- Lit poster cases either side of the entrance -------------------------------------------
  [-1, 1].forEach((side) => {
    for (let k = 0; k < 2; k++) {
      const x = DX + side * (PORTAL.w / 2 + 0.95 + k * 1.75);
      parts.add(mesh(box(1.5, 2.06, 0.14), steel, x, G + 1.95, FRONT - 0.08));
      const tex = posterTexture(side < 0 ? k : 2 + k);
      const m = new THREE.MeshToonMaterial({ map: tex, gradientMap, emissive: new THREE.Color('#ffffff'), emissiveMap: tex });
      night.bulbs.push({ mat: m, day: 0.4 });
      root.add(mesh(new THREE.PlaneGeometry(1.3, 1.84).rotateY(Math.PI), m, x, G + 1.95, FRONT - 0.16, false));
    }
  });

  // ---- Gooseneck lanterns over the front's windows, their light on the brick and the pavement ----
  {
    const lamp = bulb(night, '#ffd89a', 0.1);
    const wallGlow = new THREE.MeshBasicMaterial({ map: softDot(), color: '#ffb36b', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    wallGlow.userData.outlineParameters = { visible: false };
    night.glows.push({ mat: wallGlow, max: 0.8 });
    for (const x of bayXs) {
      if (Math.abs(x - DX) < 5) continue;
      const y = 8.9;
      const arm = mesh(new THREE.TorusGeometry(0.35, 0.03, 6, 12, Math.PI / 2), steel, x, G + y, FRONT - 0.35);
      arm.rotation.y = Math.PI / 2;
      parts.add(arm);
      parts.add(mesh(new THREE.ConeGeometry(0.32, 0.26, 14, 1, true), steel, x, G + y + 0.25, FRONT - 0.7));
      root.add(mesh(new THREE.CircleGeometry(0.26, 14).rotateX(Math.PI / 2), lamp, x, G + y + 0.13, FRONT - 0.7, false));
      const wg = mesh(new THREE.PlaneGeometry(3.2, 4.2).rotateY(Math.PI), wallGlow, x, G + y - 1.6, FRONT - 0.05, false);
      root.add(wg);
      night.halos.push({ at: new THREE.Vector3(x, G + y, FRONT - 0.8), size: 1.1, color: '#ffd8a0' });
    }
  }

  root.add(mergeByMaterial(parts));
  group.add(root);
  const yard = buildYard(group, colliders, night);

  // In the way: the whole building (you go in by the doors, with E).
  colliders.push({ minX: B.minX, maxX: B.maxX, minZ: B.minZ, maxZ: B.maxZ, bottom: G, top: G + H + 3 });
  colliders.push({ minX: CHIMNEY.x - CHIMNEY.r0, maxX: CHIMNEY.x + CHIMNEY.r0, minZ: CHIMNEY.z - CHIMNEY.r0, maxZ: CHIMNEY.z + CHIMNEY.r0, bottom: G, top: G + CHIMNEY.h });
  // The portal's piers stick out a little.
  colliders.push({ minX: DX - PORTAL.w / 2, maxX: DX + PORTAL.w / 2, minZ: FRONT - 0.6, maxZ: FRONT, bottom: G, top: G + PORTAL.h });

  const interactable: Interactable = { kind: 'venue', x: DX, z: FRONT - 1.2, y: G, radius: 2.4 };
  interactables.push(interactable);
  transom.userData.interact = interactable;
  if (recess) recess.userData.interact = interactable;
  for (const { leaf } of leaves) leaf.traverse((o) => (o.userData.interact = interactable));

  const door: Door = {
    x: DX,
    y: G,
    z: FRONT - 0.3,
    open: 0,
    show: (k) => {
      const e = k * k * (3 - 2 * k);
      for (const { leaf, s } of leaves) leaf.position.x = DX + (s * dw) / 4 + s * e * (dw / 2 - 0.1);
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
      // The marquee's bulbs chase each other once it's dark; by day they're only a little lit.
      const lit = sense.emissiveIntensity;
      const on = Math.floor(t * 3) % 2 === 0;
      chaseA.emissiveIntensity = 0.15 + lit * (on ? 1.4 : 0.2);
      chaseB.emissiveIntensity = 0.15 + lit * (on ? 0.2 : 1.4);
      yard.update(t, lit);
    },
  };
}
