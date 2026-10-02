import type * as THREE from 'three';
import type { VenueMode } from '../../../shared/venue';
import type { VenueFx, VenueLights } from '../../../shared/venue-house';
import type { Collider, Interactable } from '../types';
import { buildVenueShell } from './room';
import { buildFoyer, type VenueFoyer } from './foyer';
import { buildBar } from './bar';
import { buildFoh } from './foh';
import { buildBackstage } from './backstage';
import { buildRig } from './rig';
import { buildFx } from './fx';
import { ShowLighting } from './lighting';

/*
 * The Schallwerk inside, as the building builds it (flrnoh fork, see FORK.md "The Schallwerk"): the
 * hall (room.ts), the foyer (foyer.ts), the bar (bar.ts), front of house (foh.ts), backstage
 * (backstage.ts), the rig over it all (rig.ts) and the effects (fx.ts), lit by the show (lighting.ts).
 * Built once, the first time anyone goes in (client/venue/place.ts); the instruments, the rehearsal
 * wing and the show add themselves to it as parts (world/venue/parts.ts).
 */

export interface VenueInterior {
  group: THREE.Group;
  colliders: Collider[];
  interactables: Interactable[];
  /** What the aim can land on in there. */
  pickables: THREE.Object3D[];
  exit: Interactable;
  show: ShowLighting;
  foyer: VenueFoyer;
  /** The light desk and the mode, as the office says. */
  setLights(lights: VenueLights, mode: VenueMode): void;
  /** An effect went off at `at` (office clock, ms). */
  fire(fx: VenueFx, at: number): void;
  /** `now` the office's clock (ms), `level` the music (0..1); `snap` straight to the look (coming in). */
  update(now: number, t: number, dt: number, level: number, snap?: boolean): void;
}

export function buildVenueInterior(): VenueInterior {
  const shell = buildVenueShell();
  const { group, colliders, interactables } = shell;
  const show = new ShowLighting();
  const foyer = buildFoyer(group, colliders, interactables);
  const bar = buildBar(group, colliders, interactables);
  const foh = buildFoh(group, colliders, interactables);
  const backstage = buildBackstage(group, colliders, interactables);
  const rig = buildRig(group);
  const fx = buildFx(group);
  return {
    group,
    colliders,
    interactables,
    pickables: [group],
    exit: shell.exit,
    show,
    foyer,
    setLights(lights, mode) {
      show.set(lights, mode);
    },
    fire(f, at) {
      fx.fire(f, at);
      if (f === 'nebel') show.nebel(at);
    },
    update(now, t, dt, level, snap = false) {
      show.update(now, dt, level, snap);
      const look = show.look;
      // The show runs on the office's clock, so everyone's moving heads point the same way.
      const st = now / 1000;
      shell.update(look, st);
      foyer.update(look, t);
      bar.update(look, t);
      foh.update(look, t);
      backstage.update(look, t);
      rig.update(look, st, dt);
      fx.update(now);
    },
  };
}
