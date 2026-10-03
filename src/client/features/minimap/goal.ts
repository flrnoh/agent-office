// flrnoh fork (see FORK.md "The minimap"): where other features send you, on the minimap: the
// curb your robotaxi's coming to, say. The minimap points the way there as it does to a place picked
// on the big map, and crosses it off when you're there.
import type { Poi } from './pois';

let set: (p: Poi | null) => void = () => {};
let get: () => Poi | null = () => null;

/** Has the minimap point you to `p` (or nowhere). */
export const headTo = (p: Poi | null) => set(p);
/** Where the minimap points you now. */
export const headingTo = () => get();

/** The minimap's own (installMinimap). */
export function bindGoal(s: (p: Poi | null) => void, g: () => Poi | null) {
  set = s;
  get = g;
}
