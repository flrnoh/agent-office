// The lighthouse you can go up (flrnoh fork, see FORK.md "A day at the beach"; world/scenic/lighthouse.ts
// builds it): its measures, heights above the street, distances from its middle (LIGHTHOUSE in
// scenic.ts), and everything about it to stand on or bump into. Here so the world, the minimap and
// the tests (which climb it) agree on them.

import { LIGHTHOUSE, shoreX } from './scenic.js';

export const LIGHT_TOUR = {
  /** The plinth it stands on: its radius, and its top (the floor inside the tower). */
  plinth: 5.2,
  floor: 2.5,
  /** The stone mole out to it: how wide, its deck's height, the steps up from the sand and up onto the plinth, each this deep. */
  mole: { width: 2.4, deck: 1, stairs: 4, upSteps: 6, tread: 0.45 },
  /** The tower: its radius at the foot and at the top, how thick its wall, and how wide its door (radians). */
  r0: 2.6,
  r1: 2.05,
  wall: 0.22,
  door: 0.62,
  /** The lantern room's floor and the gallery round it (above the street), how far out the gallery reaches. */
  top: 20.5,
  gallery: 3.7,
  /** The lantern room: the glass's radius, how high, the door in it (radians), the lamp's height over the floor. */
  lantern: 1.95,
  room: 2.3,
  glassDoor: 0.7,
  lamp: 1.25,
  /**
   * The spiral stair: how many steps, how many a turn, where it starts (radians, 0 toward the land),
   * the column, the treads. Its last half turn comes up through the hatch on the far side from the
   * glass door, so the way out to the gallery is over floor.
   */
  steps: 72,
  perTurn: 15.2,
  startAngle: 0.75,
  column: 0.32,
  /** Where each step's box to stand on is (from the middle), and how big; the lower, wider turns have a second one further out. */
  stairR: 1.08,
  box: 0.6,
  outerR: 1.72,
  /** The first step whose head room is the hatch in the lantern room's floor. */
  hatch: 61,
} as const;


const T = LIGHT_TOUR;
const L = LIGHTHOUSE;

/** Something to stand on or bump into: a box, from `bottom` to `top` (world heights); a fence only keeps people out. */
export interface Solid {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  bottom: number;
  top: number;
  fence?: boolean;
}

/** A point `r` from the tower's middle at angle `a` (0 is toward the land, +x; π/2 is +z). */
export const polar = (r: number, a: number) => ({ x: L.x + r * Math.cos(a), z: L.z + r * Math.sin(a) });

/** The tower's outside radius `y` up from its foot (it narrows as it goes up). */
export const towerR = (y: number) => T.r0 + (T.r1 - T.r0) * (y / (T.top - T.floor));

/** Step `i` of the spiral stair: its angle (polar's) and its top above the street. */
export function stepAt(i: number): { a: number; top: number } {
  return { a: T.startAngle + i * ((Math.PI * 2) / T.perTurn), top: T.floor + (i + 1) * ((T.top - T.floor) / T.steps) };
}

/** Where the mole runs: from the sand (`x0`, its first step) out to the plinth (`x1`), its flat deck between `deckFrom` and `deckTo`. */
export function moleAt() {
  const m = T.mole;
  const x0 = shoreX(L.z) + 3;
  const x1 = L.x + T.plinth - 0.2;
  return { x0, x1, deckFrom: x0 - m.stairs * m.tread, deckTo: x1 + m.upSteps * m.tread };
}

/** Boxes round a ring `r` from the middle, from `y0` to `y1`: what keeps you in (or out), a gap `gap` radians wide toward the land. */
function ring(out: Solid[], r: number, y0: number, y1: number, gap: number, n: number, fence = false) {
  const size = ((Math.PI * 2 * r) / n) * 0.75 + 0.18;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < gap / 2) continue;
    const p = polar(r, a);
    out.push({ minX: p.x - size / 2, maxX: p.x + size / 2, minZ: p.z - size / 2, maxZ: p.z + size / 2, bottom: y0, top: y1, ...(fence ? { fence: true } : {}) });
  }
}

/** The stair's boxes to stand on, a step at a time (tops above the street): one by the column, and on the wider lower turns one out by the wall. */
export function stairBoxes(): { minX: number; maxX: number; minZ: number; maxZ: number; top: number }[] {
  const out: { minX: number; maxX: number; minZ: number; maxZ: number; top: number }[] = [];
  const h = T.box / 2;
  for (let i = 0; i < T.steps; i++) {
    const s = stepAt(i);
    const inner = towerR(s.top - T.floor) - T.wall;
    for (const r of inner - 0.2 > T.outerR + h ? [T.stairR, T.outerR] : [T.stairR]) {
      const q = polar(r, s.a);
      out.push({ minX: q.x - h, maxX: q.x + h, minZ: q.z - h, maxZ: q.z + h, top: s.top });
    }
  }
  return out;
}

/**
 * The lantern room's floor and the gallery, as boxes to stand on: a grid over the round top, run
 * together along x a row at a time, leaving out the hatch over the stair's last turn (or you'd hit
 * your head on the way up).
 */
export function deckCells(): { minX: number; maxX: number; minZ: number; maxZ: number }[] {
  const cell = 0.3;
  const out: { minX: number; maxX: number; minZ: number; maxZ: number }[] = [];
  const hatch = [] as { x: number; z: number }[];
  for (let i = T.hatch; i < T.steps; i++) {
    hatch.push(polar(T.stairR, stepAt(i).a));
    hatch.push(polar((T.stairR + T.lantern) / 2, stepAt(i).a));
  }
  const n = Math.ceil(T.gallery / cell);
  for (let zi = -n; zi < n; zi++) {
    let run: { minX: number; maxX: number } | null = null;
    const z0 = L.z + zi * cell;
    for (let xi = -n; xi <= n; xi++) {
      const x0 = L.x + xi * cell;
      const cx = x0 + cell / 2;
      const cz = z0 + cell / 2;
      const r = Math.hypot(cx - L.x, cz - L.z);
      const open = r > T.gallery - 0.05 || (r > T.column + 0.1 && r < T.lantern - 0.15 && hatch.some((p) => Math.hypot(p.x - cx, p.z - cz) < 0.75));
      if (!open && xi < n) {
        if (run) run.maxX = x0 + cell;
        else run = { minX: x0, maxX: x0 + cell };
        continue;
      }
      if (run) out.push({ ...run, minZ: z0, maxZ: z0 + cell });
      run = null;
    }
  }
  return out;
}

/** Everything about the lighthouse to stand on or bump into, its street at `street`: the mole, the plinth, the tower, the stair, the top. */
export function lighthouseSolids(street: number): Solid[] {
  const G = street;
  const out: Solid[] = [];
  const m = T.mole;
  const { x0, deckFrom, deckTo } = moleAt();
  const zs = { minZ: L.z - m.width / 2, maxZ: L.z + m.width / 2 };
  out.push({ minX: deckTo, maxX: deckFrom, ...zs, bottom: G - 1.2, top: G + m.deck });
  for (let k = 0; k < m.stairs; k++) out.push({ minX: x0 - (k + 1) * m.tread, maxX: x0 - k * m.tread, ...zs, bottom: G - 0.2, top: G + ((k + 1) / (m.stairs + 1)) * m.deck });
  for (let k = 0; k < m.upSteps; k++) out.push({ minX: deckTo - (k + 1) * m.tread, maxX: deckTo - k * m.tread, ...zs, bottom: G - 1.2, top: G + m.deck + ((k + 1) / m.upSteps) * (T.floor - m.deck) });
  // The rope along each side of the mole.
  for (const s of [-1, 1]) {
    const z = L.z + s * (m.width / 2 - 0.15);
    out.push({ minX: deckTo, maxX: deckFrom - 0.4, minZ: z - 0.08, maxZ: z + 0.08, bottom: G + m.deck, top: G + m.deck + 0.7, fence: true });
  }
  // The plinth (two boxes crossed, near enough round), railed but where the mole comes up.
  for (const [hx, hz] of [
    [T.plinth - 0.6, T.plinth * 0.62],
    [T.plinth * 0.62, T.plinth - 0.6],
  ])
    out.push({ minX: L.x - hx, maxX: L.x + hx, minZ: L.z - hz, maxZ: L.z + hz, bottom: G - 1.2, top: G + T.floor });
  ring(out, T.plinth - 0.25, G + T.floor, G + T.floor + 1.05, 0.62, 36, true);
  // The tower's wall, a band at a time, the door at its foot.
  const H = T.top - T.floor;
  for (let k = 0; k < 6; k++) {
    const y0 = (k / 6) * H;
    const y1 = ((k + 1) / 6) * H;
    ring(out, towerR(y0) - T.wall + 0.12, G + T.floor + y0, G + T.floor + y1, k === 0 ? T.door - 0.12 : 0, 28);
  }
  // The stair and its column.
  for (const b of stairBoxes()) out.push({ ...b, bottom: G + b.top - 0.25, top: G + b.top });
  out.push({ minX: L.x - T.column + 0.05, maxX: L.x + T.column - 0.05, minZ: L.z - T.column + 0.05, maxZ: L.z + T.column - 0.05, bottom: G + T.floor, top: G + T.top + 0.85 });
  // The top: the floor (but the hatch), the gallery's railing, the lantern room's glass with its door.
  const deck = G + T.top;
  for (const c of deckCells()) out.push({ ...c, bottom: deck - 0.2, top: deck });
  ring(out, T.gallery - 0.15, deck, deck + 1.05, 0, 40, true);
  ring(out, T.lantern, deck, deck + T.room, T.glassDoor, 26);
  return out;
}
