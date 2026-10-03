/**
 * flrnoh fork (see FORK.md "Waymo"): the robotaxi fleet as this page knows it (the office says what
 * changes, shared/waymo/fleet.ts), and where each car is this frame, for the cars themselves, the
 * maps, the city's cars that stop for them, and everyone riding in one (features/peers asks
 * `aboardWaymo` for each person on your floor every frame).
 */
import { WAYMO_HIPS, WAYMO_SEATS, waymoAt, type WaymoCar, type WaymoPose } from '../../../shared/waymo/fleet';
import { store } from '../../state';
import type { Person } from '../../world/character';

export const fleet: WaymoCar[] = [];
const poses = new Map<number, WaymoPose>();
let street = () => 0;
let poseAt = 0;

export function setStreet(fn: () => number) {
  street = fn;
}

/** Car `c` changed (or came). */
export function putCar(c: WaymoCar) {
  const i = fleet.findIndex((x) => x.id === c.id);
  if (i >= 0) fleet[i] = c;
  else fleet.push(c);
  poseAt = 0;
}

/** Where every car is now (worked out once a frame). */
export function posesNow(): ReadonlyMap<number, WaymoPose> {
  const t = store.officeNow();
  if (t !== poseAt) {
    poseAt = t;
    for (const c of fleet) poses.set(c.id, waymoAt(c, t / 1000));
  }
  return poses;
}

/** The car someone sits in, and which seat, if any. */
export function seatOf(id: string): { car: WaymoCar; seat: number } | null {
  for (const car of fleet) {
    const seat = car.riders.indexOf(id);
    if (seat >= 0) return { car, seat };
  }
  return null;
}

/** Where (lx, lz) in car pose `p`'s own frame is in the world. */
export function carWorld(p: { x: number; z: number; yaw: number }, lx: number, lz: number): [number, number] {
  const c = Math.cos(p.yaw);
  const s = Math.sin(p.yaw);
  return [p.x + lx * c + lz * s, p.z - lx * s + lz * c];
}

const sat = new Set<string>();
/** Where someone riding a robotaxi sits this frame (and sits them down), or undefined. */
export function aboardWaymo(id: string, person: Person): { x: number; y: number; z: number; rotY: number; seated: boolean } | undefined {
  const at = seatOf(id);
  if (!at) {
    if (sat.delete(id)) person.sit(null);
    return undefined;
  }
  const p = posesNow().get(at.car.id);
  if (!p) return undefined;
  const seat = WAYMO_SEATS[at.seat];
  const [x, z] = carWorld(p, seat.x, seat.z);
  sat.add(id);
  person.sit(WAYMO_HIPS);
  return { x, y: street(), z, rotY: p.yaw + Math.PI / 2, seated: true };
}

/** What someone's up to in a robotaxi, for the people list and over their head. */
export function waymoWhereabouts(id: string): string | undefined {
  const at = seatOf(id);
  if (!at) return undefined;
  const c = at.car;
  return c.mode === 'riding' ? `🚕 in a Waymo to ${c.dest?.name ?? 'somewhere'}` : '🚕 in a Waymo';
}
