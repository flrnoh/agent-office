import { BOWLING, BOWLING_ENTRY, type BowlingLights } from '../../shared/bowling.js';
import { LIGHTS_COOLDOWN_MS, isBowlingLights, isShoeSize, type BowlingHouseClientMsg, type BowlingHouseServerMsg } from '../../shared/bowling-house.js';
import type { FloorView } from '../../shared/protocol.js';

/*
 * The bowling centre as a place (flrnoh fork, see FORK.md "The bowling centre"), like the soccer hall
 * (server/soccer/place.ts): BOWLING is a peer's `floor` while they're in there, so people from every
 * floor meet there. fork/office.ts hooks it in: `floor.go` to BOWLING, back in after a reload, the view
 * someone arriving gets. And the house's own state: the lights (cosmic bowling or not) and who's
 * wearing rental shoes, both in memory, both for the whole centre.
 */

/** Just inside the doors, where someone coming in stands (the page puts them there too). */
export const BOWLING_ARRIVAL = { x: BOWLING_ENTRY.x, y: 0, z: BOWLING_ENTRY.z, rotY: BOWLING_ENTRY.rotY } as const;

/** What someone arriving in the centre gets: none of a floor's things (`empty` is the floor view of no floor). The house comes in its own message. */
export function bowlingView(empty: FloorView): FloorView {
  return { ...empty, floor: BOWLING };
}

/** Whether someone asking to come back to `wanted` (a reload, a restart) goes back into the centre: only while there's a building for its street. */
export function backInBowling(wanted: string | null, floors: number): boolean {
  return wanted === BOWLING && floors > 0;
}

/** Who's asking, as the house needs them. */
export interface HouseGuest {
  id: string;
  name: string;
  /** In the centre now. */
  inside: boolean;
}

/** What to tell whom: the whole centre, or only the one asking (a refusal). */
export type HouseReply = { all: BowlingHouseServerMsg } | { warn: string } | null;

/** The lights and the rental shoes, for the whole centre. */
export class BowlingHouse {
  private lights: BowlingLights = 'normal';
  private switchedAt = -Infinity;
  private shoes = new Map<string, number>();

  constructor(private now: () => number = () => Date.now()) {}

  /** What someone coming in is sent. */
  state(): Extract<BowlingHouseServerMsg, { t: 'bowling.house' }> {
    return { t: 'bowling.house', lights: this.lights, shoes: Object.fromEntries(this.shoes) };
  }

  get current(): BowlingLights {
    return this.lights;
  }

  /** A message from someone: the switch, or the shoes. */
  message(who: HouseGuest, msg: BowlingHouseClientMsg): HouseReply {
    if (!who.inside) return null;
    if (msg.t === 'bowling.lights') {
      if (!isBowlingLights(msg.lights) || msg.lights === this.lights) return null;
      const now = this.now();
      if (now - this.switchedAt < LIGHTS_COOLDOWN_MS) return { warn: 'The lever needs a moment to come back' };
      this.lights = msg.lights;
      this.switchedAt = now;
      return { all: { t: 'bowling.lights', lights: this.lights, by: who.name.slice(0, 40) } };
    }
    if (msg.size === null) {
      if (!this.shoes.delete(who.id)) return null;
      return { all: { t: 'bowling.shoes', id: who.id, size: null } };
    }
    if (!isShoeSize(msg.size) || this.shoes.get(who.id) === msg.size) return null;
    this.shoes.set(who.id, msg.size);
    return { all: { t: 'bowling.shoes', id: who.id, size: msg.size } };
  }

  /** They left the centre (or the office): their shoes go back on the shelf. What to tell those still inside, if anything. */
  leave(id: string): BowlingHouseServerMsg | null {
    return this.shoes.delete(id) ? { t: 'bowling.shoes', id, size: null } : null;
  }
}
