import * as THREE from 'three';
import { SPEAKERS, type SpeakerDef } from '../speakers';
import { mesh, roundedBox, toon, toonUnique } from './toon';

// flrnoh fork: the speaker boxes hanging round the office (see ../speakers.ts): a dark cabinet on a
// rod from the ceiling, tilted down at the room, with a woofer that pumps to the beat and a little
// LED, green while the jukebox plays through them and red when the floor has them switched off.

export interface SpeakersView {
  group: THREE.Group;
  /**
   * Each frame, on your floor: `wing` is how far the back office is built out, `beat` runs 1 → 0 after
   * each beat (OfficeSound.beat), `playing` whether the jukebox is on, `on` whether the floor's
   * speakers are.
   */
  update(dt: number, wing: number, beat: number, playing: boolean, on: boolean): void;
}

const W = 0.44;
const H = 0.62;
const D = 0.36;
/** Tilted this far down at the room. */
const TILT = 0.42;
/** The yoke over the box, which the rod comes down to. */
const YOKE = H / 2 + 0.08;

const LED_PLAY = new THREE.Color('#06d6a0');
const LED_IDLE = new THREE.Color('#2f6f5f');
const LED_OFF = new THREE.Color('#ef476f');

export function buildSpeakers(): SpeakersView {
  const group = new THREE.Group();
  group.name = 'speakers';
  const body = toon('#2b2d42');
  const baffle = toon('#3d405b');
  const cone = toon('#1b1c2b');
  const cap = toon('#8d99ae');
  const metal = toon('#b8bfcc');
  // One LED material for all of them: they all show the same thing.
  const led = toonUnique('#2f6f5f');
  led.emissive = LED_IDLE.clone();
  const woofers: THREE.Object3D[] = [];
  const wings: { s: SpeakerDef; g: THREE.Group }[] = [];

  const coneGeo = new THREE.CylinderGeometry(0.15, 0.11, 0.05, 20).rotateX(Math.PI / 2);
  const capGeo = new THREE.SphereGeometry(0.05, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2);
  const tweeterGeo = new THREE.CylinderGeometry(0.05, 0.04, 0.03, 14).rotateX(Math.PI / 2);
  const bodyGeo = roundedBox(W, H, D, 0.05);
  const baffleGeo = new THREE.BoxGeometry(W - 0.06, H - 0.06, 0.02);
  const ledGeo = new THREE.SphereGeometry(0.018, 8, 6);
  const yokeGeo = new THREE.BoxGeometry(W + 0.08, 0.03, 0.08);
  const armGeo = new THREE.BoxGeometry(0.025, YOKE, 0.06);

  for (const s of SPEAKERS) {
    const g = new THREE.Group();
    g.position.set(s.x, s.y, s.z);
    g.rotation.y = Math.atan2(s.aim.x - s.x, s.aim.z - s.z);
    g.scale.setScalar(s.scale);
    // The rod up to the ceiling (in its own scale, so it still reaches), and the yoke it holds.
    const rod = (s.ceiling - s.y) / s.scale - YOKE;
    if (rod > 0.02) g.add(mesh(new THREE.CylinderGeometry(0.022, 0.022, rod, 6), metal, 0, YOKE + rod / 2, 0, false));
    g.add(mesh(yokeGeo, metal, 0, YOKE, 0, false));
    for (const sx of [-1, 1]) g.add(mesh(armGeo, metal, sx * (W / 2 + 0.03), YOKE / 2, 0, false));
    // The box, tilted down at the room from the yoke's arms.
    const box = new THREE.Group();
    box.rotation.x = TILT;
    box.add(mesh(bodyGeo, body, 0, 0, 0, false));
    const front = D / 2 + 0.01;
    box.add(mesh(baffleGeo, baffle, 0, 0, front, false));
    const woofer = new THREE.Group();
    woofer.position.set(0, -0.08, front + 0.02);
    woofer.add(mesh(coneGeo, cone, 0, 0, 0, false));
    woofer.add(mesh(capGeo, cap, 0, 0, 0.02, false));
    box.add(woofer);
    woofers.push(woofer);
    box.add(mesh(tweeterGeo, cone, 0, 0.18, front + 0.015, false));
    box.add(mesh(ledGeo, led, W / 2 - 0.08, -H / 2 + 0.07, front + 0.012, false));
    g.add(box);
    group.add(g);
    if (s.wing) {
      g.visible = false;
      wings.push({ s, g });
    }
  }

  let pump = 0;
  return {
    group,
    update(dt, wing, beat, playing, on) {
      for (const { s, g } of wings) g.visible = (s.wing ?? 0) <= wing;
      const live = playing && on;
      // The woofers push out on the beat and ease back.
      const target = live ? beat : 0;
      pump += (target - pump) * Math.min(1, dt * 18);
      const z = 1 + 0.9 * pump;
      for (const w of woofers) w.scale.z = z;
      led.emissive.copy(!on ? LED_OFF : live ? LED_PLAY : LED_IDLE).multiplyScalar(live ? 0.6 + 0.6 * pump : !on ? 0.7 : 0.35);
      led.color.copy(!on ? LED_OFF : LED_PLAY);
    },
  };
}
