import * as THREE from 'three';
import { BOOTH2, HALL_DOORS, KINO_SEATS, KT, ROWS1, ROW_RISE, SAAL1, SAAL2, SCREEN1, SCREEN2, rowY } from '../../../shared/kino-plan';
import { canvasTexture } from '../texture';
import { mergeByMaterial } from '../toon';
import { G, HouseLights, carpetTexture, curtainTexture, fit, glowing, plane, slab } from './kit';

// flrnoh fork (see FORK.md "The cinema"): the two halls inside. Saal 1: rows of red seats up the
// tiers (lit steps along the aisles), the big screen in its black frame over a little stage, red
// curtains that open for the film, exit signs over the doors, the projector's beam from the booth at
// the back. Saal 2: cosy, flat, armchairs facing a smaller screen in a gold frame, a starry ceiling,
// the lectern with the remote by the door. Every surface in there is unlit and follows its hall's
// house lights (kit.ts), so the halls go dark when the film starts, whatever the time of day.

export interface Hall {
  lights: HouseLights;
  /** The screen: a plane facing into the hall, whose picture the feature sets. */
  screen: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  /** The plaque under the screen: what's on and its credit. */
  plaque: THREE.CanvasTexture;
  /** How far the curtains are open, 0 shut … 1 open (Saal 1's move; Saal 2's stay open). */
  curtains(open: number): void;
  /** The projector's beam (Saal 1), shown while a film runs. */
  beam: THREE.Mesh | null;
}

const SEAT_RED = '#a4161a';
const SEAT_DARK = '#2a1215';

export function buildSaal1(g: THREE.Group): Hall {
  const L = new HouseLights();
  const x0 = SAAL1.minX + KT / 2;
  const x1 = SAAL1.maxX - KT / 2;
  const z0 = SAAL1.minZ + KT / 2;
  const z1 = SAAL1.maxZ - KT / 2;
  const H = SAAL1.h;
  const still = new THREE.Group();
  const carpet = carpetTexture('#5c0d16', '#8a6d1f', 64);
  carpet.repeat.set(10, 8);
  const floorMat = L.mat('#ffffff', 0.1, carpet);
  const floor = plane(g, floorMat, (x0 + x1) / 2, 0.03, (z0 + z1) / 2, x1 - x0, z1 - z0, 0);
  floor.rotation.x = -Math.PI / 2;
  // The walls' fabric, the ceiling, and a dark band at the foot of the walls.
  const fabric = L.mat('#5a1420', 0.08);
  const dark = L.mat('#140c0e', 0.3);
  slab(still, fabric, x0, x0 + 0.02, 0, H, z0, z1);
  // (The side walls stop at the screen wall's face, the tiers and sconces a centimetre off the walls'
  // backs: nothing in here shares a face's plane with the fabric, or it flickers.)
  slab(still, fabric, x0, x1 - 0.02, 0, H, z0, z0 + 0.02);
  slab(still, fabric, x0, x1 - 0.02, 0, H, z1 - 0.02, z1);
  const ceiling = plane(g, L.mat('#1c1418', 0.4), (x0 + x1) / 2, H, (z0 + z1) / 2, x1 - x0, z1 - z0, 0);
  ceiling.rotation.x = Math.PI / 2;
  // The screen's wall: black round the screen, with the doorways either side.
  const doors = HALL_DOORS.filter((d) => d.hall === 1);
  const cuts = doors.map((d) => [d.z - d.w / 2, d.z + d.w / 2] as const).sort((a, b) => a[0] - b[0]);
  let from = z0;
  for (const [a, b] of [...cuts, [z1, z1] as const]) {
    if (a > from) slab(still, dark, x1 - 0.02, x1, 0, H, from, a);
    if (b < z1) slab(still, dark, x1 - 0.02, x1, 2.5, H, a, b);
    from = b;
  }
  // The tiers: each step a slab of carpet over the one below; lit edges along the aisles.
  const stepMat = L.mat('#4a0b12', 0.1);
  const stepLight = glowing('#ffb347');
  const edge = (k: number) => SCREEN1.x - 5.5 - 1.25 * k;
  for (let k = 1; k <= ROWS1; k++) {
    slab(still, stepMat, x0 + 0.01, edge(k), rowY(k) - ROW_RISE, rowY(k), z0 + 0.01, z1 - 0.01);
    for (const z of [z0 + 1.1, SCREEN1.z, z1 - 1.1]) slab(still, stepLight, edge(k) - 0.02, edge(k) + 0.01, rowY(k) - 0.06, rowY(k) - 0.02, z - 0.35, z + 0.35);
  }
  // The seats: a cushion, a back and armrests, red velvet.
  const red = L.mat(SEAT_RED, 0.1);
  const arm = L.mat(SEAT_DARK, 0.2);
  for (const s of KINO_SEATS) {
    if (s.hall !== 1) continue;
    const bx = s.x - 0.24;
    slab(still, red, bx + 0.05, bx + 0.45, s.y + 0.36, s.y + 0.5, s.z - 0.27, s.z + 0.27);
    slab(still, red, bx, bx + 0.12, s.y + 0.36, s.y + 1.0, s.z - 0.28, s.z + 0.28);
    slab(still, arm, bx + 0.05, bx + 0.3, s.y, s.y + 0.36, s.z - 0.2, s.z + 0.2);
    slab(still, arm, bx + 0.02, bx + 0.45, s.y + 0.58, s.y + 0.64, s.z + 0.3, s.z + 0.36);
  }
  // The stage, and the screen's black frame.
  const wood = L.mat('#3b2418', 0.15);
  slab(still, wood, SCREEN1.x - 0.9, x1, 0, 0.6, SCREEN1.z - SCREEN1.w / 2, SCREEN1.z + SCREEN1.w / 2);
  const sy0 = SCREEN1.y - SCREEN1.h / 2;
  const sy1 = SCREEN1.y + SCREEN1.h / 2;
  slab(still, dark, SCREEN1.x - 0.05, x1, sy0 - 0.25, sy1 + 0.25, SCREEN1.z - SCREEN1.w / 2 - 0.3, SCREEN1.z + SCREEN1.w / 2 + 0.3);
  // Wall lights along the sides, low and warm.
  const sconce = L.mat('#ffcf7a', 0.02);
  for (let x = x0 + 2; x < x1 - 3; x += 3.2) {
    const y = 2.4 + Math.max(0, (SCREEN1.x - 5.5 - x) / 1.25) * ROW_RISE;
    slab(still, sconce, x - 0.2, x + 0.2, y, y + 0.35, z0 + 0.01, z0 + 0.12);
    slab(still, sconce, x - 0.2, x + 0.2, y, y + 0.35, z1 - 0.12, z1 - 0.01);
  }
  g.add(mergeByMaterial(still));

  // The screen itself, and the plaque under it.
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN1.w, SCREEN1.h), glowing('#ffffff'));
  screen.position.set(SCREEN1.x - 0.08, G + SCREEN1.y, SCREEN1.z);
  screen.rotation.y = -Math.PI / 2;
  g.add(screen);
  const plaque = canvasTexture(1024, 64);
  plane(g, glowing('#ffffff', plaque), SCREEN1.x - 0.92, 0.32, SCREEN1.z, 7, 0.44, -Math.PI / 2);

  // The curtains: one either side, gathered to the side as they open, and a pelmet over them.
  const velvet = L.mat('#ffffff', 0.28, curtainTexture('#9b111e'));
  (velvet.map as THREE.Texture).repeat.set(6, 1);
  const halfW = SCREEN1.w / 2 + 0.4;
  const drapes: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(SCREEN1.x - 0.3, G + 0.6, SCREEN1.z + s * (halfW + 0.2));
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(halfW + 0.2, sy1 + 0.5 - 0.6), velvet);
    cloth.rotation.y = -Math.PI / 2;
    cloth.position.set(0, (sy1 + 0.5 - 0.6) / 2, -s * (halfW + 0.2) / 2);
    pivot.add(cloth);
    g.add(pivot);
    drapes.push(pivot);
  }
  slab(g, velvet, SCREEN1.x - 0.5, SCREEN1.x - 0.2, sy1 + 0.4, sy1 + 1.2, SCREEN1.z - halfW - 0.6, SCREEN1.z + halfW + 0.6);

  // Exit signs over the doors.
  const exit = exitSign();
  for (const d of doors) plane(g, glowing('#ffffff', exit), x1 - 0.04, 2.85, d.z, 1.1, 0.36, -Math.PI / 2);

  // The booth's window high in the back wall, and the beam from it to the screen (their backs sunk
  // into the fabric at different depths, so no two share a plane).
  const lensY = rowY(ROWS1) + 3.2;
  slab(g, glowing('#2b3a55'), x0 + 0.01, x0 + 0.03, lensY - 0.5, lensY + 0.5, SCREEN1.z - 0.8, SCREEN1.z + 0.8);
  slab(g, glowing('#fff6e0'), x0 + 0.015, x0 + 0.05, lensY - 0.12, lensY + 0.12, SCREEN1.z - 0.12, SCREEN1.z + 0.12);
  const beam = projectorBeam(new THREE.Vector3(x0 + 0.05, G + lensY, SCREEN1.z), SCREEN1.x - 0.1, G + sy0, G + sy1, SCREEN1.z - SCREEN1.w / 2, SCREEN1.z + SCREEN1.w / 2);
  g.add(beam);

  return {
    lights: L,
    screen: screen as Hall['screen'],
    plaque,
    beam,
    curtains(open) {
      const k = 1 - 0.86 * Math.max(0, Math.min(1, open));
      for (const d of drapes) d.scale.z = k;
    },
  };
}

export function buildSaal2(g: THREE.Group): Hall {
  const L = new HouseLights();
  const x0 = SAAL2.minX + KT / 2;
  const x1 = SAAL2.maxX - KT / 2;
  const z0 = SAAL2.minZ + KT / 2;
  const z1 = SAAL2.maxZ - KT / 2;
  const H = SAAL2.h;
  const still = new THREE.Group();
  const carpet = carpetTexture('#1d2a4d', '#c9a227', 64);
  carpet.repeat.set(8, 6);
  const floor = plane(g, L.mat('#ffffff', 0.15, carpet), (x0 + x1) / 2, 0.03, (z0 + z1) / 2, x1 - x0, z1 - z0, 0);
  floor.rotation.x = -Math.PI / 2;
  const stars = canvasTexture(512, 512, (c) => {
    c.fillStyle = '#0b1026';
    c.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 160; i++) {
      c.fillStyle = i % 7 ? '#fff6d6' : '#9ad1ff';
      c.fillRect((i * 97) % 512, (i * 193 + (i >> 3) * 31) % 512, 2 + (i % 3), 2 + (i % 3));
    }
  });
  const ceiling = plane(g, L.mat('#ffffff', 0.85, stars), (x0 + x1) / 2, H, (z0 + z1) / 2, x1 - x0, z1 - z0, 0);
  ceiling.rotation.x = Math.PI / 2;
  const fabric = L.mat('#22305a', 0.1);
  const door = HALL_DOORS.find((d) => d.hall === 2)!;
  slab(still, fabric, x0, x0 + 0.02, 0, H, z0, z1);
  slab(still, fabric, x0, x1, 0, H, z0, z0 + 0.02);
  slab(still, fabric, x0, x1, 0, H, z1 - 0.02, z1);
  slab(still, fabric, x1 - 0.02, x1, 0, H, z0, door.z - door.w / 2);
  slab(still, fabric, x1 - 0.02, x1, 0, H, door.z + door.w / 2, z1);
  slab(still, fabric, x1 - 0.02, x1, 2.5, H, door.z - door.w / 2, door.z + door.w / 2);
  // Armchairs: deep, round-armed, red.
  const red = L.mat('#b5172b', 0.12);
  const wood = L.mat('#4a2c1d', 0.15);
  for (const s of KINO_SEATS) {
    if (s.hall !== 2) continue;
    slab(still, red, s.x - 0.2, s.x + 0.3, s.y + 0.18, s.y + 0.5, s.z - 0.34, s.z + 0.34);
    slab(still, red, s.x + 0.3, s.x + 0.5, s.y + 0.18, s.y + 1.0, s.z - 0.4, s.z + 0.4);
    for (const side of [-1, 1]) slab(still, red, s.x - 0.2, s.x + 0.5, s.y + 0.18, s.y + 0.7, s.z + side * 0.42 - 0.08, s.z + side * 0.42 + 0.08);
    slab(still, wood, s.x - 0.18, s.x + 0.48, s.y, s.y + 0.18, s.z - 0.4, s.z + 0.4);
  }
  // The screen's gold frame and the side drapes, which stay open; their backs sunk into the wall's
  // fabric at different depths, so no two of them share a plane.
  const gold = L.mat('#c9a227', 0.25);
  const sy0 = SCREEN2.y - SCREEN2.h / 2;
  const sy1 = SCREEN2.y + SCREEN2.h / 2;
  slab(still, L.mat('#0d0d10', 0.4), x0 + 0.01, SCREEN2.x + 0.04, sy0 - 0.2, sy1 + 0.2, SCREEN2.z - SCREEN2.w / 2 - 0.2, SCREEN2.z + SCREEN2.w / 2 + 0.2);
  for (const s of [-1, 1]) slab(still, gold, x0 + 0.015, SCREEN2.x + 0.1, sy0 - 0.3, sy1 + 0.3, SCREEN2.z + s * (SCREEN2.w / 2 + 0.25) - 0.08, SCREEN2.z + s * (SCREEN2.w / 2 + 0.25) + 0.08);
  slab(still, gold, x0 + 0.015, SCREEN2.x + 0.1, sy1 + 0.22, sy1 + 0.38, SCREEN2.z - SCREEN2.w / 2 - 0.33, SCREEN2.z + SCREEN2.w / 2 + 0.33);
  const velvet = L.mat('#ffffff', 0.3, curtainTexture('#7a1020'));
  for (const s of [-1, 1]) slab(g, velvet, x0 + 0.005, x0 + 0.5, 0, H - 0.3, SCREEN2.z + s * (SCREEN2.w / 2 + 0.9) - 0.6, SCREEN2.z + s * (SCREEN2.w / 2 + 0.9) + 0.6);
  // The lectern by the door, with the remote on it.
  slab(still, wood, BOOTH2.x - 0.3, BOOTH2.x + 0.3, 0, 1.0, BOOTH2.z - 0.3, BOOTH2.z + 0.3);
  slab(still, wood, BOOTH2.x - 0.36, BOOTH2.x + 0.36, 1.0, 1.08, BOOTH2.z - 0.36, BOOTH2.z + 0.36);
  slab(g, glowing('#1b1b1b'), BOOTH2.x - 0.06, BOOTH2.x + 0.06, 1.08, 1.12, BOOTH2.z - 0.15, BOOTH2.z + 0.15);
  slab(g, glowing('#e63946'), BOOTH2.x - 0.02, BOOTH2.x + 0.02, 1.12, 1.125, BOOTH2.z - 0.12, BOOTH2.z - 0.08);
  const note = canvasTexture(256, 128, (c) => {
    c.fillStyle = '#c9a227';
    c.fillRect(0, 0, 256, 128);
    c.fillStyle = '#1a0d0d';
    c.textAlign = 'center';
    fit(c, 'SAAL 2', 128, 52, 230, 44);
    fit(c, 'E: dein Film für alle', 128, 104, 230, 28, 800);
  });
  plane(g, glowing('#ffffff', note), BOOTH2.x + 0.31, 0.75, BOOTH2.z, 0.5, 0.25, Math.PI / 2);
  plane(g, glowing('#ffffff', exitSign()), x1 - 0.04, 2.85, door.z, 1.1, 0.36, -Math.PI / 2);
  g.add(mergeByMaterial(still));

  const screen = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN2.w, SCREEN2.h), glowing('#ffffff'));
  screen.position.set(SCREEN2.x + 0.06, G + SCREEN2.y, SCREEN2.z);
  screen.rotation.y = Math.PI / 2;
  g.add(screen);
  const plaque = canvasTexture(1024, 64);
  return { lights: L, screen: screen as Hall['screen'], plaque, beam: null, curtains: () => {} };
}

/** The green running man over a door. */
function exitSign(): THREE.CanvasTexture {
  return canvasTexture(256, 84, (c) => {
    c.fillStyle = '#0a8f3c';
    c.fillRect(0, 0, 256, 84);
    c.fillStyle = '#ffffff';
    c.fillRect(14, 14, 56, 56);
    c.fillStyle = '#0a8f3c';
    c.beginPath();
    c.arc(48, 26, 7, 0, Math.PI * 2);
    c.fill();
    c.fillRect(34, 36, 18, 6);
    c.fillRect(40, 36, 6, 22);
    c.fillRect(30, 56, 12, 6);
    c.fillRect(44, 56, 14, 6);
    c.fillStyle = '#ffffff';
    c.textAlign = 'left';
    fit(c, 'NOTAUSGANG', 82, 56, 166, 30);
  });
}

/** A pyramid of light from the lens to the screen's corners: faint, added on, flickering (see the feature). */
function projectorBeam(lens: THREE.Vector3, x: number, y0: number, y1: number, z0: number, z1: number): THREE.Mesh {
  const corners = [new THREE.Vector3(x, y0, z0), new THREE.Vector3(x, y0, z1), new THREE.Vector3(x, y1, z1), new THREE.Vector3(x, y1, z0)];
  const pos: number[] = [];
  for (let i = 0; i < 4; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % 4];
    pos.push(lens.x, lens.y, lens.z, a.x, a.y, a.z, b.x, b.y, b.z);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const mat = glowing('#fff4d6', null, { additive: true, opacity: 0.02 });
  mat.side = THREE.DoubleSide;
  const m = new THREE.Mesh(geo, mat);
  m.visible = false;
  m.raycast = () => {};
  return m;
}
