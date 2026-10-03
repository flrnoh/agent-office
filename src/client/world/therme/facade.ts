import * as THREE from 'three';
import { thermeWalls, type TFixture } from '../../../shared/therme';
import { mesh, toon } from '../toon';
import { blk, type ThermeParts } from './kit';

/*
 * The thermal baths' glass fronts (flrnoh fork, see shared/therme.ts): the dome hall's west wall to
 * the sauna garden and its south wall to the lagoon are glass, floor to eaves, on a steel frame, so
 * from the pools you look out at the garden and the lagoon and from outside in at the palms. The
 * walls stay solid in the plan (nobody walks through the glass); only how they look changes here.
 */

/** Which of the plan's walls are glass. */
export const GLASS_WALLS = (id: string) => id.startsWith('dorf-e') || id.startsWith('s-par');

const STEEL = '#e9eef1';
const PLINTH = 0.5;
const BEAM = 0.6;
const BAY = 3;

export function buildFacades(p: ThermeParts) {
  const glass = new THREE.MeshToonMaterial({ color: '#cfeef4', transparent: true, opacity: 0.15, side: THREE.DoubleSide, depthWrite: false, gradientMap: toon('#ffffff').gradientMap });
  glass.userData.outlineParameters = { visible: false };
  const panes: THREE.BufferGeometry[] = [];
  for (const f of thermeWalls().filter((w) => GLASS_WALLS(w.id))) {
    const along = f.maxX - f.minX > f.maxZ - f.minZ;
    const len = along ? f.maxX - f.minX : f.maxZ - f.minZ;
    const from = along ? f.minX : f.minZ;
    const mid = along ? (f.minZ + f.maxZ) / 2 : (f.minX + f.maxX) / 2;
    const bottom = f.bottom ?? 0;
    const top = f.top;
    const at = (s: number, y: number, w: number, h: number, d: number, color: string) => (along ? blk(p, w, h, d, color, s, y, mid) : blk(p, d, h, w, color, mid, y, s));
    if (bottom > 0) {
      // Over a door: the lintel is glass too, a beam under it.
      at(from + len / 2, bottom + 0.15, len, 0.3, 0.3, STEEL);
      pane(panes, along, from, len, mid, bottom + 0.3, top - BEAM);
      at(from + len / 2, top - BEAM / 2, len, BEAM, 0.36, STEEL);
      continue;
    }
    // A stone plinth, the glass over it in bays between steel posts, transoms, a beam at the top.
    at(from + len / 2, PLINTH / 2, len, PLINTH, 0.44, '#cdb995');
    at(from + len / 2, top - BEAM / 2, len, BEAM, 0.36, STEEL);
    for (const y of [4, 8]) if (y < top - BEAM) at(from + len / 2, y, len, 0.1, 0.18, STEEL);
    const bays = Math.max(1, Math.round(len / BAY));
    for (let k = 0; k <= bays; k++) at(from + (len * k) / bays, (top - BEAM + PLINTH) / 2, 0.14, top - BEAM - PLINTH, 0.24, STEEL);
    pane(panes, along, from, len, mid, PLINTH, top - BEAM);
  }
  const g = new THREE.Group();
  for (const geo of panes) {
    const m = mesh(geo, glass, 0, 0, 0, false);
    m.userData.noOutline = true;
    m.renderOrder = 2;
    g.add(m);
  }
  p.group.add(g);
}

/** One sheet of glass along a wall's line, from y0 to y1. */
function pane(out: THREE.BufferGeometry[], along: boolean, from: number, len: number, mid: number, y0: number, y1: number) {
  const geo = new THREE.PlaneGeometry(len, y1 - y0);
  if (!along) geo.rotateY(Math.PI / 2);
  geo.translate(along ? from + len / 2 : mid, (y0 + y1) / 2, along ? mid : from + len / 2);
  out.push(geo);
}

/** Whether shell.ts should leave a wall to others: the glass fronts (here) and the sauna garden's fence (garden.ts). */
export const drawnElsewhere = (f: TFixture) => GLASS_WALLS(f.id) || f.id.startsWith('w-dorf') || f.id.startsWith('s-dorf');

