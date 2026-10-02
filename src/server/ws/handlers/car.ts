// The cars in every floor's garage.
import type { Floor } from '../../floor.js';
import type { CarClientMsg } from '../../../shared/protocol.js';
import type { Ctx } from '../../office/context.js';
import type { Client } from '../../office/client.js';
import { num } from '../../office/input.js';
import { BULLI_REFUSED, mayTake } from '../../../shared/bulli.js'; // flrnoh fork
import { CARS } from '../../../shared/garage.js';
import type { FeatureHooks, HandlerMap, ViewPieces } from './types.js';

export const carsView: ViewPieces['cars'] = (_ctx, floor) => floor?.garage.state() ?? [];
export const carsChanged = (ctx: Ctx, floor: Floor) => ctx.toFloor(floor, { t: 'cars', cars: floor.garage.state() });

/** Getting into a car, or out of one. */
function seat(ctx: Ctx, c: Client, msg: Extract<CarClientMsg, { t: 'car.enter' | 'car.leave' }>) {
  const floor = ctx.floorOf(c);
  if (!floor) return;
  const car = msg.t === 'car.enter' ? Math.trunc(num(msg.car)) : -1;
  // flrnoh fork: an owned car's wheel only for its keyholders (see server/carkeys.ts).
  const refused = msg.t === 'car.enter' && !mayTake(CARS[car], msg.seat, ctx.carKeys.mayDrive(c.accountId, ctx.meOf(c.accountId).admin));
  if (refused) ctx.warn(c, BULLI_REFUSED);
  const changed = refused ? false : msg.t === 'car.enter' ? floor.garage.enter(c.id, car, msg.seat) : floor.garage.leave(c.id);
  // They hear back either way: someone who didn't get in (someone beat them to the seat) learns who did.
  if (changed) ctx.toNeighbors(c, { t: 'cars', cars: floor.garage.state() });
  ctx.sendTo(c, { t: 'cars', cars: floor.garage.state(), answer: true });
}

export const carHandlers = {
  'car.enter': seat,
  'car.leave': seat,
  'car.drive'(ctx, c, msg) {
    const floor = ctx.floorOf(c);
    const car = Math.trunc(num(msg.car));
    if (ctx.forecourts.holds(floor?.id, car)) return; // flrnoh fork: held at a pump or in the car wash (server/tankstelle.ts)
    const now = floor?.garage.drive(c.id, car, { x: num(msg.x), z: num(msg.z), rotY: num(msg.rotY), speed: num(msg.speed), steer: num(msg.steer) });
    if (now) ctx.toNeighbors(c, { t: 'car.move', car, ...now }, true);
  },
  'car.honk'(ctx, c) {
    const car = ctx.floorOf(c)?.garage.honk(c.id);
    if (car !== undefined) ctx.toNeighbors(c, { t: 'car.honk', car });
  },
} satisfies HandlerMap<CarClientMsg>;

export const carHooks: FeatureHooks = {
  leaving(ctx, c, was) {
    // So does a car they were in, parked where they left it.
    const carLeft = !!was?.garage.leave(c.id);
    if (carLeft && was) return () => carsChanged(ctx, was);
  },
  closedOn(ctx, c, floor) {
    if (floor.garage.leave(c.id)) carsChanged(ctx, floor);
  },
};
