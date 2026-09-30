import * as THREE from 'three';
import { toon } from '../../toon';
import { C, beam, box, discX, foot, led, rbox, ringX, screen, setGlow, tube, rigid, type Machine, type V3 } from './kit';

/*
 * A spin bike (flrnoh fork, see kit.ts): stabiliser feet, a steel frame, a chrome seat post and a
 * saddle, a heavy chrome flywheel up front with a lime rim, the chain guard, a red resistance knob,
 * handlebars with horns and aero bars, a bottle in its cage and a little screen on the stem. The
 * flywheel spins and the cranks turn with the cadence; the rider pedals, leaning onto the bars.
 */

const CRANK: V3 = [0, 0.24, 0.02];
const R = 0.1;
const FLY: V3 = [0, 0.3, 0.42];
const HIPS: V3 = [0, 0.6, -0.15];

export function bike(): Machine {
  const statics = new THREE.Group();
  const live = new THREE.Group();
  statics.add(foot(0.62, 0, -0.5), foot(0.56, 0, 0.56));
  // Frame, seat post and saddle.
  statics.add(beam([0, 0.07, -0.5], [0, 0.3, -0.04], 0.07));
  statics.add(beam([0, 0.2, -0.02], [0, 0.47, -0.16], 0.06));
  statics.add(tube([0, 0.46, -0.157], [0, 0.535, -0.172], 0.018, C.chrome));
  statics.add(rbox(0.1, 0.05, 0.2, C.pad, 0, 0.555, -0.16, 0.04));
  statics.add(rbox(0.17, 0.05, 0.1, C.pad, 0, 0.555, -0.22, 0.04));
  statics.add(box(0.12, 0.01, 0.2, C.lime, 0, 0.53, -0.18));
  statics.add(beam([0, 0.3, 0.02], [0, 0.63, 0.28], 0.07));
  statics.add(beam([0, 0.07, 0.56], [0, 0.3, 0.42], 0.06));
  for (const s of [-1, 1]) statics.add(beam([0, 0.6, 0.29], [s * 0.045, FLY[1], FLY[2]], 0.035));
  statics.add(tube([0, 0.62, 0.28], [0, 0.84, 0.3], 0.02, C.chrome));
  // Handlebars: a crossbar, horns forward, aero bars in the middle.
  statics.add(tube([-0.24, 0.87, 0.3], [0.24, 0.87, 0.3], 0.018, C.grip));
  for (const s of [-1, 1]) {
    statics.add(tube([s * 0.24, 0.87, 0.3], [s * 0.2, 0.9, 0.45], 0.018, C.grip));
    statics.add(tube([s * 0.06, 0.88, 0.3], [s * 0.06, 0.92, 0.46], 0.015, C.chrome));
  }
  statics.add(tube([0, 0.84, 0.3], [0, 0.95, 0.34], 0.012, C.chrome));
  // Chain guard, resistance knob, the bottle in its cage.
  statics.add(rbox(0.025, 0.16, 0.5, C.frame2, -0.07, 0.27, 0.22, 0.012));
  statics.add(box(0.027, 0.015, 0.4, C.lime, -0.07, 0.3, 0.22));
  statics.add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.04, 12), C.red).translateY(0.62).translateZ(0.23));
  statics.add(new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.13, 10), toon('#35e0d0')).translateY(0.3).translateZ(-0.14).translateX(0.05));
  statics.add(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.03, 8), C.white).translateY(0.38).translateZ(-0.14).translateX(0.05));

  // Live: the flywheel, the cranks and pedals, the screen, a light under the flywheel.
  const fly = new THREE.Group();
  fly.position.set(...FLY);
  fly.add(discX(0.2, 0.045, C.chrome, 0, 0, 0, 28));
  fly.add(ringX(0.195, 0.018, C.lime));
  for (let i = 0; i < 5; i++) fly.add(box(0.05, 0.3, 0.025, C.frame2).rotateX((i * Math.PI) / 5));
  fly.add(discX(0.04, 0.06, C.frame, 0, 0, 0, 12));
  live.add(rigid(fly));
  const crank = new THREE.Group();
  crank.position.set(...CRANK);
  crank.add(discX(0.075, 0.012, C.chrome, -0.06, 0, 0, 20));
  crank.add(discX(0.02, 0.2, C.frame, 0, 0, 0, 10));
  crank.add(box(0.02, 0.025, R, C.steel, -0.085, 0, R / 2));
  crank.add(box(0.02, 0.025, R, C.steel, 0.085, 0, -R / 2));
  live.add(rigid(crank));
  const pedals = [-1, 1].map((s) => {
    const g = new THREE.Group();
    g.add(box(0.09, 0.02, 0.06, C.rubber));
    g.add(box(0.1, 0.008, 0.025, C.lime, 0, 0.012, 0));
    g.position.x = s * 0.115;
    live.add(rigid(g));
    return g;
  });
  // The screen on the stem, tipped up toward the rider's eyes (a plane faces +z: turned round to face them).
  const head = new THREE.Group();
  head.position.set(0, 0.99, 0.35);
  head.rotation.set(0.6, Math.PI, 0);
  const scr = screen(0.12, 0.08, 96);
  scr.mesh.position.z = 0.012;
  head.add(scr.mesh, box(0.14, 0.1, 0.02, C.frame));
  live.add(head);
  const glowStrip = led(0.3, 0.008, 0.02, '#a3e635', 0, 0.04, 0.42);
  live.add(glowStrip);

  const pedal = (side: -1 | 1, theta: number): V3 => {
    const a = theta + (side < 0 ? 0 : Math.PI);
    return [side * 0.115, CRANK[1] + Math.sin(a) * R, CRANK[2] + Math.cos(a) * R];
  };
  return {
    statics,
    live,
    spot: [0, 0, -0.2],
    off: [-0.95, -0.2],
    size: { w: 0.7, d: 1.25, top: 1.0, cz: 0.02 },
    cam: { eye: [1.9, 1.9, -1.6], look: [0, 0.35, 0.1], first: 0.2 },
    update(s) {
      const theta = s.phase * Math.PI * 2;
      crank.rotation.x = -theta;
      fly.rotation.x = -theta * 3.2;
      for (const side of [-1, 1] as const) pedals[side < 0 ? 0 : 1].position.set(...pedal(side, theta));
      setGlow(glowStrip, s.running ? 0.9 + 0.2 * Math.sin(s.phase * Math.PI * 4) : s.on ? 0.7 : 0.35 + 0.1 * Math.sin(s.t * 1.1 + 2));
      scr.show(s.lines, s.running ? '#a3e635' : '#35e0d0');
    },
    pose(p, s) {
      const theta = s.phase * Math.PI * 2;
      const rock = s.running ? Math.sin(theta) * 0.04 : 0;
      p.hips(HIPS, 0.45, 0, rock);
      for (const side of [-1, 1] as const) {
        const f = pedal(side, theta);
        p.foot(side, [f[0], f[1] + 0.05, f[2]]);
        p.hand(side, [side * 0.22, 0.89, 0.34]);
      }
      p.head(-0.35);
    },
  };
}
