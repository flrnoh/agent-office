import * as THREE from 'three';
import { SEA_LEVEL } from '../../../shared/beach';
import { CRAFTS, CRAFT_FLOOR, CRAFT_SPECS, craftPoint, type CraftDef, type CraftState } from '../../../shared/boats';
import type { CarPose } from '../../../shared/garage';
import type { Interactable } from '../../world/types';
import { mesh, textPlane, toon } from '../../world/toon';

// The jetskis and the motorboat at the jetty, as you see them (flrnoh fork, see FORK.md "A day at the
// beach"): their models, bobbing on the water, pitching up as they speed and leaning into a turn,
// every one where the office says it is (smoothed, like the garage's cars), but yours where your own
// driving puts it. They're in the scenic loop's group, so they go down with the street.

/** A hull seen from the side (z along it, y up), extruded `width` across and centred: bow toward +z. */
function hull(profile: [number, number][], width: number, mat: THREE.Material): THREE.Mesh {
  const s = new THREE.Shape();
  profile.forEach(([z, y], i) => (i ? s.lineTo(z, y) : s.moveTo(z, y)));
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: width, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 2 });
  geo.translate(0, 0, -width / 2);
  geo.rotateY(-Math.PI / 2);
  return mesh(geo, mat);
}

function jetski(color: string): THREE.Group {
  const g = new THREE.Group();
  const body = toon(color);
  const white = toon('#f8f9fa');
  const black = toon('#22223b');
  g.add(hull([[-1.5, -0.2], [-1.5, 0.35], [0.7, 0.42], [1.5, 0.22], [1.25, -0.2]], 1.0, white));
  // Its coloured top, the saddle, the steering column and its bars.
  const top = hull([[-1.2, 0.33], [-1.2, 0.45], [0.6, 0.52], [1.38, 0.3], [0.4, 0.3]], 0.92, body);
  g.add(top);
  g.add(mesh(new THREE.BoxGeometry(0.42, 0.22, 1.1), black, 0, 0.56, -0.35));
  g.add(mesh(new THREE.BoxGeometry(0.4, 0.32, 0.3), body, 0, 0.62, 0.48));
  const bars = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.75, 8), black, 0, 0.82, 0.45);
  bars.rotation.z = Math.PI / 2;
  g.add(bars);
  for (const s of [-1, 1]) g.add(mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.14, 8).rotateZ(Math.PI / 2), black, s * 0.36, 0.82, 0.45));
  // A stripe down each side, and a little windscreen.
  for (const s of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.02, 0.07, 1.9), body, s * 0.57, 0.2, 0.05));
  const screen = mesh(new THREE.BoxGeometry(0.36, 0.2, 0.03), new THREE.MeshToonMaterial({ color: '#bde0fe', transparent: true, opacity: 0.6 }), 0, 0.82, 0.68);
  screen.rotation.x = -0.5;
  g.add(screen);
  return g;
}

function motorboat(name: string): THREE.Group {
  const g = new THREE.Group();
  const white = toon('#f8f9fa');
  const blue = toon('#1d3557');
  const deck = toon('#c9a77c');
  // The hull up to the deck, rising into the foredeck at the bow; the sides and the transom round the cockpit.
  g.add(hull([[-2.7, -0.3], [-2.7, CRAFT_FLOOR], [1.3, CRAFT_FLOOR], [1.6, 0.8], [2.75, 0.9], [2.2, 0.05], [1.2, -0.3]], 2.0, white));
  for (const s of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.12, 0.6, 4.1), white, s * 1.0, CRAFT_FLOOR + 0.3, -0.62));
  g.add(mesh(new THREE.BoxGeometry(2.1, 0.6, 0.12), white, 0, CRAFT_FLOOR + 0.3, -2.7));
  for (const s of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.16, 0.05, 4.1), toon('#adb5bd'), s * 1.0, CRAFT_FLOOR + 0.62, -0.62));
  // A blue band along the waterline, and the deck inside.
  for (const s of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.02, 0.14, 4.6), blue, s * 1.07, 0.06, -0.15));
  g.add(mesh(new THREE.BoxGeometry(1.9, 0.04, 4.0), deck, 0, CRAFT_FLOOR + 0.01, -0.62));
  // The console on the right with its wheel, a windscreen across, the stern bench and the seat beside the helm.
  g.add(mesh(new THREE.BoxGeometry(0.6, 0.7, 0.5), white, -0.45, 0.55, 0.95));
  const wheel = mesh(new THREE.TorusGeometry(0.16, 0.025, 6, 16), toon('#22223b'), -0.45, 0.95, 0.72);
  wheel.rotation.x = -0.6;
  g.add(wheel);
  const glass = new THREE.MeshToonMaterial({ color: '#bde0fe', transparent: true, opacity: 0.55 });
  const screen = mesh(new THREE.BoxGeometry(1.8, 0.4, 0.04), glass, 0, 1.08, 1.2);
  screen.rotation.x = -0.4;
  g.add(screen);
  g.add(mesh(new THREE.BoxGeometry(0.5, 0.42, 0.5), white, 0.5, 0.42, 0.3));
  g.add(mesh(new THREE.BoxGeometry(0.52, 0.08, 0.52), toon('#e63946'), 0.5, 0.66, 0.3));
  g.add(mesh(new THREE.BoxGeometry(1.8, 0.4, 0.55), white, 0, 0.42, -1.45));
  g.add(mesh(new THREE.BoxGeometry(1.82, 0.08, 0.57), toon('#e63946'), 0, 0.65, -1.45));
  // The outboard on the transom, and a little flag.
  g.add(mesh(new THREE.BoxGeometry(0.42, 0.55, 0.5), toon('#2b2d42'), 0, 0.85, -2.85));
  g.add(mesh(new THREE.BoxGeometry(0.16, 0.7, 0.18), toon('#2b2d42'), 0, 0.25, -2.95));
  g.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.0, 6), toon('#adb5bd'), 0.8, 1.2, -2.5));
  g.add(mesh(new THREE.BoxGeometry(0.02, 0.28, 0.42), toon('#06d6a0'), 0.8, 1.55, -2.7));
  // Her name on either bow.
  for (const s of [-1, 1]) {
    const label = textPlane(name, { color: '#1d3557', size: 40 });
    label.scale.setScalar(0.55);
    label.position.set(s * 1.13, 0.52, 1.6);
    label.rotation.y = (s * Math.PI) / 2;
    g.add(label);
  }
  return g;
}

/** A craft as it's drawn: its model, where it is now, and the bit of it you can use. */
export interface CraftView {
  index: number;
  def: CraftDef;
  root: THREE.Group;
  pose: CarPose;
  interactable: Interactable;
  /** How far round its bob is. */
  phase: number;
  bob: number;
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export class Flotilla {
  readonly crafts: CraftView[];
  /** How far below the floor you're on the street is (see streetBelow). */
  private street = 0;
  /** The clock at the last update, for placing a craft between them. */
  private t = 0;

  /** Builds every craft into `parent` (the scenic loop's group: its y is the street's at the bottom floor, `base`). */
  constructor(
    parent: THREE.Group,
    private readonly base: number,
  ) {
    this.crafts = CRAFTS.map((def, index) => {
      const root = def.kind === 'jetski' ? jetski(def.color) : motorboat('MÖWE');
      root.rotation.order = 'YXZ';
      parent.add(root);
      const interactable: Interactable = { kind: 'watercraft', x: def.x, z: def.z, y: 0, radius: def.kind === 'boat' ? 3.6 : 2.8, craft: index };
      root.traverse((o) => (o.userData.interact = interactable));
      const v: CraftView = { index, def, root, pose: { x: def.x, z: def.z, rotY: def.rotY, speed: 0, steer: 0 }, interactable, phase: index * 1.7, bob: 0 };
      return v;
    });
  }

  /** The floor you're on is `street` up from the street: the crafts are down there (for where they are in the world). */
  setStreet(street: number) {
    this.street = street;
  }

  /** Where the sea's surface is in the world, on your floor. */
  get water(): number {
    return this.street + SEA_LEVEL;
  }

  /**
   * Each frame: every craft where the office says it is (smoothed, and carried on a little the way
   * it's going), but yours if you're driving it; bobbing, pitching and leaning.
   */
  update(dt: number, t: number, crafts: CraftState[], at: number[], now: number, mine: number | null) {
    const k = 1 - Math.exp(-dt * 10);
    this.t = t;
    for (const v of this.crafts) {
      const c = crafts[v.index];
      if (!c) continue;
      if (v.index === mine) {
        Object.assign(c, v.pose);
        at[v.index] = now;
      } else {
        const p = v.pose;
        const ahead = c.speed ? Math.min(0.25, Math.max(0, (now - (at[v.index] ?? now)) / 1000)) * c.speed : 0;
        const x = c.x + Math.sin(c.rotY) * ahead;
        const z = c.z + Math.cos(c.rotY) * ahead;
        const far = Math.hypot(x - p.x, z - p.z) > 10;
        p.x = far ? x : p.x + (x - p.x) * k;
        p.z = far ? z : p.z + (z - p.z) * k;
        p.rotY = far ? c.rotY : p.rotY + wrap(c.rotY - p.rotY) * k;
        p.speed = c.speed;
        p.steer += (c.steer - p.steer) * k;
      }
      this.show(v, t);
    }
  }

  /** Every craft straight to where the office says it is: the jetty as you arrive on a floor. */
  snap(crafts: CraftState[]) {
    for (const v of this.crafts) {
      const c = crafts[v.index];
      if (c) Object.assign(v.pose, { x: c.x, z: c.z, rotY: c.rotY, speed: c.speed, steer: c.steer });
    }
  }

  /** Puts craft `i` at `pose` (your own driving). */
  place(i: number, pose: CarPose) {
    const v = this.crafts[i];
    if (!v) return;
    Object.assign(v.pose, pose);
    this.show(v, this.t);
  }

  /** Where someone in seat `seat` of craft `i` is: their feet (on its floor; sitting lifts them) and the way they face. */
  seatAt(i: number, seat: number): { x: number; y: number; z: number; rotY: number } | undefined {
    const v = this.crafts[i];
    const s = v && CRAFT_SPECS[v.def.kind].seats[seat];
    if (!v || !s) return undefined;
    const at = craftPoint(v.pose, s.x, s.z);
    return { x: at.x, y: this.water + v.bob + CRAFT_FLOOR, z: at.z, rotY: v.pose.rotY };
  }

  private show(v: CraftView, t: number) {
    const p = v.pose;
    const speed = Math.abs(p.speed);
    // Riding the swell: more of a bob standing still, a skip over it at speed.
    v.bob = Math.sin(t * 1.6 + v.phase) * 0.06 + Math.sin(t * 7 + v.phase) * Math.min(0.03, speed * 0.002);
    v.root.position.set(p.x, this.base + SEA_LEVEL + v.bob, p.z);
    const pitch = -Math.min(v.def.kind === 'jetski' ? 0.14 : 0.1, speed * 0.012) * Math.sign(p.speed || 1) + Math.sin(t * 1.1 + v.phase) * 0.02;
    const roll = -Math.max(-0.25, Math.min(0.25, p.steer * p.speed * 0.03)) + Math.sin(t * 1.3 + v.phase) * 0.025;
    v.root.rotation.set(pitch, p.rotY, roll);
    Object.assign(v.interactable, { x: p.x, z: p.z, y: this.street });
  }
}
