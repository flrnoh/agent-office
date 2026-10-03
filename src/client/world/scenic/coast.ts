import * as THREE from 'three';
import { LIGHTHOUSE, LOOP, LOOP_HALF, PIER, shoreX } from '../../../shared/scenic';
import { bulb } from '../outside';
import { tilingCanvasTexture } from '../texture';
import { mergeByColor, mesh, textPlane, toon } from '../toon';
import { boulder } from './flora';
import { SAILBOATS } from '../../../shared/beach'; // flrnoh fork: a day at the beach
import { LADDER_GAP, buildJettyFun } from './jetty'; // fork
import { buildKiosk, type KioskSpot } from './kiosk'; // fork
import { buildVolleyCourt } from './volleycourt'; // fork
import { buildLighthouse } from './lighthouse'; // fork
import { buildParking } from './parking'; // fork
import { VOLLEY } from '../../../shared/volley'; // fork
import { G, beside, box, indexAt, stretch, type ScenicKit } from './kit';

/** A sailboat out on the water, and where it bobs. */
export interface Boat {
  g: THREE.Group;
  x: number;
  z: number;
  phase: number;
}

/** The beach, the pier and the boats, and the lighthouse out on its point. Returns the boats, to bob, the lighthouse's beam, to turn, and (fork) where the kiosk is. */
export function buildCoast(kit: ScenicKit): { boats: Boat[]; beam: THREE.Group; kiosk: KioskSpot } {
  const { root, labels, rand, parts, colliders, night, around, taken, light } = kit;
  let kiosk!: KioskSpot; // fork
  const boats: { g: THREE.Group; x: number; z: number; phase: number }[] = [];
  {
    const b = parts.beach;
    const colors = ['#ef476f', '#ffd166', '#06d6a0', '#118ab2', '#f78c6b', '#9b5de5'];
    // Umbrellas and towels on the sand.
    for (const s of stretch('beach')) {
      for (let d = s.from + 10; d < s.to - 6; d += 9 + rand() * 7) {
        const p = LOOP[indexAt(d)];
        const x = shoreX(p.z) + 9 + rand() * 12;
        const z = p.z + (rand() - 0.5) * 6;
        if (Math.abs(z - PIER.z) < 6) continue;
        const color = colors[Math.floor(rand() * colors.length)];
        const tilt = (rand() - 0.5) * 0.3;
        const towelColor = colors[Math.floor(rand() * colors.length)];
        const towelTurn = rand() * 0.6;
        // flrnoh fork: none on the volleyball court (its numbers taken all the same, or the trees move).
        if (Math.abs(x - VOLLEY.x) < VOLLEY.halfW + 4 && Math.abs(z - VOLLEY.z) < VOLLEY.halfL + 5) continue;
        b.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.5, 6), toon('#f1f1ee'), x, G + 1.25, z));
        const top = mesh(new THREE.ConeGeometry(1.5, 0.6, 8), toon(color), x, G + 2.45, z);
        top.rotation.z = tilt;
        b.add(top);
        const towel = mesh(box(0.9, 0.03, 1.9), toon(towelColor), x + 1.1, G + 0.02, z + 0.4, false);
        towel.rotation.y = towelTurn;
        b.add(towel);
        taken.push({ x, z, r: 2.5 });
      }
    }
    // A lifeguard's tower.
    {
      const p = LOOP[indexAt(stretch('beach')[0].from + 95)];
      const x = shoreX(p.z) + 12;
      const z = p.z;
      const wood = toon('#f1f1ee');
      for (const [dx, dz] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ])
        b.add(mesh(box(0.2, 2.6, 0.2), wood, x + dx, G + 1.3, z + dz));
      b.add(mesh(box(2.6, 0.2, 2.6), wood, x, G + 2.7, z));
      b.add(mesh(box(2.2, 1.6, 2.2), toon('#e63946'), x, G + 3.6, z));
      b.add(mesh(box(2.3, 0.1, 1.5), toon('#bde0fe'), x - 1.15, G + 3.8, z));
      b.add(mesh(new THREE.ConeGeometry(2, 0.9, 4).rotateY(Math.PI / 4), toon('#fefae0'), x, G + 4.85, z));
      b.add(mesh(box(0.1, 0.9, 0.6), toon('#fefae0'), x - 1.12, G + 3.9, z - 0.2));
      b.add(mesh(box(0.06, 3, 0.06), toon('#3d405b'), x + 1, G + 5.6, z + 1));
      b.add(mesh(box(0.05, 0.6, 0.9), toon('#ffd166'), x + 1, G + 6.7, z + 1.45));
      colliders.push({ minX: x - 1.3, maxX: x + 1.3, minZ: z - 1.3, maxZ: z + 1.3, bottom: G, top: G + 5 });
      taken.push({ x, z, r: 3 });
    }
    // flrnoh fork: the beach volleyball court, for playing (volleycourt.ts; features/beach/volley.ts plays on it), where the net stood.
    buildVolleyCourt(kit);
    // flrnoh fork: the beach car park, across the road from the kiosk (parking.ts).
    buildParking(kit);
    // flrnoh fork: the snack shack by the road is open (world/scenic/kiosk.ts; Uschi serves, features/beach).
    {
      const q = stretch('beach')[0].from + 130;
      const i = indexAt(q);
      const p = LOOP[i];
      const at = beside(i, LOOP_HALF + 7);
      // Its counter toward the road.
      const built = buildKiosk(b, labels, at.x, at.z, Math.atan2(p.tz, -p.tx));
      kiosk = built.spot;
      for (const r of built.boxes) colliders.push({ ...r, bottom: G, top: G + 2.8 });
      taken.push({ x: at.x, z: at.z, r: 6 });
    }
    // The pier, out into the sea on posts, with a rail along each side.
    {
      const x0 = shoreX(PIER.z) + 8;
      const x1 = shoreX(PIER.z) - PIER.length;
      const wood = toon('#b08968');
      const deck = 0.28;
      b.add(mesh(box(x0 - x1, 0.2, PIER.width), wood, (x0 + x1) / 2, G + deck - 0.1, PIER.z));
      for (let x = x1 + 1; x < x0; x += 4) {
        for (const s of [-1, 1]) {
          b.add(mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.6, 6), toon('#7f5539'), x, G - 0.5, PIER.z + s * (PIER.width / 2 - 0.2)));
          b.add(mesh(box(0.12, 1, 0.12), wood, x, G + deck + 0.5, PIER.z + s * (PIER.width / 2 - 0.1)));
        }
      }
      // The rails, the south one with a gap at the swim ladder (flrnoh fork: see LADDER_GAP).
      for (const [s, from] of [
        [-1, x1],
        [1, x1 + LADDER_GAP],
      ])
        b.add(mesh(box(x0 - 4 - from, 0.12, 0.12), wood, (x0 - 4 + from) / 2, G + deck + 0.95, PIER.z + s * (PIER.width / 2 - 0.1)));
      colliders.push({ minX: x1, maxX: x0, minZ: PIER.z - PIER.width / 2, maxZ: PIER.z + PIER.width / 2, bottom: G - 1, top: G + deck });
      for (const [s, from] of [
        [-1, x1],
        [1, x1 + LADDER_GAP],
      ])
        colliders.push({ minX: from, maxX: x0 - 4, minZ: PIER.z + s * (PIER.width / 2) - 0.1, maxZ: PIER.z + s * (PIER.width / 2) + 0.1, bottom: G + deck, top: G + deck + 1, fence: true });
      buildJettyFun(b, colliders, labels); // flrnoh fork: the open end, the diving board and the swim ladder
      taken.push({ x: x0 - 4, z: PIER.z, r: 6 });
      night.halos.push({ at: new THREE.Vector3(x1 + 1, G + 2.4, PIER.z), size: 1.6, color: '#ffe8a3', ground: true });
      b.add(mesh(box(0.12, 2.2, 0.12), toon('#3d405b'), x1 + 1, G + 1.3, PIER.z + 1.7));
      b.add(mesh(new THREE.SphereGeometry(0.18, 10, 8), bulb(night, '#ffe8a3', 0.1), x1 + 1, G + 2.4, PIER.z + 1.7, false));
    }
    // Sailboats out on the water, bobbing.
    for (const [x, z] of SAILBOATS) {
      const g = new THREE.Group();
      const hull = new THREE.Shape();
      hull.moveTo(-2.6, 0.9);
      hull.lineTo(2.9, 0.9);
      hull.lineTo(2.2, 0);
      hull.lineTo(-2.2, 0);
      hull.closePath();
      g.add(mesh(new THREE.ExtrudeGeometry(hull, { depth: 1.8, bevelEnabled: false }).translate(0, 0, -0.9), toon('#fefae0')));
      g.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 6.5, 6), toon('#6f4e37'), 0.3, 4, 0));
      const sail = new THREE.Shape();
      sail.moveTo(0, 0);
      sail.lineTo(0, 5.6);
      sail.lineTo(-2.8, 0);
      sail.closePath();
      g.add(mesh(new THREE.ShapeGeometry(sail), toon(colors[boats.length % colors.length]), 0.2, 1.2, 0));
      const boat = mergeByColor(g);
      boat.position.set(x, G - 0.3, z);
      boat.rotation.y = rand() * Math.PI * 2;
      root.add(boat);
      around(boat, x, z, 5);
      boats.push({ g: boat, x, z, phase: rand() * 6 });
    }
  }
  // The lighthouse out on its point, its beam going round at night (flrnoh fork: you can go up it, lighthouse.ts).
  const beam = buildLighthouse(kit);

  return { boats, beam, kiosk };
}
