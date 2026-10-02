import type * as THREE from 'three';
import type { BowlingLights } from '../../../shared/bowling';
import type { Collider, Interactable } from '../types';
import { buildCosmic } from './cosmic';
import { buildCounter, type BowlingCounter } from './counter';
import type { HouseLighting } from './lighting';
import { buildLounge, type BowlingLounge } from './lounge';
import { buildBowlingShell } from './room';

/*
 * The bowling centre inside, as the building's half builds it (flrnoh fork, see FORK.md "The bowling
 * centre"): the room (room.ts), the counter with the shoe rental (counter.ts), the lounge with the
 * cosmic switch (lounge.ts) and the mirror ball's show (cosmic.ts). Built once, the first time anyone
 * goes in (client/bowling/place.ts); the lanes, the karaoke bar and the mini golf add themselves to it
 * as parts (world/bowling/parts.ts).
 */

export interface BowlingInterior {
  group: THREE.Group;
  colliders: Collider[];
  interactables: Interactable[];
  /** What the aim can land on in there. */
  pickables: THREE.Object3D[];
  exit: Interactable;
  counter: BowlingCounter;
  lounge: BowlingLounge;
  lighting: HouseLighting;
  /** The lights switched: eased there, or straight there coming in (`now`). */
  setLights(lights: BowlingLights, now?: boolean): void;
  update(t: number, dt: number): void;
}

export function buildBowlingInterior(): BowlingInterior {
  const shell = buildBowlingShell();
  const { group, colliders, interactables, lighting } = shell;
  const counter = buildCounter(group, colliders, interactables, lighting);
  const lounge = buildLounge(group, colliders, interactables, lighting);
  const show = buildCosmic(group, lighting);
  return {
    group,
    colliders,
    interactables,
    pickables: [group],
    exit: shell.exit,
    counter,
    lounge,
    lighting,
    setLights(lights, now = false) {
      lighting.set(lights, now);
      lounge.throwLever(lights === 'cosmic');
    },
    update(t, dt) {
      shell.update(t, dt);
      counter.update(t);
      lounge.update(t, dt);
      show.update(t, lighting.shares().uv);
    },
  };
}
