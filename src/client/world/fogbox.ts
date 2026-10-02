import * as THREE from 'three';
import { FLOOR, WALL_HEIGHT, WALL_T, WING, wingMinZ } from '../../shared/layout';
export { underRoof } from './roofs'; // fork: the street's roofs keep the rain off too (world/roofs.ts), for sky.ts

/*
 * Fog stays outside (flrnoh fork, see FORK.md). The haze (sky.ts, HAZE) counts only the part of the
 * way from your eye to what you're looking at that runs outdoors: the stretch through the office on
 * your floor (walls included, up to the top of its walls) and through its back office, when the
 * floor's built out into one, is clear air. So inside, the room is clear and the street through the
 * windows is as foggy as out there; from the balcony, the room through the windows is as clear as
 * the few meters of fog in front of the glass let it be. The garage, the balcony, the fire escape and
 * the street stay foggy, and on the roof and on other maps nothing changes.
 *
 * The same math twice: in TypeScript (for the tests) and in GLSL (FOGBOX_PARS).
 */

export type Box = { min: readonly [number, number, number]; max: readonly [number, number, number] };
type V3 = readonly [number, number, number];

/** How much of the segment from `o` to `p` (0–1, as a share of its length) runs through `box`. */
export function segmentInBox(o: V3, p: V3, box: Box): number {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 3; i++) {
    const d = p[i] - o[i];
    // The same guard as the shader's: a direction along an axis is never quite zero.
    const inv = (d >= 0 ? 1 : -1) / Math.max(Math.abs(d), 1e-6);
    const a = (box.min[i] - o[i]) * inv;
    const b = (box.max[i] - o[i]) * inv;
    lo = Math.max(lo, Math.min(a, b));
    hi = Math.min(hi, Math.max(a, b));
  }
  return Math.max(hi - lo, 0);
}

/** How much of the way from `o` to `p` runs outdoors, 0–1: out of all the (non-overlapping) `rooms`. */
export function outdoorShare(o: V3, p: V3, rooms: readonly Box[]): number {
  let inside = 0;
  for (const r of rooms) inside += segmentInBox(o, p, r);
  return Math.max(1 - inside, 0);
}

/** The office on your floor, walls included, from just under its floor to the top of its walls. */
export const OFFICE_ROOM: Box = { min: [FLOOR.minX - WALL_T, -0.1, FLOOR.minZ - WALL_T], max: [FLOOR.maxX + WALL_T, WALL_HEIGHT, FLOOR.maxZ + WALL_T] };

/** The back office, built out `level` rows (see WING), walls included; up to the office's box, not into it. Null without. */
export function wingRoom(level: number): Box | null {
  if (level <= 0) return null;
  return { min: [WING.minX - WALL_T, -0.1, wingMinZ(level) - WALL_T], max: [WING.maxX + WALL_T, WALL_HEIGHT, FLOOR.minZ - WALL_T] };
}

/** A box nothing is in: no way runs through it. */
const NOWHERE = new THREE.Vector3(0, -1e4, 0);

export const fogBoxUniforms = {
  /** 1 on a floor of the office (not the roof, not another map), where its rooms keep the fog out. */
  skyFogRooms: { value: 0 },
  skyFogOfficeMin: { value: new THREE.Vector3(...OFFICE_ROOM.min) },
  skyFogOfficeMax: { value: new THREE.Vector3(...OFFICE_ROOM.max) },
  skyFogWingMin: { value: NOWHERE.clone() },
  skyFogWingMax: { value: NOWHERE.clone() },
};

/** Every frame: whether you're on a floor of the office (`on`), and how far it's built out into the back office. */
export function setFogRooms(on: boolean, wing: number) {
  fogBoxUniforms.skyFogRooms.value = on ? 1 : 0;
  const w = on ? wingRoom(wing) : null;
  if (w) {
    fogBoxUniforms.skyFogWingMin.value.set(...w.min);
    fogBoxUniforms.skyFogWingMax.value.set(...w.max);
  } else {
    fogBoxUniforms.skyFogWingMin.value.copy(NOWHERE);
    fogBoxUniforms.skyFogWingMax.value.copy(NOWHERE);
  }
}

/** For the fragment shader, with the haze's (after fog_pars_fragment): segmentInBox and outdoorShare, as above. */
export const FOGBOX_PARS = /* glsl */ `
#ifdef USE_FOG
  uniform float skyFogRooms;
  uniform vec3 skyFogOfficeMin;
  uniform vec3 skyFogOfficeMax;
  uniform vec3 skyFogWingMin;
  uniform vec3 skyFogWingMax;
  float skyFogInBox( vec3 o, vec3 d, vec3 lo, vec3 hi ) {
    vec3 inv = ( step( 0.0, d ) * 2.0 - 1.0 ) / max( abs( d ), vec3( 1e-6 ) );
    vec3 a = ( lo - o ) * inv;
    vec3 b = ( hi - o ) * inv;
    vec3 n = min( a, b );
    vec3 f = max( a, b );
    return max( min( min( f.x, f.y ), min( f.z, 1.0 ) ) - max( max( n.x, n.y ), max( n.z, 0.0 ) ), 0.0 );
  }
  float skyFogOutdoors( vec3 p ) {
    if ( skyFogRooms < 0.5 ) return 1.0;
    vec3 d = p - cameraPosition;
    return max( 1.0 - skyFogInBox( cameraPosition, d, skyFogOfficeMin, skyFogOfficeMax ) - skyFogInBox( cameraPosition, d, skyFogWingMin, skyFogWingMax ), 0.0 );
  }
#endif
`;
