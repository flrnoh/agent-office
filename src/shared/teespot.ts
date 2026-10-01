// Golf off each storey's own balcony (flrnoh fork, see FORK.md and features/golf/storey.ts): where the
// tee is on floor `index`, which way is out from it, and what a ball rattles round out on its decks.
// Pure, so the tests can check every floor's.

import { GOLF_HOLE } from './layout.js';
import type { Balcony, BalconyRect } from './balconies.js';
import { storeyPlan } from './storey.js';

/** Where floor `index`'s tee is, which way is straight out from it, and the pin from it. Headings are as Shot's: 0 is +z, turning toward +x. */
export interface TeeSpot {
  x: number;
  z: number;
  /** Straight out from the tee's balcony. */
  turn: number;
  /** Which way the pin is, and how far, along the ground. */
  pinYaw: number;
  pinDistance: number;
}

const SPOTS = new Map<number, TeeSpot>();

export function teeSpot(index: number): TeeSpot {
  const key = Math.max(0, Math.trunc(index) || 0);
  let spot = SPOTS.get(key);
  if (!spot) {
    const { ball, turn } = storeyPlan(key).golfTee;
    spot = { x: ball.x, z: ball.z, turn, pinYaw: Math.atan2(GOLF_HOLE.x - ball.x, GOLF_HOLE.z - ball.z), pinDistance: Math.hypot(GOLF_HOLE.x - ball.x, GOLF_HOLE.z - ball.z) };
    SPOTS.set(key, spot);
  }
  return spot;
}

/** Wraps an angle into -π..π. */
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Heading `yaw`, kept within `max` either side of straight out from `spot`'s balcony. */
export function aimWithin(spot: TeeSpot, yaw: number, max: number): number {
  return spot.turn + Math.min(max, Math.max(-max, wrap(yaw - spot.turn)));
}

/** Where to start aiming from `spot`: at the pin, if it's within reach, or as near it as you can aim. */
export function startAim(spot: TeeSpot, max: number): number {
  return aimWithin(spot, spot.pinYaw, max);
}

/**
 * Inside each of floor `index`'s balconies, short of its railings and its wall by `r` (a ball's
 * radius) and the rail's thickness, and which of its sides is the wall: what a ball rattles round.
 */
export function insideDecks(index: number, r: number): { b: Balcony; in: BalconyRect }[] {
  const k = 0.12 + r;
  return storeyPlan(index).balconies.map((b) => {
    const d = b.rect;
    return { b, in: { minX: d.minX + (b.wall === 'east' ? r : k), maxX: d.maxX - (b.wall === 'west' ? r : k), minZ: d.minZ + (b.wall === 'south' ? r : k), maxZ: d.maxZ - k } };
  });
}

/** Whether the side of `b` a ball runs out of, going `dir` (-1 or +1) along `axis`, is its wall (rather than a railing). */
export function wallSide(b: Balcony, axis: 'x' | 'z', dir: number): boolean {
  if (axis === 'z') return dir < 0 && b.wall === 'south';
  return dir < 0 ? b.wall === 'east' : b.wall === 'west';
}
