/**
 * flrnoh fork (see FORK.md): the front door from the street. Only the bottom floor has the exit door,
 * so down on another floor's street (back from the gym or the casino onto your own floor) it stays
 * shut (world/office/ground.ts). Come up the steps to it there and it lets you in anyway: the lights
 * dip and you're inside the bottom floor, just in through the door.
 */
import { EXIT_DOOR, EXIT_STAIRS, FLOOR, STOREY } from '../../../shared/layout';
import type { Ctx } from '../../core/context';
import type { CoreState } from '../../core/ctx';
import { builtFloors } from '../../core/floors';
import type { Parts } from '../../core/parts';
import { store } from '../../state';

/** How close to the door's middle, along the wall, still counts as at it. */
const ALONG = EXIT_DOOR.width / 2 + 0.2;

/** Just in through the door on the bottom floor, facing into the room. */
const INSIDE = { x: FLOOR.minX + 0.7, y: 0, z: EXIT_DOOR.u, rotY: Math.PI / 2 };

export function installFrontDoor(ctx: Ctx, core: CoreState, parts: Pick<Parts, 'travel' | 'worlds' | 'place'>) {
  /** The bottom floor we're on the way in to, until we're there. */
  let goingIn: string | null = null;
  // A switch between floors keeps where you stand: put yourself inside the door once you're there.
  ctx.messages.on('floor.enter', () => {
    if (!goingIn) return;
    if (store.floor === goingIn) parts.place.placeAt(INSIDE);
    goingIn = null;
  });
  ctx.ticks.add('world', () => {
    if (core.trip || ctx.upTop() || !parts.worlds.inOffice()) return;
    const floors = builtFloors();
    const level = floors.findIndex((f) => f.id === store.floor);
    if (level <= 0) return;
    const p = ctx.player.pos;
    // On the landing, right up at the door, at this floor's street level.
    const atDoor = p.x > EXIT_STAIRS.maxX - 0.6 && p.x < FLOOR.minX && Math.abs(p.z - EXIT_DOOR.u) < ALONG;
    if (!atDoor || Math.abs(p.y + level * STOREY) > 0.5) return;
    ctx.player.stopWalking();
    goingIn = floors[0].id;
    parts.travel.placeTrip(goingIn, INSIDE);
  });
}
