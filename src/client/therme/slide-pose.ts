import * as THREE from 'three';
import { RIDE_POSE, SLIDE_BY_ID, SLIDE_RADIUS, type RidePose, type SlideId } from '../../shared/therme-slides';
import { liePose } from '../features/lounging';
import type { Person } from '../world/character';
import { HIPS } from '../world/character/rig';
import { mesh, toon } from '../world/toon';
import { frameAt, type SlideFrames } from '../world/therme/slides';

/*
 * How someone goes down the baths' slides (flrnoh fork, see shared/therme-slides.ts RIDE_POSE): lying
 * on their back feet first down the tubes and the Turbo (inside the tube, head and all), sitting on
 * the Wellenrutsche, in a tyre on the Reifenrutsche, belly down on a mat head first on the racer;
 * their body square to the track wherever it goes (upside down through the loop). The same for you
 * and for everyone else on a slide (whom the page finds by the nearest point of a track).
 */

type Bones = Parameters<Parameters<Person['setWorkout']>[0] & object>[0];

/** How high the hips ride over the slide's floor, by pose. */
const HIP_LIFT: Record<RidePose, number> = { lie: 0.2, sit: 0.28, tyre: 0.32, mat: 0.2 };

function sitPose(b: Bones, hips: number, t: number, phase: number) {
  b.body.rotation.set(-0.32, 0, 0);
  b.body.position.set(0, hips - HIPS * Math.cos(-0.32), -HIPS * Math.sin(-0.32));
  b.legL.rotation.set(-1.25, 0, 0.12);
  b.legR.rotation.set(-1.25, 0, -0.12);
  // Arms out to the sides, hands on the rims, a little wobble.
  b.armL.rotation.set(-0.35, 0, 0.9 + Math.sin(t * 7 + phase) * 0.08);
  b.armR.rotation.set(-0.35, 0, -0.9 - Math.sin(t * 7 + phase) * 0.08);
  b.head.rotation.set(0.15, 0, 0);
}

function matPose(b: Bones, hips: number, t: number, phase: number) {
  // Belly down, head first: leaning all the way forward, the legs straight out behind, the arms forward on the mat's handles.
  const th = 1.45;
  b.body.rotation.set(th, 0, 0);
  b.body.position.set(0, hips - HIPS * Math.cos(th), -HIPS * Math.sin(th));
  b.legL.rotation.set(0.05, 0, 0.06);
  b.legR.rotation.set(0.05, 0, -0.06);
  b.armL.rotation.set(-2.6, 0, 0.25);
  b.armR.rotation.set(-2.6, 0, -0.25);
  b.head.rotation.set(-1.05 + Math.sin(t * 5 + phase) * 0.04, 0, 0);
}

/** What someone's riding on: a double tyre, a racing mat (nothing for a body slide). */
function prop(kind: RidePose, color: string): THREE.Object3D | null {
  if (kind === 'tyre') {
    const g = new THREE.Group();
    g.add(mesh(new THREE.TorusGeometry(0.45, 0.2, 8, 18).rotateX(Math.PI / 2), toon(color), 0, 0.2, 0.05, false));
    g.add(mesh(new THREE.TorusGeometry(0.06, 0.03, 5, 8), toon('#2b2b2b'), 0.5, 0.42, 0.05, false));
    return g;
  }
  if (kind === 'mat') {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(0.62, 0.06, 1.15), toon(color), 0, 0.05, 0.25, false));
    for (const x of [-0.26, 0.26]) g.add(mesh(new THREE.BoxGeometry(0.06, 0.08, 0.16), toon('#2b2b2b'), x, 0.1, 0.78, false));
    return g;
  }
  return null;
}

/** One rider's look: posed, what they ride on, where it was when we started. */
interface Posed {
  slide: SlideId;
  thing: THREE.Object3D | null;
}

const F = { t: new THREE.Vector3(), down: new THREE.Vector3(), side: new THREE.Vector3() };
const M = new THREE.Matrix4();
const UP = new THREE.Vector3();

export class SlidePoser {
  private posed = new Map<Person, Posed>();

  /** `person` is on `slide` at `u` along it (0..1): pose them, put them on the track's floor square to it. */
  set(person: Person, slide: SlideId, frames: SlideFrames, at: THREE.Vector3, u: number, lane: number) {
    let st = this.posed.get(person);
    const kind = RIDE_POSE[slide];
    if (!st || st.slide !== slide) {
      if (st) this.clear(person);
      const hips = HIP_LIFT[kind];
      const phase = this.posed.size * 1.3;
      person.setWorkout((b, _dt, t) => (kind === 'lie' ? liePose(b, hips, 'flat', t, phase) : kind === 'mat' ? matPose(b, hips, t, phase) : sitPose(b, kind === 'tyre' ? hips - 0.08 : hips, t, phase)));
      const thing = prop(kind, kind === 'mat' ? ['#e63946', '#1d6fd6', '#2a9d8f', '#f4a261'][lane % 4] : SLIDE_BY_ID.get(slide)!.color);
      if (thing) person.root.add(thing);
      st = { slide, thing };
      this.posed.set(person, st);
    }
    frameAt(frames, u, F);
    // The body's up is the floor's normal (the tube's middle from where you lie), forward the way down.
    UP.copy(F.down).negate();
    const x = new THREE.Vector3().crossVectors(UP, F.t).normalize();
    M.makeBasis(x, UP, F.t);
    person.root.quaternion.setFromRotationMatrix(M);
    person.root.position.copy(at);
  }

  /** Off the slide: back to themselves. */
  clear(person: Person) {
    const st = this.posed.get(person);
    if (!st) return;
    person.setWorkout(null);
    if (st.thing) person.root.remove(st.thing);
    person.root.rotation.set(0, person.root.rotation.y, 0);
    this.posed.delete(person);
  }

  has(person: Person) {
    return this.posed.has(person);
  }

  /** Everyone posed but these: no longer on a slide. */
  keep(on: Set<Person>) {
    for (const p of [...this.posed.keys()]) if (!on.has(p)) this.clear(p);
  }
}

/** Where on a slide's floor someone lies (`centre` the track's curve point there, the frame's `down` toward its floor). */
export const floorOf = (centre: THREE.Vector3, down: THREE.Vector3, radius = SLIDE_RADIUS) => centre.clone().addScaledVector(down, radius * 0.92);
