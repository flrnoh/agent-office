import * as THREE from 'three';
import { CARS, CAR_LENGTH, SEAT_SIDE, carOffset } from '../../../shared/coaster';
import { HEART } from '../../../shared/coaster-route';
import { poseAt, type CoasterTrack, type TrackPose } from '../../../shared/coaster-track';
import { canvasTexture } from '../texture';
import { mesh, roundedBox, toon } from '../toon';
import type { NightParts } from '../outside';
import { bulb } from '../outside';

// flrnoh fork (see FORK.md "Der Brecher"): DER BRECHER's train: four cars of two seats, hot pink with a
// yellow stripe and black seats, lap bars that swing down before it goes and up again in the station,
// bogies on the rails, and a nose with headlights on the front car. Each car is posed on the track by
// its own place along it (so they follow the loop and the vertical lift one by one); the riders sit in
// `seats`, built along +z facing ahead.

/** A car's floor, over the rails, in its frame (the heartline at 0). */
const FLOOR_Y = -HEART + 0.35;
/** Where a rider's feet go in their seat: the hips sit SEAT_PAN over them. */
export const SEAT_PAN = 0.45;
const SEAT_Z = -0.12;

export interface TrainView {
  group: THREE.Group;
  /** Where each seat's rider goes (their feet, facing ahead): seat 2·car (left) and 2·car + 1 (right). */
  seats: THREE.Object3D[];
  /** Puts the train with its middle `s` along `track`, the lap bars `bars` closed (0 open, 1 down). */
  place(track: CoasterTrack, s: number, bars: number): void;
}

function sideText(): THREE.CanvasTexture {
  return canvasTexture(512, 96, (g) => {
    g.clearRect(0, 0, 512, 96);
    g.font = '900 64px Nunito, ui-rounded, system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 10;
    g.strokeStyle = '#2b2d42';
    g.strokeText('DER BRECHER', 256, 50);
    g.fillStyle = '#ffd166';
    g.fillText('DER BRECHER', 256, 50);
  });
}

export function buildTrain(night: NightParts): TrainView {
  const group = new THREE.Group();
  group.name = 'coaster-train';
  const body = toon('#f72585');
  const stripe = toon('#ffd166');
  const seat = toon('#2b2d42');
  const dark = toon('#3d405b');
  const metal = toon('#c9d1d9');
  const lapMat = toon('#ffd166');
  const lamp = bulb(night, '#fff3b0', 0.6);
  const word = new THREE.MeshBasicMaterial({ map: sideText(), transparent: true, depthWrite: false });
  const seats: THREE.Object3D[] = [];
  const bars: THREE.Object3D[] = [];
  const cars: THREE.Group[] = [];
  const W = 1.46;
  for (let c = 0; c < CARS; c++) {
    const car = new THREE.Group();
    const L = CAR_LENGTH;
    // The tub: a floor, sides up to the hips, a high back behind the seats, and a rounded front.
    car.add(mesh(roundedBox(W, 0.16, L, 0.1), body, 0, FLOOR_Y - 0.08, 0));
    for (const x of [-1, 1]) {
      car.add(mesh(new THREE.BoxGeometry(0.1, 0.55, L - 0.2), body, x * (W / 2 - 0.05), FLOOR_Y + 0.27, 0.02));
      car.add(mesh(new THREE.BoxGeometry(0.11, 0.09, L - 0.24), stripe, x * (W / 2 - 0.045), FLOOR_Y + 0.42, 0.02, false));
    }
    car.add(mesh(roundedBox(W, 0.62, 0.24, 0.08), body, 0, FLOOR_Y + 0.31, L / 2 - 0.2));
    car.add(mesh(new THREE.BoxGeometry(W - 0.1, 0.08, 0.26), stripe, 0, FLOOR_Y + 0.6, L / 2 - 0.2, false));
    car.add(mesh(roundedBox(W, 0.95, 0.18, 0.06), body, 0, FLOOR_Y + 0.5, -L / 2 + 0.12));
    // Two seats, each a pan and a high back with a headrest.
    for (const side of [-1, 1]) {
      const x = side * SEAT_SIDE;
      car.add(mesh(roundedBox(0.5, 0.12, 0.5, 0.05), seat, x, FLOOR_Y + SEAT_PAN - 0.06, SEAT_Z));
      const back = mesh(roundedBox(0.5, 0.85, 0.12, 0.05), seat, x, FLOOR_Y + SEAT_PAN + 0.38, SEAT_Z - 0.32);
      back.rotation.x = -0.14;
      car.add(back);
      const anchor = new THREE.Object3D();
      anchor.position.set(x, FLOOR_Y, SEAT_Z + 0.06);
      car.add(anchor);
      seats.push(anchor);
      // The lap bar, swinging about its hinge on the car's front.
      const hinge = new THREE.Group();
      hinge.position.set(x, FLOOR_Y + 0.62, SEAT_Z + 0.55);
      const bar = new THREE.Group();
      bar.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.46, 8).rotateZ(Math.PI / 2), lapMat, 0, -0.08, -0.32, false));
      for (const dx of [-0.21, 0.21]) bar.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.36, 8).rotateX(Math.PI / 2), lapMat, dx, -0.04, -0.15, false));
      hinge.add(bar);
      car.add(hinge);
      bars.push(hinge);
    }
    // The bogies on the rails, and a coupling to the car behind.
    for (const z of [-L / 2 + 0.35, L / 2 - 0.35]) {
      car.add(mesh(new THREE.BoxGeometry(W - 0.2, 0.2, 0.42), dark, 0, -HEART + 0.12, z, false));
      for (const x of [-0.55, 0.55]) car.add(mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.1, 10).rotateZ(Math.PI / 2), metal, x, -HEART + 0.11, z, false));
    }
    if (c < CARS - 1) car.add(mesh(new THREE.BoxGeometry(0.1, 0.08, 0.5), metal, 0, -HEART + 0.12, -L / 2 - 0.12, false));
    // The front car's nose: a wedge with its headlights, and the name down both sides.
    if (c === 0) {
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.75, 4, 1).rotateX(Math.PI / 2).rotateZ(Math.PI / 4).scale(1, 0.55, 1), body);
      nose.position.set(0, FLOOR_Y + 0.25, L / 2 + 0.3);
      car.add(nose);
      for (const x of [-0.42, 0.42]) car.add(mesh(new THREE.SphereGeometry(0.09, 10, 8), lamp, x, FLOOR_Y + 0.33, L / 2 + 0.12, false));
      for (const side of [-1, 1]) {
        const p = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.34), word);
        p.position.set(side * (W / 2 + 0.01), FLOOR_Y + 0.22, 0);
        p.rotation.y = side * (Math.PI / 2);
        car.add(p);
      }
    }
    car.traverse((o) => (o.raycast = () => {}));
    group.add(car);
    cars.push(car);
  }

  const pose: TrackPose = { x: 0, y: 0, z: 0, t: [0, 0, 0], n: [0, 0, 0], b: [0, 0, 0] };
  const m = new THREE.Matrix4();
  return {
    group,
    seats,
    place(track, s, closed) {
      cars.forEach((car, c) => {
        poseAt(track, s + carOffset(c), pose);
        const t = pose.t;
        const u = pose.n;
        m.set(u[1] * t[2] - u[2] * t[1], u[0], t[0], pose.x, u[2] * t[0] - u[0] * t[2], u[1], t[1], pose.y, u[0] * t[1] - u[1] * t[0], u[2], t[2], pose.z, 0, 0, 0, 1);
        car.matrixAutoUpdate = false;
        car.matrix.copy(m);
        car.matrixWorldNeedsUpdate = true;
      });
      const a = 1.35 * (1 - closed);
      for (const b of bars) b.rotation.x = a;
    },
  };
}
