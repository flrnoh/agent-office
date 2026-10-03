import { cutOut } from './gym-basement.js';
import { POOL_DEFAULTS, type PoolDef } from './swim.js';
import { ZONES, type TFixture, type TRect } from './therme.js';

/*
 * The Rutschenwelt (flrnoh fork, see FORK.md "The thermal baths", phase 4): the slide tower, its
 * lift, the seven slides fanning out from its three platforms, the landing pool they all end in, the
 * board with the best times. Pure data and maths (no three.js: the page makes its curves from these
 * points), shared by the page, the office (which times every ride: start and finish are its to
 * clock, a ride faster than the slide allows doesn't count) and the tests.
 */

/** A point on a slide's path: x, y, z. */
export type P3 = readonly [number, number, number];

export const TOWER: TRect = { minX: 165, maxX: 177, minZ: 57, maxZ: 69 };
/** The lift's shaft in the tower's middle: no going in, E at its door goes up or down. */
export const LIFT_CORE: TRect = { minX: 169.5, maxX: 172.5, minZ: 61.5, maxZ: 64.5 };
/** Where you stand at the lift's door, on the ground and on each platform (south of the shaft). */
export const LIFT_DOOR = { x: 171, z: LIFT_CORE.maxZ + 0.9 } as const;
/** The platforms' heights (the ground is 0), and the tower's roof. */
export const LEVELS = [9, 17, 25] as const;
export const TOWER_ROOF = 28.5;
const RAIL = 1.1;

export type SlideId = 'blackhole' | 'turbo' | 'kapsel' | 'looping' | 'reifen' | 'familie' | 'racer';
export type SlideKind = 'tube' | 'open' | 'capsule';

export interface SlideDef {
  id: SlideId;
  name: string;
  emoji: string;
  /** What it's like, for the board and the hint. */
  blurb: string;
  kind: SlideKind;
  /** Which platform it starts from (0, 1, 2: LEVELS). */
  level: 0 | 1 | 2;
  color: string;
  /** Its path, the start (at the platform's edge) first, the end over the landing pool last. */
  path: readonly P3[];
  /** Side by side copies of the path (the racer's lanes), sideways offsets in metres; one lane otherwise. */
  lanes?: readonly number[];
  /** Darkness and coloured lights inside (the black hole). */
  dark?: boolean;
}

/** A helix round (cx, cz) of radius r from angle a0 turning `turns` (+: clockwise seen from above), from y0 down to y1. */
function helix(cx: number, cz: number, r: number, a0: number, turns: number, y0: number, y1: number, n: number): P3[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const k = i / n;
    const a = a0 + turns * Math.PI * 2 * k;
    return [cx + Math.cos(a) * r, y0 + (y1 - y0) * k, cz + Math.sin(a) * r] as const;
  });
}

/** A vertical loop going along +z, centred (cx, cy, cz), radius r, drifting `drift` along x as it goes round (so the track clears itself). */
function loop(cx: number, cy: number, cz: number, r: number, drift: number, n: number): P3[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const th = -Math.PI / 2 + (Math.PI * 2 * i) / n;
    return [cx - drift / 2 + (drift * i) / n, cy + r * Math.sin(th), cz + r * Math.cos(th)] as const;
  });
}

const T = TOWER;
const [L1, L2, L3] = LEVELS;

export const SLIDES: readonly SlideDef[] = [
  {
    id: 'blackhole',
    name: 'Schwarzes Loch',
    emoji: '🕳️',
    blurb: 'Stockdunkle Röhre, Lichtblitze, drei Runden abwärts',
    kind: 'tube',
    level: 2,
    color: '#1d1b2e',
    dark: true,
    path: [[171, L3, T.minZ - 0.3], [171, L3 - 0.4, T.minZ - 3], [175, L3 - 1.0, 50.5], ...helix(171, 41, 7, 0, -1.75, L3 - 1.6, 4, 36), [176, 3.6, 48.6], [181, 3.1, 49.6], [184.5, 2.6, 53], [185, 2.1, 60], [185, 1.5, 70], [185, 1.0, 84], [185, 0.5, 98], [185, 0.15, 106]],
  },
  {
    id: 'turbo',
    name: 'Turbo',
    emoji: '⚡',
    blurb: 'Fast senkrecht: 25 m freier Fall in der Rinne',
    kind: 'open',
    level: 2,
    color: '#e63946',
    path: [[T.minX - 0.3, L3, 67], [163, L3 - 0.6, 68.6], [161.6, L3 - 6, 71.5], [160.6, 12, 76], [160, 5, 82], [159.6, 1.6, 90], [159.3, 0.5, 98], [159, 0.15, 106]],
  },
  {
    id: 'kapsel',
    name: 'Falltür',
    emoji: '🚪',
    blurb: 'In die Kapsel, Countdown, und der Boden ist weg',
    kind: 'capsule',
    level: 2,
    color: '#f4a261',
    path: [[T.maxX + 0.6, L3, 63], [T.maxX + 0.75, L3 - 4, 63.2], [179.5, 14, 64.4], [182.5, 8, 68], [186, 4, 75], [189.5, 1.8, 86], [190.5, 0.6, 97], [190.5, 0.15, 106]],
  },
  {
    id: 'looping',
    name: 'Looping',
    emoji: '🌀',
    blurb: 'Einmal kopfüber durch den Kreis',
    kind: 'tube',
    level: 1,
    color: '#7b2cbf',
    path: [[T.maxX + 0.3, L2, 60], [181, L2 - 0.5, 60], [187, 13, 60.5], [191.8, 8, 63], [193.5, 4.2, 67.5], ...loop(195, 7.4, 71, 3.2, 3, 24).slice(1, -1), [196.6, 4.2, 74.6], [196.8, 2.4, 82], [196.8, 1.1, 92], [196.6, 0.4, 100], [196.4, 0.15, 108]],
  },
  {
    id: 'reifen',
    name: 'Reifenrutsche',
    emoji: '🛟',
    blurb: 'Im Doppelreifen durch weite Kurven',
    kind: 'open',
    level: 1,
    color: '#2a9d8f',
    path: [[T.minX - 0.3, L2, 59.5], [161, L2 - 0.4, 57], [155, 15.4, 52], [149, 13.6, 49.5], [145, 11.8, 53], [144, 9.8, 61], [144.3, 7.8, 70], [145, 5.8, 79], [145.8, 3.8, 88], [146, 2, 96], [146, 0.6, 103], [146, 0.15, 110]],
  },
  {
    id: 'familie',
    name: 'Wellenrutsche',
    emoji: '🌊',
    blurb: 'Breit, sanft, über Wellen: für alle',
    kind: 'open',
    level: 0,
    color: '#48cae4',
    path: [[T.minX - 0.3, L1, 63.5], [162, L1 - 0.3, 63.5], [157, 8, 64.5], [152.5, 7.4, 68], [150.5, 6.2, 75], [151, 5.4, 81], [151.5, 4.0, 87], [151.8, 3.2, 92], [152, 1.6, 98], [152, 0.5, 103], [152, 0.15, 110]],
  },
  {
    id: 'racer',
    name: 'Racer',
    emoji: '🏁',
    blurb: 'Vier Bahnen nebeneinander: wer ist zuerst unten?',
    kind: 'open',
    level: 0,
    color: '#ffd166',
    lanes: [-2.4, -0.8, 0.8, 2.4],
    path: [[171, L1, T.maxZ + 0.3], [171, L1 - 0.5, 71], [171, 6.4, 76], [171, 5.4, 80], [171, 3.2, 86], [171, 2.6, 90], [171, 1.2, 96], [171, 0.4, 101], [171, 0.15, 106]],
  },
];
export const SLIDE_BY_ID = new Map(SLIDES.map((s) => [s.id, s]));

/** How you go down each: lying on your back feet first (the tubes, the Turbo), sitting, in a tyre, on a mat head first (the racer). */
export type RidePose = 'lie' | 'sit' | 'tyre' | 'mat';
export const RIDE_POSE: Record<SlideId, RidePose> = { blackhole: 'lie', turbo: 'lie', kapsel: 'lie', looping: 'lie', reifen: 'tyre', familie: 'sit', racer: 'mat' };
export const isSlideId = (v: unknown): v is SlideId => typeof v === 'string' && SLIDE_BY_ID.has(v as SlideId);

/** A slide's path for one of its lanes (the racer's sideways offset, square to its way down). */
export function lanePath(s: SlideDef, lane = 0): P3[] {
  const off = s.lanes?.[lane] ?? 0;
  if (!off) return [...s.path];
  return s.path.map((p, i) => {
    const a = s.path[Math.max(0, i - 1)];
    const b = s.path[Math.min(s.path.length - 1, i + 1)];
    const dx = b[0] - a[0];
    const dz = b[2] - a[2];
    const len = Math.hypot(dx, dz) || 1;
    return [p[0] + (dz / len) * off, p[1], p[2] - (dx / len) * off] as const;
  });
}

/** How long a path is, point to point (a little short of the curve through them). */
export const pathLength = (path: readonly P3[]) => path.slice(1).reduce((a, p, i) => a + Math.hypot(p[0] - path[i][0], p[1] - path[i][1], p[2] - path[i][2]), 0);

/** The fastest a ride may honestly take (ms): no one goes down any slide faster than 22 m/s on average. */
export const minRideMs = (s: SlideDef) => Math.round((pathLength(s.path) / 22) * 1000);
/** The slowest a ride is still a ride (ms): longer and you got out halfway, or went off for a coffee. */
export const MAX_RIDE_MS = 90_000;
/** How many rides each slide's board keeps. */
export const BOARD_SIZE = 10;

/** The landing pool all of them end in, south of the tower. */
export const LANDING: TRect = { minX: 142, maxX: ZONES.rutschen.maxX - 1.2, minZ: 101, maxZ: ZONES.rutschen.maxZ - 1.5 };
export const LANDING_POOL: PoolDef = { ...POOL_DEFAULTS, id: 'therme-landing', rects: [LANDING], surface: -0.12, floor: -1.7, sink: 1.25, deck: 0, speed: 1.5, fast: 2.3 };

/** The capsule's countdown before its floor drops away (ms). */
export const CAPSULE_COUNTDOWN = 3000;

/** Where the board with the best times stands (on two posts by the landing pool, between the racer and the black hole, read from both sides), and the kiosk in front of it (E: the boards and your ride photo). */
export const SLIDE_BOARD = { x: 179.5, y: 6.2, z: 98.4, w: 9, h: 4.5 } as const;
export const SLIDE_KIOSK = { x: 179.5, z: 95.6 } as const;

/** Where each slide starts: on its platform, just in from the edge, and which way it faces (to stand at its gate). */
export function slideGate(s: SlideDef): { x: number; y: number; z: number; rotY: number } {
  const p = lanePath(s, 0)[0];
  const q = s.path[1];
  const x = Math.min(T.maxX - 0.5, Math.max(T.minX + 0.5, p[0]));
  const z = Math.min(T.maxZ - 0.5, Math.max(T.minZ + 0.5, p[2]));
  return { x: s.lanes ? 171 : x, y: LEVELS[s.level], z, rotY: Math.atan2(q[0] - p[0], q[2] - p[2]) };
}

/** Every solid thing of the Rutschenwelt: the platforms (round the shaft), their railings (open at each slide's start), the tower's legs and shaft, the landing pool's floor, the kiosk. */
export function slideFixtures(): TFixture[] {
  const f: TFixture[] = [];
  for (const [i, y] of LEVELS.entries()) {
    for (const [j, r] of cutOut(T, [LIFT_CORE]).entries()) f.push({ id: `deck-${i}-${j}`, ...r, bottom: y - 0.35, top: y });
    // Railings round the edge, with a gap where each of this level's slides goes off.
    const gaps = SLIDES.filter((s) => s.level === i).flatMap((s) => (s.lanes ?? [0]).map((_, l) => lanePath(s, l)[0]));
    const side = (id: string, axis: 'x' | 'z', at: number, from: number, to: number) => {
      const cut = gaps.filter((g) => Math.abs((axis === 'x' ? g[2] : g[0]) - at) < 1.2).map((g) => (axis === 'x' ? g[0] : g[2])).sort((a, b) => a - b);
      let s = from;
      for (const c of [...cut, Infinity]) {
        const e = Math.min(to, c - 0.7);
        if (e > s + 0.05) f.push(axis === 'x' ? { id: `${id}-${s.toFixed(1)}`, minX: s, maxX: e, minZ: at - 0.05, maxZ: at + 0.05, bottom: y, top: y + RAIL } : { id: `${id}-${s.toFixed(1)}`, minX: at - 0.05, maxX: at + 0.05, minZ: s, maxZ: e, bottom: y, top: y + RAIL });
        s = Math.max(s, c + 0.7);
        if (s >= to) break;
      }
    };
    side(`rail-n-${i}`, 'x', T.minZ, T.minX, T.maxX);
    side(`rail-s-${i}`, 'x', T.maxZ, T.minX, T.maxX);
    side(`rail-w-${i}`, 'z', T.minX, T.minZ, T.maxZ);
    side(`rail-e-${i}`, 'z', T.maxX, T.minZ, T.maxZ);
  }
  for (const [i, [x, z]] of [
    [T.minX, T.minZ],
    [T.maxX, T.minZ],
    [T.minX, T.maxZ],
    [T.maxX, T.maxZ],
  ].entries())
    f.push({ id: `leg-${i}`, minX: x - 0.3, maxX: x + 0.3, minZ: z - 0.3, maxZ: z + 0.3, top: TOWER_ROOF });
  f.push({ id: 'lift-core', ...LIFT_CORE, top: TOWER_ROOF });
  f.push({ id: 'landing-floor', ...LANDING, bottom: LANDING_POOL.floor - 0.3, top: LANDING_POOL.floor });
  f.push(...slideBlockers());
  f.push({ id: 'slide-kiosk', minX: SLIDE_KIOSK.x - 1, maxX: SLIDE_KIOSK.x + 1, minZ: SLIDE_KIOSK.z - 0.6, maxZ: SLIDE_KIOSK.z + 0.6, top: 1.2 });
  for (const s of [-1, 1]) f.push({ id: `board-post-${s}`, minX: SLIDE_BOARD.x + (s * SLIDE_BOARD.w) / 2 - 0.15, maxX: SLIDE_BOARD.x + (s * SLIDE_BOARD.w) / 2 + 0.15, minZ: SLIDE_BOARD.z - 0.15, maxZ: SLIDE_BOARD.z + 0.15, top: SLIDE_BOARD.y + SLIDE_BOARD.h / 2 });
  return f;
}

/** One ride on a slide's board. */
export interface SlideRow {
  name: string;
  ms: number;
  at: number;
}

export type SlideBoards = Partial<Record<SlideId, SlideRow[]>>;

/** "12,34 s" */
export const rideTime = (ms: number) => `${(ms / 1000).toFixed(2).replace('.', ',')} s`;

/** Points along a path every `step` metres (straight between its points: the curve through them strays a little). */
export function samplePath(path: readonly P3[], step: number): P3[] {
  const out: P3[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / step));
    for (let k = 0; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n, a[2] + ((b[2] - a[2]) * k) / n]);
  }
  out.push(path[path.length - 1]);
  return out;
}

/** How wide a slide's trough or tube is (radius), and the racer's lanes. */
export const SLIDE_RADIUS = 0.62;

/** Where the slides run low over the deck (not over the water): blocks in the way there, so nobody walks through a tube. */
export function slideBlockers(): TFixture[] {
  const f: TFixture[] = [];
  for (const s of SLIDES)
    for (let l = 0; l < (s.lanes?.length ?? 1); l++)
      for (const [i, p] of samplePath(lanePath(s, l), 0.9).entries()) {
        if (p[1] - SLIDE_RADIUS > 2.0) continue; // high enough to walk under
        if (p[0] > LANDING.minX && p[0] < LANDING.maxX && p[2] > LANDING.minZ && p[2] < LANDING.maxZ) continue; // over the water
        if (p[0] > T.minX && p[0] < T.maxX && p[2] > T.minZ && p[2] < T.maxZ) continue;
        const r = SLIDE_RADIUS * 0.85;
        f.push({ id: `slide-${s.id}-${l}-${i}`, minX: p[0] - r, maxX: p[0] + r, minZ: p[2] - r, maxZ: p[2] + r, top: p[1] + SLIDE_RADIUS * 0.6 });
      }
  return f;
}
