// Seats you lie on rather than sit on (flrnoh fork, see FORK.md "Lying down"): the loungers on the
// roof and in the gym's basement (the quiet room, the salt grotto, by the pool), and the quiet room's
// water beds. Sitting down on one lays you back on it; everyone sees it, from the seat you're on
// (nothing new on the wire). No imports, so the server and the page can read it alike.

export type Lie = 'recline' | 'flat';

/** How you lie on seat `seatId` (an id from SEATING), or undefined for one you sit on. */
export function lieOn(seatId: string | undefined): Lie | undefined {
  if (!seatId) return undefined;
  if (/^gym-waterbed-\d+$/.test(seatId)) return 'flat';
  if (/^(gym-(rest|salt|poolside)|roof-lounger)-\d+$/.test(seatId)) return 'recline';
  return undefined;
}

/** How far back the body goes (radians from upright): a lounger's backrest, or flat on a water bed. */
export const LIE_BACK: Record<Lie, number> = { recline: 1.15, flat: 1.5 };
