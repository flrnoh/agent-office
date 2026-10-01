/**
 * flrnoh fork (see FORK.md): the city round the office (world/town/), the same from every floor, from
 * the street and from the rooftop bar. Each frame its cars drive and its lights follow the dark; down
 * here they stop for anyone in the road. Up on the roof, the office lends it what you see out of the
 * windows (the street, the city, the country past it) and looks out at the same country from there.
 */
import type * as THREE from 'three';
import { roofDrop } from '../../../shared/layout';
import type { Ctx } from '../../core/context';
import type { Obstacle } from '../../world/town';
import type { Rooftop } from '../rooftop/world';

export interface TownFeatureDeps {
  /** The roof, once it's built (see features/rooftop). */
  roof(): Rooftop | null;
  /** How many floors the roof stands on (see features/rooftop). */
  roofFloors(): number;
  /** Everyone else's bodies (see features/peers). */
  bodies(): Iterable<THREE.Object3D>;
}

export function installTown(ctx: Ctx, deps: TownFeatureDeps) {
  const { office } = ctx;
  /** Whether the outlook is lent to the roof right now. */
  let lent = false;
  const obstacles: Obstacle[] = [];

  /** Who and what the city's cars stop for, down on the street: people on foot, and the garage's cars. */
  function inTheRoad(): Obstacle[] {
    obstacles.length = 0;
    const street = office.night.street;
    if (Math.abs(ctx.player.pos.y - street) < 1.5) obstacles.push(ctx.player.pos);
    for (const b of deps.bodies()) if (Math.abs(b.position.y - street) < 1.5) obstacles.push(b.position);
    for (const c of office.cars.cars) obstacles.push(c.pose);
    return obstacles;
  }

  ctx.ticks.add('env', ({ t, dt }) => {
    const up = ctx.upTop();
    const roof = up ? deps.roof() : null;
    // Up on the roof, it borrows the office's outlook; back down, the office has it again.
    if (up !== lent && (!up || roof)) {
      office.lendOutlook(up ? roof!.city.holder : null);
      lent = up;
    }
    const dark = ctx.sky.lampsOn;
    if (up) {
      // The roof looks out at the same country, as far below as the building is tall.
      office.scenic.cull(ctx.camera.position, -roofDrop(deps.roofFloors()), (ctx.scene.fog as THREE.Fog).far);
      office.town.update(t, dt, dark, []);
    } else if (ctx.inOffice()) office.town.update(t, dt, dark, inTheRoad());
  });
}
