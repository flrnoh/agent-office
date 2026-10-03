import * as THREE from 'three';
import { BULLI_DRIVE, BULLI_HIPS, BULLI_SEATS } from '../../shared/bulli';
import type { CarDef, CarPose } from '../../shared/garage';
import { FLOOR, STREET_Y } from '../../shared/layout';
import { mergeByMaterial, mesh, roundedBox, textPlane, toon } from './toon';

// flrnoh fork: Flogge's Bulli (shared/bulli.ts), drawn: a split-window camper van, teal below and
// cream above with the cream V down its nose, round headlights, whitewall tyres, a roof rack with a
// surfboard on it, and FLOGGE on its plates. It rides soft: it leans out of bends and nods when it
// brakes (wobble). Its corner of the garage has a sign on the wall and lines on the floor (bulliBay).

const TEAL = '#2a9d8f';
const CREAM = '#fdf0d5';
const L = 2.15;
const W = 0.89;
const BELT = 1.05;
const WHEEL_R = 0.34;
const AXLE = 1.2;

/** The parts of a car's model the garage moves (see CarModel in world/cars.ts), and the body that rocks. */
export interface BulliModel {
  root: THREE.Group;
  top: THREE.Object3D;
  open: THREE.Object3D;
  wheels: THREE.Object3D[];
  sway: Sway;
  mirrors: THREE.Mesh[];
}

/** The body on its springs: how far it's leaning (roll, + to its right) and nodding (pitch, + nose down), and how fast. */
export interface Sway {
  body: THREE.Object3D;
  roll: number;
  pitch: number;
  vRoll: number;
  vPitch: number;
  speed: number;
}

/** A number plate: white, black letters, the blue EU strip with a D. Plain white where there's no canvas (tests). */
function plate(text: string): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(0.52, 0.115);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 520;
    canvas.height = 115;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 520, 115);
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#111111';
    ctx.strokeRect(4, 4, 512, 107);
    ctx.fillStyle = '#003399';
    ctx.fillRect(8, 8, 52, 99);
    ctx.strokeStyle = '#ffcc00';
    ctx.lineWidth = 3;
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.arc(34, 40, 15, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 34px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('D', 34, 86);
    ctx.fillStyle = '#111111';
    ctx.font = '700 84px "DIN Alternate", "Arial Narrow", system-ui, sans-serif';
    ctx.fillText(text, 290, 62, 440);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex }));
  } catch {
    return new THREE.Mesh(geo, toon('#ffffff'));
  }
}

/** Flogge's Bulli, nose toward +z, wheels on y = 0: the same parts as a supercar (CarModel), and its springs. */
export function bulli(def: CarDef): BulliModel {
  const paint = toon(def.color || TEAL);
  const cream = toon(CREAM);
  const glass = toon('#233347');
  const chrome = toon('#d9dbe3');
  const tire = toon('#1f1f26');
  const white = toon('#f4f4f0');
  const dark = toon('#2b2d42');
  const lamp = toon('#fff6c9', { emissive: '#b8a960' });
  const tail = toon('#ff2d3f', { emissive: '#a3001a' });

  // The body, below the belt line: teal all round, with the cream V coming down the nose to the badge.
  const g = new THREE.Group();
  g.add(mesh(roundedBox(W * 2, BELT - 0.4, L * 2, 0.3), paint, 0, (BELT + 0.4) / 2, 0));
  const v = new THREE.Shape();
  v.moveTo(-0.58, BELT);
  v.lineTo(0.58, BELT);
  v.lineTo(0, 0.7);
  v.closePath();
  g.add(mesh(new THREE.ShapeGeometry(v), cream, 0, 0, L + 0.004, false));
  g.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.03, 20).rotateX(Math.PI / 2), chrome, 0, 0.88, L + 0.01, false));
  g.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.035, 20).rotateX(Math.PI / 2), paint, 0, 0.88, L + 0.012, false));
  // Round headlights in chrome rims, out on the corners of the nose.
  for (const sx of [-1, 1]) {
    g.add(mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.1, 20).rotateX(Math.PI / 2), chrome, sx * 0.6, 0.72, L - 0.04));
    g.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.03, 20).rotateX(Math.PI / 2), lamp, sx * 0.6, 0.72, L + 0.02, false));
    // Little round taillights at the back, and indicators on the nose.
    g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 14).rotateX(Math.PI / 2), tail, sx * 0.7, 0.8, -L - 0.01, false));
    g.add(mesh(new THREE.SphereGeometry(0.04, 10, 8), toon('#ffb703', { emissive: '#7a5200' }), sx * 0.66, 1.0, L - 0.02, false));
    // A chrome trim along the belt line, and the black wheel arches.
    g.add(mesh(new THREE.BoxGeometry(0.02, 0.03, 3.7), chrome, sx * (W + 0.005), BELT, 0, false));
    for (const az of [-AXLE, AXLE]) {
      const arch = mesh(new THREE.CircleGeometry(0.42, 18, 0, Math.PI).rotateY((sx * Math.PI) / 2), dark, sx * (W + 0.004), WHEEL_R, az, false);
      g.add(arch);
    }
  }
  // Chrome bumpers front and back, the round engine lid at the back.
  for (const sz of [-1, 1]) g.add(mesh(roundedBox(W * 2 + 0.06, 0.1, 0.12, 0.05), chrome, 0, 0.38, sz * (L + 0.04)));
  g.add(mesh(roundedBox(1.0, 0.36, 0.02, 0.01), paint, 0, 0.66, -L - 0.004, false));

  const wheel = (x: number, z: number) => {
    const w = new THREE.Group();
    w.position.set(x, WHEEL_R, z);
    w.add(mesh(new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.2, 18).rotateZ(Math.PI / 2), tire));
    w.add(mesh(new THREE.CylinderGeometry(WHEEL_R * 0.74, WHEEL_R * 0.74, 0.205, 16).rotateZ(Math.PI / 2), white));
    w.add(mesh(new THREE.CylinderGeometry(WHEEL_R * 0.52, WHEEL_R * 0.52, 0.21, 14).rotateZ(Math.PI / 2), tire));
    w.add(mesh(new THREE.CylinderGeometry(WHEEL_R * 0.4, WHEEL_R * 0.4, 0.22, 14).rotateZ(Math.PI / 2), cream));
    return w;
  };
  const rear = new THREE.Group();
  const wheels: THREE.Object3D[] = [];
  for (const sx of [-1, 1]) {
    const x = sx * (W - 0.08);
    rear.add(wheel(x, -AXLE));
    wheels.push(wheel(x, AXLE));
  }

  // Above the belt line: cream, windows all along, a white roof with the rack and the surfboard. It
  // comes off (the whole canvas roof folded away) with anyone in it, so their heads are out in the air.
  const closed = new THREE.Group();
  const upper = 1.87 - BELT;
  closed.add(mesh(roundedBox(W * 2 - 0.04, upper, L * 2 - 0.1, 0.25), cream, 0, BELT + upper / 2, 0));
  closed.add(mesh(roundedBox(W * 2 - 0.16, 0.1, L * 2 - 0.3, 0.3), white, 0, 1.91, 0));
  for (const sx of [-1, 1]) {
    for (const [z, len] of [
      [1.42, 0.52],
      [0.62, 0.6],
      [-0.1, 0.6],
      [-0.82, 0.6],
      [-1.35, 0.3],
    ]) {
      closed.add(mesh(new THREE.BoxGeometry(0.02, 0.4, len), glass, sx * (W - 0.01), 1.43, z, false));
    }
    // The engine's cooling louvres, up behind the last window.
    for (let i = 0; i < 5; i++) closed.add(mesh(new THREE.BoxGeometry(0.02, 0.025, 0.28), dark, sx * (W - 0.01), 1.18 + i * 0.07, -1.7, false));
    // The rack's rails.
    closed.add(mesh(new THREE.BoxGeometry(0.05, 0.05, 3.3), chrome, sx * 0.62, 2.0, 0));
    closed.add(mesh(new THREE.BoxGeometry(0.03, 0.08, 0.03), chrome, sx * 0.62, 1.96, 1.5, false));
    closed.add(mesh(new THREE.BoxGeometry(0.03, 0.08, 0.03), chrome, sx * 0.62, 1.96, -1.5, false));
  }
  for (const z of [-1.1, 0, 1.1]) closed.add(mesh(new THREE.BoxGeometry(1.3, 0.04, 0.05), chrome, 0, 2.03, z, false));
  closed.add(mesh(new THREE.BoxGeometry(0.8, 0.26, 0.02), glass, 0, 1.5, -L + 0.04, false));
  // The surfboard, strapped on: orange with a white stripe down it.
  const board = mesh(new THREE.SphereGeometry(1, 20, 10), toon('#ff9f1c'), 0.12, 2.1, 0.1);
  board.scale.set(0.27, 0.04, 1.25);
  closed.add(board);
  const stripe = mesh(new THREE.SphereGeometry(1, 16, 8), white, 0.12, 2.113, 0.1, false);
  stripe.scale.set(0.035, 0.035, 1.2);
  closed.add(stripe);

  // The split windshield in its cream frame: it folds away with the roof (like a supercar's glass),
  // or whoever sits up front would look at the dark panes instead of the road.
  for (const sx of [-1, 1]) closed.add(mesh(new THREE.BoxGeometry(0.56, 0.4, 0.03), glass, sx * 0.33, 1.42, L - 0.03, false));
  closed.add(mesh(new THREE.BoxGeometry(0.08, 0.44, 0.05), cream, 0, 1.42, L - 0.04, false));
  closed.add(mesh(new THREE.BoxGeometry(W * 2 - 0.1, 0.06, 0.1), cream, 0, 1.64, L - 0.06, false));

  // Always there: the mirrors.
  const always = new THREE.Group();
  for (const sx of [-1, 1]) {
    const arm = mesh(new THREE.BoxGeometry(0.025, 0.025, 0.3), chrome, sx * (W + 0.12), 1.24, L - 0.3, false);
    arm.rotation.y = sx * 0.6;
    always.add(arm);
    always.add(mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.025, 20).rotateX(Math.PI / 2), chrome, sx * (W + 0.2), 1.3, L - 0.2, false));
  }
  // Their glass, facing back at whoever's up front: what's behind gets drawn on it while you're in it
  // (features/cars/mirrors.ts), dull grey till then. Flipped left to right, the way a mirror is.
  const mirrors = [-1, 1].map((sx) => {
    const geo = new THREE.CircleGeometry(0.094, 28).rotateY(Math.PI);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
    const glass = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#8e9aa8' }));
    glass.position.set(sx * (W + 0.2), 1.3, L - 0.2 - 0.0145);
    glass.userData.side = sx;
    return glass;
  });

  // Roof off: the seats up front (and the bench behind) and the big thin bus wheel, nearly flat.
  const open = new THREE.Group();
  for (const s of Object.values(BULLI_SEATS)) {
    open.add(mesh(new THREE.BoxGeometry(0.52, 0.1, 0.46), dark, s.x, BULLI_HIPS - 0.05, s.z));
    const back = mesh(new THREE.BoxGeometry(0.52, 0.62, 0.1), dark, s.x, BULLI_HIPS + 0.3, s.z - 0.3);
    back.rotation.x = -0.12;
    open.add(back);
  }
  open.add(mesh(new THREE.BoxGeometry(1.5, 0.5, 0.12), toon('#e76f51'), 0, BELT - 0.05, -0.6));
  // Low, far and nearly flat, like a real bus wheel: the driver looks over it, not through it.
  const wheelHoop = mesh(new THREE.TorusGeometry(0.21, 0.02, 6, 22), dark, BULLI_SEATS.driver.x, 1.08, BULLI_SEATS.driver.z + 0.55);
  wheelHoop.rotation.x = -1.3;
  open.add(wheelHoop);

  const body = new THREE.Group();
  const top = mergeByMaterial(closed);
  const inside = mergeByMaterial(open);
  inside.visible = false;
  body.add(mergeByMaterial(g), mergeByMaterial(always), top, inside, ...mirrors);
  // The plates aren't merged: they're drawn from a picture.
  if (def.plate) {
    const front = plate(def.plate);
    front.position.set(0, 0.54, L + 0.012);
    const back = plate(def.plate);
    back.position.set(0, 0.64, -L - 0.03);
    back.rotation.y = Math.PI;
    body.add(front, back);
  }
  const root = new THREE.Group();
  root.add(body, mergeByMaterial(rear), ...wheels);
  return { root, top, open: inside, wheels, mirrors, sway: { body, roll: 0, pitch: 0, vRoll: 0, vPitch: 0, speed: 0 } };
}

/** How soft its springs are: how often it rocks (Hz) and how little that dies away. */
const SPRING = { hz: 1.5, damping: 0.28 } as const;

/**
 * The Bulli rocking on its springs, `dt` on: it leans out of a bend as hard as the bend pulls it,
 * nods forward braking and sits back pulling away, and overshoots a little each time. With its
 * engine running (somebody in it) it shivers a bit, the way an old boxer engine does.
 */
export function wobble(s: Sway, pose: CarPose, running: boolean, dt: number, now: number) {
  dt = Math.min(dt, 0.05);
  if (dt <= 0) return;
  const lateral = (pose.speed * pose.speed * Math.tan(pose.steer)) / BULLI_DRIVE.wheelbase;
  const accel = (pose.speed - s.speed) / dt;
  s.speed = pose.speed;
  const clamp = (x: number, m: number) => Math.max(-m, Math.min(m, x));
  const roll = clamp(lateral * 0.012, 0.08);
  const pitch = clamp(-accel * Math.sign(pose.speed || 1) * 0.01, 0.05);
  const w = 2 * Math.PI * SPRING.hz;
  s.vRoll += (w * w * (roll - s.roll) - 2 * SPRING.damping * w * s.vRoll) * dt;
  s.vPitch += (w * w * (pitch - s.pitch) - 2 * SPRING.damping * w * s.vPitch) * dt;
  s.roll += s.vRoll * dt;
  s.pitch += s.vPitch * dt;
  const shiver = running ? 0.0025 * Math.sin(now * 0.057) : 0;
  s.body.rotation.set(s.pitch, 0, s.roll + shiver);
  s.body.position.y = running ? 0.004 * Math.sin(now * 0.041) : 0;
}

/** Flogge's corner of the garage: a sign on the back wall over the Bulli, and lines on the floor round its spot. */
export function bulliBay(def: CarDef): THREE.Group {
  const g = new THREE.Group();
  const back = FLOOR.minZ;
  const paint = toon('#fdf0d5');
  for (const sx of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.12, 0.01, 5.4), paint, def.x + sx * 1.35, STREET_Y + 0.012, back + 2.7, false));
  g.add(mesh(new THREE.BoxGeometry(2.82, 0.01, 0.12), paint, def.x, STREET_Y + 0.012, back + 5.4, false));
  try {
    const sign = textPlane(`🚐 ${def.name}`, { bg: TEAL, color: CREAM, border: CREAM, size: 56 });
    sign.position.set(def.x, STREET_Y + 2.62, back + 0.02);
    g.add(sign);
  } catch {
    // No canvas (tests): no sign.
  }
  return g;
}
