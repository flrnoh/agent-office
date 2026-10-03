import { BUS_RUNS } from './citybus.js';
import { SEATS, inCabin } from './buscabin.js';

// flrnoh fork (see FORK.md "Traffic lights and the city bus"): riding a city bus, on the wire. Where
// a bus is needs nothing sent (every page has it off the office's clock), but where someone is in it
// does: their own page walks them about in there as it drives (features/citybus), and sends where in
// the bus they stand (in its own frame, shared/buscabin.ts) and which seat they've sat down in. The
// office keeps that as `PeerInfo.bus`, so every page draws them right in the bus as it goes (and not
// a step behind it, as following their `move`s would), and whoever comes along later does too.

/** Where someone is in a bus: which (its place in BUS_RUNS), where in its frame, facing which way there, and the seat they're in. */
export interface BusRide {
  run: number;
  x: number;
  z: number;
  r: number;
  seat?: number;
}

export type BusRideClientMsg =
  /** Aboard a bus and where in it (or off it, null). */
  { t: 'bus.ride'; ride: BusRide | null };

export type BusRideServerMsg =
  /** Someone's place in a bus, or that they got off (null). */
  { t: 'bus.rode'; id: string; ride: BusRide | null };

/** How often (ms) the office takes where someone is in a bus; the page sends at most this often while they walk about in there. */
export const BUS_RIDE_THROTTLE_MS = 90;
export const BUS_RIDE_SEND_MS = 120;

/** A ride as the office keeps it: in a bus that's there, somewhere in it, in a seat that's one; anything else is none. */
export function busRideOf(v: unknown): BusRide | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const { run, x, z, r, seat } = o;
  if (typeof run !== 'number' || !Number.isInteger(run) || run < 0 || run >= BUS_RUNS.length) return null;
  if (typeof x !== 'number' || typeof z !== 'number' || !inCabin(x, z)) return null;
  if (typeof r !== 'number' || !Number.isFinite(r)) return null;
  const ride: BusRide = { run, x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100, r: Math.round(Math.atan2(Math.sin(r), Math.cos(r)) * 1000) / 1000 };
  if (seat !== undefined) {
    if (typeof seat !== 'number' || !Number.isInteger(seat) || seat < 0 || seat >= SEATS.length) return null;
    ride.seat = seat;
  }
  return ride;
}

/** What someone's up to on a bus, for the people list and over their head. */
export function busWhereabouts(ride: BusRide): string {
  const line = BUS_RUNS[ride.run]?.line;
  if (!line) return '🚌 on the bus';
  return `🚌 ${ride.seat !== undefined ? 'sitting' : 'riding'} on the ${line.no} to ${line.dest}`;
}
