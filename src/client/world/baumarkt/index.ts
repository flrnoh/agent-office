import * as THREE from 'three';
import { CORRAL, FORKLIFT, PALLETS, TROLLEY_COUNT, corralSlot, forkBody, palletBox, type BaumarktState } from '../../../shared/baumarkt-play';
import { CASHIER, CHECKOUTS, GLASSHOUSE, HALL, PAINT_COUNTER, TOOL_WALL } from '../../../shared/baumarkt';
import { streetBelow } from '../../../shared/layout';
import type { Fixture, StreetSite } from '../office/fixture';
import type { NightParts } from '../outside';
import { addRoof } from '../roofs';
import type { Collider } from '../types';
import { G } from '../town/kit';
import { buildHall } from './hall';
import { buildInterior } from './interior';
import { indoorGlow, pickBox } from './kit';
import { forkliftModel, palletModel, trolleyModel, type ForkliftModel } from './models';
import { buildOutdoor } from './outdoor';

export { indoorGlow } from './kit';

// flrnoh fork (see FORK.md "The Baumarkt"): HAMMER & CO on its block north-east of the office, down on
// the street with the city (the `baumarkt` fixture builds it into the outlook, so it's there from every
// floor and from the roof). The building and everything round it are built once and merged; what
// moves (the forklift, its pallets, the trolleys) is placed each frame from the store by
// features/baumarkt, and keeps a box of its own for anyone walking into it.

export interface BaumarktWorld {
  group: THREE.Group;
  forklift: ForkliftModel;
  pallets: THREE.Group[];
  trolleys: { group: THREE.Group; wheels: THREE.Mesh[] }[];
  /** The sliding doors: 0 shut to 1 open. */
  doors(k: number): void;
  shaker: THREE.Group;
  shakerCan: THREE.Mesh<THREE.BufferGeometry, THREE.MeshToonMaterial>;
  /** What the crosshair lands on for each thing to use (features/baumarkt puts the interactable in their userData). */
  picks: { toolwall: THREE.Mesh; mixer: THREE.Mesh; till: THREE.Mesh; forklift: THREE.Mesh; trolleys: THREE.Mesh[] };
  /** Puts the forklift, the pallets and the trolleys where `s` has them (the forklift at `fork`, its forks at `lift`), and their boxes with them. */
  place(s: BaumarktState, fork: { x: number; z: number; rotY: number; lift: number }): void;
  /** How dark it is (0–1): the hall's lights and the signs. */
  light(dark: number): void;
  /** Where the street is in the frame the moving boxes are in (the floor you're on's). */
  setStreet(y: number): void;
}

declare module '../types' {
  interface OfficeHandles {
    /** Fork: the Baumarkt (world/baumarkt/), down on the street. */
    baumarkt: BaumarktWorld;
  }
}

/** Builds it all into a group of its own: what's in the way goes in `colliders`, the boxes of what moves in `moving`. */
export function buildBaumarkt(colliders: Collider[], moving: Collider[], night: NightParts): BaumarktWorld {
  const group = new THREE.Group();
  const hall = buildHall(group, colliders, night);
  const inside = buildInterior(group, colliders);
  const lit = [...hall.lit, ...buildOutdoor(group, colliders, night)];
  for (const b of [HALL, GLASSHOUSE, { minX: CORRAL.x - 2.2, maxX: CORRAL.x + 2.2, minZ: CORRAL.z - 1, maxZ: CORRAL.z + 1 }, { minX: HALL.minX + 4.5, maxX: HALL.minX + 17.5, minZ: HALL.maxZ, maxZ: HALL.maxZ + 3.6 }]) addRoof(b);

  const forklift = forkliftModel();
  group.add(forklift.group);
  const pallets = PALLETS.map((p) => {
    const m = palletModel(p.load);
    group.add(m);
    return m;
  });
  const trolleys = Array.from({ length: TROLLEY_COUNT }, (_, i) => {
    const t = trolleyModel();
    const at = corralSlot(i);
    t.group.position.set(at.x, G, at.z);
    t.group.rotation.y = at.rotY;
    group.add(t.group);
    return t;
  });
  // What the crosshair lands on: the tool wall, the shaker's counter, the till, and on what moves.
  const pc = PAINT_COUNTER;
  const c0 = CHECKOUTS[0];
  const picks = {
    toolwall: pickBox(0.6, 2.8, TOOL_WALL.z1 - TOOL_WALL.z0, TOOL_WALL.x - 0.3, G + 0.4, (TOOL_WALL.z0 + TOOL_WALL.z1) / 2),
    mixer: pickBox(pc.maxX - pc.minX + 0.1, 2.1, pc.maxZ - pc.minZ, (pc.minX + pc.maxX) / 2 - 0.05, G, (pc.minZ + pc.maxZ) / 2),
    till: pickBox(CASHIER.x + 0.4 - c0.minX, 1.9, c0.maxZ - c0.minZ, (CASHIER.x + 0.4 + c0.minX) / 2, G, (c0.minZ + c0.maxZ) / 2),
    forklift: pickBox(FORKLIFT.HALF_W * 2 + 0.2, 2.5, FORKLIFT.NOSE - FORKLIFT.REAR + 0.3, 0, 0, (FORKLIFT.NOSE + FORKLIFT.REAR) / 2),
    trolleys: trolleys.map((t) => {
      const m = pickBox(0.72, 1.1, 1.25, 0, 0, 0);
      t.group.add(m);
      return m;
    }),
  };
  group.add(picks.toolwall, picks.mixer, picks.till);
  forklift.group.add(picks.forklift);
  // The forklift's and the pallets' boxes, where they are (in the frame of the floor you're on).
  const fork: Collider = { minX: 0, maxX: 0, minZ: 0, maxZ: 0, bottom: 0, top: 0 };
  const palletBoxes: Collider[] = PALLETS.map(() => ({ minX: 0, maxX: 0, minZ: 0, maxZ: 0, bottom: 0, top: 0 }));
  moving.push(fork, ...palletBoxes);
  let street = G;
  return {
    group,
    forklift,
    pallets,
    trolleys,
    doors: hall.open,
    shaker: inside.shaker,
    shakerCan: inside.shakerCan,
    picks,
    place(s, f) {
      forklift.group.position.set(f.x, G, f.z);
      forklift.group.rotation.y = f.rotY;
      forklift.carriage.position.y = f.lift;
      const b = forkBody(f);
      const ex = Math.abs(Math.cos(f.rotY)) * b.hw + Math.abs(Math.sin(f.rotY)) * b.hl;
      const ez = Math.abs(Math.sin(f.rotY)) * b.hw + Math.abs(Math.cos(f.rotY)) * b.hl;
      Object.assign(fork, { minX: b.at.x - ex, maxX: b.at.x + ex, minZ: b.at.z - ez, maxZ: b.at.z + ez, bottom: street, top: street + 2.3 });
      s.pallets.forEach((p, i) => {
        const m = pallets[i];
        if (!m) return;
        m.position.set(p.x, G + p.y, p.z);
        m.rotation.y = p.rotY;
        const box = palletBox(p);
        // Carried, it's the forklift's; on the floor, a step up onto it.
        Object.assign(palletBoxes[i], p.y > 0.05 ? { minX: 0, maxX: 0, minZ: 0, maxZ: 0, bottom: 0, top: 0 } : { ...box, bottom: street, top: street + 0.15 + 0.85 });
      });
      s.trolleys.forEach((t, i) => {
        const m = trolleys[i];
        if (!m) return;
        m.group.position.x = t.x;
        m.group.position.z = t.z;
        m.group.rotation.y = t.rotY;
      });
    },
    light(dark) {
      indoorGlow.value = 0.1 + 0.5 * dark;
      for (const m of lit) m.color.setScalar(0.85 + 0.15 * dark);
    },
    setStreet: (y) => void (street = y),
  };
}

/** Fork: the Baumarkt, in the outlook with the city round it. */
export const baumarkt: Fixture<'baumarkt', StreetSite> = (site) => {
  const moving: Collider[] = [];
  const built = buildBaumarkt(site.groundColliders, moving, site.get('night'));
  site.outlook.add(built.group);
  return {
    // The forklift and the pallets move, so their boxes follow them (and the street) themselves, like the city's cars.
    colliders: moving,
    setLevel: (index) => built.setStreet(streetBelow(index)),
    handle: { baumarkt: built },
  };
};
