import * as THREE from 'three';
import { CITY_ROAD } from '../../../shared/city';
import { ZEBRA_AT } from '../../../shared/sidewalks';
import { LIT, STOP_AT, lampAt, walkAt, type Axis, type LitCrossing } from '../../../shared/traffic-lights';
import { toon } from '../toon';
import { G, mergeGeometries } from './kit';

// flrnoh fork (see FORK.md "Traffic lights and the city bus"): the traffic lights at the busier
// crossings (shared/traffic-lights.ts says which, and what each shows when). At each road coming in:
// a pole on the right before the stop line with red, amber and green facing the cars, a white stop
// line across their lane, and at both ends of its zebra a light with the red and the green man.
// They're a handful of instanced meshes; each frame only the lamps' colors change, from the office's
// clock, and a halo round each lit lamp shows at night.

const H = CITY_ROAD / 2;
const LAMP_R = 0.13;
type V = [number, number];

/** One lamp: which light, which road it's for, and whether it's a car's (0 red, 1 amber, 2 green) or a walker's (3 red man, 4 green man). */
interface LampRef {
  l: LitCrossing;
  axis: Axis;
  kind: 0 | 1 | 2 | 3 | 4;
  lit: boolean;
}

const ON = ['#ff2b1c', '#ffb21a', '#2dff79', '#ff3424', '#3dff8a'].map((c) => new THREE.Color(c));
const OFF = ['#3b0f0b', '#3d2b08', '#0b2e17', '#2a0c09', '#0a2a14'].map((c) => new THREE.Color(c));
const BLACK = new THREE.Color(0, 0, 0);

/** A little man standing (red) or walking (green), white on black, for the walkers' lamps. */
function manTexture(walking: boolean): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#fff';
  g.strokeStyle = '#fff';
  g.lineCap = 'round';
  g.lineWidth = 7;
  g.beginPath();
  g.arc(32, 12, 6.5, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  if (walking) {
    g.moveTo(32, 22); g.lineTo(30, 40); // body
    g.moveTo(30, 40); g.lineTo(20, 58); g.moveTo(30, 40); g.lineTo(42, 57); // legs
    g.moveTo(31, 26); g.lineTo(19, 36); g.moveTo(31, 26); g.lineTo(44, 34); // arms
  } else {
    g.moveTo(32, 22); g.lineTo(32, 42);
    g.moveTo(28, 42); g.lineTo(27, 59); g.moveTo(36, 42); g.lineTo(37, 59);
    g.moveTo(25, 25); g.lineTo(23, 42); g.moveTo(39, 25); g.lineTo(41, 42);
  }
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export interface TrafficLights {
  group: THREE.Group;
  /** Shows what each light shows at `t` (seconds on the office's clock); `dark` (0–1) brings up the halos. */
  update(t: number, dark: number): void;
}

export function buildTrafficLights(): TrafficLights {
  const group = new THREE.Group();
  group.name = 'traffic-lights';
  const poles: THREE.Matrix4[] = [];
  const heads: THREE.Matrix4[] = [];
  const walkHeads: THREE.Matrix4[] = [];
  const lines: THREE.Matrix4[] = [];
  const carLamps: { m: THREE.Matrix4; ref: LampRef }[] = [];
  const manLamps: { m: THREE.Matrix4; ref: LampRef; walking: boolean }[] = [];
  const m4 = (x: number, y: number, z: number, yaw: number, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(sx, sy, sz));
  for (const l of LIT) {
    const c = l.c;
    const arms: [V, boolean][] = [
      [[1, 0], c.east],
      [[-1, 0], c.west],
      [[0, 1], c.south],
      [[0, -1], c.north],
    ];
    for (const [a, has] of arms) {
      if (!has) continue;
      const axis: Axis = a[0] !== 0 ? 'x' : 'z';
      // Coming in along -a: its right hand is right(-a) = (a.z, -a.x).
      const r: V = [a[1], -a[0]];
      // Faces the cars coming in: its +z along a.
      const yaw = Math.atan2(a[0], a[1]);
      const px = c.x + a[0] * (STOP_AT + 0.5) + r[0] * (H + 0.55);
      const pz = c.z + a[1] * (STOP_AT + 0.5) + r[1] * (H + 0.55);
      poles.push(m4(px, G, pz, yaw));
      heads.push(m4(px, G + 2.95, pz, yaw));
      for (let k = 0; k < 3; k++) {
        const y = G + 3.32 - k * 0.37;
        carLamps.push({ m: m4(px + a[0] * 0.17, y, pz + a[1] * 0.17, yaw), ref: { l, axis, kind: k as 0 | 1 | 2, lit: false } });
      }
      // The stop line across the incoming lane.
      const lx = c.x + a[0] * (STOP_AT - 0.2) + r[0] * (H / 2);
      const lz = c.z + a[1] * (STOP_AT - 0.2) + r[1] * (H / 2);
      lines.push(m4(lx, G + 0.006, lz, yaw, H - 0.2, 1, 1));
      // The walkers' lights at both ends of this arm's zebra (none across the office's own street).
      if (c.b === 0 && axis === 'x') continue;
      for (const side of [-1, 1]) {
        const wx = c.x + a[0] * (ZEBRA_AT + 1.15) + r[0] * side * (H + 0.45);
        const wz = c.z + a[1] * (ZEBRA_AT + 1.15) + r[1] * side * (H + 0.45);
        // Faces across the road, to whoever waits on the other side.
        const wyaw = Math.atan2(-r[0] * side, -r[1] * side);
        walkHeads.push(m4(wx, G, wz, wyaw));
        for (const walking of [false, true]) {
          const y = G + (walking ? 1.98 : 2.36);
          manLamps.push({ m: m4(wx - r[0] * side * 0.12, y, wz - r[1] * side * 0.12, wyaw), ref: { l, axis, kind: walking ? 4 : 3, lit: false }, walking });
        }
      }
    }
  }
  const put = (geo: THREE.BufferGeometry, mat: THREE.Material, list: THREE.Matrix4[]) => {
    const m = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
    m.count = list.length;
    list.forEach((x, i) => m.setMatrixAt(i, x));
    m.frustumCulled = false;
    group.add(m);
    return m;
  };
  const metal = toon('#3a3f47');
  put(mergeGeometries([new THREE.CylinderGeometry(0.07, 0.08, 3.5, 8).translate(0, 1.75, 0), new THREE.BoxGeometry(0.34, 0.1, 0.34).translate(0, 0.05, 0)]), metal, poles);
  put(mergeGeometries([new THREE.BoxGeometry(0.42, 1.18, 0.3), new THREE.BoxGeometry(0.62, 1.36, 0.04).translate(0, 0, -0.17)].map((g) => g.translate(0, 0.37, 0))), toon('#22252b'), heads);
  put(mergeGeometries([new THREE.CylinderGeometry(0.055, 0.06, 2.6, 8).translate(0, 1.3, 0), new THREE.BoxGeometry(0.34, 0.8, 0.22).translate(0, 2.17, 0)]), metal, walkHeads);
  put(new THREE.BoxGeometry(1, 0.012, 0.32), new THREE.MeshBasicMaterial({ color: '#eeeeee' }), lines);
  // The lamps: discs for the cars, the little men for the walkers, and a halo round each that's on.
  const disc = new THREE.CircleGeometry(LAMP_R, 16);
  const carMesh = put(disc, new THREE.MeshBasicMaterial({ color: '#ffffff' }), carLamps.map((c) => c.m));
  const square = new THREE.PlaneGeometry(0.26, 0.3);
  const manStand = put(square, new THREE.MeshBasicMaterial({ map: manTexture(false) }), manLamps.filter((m) => !m.walking).map((m) => m.m));
  const manWalk = put(square, new THREE.MeshBasicMaterial({ map: manTexture(true) }), manLamps.filter((m) => m.walking).map((m) => m.m));
  const haloMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
  const all = [...carLamps, ...manLamps];
  const halo = put(new THREE.SphereGeometry(0.42, 10, 8), haloMat, all.map((c) => c.m));
  const stands = manLamps.filter((m) => !m.walking);
  const walks = manLamps.filter((m) => m.walking);
  const paint = (mesh: THREE.InstancedMesh, list: { ref: LampRef }[], first: boolean) => {
    let changed = first;
    list.forEach((x, i) => {
      const ref = x.ref;
      let on: boolean;
      if (ref.kind <= 2) {
        const lamp = lampAt(ref.l, ref.axis, nowT);
        on = ref.kind === 0 ? lamp === 'red' || lamp === 'redamber' : ref.kind === 1 ? lamp === 'amber' || lamp === 'redamber' : lamp === 'green';
      } else {
        const walk = walkAt(ref.l, ref.axis, nowT);
        on = ref.kind === 4 ? walk : !walk;
      }
      if (on === ref.lit && !first) return;
      ref.lit = on;
      changed = true;
      mesh.setColorAt(i, on ? ON[ref.kind] : OFF[ref.kind]);
    });
    if (changed && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    return changed;
  };
  let nowT = 0;
  let first = true;
  return {
    group,
    update(t, dark) {
      nowT = t;
      const a = paint(carMesh, carLamps, first);
      const b = paint(manStand, stands, first);
      const c = paint(manWalk, walks, first);
      if (a || b || c) {
        all.forEach((x, i) => halo.setColorAt(i, x.ref.lit ? ON[x.ref.kind] : BLACK));
        if (halo.instanceColor) halo.instanceColor.needsUpdate = true;
      }
      first = false;
      haloMat.opacity = 0.06 + 0.4 * dark;
      halo.visible = dark > 0.05 || haloMat.opacity > 0;
    },
  };
}
