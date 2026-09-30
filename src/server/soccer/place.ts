import { SOCCER, SOCCER_ENTRY } from '../../shared/soccer.js';
import type { FloorView } from '../../shared/protocol.js';

/*
 * The soccer hall as a place (flrnoh fork, see FORK.md "The soccer hall"), like the padel hall
 * (server/hall.ts): SOCCER is a peer's `floor` while they're in there. server.ts hooks it in:
 * `floor.go` to SOCCER, back in after a reload, and the view someone arriving gets.
 */

/** Just inside the doors, where someone coming in stands (the page puts them there too). */
export const SOCCER_ARRIVAL = { x: SOCCER_ENTRY.x, y: 0, z: SOCCER_ENTRY.z, rotY: SOCCER_ENTRY.rotY } as const;

/** What someone arriving in the hall gets: none of a floor's things (`empty` is server.ts's floorView of no floor). The match comes in its own message. */
export function soccerView(empty: FloorView): FloorView {
  return { ...empty, floor: SOCCER };
}

/** Whether someone asking to come back to `wanted` (a reload, a restart) goes back into the hall: only while there's a building for its street. */
export function backInSoccer(wanted: string | null, floors: number): boolean {
  return wanted === SOCCER && floors > 0;
}
