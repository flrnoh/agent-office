import * as THREE from 'three';
import { FLOOR, SLAB, STREET_Y, WALL_T, roofDrop } from '../../shared/layout';
import { mulberry32 } from '../../shared/rng';
import { cityCasino } from './casino/exterior'; // fork
import { cityGym } from './gym/exterior'; // fork
import { cityHall } from './hall/exterior'; // fork
import { citySoccer } from './soccer/exterior'; // fork
import type { NightParts } from './outside';
import { mergeByMaterial, mesh, toon } from './toon';
import { buildTower } from './tower';
import { buildFacade } from './facade'; // fork: the building's outside, from up on the roof too

// flrnoh fork (see FORK.md): up on the roof, the office's own building under you and the clouds over
// the city. The city itself is the office's own (world/town/), the same from every floor, from the
// street and from up here: the roof borrows it, with the street and the country past it, while you're
// up there (see Office.lendOutlook), and puts it in `holder`, as far down as the building is tall.

/** The building, walls included. */
const B = { minX: FLOOR.minX - WALL_T, maxX: FLOOR.maxX + WALL_T, minZ: FLOOR.minZ - WALL_T, maxZ: FLOOR.maxZ + WALL_T } as const;

export interface City {
  group: THREE.Group;
  /**
   * Where the roof puts what it borrows from the office to look out at (the town, the street and the
   * country round it; see Office.lendOutlook): at street level, as far below the roof as the building is tall.
   */
  holder: THREE.Group;
  /** The building has `floors` floors under the roof: the street goes as far down as that is tall. */
  setFloors(floors: number, wings?: readonly number[]): void;
}

/**
 * Up on the roof: the office's own building, a floor per project from the street up to the roof and
 * the open garage at the bottom, the houses across the street as they look from up there, the clouds,
 * and the holder the town is put in while you're up there.
 */
export function buildCity(night: NightParts): City {
  const group = new THREE.Group();
  /** Everything down on the street, which is as far below the roof as the building is tall. */
  const street = new THREE.Group();
  group.add(street);
  const holder = new THREE.Group();
  group.add(holder);

  const building = buildTower([], night);
  group.add(building.group);
  const facade = buildFacade(night); // fork
  group.add(facade.group);
  const garage = new THREE.Group();
  const garageH = -STREET_Y - SLAB;
  const concrete = toon('#d3d6dd');
  garage.add(mesh(new THREE.BoxGeometry(B.maxX - B.minX, garageH, WALL_T), concrete, (B.minX + B.maxX) / 2, garageH / 2, B.minZ + WALL_T / 2, false));
  garage.add(mesh(new THREE.BoxGeometry(WALL_T, garageH, B.maxZ - B.minZ), concrete, B.minX + WALL_T / 2, garageH / 2, (B.minZ + B.maxZ) / 2, false));
  const column = new THREE.BoxGeometry(0.5, garageH, 0.5);
  for (const x of [B.maxX - 0.25, -9.6, 0, 9.6]) garage.add(mesh(column, toon('#e6e8ee'), x, garageH / 2, B.maxZ - 0.25, false));
  for (const z of [-6.5, 6.5, B.minZ + 0.25]) garage.add(mesh(column, toon('#e6e8ee'), B.maxX - 0.25, garageH / 2, z, false));
  garage.add(mesh(new THREE.PlaneGeometry(B.maxX - B.minX, B.maxZ - B.minZ).rotateX(-Math.PI / 2), toon('#9a9ea8'), (B.minX + B.maxX) / 2, 0.03, (B.minZ + B.maxZ) / 2, false));
  street.add(mergeByMaterial(garage));
  street.add(cityCasino()); // fork: the casino across the street (world/casino/exterior.ts)
  street.add(cityGym()); // fork: the gym across the street (world/gym/exterior.ts)
  street.add(cityHall()); // fork: the padel hall (world/hall/exterior.ts)
  street.add(citySoccer()); // fork: the soccer hall (world/soccer/exterior.ts)

  // Clouds, drifting past at about the height of the towers.
  // The same numbers every time, so everyone sees the same clouds.
  const r = mulberry32(20260927);
  const sky = new THREE.Group();
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2 + r();
    const dist = 220 + r() * 120;
    const c = new THREE.Group();
    for (const [dx, dy, rad] of [
      [0, 0, 9],
      [10, -2, 7],
      [-10, -2, 6.5],
      [4, 4, 6],
    ]) {
      const puff = mesh(new THREE.SphereGeometry(rad, 12, 9), night.clouds, dx, dy, 0, false);
      puff.scale.y = 0.7;
      c.add(puff);
    }
    c.position.set(Math.cos(a) * dist, 40 + r() * 50, Math.sin(a) * dist);
    c.lookAt(0, c.position.y, 0);
    sky.add(c);
  }
  group.add(mergeByMaterial(sky));

  let floorsNow = 0;
  let wingsNow = '';
  return {
    group,
    holder,
    setFloors(floors, wings = []) {
      floors = Math.max(1, floors);
      if (floors === floorsNow && wings.join() === wingsNow) return;
      floorsNow = floors;
      wingsNow = wings.join();
      const drop = roofDrop(floors);
      street.position.y = -drop;
      // What's lent to the roof is laid out with the street at STREET_Y, as it is from the bottom floor.
      holder.position.y = -drop - STREET_Y;
      building.set(floors, floors, wings);
      facade.set(floors, floors); // fork
    },
  };
}
