import type { Piece } from '../../../shared/shop-rooms';
import type { ShopKindId } from '../../../shared/shops';

// flrnoh fork (see FORK.md "Shops to walk into", the boutique and the optician): what's in those two
// shops' windows from the street (shops.ts draws every other window's goods): the boutique's
// mannequins in its colors, the optician's glasses on little stands. Boxes in the shop's frame, like
// the rest of the fronts; up close the inside (features/shops/decor-wear.ts) has the real thing.

type Box = (u0: number, u1: number, v0: number, v1: number, y0: number, y1: number, color: string) => void;

/** Draws the window display `p` of a boutique or an optician with `box`; false for any other kind. */
export function wearWindow(kind: ShopKindId, p: Piece, goods: string[], seed: number, box: Box): boolean {
  const v = (p.v0 + p.v1) / 2;
  if (kind === 'boutique') {
    for (let u = p.u0 + 0.5, i = 0; u < p.u1 - 0.3; u += 0.95, i++) {
      const c = goods[(i + seed) % goods.length];
      const y = p.h;
      box(u - 0.12, u + 0.12, v - 0.08, v + 0.08, y, y + 0.03, '#2b2d42');
      box(u - 0.02, u + 0.02, v - 0.02, v + 0.02, y, y + 0.5, '#2b2d42');
      if ((i + seed) % 3 === 1) box(u - 0.24, u + 0.24, v - 0.14, v + 0.14, y + 0.5, y + 0.86, c);
      else box(u - 0.14, u + 0.14, v - 0.08, v + 0.08, y + 0.3, y + 0.86, '#3d405b');
      box(u - 0.18, u + 0.18, v - 0.11, v + 0.11, y + 0.86, y + 1.3, c);
      box(u - 0.25, u - 0.18, v - 0.05, v + 0.05, y + 0.85, y + 1.25, c);
      box(u + 0.18, u + 0.25, v - 0.05, v + 0.05, y + 0.85, y + 1.25, c);
      box(u - 0.11, u + 0.11, v - 0.1, v + 0.1, y + 1.33, y + 1.55, '#ece6dc');
    }
    return true;
  }
  if (kind === 'optiker') {
    for (let u = p.u0 + 0.3, i = 0; u < p.u1 - 0.3; u += 0.42, i++) {
      const c = goods[(i + seed) % goods.length];
      const y = p.h;
      box(u - 0.015, u + 0.015, v - 0.015, v + 0.015, y, y + 0.3, '#adb5bd');
      box(u - 0.1, u + 0.1, v - 0.07, v + 0.07, y + 0.3, y + 0.5, '#ece6dc');
      box(u - 0.11, u + 0.11, v - 0.09, v - 0.075, y + 0.42, y + 0.46, c);
    }
    return true;
  }
  return false;
}
