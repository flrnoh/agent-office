// flrnoh fork (see FORK.md "The minimap"): the map itself, drawn once from the same plans the town,
// the loop and the coast are built from (shared/city.ts, scenic.ts, beach.ts…), onto a canvas the
// minimap and the big map both cut their view out of. North is up (-z), east is right (+x).

import * as BAUMARKT from '../../../shared/baumarkt';
import { CASINO_BOX } from '../../../shared/casino';
import { CHURCH } from '../../../shared/church';
import { BLOCKS, CITY_ROAD, LOTS, PARK_TREES, PERIOD, STREETS, stretchRect } from '../../../shared/city';
import { PAVEMENT } from '../../../shared/garage';
import { GYM_STREET_BOX } from '../../../shared/gym';
import { HALL_BOX } from '../../../shared/hall';
import { JETTY } from '../../../shared/beach';
import { landmarkBox } from '../../../shared/landmarks';
import { GOLF_HOLE, ROAD } from '../../../shared/layout';
import { CREEK, FARM, FOOTHILLS, LAKE, LIGHTHOUSE, LOOP, LOOP_HALF, MOUNTAINS, STREET_END, TUNNEL, shoreX } from '../../../shared/scenic';
import { SHOPS, SHOP_KIND_BY_ID } from '../../../shared/shops';
import { SOCCER_BOX } from '../../../shared/soccer';
import { BOWLING_BOX, BOWLING_DOOR } from '../../../shared/bowling';
import { VENUE_BOX, VENUE_DOOR } from '../../../shared/venue';
import { BEER_GARDEN, DOCK, TOUR_BUS } from '../../../shared/venue-house';
import { CANOPY } from '../../../shared/tankstelle';
import { OFFICE_RECT } from './pois';
import { coasterTrack, poseAt } from '../../../shared/coaster-track'; // fork: DER BRECHER

/** What the map covers, in meters: the town, the loop round it, the coast and the foot of the mountains. */
export const BOUNDS = { minX: -330, maxX: 330, minZ: -340, maxZ: 470 } as const;
/** Pixels to a meter on the drawn map. */
export const PX = 2;

export const COLORS = {
  grass: '#bfdc9c',
  grassDark: '#a9cf86',
  walk: '#e6dfd2',
  road: '#7c7f8c',
  roadLine: '#f4efe4',
  building: '#c9b49a',
  buildingEdge: '#8f7a63',
  park: '#9fd07c',
  tree: '#5f9e4c',
  water: '#8fd0ea',
  waterEdge: '#5bb0d4',
  sand: '#f3e2b3',
  field: '#e9d67e',
  pasture: '#b3d88a',
  mountain: '#b6b8a8',
  mountainEdge: '#9b9d8c',
  office: '#ff8a5b',
  across: '#d7a86e',
  ink: '#2b2d42',
} as const;

type Rect = { minX: number; maxX: number; minZ: number; maxZ: number };

/** The drawn map: a canvas BOUNDS big at PX a meter, and how to get from meters to its pixels. */
export interface Atlas {
  canvas: HTMLCanvasElement;
  /** Meters to the canvas's pixels. */
  px(x: number): number;
  pz(z: number): number;
}

let made: Atlas | null = null;

/** The map, drawn the first time it's wanted (it's the same for everyone and never changes). */
export function atlas(): Atlas {
  if (made) return made;
  const w = Math.round((BOUNDS.maxX - BOUNDS.minX) * PX);
  const hgt = Math.round((BOUNDS.maxZ - BOUNDS.minZ) * PX);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = hgt;
  const g = canvas.getContext('2d')!;
  const px = (x: number) => (x - BOUNDS.minX) * PX;
  const pz = (z: number) => (z - BOUNDS.minZ) * PX;
  draw(g, px, pz);
  made = { canvas, px, pz };
  return made;
}

function draw(g: CanvasRenderingContext2D, px: (x: number) => number, pz: (z: number) => number) {
  const rect = (r: Rect, fill: string, edge?: string, lw = 1) => {
    g.fillStyle = fill;
    g.fillRect(px(r.minX), pz(r.minZ), (r.maxX - r.minX) * PX, (r.maxZ - r.minZ) * PX);
    if (edge) {
      g.strokeStyle = edge;
      g.lineWidth = lw;
      g.strokeRect(px(r.minX) + lw / 2, pz(r.minZ) + lw / 2, (r.maxX - r.minX) * PX - lw, (r.maxZ - r.minZ) * PX - lw);
    }
  };
  const around = (x: number, z: number, hw: number, hd = hw): Rect => ({ minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd });
  const disc = (x: number, z: number, r: number, fill: string) => {
    g.fillStyle = fill;
    g.beginPath();
    g.arc(px(x), pz(z), r * PX, 0, Math.PI * 2);
    g.fill();
  };
  const line = (pts: readonly { x: number; z: number }[], width: number, color: string, dash: number[] = []) => {
    g.strokeStyle = color;
    g.lineWidth = width * PX;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.setLineDash(dash);
    g.beginPath();
    pts.forEach((p, i) => (i ? g.lineTo(px(p.x), pz(p.z)) : g.moveTo(px(p.x), pz(p.z))));
    g.stroke();
    g.setLineDash([]);
  };

  // The ground: grass, darker in the country.
  g.fillStyle = COLORS.grass;
  g.fillRect(0, 0, g.canvas.width, g.canvas.height);

  // The mountains to the south, the foothills before them.
  for (const [x, z, r] of MOUNTAINS) disc(x, z, r, COLORS.mountain);
  for (const [x, z, r] of FOOTHILLS) disc(x, z, r, COLORS.grassDark);
  // The ridge the tunnel goes through.
  rect({ minX: TUNNEL.x1 - 10, maxX: TUNNEL.x0 + 10, minZ: TUNNEL.z - 30, maxZ: TUNNEL.z + 40 }, COLORS.mountainEdge);

  // The sea west of the shore, the sand along it.
  const shore: { x: number; z: number }[] = [];
  for (let z = BOUNDS.minZ; z <= BOUNDS.maxZ; z += 4) shore.push({ x: shoreX(z), z });
  g.fillStyle = COLORS.sand;
  g.beginPath();
  g.moveTo(0, pz(BOUNDS.minZ));
  for (const p of shore) g.lineTo(px(p.x + 26), pz(p.z));
  g.lineTo(0, pz(BOUNDS.maxZ));
  g.fill();
  g.fillStyle = COLORS.water;
  g.beginPath();
  g.moveTo(0, pz(BOUNDS.minZ));
  for (const p of shore) g.lineTo(px(p.x), pz(p.z));
  g.lineTo(0, pz(BOUNDS.maxZ));
  g.fill();
  line(shore, 1, COLORS.waterEdge);
  // The jetty and the lighthouse's point.
  rect({ minX: JETTY.x1, maxX: JETTY.x0, minZ: JETTY.z - JETTY.width / 2, maxZ: JETTY.z + JETTY.width / 2 }, COLORS.buildingEdge);
  disc(LIGHTHOUSE.x, LIGHTHOUSE.z, 9, COLORS.mountain);
  disc(LIGHTHOUSE.x, LIGHTHOUSE.z, 3, '#ffffff');

  // The lake and the creek.
  g.fillStyle = COLORS.water;
  g.beginPath();
  g.ellipse(px(LAKE.x), pz(LAKE.z), LAKE.rx * PX, LAKE.rz * PX, 0, 0, Math.PI * 2);
  g.fill();
  line(
    CREEK.map(([x, z]) => ({ x, z })),
    4,
    COLORS.water,
  );

  // The farm: its fields, the pasture, the barn.
  for (const f of FARM.fields) rect(f, COLORS.field);
  rect(FARM.pasture, COLORS.pasture, COLORS.buildingEdge, 2);
  rect(around(FARM.barn.x, FARM.barn.z, 8, 6), '#c8553d', COLORS.ink, 2);
  disc(FARM.silo.x, FARM.silo.z, 3, '#dcdcdc');

  // The town's blocks: sidewalk round each, then its buildings or its park.
  const half = (PERIOD - CITY_ROAD) / 2;
  for (const b of BLOCKS) {
    if (b.kind === 'across') continue;
    rect(around(b.x, b.z, half), b.kind === 'park' ? COLORS.park : COLORS.walk);
  }
  for (const t of PARK_TREES) disc(t.x, t.z, 1.6 * t.s, COLORS.tree);
  for (const l of LOTS) {
    const inBlock = BLOCKS.some((b) => (b.kind === 'city' || b.kind === 'office') && Math.abs(b.x - l.x) < half && Math.abs(b.z - l.z) < half);
    if (inBlock) rect(around(l.x, l.z, l.w / 2, l.d / 2), COLORS.building, COLORS.buildingEdge, 2);
  }
  // The shops' fronts, in their awnings' colors.
  for (const s of SHOPS) {
    const k = SHOP_KIND_BY_ID.get(s.kind);
    if (k) rect(s.rect, k.awning[0], COLORS.ink, 1);
  }

  // The landmarks on their blocks.
  const tank = landmarkBox('tankstelle');
  rect(tank, COLORS.walk);
  rect(CANOPY, '#e94f37', COLORS.ink, 2);
  const kino = landmarkBox('kino');
  rect(around(kino.x, kino.z, 18, 14), '#5a2a82', COLORS.ink, 2);
  rect(BAUMARKT.LOT, '#b9b4aa');
  rect(BAUMARKT.HALL, '#f08c00', COLORS.ink, 2);
  rect(BAUMARKT.GARDEN, COLORS.park);
  if (CHURCH) for (const s of CHURCH.solids) rect(s, '#efe6d8', COLORS.ink, 2);
  // The bowling centre next to the office: its block, the house (retro teal) and its doors' canopy.
  rect(landmarkBox('bowling'), COLORS.walk);
  rect(BOWLING_BOX, '#2a9d8f', COLORS.ink, 2);
  rect({ minX: BOWLING_DOOR.x - 6, maxX: BOWLING_DOOR.x + 6, minZ: BOWLING_BOX.maxZ - 3, maxZ: BOWLING_BOX.maxZ + 1 }, '#e63946', COLORS.ink, 1);
  // The Schallwerk across the street: the brick hall, its marquee, the beer garden, the tour bus, the dock.
  rect(VENUE_BOX, '#8a3b26', COLORS.ink, 2);
  rect({ minX: VENUE_DOOR.x - 6.5, maxX: VENUE_DOOR.x + 6.5, minZ: VENUE_BOX.minZ - 2.7, maxZ: VENUE_BOX.minZ }, '#ff2d3d', COLORS.ink, 1);
  rect(BEER_GARDEN, '#b9b09e');
  rect(TOUR_BUS, '#1b1c21', COLORS.ink, 1);
  rect(DOCK, '#8b857c', COLORS.ink, 1);

  // The streets: the city's, the office's (and the lots by the garage), and the loop.
  for (const s of STREETS) rect(stretchRect(s), COLORS.road);
  for (const p of PAVEMENT) rect(p, COLORS.road);
  line(LOOP, LOOP_HALF * 2, COLORS.road);
  line(
    [
      { x: -STREET_END, z: (ROAD.minZ + ROAD.maxZ) / 2 },
      { x: STREET_END, z: (ROAD.minZ + ROAD.maxZ) / 2 },
    ],
    0.4,
    COLORS.roadLine,
    [6, 6],
  );
  line(LOOP, 0.4, COLORS.roadLine, [6, 6]);
  // The tunnel's mouth either end.
  rect({ minX: TUNNEL.x1, maxX: TUNNEL.x0, minZ: TUNNEL.z - TUNNEL.width / 2, maxZ: TUNNEL.z + TUNNEL.width / 2 }, '#55576a');

  // Across the street: the golf hole between its buildings, the casino, the halls and the gym.
  rect({ minX: GOLF_HOLE.fairway[0], maxX: GOLF_HOLE.fairway[1], minZ: ROAD.maxZ + 2, maxZ: 66 }, COLORS.park);
  disc(GOLF_HOLE.x, GOLF_HOLE.z, GOLF_HOLE.green, '#7cc35a');
  for (const b of [CASINO_BOX, SOCCER_BOX, HALL_BOX, GYM_STREET_BOX]) rect(b, COLORS.across, COLORS.ink, 2);

  // The office.
  rect(OFFICE_RECT, COLORS.office, COLORS.ink, 3);
  // Fork: DER BRECHER round it (seen from above it's the same however tall the building is), dashed
  // where it runs through the ground floor.
  const track = coasterTrack(1);
  const tube = track.zones.find((z) => z.kind === 'tunnel')!;
  const plan = (from: number, to: number) => Array.from({ length: Math.ceil((to - from) / 1.5) + 1 }, (_, i) => poseAt(track, Math.min(to, from + i * 1.5))).map((p) => ({ x: p.x, z: p.z }));
  for (const [from, to, dash] of [
    [0, tube.from, []],
    [tube.from, tube.to, [4, 3]],
    [tube.to, track.length, []],
  ] as const) {
    line(plan(from, to), 2.4, COLORS.ink, [...dash]);
    line(plan(from, to), 1.3, '#f72585', [...dash]);
  }
}
