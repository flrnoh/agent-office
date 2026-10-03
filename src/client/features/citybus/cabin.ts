/**
 * flrnoh fork (see FORK.md "Traffic lights and the city bus"): you, inside a city bus as it drives.
 * Where you stand is kept in the bus's own frame (its nose +x, its doors +z, shared/buscabin.ts), so
 * the bus carries you along, round corners and all, and walking moves you about in there: down the
 * aisle, round the seats, the poles' validators and the cab, and (doors open) out of a door. Pure
 * numbers; features/citybus/index.ts puts you in the world from here every frame.
 */
import { DOORS } from '../../../shared/citybus';
import { SEATS, SEAT_REACH, VALIDATORS, doorAt, standsAt } from '../../../shared/buscabin';
import type { CityBus } from '../../world/town/bus';

/** How fast you walk in a moving bus (m/s): carefully. */
const WALK = 2.3;
/** How close (m) to a seat's front, a validator or a door you have to be to use it. */
export const REACH = 0.95;

export interface Ride {
  bus: CityBus;
  /** Where you stand in it (its frame), and which way you face there (as `facing`: 0 is its +z, π/2 its nose). */
  x: number;
  z: number;
  r: number;
  /** The seat you're in (in SEATS), if you sat down. */
  seat: number | null;
  /** You've pressed the stop button: the bus's displays say HALT till it's at a stop. */
  halt: boolean;
  /** You stamped a ticket in the validator. */
  stamped: boolean;
  /** How many stops it's been to since you got on. */
  stops: number;
}

/** The keys you're holding for walking: ahead, back, left, right. */
export interface Steer {
  ahead: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
}

/**
 * A step of walking about in the bus by the keys, camera-relative as on foot (`camYaw`, `yaw` the bus's):
 * round what's in there. Returns whether you moved, and the door you stepped out of (-1: none; only
 * while `open`).
 */
export function walkInBus(ride: Ride, steer: Steer, camYaw: number, yaw: number, dt: number, open: boolean, firstPerson: boolean): { moved: boolean; out: number } {
  let ix = 0;
  let iz = 0;
  if (steer.ahead) iz -= 1;
  if (steer.back) iz += 1;
  if (steer.left) ix -= 1;
  if (steer.right) ix += 1;
  if (!ix && !iz) return { moved: false, out: -1 };
  const len = Math.hypot(ix, iz);
  const sin = Math.sin(camYaw);
  const cos = Math.cos(camYaw);
  // The way you walk in the world, as on foot (see PlayerController.update), and then in the bus's frame.
  const dx = ((ix * cos + iz * sin) / len) * WALK * dt;
  const dz = ((-ix * sin + iz * cos) / len) * WALK * dt;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  // Out of an open door: walking at it from in there.
  if (open) {
    const k = doorAt(ride.x + lx, ride.z + lz);
    // Toward the door, not just along the wall by it.
    if (k >= 0 && lz > 0.3 * Math.hypot(lx, lz)) return { moved: true, out: k };
  }
  const x0 = ride.x;
  const z0 = ride.z;
  if (standsAt(ride.x + lx, ride.z)) ride.x += lx;
  if (standsAt(ride.x, ride.z + lz)) ride.z += lz;
  const moved = Math.hypot(ride.x - x0, ride.z - z0) > 1e-5;
  // In third person you turn the way you go; in first, you look where the camera does.
  if (moved && !firstPerson) ride.r = Math.atan2(lx, lz);
  return { moved, out: -1 };
}

/** The free seat nearest you within reach (its place in SEATS, -1 if none) and how far its front edge is. */
export function seatNear(ride: Ride, taken: Set<number>): { i: number; d: number } {
  let i = -1;
  let d = SEAT_REACH;
  SEATS.forEach((s, k) => {
    if (taken.has(k)) return;
    // From its front edge, where you'd sit down from.
    const e = Math.hypot(ride.x - (s.x + 0.4 * Math.sin(s.rotY)), ride.z - (s.z + 0.4 * Math.cos(s.rotY)));
    if (e < d) {
      d = e;
      i = k;
    }
  });
  return { i, d };
}

/** The validator within reach, and how far, if any. */
export function validatorNear(ride: Ride): { d: number } | null {
  const d = Math.min(...VALIDATORS.map((v) => Math.hypot(ride.x - v.x, ride.z - v.z)));
  return d < REACH ? { d } : null;
}

/** The door within reach (its place in DOORS), or -1. */
export function doorNear(ride: Ride): number {
  return DOORS.findIndex((u) => Math.abs(ride.x - u) < 0.75 && ride.z > 0.35);
}

/** Up off seat `i` into the aisle beside it: the nearest place there's room to stand. */
export function standUp(ride: Ride, i: number) {
  const s = SEATS[i];
  for (const [x, z] of [
    [s.x + 0.45, 0.22],
    [s.x, 0.22],
    [s.x + 0.6, s.z],
    [s.x + 0.9, 0.22],
    [s.x - 0.5, 0.22],
  ]) {
    if (standsAt(x, z)) {
      ride.x = x;
      ride.z = z;
      break;
    }
  }
  ride.seat = null;
  ride.r = s.rotY;
}
