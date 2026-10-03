import { GYM } from '../../shared/gym.js';
import { GYM_FROM_THERME, THERME, THERME_ARRIVAL } from '../../shared/therme.js';
import type { FloorView } from '../../shared/protocol.js';

/*
 * The thermal baths behind the gym (flrnoh fork, see FORK.md "The thermal baths"), on the server: a
 * place of its own like the gym (THERME is a peer's `floor` while they're in there), so people from
 * every floor meet in there. fork/office.ts hooks it in: `floor.go` to THERME (through the door at the
 * end of the gym basement's passage), back in after a reload, and where each side of that door lands
 * you. Phase 0 keeps nothing: the zones come with their own keepers, phase by phase.
 */

type Spot = { x: number; y: number; z: number; rotY: number };

/** Just inside the passage's door, where someone coming through from the gym stands (the page puts them there too). */
export const THERME_ENTRY: Spot = THERME_ARRIVAL;

/** What someone arriving in the baths gets: none of a floor's things (`empty` is floorView of no floor). */
export function thermeView(empty: FloorView): FloorView {
  return { ...empty, floor: THERME };
}

/** Whether someone asking to come back to `wanted` (a reload, a restart) goes back into the baths: only while there's a building for the gym's street. */
export function backInTherme(wanted: string | null, floors: number): boolean {
  return wanted === THERME && floors > 0;
}

/**
 * Where someone going `to` a place from `from` lands, when it's the door between the gym and the
 * baths (null otherwise: the place's own entry). The office decides, not the page: back from the
 * baths is the gym basement's passage, in front of that door, not the gym's front door.
 */
export function thermeDoorSpot(to: string, from: string | undefined): Spot | null {
  if (to === GYM && from === THERME) return GYM_FROM_THERME;
  if (to === THERME) return THERME_ENTRY;
  return null;
}
