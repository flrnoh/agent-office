// The jetskis and the motorboat at the jetty (flrnoh fork, see FORK.md "A day at the beach"): where
// they're moored, their seats, how they handle, where they can go (the open sea, see onWater in
// beach.ts), and their messages. Like the garage's cars (shared/garage.ts): the driver's page runs
// the boat and the office passes on where it's got to, to everyone on the floor.

import { JETTY, onWater } from './beach.js';
import { drive, type CarPose, type DriveTuning, type Pedals } from './garage.js';

export type CraftKind = 'jetski' | 'boat';

/** A place to sit in a craft, in its own frame (x across, +x on the driver's left; z toward the bow), and how high your hips are over its floor (see CRAFT_FLOOR). */
export interface CraftSeat {
  x: number;
  z: number;
  hips: number;
  /** Astride (a jetski's saddle): legs either side, rather than sitting on a bench. */
  astride?: boolean;
}

export interface CraftSpec {
  /** Bow to stern, and across. */
  length: number;
  width: number;
  /** Seat 0 is the driver's. */
  seats: readonly CraftSeat[];
  tuning: DriveTuning;
  icon: string;
}

/** A rider's feet (the craft's floor, or a jetski's foot wells) above the sea's surface (see SEA_LEVEL in beach.ts). */
export const CRAFT_FLOOR = 0.2;

export const CRAFT_SPECS: Record<CraftKind, CraftSpec> = {
  jetski: {
    length: 3.1,
    width: 1.2,
    seats: [{ x: 0, z: -0.25, hips: 0.36, astride: true }],
    icon: '🚤',
    tuning: { top: 17, reverse: 3, accel: 7, reverseAccel: 2.5, brake: 7, coast: 2.4, wheelbase: 1.5, steer: 0.75, steerRate: 3.4 },
  },
  boat: {
    length: 5.4,
    width: 2.2,
    // The helm on the right (+x is the driver's left), a seat beside it, and the bench across the stern.
    seats: [
      { x: -0.45, z: 0.3, hips: 0.45 },
      { x: 0.5, z: 0.3, hips: 0.45 },
      { x: -0.5, z: -1.45, hips: 0.42 },
      { x: 0.5, z: -1.45, hips: 0.42 },
    ],
    icon: '🛥️',
    tuning: { top: 11, reverse: 3, accel: 3.6, reverseAccel: 2, brake: 4.5, coast: 1.5, wheelbase: 3, steer: 0.55, steerRate: 2.2 },
  },
};

export interface CraftDef {
  kind: CraftKind;
  name: string;
  color: string;
  /** Moored here when the office starts, its bow this way (0 is +z). */
  x: number;
  z: number;
  rotY: number;
}

// Moored along the jetty's south side, bows angled out to sea (west-south-west), the boat furthest out.
const MOOR_Z = JETTY.z + JETTY.width / 2 + 2.4;
export const CRAFTS: readonly CraftDef[] = [
  { kind: 'jetski', name: 'Red Jetski', color: '#e63946', x: JETTY.x0 - 17, z: MOOR_Z, rotY: -Math.PI / 2 + 0.6 },
  { kind: 'jetski', name: 'Yellow Jetski', color: '#ffbe0b', x: JETTY.x0 - 21.5, z: MOOR_Z, rotY: -Math.PI / 2 + 0.6 },
  { kind: 'boat', name: 'Motorboat Möwe', color: '#f1faee', x: JETTY.x0 - 29.5, z: MOOR_Z + 0.9, rotY: -Math.PI / 2 + 0.3 },
];

export const specOf = (craft: number): CraftSpec | undefined => {
  const d = CRAFTS[craft];
  return d && CRAFT_SPECS[d.kind];
};

/** A craft as the office has it: where it is and how it's going, and who's in which seat (PeerInfo ids, seat 0 driving). */
export interface CraftState extends CarPose {
  riders: (string | null)[];
}

/** Every craft at its mooring, as the office starts. */
export function moored(): CraftState[] {
  return CRAFTS.map((c) => ({ x: c.x, z: c.z, rotY: c.rotY, speed: 0, steer: 0, riders: CRAFT_SPECS[c.kind].seats.map(() => null) }));
}

/** A point in the craft's own frame (x across, +x left; z toward the bow), out in the world. */
export function craftPoint(p: { x: number; z: number; rotY: number }, lx: number, lz: number): { x: number; z: number } {
  const s = Math.sin(p.rotY);
  const c = Math.cos(p.rotY);
  return { x: p.x + lx * c + lz * s, z: p.z - lx * s + lz * c };
}

/** Whether the whole of craft `craft` is on open water at `p`: its corners, and its bow and stern. */
export function craftFits(craft: number, p: { x: number; z: number; rotY: number }): boolean {
  const spec = specOf(craft);
  if (!spec) return false;
  const w = spec.width / 2;
  const l = spec.length / 2;
  for (const [lx, lz] of [
    [w, l * 0.6],
    [-w, l * 0.6],
    [w, -l],
    [-w, -l],
    [0, l],
  ]) {
    const at = craftPoint(p, lx, lz);
    if (!onWater(at.x, at.z)) return false;
  }
  return true;
}

/** Craft `craft` `dt` seconds on with these controls: the cars' bicycle model, with the water's own handling. */
export function steerCraft(craft: number, p: CarPose, pedals: Pedals, dt: number): CarPose {
  const spec = specOf(craft);
  return spec ? drive(p, pedals, dt, spec.tuning) : p;
}

// ---- The messages ----------------------------------------------------------------------------------

export type BoatClientMsg =
  /** Into seat `seat` of craft `craft` (its place in CRAFTS; seat 0 drives): yours if nobody's in it. */
  | { t: 'boat.enter'; craft: number; seat: number }
  /** Out of the craft you're in; driving, it stays where you left it. */
  | { t: 'boat.leave' }
  /** Where the craft you're driving has got to, and how it's going. */
  | { t: 'boat.drive'; craft: number; x: number; z: number; rotY: number; speed: number; steer: number }
  /** The horn of the craft you're in. */
  | { t: 'boat.horn' };

export type BoatServerMsg =
  /** Who's in which craft at your floor's jetty; `answer` to each boat.enter and boat.leave of yours. */
  | { t: 'boats'; boats: CraftState[]; answer?: boolean }
  /** A craft at your floor's jetty is being driven. */
  | { t: 'boat.move'; craft: number; x: number; z: number; rotY: number; speed: number; steer: number }
  /** Someone in a craft sounded its horn. */
  | { t: 'boat.horn'; craft: number };
