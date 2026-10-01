// The way over to a teammate you clicked in the sidebar: round the furniture downstairs (see
// shared/nav.ts), and up the stairs to the boss's office or out through the balcony doors when that's
// where they are.

import { BALCONY_DOOR, FLOOR, LOFT, STAIRS, WALL_T, inWing } from '../../../shared/layout';
import { route } from '../../../shared/nav';
import { onBalcony } from '../../../shared/storey'; // flrnoh fork: each storey its own balconies and desks
import { balconyAt, type Balcony } from '../../../shared/balconies'; // flrnoh fork

export interface Spot {
  x: number;
  y: number;
  z: number;
}

type Zone = 'floor' | 'stairs' | 'loft' | 'balcony' | 'outside';

const STAIRS_Z = (STAIRS.minZ + STAIRS.maxZ) / 2;
/** Just inside the boss's office door at the top of the stairs, and just off the bottom step. */
const STAIRS_TOP = { x: LOFT.minX + 0.6, z: STAIRS_Z };
const STAIRS_FOOT = { x: STAIRS.fromX - 0.6, z: STAIRS_Z };
/**
 * The points on the way from each part of the building out onto the office floor: down the stairs
 * from the boss's office (out through its door at the top), in through the balcony doors.
 */
const WAY_DOWN: Record<Zone, { x: number; z: number }[]> = {
  floor: [],
  stairs: [STAIRS_FOOT],
  loft: [STAIRS_TOP, STAIRS_FOOT],
  // In through the doors of whichever balcony they're on (see wayDown).
  balcony: [],
  outside: [],
};

/** flrnoh fork: the way in from balcony `b` (each storey's on its own wall): just out of its doors, then just inside them. */
function balconyWay(b: Balcony): { x: number; z: number }[] {
  return [balconyAt(b, BALCONY_DOOR.u, FLOOR.maxZ + WALL_T + 0.6), balconyAt(b, BALCONY_DOOR.u, FLOOR.maxZ - 0.7)];
}

/** The way down onto the office floor from `p`, in zone `zone`. */
function wayDown(zone: Zone, p: Spot, index: number): { x: number; z: number }[] {
  const b = zone === 'balcony' ? onBalcony(p.x, p.z, index, 0.1) : undefined;
  return b ? balconyWay(b) : WAY_DOWN[zone];
}

function zoneOf(p: Spot, wing: number, index: number): Zone {
  // The back office is more of the office floor, through where the north wall was.
  if (p.y > -1 && p.y < 0.5 && inWing(p.x, p.z, wing)) return 'floor';
  // Out on one of this storey's balconies, on whichever wall it hangs (flrnoh fork).
  if (p.y > -1 && onBalcony(p.x, p.z, index, 0.1)) return 'balcony';
  if (p.y < -1 || p.x < FLOOR.minX || p.x > FLOOR.maxX || p.z < FLOOR.minZ || p.z > FLOOR.maxZ) return 'outside';
  if (p.x > LOFT.minX && p.z > LOFT.minZ && p.y > LOFT.y - 0.5) return 'loft';
  // Off the office floor's map, which has the stairs down as a wall.
  if (p.x > STAIRS.fromX - 0.1 && p.x < STAIRS.toX + 0.1 && p.z > STAIRS.minZ - 0.1 && p.y > 0.05) return 'stairs';
  return 'floor';
}

/**
 * The corners of a walk from `from` to `to`, `to` included when it's somewhere you can stand, on a
 * floor built out `wing` rows into the back office, `index` up the building (each storey its own cut).
 */
export function wayTo(from: Spot, to: Spot, wing = 0, index = 0): { x: number; z: number }[] {
  const a = zoneOf(from, wing, index);
  const b = zoneOf(to, wing, index);
  // Across the same room upstairs or on the same balcony, or somewhere the office has no map of: straight there.
  const sameDeck = a !== 'balcony' || onBalcony(from.x, from.z, index, 0.1) === onBalcony(to.x, to.z, index, 0.1);
  if ((a === b && a !== 'floor' && sameDeck) || a === 'outside' || b === 'outside') return [{ x: to.x, z: to.z }];
  // Between the stairs and the boss's office at the top of them: through its door.
  if ((a === 'stairs' && b === 'loft') || (a === 'loft' && b === 'stairs')) return [STAIRS_TOP, { x: to.x, z: to.z }];
  const out = wayDown(a, from, index);
  const into = [...wayDown(b, to, index)].reverse();
  const start = out[out.length - 1] ?? from;
  const end = into[0] ?? to;
  // Across the office floor; route stops at the nearest place to stand if they're in a chair or on the couch.
  const across = route([start.x, start.z], [end.x, end.z], wing, index)
    .slice(1)
    .map(([x, z]) => ({ x, z }));
  return [...out, ...across, ...into.slice(1), ...(b === 'floor' ? [] : [{ x: to.x, z: to.z }])];
}
