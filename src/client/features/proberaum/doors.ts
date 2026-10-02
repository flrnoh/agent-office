import * as THREE from 'three';
import { DOOR_HEIGHT, WING_WALL, doorOf } from '../../../shared/proberaum-layout';
import type { RehearsalRoom, RehearsalRoomId } from '../../../shared/venue';
import { mesh, toon } from '../../world/toon';
import type { Collider } from '../../world/types';
import { canvasTex } from './paint';
import { signTexture } from './posters';
import { bake, box, picture } from './props';

/*
 * The rooms' doors (flrnoh fork, see FORK.md "The rehearsal wing"): heavy acoustic doors with a
 * rubber seal, a small window and a lever handle, hinged on the south jamb and swinging into the
 * room; over each on the corridor side a red PROBE LÄUFT light (AUFNAHME over the studio's), beside
 * it the room's number and a little screen saying who has it till when (boards.ts draws it).
 */

export interface DoorView {
  room: RehearsalRoomId;
  /** The leaf and its frame, the light, the sign and the screen: what the crosshair finds for the door. */
  leaf: THREE.Object3D;
  screen: THREE.Object3D;
  /** The screen's canvas (boards.ts draws on it) and texture. */
  panel: { canvas: HTMLCanvasElement; texture: THREE.CanvasTexture };
  /** The doorway while it's shut (or while it keeps you out), and the open leaf: what you walk into. */
  colliders: Collider[];
  /** Shut or open (shared), and whether the doorway keeps you out even open (booked, not your band). */
  set(open: boolean, barred: boolean): void;
  /** The red light over it: on while someone's playing in there or it's booked; `rec` the studio's AUFNAHME. */
  light(on: boolean): void;
  /** How open it is (0 shut, 1 open), for the sound. */
  readonly openness: number;
  update(dt: number): void;
}

/** What the door's little window shows: the light in the room behind it. */
const WINDOW: Record<RehearsalRoomId, string> = { probe1: '#b9c4d6', probe2: '#e8b070', probe3: '#b3332a', studio: '#d8c2a0' };

/** A soft red glow round the light, on the wall. */
function haloTexture(): THREE.CanvasTexture {
  return canvasTex(128, 64, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,40,30,0.9)');
    gr.addColorStop(0.5, 'rgba(255,30,20,0.25)');
    gr.addColorStop(1, 'rgba(255,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  });
}

const GONE = 1e5;
/** Puts a collider where it belongs, or out of the way. */
function place(c: Collider, at: Collider | null) {
  if (at) Object.assign(c, at);
  else Object.assign(c, { minX: GONE, maxX: GONE + 0.1, minZ: GONE, maxZ: GONE + 0.1 });
}

export function buildDoor(r: RehearsalRoom, parent: THREE.Group): DoorView {
  const d = doorOf(r);
  const studio = r.id === 'studio';
  const east = r.box.maxX; // the corridor side of the wall
  const west = east - WING_WALL;
  const w = d.width - 0.06;
  const h = DOOR_HEIGHT - 0.04;

  // The frame round the opening, steel, both sides.
  const frame = new THREE.Group();
  const steel = toon('#3d4148');
  for (const x of [east + 0.012, west - 0.012]) {
    for (const z of [d.z - d.width / 2 - 0.04, d.z + d.width / 2 + 0.04]) frame.add(mesh(new THREE.BoxGeometry(0.025, DOOR_HEIGHT + 0.08, 0.09), steel, x, DOOR_HEIGHT / 2, z));
    frame.add(mesh(new THREE.BoxGeometry(0.025, 0.09, d.width + 0.17), steel, x, DOOR_HEIGHT + 0.04, d.z));
  }
  // A threshold.
  frame.add(mesh(new THREE.BoxGeometry(WING_WALL + 0.04, 0.02, d.width), toon('#8b8f96'), (east + west) / 2, 0.01, d.z));
  parent.add(bake(frame));

  // The leaf, on its hinge: a thick padded slab, grey on the corridor side, its window, the handles.
  const pivot = new THREE.Group();
  pivot.position.set((east + west) / 2, 0, d.hingeZ - 0.03);
  const leaf = new THREE.Group();
  const slab = mesh(new THREE.BoxGeometry(0.09, h, w), toon(studio ? '#2f3a44' : '#5b6470'), 0, h / 2 + 0.01, -w / 2);
  leaf.add(slab);
  for (const s of [-1, 1]) {
    // The rubber seal round its edge, and a kick plate.
    leaf.add(mesh(new THREE.BoxGeometry(0.004, h - 0.04, 0.03), toon('#1a1a1a'), s * 0.047, h / 2, -0.03));
    leaf.add(mesh(new THREE.BoxGeometry(0.004, 0.25, w - 0.1), toon('#9aa0a6'), s * 0.047, 0.16, -w / 2));
    // The lever handle and its plate.
    leaf.add(mesh(new THREE.BoxGeometry(0.01, 0.22, 0.06), toon('#b9bec4'), s * 0.05, 1.05, -w + 0.12));
    const lever = mesh(new THREE.BoxGeometry(0.03, 0.025, 0.14), toon('#d0d4d8'), s * 0.07, 1.1, -w + 0.17);
    leaf.add(lever);
  }
  // The window: a small double pane, warm light behind it.
  // The room's light shows through it.
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.38), new THREE.MeshBasicMaterial({ color: WINDOW[r.id] }));
  for (const s of [-1, 1]) {
    const p = pane.clone();
    p.position.set(s * 0.051, 1.52, -w / 2);
    p.rotation.y = (s * Math.PI) / 2;
    leaf.add(p);
    leaf.add(mesh(new THREE.BoxGeometry(0.006, 0.44, 0.32), toon('#2a2a2a'), s * 0.046, 1.52, -w / 2));
  }
  pivot.add(bake(leaf));
  parent.add(pivot);

  // Over it on the corridor side: the red light (a lightbox), the number, the screen.
  const lightTex = signTexture(studio ? '● AUFNAHME' : 'PROBE LÄUFT', '#ffffff', '#b3121b', 512, 128);
  const offTex = signTexture(studio ? '● AUFNAHME' : 'PROBE LÄUFT', '#5a2a2a', '#2a1214', 512, 128);
  const lamp = new THREE.MeshBasicMaterial({ map: offTex });
  const lightBox = new THREE.Group();
  lightBox.add(mesh(new THREE.BoxGeometry(0.08, 0.2, 0.7), toon('#1f1f1f'), 0, 0, 0));
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.165), lamp);
  face.rotation.y = Math.PI / 2;
  face.position.x = 0.042;
  lightBox.add(face);
  lightBox.position.set(east + 0.05, DOOR_HEIGHT + 0.32, d.z);
  parent.add(bake(lightBox));
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.8), new THREE.MeshBasicMaterial({ map: haloTexture(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.rotation.y = Math.PI / 2;
  halo.position.set(east + 0.006, DOOR_HEIGHT + 0.32, d.z);
  parent.add(halo);

  const n = studio ? 'S' : r.id.slice(-1);
  const sign = picture(canvasTex(128, 128, (g) => {
    g.fillStyle = '#f2f2f2';
    g.beginPath();
    g.roundRect(4, 4, 120, 120, 14);
    g.fill();
    g.strokeStyle = '#1d1d1d';
    g.lineWidth = 6;
    g.stroke();
    g.fillStyle = '#1d1d1d';
    g.font = '900 86px Nunito, Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(n, 64, 70);
  }), 0.22, 0.22);
  sign.rotation.y = Math.PI / 2;
  sign.position.set(east + 0.006, 1.75, d.z + d.width / 2 + 0.3);
  parent.add(sign);

  // The screen: a small display in a steel bezel, lit.
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 192;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Group();
  screen.add(box(0.03, 0.34, 0.44, '#2b2e33', 0, -0.17, 0));
  const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.3), new THREE.MeshBasicMaterial({ map: texture }));
  disp.rotation.y = Math.PI / 2;
  disp.position.set(0.017, 0, 0);
  screen.add(disp);
  screen.position.set(east + 0.015, 1.4, d.z - d.width / 2 - 0.55);
  const screenBaked = bake(screen);
  parent.add(screenBaked);

  // What you walk into: the shut door fills its doorway; the open leaf lies along the room's side.
  const shutAt: Collider = { minX: west - 0.02, maxX: east + 0.02, minZ: d.z - d.width / 2, maxZ: d.z + d.width / 2, top: 3.3 };
  const leafAt: Collider = { minX: west - w, maxX: west, minZ: d.hingeZ - 0.12, maxZ: d.hingeZ - 0.02, top: DOOR_HEIGHT };
  const doorway: Collider = { ...shutAt };
  const openLeaf: Collider = { ...leafAt };
  place(openLeaf, null);

  let target = 0;
  let k = 0;
  let barred = false;
  let lit = false;
  const sync = () => {
    place(doorway, k < 0.6 || barred ? shutAt : null);
    place(openLeaf, k > 0.6 ? leafAt : null);
  };
  return {
    room: r.id,
    leaf: pivot,
    screen: screenBaked,
    panel: { canvas, texture },
    colliders: [doorway, openLeaf],
    set(open, bar) {
      target = open ? 1 : 0;
      barred = bar;
      sync();
    },
    light(on) {
      if (on === lit) return;
      lit = on;
      lamp.map = on ? lightTex : offTex;
      lamp.needsUpdate = true;
      (halo.material as THREE.MeshBasicMaterial).opacity = on ? 0.55 : 0;
    },
    get openness() {
      return k;
    },
    update(dt) {
      if (k === target) return;
      // Heavy: it swings open slowly and falls shut a little faster.
      const speed = target > k ? 1.1 : 1.6;
      k = target > k ? Math.min(target, k + dt * speed) : Math.max(target, k - dt * speed);
      const e = k * k * (3 - 2 * k);
      pivot.rotation.y = (e * Math.PI) / 2;
      sync();
    },
  };
}
