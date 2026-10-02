import * as THREE from 'three';
import type { DjFrame } from '../../dnb';
import { mesh, toon, toonUnique } from '../../world/toon';

/*
 * The DJ on the roof (moved out of world.ts by the flrnoh fork, see FORK.md): headphones on, cap on
 * backwards, sunglasses, moving to whatever's on, the house DJ's set or one someone put on (the
 * frame's beats are that set's own, so the moves keep its tempo):
 *
 * - the groove: bouncing on the beat and nodding, a hand on the mixer, the other on a jog wheel or
 *   holding a cup of the headphones to an ear, every other phrase, swaying a little;
 * - a breakdown: swaying slowly, eyes up, and both hands up waving through its second half;
 * - a build: crouching lower as it rises, a finger pointing up, pumping on the beat, then twice a
 *   beat, then both hands up clapping over the head through its last bars;
 * - the drop: a spin and a jump as it lands, both fists pumping, then banging their head hard,
 *   a fist in the air every other phrase.
 */

const TAU = Math.PI * 2;
const ease = (x: number) => x * x * (3 - 2 * x);

/** The DJ: faces +z. */
export class Dj {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private head = new THREE.Group();
  /** Arms on the -x and +x sides (their right and left, facing +z). */
  private armR: THREE.Group;
  private armL: THREE.Group;
  private legR: THREE.Group;
  private legL: THREE.Group;
  /** The moves blend from one to the next rather than snapping. */
  private pose = { rx: 0, rz: 0, lx: 0, lz: 0, crouch: 0 };

  constructor() {
    const skin = toon('#8d5524');
    const shirt = toonUnique('#1d1d1d');
    const pants = toon('#3d405b');
    const ink = toon('#111111');
    this.root.add(this.body);
    this.body.add(mesh(new THREE.CapsuleGeometry(0.26, 0.28, 6, 12), shirt, 0, 0.72, 0));
    // A print on the front of the tee.
    this.body.add(mesh(new THREE.CircleGeometry(0.1, 16), toon('#06d6a0'), 0, 0.78, 0.262, false));
    const head = this.head;
    head.position.y = 1.32;
    head.add(mesh(new THREE.SphereGeometry(0.34, 20, 16), skin));
    // The cap, on backwards.
    const capMat = toon('#ef476f');
    head.add(mesh(new THREE.SphereGeometry(0.36, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), capMat, 0, 0.04, 0));
    head.add(mesh(new THREE.BoxGeometry(0.3, 0.03, 0.22), capMat, 0, 0.06, -0.4));
    // Sunglasses.
    head.add(mesh(new THREE.BoxGeometry(0.44, 0.09, 0.05), ink, 0, 0.04, 0.31, false));
    const smile = mesh(new THREE.TorusGeometry(0.06, 0.015, 6, 12, Math.PI), ink, 0, -0.1, 0.31, false);
    smile.rotation.z = Math.PI;
    head.add(smile);
    // Headphones: a band over the cap and a cup on each ear.
    head.add(mesh(new THREE.TorusGeometry(0.39, 0.035, 8, 24, Math.PI), ink, 0, 0.02, 0, false));
    for (const s of [-1, 1]) {
      const cup = mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.09, 16), toon('#3d405b'), s * 0.36, 0.02, 0, false);
      cup.rotation.z = Math.PI / 2;
      head.add(cup);
    }
    this.body.add(head);
    const limb = (len: number, r: number, mat: THREE.Material, x: number, y: number, parent: THREE.Object3D) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, 0);
      pivot.add(mesh(new THREE.CapsuleGeometry(r, len, 4, 8), mat, 0, -len / 2 - r / 2, 0));
      parent.add(pivot);
      return pivot;
    };
    // The legs stay on the riser while the body bobs.
    this.legR = limb(0.22, 0.1, pants, -0.12, 0.42, this.root);
    this.legL = limb(0.22, 0.1, pants, 0.12, 0.42, this.root);
    this.armR = limb(0.24, 0.08, shirt, -0.33, 0.9, this.body);
    this.armL = limb(0.24, 0.08, shirt, 0.33, 0.9, this.body);
    for (const arm of [this.armR, this.armL]) arm.add(mesh(new THREE.SphereGeometry(0.085, 12, 10), skin, 0, -0.38, 0));
  }

  /** `dt` for blending moves; `motion` off keeps it to a gentle nod. */
  update(t: number, f: DjFrame, motion: boolean, dt = 1 / 60) {
    const e = f.energy;
    const phase = f.beats - Math.floor(f.beats);
    const bar = Math.floor(f.beats / 4);
    const phrase = Math.floor(bar / 8);
    const m = motion ? 1 : 0.3;
    const onBeat = Math.sin(phase * Math.PI);
    // Where the arms want to be: x forward/back (negative is forward), z out to the side and up.
    let rx = -1.15 + 0.05 * Math.sin(t * 7);
    let rz = 0.25 + 0.06 * Math.sin(t * 3.1);
    let lx = -1.2 + 0.08 * Math.sin(t * 11);
    let lz = -0.2 + 0.12 * Math.sin(t * 5.3);
    let crouch = 0;
    let lift = 0;
    let spin = 0;
    let nod = 0.28 * (0.35 + 0.65 * e) * Math.max(0, Math.sin(phase * TAU));
    let sway = 0.06 * Math.sin(f.beats * Math.PI * 0.5);
    let turn = 0.12 * Math.sin(f.beats * Math.PI * 0.125);

    if (!motion) {
      // Just riding the faders and nodding.
    } else if (f.sinceDrop < 3.2 || (f.part === 'drop' && f.sinceDrop < 8)) {
      // The drop lands: a spin on its first beat, a jump, then both fists pumping, turn about.
      const beatLen = 60 / Math.max(60, Math.min(200, (f as DjFrame & { bpm?: number }).bpm ?? 125));
      if (f.sinceDrop < beatLen) spin = ease(f.sinceDrop / beatLen) * TAU;
      lift = f.sinceDrop < beatLen * 2 ? 0.28 * Math.sin((f.sinceDrop / (beatLen * 2)) * Math.PI) : 0.06 * onBeat;
      const left = Math.floor(f.beats) % 2 === 0;
      rx = 0;
      lx = 0;
      rz = -(2.75 - (left ? 0 : 0.45 * onBeat));
      lz = 2.75 - (left ? 0.45 * onBeat : 0);
      nod = 0.4 * Math.max(0, Math.sin(phase * TAU));
    } else if (f.part === 'drop') {
      // Deep in it: banging their head, and every other phrase a fist in the air on every beat.
      nod = 0.5 * Math.max(0, Math.sin(phase * TAU));
      turn *= 1.5;
      if (phrase % 2) {
        lx = 0;
        lz = 2.9 - 0.35 * onBeat;
      }
    } else if (f.part === 'build') {
      // Lower and lower as it rises, pointing up, then both hands clapping overhead.
      crouch = 0.14 * f.rise;
      const r = f.rise;
      if (r > 0.75) {
        const clap = Math.sin(((f.beats * 2) % 1) * Math.PI);
        rx = lx = -0.1;
        rz = -(2.6 - 0.35 * clap);
        lz = 2.6 - 0.35 * clap;
      } else {
        // Pumping on the beat, then twice a beat.
        const pump = r > 0.4 ? Math.sin(((f.beats * 2) % 1) * Math.PI) : onBeat;
        lx = -0.15;
        lz = 2.7 - 0.4 * pump;
      }
      nod *= 1 + r;
    } else if (f.part === 'breakdown') {
      // Swaying slowly, looking up; hands up and waving through its second half.
      sway = 0.14 * Math.sin(f.beats * Math.PI * 0.25);
      nod = -0.12 + 0.06 * Math.sin(f.beats * Math.PI * 0.5);
      turn = 0.2 * Math.sin(f.beats * Math.PI * 0.0625);
      if (bar % 8 >= 4) {
        const wave = Math.sin(f.beats * Math.PI * 0.5);
        rx = lx = -0.2;
        rz = -(2.5 + 0.25 * wave);
        lz = 2.5 - 0.25 * wave;
      } else {
        lx = -0.2;
        lz = 2.55;
      }
    } else if (phrase % 2) {
      // The groove: every other phrase a cup of the headphones held to an ear, listening for the next track.
      lx = -0.2;
      lz = 2.55;
    }

    // Blend into the new pose: quick, but no snapping.
    const k = 1 - Math.exp(-dt * (motion ? 14 : 6));
    const p = this.pose;
    p.rx += (rx - p.rx) * k;
    p.rz += (rz - p.rz) * k;
    p.lx += (lx - p.lx) * k;
    p.lz += (lz - p.lz) * k;
    p.crouch += (crouch - p.crouch) * k;
    this.armR.rotation.set(p.rx, 0, p.rz);
    this.armL.rotation.set(p.lx, 0, p.lz);
    // Bouncing on every beat (knees giving a little), and nodding along.
    const bounce = 0.05 * e * m * onBeat + p.crouch;
    this.body.position.y = -bounce + lift;
    this.legR.rotation.x = this.legL.rotation.x = 0;
    this.legR.position.y = this.legL.position.y = 0.42 + lift;
    this.head.rotation.x = m * nod;
    this.head.rotation.z = m * sway;
    this.body.rotation.z = m * sway * 0.4;
    this.body.rotation.y = m * turn;
    this.root.rotation.y = spin;
  }
}
