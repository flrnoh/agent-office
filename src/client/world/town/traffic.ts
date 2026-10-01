import * as THREE from 'three';
import { CITY_ROAD, RUNS, type Run } from '../../../shared/city';
import { toon } from '../toon';
import type { Collider } from '../types';
import { G, mergeGeometries } from './kit';

// flrnoh fork (see FORK.md): the city's own cars (see town/index.ts), up and down each run of street,
// turning round at its end, keeping back from the car ahead and stopping for anyone in the road.

/** Somewhere a city car has to stop for: someone on foot, or a car someone's driving. */
export interface Obstacle {
  x: number;
  z: number;
}

/** One of the city's cars, up and down a run of street (see RUNS). */
interface Car {
  run: Run;
  /** Which way it's going along the run (±1). */
  dir: number;
  at: number;
  speed: number;
  cruise: number;
  /** Turning round at the end of its run: how far through (0–1), or -1 driving. */
  turn: number;
}

/** A city car: its length and width (nose +x). */
const CAR_L = 4.2;
const CAR_W = 1.9;
/** How far a city car keeps back from what's ahead of it, bumper to bumper. */
const GAP = 3.5;

export interface Traffic {
  /** Each car's box, kept where it is (see setStreet). */
  traffic: Collider[];
  /** Where the street is in the frame the colliders are in (the floor you're on's). */
  setStreet(y: number): void;
  /** Drives every car `dt` on, stopping for `obstacles`. */
  move(dt: number, obstacles: Obstacle[]): void;
  /** Their headlights, brighter at night. */
  headMat: THREE.MeshBasicMaterial;
}

export function buildTraffic(group: THREE.Group, r: () => number): Traffic {
  const cars: Car[] = [];
  for (const run of RUNS) {
    const n = Math.max(1, Math.round((run.to - run.from) / 90));
    for (let k = 0; k < n * 2; k++) {
      const cruise = 8 + r() * 5;
      cars.push({ run, dir: k % 2 ? 1 : -1, at: run.from + 6 + r() * (run.to - run.from - 12), speed: cruise, cruise, turn: -1 });
    }
  }
  const body = new THREE.BoxGeometry(CAR_L, 1.05, CAR_W).translate(0, 0.9, 0);
  const cabin = new THREE.BoxGeometry(2.2, 0.7, 1.7).translate(-0.3, 1.75, 0);
  const carMesh = new THREE.InstancedMesh(mergeGeometries([body, cabin]), toon('#ffffff'), cars.length);
  const colors = ['#ef476f', '#ffd166', '#06d6a0', '#118ab2', '#f4f1de', '#3d405b', '#e07a5f', '#8ecae6'];
  cars.forEach((_, i) => carMesh.setColorAt(i, new THREE.Color(colors[Math.floor(r() * colors.length)])));
  const headMat = new THREE.MeshBasicMaterial({ color: '#fff6d0' });
  const tailMat = new THREE.MeshBasicMaterial({ color: '#ff2d2d' });
  const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.3, 1.6).translate(CAR_L / 2 + 0.02, 0.95, 0), headMat, cars.length);
  const tails = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.25, 1.6).translate(-CAR_L / 2 - 0.02, 0.95, 0), tailMat, cars.length);
  for (const m of [carMesh, heads, tails]) {
    m.frustumCulled = false;
    m.castShadow = m === carMesh;
    group.add(m);
  }
  const traffic: Collider[] = cars.map(() => ({ minX: 0, maxX: 0, minZ: 0, maxZ: 0, bottom: 0, top: 0 }));
  let street = G;
  const place = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const upAxis = new THREE.Vector3(0, 1, 0);
  const at = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  /** Where car `c` is and which way it faces: x, z, and its yaw (its nose is +x). */
  const poseOf = (c: Car): { x: number; z: number; yaw: number } => {
    const lane = CITY_ROAD / 4;
    // Driving on the right: going +x that's +z of the line, going +z it's -x.
    const side = (c.run.alongX ? 1 : -1) * c.dir;
    let across = side * lane;
    let along = c.at;
    let yaw = c.run.alongX ? (c.dir > 0 ? 0 : Math.PI) : c.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
    if (c.turn >= 0) {
      // Round in a half circle from its lane into the other one, at the end of the run.
      const a = c.turn * Math.PI;
      across = side * lane * Math.cos(a);
      along = c.at + c.dir * lane * Math.sin(a);
      // Always to the left, across the road: a quarter turn, then another.
      yaw += a;
    }
    return c.run.alongX ? { x: along, z: c.run.line + across, yaw } : { x: c.run.line + across, z: along, yaw };
  };
  const moveCars = (dt: number, obstacles: Obstacle[]) => {
    for (const c of cars) {
      if (c.turn >= 0) {
        c.turn += dt / 2.2;
        if (c.turn >= 1) {
          c.turn = -1;
          c.dir = -c.dir;
          c.speed = 2;
        }
        continue;
      }
      // What's ahead in its lane: the next car along, someone on foot, a car someone's driving.
      const me = poseOf(c);
      const fx = Math.cos(me.yaw);
      const fz = -Math.sin(me.yaw);
      let ahead = Infinity;
      for (const o of cars) {
        if (o === c || o.run !== c.run || o.turn >= 0 || o.dir !== c.dir) continue;
        const d = (o.at - c.at) * c.dir;
        if (d > 0 && d < ahead) ahead = d - CAR_L;
      }
      for (const o of obstacles) {
        const dx = o.x - me.x;
        const dz = o.z - me.z;
        const along = dx * fx + dz * fz;
        const side = Math.abs(dx * fz - dz * fx);
        if (along > 0 && along < 24 && side < CAR_W / 2 + 1.1) ahead = Math.min(ahead, along - CAR_L / 2 - 0.6);
      }
      const want = Math.max(0, Math.min(c.cruise, (ahead - GAP) * 1.1));
      c.speed += Math.max(-9 * dt, Math.min(3 * dt, want - c.speed));
      c.at += c.dir * c.speed * dt;
      // At the end of its run, round and back the other way.
      const end = c.dir > 0 ? c.run.to - CITY_ROAD / 4 - 1 : c.run.from + CITY_ROAD / 4 + 1;
      if ((end - c.at) * c.dir <= 0) {
        c.at = end;
        c.turn = 0;
      }
    }
    cars.forEach((c, i) => {
      const p = poseOf(c);
      at.set(p.x, G, p.z);
      q.setFromAxisAngle(upAxis, p.yaw);
      place.compose(at, q, one);
      carMesh.setMatrixAt(i, place);
      heads.setMatrixAt(i, place);
      tails.setMatrixAt(i, place);
      // Its box, for someone walking or driving into it (square to the street, or round while turning).
      const turning = c.turn >= 0;
      const ex = turning || c.run.alongX ? CAR_L / 2 : CAR_W / 2;
      const ez = turning || !c.run.alongX ? CAR_L / 2 : CAR_W / 2;
      Object.assign(traffic[i], { minX: p.x - ex, maxX: p.x + ex, minZ: p.z - ez, maxZ: p.z + ez, bottom: street, top: street + 1.6 });
    });
    for (const m of [carMesh, heads, tails]) m.instanceMatrix.needsUpdate = true;
  };
  moveCars(0, []);
  return { traffic, setStreet: (y) => (street = y), move: moveCars, headMat };
}
