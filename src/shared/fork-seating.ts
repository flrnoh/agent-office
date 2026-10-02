// flrnoh fork (see FORK.md): the seats this fork adds to SEATING, kept here so layout.ts stays an
// upstream file with one line for them. Only types come from layout.ts here: layout.ts puts
// FORK_SEATING into SEATING.

import type { SeatDef } from './layout.js';
import { GYM_SEATING } from './gym-rooms.js';
import { HALL_SEATING } from './hall-building.js';
import { RIG, RIG_SEAT } from './rig.js';

export const FORK_SEATING: SeatDef[] = [
  // The racing rig's bucket seat (shared/rig.ts), low down, facing its screen; you get out behind it.
  { id: RIG_SEAT, label: '🏎️ Racing rig', x: RIG.x, y: 0, z: RIG.seatZ, rotY: 0, places: [0], hips: 0.36, depth: 0.02, out: -0.95 },
  ...HALL_SEATING, // the padel hall's stand, bench and café chairs (shared/hall-building.ts)
  ...GYM_SEATING, // the gym's sauna and steam benches, loungers, stools (shared/gym-rooms.ts)
];
