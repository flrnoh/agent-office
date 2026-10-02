// The black-light mini golf's nine holes (flrnoh fork, see FORK.md "Black-light mini golf"): each in
// its own frame (shared/minigolf-physics.ts: the tee near (0, 0), up -z to the cup), and where that
// frame stands in the bowling centre (interior coordinates, inside ZONES.minigolf). The page builds
// each hole's felt, rails and obstacles from these; the office and the pages roll the ball over them.

import type { Course, Pipe, Post, Rail, Surface } from './minigolf-physics.js';

type P = readonly [number, number];

/** The look of a hole's felt and paint (client/features/minigolf). */
export type HoleTheme = 'jungle' | 'mill' | 'loop' | 'jump' | 'space' | 'volcano' | 'reef' | 'tower' | 'pinball';

export interface HoleDef {
  /** 1–9. */
  n: number;
  name: string;
  par: number;
  theme: HoleTheme;
  /** A tip on its sign. */
  tip: string;
  /** Where its frame stands in the room: its (0, 0) at (x, z), turned by `rot` (as a three.js rotation.y). */
  at: { x: number; z: number; rot: number };
  tee: { x: number; z: number };
  /** The felt's colour (glowing under the UV). */
  felt: string;
  /** What the rails glow. */
  glow: string;
  course: Course;
}

// ---- Building blocks -------------------------------------------------------------------------------

const rect = (minX: number, maxX: number, minZ: number, maxZ: number): P[] => [
  [minX, maxZ],
  [maxX, maxZ],
  [maxX, minZ],
  [minX, minZ],
];

export const circle = (cx: number, cz: number, r: number, n = 28): P[] => Array.from({ length: n }, (_, i) => [cx + Math.cos((i / n) * Math.PI * 2) * r, cz + Math.sin((i / n) * Math.PI * 2) * r] as const);

const flat = (id: string, poly: P[], y = 0): Surface => ({ id, poly, h: { k: 'flat', y } });

/** A rail's look on the page (the physics doesn't care): a glowing rail, clear glass, or none (something else is drawn there). */
export type RailLook = 'neon' | 'glass' | 'hidden';
export type LookedRail = Rail & { look?: RailLook };

/** Rails along a line through `pts` (round, when `closed`). */
function rails(pts: P[], closed: boolean, y0 = -0.12, y1 = 0.09, o: Partial<LookedRail> = {}): LookedRail[] {
  const out: LookedRail[] = [];
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) out.push({ a: pts[i], b: pts[(i + 1) % pts.length], y0, y1, ...o });
  return out;
}

const rail = (a: P, b: P, y0 = -0.12, y1 = 0.09, o: Partial<LookedRail> = {}): LookedRail => ({ a, b, y0, y1, ...o });

const bounds = (minX: number, maxX: number, minZ: number, maxZ: number) => ({ minX, maxX, minZ, maxZ });

// ---- The holes -----------------------------------------------------------------------------------

/** 1: a classic dog-leg round to the right, a bank in the corner and two bumpers to get past. */
function jungle(): Course {
  const outline: P[] = [
    [-0.5, 0.6],
    [0.5, 0.6],
    [0.5, -4.9],
    [3.6, -4.9],
    [3.6, -6.0],
    [-0.5, -6.0],
  ];
  const posts: Post[] = [
    { x: 1.6, z: -5.2, r: 0.09, y0: -0.1, y1: 0.2, kick: 0.25, e: 0.7, tag: 'bumper' },
    { x: 2.3, z: -5.75, r: 0.09, y0: -0.1, y1: 0.2, kick: 0.25, e: 0.7, tag: 'bumper' },
  ];
  return {
    surfaces: [flat('green', outline)],
    rails: [...rails(outline, true), rail([-0.5, -5.35], [0.15, -6.0], -0.12, 0.09, { e: 0.72, tag: 'wood' })],
    posts,
    cup: { x: 3.05, z: -5.45 },
    pit: -1,
    bounds: bounds(-0.65, 3.75, -6.15, 0.75),
  };
}

/** 2: the windmill: through the door under its sails when they let you, then a green that breaks to the right. */
function mill(): Course {
  const front = -4.0;
  const back = -4.8;
  const door = 0.13;
  return {
    surfaces: [flat('lane', rect(-0.55, 0.55, back, 0.6)), { id: 'break', poly: rect(-0.55, 0.55, -8.0, back), h: { k: 'plane', y: 0, x0: 0, z0: back, gx: -0.06, gz: 0 } }],
    rails: [
      ...rails(rect(-0.55, 0.55, -8.0, 0.6), true, -0.12, 0.1),
      rail([-0.55, front], [-door, front], -0.1, 0.6, { look: 'hidden', tag: 'wood' }),
      rail([door, front], [0.55, front], -0.1, 0.6, { look: 'hidden', tag: 'wood' }),
      rail([-door, front], [-door, back], -0.1, 0.6, { look: 'hidden', tag: 'wood' }),
      rail([door, front], [door, back], -0.1, 0.6, { look: 'hidden', tag: 'wood' }),
      rail([-0.55, back], [-door, back], -0.1, 0.6, { look: 'hidden', tag: 'wood' }),
      rail([door, back], [0.55, back], -0.1, 0.6, { look: 'hidden', tag: 'wood' }),
    ],
    windmill: { x: 0, z: front + 0.075, hub: 0.95, len: 0.99, width: 0.26, period: 8 },
    cup: { x: 0.28, z: -7.05 },
    pit: -1,
    bounds: bounds(-0.9, 0.9, -8.15, 0.75),
  };
}

/** 3: the loop the loop: hard enough to get round, then gently uphill to the cup. */
function loop(): Course {
  return {
    surfaces: [flat('lane', rect(-0.5, 0.5, -5.0, 0.6)), { id: 'hill', poly: rect(-0.5, 0.5, -8.5, -5.0), h: { k: 'plane', y: 0, x0: 0, z0: -5.0, gx: 0, gz: -0.06 } }],
    rails: [...rails(rect(-0.5, 0.5, -8.5, 0.6), true, -0.12, 0.32), rail([-0.5, -2.6], [-0.085, -3.5], -0.12, 0.1, { tag: 'metal' }), rail([0.5, -2.6], [0.085, -3.5], -0.12, 0.1, { tag: 'metal' })],
    loop: { x: 0, z: -3.5, r: 0.33, lat: 0.2, w: 0.065 },
    cup: { x: 0.2, z: -7.3 },
    pit: -1,
    bounds: bounds(-0.65, 0.65, -8.65, 0.75),
  };
}

/** 4: up a ramp and through the air over a glowing gap; short of it, you're in. */
function jump(): Course {
  const lip = -4.0;
  const land = -4.8;
  return {
    surfaces: [
      flat('run', rect(-0.55, 0.55, -3.0, 0.6)),
      { id: 'ramp', poly: rect(-0.55, 0.55, lip, -3.0), h: { k: 'plane', y: 0, x0: 0, z0: -3.0, gx: 0, gz: -0.22 } },
      flat('landing', rect(-0.55, 0.55, -9.0, land)),
    ],
    rails: [
      rail([-0.55, 0.6], [0.55, 0.6]),
      rail([-0.55, 0.6], [-0.55, -3.0]),
      rail([0.55, 0.6], [0.55, -3.0]),
      rail([-0.55, -3.0], [-0.55, land], -0.7, 0.6, { look: 'glass', tag: 'stone' }),
      rail([0.55, -3.0], [0.55, land], -0.7, 0.6, { look: 'glass', tag: 'stone' }),
      rail([-0.55, land], [-0.55, -9.0]),
      rail([0.55, land], [0.55, -9.0]),
      rail([-0.55, -9.0], [0.55, -9.0], -0.12, 0.12, { tag: 'rubber', e: 0.5 }),
    ],
    cup: { x: -0.12, z: -7.3 },
    pit: -0.35,
    bounds: bounds(-0.7, 0.7, -9.15, 0.75),
  };
}

/** Where the planet sits on hole 5, how big it is at the felt, and its three mouths along its front. */
export const PLANET = { x: 0, z: -3.75, r: 1.05, mouths: [-0.45, 0, 0.45], mouth: 0.1 } as const;

/** 5: a glowing planet with three tunnels through it: only one comes out near the cup. */
function space(): Course {
  const outline: P[] = [
    [-0.6, 0.6],
    [0.6, 0.6],
    [0.6, -2.2],
    [1.6, -2.2],
    [1.6, -7.5],
    [-1.6, -7.5],
    [-1.6, -2.2],
    [-0.6, -2.2],
  ];
  const { x: px, z: pz, r, mouths, mouth } = PLANET;
  const frontZ = (x: number) => pz + Math.sqrt(r * r - (x - px) ** 2);
  // Round the planet, leaving its mouths open.
  const ring: LookedRail[] = [];
  const n = 48;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    const ax = px + Math.cos(a0) * r;
    const az = pz + Math.sin(a0) * r;
    const bx = px + Math.cos(a1) * r;
    const bz = pz + Math.sin(a1) * r;
    const mx = (ax + bx) / 2;
    if ((az + bz) / 2 > pz && mouths.some((m) => Math.abs(mx - m) < mouth + 0.03)) continue;
    ring.push(rail([ax, az], [bx, bz], -0.1, 0.8, { look: 'hidden', tag: 'stone', w: 0.03 }));
  }
  const gate = (m: number) => ({ a: [m - mouth, frontZ(m)] as P, b: [m + mouth, frontZ(m)] as P, into: Math.PI });
  const pipes: Pipe[] = [
    { mouth: gate(mouths[2]), out: { x: -0.6, z: -4.95, dir: Math.PI }, keep: 0.7, min: 0.7, time: 0.9 },
    { mouth: gate(mouths[1]), out: { x: 0.75, z: -4.95, dir: Math.PI - 0.12 }, keep: 0.7, min: 0.7, time: 0.7 },
    { mouth: gate(mouths[0]), out: { x: -1.35, z: -2.45, dir: 0.5 }, keep: 0.6, min: 0.6, time: 1.1 },
  ];
  return {
    surfaces: [flat('space', outline)],
    rails: [...rails(outline, true), ...ring, rail([-1.6, pz], [-r, pz], -0.1, 0.4, { tag: 'stone' }), rail([r, pz], [1.6, pz], -0.1, 0.4, { tag: 'stone' })],
    pipes,
    cup: { x: -0.6, z: -6.45 },
    pit: -1,
    bounds: bounds(-1.75, 1.75, -7.65, 0.75),
  };
}

/** Where the volcano stands on hole 6, and its profile out from the crater's middle: [r, height]. */
export const VOLCANO = {
  x: 0,
  z: -3.8,
  r: 1.35,
  prof: [
    [0, 0.33],
    [0.1, 0.335],
    [0.32, 0.42],
    [1.35, 0],
  ] as const,
};

/** 6: a volcano to putt up into: too soft and it rolls back, too hard and it's over the rim and down the back. */
function volcano(): Course {
  const outline: P[] = [
    [-0.6, 0.6],
    [0.6, 0.6],
    [0.6, -1.6],
    [1.5, -1.6],
    [1.5, -6.0],
    [-1.5, -6.0],
    [-1.5, -1.6],
    [-0.6, -1.6],
  ];
  return {
    surfaces: [flat('ground', outline), { id: 'volcano', poly: circle(VOLCANO.x, VOLCANO.z, VOLCANO.r, 40), h: { k: 'radial', cx: VOLCANO.x, cz: VOLCANO.z, prof: VOLCANO.prof } }],
    rails: rails(outline, true),
    cup: { x: VOLCANO.x, z: VOLCANO.z },
    pit: -1,
    bounds: bounds(-1.65, 1.65, -6.15, 0.75),
  };
}

/** The bridge on hole 7: how wide, where it spans, and how it slides to and fro. */
export const BRIDGE = { half: 0.18, from: -3.0, to: -4.6, drop: 0.16, slide: { ax: 0.32, az: 0, period: 6 } } as const;

/** 7: a bridge sliding to and fro over a glowing reef: cross while it's there. */
function reef(): Course {
  const { half, from, to, drop, slide } = BRIDGE;
  return {
    surfaces: [
      flat('near', rect(-0.5, 0.5, from, 0.6)),
      { id: 'bridge', poly: rect(-half, half, to, from), h: { k: 'plane', y: 0, x0: 0, z0: from, gx: 0, gz: drop / (from - to) }, slide },
      flat('far', rect(-0.5, 0.5, -8.0, to), -drop),
    ],
    rails: [
      rail([-0.5, 0.6], [0.5, 0.6]),
      rail([-0.5, 0.6], [-0.5, from]),
      rail([0.5, 0.6], [0.5, from]),
      rail([-0.5, to], [-0.5, -8.0], -0.4, -drop + 0.09),
      rail([0.5, to], [0.5, -8.0], -0.4, -drop + 0.09),
      rail([-0.5, -8.0], [0.5, -8.0], -0.4, -drop + 0.09),
      rail([-half, from], [-half, to], -0.25, 0.07, { slide, w: 0.015, tag: 'wood' }),
      rail([half, from], [half, to], -0.25, 0.07, { slide, w: 0.015, tag: 'wood' }),
    ],
    cup: { x: 0.1, z: -7.1 },
    pit: -0.5,
    bounds: bounds(-0.65, 0.65, -8.15, 0.75),
  };
}

/** Hole 8's upper deck: how high, where it ends, and the hole in it down to the lower green. */
export const TOWER = { deck: 0.3, rampFrom: -1.0, rampTo: -2.2, end: -5.6, drop: { x: 0, z: -5.0, r: 0.3 }, lower: { minX: 1.0, maxX: 2.0, minZ: -5.6, maxZ: -0.4, top: 0.25 } } as const;

/** 8: up a ramp to a deck with a hole in it, down a pipe to a lower green, and the cup at its far end. */
function tower(): Course {
  const { deck, rampFrom, rampTo, end, drop, lower } = TOWER;
  const gz = -lower.top / (lower.maxZ - lower.minZ);
  return {
    surfaces: [
      flat('start', rect(-0.5, 0.5, rampFrom, 0.6)),
      { id: 'ramp', poly: rect(-0.5, 0.5, rampTo, rampFrom), h: { k: 'plane', y: 0, x0: 0, z0: rampFrom, gx: 0, gz: -deck / (rampFrom - rampTo) } },
      flat('deck', rect(-0.5, 0.5, end, rampTo), deck),
      {
        id: 'funnel',
        poly: circle(drop.x, drop.z, drop.r, 24),
        h: {
          k: 'radial',
          cx: drop.x,
          cz: drop.z,
          prof: [
            [0, deck - 0.03],
            [drop.r, deck],
          ],
        },
      },
      { id: 'lower', poly: rect(lower.minX, lower.maxX, lower.minZ, lower.maxZ), h: { k: 'plane', y: 0, x0: 0, z0: lower.maxZ, gx: 0, gz } },
    ],
    rails: [...rails(rect(-0.5, 0.5, end, 0.6), true, -0.12, deck + 0.1), ...rails(rect(lower.minX, lower.maxX, lower.minZ, lower.maxZ), true, -0.12, lower.top + 0.1)],
    pipes: [{ hole: { x: drop.x, z: drop.z }, out: { x: 1.5, z: -5.15, dir: 0 }, keep: 0.4, min: 2.05, time: 1.2 }],
    cup: { x: 1.5, z: -1.4 },
    pit: -1,
    bounds: bounds(-0.65, 2.15, -5.75, 0.75),
  };
}

/** Hole 9's pop bumpers. */
export const BUMPERS: readonly Post[] = [
  { x: -0.55, z: -2.9, r: 0.11, y0: -0.1, y1: 0.5, kick: 0.9, e: 0.7, tag: 'bumper' },
  { x: 0.55, z: -2.9, r: 0.11, y0: -0.1, y1: 0.5, kick: 0.9, e: 0.7, tag: 'bumper' },
  { x: 0, z: -3.7, r: 0.11, y0: -0.1, y1: 0.5, kick: 0.9, e: 0.7, tag: 'bumper' },
];

/** 9: a pinball table: a spinner, pop bumpers that kick, slingshots, and the cup up behind them. */
function pinball(): Course {
  const outline: P[] = [
    [-0.4, 0.6],
    [0.4, 0.6],
    [0.4, -0.4],
    [1.4, -1.0],
    [1.4, -5.6],
    [-1.4, -5.6],
    [-1.4, -1.0],
    [-0.4, -0.4],
  ];
  return {
    surfaces: [{ id: 'table', poly: outline, h: { k: 'plane', y: 0, x0: 0, z0: 0.6, gx: 0, gz: -0.035 } }],
    rails: [
      ...rails(outline, true, -0.12, 0.34),
      rail([-1.2, -1.4], [-0.75, -2.0], -0.12, 0.34, { kick: 0.6, tag: 'rubber' }),
      rail([1.2, -1.4], [0.75, -2.0], -0.12, 0.34, { kick: 0.6, tag: 'rubber' }),
      rail([-1.4, -4.6], [-0.8, -5.6], -0.12, 0.34, { kick: 0.3, tag: 'rubber' }),
      rail([1.4, -4.6], [0.8, -5.6], -0.12, 0.34, { kick: 0.3, tag: 'rubber' }),
    ],
    posts: BUMPERS,
    spinners: [{ x: 0, z: -1.7, len: 0.28, y0: -0.1, y1: 0.4, period: 2.5 }],
    cup: { x: 0, z: -4.75 },
    pit: -1,
    bounds: bounds(-1.55, 1.55, -5.75, 0.75),
  };
}

const PI = Math.PI;

/** The course, in the order it's played. */
export const HOLES: readonly HoleDef[] = [
  { n: 1, name: 'Dschungel-Kurve', par: 2, theme: 'jungle', tip: 'Über die Bande in der Ecke', at: { x: -3.85, z: -3.05, rot: 0 }, tee: { x: 0, z: 0 }, felt: '#0b6b3a', glow: '#39ff14', course: jungle() },
  { n: 2, name: 'Windmühle', par: 3, theme: 'mill', tip: 'Warte, bis die Flügel die Tür freigeben', at: { x: 1.8, z: -11.4, rot: PI }, tee: { x: 0, z: 0 }, felt: '#3a1a8c', glow: '#ff2bd6', course: mill() },
  { n: 3, name: 'Looping', par: 2, theme: 'loop', tip: 'Mit Schwung durch die Schleife', at: { x: 4.3, z: -3.05, rot: 0 }, tee: { x: 0, z: 0 }, felt: '#0a4f8f', glow: '#00e5ff', course: loop() },
  { n: 4, name: 'Schanze', par: 3, theme: 'jump', tip: 'Zu langsam? Ab in den Graben', at: { x: 6.65, z: -12.0, rot: PI }, tee: { x: 0, z: 0 }, felt: '#8a1050', glow: '#fffb00', course: jump() },
  { n: 5, name: 'Planet X', par: 2, theme: 'space', tip: 'Nur ein Tunnel führt zum Loch', at: { x: 10.2, z: -3.05, rot: 0 }, tee: { x: 0, z: 0 }, felt: '#1d0f5e', glow: '#b14dff', course: space() },
  { n: 6, name: 'Vulkan', par: 3, theme: 'volcano', tip: 'Genau so fest, dass er im Krater bleibt', at: { x: 14.75, z: -10.0, rot: PI }, tee: { x: 0, z: 0 }, felt: '#5a1208', glow: '#ff6a00', course: volcano() },
  { n: 7, name: 'Wackelbrücke', par: 3, theme: 'reef', tip: 'Los, wenn die Brücke kommt', at: { x: 18.6, z: -3.05, rot: 0 }, tee: { x: 0, z: 0 }, felt: '#04565e', glow: '#00ffb3', course: reef() },
  { n: 8, name: 'Zwei Etagen', par: 3, theme: 'tower', tip: 'Oben ins Loch, unten ins Ziel', at: { x: 19.6, z: -15.0, rot: PI / 2 }, tee: { x: 0, z: 0 }, felt: '#2b2b8f', glow: '#ff3b3b', course: tower() },
  { n: 9, name: 'Flipper', par: 3, theme: 'pinball', tip: 'Die Pilze kicken zurück', at: { x: 12.2, z: -17.0, rot: PI / 2 }, tee: { x: 0, z: 0 }, felt: '#3d0a5c', glow: '#ff9bf0', course: pinball() },
];

export const HOLE_COUNT = HOLES.length;
/** The course's par. */
export const COURSE_PAR = HOLES.reduce((s, h) => s + h.par, 0);

/** A point in hole `h`'s frame, in the room. */
export function toRoom(h: HoleDef, x: number, z: number): { x: number; z: number } {
  const c = Math.cos(h.at.rot);
  const s = Math.sin(h.at.rot);
  return { x: h.at.x + c * x + s * z, z: h.at.z - s * x + c * z };
}

/** A point in the room, in hole `h`'s frame. */
export function toHole(h: HoleDef, x: number, z: number): { x: number; z: number } {
  const c = Math.cos(h.at.rot);
  const s = Math.sin(h.at.rot);
  const dx = x - h.at.x;
  const dz = z - h.at.z;
  return { x: c * dx - s * dz, z: s * dx + c * dz };
}

/** A heading in hole `h`'s frame as a heading in the room, and back. */
export const headingToRoom = (h: HoleDef, a: number) => a + h.at.rot;
export const headingToHole = (h: HoleDef, a: number) => a - h.at.rot;

/** Hole `h`'s footprint in the room (its bounds turned into place). */
export function footprint(h: HoleDef): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const b = h.course.bounds;
  const pts = [toRoom(h, b.minX, b.minZ), toRoom(h, b.maxX, b.minZ), toRoom(h, b.minX, b.maxZ), toRoom(h, b.maxX, b.maxZ)];
  return { minX: Math.min(...pts.map((p) => p.x)), maxX: Math.max(...pts.map((p) => p.x)), minZ: Math.min(...pts.map((p) => p.z)), maxZ: Math.max(...pts.map((p) => p.z)) };
}

/** The hole whose footprint (with `margin`) has (x, z) in the room, if any. */
export function holeAt(x: number, z: number, margin = 0): HoleDef | undefined {
  return HOLES.find((h) => {
    const f = footprint(h);
    return x >= f.minX - margin && x <= f.maxX + margin && z >= f.minZ - margin && z <= f.maxZ + margin;
  });
}
