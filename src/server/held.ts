import { isFridgeItem } from '../shared/fridge.js';
import { ROOF, isDrink, type DrinkId } from '../shared/rooftop.js';

/*
 * What someone may hold (flrnoh fork, see FORK.md): a drink from the rooftop bar only up on the roof,
 * where it stays; a bottle, can or snack from the kitchen fridge anywhere, and it comes along.
 */

/** The drink an `act` asks to hold, on `floor`, if it may: undefined puts down whatever was held. */
export function heldDrink(v: unknown, floor: string | undefined): DrinkId | undefined {
  if (isFridgeItem(v)) return v;
  return isDrink(v) && floor === ROOF ? v : undefined;
}

/** Whether what's held comes along to another floor: the fridge's things do, the bar's glasses don't. */
export function keepsHeld(d: DrinkId | undefined): boolean {
  return isFridgeItem(d);
}
