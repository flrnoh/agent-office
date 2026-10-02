import * as THREE from 'three';
import { BUS_H, BUS_L, BUS_LINES, BUS_W, DOORS, busAt, type BusLine, type BusPose } from '../../../shared/citybus';
import { toon } from '../toon';
import type { Collider } from '../types';
import { G } from './kit';

// flrnoh fork (see FORK.md "Traffic lights and the city bus"): the city's buses, where shared/citybus.ts
// has them on the office's clock. A low-floor city bus in its line's color: a low step all along, big
// windows, the line's number and where it's going on the display over the windscreen, two double
// doors on the right that slide open at a stop, and inside a row of seats down each side, yellow
// poles and a light down the ceiling, so it's a bus from in there too.

/** The bus's walls are this thick, so you see their inside from in there. */
const T = 0.06;
/** How far the front's and the back's panels stand proud of the sides and the roof they wrap, so their faces never share a plane. */
const PROUD = 0.01;
const FLOOR_Y = 0.36;
const DOOR_W = 1.25;

/** The line's number and destination in amber dots on black, for the display. */
function displayTexture(line: BusLine): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#0b0b0b';
  g.fillRect(0, 0, 512, 64);
  g.fillStyle = '#ffb627';
  g.font = 'bold 50px monospace';
  g.textBaseline = 'middle';
  g.fillText(line.no, 14, 34);
  g.font = 'bold 40px monospace';
  g.fillText(line.dest, 120, 34);
  // The dots between the LEDs.
  g.fillStyle = 'rgba(0,0,0,0.45)';
  for (let x = 0; x < 512; x += 4) g.fillRect(x, 0, 1, 64);
  for (let y = 0; y < 64; y += 4) g.fillRect(0, y, 512, 1);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export interface CityBus {
  line: BusLine;
  group: THREE.Group;
  pose: BusPose;
  /** Its box, for walking or driving into it (in the frame the colliders are in, see Buses.setStreet). */
  box: Collider;
}

export interface Buses {
  buses: CityBus[];
  /** Puts each where its timetable has it at `t` (seconds on the office's clock); `dark` (0–1) lights it inside. */
  update(t: number, dark: number): void;
  setStreet(y: number): void;
}

const box = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

function buildBus(line: BusLine, glass: THREE.Material, dark: THREE.Material, inner: THREE.MeshBasicMaterial): { group: THREE.Group; leaves: THREE.Mesh[][] } {
  const group = new THREE.Group();
  group.name = `bus-${line.no}`;
  const paint = toon(line.color);
  const white = toon('#f3f1ea');
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, shadow = false) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = shadow;
    group.add(m);
    return m;
  };
  const hl = BUS_L / 2;
  const hw = BUS_W / 2;
  // The floor and the skirt under it, low (a low-floor bus), and the roof.
  add(box(BUS_L, 0.12, BUS_W, 0, FLOOR_Y - 0.06, 0), toon('#5d6168'));
  add(box(BUS_L, 0.14, BUS_W, 0, BUS_H - 0.07, 0), white, true);
  add(box(BUS_L - 2, 0.22, 1.4, -1, BUS_H + 0.11, 0), toon('#d8d6cf')); // the air conditioning on the roof
  // The sides: a painted band below the windows, glass, white over them. On the right, gaps for the doors.
  const doorAt = DOORS.map((u) => [u - DOOR_W / 2, u + DOOR_W / 2]);
  for (const side of [-1, 1]) {
    const z = side * (hw - T / 2);
    const spans: [number, number][] = side > 0 ? [[-hl, doorAt[1][0]], [doorAt[1][1], doorAt[0][0]], [doorAt[0][1], hl]] : [[-hl, hl]];
    for (const [a, b] of spans) {
      const w = b - a;
      const m = (a + b) / 2;
      add(box(w, 0.86, T, m, FLOOR_Y + 0.43, z), paint, true);
      add(box(w, 0.3, T, m, BUS_H - 0.3, z), white);
      add(box(w, 1.12, T * 0.5, m, FLOOR_Y + 1.42, z), glass);
      add(box(w, 0.12, T + 0.03, m, FLOOR_Y + 0.86, z), dark); // proud of the end panels too (PROUD)
    }
    // Over the doors.
    if (side > 0) for (const [a, b] of doorAt) add(box(b - a, 0.42, T, (a + b) / 2, BUS_H - 0.36, z), white);
  }
  // The front: the windscreen down low, the display over it; the back: a panel and a small window.
  // The panels wrap the ends of the sides and the roof, a hair proud of them (PROUD).
  add(box(T + PROUD, 0.62, BUS_W + 2 * PROUD, hl - (T - PROUD) / 2, FLOOR_Y + 0.31, 0), paint, true);
  add(box(T * 0.5, 1.5, BUS_W - 0.1, hl - T / 2, FLOOR_Y + 1.38, 0), glass);
  add(box(T + PROUD, 0.5 - PROUD, BUS_W + 2 * PROUD, hl - (T - PROUD) / 2, BUS_H - 0.25 - PROUD / 2, 0), dark);
  const disp = new THREE.Mesh(new THREE.PlaneGeometry(BUS_W - 0.4, 0.3), new THREE.MeshBasicMaterial({ map: displayTexture(line) }));
  disp.position.set(hl + PROUD + 0.01, BUS_H - 0.25, 0);
  disp.rotation.y = Math.PI / 2;
  group.add(disp);
  // The number on the back and over the front door on the side too.
  const num = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.28), new THREE.MeshBasicMaterial({ map: displayTexture(line) }));
  num.position.set(DOORS[0] - 1.4, BUS_H - 0.3, hw + 0.01);
  group.add(num);
  add(box(T + PROUD, BUS_H - FLOOR_Y - PROUD, BUS_W + 2 * PROUD, -hl + (T - PROUD) / 2, (BUS_H + FLOOR_Y - PROUD) / 2, 0), white, true);
  add(box(0.01, 0.8, BUS_W - 0.6, -hl - PROUD - 0.01, FLOOR_Y + 1.6, 0), glass);
  add(box(T * 0.5, 0.26, BUS_W - 0.3, -hl - 0.01, FLOOR_Y + 0.65, 0), paint);
  // Headlights, tail lights.
  for (const s of [-1, 1]) {
    add(box(0.05, 0.16, 0.36, hl + 0.01, FLOOR_Y + 0.3, s * (hw - 0.32)), new THREE.MeshBasicMaterial({ color: '#fff4cf' }));
    add(box(0.05, 0.3, 0.16, -hl - 0.01, FLOOR_Y + 0.6, s * (hw - 0.2)), new THREE.MeshBasicMaterial({ color: '#d61f1f' }));
  }
  // The wheels: one axle under the front door's end, two at the back.
  for (const x of [hl - 2.6, -hl + 2.8]) for (const s of [-1, 1]) add(new THREE.CylinderGeometry(0.48, 0.48, 0.3, 14).rotateX(Math.PI / 2).translate(x, 0.48, s * (hw - 0.12)), dark);
  // Inside: seats down both sides, poles, a light down the ceiling.
  const seat = toon('#2f5aa8');
  for (let x = -hl + 1; x < hl - 2.5; x += 0.85) {
    if (DOORS.some((u) => Math.abs(x - u) < DOOR_W / 2 + 0.3)) continue;
    for (const s of [-1, 1]) {
      if (s > 0 && x > DOORS[1] && x < DOORS[0]) continue;
      add(box(0.45, 0.1, 0.48, x, FLOOR_Y + 0.45, s * (hw - 0.4)), seat);
      add(box(0.08, 0.5, 0.48, x - 0.22, FLOOR_Y + 0.75, s * (hw - 0.4)), seat);
    }
  }
  const yellow = toon('#f2c230');
  for (const u of DOORS) for (const dz of [-0.4, 0.35]) add(new THREE.CylinderGeometry(0.025, 0.025, BUS_H - FLOOR_Y, 6).translate(u + 0.75, (BUS_H + FLOOR_Y) / 2, dz), yellow);
  add(box(BUS_L - 1, 0.03, 0.18, 0, BUS_H - 0.16, 0), inner);
  // The driver's seat and wheel.
  add(box(0.5, 0.55, 0.5, hl - 1.1, FLOOR_Y + 0.5, -hw + 0.6), dark);
  add(new THREE.TorusGeometry(0.2, 0.03, 6, 16).rotateY(Math.PI / 2).rotateZ(0.5).translate(hl - 0.6, FLOOR_Y + 1.05, -hw + 0.6), dark);
  // The doors: two leaves each, sliding out and apart.
  const doorMat = new THREE.MeshToonMaterial({ color: '#cfe8f2', transparent: true, opacity: 0.55 });
  const leaves = DOORS.map((u) =>
    [-1, 1].map((s) => {
      const leaf = new THREE.Mesh(box(DOOR_W / 2 - 0.02, BUS_H - FLOOR_Y - 0.5, 0.05, 0, 0, 0), doorMat);
      leaf.position.set(u + (s * DOOR_W) / 4, FLOOR_Y + (BUS_H - FLOOR_Y - 0.5) / 2, hw - 0.02);
      leaf.userData.u = u;
      leaf.userData.s = s;
      group.add(leaf);
      return leaf;
    }),
  );
  return { group, leaves };
}

export function buildBuses(parent: THREE.Group): Buses {
  const glass = new THREE.MeshToonMaterial({ color: '#2b3a4a', transparent: true, opacity: 0.55 });
  const dark = toon('#22252b');
  const inner = new THREE.MeshBasicMaterial({ color: '#fdf6dd' });
  let street = G;
  const buses = BUS_LINES.map((line) => {
    const built = buildBus(line, glass, dark, inner);
    parent.add(built.group);
    const pose = busAt(line, 0);
    // Where it is at 0 till the first update, not all of them in a heap in one place.
    built.group.position.set(pose.x, G, pose.z);
    built.group.rotation.y = pose.yaw;
    return { line, group: built.group, leaves: built.leaves, pose, box: { minX: 0, maxX: 0, minZ: 0, maxZ: 0, bottom: 0, top: 0 } as Collider };
  });
  return {
    buses,
    setStreet: (y) => (street = y),
    update(t, darkness) {
      inner.color.setScalar(0.55 + 0.45 * darkness);
      for (const b of buses) {
        const p = busAt(b.line, t, b.pose);
        b.group.position.set(p.x, G, p.z);
        b.group.rotation.y = p.yaw;
        for (const pair of b.leaves) {
          for (const leaf of pair) {
            const { u, s } = leaf.userData as { u: number; s: number };
            // Out a hand's width first, then apart along the side.
            const out = Math.min(1, p.doors * 3);
            const apart = Math.max(0, (p.doors - 0.3) / 0.7);
            leaf.position.x = u + (s * DOOR_W) / 4 + s * apart * (DOOR_W / 2 - 0.05);
            leaf.position.z = BUS_W / 2 - 0.02 + out * 0.12;
          }
        }
        const c = Math.abs(Math.cos(p.yaw));
        const s = Math.abs(Math.sin(p.yaw));
        const ex = (BUS_L / 2) * c + (BUS_W / 2) * s;
        const ez = (BUS_L / 2) * s + (BUS_W / 2) * c;
        Object.assign(b.box, { minX: p.x - ex, maxX: p.x + ex, minZ: p.z - ez, maxZ: p.z + ez, bottom: street, top: street + BUS_H });
      }
    },
  };
}
