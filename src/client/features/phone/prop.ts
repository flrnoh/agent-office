/**
 * flrnoh fork (see FORK.md "The phone"): the phone in someone's hand, held out in front of them to
 * look at, its screen lit.
 */
import * as THREE from 'three';
import type { Person } from '../../world/character';
import { toon } from '../../world/toon';

const held = new WeakMap<Person, THREE.Group>();
let body: THREE.BufferGeometry | null = null;
let glass: THREE.BufferGeometry | null = null;
const mats = { case: toon('#1d1f24'), screen: new THREE.MeshBasicMaterial({ color: '#8fd3ff' }) };

function phoneMesh(): THREE.Group {
  body ??= new THREE.BoxGeometry(0.075, 0.012, 0.15);
  glass ??= new THREE.PlaneGeometry(0.066, 0.135).rotateX(-Math.PI / 2);
  const g = new THREE.Group();
  g.add(new THREE.Mesh(body, mats.case));
  const s = new THREE.Mesh(glass, mats.screen);
  s.position.y = 0.0065;
  g.add(s);
  // In the right hand, screen up toward the face.
  g.position.set(0, -0.4, 0.05);
  g.rotation.set(0.25, 0, 0);
  return g;
}

/** Puts a phone in `person`'s hand (and the arm out to look at it), or takes it away. */
export function holdPhone(person: Person, on: boolean) {
  const has = held.get(person);
  if (on === !!has) return;
  if (has) {
    has.removeFromParent();
    held.delete(person);
    person.holdOn(false);
    return;
  }
  const g = phoneMesh();
  person.wear(g, 'hand');
  person.holdOn(true);
  held.set(person, g);
}
