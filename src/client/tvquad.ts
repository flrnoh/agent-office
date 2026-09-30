/*
 * The geometry behind a stream on the office TV (flrnoh fork, see FORK.md and client/tv.ts): a
 * site's player can't be drawn into WebGL, so a real iframe is laid over the page, bent with a CSS
 * matrix3d onto where the TV's screen is on it. Kept apart from the DOM, so it can be tested.
 */

export type Pt = readonly [number, number];

/**
 * The CSS `matrix3d(...)` that maps a w×h box (transform-origin at its top-left) onto the quad
 * tl, tr, br, bl on the page: the projective transform (a homography) a flat rectangle seen in
 * perspective is. Null when the quad is degenerate (seen edge-on).
 */
export function quadMatrix(w: number, h: number, [tl, tr, br, bl]: readonly [Pt, Pt, Pt, Pt]): string | null {
  const [x0, y0] = tl;
  const [x1, y1] = tr;
  const [x2, y2] = br;
  const [x3, y3] = bl;
  // Heckbert's square-to-quad: (0,0)→tl, (1,0)→tr, (1,1)→br, (0,1)→bl.
  const dx1 = x1 - x2;
  const dx2 = x3 - x2;
  const dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2;
  const dy2 = y3 - y2;
  const dy3 = y0 - y1 + y2 - y3;
  const det = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(det) < 1e-9 || w <= 0 || h <= 0) return null;
  const g = (dx3 * dy2 - dx2 * dy3) / det;
  const k = (dx1 * dy3 - dx3 * dy1) / det;
  const a = x1 - x0 + g * x1;
  const b = x3 - x0 + k * x3;
  const d = y1 - y0 + g * y1;
  const e = y3 - y0 + k * y3;
  const m = [a / w, d / w, 0, g / w, b / h, e / h, 0, k / h, 0, 0, 1, 0, x0, y0, 0, 1];
  if (!m.every(Number.isFinite)) return null;
  return `matrix3d(${m.map((v) => +v.toFixed(9)).join(',')})`;
}

/** Where a point of the box lands under a quadMatrix's numbers (for tests). */
export function applyQuad(matrix: string, x: number, y: number): Pt {
  const m = matrix.slice('matrix3d('.length, -1).split(',').map(Number);
  const X = m[0] * x + m[4] * y + m[12];
  const Y = m[1] * x + m[5] * y + m[13];
  const W = m[3] * x + m[7] * y + m[15];
  return [X / W, Y / W];
}

export interface Box {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  top: number;
  bottom?: number;
  fence?: boolean;
}

type P3 = { x: number; y: number; z: number };

/** Whether the straight line from `a` to `b` goes through any of the boxes (not fences, which nobody sees). */
export function lineBlocked(boxes: readonly Box[], a: P3, b: P3): boolean {
  const d = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  for (const c of boxes) {
    if (c.fence) continue;
    let t0 = 0;
    let t1 = 1;
    const slabs: [number, number, number, number][] = [
      [a.x, d.x, c.minX, c.maxX],
      [a.y, d.y, c.bottom ?? 0, c.top],
      [a.z, d.z, c.minZ, c.maxZ],
    ];
    let hit = true;
    for (const [o, dir, lo, hi] of slabs) {
      if (Math.abs(dir) < 1e-9) {
        if (o < lo || o > hi) {
          hit = false;
          break;
        }
        continue;
      }
      let ta = (lo - o) / dir;
      let tb = (hi - o) / dir;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta);
      t1 = Math.min(t1, tb);
      if (t0 > t1) {
        hit = false;
        break;
      }
    }
    if (hit) return true;
  }
  return false;
}
