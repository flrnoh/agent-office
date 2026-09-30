import * as THREE from 'three';
import { STREET_Y } from '../../../shared/layout';
import { HALL_BOX, HALL_DOOR, HALL_HEIGHT, HALL_ROOF_RISE } from '../../../shared/hall';
import type { Collider, Interactable } from '../office';
import type { NightParts } from '../outside';
import { mergeByMaterial, mesh, toon, toonUnique } from '../toon';
import { box, canvasTexture, glow, FONT } from '../casino/parts';

/*
 * The padel hall's outside, on the street across from the office (flrnoh fork, see FORK.md "The padel
 * hall"): the casino's counterpart to the east. A modern sports hall in pale grey cladding under a
 * curved roof, a big glass front with the warm-lit courts showing through, PADEL in lime LED letters
 * with a racket and a ball, a canopy over glass doors that slide apart, bike racks, benches and a
 * flag. E at the doors takes you inside (client/hall.ts). Built into the street, so it drops with it
 * per floor.
 */

const G = STREET_Y;
const B = HALL_BOX;
const H = HALL_HEIGHT;
const W = B.maxX - B.minX;
const D = B.maxZ - B.minZ;
const CX = (B.minX + B.maxX) / 2;
const CZ = (B.minZ + B.maxZ) / 2;
const DX = HALL_DOOR.x;
/** The front face (north, toward the street). */
const FRONT = B.minZ;
/** The curved roof: an arc of a circle this big, rising HALL_ROOF_RISE from the eaves to the ridge. */
const ARC_R = ((W / 2) ** 2 + HALL_ROOF_RISE ** 2) / (2 * HALL_ROOF_RISE);
const ARC_HALF = Math.asin(W / 2 / ARC_R);
/** How far below the eaves the arc's center is. */
const ARC_DROP = ARC_R - HALL_ROOF_RISE;
/** Up to where the glass front goes. */
const GLASS_TOP = 7.2;
const LIME = '#c6ff3d';

/** A door that slides open as someone comes up (office.ts's Door). */
export interface HallDoor {
  x: number;
  y: number;
  z: number;
  open: number;
  show(open: number): void;
}

export interface HallExterior {
  door: HallDoor;
  /** E here: in you go. */
  interactable: Interactable;
  /** Your floor's street is `y` down (see streetBelow): the doors and their hint go with it. */
  setStreet(y: number): void;
  update(t: number): void;
}

/** Pale cladding panels, standing seams every so often, a darker plinth band at the bottom. */
function claddingTexture(): THREE.CanvasTexture {
  const t = canvasTexture(256, 256, (g) => {
    g.fillStyle = '#e8ebef';
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? 'rgba(120,130,145,0.05)' : 'rgba(255,255,255,0.18)';
      g.fillRect(i * 32, 0, 32, 256);
      g.fillStyle = 'rgba(95,105,120,0.35)';
      g.fillRect(i * 32, 0, 2, 256);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** What you see through the glass front: the warm-lit hall, its light rows, two blue courts and their glass. */
function glimpseTexture(): THREE.CanvasTexture {
  return canvasTexture(1024, 256, (g) => {
    const sky = g.createLinearGradient(0, 0, 0, 256);
    sky.addColorStop(0, '#3a3f4a');
    sky.addColorStop(0.45, '#8c7a62');
    sky.addColorStop(1, '#5a5047');
    g.fillStyle = sky;
    g.fillRect(0, 0, 1024, 256);
    // The light rows under the roof.
    for (let x = 30; x < 1024; x += 64) {
      const b = g.createRadialGradient(x, 34, 0, x, 34, 38);
      b.addColorStop(0, 'rgba(255,244,214,0.95)');
      b.addColorStop(1, 'rgba(255,230,180,0)');
      g.fillStyle = b;
      g.fillRect(x - 40, 0, 80, 80);
      g.fillStyle = '#fff7e2';
      g.fillRect(x - 14, 30, 28, 5);
    }
    // Two courts going away from you: blue, white lines, the glass round them catching the light.
    for (const cx of [300, 724]) {
      g.fillStyle = '#2d6cb5';
      g.beginPath();
      g.moveTo(cx - 190, 256);
      g.lineTo(cx + 190, 256);
      g.lineTo(cx + 120, 150);
      g.lineTo(cx - 120, 150);
      g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.85)';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(cx, 256);
      g.lineTo(cx, 150);
      g.moveTo(cx - 160, 212);
      g.lineTo(cx + 160, 212);
      g.stroke();
      g.strokeStyle = 'rgba(220,240,255,0.55)';
      g.lineWidth = 4;
      g.strokeRect(cx - 120, 105, 240, 45);
      // The net across it.
      g.fillStyle = 'rgba(20,20,20,0.6)';
      g.fillRect(cx - 150, 188, 300, 5);
    }
    // A few people about.
    for (const [x, y, c] of [
      [250, 200, '#e63946'],
      [360, 176, '#ffb703'],
      [690, 204, '#06d6a0'],
      [800, 172, '#8338ec'],
      [512, 214, '#f4a261'],
    ] as const) {
      g.fillStyle = c;
      g.fillRect(x - 5, y - 26, 10, 20);
      g.beginPath();
      g.arc(x, y - 32, 6, 0, Math.PI * 2);
      g.fill();
    }
  });
}

/** The LED sign: a racket and a ball, then PADEL, lime on the dark band over the glass. */
export function padelSign(w = 1024, h = 256, bg: string | null = null): THREE.CanvasTexture {
  return canvasTexture(w, h, (g) => {
    if (bg) {
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
    }
    const glowOn = (blur: number) => {
      g.shadowColor = LIME;
      g.shadowBlur = blur;
    };
    // The racket: a rounded head with holes, a short throat and a handle, leaning a little.
    g.save();
    g.translate(h * 0.62, h * 0.5);
    g.rotate(-0.5);
    g.strokeStyle = LIME;
    g.fillStyle = LIME;
    g.lineWidth = h * 0.06;
    glowOn(h * 0.12);
    g.beginPath();
    g.ellipse(0, -h * 0.1, h * 0.2, h * 0.24, 0, 0, Math.PI * 2);
    g.stroke();
    for (const [x, y] of [
      [-0.07, -0.18],
      [0.07, -0.18],
      [0, -0.1],
      [-0.07, -0.02],
      [0.07, -0.02],
    ])
      g.fillRect(x * h - h * 0.018, y * h - h * 0.018, h * 0.036, h * 0.036);
    g.fillRect(-h * 0.03, h * 0.13, h * 0.06, h * 0.26);
    g.restore();
    // The ball, flying off it.
    glowOn(h * 0.15);
    g.fillStyle = '#f4ff7a';
    g.beginPath();
    g.arc(h * 1.02, h * 0.3, h * 0.1, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(40,60,0,0.55)';
    g.lineWidth = h * 0.015;
    g.beginPath();
    g.arc(h * 0.94, h * 0.3, h * 0.08, -1, 1);
    g.stroke();
    // PADEL.
    g.fillStyle = LIME;
    let px = h * 0.7;
    g.font = `900 ${px}px ${FONT}`;
    const room = w - h * 1.3;
    while (g.measureText('PADEL').width > room * 0.92 && px > 10) g.font = `900 ${(px -= 4)}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const blur of [h * 0.2, h * 0.08]) {
      glowOn(blur);
      g.fillText('PADEL', h * 1.25 + room / 2, h * 0.55);
    }
    g.shadowBlur = 0;
    g.lineWidth = Math.max(2, px * 0.025);
    g.strokeStyle = 'rgba(255,255,255,0.8)';
    g.strokeText('PADEL', h * 1.25 + room / 2, h * 0.55);
  });
}

/** The gable over the front (or the back): the arc of the roof down to the eaves, as a flat shape. */
function gableShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-W / 2, 0);
  for (let i = 0; i <= 24; i++) {
    const a = -ARC_HALF + (i / 24) * ARC_HALF * 2;
    s.lineTo(ARC_R * Math.sin(a), ARC_R * Math.cos(a) - ARC_DROP);
  }
  s.lineTo(W / 2, 0);
  s.closePath();
  return s;
}

/** The curved roof, from eave to eave along the whole building. */
function roofGeometry(length: number): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(ARC_R, ARC_R, length, 40, 1, true, Math.PI - ARC_HALF, ARC_HALF * 2).rotateX(Math.PI / 2);
}

export function buildHallExterior(group: THREE.Group, colliders: Collider[], interactables: Interactable[], night: NightParts): HallExterior {
  const root = new THREE.Group();
  const parts = new THREE.Group();
  const white = toon('#eef1f4');
  const grey = toon('#9aa3ae');
  const dark = toon('#2f3540');
  const steel = toon('#c0c6cf');

  // The block, in cladding, with a plinth and a coping along the eaves.
  const clad = claddingTexture();
  clad.repeat.set(W / 2.2, 2);
  const cladMat = new THREE.MeshToonMaterial({ map: clad, gradientMap: (white as THREE.MeshToonMaterial).gradientMap });
  const cladSide = clad.clone();
  cladSide.repeat.set(D / 2.2, 2);
  cladSide.needsUpdate = true;
  const cladSideMat = new THREE.MeshToonMaterial({ map: cladSide, gradientMap: (white as THREE.MeshToonMaterial).gradientMap });
  const block = new THREE.Mesh(box(W, H, D), [cladSideMat, cladSideMat, white, white, cladMat, cladMat]);
  block.position.set(CX, G + H / 2, CZ);
  block.castShadow = true;
  block.receiveShadow = true;
  root.add(block);
  parts.add(mesh(box(W + 0.2, 0.5, D + 0.2), grey, CX, G + 0.25, CZ));
  for (const z of [FRONT - 0.05, B.maxZ + 0.05]) parts.add(mesh(box(W + 0.4, 0.25, 0.3), dark, CX, G + H + 0.05, z, false));
  for (const x of [B.minX - 0.05, B.maxX + 0.05]) parts.add(mesh(box(0.3, 0.25, D + 0.4), dark, x, G + H + 0.05, CZ, false));

  // The curved roof, standing-seam grey, and the gables under it at either end.
  const roof = mesh(roofGeometry(D + 0.6), new THREE.MeshToonMaterial({ color: '#7d8794', side: THREE.DoubleSide, gradientMap: (white as THREE.MeshToonMaterial).gradientMap }), CX, G + H - ARC_DROP, CZ);
  root.add(roof);
  for (let x = -W / 2 + 2; x < W / 2 - 1; x += 2) {
    const y = Math.sqrt(ARC_R * ARC_R - x * x) - ARC_DROP;
    parts.add(mesh(box(0.06, 0.08, D + 0.6), toon('#6b7480'), CX + x, G + H + y + 0.03, CZ, false));
  }
  const gable = new THREE.ShapeGeometry(gableShape(), 24);
  const gFront = mesh(gable, white, CX, G + H, FRONT - 0.01, false);
  gFront.rotation.y = Math.PI;
  root.add(gFront);
  root.add(mesh(gable, white, CX, G + H, B.maxZ + 0.01, false));
  // A dark band across the front over the glass, for the sign to glow on.
  parts.add(mesh(box(W - 2, 2.9, 0.2), dark, CX, G + H + 0.35, FRONT - 0.12, false));

  // The glass front: the hall inside, warm, behind slim mullions.
  const glassW = W - 2;
  const glimpse = mesh(new THREE.PlaneGeometry(glassW, GLASS_TOP - 0.5), glow(glimpseTexture(), '#d9d4cc'), CX, G + 0.5 + (GLASS_TOP - 0.5) / 2, FRONT - 0.03, false);
  glimpse.rotation.y = Math.PI;
  root.add(glimpse);
  const frame = dark;
  // (none across the doorway, below the transom over the doors)
  const doorHalf = HALL_DOOR.width / 2 + 0.2;
  for (let x = B.minX + 1; x <= B.maxX - 1 + 0.01; x += glassW / 12) {
    if (Math.abs(x - DX) < doorHalf) parts.add(mesh(box(0.12, GLASS_TOP - HALL_DOOR.height - 0.25, 0.16), frame, x, G + (GLASS_TOP + HALL_DOOR.height + 0.25) / 2, FRONT - 0.08, false));
    else parts.add(mesh(box(0.12, GLASS_TOP - 0.5, 0.16), frame, x, G + 0.5 + (GLASS_TOP - 0.5) / 2, FRONT - 0.08, false));
  }
  for (const y of [3.4, 5.4, GLASS_TOP]) parts.add(mesh(box(glassW, 0.12, 0.16), frame, CX, G + y, FRONT - 0.08, false));
  for (const [x0, x1] of [
    [B.minX + 1, DX - doorHalf],
    [DX + doorHalf, B.maxX - 1],
  ]) parts.add(mesh(box(x1 - x0, 0.12, 0.16), frame, (x0 + x1) / 2, G + 0.5, FRONT - 0.08, false));

  // The doorway: a dark steel frame round glass doors, which slide apart.
  const dw = HALL_DOOR.width;
  const dh = HALL_DOOR.height;
  parts.add(mesh(box(dw + 0.4, 0.25, 0.3), frame, DX, G + dh + 0.12, FRONT - 0.15));
  for (const s of [-1, 1]) parts.add(mesh(box(0.2, dh, 0.3), frame, DX + s * (dw / 2 + 0.1), G + dh / 2, FRONT - 0.15));
  const glass = new THREE.MeshToonMaterial({ color: '#a9c7d8', transparent: true, opacity: 0.45, gradientMap: (white as THREE.MeshToonMaterial).gradientMap });
  const leaves = [-1, 1].map((s) => {
    const leaf = new THREE.Group();
    leaf.add(mesh(box(dw / 2 - 0.04, dh - 0.05, 0.05), glass, 0, 0, 0, false));
    leaf.add(mesh(box(0.04, 1.1, 0.06), steel, -s * (dw / 4 - 0.12), 0, -0.05, false));
    leaf.position.set(DX + (s * dw) / 4, G + dh / 2, FRONT - 0.2);
    root.add(leaf);
    return { leaf, s };
  });

  // The canopy over the doors, with lights set into its underside.
  const canopyD = 2.6;
  parts.add(mesh(box(7, 0.28, canopyD), dark, DX, G + dh + 0.6, FRONT - canopyD / 2));
  const down = bulb(night, '#fff1d6', 0.6);
  for (const x of [-2.4, 0, 2.4]) parts.add(mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.04, 12), down, DX + x, G + dh + 0.45, FRONT - canopyD / 2, false));
  night.halos.push({ at: new THREE.Vector3(DX, G + dh + 0.3, FRONT - canopyD / 2), size: 3, color: '#ffe7b8', ground: true });

  // The sign: the racket, the ball and PADEL, lime on the dark band.
  const signW = 12;
  const signH = 3;
  const sign = mesh(new THREE.PlaneGeometry(signW, signH), glow(padelSign(), '#ffffff', { transparent: true }), DX, G + H + 0.35, FRONT - 0.25, false);
  sign.rotation.y = Math.PI;
  root.add(sign);
  const tag = mesh(new THREE.PlaneGeometry(5.6, 0.7), glow(canvasTexture(512, 64, (g) => {
    g.fillStyle = '#2f3540';
    g.fillRect(0, 0, 512, 64);
    g.fillStyle = '#ffffff';
    g.font = `800 38px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('2 COURTS · CAFÉ ON THE GALLERY', 256, 34);
  })), DX, G + dh + 1.05, FRONT - canopyD - 0.01, false);
  tag.rotation.y = Math.PI;
  root.add(tag);
  night.halos.push({ at: new THREE.Vector3(DX, G + H + 0.3, FRONT - 1.2), size: 9, color: '#b8ff4a', ground: true });

  // Windows high up along both sides: a strip of glass, the hall's lights showing at night.
  const strip = toonUnique('#bcd4e6');
  strip.emissive.set('#ffe9c2');
  night.bulbs.push({ mat: strip, day: 0.05 });
  for (const s of [-1, 1]) {
    for (let z = B.minZ + 3; z < B.maxZ - 2; z += 4.2) parts.add(mesh(box(0.06, 1.6, 3.4), strip, s < 0 ? B.minX - 0.03 : B.maxX + 0.03, G + 6.6, z + 1.7, false));
  }

  // Out front: paving from the sidewalk to the glass, bike racks to the west, benches to the east, a flag.
  const paving = mesh(new THREE.PlaneGeometry(W, FRONT - 33), toon('#d7d3cb'), CX, G + 0.012, (FRONT + 33) / 2, false);
  paving.rotation.x = -Math.PI / 2;
  paving.receiveShadow = true;
  root.add(paving);
  for (let i = 0; i < 5; i++) {
    const x = B.minX + 3 + i * 1.1;
    const hoop = mesh(new THREE.TorusGeometry(0.4, 0.035, 6, 16, Math.PI), steel, x, G + 0.45, FRONT - 1.3);
    hoop.rotation.y = Math.PI / 2;
    parts.add(hoop);
    for (const dz of [-0.4, 0.4]) parts.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.45, 6), steel, x, G + 0.22, FRONT - 1.3 + dz));
  }
  colliders.push({ minX: B.minX + 2.8, maxX: B.minX + 7.6, minZ: FRONT - 1.8, maxZ: FRONT - 0.8, bottom: G, top: G + 0.85, fence: true });
  // A bike, locked to the first one.
  const bike = new THREE.Group();
  const tyre = toon('#1d1f24');
  for (const dz of [-0.52, 0.52]) {
    const wheel = mesh(new THREE.TorusGeometry(0.33, 0.03, 6, 18), tyre, 0, 0.35, dz, false);
    wheel.rotation.y = Math.PI / 2;
    bike.add(wheel);
  }
  const frameMat = toon('#e63946');
  for (const [y, z, len, rot] of [
    [0.55, 0, 0.9, Math.PI / 2],
    [0.45, -0.28, 0.6, 0.6],
    [0.45, 0.25, 0.55, -0.7],
  ] as const) {
    const bar = mesh(new THREE.CylinderGeometry(0.025, 0.025, len, 6), frameMat, 0, y, z, false);
    bar.rotation.x = rot;
    bike.add(bar);
  }
  bike.add(mesh(box(0.08, 0.04, 0.22), tyre, 0, 0.82, 0.2, false));
  bike.add(mesh(box(0.5, 0.03, 0.03), tyre, 0, 0.9, -0.42, false));
  bike.position.set(B.minX + 3.25, G, FRONT - 1.3);
  parts.add(bike);
  // Benches along the glass, facing the street.
  for (const x of [DX + 6, DX + 11]) {
    parts.add(mesh(box(2, 0.08, 0.5), toon('#b07a4a'), x, G + 0.46, FRONT - 0.8));
    parts.add(mesh(box(2, 0.4, 0.06), toon('#b07a4a'), x, G + 0.75, FRONT - 0.55));
    for (const s of [-1, 1]) parts.add(mesh(box(0.08, 0.44, 0.44), steel, x + s * 0.85, G + 0.22, FRONT - 0.8));
    colliders.push({ minX: x - 1, maxX: x + 1, minZ: FRONT - 1.05, maxZ: FRONT - 0.5, bottom: G, top: G + 0.5 });
  }
  // Planters either side of the doors.
  for (const s of [-1, 1]) {
    const x = DX + s * 2.6;
    parts.add(mesh(box(0.8, 0.6, 0.8), dark, x, G + 0.3, FRONT - 0.9));
    parts.add(mesh(new THREE.SphereGeometry(0.5, 10, 8), toon('#3f8f45'), x, G + 0.95, FRONT - 0.9));
    colliders.push({ minX: x - 0.4, maxX: x + 0.4, minZ: FRONT - 1.3, maxZ: FRONT - 0.5, bottom: G, top: G + 1.2 });
  }
  // The flag on its pole at the east corner, lime, with the ball on it.
  const poleX = B.maxX - 1.2;
  const poleZ = FRONT - 1.6;
  parts.add(mesh(new THREE.CylinderGeometry(0.06, 0.08, 9, 8), steel, poleX, G + 4.5, poleZ));
  parts.add(mesh(new THREE.SphereGeometry(0.1, 8, 6), steel, poleX, G + 9.05, poleZ, false));
  colliders.push({ minX: poleX - 0.15, maxX: poleX + 0.15, minZ: poleZ - 0.15, maxZ: poleZ + 0.15, bottom: G, top: G + 9 });
  const flagGeo = new THREE.PlaneGeometry(2.2, 1.3, 10, 1);
  const flagBase = Float32Array.from(flagGeo.attributes.position.array);
  const flag = mesh(flagGeo, new THREE.MeshToonMaterial({ map: padelSign(512, 256, '#2f3540'), side: THREE.DoubleSide, gradientMap: (white as THREE.MeshToonMaterial).gradientMap }), poleX - 1.15, G + 8.2, poleZ, false);
  flag.rotation.y = Math.PI;
  root.add(flag);

  root.add(mergeByMaterial(parts));
  group.add(root);

  // In the way: the whole building (you go in by the doors, with E).
  colliders.push({ minX: B.minX, maxX: B.maxX, minZ: B.minZ - 0.25, maxZ: B.maxZ, bottom: G, top: G + H + HALL_ROOF_RISE + 0.5 });

  const interactable: Interactable = { kind: 'hall', x: DX, z: FRONT - 1.1, y: G, radius: 2.4 };
  interactables.push(interactable);
  glimpse.userData.interact = interactable;
  sign.userData.interact = interactable;
  for (const { leaf } of leaves) leaf.userData.interact = interactable;

  const door: HallDoor = {
    x: DX,
    y: G,
    z: FRONT - 0.2,
    open: 0,
    show: (k) => {
      const e = k * k * (3 - 2 * k);
      for (const { leaf, s } of leaves) leaf.position.x = DX + (s * dw) / 4 + s * e * (dw / 2 - 0.1);
    },
  };

  const pos = flagGeo.attributes.position as THREE.BufferAttribute;
  return {
    door,
    interactable,
    setStreet(y) {
      door.y = y;
      interactable.y = y;
    },
    update(t) {
      // The flag flutters: a wave running out from the pole.
      for (let i = 0; i < pos.count; i++) {
        const x = flagBase[i * 3];
        const k = (x + 1.1) / 2.2; // 0 at the pole (the flag's turned round)
        pos.setZ(i, Math.sin(t * 4 - k * 5) * 0.14 * k);
      }
      pos.needsUpdate = true;
    },
  };
}

/** A bulb that glows `day` much by day and fully at night (outside.ts's, without the import cycle). */
function bulb(night: NightParts, color: string, day: number): THREE.MeshToonMaterial {
  const mat = toonUnique(color);
  mat.emissive.set(color);
  mat.emissiveIntensity = day;
  night.bulbs.push({ mat, day });
  return mat;
}

// ---- Seen from the roof (world/city.ts) ------------------------------------------------------------

/** Whether a lot of the roof's city (centered at x, z, w × d) would stand where the hall does. */
export function onHallLot(x: number, z: number, w: number, d: number): boolean {
  return x + w / 2 > B.minX - 2 && x - w / 2 < B.maxX + 2 && z + d / 2 > B.minZ - 2 && z - d / 2 < B.maxZ + 2;
}

/** The hall as the roof sees it, far below: its block, the curved roof and the sign, on the city's street (y 0). */
export function cityHall(): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(box(W, H, D), toon('#e8ebef'), CX, H / 2, CZ));
  g.add(mesh(roofGeometry(D + 0.6), new THREE.MeshToonMaterial({ color: '#7d8794', side: THREE.DoubleSide }), CX, H - ARC_DROP, CZ));
  const sign = mesh(new THREE.PlaneGeometry(12, 3), glow(padelSign(1024, 256, '#2f3540')), DX, H + 0.35, FRONT - 0.2, false);
  sign.rotation.y = Math.PI;
  g.add(sign);
  // PADEL on the roof too, lime, to be seen from above.
  const top = mesh(new THREE.PlaneGeometry(W * 0.5, W * 0.125), glow(padelSign(1024, 256, '#2f3540')), CX, H + HALL_ROOF_RISE + 0.08, CZ, false);
  top.rotation.x = -Math.PI / 2;
  g.add(top);
  return g;
}

