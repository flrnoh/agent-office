import * as THREE from 'three';
import { ENTRANCE, FOYER, HALL_DOORS, KINO, KT, SAAL1 } from '../../../shared/kino-plan';
import { glassPane } from '../office/materials';
import { toon } from '../toon';
import { G, glowing, plane, slab } from './kit';

// flrnoh fork (see FORK.md "The cinema"): the cinema from outside: the tall box of the halls behind,
// the lower foyer in front with its big windows, the glass doors that slide open as you come up to
// them, the poster cases either side, a red carpet out to the sidewalk, and the roofs.

/** The doors that slide open for whoever comes up to them, and how. */
export interface KinoDoor {
  x: number;
  z: number;
  /** 0 shut … 1 open. */
  open: number;
  show(open: number): void;
}

/** Where the poster cases on the front are: each shows a film of the programme (see Kino.setPosters). */
export interface PosterCase {
  mat: THREE.MeshBasicMaterial;
}

/** The hall block's height, the foyer's roof, the raised bit of the front over the entrance. */
const HALLS_H = SAAL1.h + 0.6;
const FRONT_H = FOYER.h + 1;
const CREST_H = FRONT_H + 2.2;
/** The windows either side of the doors: from–to along z, and how high. */
const GLAZE = { z0: ENTRANCE.z - 6, z1: ENTRANCE.z + 6, y0: 0.35, y1: 3.4 } as const;

export function buildShell(g: THREE.Group): { doors: KinoDoor[]; posters: PosterCase[] } {
  const stucco = toon('#e9dcc3');
  const halls = toon('#b9a48a');
  const plinth = toon('#5a2e2a');
  const red = toon('#8d1b1b');
  const brass = toon('#c9a227');
  const roof = toon('#6b6f76');
  const t = KT;

  // The halls' block: tall plain walls with a band near the top, and its flat roof.
  const hx0 = KINO.minX;
  const hx1 = FOYER.minX;
  slab(g, halls, hx0, hx1, 0, HALLS_H, KINO.minZ - t / 2, KINO.minZ + t / 2, true);
  slab(g, halls, hx0, hx1, 0, HALLS_H, KINO.maxZ - t / 2, KINO.maxZ + t / 2, true);
  slab(g, halls, hx0 - t / 2, hx0 + t / 2, 0, HALLS_H, KINO.minZ, KINO.maxZ, true);
  slab(g, halls, hx1 - t / 2, hx1 + t / 2, FOYER.h, HALLS_H, KINO.minZ, KINO.maxZ, true);
  slab(g, roof, hx0, hx1, HALLS_H, HALLS_H + 0.25, KINO.minZ - 0.2, KINO.maxZ + 0.2, true);
  for (const z of [KINO.minZ - t / 2 - 0.03, KINO.maxZ + t / 2 + 0.03]) slab(g, red, hx0, hx1, HALLS_H - 1.1, HALLS_H - 0.7, z - 0.02, z + 0.02);
  slab(g, red, hx0 - t / 2 - 0.05, hx0 - t / 2 - 0.01, HALLS_H - 1.1, HALLS_H - 0.7, KINO.minZ, KINO.maxZ);

  // The foyer: its side walls, and the front with the windows and the doors.
  const fx0 = FOYER.minX;
  const fx1 = FOYER.maxX;
  for (const z of [KINO.minZ, KINO.maxZ]) slab(g, stucco, fx0, fx1, 0, FRONT_H, z - t / 2, z + t / 2, true);
  const ex = fx1;
  const dz0 = ENTRANCE.z - ENTRANCE.w / 2;
  const dz1 = ENTRANCE.z + ENTRANCE.w / 2;
  slab(g, stucco, ex - t / 2, ex + t / 2, 0, FRONT_H, KINO.minZ, GLAZE.z0, true);
  slab(g, stucco, ex - t / 2, ex + t / 2, 0, FRONT_H, GLAZE.z1, KINO.maxZ, true);
  slab(g, stucco, ex - t / 2, ex + t / 2, GLAZE.y1, FRONT_H, GLAZE.z0, GLAZE.z1, true);
  slab(g, plinth, ex - t / 2, ex + t / 2, 0, GLAZE.y0, GLAZE.z0, dz0);
  slab(g, plinth, ex - t / 2, ex + t / 2, 0, GLAZE.y0, dz1, GLAZE.z1);
  // The raised front over the entrance, with its brass trim.
  slab(g, stucco, ex - t / 2, ex + t / 2, FRONT_H, CREST_H, GLAZE.z0 + 1, GLAZE.z1 - 1, true);
  slab(g, brass, ex + t / 2, ex + t / 2 + 0.06, CREST_H - 0.25, CREST_H - 0.1, GLAZE.z0 + 1, GLAZE.z1 - 1);
  // Red pilasters up the front, and a dark plinth along it.
  for (const z of [KINO.minZ + 0.4, GLAZE.z0 - 0.3, GLAZE.z1 + 0.3, KINO.maxZ - 0.4]) slab(g, red, ex + t / 2, ex + t / 2 + 0.12, 0, FRONT_H + 0.1, z - 0.3, z + 0.3, true);
  for (const [z0, z1] of [[KINO.minZ, GLAZE.z0], [GLAZE.z1, KINO.maxZ]]) slab(g, plinth, ex + t / 2, ex + t / 2 + 0.05, 0, 0.6, z0, z1);
  for (const z of [KINO.minZ - t / 2 - 0.02, KINO.maxZ + t / 2 + 0.02]) slab(g, plinth, fx0, fx1, 0, 0.6, z - 0.02, z + 0.02);
  slab(g, roof, fx0, fx1 + 0.2, FRONT_H, FRONT_H + 0.2, KINO.minZ - 0.2, KINO.maxZ + 0.2, true);
  // The windows either side of the doors, mullions between their panes.
  for (const [a, b] of [[GLAZE.z0, dz0 - 0.15], [dz1 + 0.15, GLAZE.z1]]) {
    const n = 3;
    for (let i = 0; i < n; i++) {
      const z0 = a + ((b - a) * i) / n;
      const z1 = a + ((b - a) * (i + 1)) / n;
      const pane = glassPane(z1 - z0 - 0.08, GLAZE.y1 - GLAZE.y0 - 0.1);
      pane.position.set(ex, G + (GLAZE.y0 + GLAZE.y1) / 2, (z0 + z1) / 2);
      pane.rotation.y = Math.PI / 2;
      g.add(pane);
      slab(g, brass, ex - 0.08, ex + 0.08, GLAZE.y0, GLAZE.y1, z1 - 0.04, z1 + 0.04);
    }
    // The sill runs a centimetre into the walls either end (flush, its ends would flicker with the plinth's).
    slab(g, brass, ex - 0.1, ex + 0.1, GLAZE.y0 - 0.05, GLAZE.y0 + 0.03, a - 0.01, b + 0.01);
  }
  // The door frame: brass, with a step-free threshold.
  slab(g, brass, ex - 0.12, ex + 0.12, 3.05, GLAZE.y1, dz0 - 0.15, dz1 + 0.15);
  for (const z of [dz0 - 0.08, dz1 + 0.08]) slab(g, brass, ex - 0.12, ex + 0.12, 0, GLAZE.y1, z - 0.07, z + 0.07);

  // The doors: two glass leaves that slide apart behind the windows.
  const doors: KinoDoor[] = [];
  const leafW = ENTRANCE.w / 2;
  const leaves: { g: THREE.Group; z: number; dir: number }[] = [];
  for (const dir of [-1, 1]) {
    const leaf = new THREE.Group();
    const pane = glassPane(leafW - 0.06, 3 - 0.06);
    pane.rotation.y = Math.PI / 2;
    pane.position.y = 1.5;
    leaf.add(pane);
    leaf.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 3, 0.05), brass).translateZ(-dir * (leafW / 2 - 0.03)).translateY(1.5));
    leaf.add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, leafW), brass).translateY(0.03));
    leaf.add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, leafW), brass).translateY(2.97));
    const z = ENTRANCE.z + dir * (leafW / 2);
    leaf.position.set(ex - 0.2, G, z);
    g.add(leaf);
    leaves.push({ g: leaf, z, dir });
  }
  doors.push({
    x: ex,
    z: ENTRANCE.z,
    open: 0,
    show(open) {
      for (const l of leaves) l.g.position.z = l.z + l.dir * open * (leafW - 0.1);
    },
  });

  // The red carpet from the doors out to the sidewalk, and the forecourt's paving under the canopy (a
  // centimetre into the wall, clear of the plinth's and pilasters' backs).
  slab(g, toon('#3d3f45'), ex + t / 2 - 0.01, KINO.maxX + 6, -0.02, 0.03, ENTRANCE.z - 8, ENTRANCE.z + 8);
  slab(g, toon('#a4161a'), ex - 0.1, KINO.maxX + 6, 0.03, 0.06, ENTRANCE.z - 1.4, ENTRANCE.z + 1.4);
  // Brass posts with red ropes along the carpet.
  for (const s of [-1, 1]) {
    for (let x = ex + 1.2; x < KINO.maxX + 5.5; x += 1.6) slab(g, brass, x - 0.05, x + 0.05, 0, 0.95, ENTRANCE.z + s * 1.7 - 0.05, ENTRANCE.z + s * 1.7 + 0.05);
    slab(g, red, ex + 1.2, KINO.maxX + 5.1, 0.82, 0.88, ENTRANCE.z + s * 1.7 - 0.03, ENTRANCE.z + s * 1.7 + 0.03);
  }

  // Poster cases on the front, two either side of the windows: brass frames, lit from behind.
  const posters: PosterCase[] = [];
  for (const z of [KINO.minZ + 3, KINO.minZ + 6.5, KINO.maxZ - 6.5, KINO.maxZ - 3]) {
    slab(g, brass, ex + t / 2, ex + t / 2 + 0.12, 0.75, 2.95, z - 0.85, z + 0.85);
    const mat = glowing('#ffffff');
    plane(g, mat, ex + t / 2 + 0.13, 1.85, z, 1.45, 2.05, Math.PI / 2);
    posters.push({ mat });
  }

  // Inside the hall doors, the doorways' frames (the doors themselves stand open); the jambs stand a
  // centimetre into the opening, clear of the halls' wall ends.
  for (const d of HALL_DOORS) {
    for (const s of [-1, 1]) slab(g, brass, d.x - t / 2 - 0.05, d.x + t / 2 + 0.05, 0, 2.5, d.z + s * (d.w / 2 - 0.01), d.z + s * (d.w / 2 + 0.1));
    slab(g, brass, d.x - t / 2 - 0.05, d.x + t / 2 + 0.05, 2.45, 2.6, d.z - d.w / 2 - 0.1, d.z + d.w / 2 + 0.1);
  }
  return { doors, posters };
}
