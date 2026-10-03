import * as THREE from 'three';
import { BEACH_PARKING } from '../../../shared/beach';
import { supercar } from '../../features/cars/world';
import { bulb } from '../outside';
import { mesh, textPlane, toon } from '../toon';
import { G, box, type ScenicKit } from './kit';

// The beach car park (flrnoh fork, see FORK.md "A day at the beach"): across the road from the kiosk,
// asphalt with its bays marked out either side of an aisle, a driveway off the road, the blue P on
// its post, the ticket machine (free today), two lamps, a bike rack, and a few cars parked already.
// There's room for your own: drive in and park.

const P = BEACH_PARKING;

export function buildParking(kit: ScenicKit) {
  const { root, parts, labels, colliders, night, taken, around } = kit;
  const b = parts.coast;
  const asphalt = toon('#4a4e57');
  const paint = toon('#f1f1ee');
  const dark = toon('#3d405b');
  const w = P.maxX - P.minX;
  const d = P.maxZ - P.minZ;
  const cx = (P.minX + P.maxX) / 2;
  const cz = (P.minZ + P.maxZ) / 2;
  b.add(mesh(box(w, 0.04, d), asphalt, cx, G + 0.02, cz, false));
  // The driveway, from the road's edge to the car park's.
  b.add(mesh(box(P.minX - P.drive.fromX, 0.04, P.drive.width), asphalt, (P.minX + P.drive.fromX) / 2, G + 0.018, P.drive.z, false));
  // A kerb round it, but for the driveway.
  const kerb = toon('#c9c5bb');
  b.add(mesh(box(0.2, 0.12, d), kerb, P.maxX, G + 0.06, cz, false));
  for (const z of [P.minZ, P.maxZ]) b.add(mesh(box(w, 0.12, 0.2), kerb, cx, G + 0.06, z, false));
  for (const [z0, z1] of [
    [P.minZ, P.drive.z - P.drive.width / 2],
    [P.drive.z + P.drive.width / 2, P.maxZ],
  ])
    b.add(mesh(box(0.2, 0.12, z1 - z0), kerb, P.minX, G + 0.06, (z0 + z1) / 2, false));
  // The bays: lines across each side's row, and the edge of the aisle; a P painted in the aisle.
  for (const [x0, x1] of [
    [P.minX, P.minX + P.bay.depth],
    [P.maxX - P.bay.depth, P.maxX],
  ]) {
    for (let z = P.minZ + 0.5; z <= P.maxZ - 0.5 + 1e-6; z += P.bay.width) {
      if (x0 === P.minX && Math.abs(z - P.drive.z) < P.drive.width / 2 + 0.1) continue;
      b.add(mesh(box(x1 - x0, 0.01, 0.12), paint, (x0 + x1) / 2, G + 0.045, z, false));
    }
  }
  for (const [z, x] of [
    [cz - 8, cx],
    [cz + 8, cx],
  ]) {
    const p = textPlane('P', { color: '#f1f1ee', size: 140 });
    p.rotation.x = -Math.PI / 2;
    p.position.set(x, G + 0.05, z);
    labels.add(p);
  }
  // The blue P on its post at the driveway, facing the road.
  {
    const x = P.minX - 1;
    const z = P.drive.z - P.drive.width / 2 - 0.8;
    b.add(mesh(box(0.08, 2.6, 0.08), toon('#adb5bd'), x, G + 1.3, z));
    const sign = textPlane('🅿️ Strandparkplatz', { color: '#ffffff', bg: '#1d4ed8', border: '#ffffff', size: 46 });
    sign.scale.setScalar(0.85);
    sign.position.set(x - 0.06, G + 2.75, z);
    sign.rotation.y = -Math.PI / 2;
    labels.add(sign);
    const back = sign.clone();
    back.position.x = x + 0.06;
    back.rotation.y = Math.PI / 2;
    labels.add(back);
    colliders.push({ minX: x - 0.1, maxX: x + 0.1, minZ: z - 0.1, maxZ: z + 0.1, bottom: G, top: G + 2.6 });
  }
  // The ticket machine by the driveway: free today.
  {
    const x = P.minX + 0.6;
    const z = P.drive.z + P.drive.width / 2 + 1.2;
    b.add(mesh(box(0.5, 1.5, 0.4), toon('#ffd166'), x, G + 0.75, z));
    b.add(mesh(box(0.02, 0.3, 0.25), toon('#1d3557'), x - 0.26, G + 1.2, z, false));
    b.add(mesh(box(0.02, 0.06, 0.18), dark, x - 0.26, G + 0.85, z, false));
    const t = textPlane('Parken heute gratis 🏖️', { color: '#1d3557', bg: '#fefae0', size: 34 });
    t.scale.setScalar(0.55);
    t.position.set(x - 0.27, G + 1.62, z);
    t.rotation.y = -Math.PI / 2;
    labels.add(t);
    colliders.push({ minX: x - 0.3, maxX: x + 0.3, minZ: z - 0.25, maxZ: z + 0.25, bottom: G, top: G + 1.5 });
  }
  // Two lamps along the aisle, for the evening.
  for (const z of [cz - d / 4, cz + d / 4]) {
    const x = P.maxX + 0.5;
    b.add(mesh(box(0.12, 4.2, 0.12), dark, x, G + 2.1, z));
    b.add(mesh(box(1.1, 0.1, 0.25), dark, x - 0.5, G + 4.2, z));
    b.add(mesh(box(0.5, 0.08, 0.22), bulb(night, '#ffe8a3', 0.1), x - 0.85, G + 4.12, z, false));
    night.halos.push({ at: new THREE.Vector3(x - 0.85, G + 4.1, z), size: 2.4, color: '#ffe8a3', ground: true });
    colliders.push({ minX: x - 0.1, maxX: x + 0.1, minZ: z - 0.1, maxZ: z + 0.1, bottom: G, top: G + 4.2 });
  }
  // A bike rack at the far end.
  {
    const z = P.maxZ - 0.9;
    for (let k = 0; k < 5; k++) {
      const hoop = mesh(new THREE.TorusGeometry(0.35, 0.03, 6, 12, Math.PI), toon('#adb5bd'), cx - 1.6 + k * 0.8, G, z);
      b.add(hoop);
    }
  }
  // Cars parked already, in bays on either side.
  for (const c of P.parked) {
    const car = supercar(c.kind, c.color);
    car.root.position.set(c.x, G, c.z);
    car.root.rotation.y = c.rotY;
    root.add(car.root);
    around(car.root, c.x, c.z, 3);
    const half = { x: Math.abs(Math.sin(c.rotY)) > 0.5 ? 2.3 : 1, z: Math.abs(Math.sin(c.rotY)) > 0.5 ? 1 : 2.3 };
    colliders.push({ minX: c.x - half.x, maxX: c.x + half.x, minZ: c.z - half.z, maxZ: c.z + half.z, bottom: G, top: G + 1.1 });
  }
  for (const [x, z] of [
    [cx, P.minZ + d * 0.25],
    [cx, cz],
    [cx, P.minZ + d * 0.75],
  ])
    taken.push({ x, z, r: Math.max(w, d / 3) / 2 + 3 });
}
