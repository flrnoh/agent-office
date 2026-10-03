/**
 * flrnoh fork (see FORK.md): the city round the office (world/town/), the same from every floor, from
 * the street and from the rooftop bar. Each frame its cars drive and its lights follow the dark; down
 * here they stop for anyone in the road. Up on the roof, the office lends it what you see out of the
 * windows (the street, the city, the country past it) and looks out at the same country from there.
 */
import type * as THREE from 'three';
import { posesNow } from '../waymo/state'; // fork: the robotaxis
import { roofDrop } from '../../../shared/layout';
import type { Ctx } from '../../core/context';
import type { Obstacle } from '../../world/town';
import type { Rooftop } from '../rooftop/world';
import { drivePassersby } from './people';
import { PropCull } from '../../world/town/propcull';
import { store } from '../../state';

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
  /** The passers-by on the office's clock (see people.ts). */
  const passersby = drivePassersby(ctx);

  /** Who and what the city's cars stop for, down on the street: people on foot, and the garage's cars. */
  function inTheRoad(): Obstacle[] {
    obstacles.length = 0;
    const street = office.night.street;
    if (Math.abs(ctx.player.pos.y - street) < 1.5) obstacles.push(ctx.player.pos);
    for (const b of deps.bodies()) if (Math.abs(b.position.y - street) < 1.5) obstacles.push(b.position);
    for (const c of office.cars.cars) obstacles.push(c.pose);
    // Fork: the robotaxis, nose to tail (features/waymo).
    for (const p of posesNow().values()) for (const k of [-1.8, 0, 1.8]) obstacles.push({ x: p.x + Math.cos(p.yaw) * k, z: p.z - Math.sin(p.yaw) * k });
    return obstacles;
  }

  // Small things far off aren't drawn (world/town/propcull.ts): the landmarks' and halls' many parts
  // round the office, everything out there but the town itself (its shops see to their own insides).
  const props = new PropCull();
  const outlook = office.town.group.parent;
  if (outlook) props.add(...outlook.children.filter((c) => c !== office.town.group));
  (window as unknown as { __propcull?: PropCull }).__propcull = props;
  ctx.ticks.add('env', ({ t, dt }) => {
    props.update(ctx.camera);
    const up = ctx.upTop();
    const roof = up ? deps.roof() : null;
    // Up on the roof, it borrows the office's outlook; back down, the office has it again.
    if (up !== lent && (!up || roof)) {
      office.lendOutlook(up ? roof!.city.holder : null);
      lent = up;
    }
    const dark = ctx.sky.lampsOn;
    passersby();
    const now = store.officeNow() / 1000; // fork: the lights and the buses keep to the office's clock
    if (up) {
      // The roof looks out at the same country, as far below as the building is tall.
      office.scenic.cull(ctx.camera.position, -roofDrop(deps.roofFloors()), (ctx.scene.fog as THREE.Fog).far);
      office.town.update(t, dt, dark, [], now);
    } else if (ctx.inOffice()) office.town.update(t, dt, dark, inTheRoad(), now);
  });
}
