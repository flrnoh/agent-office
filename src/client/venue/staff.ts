import type * as THREE from 'three';
import type { Look } from '../../shared/avatar';
import { BARTENDER, GARDEROBE_STAFF, KASSE_STAFF, MERCH_STAFF, type Spot } from '../../shared/venue-house';
import { Person } from '../world/character';

// The Schallwerk's staff (flrnoh fork, see FORK.md "The Schallwerk"): Mia at the box office, Jo at the
// cloakroom, Sam at the merch stand (in the house's shirt), Ronja behind the bar. They stand at their
// posts, look up at you when you come up, reach out and say something when they serve you.

export interface VenueStaff {
  kasse: Person;
  coat: Person;
  merch: Person;
  bar: Person;
}

/** Puts them at their posts in the house. */
export function hireStaff(group: THREE.Group): VenueStaff {
  const npc = (name: string, color: string, look: Look, at: Spot) => {
    const p = new Person(name, color, look);
    p.root.position.set(at.x, 0, at.z);
    p.root.rotation.y = at.rotY;
    p.showLabel(false);
    group.add(p.root);
    return p;
  };
  return {
    kasse: npc('Mia', '#1d1d22', { skin: 1, hair: 7, style: 1, specs: 3 }, KASSE_STAFF),
    coat: npc('Jo', '#3d405b', { skin: 4, hair: 0, style: 3, beard: 2 }, GARDEROBE_STAFF),
    merch: npc('Sam', '#18181c', { skin: 6, hair: 9, style: 4, hat: 2 }, MERCH_STAFF),
    bar: npc('Ronja', '#7a1020', { skin: 2, hair: 4, style: 5 }, BARTENDER),
  };
}

/** Each frame: they move a little, and turn to you when you're close (and back to their post when you go). */
export function tendStaff(staff: VenueStaff, you: THREE.Vector3, t: number, dt: number) {
  const turn = (person: Person, home: Spot, reach: number) => {
    person.update(dt, t, false, false);
    const near = Math.hypot(you.x - home.x, you.z - home.z) < reach;
    const to = near ? Math.atan2(you.x - home.x, you.z - home.z) : home.rotY;
    let d = to - person.root.rotation.y;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    person.root.rotation.y += d * Math.min(1, dt * 4);
  };
  turn(staff.kasse, KASSE_STAFF, 5);
  turn(staff.coat, GARDEROBE_STAFF, 5);
  turn(staff.merch, MERCH_STAFF, 5);
  turn(staff.bar, BARTENDER, 6);
}
