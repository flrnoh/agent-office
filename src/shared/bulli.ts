import type { CarDef, CarSeat, DriveTuning } from './garage.js';

// flrnoh fork: Flogge's Bulli, a split-window camper van in teal and cream, parked in its own corner
// of the garage (its spot is in CARS, shared/garage.ts). Only its keyholders take the wheel
// (server/carkeys.ts says who); anyone else may ride along beside them. It's the slow, soft one:
// no supercar, but it gets there, rocking a little on its springs (world/bulli.ts draws it).

/** How it drives: gentle off the line, no racer at the top, soft on the brakes, a big slow wheel. */
export const BULLI_DRIVE: DriveTuning = {
  top: 12.5,
  reverse: 4,
  accel: 3.2,
  reverseAccel: 2.5,
  brake: 9,
  coast: 1.5,
  wheelbase: 2.4,
  steer: 0.55,
  steerRate: 1.6,
};

/** You sit up front, right over the front wheels, and high up: it's a bus. */
export const BULLI_SEATS: Record<CarSeat, { x: number; z: number }> = { driver: { x: 0.42, z: 1.15 }, passenger: { x: -0.42, z: 1.15 } };
export const BULLI_HIPS = 0.85;

/** How high it comes up: its body to the belt line (all there is with the roof open), and its roof. */
export const BULLI_HEIGHT = { body: 1.05, roof: 1.95 } as const;

/** What anyone without the keys hears at its wheel. */
export const BULLI_REFUSED = "🚐 That's Flogge's Bulli — ask him for a ride";

/** Whether someone may take `seat` of the car `def`: anyone rides along, but an owned car's wheel needs its keys. */
export function mayTake(def: CarDef | undefined, seat: CarSeat, keys: boolean): boolean {
  return !def?.owned || seat !== 'driver' || keys;
}
