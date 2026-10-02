import * as THREE from 'three';
import { SEATS, type CoasterRider } from '../../shared/coaster';
import { lookFromSeed, type Look } from '../../shared/avatar';
import { Person } from '../world/character';
import { SEAT_PAN } from '../world/coaster/train';

// DER BRECHER's riders as everyone sees them (flrnoh fork, see FORK.md "Der Brecher"): a figure in each
// taken seat, in the rider's color and look with their name over it, sat down, hands in the lap or up
// in the air. The same figures on every page, on the roof and from below (where the riders themselves
// aren't in the room with you); on the roof the riders' own bodies wait on the platform, hidden.

interface Sitter {
  person: Person;
  id: string;
  name: string;
  color: string;
  /** How far up their hands are (0 in the lap, 1 right up), easing. */
  up: number;
}

export interface RidersDeps {
  lookOf(id: string): Look | undefined;
  noOutline(o: THREE.Object3D): void;
}

export class Riders {
  private sat: (Sitter | null)[] = Array(SEATS).fill(null);

  constructor(
    private seats: THREE.Object3D[],
    private d: RidersDeps,
  ) {}

  /** Each frame: who's in which seat, and whose figure not to draw (yours, seen from your own eyes). */
  update(riders: (CoasterRider | null)[], hide: string | null, dt: number, t: number) {
    for (let i = 0; i < SEATS; i++) {
      const r = riders[i] ?? null;
      let s = this.sat[i];
      if (!r) {
        if (s) s.person.root.visible = false;
        continue;
      }
      if (!s || s.id !== r.id) {
        if (!s) {
          const person = new Person(r.name, r.color || '#4f86f7', this.d.lookOf(r.id) ?? lookFromSeed(r.id));
          this.seats[i].add(person.root);
          person.sit(SEAT_PAN);
          s = this.sat[i] = { person, id: r.id, name: '', color: '', up: 0 };
        } else {
          s.id = r.id;
          s.person.setLook(this.d.lookOf(r.id) ?? lookFromSeed(r.id));
        }
      }
      if (s.name !== r.name || s.color !== r.color) {
        s.name = r.name;
        s.color = r.color;
        s.person.setColor(r.color || '#4f86f7');
        s.person.setLabel(r.name, null);
        this.d.noOutline(s.person.root);
      }
      s.person.root.visible = r.id !== hide;
      s.up += ((r.hands ? 1 : 0) - s.up) * Math.min(1, dt * 9);
      s.person.update(dt, t, false, false);
      // Hands up: both arms straight up and a little out, waving a touch.
      if (s.up > 0.01) {
        const { armL, armR } = s.person.limbs();
        const wave = Math.sin(t * 7 + i) * 0.12;
        armL.rotation.x = THREE.MathUtils.lerp(armL.rotation.x, -2.95 + wave, s.up);
        armR.rotation.x = THREE.MathUtils.lerp(armR.rotation.x, -2.95 - wave, s.up);
        armL.rotation.z = THREE.MathUtils.lerp(armL.rotation.z, 0.32, s.up);
        armR.rotation.z = THREE.MathUtils.lerp(armR.rotation.z, -0.32, s.up);
      }
    }
  }

  /** Everyone's figure shown (for the ride photo, your own too), or as it was. */
  showAll(on: boolean, riders: (CoasterRider | null)[]) {
    this.sat.forEach((s, i) => s && (s.person.root.visible = on ? !!riders[i] : s.person.root.visible));
  }
}
