// flrnoh fork (see FORK.md "Shops to walk into": bikes, pets, laundry): what the bike shop rents out
// and how a bike rides, the budgie on your shoulder, and the laundromat's machines. The same for the
// page, the server and the tests.
//
// A bike is simpler than the garage's cars or the beach's boats: it's no thing of its own in the
// world, just you, riding. Your page moves you (as `move` always does) and the office keeps which bike
// you're on as `PeerInfo.bike`, so everyone (and whoever comes along later) sees you on it.

import type { DriveTuning } from './garage.js';
import { shopAt } from './shops.js';

export type BikeKind = 'city' | 'racer' | 'bmx' | 'cargo';
export const BIKE_KINDS: readonly BikeKind[] = ['city', 'racer', 'bmx', 'cargo'];

export interface BikeSpec {
  kind: BikeKind;
  name: string;
  emoji: string;
  blurb: string;
  /** The frame's color, and the saddle's and grips'. */
  color: string;
  trim: string;
  /** How it rides: the cars' bicycle model (shared/garage.ts drive), slower than a car, quicker than running. */
  tuning: DriveTuning;
  /** How high a hop on Space goes (m/s up): the BMX's is a proper jump. */
  hop: number;
  /** Your hips over the ground on its saddle (the office's people are small: standing, theirs are 0.42 up), and how long it is (m). */
  hips: number;
  length: number;
  /** Pedal turns a meter: a racer's long gears turn slowly. */
  cadence: number;
}

const tune = (top: number, accel: number, steer: number): DriveTuning => ({ top, reverse: 1.2, accel, reverseAccel: 1.5, brake: 7, coast: 1.1, wheelbase: 1.05, steer, steerRate: 4 });

export const BIKES: Readonly<Record<BikeKind, BikeSpec>> = {
  city: { kind: 'city', name: 'Hollandrad', emoji: '🚲', blurb: 'Upright, a basket on the front, a bell that goes ding', color: '#2a9d8f', trim: '#6b4226', tuning: tune(9, 3.2, 0.6), hop: 3.2, hips: 0.74, length: 1.3, cadence: 0.55 },
  racer: { kind: 'racer', name: 'Rennrad', emoji: '🚴', blurb: 'Drop bars, thin tyres, fast as anything on two wheels', color: '#e63946', trim: '#1d1d1d', tuning: tune(12, 4.2, 0.5), hop: 3.2, hips: 0.76, length: 1.3, cadence: 0.4 },
  bmx: { kind: 'bmx', name: 'BMX', emoji: '🤸', blurb: 'Small, nimble, and Space is a proper jump', color: '#ffbe0b', trim: '#3a0ca3', tuning: tune(8.5, 5, 0.75), hop: 5.6, hips: 0.6, length: 1.05, cadence: 0.75 },
  cargo: { kind: 'cargo', name: 'Lastenrad', emoji: '📦', blurb: 'A long box up front: slow, steady, room for a dog', color: '#1d3557', trim: '#e9c46a', tuning: tune(8, 2.4, 0.45), hop: 2.4, hips: 0.74, length: 1.9, cadence: 0.6 },
};

export function isBikeKind(v: unknown): v is BikeKind {
  return typeof v === 'string' && (BIKE_KINDS as readonly string[]).includes(v);
}

/** How long a rental lasts before the bike's taken back (seconds), riding or parked. */
export const RENTAL_SECONDS = 15 * 60;

/**
 * Whether a bike may be at (x, z): anywhere out on the street, the sidewalks, the squares (what you'd
 * bump into stops you anyway), but never in through a shop's door: shops are for walking.
 */
export function rideable(x: number, z: number): boolean {
  return Number.isFinite(x) && Number.isFinite(z) && !shopAt(x, z, 0.2);
}

/** Where a pedal is (0..2π) after riding `meters`. */
export const crankAngle = (b: BikeKind, meters: number) => meters * BIKES[b].cadence * Math.PI * 2;

// ---- The budgie on your shoulder -------------------------------------------------------------------

/** What sits on your shoulder rather than in your hand while you hold it. */
export const ON_SHOULDER: ReadonlySet<string> = new Set(['wellensittich']);

// ---- The laundromat's machines ---------------------------------------------------------------------

/** How long a wash you start takes (seconds): long enough to sit down and wait, short enough to stay. */
export const WASH_SECONDS = 75;

/**
 * Whether the laundromat's machine `n` in shop `shop` is running a load of somebody's at `ms` (the
 * page's wall clock): a few at a time, round the clock, the same for everyone who looks in.
 */
export function busyMachine(shop: number, n: number, ms: number): boolean {
  const slot = Math.floor(ms / 1000 / 90);
  return (slot * 5 + n * 3 + shop * 7) % 4 === 0;
}

// ---- The messages ----------------------------------------------------------------------------------

export type RideClientMsg =
  /** On a bike from the bike shop (or off it, null): everyone sees you riding. */
  | { t: 'bike.ride'; bike: BikeKind | null }
  /** Ring-ring. */
  | { t: 'bike.bell' };

export type RideServerMsg =
  /** Someone got on a bike, or off (null). */
  | { t: 'bike.rode'; id: string; bike: BikeKind | null }
  /** Someone on your floor rang their bell. */
  | { t: 'bike.bell'; id: string };

/** The bike a `bike.ride` asks for: one of the shop's, or none (anything else is none). */
export const bikeOf = (v: unknown): BikeKind | undefined => (isBikeKind(v) ? v : undefined);
