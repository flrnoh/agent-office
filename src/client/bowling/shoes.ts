import type * as THREE from 'three';
import type { Person } from '../world/character';
import { toneOfSize, wornShoe } from '../world/bowling/shoes';

// Who's in rental shoes (flrnoh fork, see FORK.md "The bowling centre"): the office keeps it
// (server/bowling/place.ts) and says so to everyone in the centre; this page puts a pair on each of
// those people's feet (yours too), and takes them off again when they give them back, leave, or you do.

interface Worn {
  person: Person;
  size: number;
  parts: THREE.Object3D[];
}

export class BowlingShoes {
  /** Peer id → the size they're wearing. */
  private sizes = new Map<string, number>();
  private worn = new Map<string, Worn>();

  of(id: string): number | null {
    return this.sizes.get(id) ?? null;
  }

  set(id: string, size: number | null) {
    if (size) this.sizes.set(id, size);
    else this.sizes.delete(id);
  }

  reset(all: Record<string, number>) {
    this.sizes = new Map(Object.entries(all));
  }

  /** Out of the centre: nobody's shoes are drawn any more (and nobody's are known till you're back). */
  clear() {
    this.sizes.clear();
    for (const id of [...this.worn.keys()]) this.takeOff(id);
  }

  /** Each frame inside: the people in there (their bodies may come and go), dressed as the office says. */
  dress(people: { id: string; person: Person | undefined }[]) {
    const here = new Set<string>();
    for (const { id, person } of people) {
      if (!person) continue;
      here.add(id);
      const size = this.sizes.get(id);
      const w = this.worn.get(id);
      if (w && (w.person !== person || w.size !== size)) this.takeOff(id);
      if (size && !this.worn.has(id)) this.putOn(id, person, size);
    }
    for (const id of [...this.worn.keys()]) if (!here.has(id)) this.takeOff(id);
  }

  private putOn(id: string, person: Person, size: number) {
    const { legL, legR } = person.limbs();
    const parts = [legL, legR].map((leg) => {
      const s = wornShoe(toneOfSize(size));
      leg.add(s);
      return s;
    });
    this.worn.set(id, { person, size, parts });
  }

  private takeOff(id: string) {
    const w = this.worn.get(id);
    if (!w) return;
    for (const p of w.parts) p.removeFromParent();
    this.worn.delete(id);
  }
}
