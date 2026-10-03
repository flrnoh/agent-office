import * as THREE from 'three';
import { keptItem, type PlacedView } from '../../../shared/bag';
import { drinkGlass, putDownGlass } from '../../world/character/props';
import type { Interactable } from '../../world/types';

// Things put down (flrnoh fork, see FORK.md "The rucksack"): each where it was put, the way it was put,
// for everyone on that floor (or the roof, or a place) to see. Pets stay alive: the goldfish's bag
// sways, the budgie hops about and looks round.

/** As big as they look in someone's hand. */
const SCALE = 1.3;

interface Shown {
  view: PlacedView;
  root: THREE.Group;
  thing: THREE.Group;
  it: Interactable;
  /** A phase of its own, so pets side by side don't move in step. */
  phase: number;
}

export class PlacedThings {
  readonly root = new THREE.Group();
  private shown = new Map<string, Shown>();
  private clock = 0;

  constructor() {
    this.root.name = 'placed-things';
  }

  /** Everything on the floor you've arrived on, in place of what stood on the last one. */
  set(list: readonly PlacedView[]) {
    for (const id of [...this.shown.keys()]) this.remove(id);
    for (const v of list) this.add(v);
  }

  add(v: PlacedView) {
    if (this.shown.has(v.id)) this.remove(v.id);
    const item = keptItem(v.item);
    if (!item) return;
    const root = new THREE.Group();
    const thing = drinkGlass(item, SCALE);
    root.add(thing);
    root.position.set(v.x, v.y, v.z);
    root.rotation.y = v.rotY;
    const it: Interactable = { kind: 'placed', x: v.x, z: v.z, y: v.y, radius: 1.3, placedId: v.id };
    root.userData.interact = it;
    this.root.add(root);
    this.shown.set(v.id, { view: v, root, thing, it, phase: Math.random() * 10 });
  }

  remove(id: string) {
    const s = this.shown.get(id);
    if (!s) return;
    putDownGlass(s.thing);
    s.root.removeFromParent();
    this.shown.delete(id);
  }

  get(id: string | undefined): PlacedView | undefined {
    return id ? this.shown.get(id)?.view : undefined;
  }

  interactables(): Interactable[] {
    return [...this.shown.values()].map((s) => s.it);
  }

  /** The pets, alive. */
  update(dt: number) {
    this.clock += dt;
    for (const s of this.shown.values()) {
      const glass = keptItem(s.view.item)?.glass;
      const t = this.clock + s.phase;
      if (glass === 'fishbag') {
        // The water sloshing, the bag swaying a little on its knot.
        s.thing.rotation.z = Math.sin(t * 1.7) * 0.05;
        s.thing.rotation.x = Math.sin(t * 1.3) * 0.04;
      } else if (glass === 'budgie') {
        // Little hops every second or two, and a look round now and then.
        const hop = t % 1.6;
        s.thing.position.y = hop < 0.22 ? Math.sin((hop / 0.22) * Math.PI) * 0.05 : 0;
        s.thing.rotation.y = Math.round(Math.sin(t * 0.45) * 2) * 0.5;
      }
    }
  }
}
