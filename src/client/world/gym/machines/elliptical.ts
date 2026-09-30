import * as THREE from 'three';
import { C, beam, box, cable, discX, foot, led, rbox, ringX, screen, setGlow, tube, rigid, type Machine, type V3 } from './kit';

/*
 * A cross-trainer (flrnoh fork, see kit.ts): a long base on its feet, the flywheel's rounded shroud
 * up front with the wheel turning in its sides, a mast to a console with a screen and fixed grips,
 * two long pedal links riding on cranks, and two swinging handle poles. The pedals trace their
 * ellipses and the poles swing against them; whoever's on it strides along, hands on the poles.
 */

const CRANK: V3 = [0, 0.32, 0.64];
const CR = 0.08;
const PED: V3 = [0, 0.2, -0.02];
const PIVOT_Y = 0.74;
const PIVOT_Z = 0.4;

export function elliptical(): Machine {
  const statics = new THREE.Group();
  const live = new THREE.Group();
  statics.add(foot(0.62, 0, -0.62), foot(0.62, 0, 0.8));
  statics.add(box(0.12, 0.07, 1.46, C.frame, 0, 0.08, 0.1));
  // The flywheel shroud and the mast.
  statics.add(rbox(0.3, 0.5, 0.4, C.frame2, 0, 0.3, 0.66, 0.14));
  statics.add(beam([0, 0.5, 0.62], [0, 1.1, 0.5], 0.07));
  // Console with fixed pulse grips either side.
  const head = new THREE.Group();
  head.position.set(0, 1.14, 0.5);
  head.rotation.x = -0.9;
  head.add(rbox(0.46, 0.06, 0.24, C.frame, 0, 0, 0, 0.06));
  head.add(box(0.48, 0.015, 0.015, C.lime, 0, 0.02, -0.12));
  statics.add(head);
  for (const s of [-1, 1]) {
    statics.add(tube([s * 0.1, 1.02, 0.52], [s * 0.18, 0.98, 0.34], 0.018, C.grip));
    statics.add(tube([s * 0.17, 0.985, 0.38], [s * 0.19, 0.975, 0.3], 0.022, C.chrome));
    // The handle poles' pivots, on stubs off the mast.
    statics.add(tube([0, 0.72, 0.52], [s * 0.3, PIVOT_Y, PIVOT_Z], 0.022, C.frame));
  }
  // The rear roller track the pedal links ride on.
  statics.add(box(0.44, 0.04, 0.36, C.frame, 0, 0.1, -0.35));

  // Live: the wheel in the shroud's sides, the cranks, the pedal links and pedals, the poles, the screen.
  const wheels = [-1, 1].map((s) => {
    const g = new THREE.Group();
    g.position.set(s * 0.155, 0.3, 0.66);
    g.add(discX(0.17, 0.01, C.chrome, 0, 0, 0, 24));
    g.add(ringX(0.165, 0.012, C.lime));
    for (let i = 0; i < 3; i++) g.add(box(0.012, 0.3, 0.03, C.frame2).rotateX((i * Math.PI) / 3));
    live.add(rigid(g));
    return g;
  });
  const links = [-1, 1].map(() => {
    const c = cable(C.frame, 0.022);
    live.add(c.mesh);
    return c;
  });
  const pedals = [-1, 1].map((s) => {
    const g = new THREE.Group();
    g.add(rbox(0.13, 0.03, 0.3, C.frame2, 0, 0, 0, 0.04));
    g.add(rbox(0.12, 0.012, 0.26, C.rubber, 0, 0.02, 0, 0.04));
    g.add(box(0.012, 0.03, 0.2, C.lime, s * 0.068, 0, 0));
    live.add(rigid(g));
    return g;
  });
  const poles = [-1, 1].map((s) => {
    const g = new THREE.Group();
    g.position.set(s * 0.3, PIVOT_Y, PIVOT_Z);
    g.add(tube([0, -0.42, 0.04], [0, 0.36, -0.06], 0.022, C.frame));
    g.add(tube([0, 0.22, -0.04], [0, 0.44, -0.08], 0.027, C.grip));
    g.add(discX(0.035, 0.07, C.chrome, 0, 0, 0, 12));
    live.add(rigid(g));
    return g;
  });
  const lowerLinks = [-1, 1].map(() => {
    const c = cable(C.steel, 0.014);
    live.add(c.mesh);
    return c;
  });
  const scr = screen(0.22, 0.12, 128);
  scr.mesh.rotation.set(-Math.PI / 2, 0, Math.PI);
  scr.mesh.position.y = 0.035;
  const liveHead = new THREE.Group();
  liveHead.position.copy(head.position);
  liveHead.rotation.copy(head.rotation);
  liveHead.add(scr.mesh);
  live.add(liveHead);
  const glowStrip = led(0.012, 0.02, 1.22, '#a3e635', 0.065, 0.09, 0.1);
  const glowStrip2 = led(0.012, 0.02, 1.22, '#a3e635', -0.065, 0.09, 0.1);
  live.add(glowStrip, glowStrip2);

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const pedalAt = (side: -1 | 1, theta: number): V3 => {
    const t = theta + (side < 0 ? 0 : Math.PI);
    return [side * 0.12, PED[1] + Math.sin(t) * 0.06, PED[2] + Math.cos(t) * 0.17];
  };
  const swing = (side: -1 | 1, theta: number) => Math.sin(theta + (side < 0 ? 0 : Math.PI)) * 0.3;
  const gripAt = (side: -1 | 1, theta: number): V3 => {
    const al = swing(side, theta);
    // The grip's middle, 0.33 up the pole from its pivot, swung about the pivot's x axis.
    const y = 0.33 * Math.cos(al) - 0.06 * Math.sin(al);
    const z = -0.33 * Math.sin(al) - 0.06 * Math.cos(al);
    return [side * 0.3, PIVOT_Y + y, PIVOT_Z + z];
  };
  return {
    statics,
    live,
    spot: [0, 0.2, -0.02],
    off: [-0.9, -0.2],
    size: { w: 0.8, d: 1.7, top: 1.2, cz: 0.08 },
    cam: { eye: [1.7, 2.2, -2.0], look: [0, 0.5, 0.2], first: 0.12 },
    update(s) {
      const theta = s.phase * Math.PI * 2;
      for (const w of wheels) w.rotation.x = -theta;
      for (const side of [-1, 1] as const) {
        const i = side < 0 ? 0 : 1;
        const pd = pedalAt(side, theta);
        pedals[i].position.set(...pd);
        pedals[i].rotation.x = Math.cos(theta + (side < 0 ? 0 : Math.PI)) * 0.12;
        const t = theta + (side < 0 ? 0 : Math.PI);
        a.set(side * 0.12, CRANK[1] + Math.sin(t) * CR, CRANK[2] + Math.cos(t) * CR);
        b.set(pd[0], pd[1] - 0.02, pd[2] + 0.1);
        links[i].set(a, b);
        poles[i].rotation.x = -swing(side, theta);
        // The pole's foot to the pedal link.
        const al = swing(side, theta);
        a.set(side * 0.3, PIVOT_Y - 0.42 * Math.cos(al) + 0.04 * Math.sin(al), PIVOT_Z + 0.42 * Math.sin(al) + 0.04 * Math.cos(al));
        b.set(side * 0.13, pd[1] + 0.02, pd[2] + 0.12);
        lowerLinks[i].set(a, b);
      }
      const k = s.running ? 0.9 + 0.2 * Math.sin(theta * 2) : s.on ? 0.7 : 0.35 + 0.1 * Math.sin(s.t * 1.2 + 3);
      setGlow(glowStrip, k);
      setGlow(glowStrip2, k);
      scr.show(s.lines, s.running ? '#a3e635' : '#35e0d0');
    },
    pose(p, s) {
      const theta = s.phase * Math.PI * 2;
      const bob = s.running ? Math.abs(Math.sin(theta)) * 0.02 : 0;
      p.hips([0, PED[1] + 0.44 + bob, -0.06], s.running ? 0.08 : 0.03, 0, s.running ? Math.sin(theta) * 0.04 : 0);
      for (const side of [-1, 1] as const) {
        const f = pedalAt(side, theta);
        p.foot(side, [f[0], f[1] + 0.07, f[2]]);
        p.hand(side, gripAt(side, theta));
      }
      p.head(0);
    },
  };
}
