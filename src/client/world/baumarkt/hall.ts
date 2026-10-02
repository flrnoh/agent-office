import * as THREE from 'three';
import { DOCK, ENTRANCE, HALL, HALL_H, INSIDE, SOLIDS, WALL_T } from '../../../shared/baumarkt';
import { bulb, type NightParts } from '../outside';
import { mergeByMaterial, mesh, toon } from '../toon';
import type { Collider } from '../types';
import { G } from '../town/kit';
import { BLUE, ORANGE, box, indoor, signPlane, slab, writeSign } from './kit';

// flrnoh fork (see FORK.md "The Baumarkt"): the hall itself: orange walls with a blue band round the
// top, a shop front of glass round the sliding doors under a blue canopy, HAMMER & CO in huge letters
// over it (and on the sides), the dock's roller door to the delivery bay, the roof on its trusses and
// rows of lights under it. Inside the floor's polished concrete, the walls a pale grey.

export interface HallParts {
  /** The two leaves of the sliding doors: `open(k)` slides them apart, 0 shut to 1 open. */
  open(k: number): void;
  /** The signs and the canopy's lights, which glow brighter after dark. */
  lit: THREE.MeshBasicMaterial[];
}

/** The front's glass, either side of the doors. */
const GLASS_W = 4.5;
const GLASS_H = 4.2;
const DOOR_H = 3;

export function buildHall(group: THREE.Group, colliders: Collider[], night: NightParts): HallParts {
  const out = new THREE.Group();
  const ins = new THREE.Group();
  const orange = toon(ORANGE);
  const blue = toon(BLUE);
  const lining = indoor('#e6e8ec');
  const floorMat = indoor('#c9ccd1');
  const steel = indoor('#8a929c');
  const t = WALL_T;
  const { minX, maxX, minZ, maxZ } = HALL;
  const ex0 = ENTRANCE.x - ENTRANCE.width / 2;
  const ex1 = ENTRANCE.x + ENTRANCE.width / 2;
  const gx0 = ex0 - GLASS_W;
  const gx1 = ex1 + GLASS_W;
  const dz0 = DOCK.z - DOCK.width / 2;
  const dz1 = DOCK.z + DOCK.width / 2;
  const DOCK_H = 4;

  // ---- Walls: orange outside, the lining inside, the band round the top ----------------------
  /** A run of wall from (x0, z0) to (x1, z1) (along x or z), from y0 to y1 over the floor. */
  const wall = (x0: number, z0: number, x1: number, z1: number, y0 = 0, y1 = HALL_H) => {
    const alongX = z0 === z1;
    const w = alongX ? x1 - x0 : t;
    const d = alongX ? t : z1 - z0;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    out.add(box(w, y1 - y0, d, orange, cx, G + y0, cz));
    // The lining, a hair inside.
    const inX = alongX ? 0 : cx < (minX + maxX) / 2 ? t / 2 + 0.01 : -t / 2 - 0.01;
    const inZ = alongX ? (cz < (minZ + maxZ) / 2 ? t / 2 + 0.01 : -t / 2 - 0.01) : 0;
    ins.add(box(alongX ? w : 0.02, y1 - y0, alongX ? 0.02 : d, lining, cx + inX, G + y0, cz + inZ, false));
  };
  wall(minX, minZ, maxX, minZ);
  wall(maxX, minZ, maxX, maxZ);
  wall(minX, maxZ, gx0, maxZ);
  wall(gx1, maxZ, maxX, maxZ);
  wall(gx0, maxZ, gx1, maxZ, GLASS_H);
  wall(minX, minZ, minX, dz0);
  wall(minX, dz1, minX, maxZ);
  wall(minX, dz0, minX, dz1, DOCK_H);
  // The blue band round the top, a little proud of the wall.
  const BAND = 1.5;
  out.add(slab(minX - 0.08, maxX + 0.08, minZ - 0.08, minZ + 0.1, G + HALL_H - BAND, G + HALL_H + 0.25, blue));
  out.add(slab(minX - 0.08, maxX + 0.08, maxZ - 0.1, maxZ + 0.08, G + HALL_H - BAND, G + HALL_H + 0.25, blue));
  out.add(slab(minX - 0.08, minX + 0.1, minZ, maxZ, G + HALL_H - BAND, G + HALL_H + 0.25, blue));
  out.add(slab(maxX - 0.1, maxX + 0.08, minZ, maxZ, G + HALL_H - BAND, G + HALL_H + 0.25, blue));
  // A plinth of grey round the bottom.
  const plinth = toon('#6b7079');
  out.add(slab(minX - 0.05, maxX + 0.05, minZ - 0.18, minZ - 0.1, G, G + 0.6, plinth));
  out.add(slab(maxX + 0.1, maxX + 0.18, minZ, maxZ, G, G + 0.6, plinth));

  // ---- The roof: flat, over the trusses; lights in rows under it ------------------------------
  const roof = slab(minX - 0.1, maxX + 0.1, minZ - 0.1, maxZ + 0.1, G + HALL_H, G + HALL_H + 0.2, toon('#9aa0a8'), false);
  out.add(roof);
  ins.add(slab(INSIDE.minX, INSIDE.maxX, INSIDE.minZ, INSIDE.maxZ, G + HALL_H - 0.04, G + HALL_H - 0.01, indoor('#d5d9de'), false));
  for (let x = minX + 3; x < maxX - 1; x += 5) ins.add(slab(x - 0.12, x + 0.12, INSIDE.minZ, INSIDE.maxZ, G + HALL_H - 0.75, G + HALL_H - 0.04, steel, false));
  const lamp = bulb(night, '#fff6dc', 0.55);
  const lamps = new THREE.Group();
  for (let x = minX + 5.5; x < maxX - 1; x += 5) for (let z = minZ + 2.5; z < maxZ - 1; z += 4) lamps.add(box(0.5, 0.06, 2.4, lamp, x, G + HALL_H - 0.85, z, false));
  ins.add(lamps);
  // The floor, polished concrete, with a walkway painted along the front.
  ins.add(slab(INSIDE.minX, INSIDE.maxX, INSIDE.minZ, INSIDE.maxZ, G - 0.01, G + 0.012, floorMat, false));
  ins.add(slab(INSIDE.minX, INSIDE.maxX, maxZ - 6.6, maxZ - 6.45, G + 0.012, G + 0.016, indoor('#f6c945'), false));
  ins.add(slab(INSIDE.minX, INSIDE.maxX, minZ + 2.4, minZ + 2.55, G + 0.012, G + 0.016, indoor('#f6c945'), false));

  // ---- The shop front: glass round the doors, the doors, the canopy ---------------------------
  const glass = new THREE.MeshToonMaterial({ color: '#bfe3f2', transparent: true, opacity: 0.35, depthWrite: false });
  const frame = toon('#3d405b');
  for (const [a, b] of [
    [gx0, ex0],
    [ex1, gx1],
  ]) {
    // Its top tucked into the head below (not flush with it).
    out.add(mesh(new THREE.BoxGeometry(b - a, GLASS_H - 0.06, 0.05), glass, (a + b) / 2, G + (GLASS_H - 0.06) / 2, maxZ, false));
    for (let x = a; x <= b + 0.01; x += (b - a) / 3) out.add(box(0.08, GLASS_H, 0.12, frame, x, G, maxZ));
  }
  out.add(slab(gx0, gx1, maxZ - 0.08, maxZ + 0.08, G + GLASS_H - 0.12, G + GLASS_H, frame));
  out.add(slab(ex0, ex1, maxZ - 0.08, maxZ + 0.08, G + DOOR_H, G + DOOR_H + 0.18, frame));
  const leaves: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const leaf = new THREE.Group();
    // The pane a little inside its rails, so their ends and edges don't share its faces.
    leaf.add(mesh(new THREE.BoxGeometry(ENTRANCE.width / 2 - 0.02, DOOR_H - 0.04, 0.04), glass, 0, DOOR_H / 2, 0, false));
    leaf.add(box(ENTRANCE.width / 2, 0.08, 0.06, frame, 0, 0, 0, false), box(ENTRANCE.width / 2, 0.08, 0.06, frame, 0, DOOR_H - 0.08, 0, false));
    leaf.add(box(0.06, DOOR_H, 0.06, frame, (s * ENTRANCE.width) / 4, 0, 0, false));
    leaf.position.set(ENTRANCE.x + (s * ENTRANCE.width) / 4, G, maxZ);
    group.add(leaf);
    leaves.push(leaf);
  }
  // The canopy over the doors on two posts, lights under it.
  const cz1 = maxZ + 3.6;
  out.add(slab(gx0 - 0.5, gx1 + 0.5, maxZ, cz1, G + 3.5, G + 3.8, blue));
  out.add(slab(gx0 - 0.51, gx1 + 0.51, cz1 - 0.05, cz1 + 0.05, G + 3.49, G + 3.95, toon(ORANGE)));
  for (const x of [gx0 - 0.2, gx1 + 0.2]) {
    out.add(box(0.22, 3.5, 0.22, toon('#3d405b'), x, G, cz1 - 0.25));
    colliders.push({ minX: x - 0.15, maxX: x + 0.15, minZ: cz1 - 0.4, maxZ: cz1 - 0.1, bottom: G, top: G + 3.5 });
  }
  const canopyLamp = bulb(night, '#fff1c1', 0.3);
  for (let x = gx0 + 0.5; x < gx1; x += 2.2) out.add(box(0.6, 0.04, 0.6, canopyLamp, x, G + 3.46, maxZ + 1.8, false));
  // Sliding doors' mats, in and out.
  ins.add(slab(ex0, ex1, maxZ - 2.2, maxZ - 0.2, G + 0.012, G + 0.02, indoor('#3d405b'), false));
  out.add(slab(ex0, ex1, maxZ + 0.2, maxZ + 2.2, G + 0.005, G + 0.015, toon('#3d405b'), false));

  // ---- The dock's roller door, rolled up, hazard stripes round it --------------------------------
  out.add(mesh(new THREE.CylinderGeometry(0.35, 0.35, DOCK.width + 0.4, 12).rotateX(Math.PI / 2), toon('#9aa0a8'), minX - 0.25, G + DOCK_H + 0.3, DOCK.z));
  const hazard = toon('#ffd23f');
  const ink = toon('#1d1d1d');
  for (const z of [dz0 - 0.15, dz1 + 0.15])
    for (let k = 0; k < 8; k++) out.add(box(0.1, DOCK_H / 8, 0.32, k % 2 ? ink : hazard, minX - t / 2 - 0.06, G + (k * DOCK_H) / 8, z, false));

  // ---- The signs: HAMMER & CO over the doors, and on the sides ----------------------------------
  const lit: THREE.MeshBasicMaterial[] = [];
  const brand = (w: number, h: number) =>
    signPlane(w, h, 1600, (g, W, H) => {
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, W, H);
      g.fillStyle = ORANGE;
      g.fillRect(0, H * 0.78, W, H * 0.22);
      // The name, and a hammer before it for the logo, the two of them in the middle.
      g.font = `900 ${H * 0.5}px Nunito, ui-rounded, system-ui, sans-serif`;
      const name = Math.min(g.measureText('HAMMER & CO').width, W - H * 1.4);
      const x0 = (W - name - H * 0.85) / 2;
      g.save();
      g.translate(x0 + H * 0.3, H * 0.42);
      g.rotate(-0.6);
      g.fillStyle = '#7a4b2a';
      g.fillRect(-H * 0.04, -H * 0.05, H * 0.08, H * 0.36);
      g.fillStyle = BLUE;
      g.fillRect(-H * 0.16, -H * 0.15, H * 0.32, H * 0.12);
      g.restore();
      g.fillStyle = BLUE;
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillText('HAMMER & CO', x0 + H * 0.85, H * 0.4, name);
      g.font = `900 ${H * 0.16}px Nunito, ui-rounded, system-ui, sans-serif`;
      g.fillStyle = '#ffffff';
      g.textAlign = 'center';
      g.fillText('B A U M A R K T  ·  G A R T E N C E N T E R', W / 2, H * 0.895);
    });
  const front = brand(17, 2.9);
  front.position.set(ENTRANCE.x, G + HALL_H - BAND - 0.85, maxZ + t / 2 + 0.06);
  lit.push(front.material);
  group.add(front);
  const east = brand(14, 2.4);
  east.position.set(maxX + t / 2 + 0.06, G + HALL_H - BAND - 1.1, (minZ + maxZ) / 2);
  east.rotation.y = Math.PI / 2;
  group.add(east);
  const north = brand(14, 2.4);
  north.position.set((minX + maxX) / 2, G + HALL_H - BAND - 1.1, minZ - t / 2 - 0.06);
  north.rotation.y = Math.PI;
  group.add(north);
  lit.push(east.material, north.material);
  // Over the dock: WARENANNAHME.
  const dock = signPlane(4.4, 0.7, 640, (g, W, H) => writeSign(g, W, H, 'WARENANNAHME', { bg: BLUE, fg: '#ffffff' }));
  dock.position.set(minX - t / 2 - 0.06, G + DOCK_H + 1, DOCK.z);
  dock.rotation.y = -Math.PI / 2;
  group.add(dock);
  // The opening hours by the doors.
  const hours = signPlane(1.2, 1.4, 300, (g, W, H) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, W, H);
    g.fillStyle = BLUE;
    g.font = `900 ${H * 0.11}px Nunito, sans-serif`;
    g.textAlign = 'center';
    g.fillText('HAMMER & CO', W / 2, H * 0.16);
    g.font = `700 ${H * 0.075}px Nunito, sans-serif`;
    ['Mo – Fr  7 – 20 Uhr', 'Sa  8 – 20 Uhr', '', 'Für Mitarbeiter:', 'Bitte lächeln!'].forEach((l, i) => g.fillText(l, W / 2, H * (0.36 + i * 0.12)));
  });
  hours.position.set(gx1 + 1.2, G + 1.6, maxZ + t / 2 + 0.03);
  group.add(hours);

  // The walls (but their doors) are in the way, as tall as the hall.
  for (const b of SOLIDS.slice(0, 6)) colliders.push({ ...b, bottom: G, top: G + HALL_H });

  group.add(mergeByMaterial(out));
  group.add(mergeByMaterial(ins));
  return {
    open: (k) => {
      const e = Math.min(1, Math.max(0, k));
      const slide = (ENTRANCE.width / 2 - 0.1) * e;
      leaves[0].position.x = ENTRANCE.x - ENTRANCE.width / 4 - slide;
      leaves[1].position.x = ENTRANCE.x + ENTRANCE.width / 4 + slide;
    },
    lit,
  };
}
