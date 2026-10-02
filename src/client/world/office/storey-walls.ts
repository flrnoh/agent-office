import * as THREE from 'three';
import type { WallRect } from '../../../shared/decor';
import { EXIT_DOOR, FLOOR, WALL_HEIGHT, WING, type Opening, type Side } from '../../../shared/layout';
import { storeyPlan, type StoreyPlan } from '../../../shared/storey';
import { TUBE_PORTALS } from '../../../shared/coaster'; // flrnoh fork: DER BRECHER's tube
import { mergeByMaterial, mesh, toonUnique } from '../toon';
import type { Collider } from '../types';
import type { Fixture } from './fixture';
import { balconyDoor, buildWalls, wetPane, windowIn, type Door } from './shell';
import { hearThrough } from '../../sound/places';

// flrnoh fork (see FORK.md, "Each storey its own cut"): the office's outside walls a storey at a time.
// Upstream builds them once (world/office/shell.ts's `walls`); here they're built again whenever you
// change floors, since each storey has its balconies somewhere else (shared/storey.ts), so its glass
// doors, and the windows that make way for them, are elsewhere too. And each storey above the bottom
// one has one inside wall painted a color of its own.

/** Accent paint, one material a color, with no cartoon outline (it's a flat wall). */
const ACCENT = new Map<string, THREE.MeshToonMaterial>();
function accentPaint(color: string): THREE.MeshToonMaterial {
  let m = ACCENT.get(color);
  if (!m) {
    m = toonUnique(color);
    m.userData.outlineParameters = { visible: false };
    ACCENT.set(color, m);
  }
  return m;
}

/**
 * The inside of wall `side` painted `color`, round its windows and doors (`holes`): a skin just off the
 * wall, over the baseboard to the ceiling. The north wall's stops where the back office comes through.
 */
export function accentWall(side: Side, color: string, holes: Opening[]): THREE.Group {
  const g = new THREE.Group();
  const mat = accentPaint(color);
  const OFF = 0.006;
  const BASE = 0.25;
  const alongX = side === 'north' || side === 'south';
  const [u0, u1]: number[] = alongX ? [FLOOR.minX, side === 'north' ? WING.minX : FLOOR.maxX] : [FLOOR.minZ, FLOOR.maxZ];
  // Facing into the room.
  const at = { north: [0, FLOOR.minZ + OFF, 0], south: [0, FLOOR.maxZ - OFF, Math.PI], west: [FLOOR.minX + OFF, 0, Math.PI / 2], east: [FLOOR.maxX - OFF, 0, -Math.PI / 2] }[side];
  const piece = (a: number, b: number, y0: number, y1: number) => {
    if (b - a < 0.001 || y1 - y0 < 0.001) return;
    const u = (a + b) / 2;
    const m = mesh(new THREE.PlaneGeometry(b - a, y1 - y0), mat, alongX ? u : at[0], (y0 + y1) / 2, alongX ? at[1] : u, false);
    m.rotation.y = at[2];
    m.receiveShadow = true;
    g.add(m);
  };
  let u = u0;
  for (const o of holes.filter((h) => h.wall === side).sort((a, b) => a.u - b.u)) {
    const h0 = Math.max(u0, o.u - o.width / 2);
    const h1 = Math.min(u1, o.u + o.width / 2);
    if (h1 <= h0) continue;
    piece(u, h0, BASE, WALL_HEIGHT);
    piece(h0, h1, Math.max(BASE, o.y1), WALL_HEIGHT);
    if (o.y0 > BASE) piece(h0, h1, BASE, o.y0);
    u = h1;
  }
  piece(u, u1, BASE, WALL_HEIGHT);
  return g;
}

interface Laid {
  group: THREE.Group;
  colliders: Collider[];
  doors: Door[];
  rects: WallRect[];
}

/** The outside walls, with real windows you see out of, the door out, and the glass doors out to each of this storey's balconies. */
export const storeyWalls: Fixture = (site) => {
  const night = site.get('night');
  let laid: Laid | null = null;
  let shown: StoreyPlan | null = null;

  const takeDown = (l: Laid) => {
    site.group.remove(l.group);
    // The materials are shared (the floor's paint, the toon cache, the wet glass): only the shapes go.
    l.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    for (const c of l.colliders) site.colliders.splice(site.colliders.indexOf(c), 1);
    for (const d of l.doors) site.doors.splice(site.doors.indexOf(d), 1);
    for (const r of l.rects) site.unwall(r);
  };

  const lay = (plan: StoreyPlan) => {
    if (laid) takeDown(laid);
    const l: Laid = { group: new THREE.Group(), colliders: [], doors: [], rects: [] };
    const doors = plan.balconies.map((b) => b.door);
    buildWalls(l.group, l.colliders, [...plan.windows, EXIT_DOOR, ...doors, ...(plan === storeyPlan(0) ? TUBE_PORTALS : [])], site.looks); // TUBE_PORTALS: flrnoh fork, DER BRECHER's tube
    const glazing = new THREE.Group();
    for (const o of plan.windows) {
      glazing.add(windowIn(o));
      l.rects.push(site.wall(o.wall, o.u, (o.y0 + o.y1) / 2 - 0.03, o.width + 0.2, o.y1 - o.y0 + 0.12));
      l.group.add(wetPane(o, night.wetGlass));
    }
    l.group.add(mergeByMaterial(glazing));
    // Out the glass doors: the balconies.
    for (const o of doors) {
      const slider = balconyDoor(o);
      l.group.add(slider.group);
      l.doors.push(slider.door);
      l.rects.push(site.wall(o.wall, o.u, (o.y1 + 0.1) / 2, o.width + 0.2, o.y1 + 0.1));
    }
    hearThrough(plan.windows); // the rain on them
    if (plan.accent) l.group.add(accentWall(plan.accent.wall, plan.accent.color, [...plan.windows, ...doors]));
    site.group.add(l.group);
    site.colliders.push(...l.colliders);
    site.doors.push(...l.doors);
    laid = l;
  };

  return {
    setLevel: (index) => {
      const plan = storeyPlan(index);
      if (plan !== shown) lay((shown = plan));
    },
  };
};
