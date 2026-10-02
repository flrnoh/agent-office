import * as THREE from 'three';
import { BOOTH2, COUNTER, KINO_SEATS, SCREEN1, SCREEN2, kinoSolids } from '../../../shared/kino-plan';
import type { Fixture, StreetSite } from '../office/fixture';
import type { Collider, Interactable } from '../types';
import { buildFoyer, type Foyer } from './foyer';
import { buildSaal1, buildSaal2, type Hall } from './hall';
import { G } from './kit';
import { buildMarquee, type Marquee } from './marquee';
import { buildShell, type KinoDoor, type PosterCase } from './shell';

// flrnoh fork (see FORK.md "The cinema"): the cinema on its block behind the office (shared/kino-plan.ts
// lays it out), built down on the street with the rest of the city, so it's there from every floor's
// street, from the windows and from the roof. What it does (the films, the house lights, the doors,
// the counter, the seats) is features/kino's; this is what stands there, and what you can use of it.

export interface Kino {
  group: THREE.Group;
  /** Everything you bump into or walk up, and the walls alone (what stands between you and a screen). */
  colliders: Collider[];
  walls: Collider[];
  saal1: Hall;
  saal2: Hall;
  marquee: Marquee;
  foyer: Foyer;
  doors: KinoDoor[];
  /** The cases on the front (four) and in the foyer (three), each showing a film of the programme. */
  posters: THREE.MeshBasicMaterial[];
  /** What there is to use: each seat by its key, the counter, Saal 2's lectern, the two screens. */
  seats: Map<string, Interactable>;
  counter: Interactable;
  booth: Interactable;
  screens: [Interactable, Interactable];
}

/** An invisible box the aim can land on, carrying what it's for (see aimedAt in input/pointer.ts). */
function pick(g: THREE.Group, it: Interactable, x: number, y: number, z: number, w: number, h: number, d: number) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), PICK);
  m.position.set(x, G + y, z);
  m.userData.interact = it;
  g.add(m);
}
const PICK = new THREE.MeshBasicMaterial({ visible: false });

export function buildKino(): Kino {
  const group = new THREE.Group();
  group.name = 'kino';
  const { doors, posters } = buildShell(group);
  const marquee = buildMarquee(group);
  const foyer = buildFoyer(group);
  const saal1 = buildSaal1(group);
  const saal2 = buildSaal2(group);

  const solids = kinoSolids();
  const colliders: Collider[] = solids.map((b) => ({ minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ, bottom: G + b.bottom, top: G + b.top }));
  // The walls: anything standing taller than a person (the tiers and seats are lower).
  const walls = colliders.filter((c) => c.top - G > 4);

  const seats = new Map<string, Interactable>();
  for (const s of KINO_SEATS) {
    const it: Interactable = { kind: 'kinoseat', x: s.x, z: s.z, y: G + s.y, radius: 0.75, seatId: s.key };
    seats.set(s.key, it);
    pick(group, it, s.x + (s.hall === 1 ? 0 : 0.1), s.y + 0.55, s.z, 0.6, 0.9, 0.6);
  }
  const counter: Interactable = { kind: 'kinocounter', x: (COUNTER.minX + COUNTER.maxX) / 2, z: COUNTER.maxZ + 0.6, y: G, radius: 2.4 };
  pick(group, counter, counter.x, COUNTER.top - 0.3, (COUNTER.minZ + COUNTER.maxZ) / 2, COUNTER.maxX - COUNTER.minX, 0.8, 1);
  const booth: Interactable = { kind: 'kinobooth', x: BOOTH2.x, z: BOOTH2.z, y: G, radius: 1.6 };
  pick(group, booth, BOOTH2.x, 0.9, BOOTH2.z, 0.7, 0.5, 0.7);
  const screens: [Interactable, Interactable] = [
    { kind: 'kinoscreen', x: SCREEN1.x - 8, z: SCREEN1.z, y: G, radius: 0 },
    { kind: 'kinoscreen', x: SCREEN2.x + 5, z: SCREEN2.z, y: G, radius: 0 },
  ];
  saal1.screen.userData.interact = screens[0];
  saal2.screen.userData.interact = screens[1];

  return {
    group,
    colliders,
    walls,
    saal1,
    saal2,
    marquee,
    foyer,
    doors,
    posters: [...posters.map((p: PosterCase) => p.mat), ...foyer.posters],
    seats,
    counter,
    booth,
    screens,
  };
}

declare module '../types' {
  interface OfficeHandles {
    /** Fork: the cinema on its block behind the office (world/kino/, features/kino). */
    kino: Kino;
  }
}

/** Fork: the cinema, down on the street in the outlook with the city round it. */
export const kino: Fixture<'kino', StreetSite> = (site) => {
  const built = buildKino();
  site.outlook.add(built.group);
  site.groundColliders.push(...built.colliders);
  return { handle: { kino: built } };
};
