import * as THREE from 'three';
import { GALLERY_LANDING, GALLERY_STAIRS } from '../../../shared/venue-house';
import type { Collider } from '../types';
import { mesh, toon } from '../toon';
import { box } from '../casino/parts';

/*
 * The steel stair up to the Schallwerk's gallery (flrnoh fork, see FORK.md "The Schallwerk"): open
 * treads on two stringers along the gallery's front, a landing against the wing's wall, a handrail
 * on the open side. Each tread is solid down to the floor for walking (the space under a stair is
 * nobody's way anyway).
 */
export function buildGalleryStairs(parts: THREE.Group, colliders: Collider[]) {
  const S = GALLERY_STAIRS;
  const L = GALLERY_LANDING;
  const steel = toon('#2b2d33');
  const tread = toon('#5a5d66');
  const rise = S.top / S.steps;
  const run = (S.lowX - S.highX) / S.steps;
  const w = S.maxZ - S.minZ;
  const cz = (S.minZ + S.maxZ) / 2;
  for (let i = 0; i < S.steps; i++) {
    const top = rise * (i + 1);
    const x1 = S.lowX - run * i;
    const x0 = x1 - run;
    parts.add(mesh(box(run + 0.02, 0.05, w), tread, (x0 + x1) / 2, top - 0.025, cz));
    colliders.push({ minX: x0, maxX: x1, minZ: S.minZ, maxZ: S.maxZ, top });
  }
  // The stringers, one each side, sloping from the floor to the landing.
  const len = Math.hypot(S.lowX - S.highX, S.top);
  const slope = Math.atan2(S.top, S.lowX - S.highX);
  for (const z of [S.minZ + 0.04, S.maxZ - 0.04]) {
    const st = mesh(box(len, 0.28, 0.06), steel, (S.lowX + S.highX) / 2, S.top / 2 - 0.12, z);
    st.rotation.z = -slope;
    parts.add(st);
  }
  // The landing on its posts, against the wing's wall.
  parts.add(mesh(box(L.maxX - L.minX, 0.12, w), tread, (L.minX + L.maxX) / 2, S.top - 0.06, cz));
  colliders.push({ minX: L.minX, maxX: L.maxX, minZ: L.minZ, maxZ: L.maxZ, top: S.top });
  for (const x of [L.minX + 0.1, L.maxX - 0.1]) parts.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, S.top), steel, x, S.top / 2, S.maxZ - 0.08));
  // The handrail on the open (hall) side, up the flight and along the landing.
  const railZ = S.maxZ - 0.03;
  const rail = mesh(box(len, 0.05, 0.05), steel, (S.lowX + S.highX) / 2, S.top / 2 + 0.95, railZ);
  rail.rotation.z = -slope;
  parts.add(rail);
  parts.add(mesh(box(L.maxX - L.minX, 0.05, 0.05), steel, (L.minX + L.maxX) / 2, S.top + 0.95, railZ));
  for (let k = 0; k <= 8; k++) {
    const x = S.lowX - ((S.lowX - S.highX) * k) / 8;
    const y = (S.top * k) / 8;
    parts.add(mesh(box(0.04, 0.95, 0.04), steel, x, y + 0.475, railZ));
  }
  for (const x of [L.minX + 0.3, (L.minX + L.maxX) / 2]) parts.add(mesh(box(0.04, 0.95, 0.04), steel, x, S.top + 0.475, railZ));
  // A sign at the foot.
  parts.add(mesh(box(0.04, 0.3, 0.9), toon('#ffd166'), S.lowX + 0.15, 1.1, cz));
}
