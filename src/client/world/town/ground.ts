import * as THREE from 'three';
import { BLOCKS, BLOCK_INNER, CITY_ROAD, CITY_WALK, CROSSINGS, PARK_TREES, STREETS, pavedCorners, stretchRect } from '../../../shared/city';
import { roadTexture } from '../outside';
import { mergeByMaterial, mesh, toon } from '../toon';
import type { Collider } from '../types';
import { Flats, G, LAMP_EVERY, LAMP_H, flat } from './kit';

// flrnoh fork (see FORK.md): the city's ground (see town/index.ts): sidewalks along every street, the
// streets, the crossings with their zebras, the blocks' lots and the parks' lawns and trees, and the
// street lamps down both sides of every street.

/** Lays the city's ground, parks and lamp posts into `group`; hands back the lamps' glow, lit at night. */
export function buildTownGround(group: THREE.Group, colliders: Collider[], glow: THREE.Texture): THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial> {
  // ---- The ground: sidewalks along every street, the streets, the crossings, the blocks ----------
  const walks = new Flats();
  const roads = new Flats();
  const cross = new Flats();
  const zebra = new Flats();
  const lots = new Flats();
  const lawns = new Flats();
  const h = CITY_ROAD / 2;
  const hw = h + CITY_WALK;
  for (const s of STREETS) {
    const rr = stretchRect(s);
    if (s.alongX) {
      walks.add(rr.minX, rr.maxX, rr.minZ - CITY_WALK, rr.maxZ + CITY_WALK, G - 0.02);
      roads.add(rr.minX, rr.maxX, rr.minZ, rr.maxZ, G - 0.008, { alongX: true, per: 8 });
    } else {
      walks.add(rr.minX - CITY_WALK, rr.maxX + CITY_WALK, rr.minZ, rr.maxZ, G - 0.02);
      roads.add(rr.minX, rr.maxX, rr.minZ, rr.maxZ, G - 0.008, { alongX: false, per: 8 });
    }
  }
  for (const c of CROSSINGS) {
    // Over the lane markings where two streets cross (on the office's street, its own asphalt does).
    if ((c.north || c.south) && (c.east || c.west) && c.b !== 0) cross.add(c.x - h, c.x + h, c.z - h, c.z + h, G - 0.006);
    const k = pavedCorners(c);
    for (const [on, sx, sz] of [
      [k.ne, 1, -1],
      [k.nw, -1, -1],
      [k.se, 1, 1],
      [k.sw, -1, 1],
    ] as const) {
      if (!on) continue;
      const x0 = c.x + sx * h;
      const z0 = c.z + sz * h;
      cross.add(Math.min(x0, x0 + sx * CITY_WALK), Math.max(x0, x0 + sx * CITY_WALK), Math.min(z0, z0 + sz * CITY_WALK), Math.max(z0, z0 + sz * CITY_WALK), G - 0.006);
    }
    // A zebra across each street that leaves it, just outside the crossing.
    const stripes = (x0: number, x1: number, z0: number, z1: number, alongX: boolean) => {
      for (let q = -h + 0.6; q < h - 0.4; q += 1.2) {
        if (alongX) zebra.add(x0, x1, c.z + q, c.z + q + 0.6, G - 0.004);
        else zebra.add(c.x + q, c.x + q + 0.6, z0, z1, G - 0.004);
      }
    };
    if (c.b === 0) continue; // the office's street has its own crossing at the start line
    if (c.north && (c.east || c.west)) stripes(0, 0, c.z - hw - 0.2, c.z - h - 0.3, false);
    if (c.south && (c.east || c.west)) stripes(0, 0, c.z + h + 0.3, c.z + hw + 0.2, false);
    if (c.east && (c.north || c.south)) stripes(c.x + h + 0.3, c.x + hw + 0.2, 0, 0, true);
    if (c.west && (c.north || c.south)) stripes(c.x - hw - 0.2, c.x - h - 0.3, 0, 0, true);
  }
  const inner = BLOCK_INNER;
  for (const b of BLOCKS) {
    if (b.kind === 'city' || b.kind === 'landmark') lots.add(b.x - inner / 2, b.x + inner / 2, b.z - inner / 2, b.z + inner / 2, G - 0.015);
    else if (b.kind === 'park') lawns.add(b.x - inner / 2, b.x + inner / 2, b.z - inner / 2, b.z + inner / 2, G - 0.015);
  }
  const road = roadTexture();
  const ground = new THREE.Group();
  ground.add(walks.mesh(flat('#d9d3c5', 1)), lots.mesh(flat('#c2bcaf', 2)), lawns.mesh(flat('#8fcf7a', 2)), roads.mesh(flat('#ffffff', 3, road)), cross.mesh(flat('#5b606c', 4)), zebra.mesh(flat('#f1f1f1', 5)));
  group.add(ground);

  // ---- The parks' trees ---------------------------------------------------------------------------
  const parks = new THREE.Group();
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.32, 2.4, 6);
  const crownGeo = new THREE.SphereGeometry(1.9, 8, 6);
  for (const t of PARK_TREES) {
    const trunk = mesh(trunkGeo, toon('#8a5a3b'), t.x, G + 1.2 * t.s, t.z, false);
    trunk.scale.setScalar(t.s);
    parks.add(trunk);
    const crown = mesh(crownGeo, toon(t.dark ? '#4ea657' : '#5fb760'), t.x, G + 3.4 * t.s, t.z, false);
    crown.scale.setScalar(t.s);
    parks.add(crown);
    const rad = 0.3 * t.s;
    colliders.push({ minX: t.x - rad, maxX: t.x + rad, minZ: t.z - rad, maxZ: t.z + rad, bottom: G, top: G + 2.4 * t.s });
  }
  group.add(mergeByMaterial(parks));

  // ---- Street lamps down both sides of every street, and their glow at night ------------------------
  const posts = new THREE.Group();
  const lampPos: number[] = [];
  const ink = toon('#3d405b');
  const lampGlass = toon('#fff3d6', { emissive: '#fff3d6' });
  const pole = new THREE.CylinderGeometry(0.08, 0.1, LAMP_H, 6);
  const arm = new THREE.BoxGeometry(0.08, 0.08, 1.3);
  const head = new THREE.BoxGeometry(0.5, 0.18, 0.34);
  for (const s of STREETS) {
    const rr = stretchRect(s);
    const from = s.alongX ? rr.minX : rr.minZ;
    const to = s.alongX ? rr.maxX : rr.maxZ;
    for (let a = from + 12 + (Math.abs(s.a * 7 + s.b * 3) % 3) * 4; a < to - 10; a += LAMP_EVERY) {
      for (const side of [-1, 1]) {
        // On the sidewalk's outer half, the arm out over the road.
        const off = side * (h + CITY_WALK * 0.6);
        const x = s.alongX ? a : (rr.minX + rr.maxX) / 2 + off;
        const z = s.alongX ? (rr.minZ + rr.maxZ) / 2 + off : a;
        posts.add(mesh(pole, ink, x, G + LAMP_H / 2, z, false));
        const ax = s.alongX ? x : x - side * 0.6;
        const az = s.alongX ? z - side * 0.6 : z;
        const armMesh = mesh(arm, ink, ax, G + LAMP_H - 0.05, az, false);
        if (!s.alongX) armMesh.rotation.y = Math.PI / 2;
        posts.add(armMesh);
        const hx = s.alongX ? x : x - side * 1.2;
        const hz = s.alongX ? z - side * 1.2 : z;
        posts.add(mesh(head, lampGlass, hx, G + LAMP_H - 0.15, hz, false));
        lampPos.push(hx, G + LAMP_H - 0.3, hz);
        colliders.push({ minX: x - 0.15, maxX: x + 0.15, minZ: z - 0.15, maxZ: z + 0.15, bottom: G, top: G + LAMP_H });
      }
    }
  }
  group.add(mergeByMaterial(posts));
  const lampGeo = new THREE.BufferGeometry();
  lampGeo.setAttribute('position', new THREE.Float32BufferAttribute(lampPos, 3));
  const lamps = new THREE.Points(lampGeo, new THREE.PointsMaterial({ size: 4, map: glow, color: '#ffcf8a', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  lamps.visible = false;
  lamps.raycast = () => {};
  group.add(lamps);
  return lamps;
}
