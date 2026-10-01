import { HALL, HALL_ENTRY } from '../shared/hall.js';
import type { FloorView } from '../shared/protocol.js';

/*
 * The padel hall across the street (flrnoh fork, see FORK.md "The padel hall"), on the server: a
 * place of its own like the casino (HALL is a peer's `floor` while they're in there), so people from
 * every floor meet, see and hear each other in there. server.ts hooks it in: `floor.go` to HALL,
 * back in after a reload, and the view someone arriving gets.
 */

/** Just inside the doors, where someone coming in stands (the page puts them there too). */
export const HALL_ARRIVAL = { x: HALL_ENTRY.x, y: 0, z: HALL_ENTRY.z, rotY: HALL_ENTRY.rotY } as const;

/** What someone arriving in the hall gets: none of a floor's things (`empty` is server.ts's floorView of no floor). */
export function hallView(empty: FloorView): FloorView {
  return { ...empty, floor: HALL };
}

/** Whether someone asking to come back to `wanted` (a reload, a restart) goes back into the hall: only while there's a building for its street. */
export function backInHall(wanted: string | null, floors: number): boolean {
  return wanted === HALL && floors > 0;
}
