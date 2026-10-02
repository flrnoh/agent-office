import * as THREE from 'three';
import { LOTS, type Lot } from '../../../shared/city';
import type { NightParts } from '../outside';
import { mergeByMaterial, mesh, toon } from '../toon';
import type { Collider } from '../types';
import { G, PAINTS, Walls, bayTexture, litTexture, rise } from './kit';
import { SHOP_H, hasShops } from '../../../shared/shops';
import { lotColliders } from '../../../shared/shop-rooms';

// flrnoh fork (see FORK.md): the city's buildings (see town/index.ts), a material for each paint, their
// roofs, and what's on them (masts with blinking beacons, water tanks, plant), put up as tall as the
// building's height leaves the roof its view (see rise).

export interface TownBuildings {
  /** Puts up the buildings, each as tall as `rise` says with the street `drop` below the roof. */
  raise(drop: number): void;
  /** The masts' red beacons. */
  beaconMat: THREE.PointsMaterial;
}

export function buildTownBuildings(group: THREE.Group, colliders: Collider[], night: NightParts, glow: THREE.Texture): TownBuildings {
  // Solid, but for the shops on the ground floor: their rooms, walls and what stands in them (shared/shops.ts).
  LOTS.forEach((_, li) => {
    for (const c of lotColliders(li)) colliders.push({ minX: c.minX, maxX: c.maxX, minZ: c.minZ, maxZ: c.maxZ, bottom: G + c.bottom, top: G + c.top, fence: true });
  });
  const gradient = (toon('#fff') as THREE.MeshToonMaterial).gradientMap;
  const paintMats = new Map<number, THREE.MeshToonMaterial>();
  const paintOf = (i: number) => {
    let m = paintMats.get(i);
    if (!m) {
      const p = PAINTS[i];
      const lit = litTexture(p, i + 1);
      lit.repeat.set(1 / 16, 1 / 16);
      m = new THREE.MeshToonMaterial({ map: bayTexture(p), emissive: '#ffffff', emissiveMap: lit, emissiveIntensity: 0, gradientMap: gradient });
      night.windows.push(m);
      paintMats.set(i, m);
    }
    return m;
  };
  const roofs = toon('#a19d97');
  const mastGeo = new THREE.CylinderGeometry(0.2, 0.35, 12, 6);
  const legGeo = new THREE.CylinderGeometry(0.12, 0.12, 2.4, 5);
  const tankGeo = new THREE.CylinderGeometry(1.6, 1.6, 3.2, 12);
  const capGeo = new THREE.ConeGeometry(1.8, 1.3, 12);
  const unitGeo = new THREE.BoxGeometry(1, 1.6, 1);
  const beaconMat = new THREE.PointsMaterial({ size: 5, map: glow, color: '#ff3b30', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const beaconPoints = new THREE.Points(new THREE.BufferGeometry(), beaconMat);
  beaconPoints.raycast = () => {};
  group.add(beaconPoints);
  let raised: THREE.Object3D[] = [];

  /** Puts up the buildings, each as tall as `rise` says with the street `drop` below the roof. */
  const raise = (drop: number) => {
    for (const o of raised) {
      o.removeFromParent();
      o.traverse((m) => {
        if ((m as THREE.Mesh).isMesh) (m as THREE.Mesh).geometry.dispose();
      });
    }
    raised = [];
    const walls = new Map<number, Walls>();
    const tops = new Walls();
    const extras = new THREE.Group();
    const beacons: number[] = [];
    const up = (lot: Lot) => {
      const k = rise(lot.ring, drop);
      let bucket = walls.get(lot.paint);
      if (!bucket) walls.set(lot.paint, (bucket = new Walls()));
      // Over a ground floor of shops (town/shops.ts), the walls start a storey up, and go one more at least.
      const shops = hasShops(lot);
      let topY = shops ? Math.max(G + lot.h * k, G + SHOP_H + 3.3) : G + lot.h * k;
      bucket.box(lot.x, lot.z, lot.w, lot.d, shops ? G + SHOP_H : G, topY, lot.ou, lot.ov);
      let tw = lot.w;
      let td = lot.d;
      if (lot.step) {
        tops.top(lot.x, lot.z, lot.w, lot.d, topY);
        tw = lot.step.w;
        td = lot.step.d;
        bucket.box(lot.x, lot.z, tw, td, topY, topY + lot.step.up * k, lot.ou + 5, lot.ov + 3);
        topY += lot.step.up * k;
      }
      tops.top(lot.x, lot.z, tw, td, topY);
      const top = lot.top;
      if (top?.kind === 'mast') {
        extras.add(mesh(mastGeo, toon('#8d99ae'), lot.x, topY + 6, lot.z, false));
        beacons.push(lot.x, topY + 12.3, lot.z);
      } else if (top?.kind === 'tank') {
        const wt = new THREE.Group();
        for (const [sx, sz] of [
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ])
          wt.add(mesh(legGeo, toon('#5b3a29'), sx * 1.1, 1.2, sz * 1.1, false));
        wt.add(mesh(tankGeo, toon('#9c6b4a'), 0, 4, 0, false));
        wt.add(mesh(capGeo, toon('#6b4a35'), 0, 6.25, 0, false));
        wt.position.set(top.x, topY, top.z);
        extras.add(wt);
      } else if (top?.kind === 'plant') {
        const unit = mesh(unitGeo, toon('#c9ccd4'), top.x, topY + 0.8, top.z, false);
        unit.scale.set(top.w, 1, top.d);
        extras.add(unit);
      }
    };
    for (const lot of LOTS) up(lot);
    for (const [paint, w] of walls) raised.push(new THREE.Mesh(w.geometry(), paintOf(paint)));
    raised.push(new THREE.Mesh(tops.geometry(), roofs), mergeByMaterial(extras));
    for (const o of raised) o.traverse((m) => ((m as THREE.Mesh).receiveShadow = true));
    group.add(...raised);
    beaconPoints.geometry.dispose();
    beaconPoints.geometry = new THREE.BufferGeometry();
    beaconPoints.geometry.setAttribute('position', new THREE.Float32BufferAttribute(beacons, 3));
  };
  return { raise, beaconMat };
}
