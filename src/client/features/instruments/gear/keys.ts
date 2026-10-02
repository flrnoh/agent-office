import * as THREE from 'three';
import { mergeByColor, mesh, toon } from '../../../world/toon';

// ---- Keyboards and mics (flrnoh fork, see FORK.md "The instruments") ---------------------------------
// A 61-key stage keyboard (C2 to C7) in its colour, its keys going down as they're played (two
// instanced meshes, white and black), knobs and a lit display, on an X stand; and a vocal mic in its
// clip on a boom stand. Each stands on the floor with whoever plays it at the origin facing +z.

const WHITE_W = 0.0235;
const FIRST = 36;
const LAST = 96;
const isBlack = (p: number) => [1, 3, 6, 8, 10].includes(((p % 12) + 12) % 12);
const WHITES = [...Array(LAST - FIRST + 1)].map((_, i) => FIRST + i).filter((p) => !isBlack(p));
const BOARD_W = WHITES.length * WHITE_W + 0.1;

/** Where key `p`'s middle is across the board (its x), the whites side by side, the blacks between. */
function keyX(p: number): number {
  const wi = WHITES.indexOf(isBlack(p) ? p - 1 : p);
  const x = -BOARD_W / 2 + 0.05 + (wi + 0.5) * WHITE_W;
  return isBlack(p) ? x + WHITE_W / 2 : x;
}

export interface KeyboardModel {
  group: THREE.Group;
  /** Each frame: how far down each key is. */
  update(dt: number): void;
  /** A key goes down (or comes up). */
  press(pitch: number, down: boolean): void;
}

/** A keyboard `top` metres up (its keys' height), its body in `color`; `stand` whether it has its own X stand. */
export function keyboard(color: string, top: number, stand: boolean): KeyboardModel {
  const group = new THREE.Group();
  group.name = 'keyboard';
  const still = new THREE.Group();
  const body = toon(color);
  const y0 = top - 0.045;
  // The case: its bed, cheeks, the panel behind the keys, the display.
  still.add(mesh(new THREE.BoxGeometry(BOARD_W, 0.05, 0.3), body, 0, y0, 0.02));
  for (const s of [-1, 1]) still.add(mesh(new THREE.BoxGeometry(0.05, 0.085, 0.3), body, (s * (BOARD_W - 0.05)) / 2, y0 + 0.018, 0.02));
  still.add(mesh(new THREE.BoxGeometry(BOARD_W, 0.07, 0.12), body, 0, y0 + 0.03, 0.12));
  // Knobs and buttons along the panel, and the wheels on the left.
  const knob = new THREE.CylinderGeometry(0.009, 0.01, 0.014, 10);
  for (let i = 0; i < 14; i++) still.add(mesh(knob, toon('#1a1a1f'), -BOARD_W / 2 + 0.2 + i * 0.038, y0 + 0.072, 0.115, false));
  for (let i = 0; i < 8; i++) still.add(mesh(new THREE.BoxGeometry(0.018, 0.008, 0.012), toon(i % 3 ? '#e9e6dd' : '#f0b429'), 0.12 + i * 0.03, y0 + 0.068, 0.15, false));
  for (const x of [-BOARD_W / 2 + 0.022, -BOARD_W / 2 + 0.042]) still.add(mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.012, 12).rotateZ(Math.PI / 2), toon('#222'), x + 0.02, y0 + 0.03, -0.06, false));
  const display = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.035), new THREE.MeshBasicMaterial({ color: '#7fd3ff' }));
  display.rotation.x = -Math.PI / 2 + 0.25;
  display.position.set(0.0, y0 + 0.068, 0.1);
  display.userData.outlineParameters = { visible: false };
  group.add(display);
  if (stand) {
    // The X stand: two crossed legs each side, the arms the board rests on.
    const mat = toon('#1d1d22');
    for (const s of [-0.28, 0.28]) {
      for (const k of [-1, 1]) {
        const leg = mesh(new THREE.BoxGeometry(0.03, Math.hypot(y0 - 0.06, 0.5), 0.025), mat, s + k * 0.02, (y0 - 0.06) / 2, 0.03);
        leg.rotation.x = k * Math.atan2(0.5, y0 - 0.06);
        still.add(leg);
      }
      still.add(mesh(new THREE.BoxGeometry(0.035, 0.03, 0.34), mat, s, y0 - 0.04, 0.02));
    }
    still.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.56, 6).rotateZ(Math.PI / 2), mat, 0, (y0 - 0.06) / 2, 0.03));
  }
  group.add(mergeByColor(still));

  // The keys: whites full length, blacks shorter and raised, each its own instance to push down.
  const whites = new THREE.InstancedMesh(new THREE.BoxGeometry(WHITE_W - 0.0018, 0.022, 0.15), toon('#f4f1ea'), WHITES.length);
  const blacks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.013, 0.02, 0.095), toon('#121116'), LAST - FIRST + 1 - WHITES.length);
  whites.castShadow = blacks.castShadow = true;
  group.add(whites, blacks);
  const slot = new Map<number, { mesh: THREE.InstancedMesh; i: number; x: number; y: number; z: number }>();
  let wi = 0;
  let bi = 0;
  for (let p = FIRST; p <= LAST; p++) {
    const black = isBlack(p);
    const s = black ? { mesh: blacks, i: bi++, x: keyX(p), y: y0 + 0.042, z: -0.005 } : { mesh: whites, i: wi++, x: keyX(p), y: y0 + 0.032, z: -0.03 };
    slot.set(p, s);
  }
  const down = new Map<number, number>();
  const want = new Set<number>();
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const axis = new THREE.Vector3(1, 0, 0);
  const one = new THREE.Vector3(1, 1, 1);
  const place = (p: number, k: number) => {
    const s = slot.get(p)!;
    // Down at the front, pivoting at the back.
    q.setFromAxisAngle(axis, k * 0.1);
    m.compose(new THREE.Vector3(s.x, s.y - k * 0.009, s.z), q, one);
    s.mesh.setMatrixAt(s.i, m);
    s.mesh.instanceMatrix.needsUpdate = true;
  };
  for (const p of slot.keys()) place(p, 0);
  return {
    group,
    press(pitch, on) {
      // Out of the board's range: the nearest key in the same place of the octave.
      let p = pitch;
      while (p < FIRST) p += 12;
      while (p > LAST) p -= 12;
      if (on) {
        want.add(p);
        down.set(p, Math.max(down.get(p) ?? 0, 0.2));
      } else want.delete(p);
    },
    update(dt) {
      for (const [p, k] of down) {
        const to = want.has(p) ? 1 : 0;
        const next = k + (to - k) * Math.min(1, dt * 30);
        if (!want.has(p) && next < 0.02) {
          down.delete(p);
          place(p, 0);
        } else {
          down.set(p, next);
          place(p, next);
        }
      }
    },
  };
}

/** A vocal mic: its black handle, the ring, the ball of a grille (about 18 cm). */
export function micModel(): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.02, 0.013, 0.13, 12), toon('#1c1b21'), 0, 0.065, 0, false));
  g.add(mesh(new THREE.CylinderGeometry(0.024, 0.022, 0.016, 12), toon('#9da3ad'), 0, 0.135, 0, false));
  g.add(mesh(new THREE.SphereGeometry(0.031, 14, 10), toon('#c8ccd4'), 0, 0.165, 0, false));
  return g;
}

/**
 * A mic stand for whoever stands at the origin: round base and tube a step ahead, the boom reaching
 * back toward their mouth (`mouth` high; a character's face sticks out 0.34 m), the mic in its clip.
 */
export function micStand(mouth = 1.24): { group: THREE.Group; mic: THREE.Object3D } {
  const group = new THREE.Group();
  const still = new THREE.Group();
  const mat = toon('#1d1d22');
  const foot = 0.68;
  const top = mouth - 0.1;
  still.add(mesh(new THREE.CylinderGeometry(0.15, 0.16, 0.025, 20), mat, 0, 0.012, foot));
  still.add(mesh(new THREE.CylinderGeometry(0.011, 0.013, top, 8), mat, 0, top / 2, foot));
  still.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.05, 8), mat, 0, top, foot));
  // The boom, from the top of the tube up and back toward the singer.
  const from = new THREE.Vector3(0, top, foot);
  const to = new THREE.Vector3(0, mouth - 0.02, 0.5);
  const boom = mesh(new THREE.CylinderGeometry(0.007, 0.007, from.distanceTo(to), 6), mat, 0, (from.y + to.y) / 2, (from.z + to.z) / 2);
  boom.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
  still.add(boom);
  // The cable down the tube.
  still.add(mesh(new THREE.CylinderGeometry(0.004, 0.004, top - 0.05, 5), toon('#0b0b0d'), 0.016, top / 2, foot + 0.005, false));
  group.add(mergeByColor(still));
  const mic = micModel();
  mic.name = 'mic';
  mic.position.set(0, mouth - 0.04, 0.52);
  mic.rotation.x = -1.25; // its grille toward the singer's mouth
  group.add(mic);
  return { group, mic };
}
