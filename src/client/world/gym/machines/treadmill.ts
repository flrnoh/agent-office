import * as THREE from 'three';
import { RUN_SPEED } from '../../../../shared/gym-motion';
import { canvasTexture } from '../parts';
import { toon } from '../../toon';
import { C, beam, box, led, rbox, screen, setGlow, tube, type Machine } from './kit';

/*
 * A treadmill (flrnoh fork, see kit.ts): a deck on rubber feet with a slatted belt between two
 * foot rails, the motor hood up front, uprights to a console tilted at the runner with a glowing
 * screen, buttons and a red safety key on its cord, side handrails with chrome pulse grips, and a
 * lime light strip down each side. The belt runs at the session's speed; whoever's on it walks or
 * runs with it, arms pumping.
 */

const DECK = 0.2;
const BELT_LEN = 1.62;

function beltTexture(): THREE.CanvasTexture {
  const t = canvasTexture(32, 64, (g) => {
    g.fillStyle = '#1b1f23';
    g.fillRect(0, 0, 32, 64);
    g.fillStyle = '#2a3036';
    for (let y = 0; y < 64; y += 8) g.fillRect(0, y, 32, 3);
    g.fillStyle = 'rgba(163,230,53,0.35)';
    g.fillRect(0, 0, 32, 1);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 7);
  return t;
}

export function treadmill(): Machine {
  const statics = new THREE.Group();
  const live = new THREE.Group();

  // The deck: side rails with rubber foot strips, end caps, rollers, the motor hood.
  for (const s of [-1, 1]) {
    statics.add(box(0.1, 0.13, 1.84, C.frame, s * 0.41, 0.1, -0.1));
    statics.add(box(0.12, 0.025, 1.7, C.rubber, s * 0.41, DECK - 0.005, -0.14));
    statics.add(box(0.07, 0.05, 0.14, C.rubber, s * 0.4, 0.025, -0.95));
    statics.add(box(0.07, 0.05, 0.14, C.rubber, s * 0.4, 0.025, 0.7));
  }
  statics.add(box(0.72, 0.1, 1.72, C.frame2, 0, 0.1, -0.12));
  statics.add(box(0.94, 0.12, 0.08, C.frame, 0, 0.1, -1.03));
  statics.add(box(0.2, 0.02, 0.01, C.lime, 0, 0.12, -1.075));
  for (const z of [-0.98, 0.72]) statics.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.74, 14).rotateZ(Math.PI / 2), C.steel).translateZ(z).translateY(0.13));
  const hood = rbox(0.94, 0.26, 0.36, C.frame2, 0, 0.14, 0.92, 0.1);
  statics.add(hood);
  statics.add(box(0.8, 0.012, 0.025, C.lime, 0, 0.275, 0.8));
  // Uprights up to the console, and the console tilted back toward the runner.
  for (const s of [-1, 1]) statics.add(beam([s * 0.4, 0.2, 0.98], [s * 0.37, 1.16, 0.8], 0.07));
  const panel = new THREE.Group();
  panel.position.set(0, 1.2, 0.8);
  panel.rotation.x = -0.95;
  panel.add(rbox(0.92, 0.07, 0.36, C.frame, 0, 0, 0, 0.08));
  panel.add(box(0.94, 0.02, 0.02, C.lime, 0, 0.02, -0.18));
  // Buttons either side of the screen: speed, incline, start and stop.
  const btn = [toon('#35e0d0'), toon('#ffd36b'), C.lime, C.red];
  for (let i = 0; i < 4; i++) {
    const x = (i < 2 ? -0.34 : 0.26) + (i % 2) * 0.08;
    panel.add(box(0.05, 0.02, 0.05, btn[i], x, 0.045, 0.02));
    panel.add(box(0.05, 0.02, 0.05, btn[3 - i], x, 0.045, -0.08));
  }
  // The safety key: a red tab clipped on, its cord coiled down toward the runner.
  panel.add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 12), C.red).translateY(0.045).translateZ(-0.14).translateX(0.18));
  panel.add(tube([0.18, 0.04, -0.15], [0.2, -0.28, -0.3], 0.005, C.red, 5));
  // A tablet ledge and two cup holders.
  panel.add(box(0.5, 0.03, 0.05, C.frame2, 0, 0.06, 0.16));
  for (const s of [-1, 1]) panel.add(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.06, 10), C.frame2).translateX(s * 0.4).translateY(0.05).translateZ(0.1));
  statics.add(panel);
  // Handrails along both sides with chrome pulse grips, and a grab bar under the console.
  for (const s of [-1, 1]) {
    statics.add(tube([s * 0.39, 1.05, 0.75], [s * 0.46, 1.0, 0.62], 0.025, C.frame));
    statics.add(tube([s * 0.46, 1.0, 0.62], [s * 0.46, 0.98, 0.12], 0.025, C.grip));
    statics.add(tube([s * 0.46, 0.99, 0.5], [s * 0.46, 0.985, 0.32], 0.03, C.chrome));
  }
  statics.add(tube([-0.32, 0.96, 0.72], [0.32, 0.96, 0.72], 0.022, C.grip));

  // Live: the belt, the screen and the light strips.
  const tex = beltTexture();
  const belt = new THREE.Mesh(new THREE.PlaneGeometry(0.7, BELT_LEN), new THREE.MeshToonMaterial({ map: tex, gradientMap: (C.frame as THREE.MeshToonMaterial).gradientMap }));
  belt.rotation.x = -Math.PI / 2;
  belt.position.set(0, DECK - 0.012, -0.14);
  belt.receiveShadow = true;
  live.add(belt);
  const scr = screen(0.34, 0.16);
  scr.mesh.rotation.set(-Math.PI / 2, 0, Math.PI); // face up, its text the right way up for the runner
  scr.mesh.position.set(0, 0.041, -0.02);
  const livePanel = new THREE.Group();
  livePanel.position.copy(panel.position);
  livePanel.rotation.copy(panel.rotation);
  livePanel.add(scr.mesh);
  live.add(livePanel);
  const strips = [-1, 1].map((s) => led(0.006, 0.025, 1.5, '#a3e635', s * 0.462, 0.11, -0.12));
  live.add(...strips);

  let beltV = 0;
  return {
    statics,
    live,
    spot: [0, DECK, -0.05],
    off: [0, -1.75],
    size: { w: 1.02, d: 2.1, top: 1.3, cz: -0.08 },
    cam: { eye: [1.5, 2.3, -2.4], look: [0, 0.55, 0.2], first: 0.12 },
    update(s, dt) {
      beltV = s.speed;
      tex.offset.y -= ((beltV * dt) / BELT_LEN) * tex.repeat.y;
      const breathe = 0.45 + 0.15 * Math.sin(s.t * 1.3);
      const pump = s.running ? 0.85 + 0.25 * Math.abs(Math.sin(s.phase * Math.PI * 2)) : s.on ? 0.8 : breathe;
      for (const m of strips) setGlow(m, pump);
      scr.show(s.lines, s.running ? '#a3e635' : '#35e0d0');
    },
    pose(p, s) {
      const run = s.running && s.speed >= RUN_SPEED;
      const moving = s.running && s.speed > 0.05;
      const ph = s.phase;
      const bounce = moving ? (run ? 0.035 : 0.012) * (0.5 - 0.5 * Math.cos(ph * Math.PI * 4)) : 0;
      const z = -0.05;
      p.hips([0, DECK + 0.4 + bounce, z], moving ? (run ? 0.14 : 0.05) : 0);
      for (const side of [-1, 1] as const) {
        if (!moving) {
          p.foot(side, [side * 0.13, DECK + 0.05, z]);
          // Hands on the handrails, waiting to go.
          p.hand(side, [side * 0.46, 1.0, 0.24]);
          continue;
        }
        // Each foot: planted and carried back by the belt, then swung forward through the air.
        const u = (((ph + (side < 0 ? 0 : 0.5)) % 1) + 1) % 1;
        const stance = run ? 0.42 : 0.6;
        const stride = run ? 0.3 : 0.22;
        let fz: number;
        let fy = DECK + 0.05;
        if (u < stance) fz = z + stride - (u / stance) * stride * 2;
        else {
          const w = (u - stance) / (1 - stance);
          fz = z - stride + (0.5 - 0.5 * Math.cos(w * Math.PI)) * stride * 2;
          fy += Math.sin(w * Math.PI) * (run ? 0.2 : 0.08);
        }
        p.foot(side, [side * 0.12, fy, fz]);
        // Arms pump against the legs, bent at the elbow (a hand's nearer the shoulder than the arm is long).
        const swing = Math.sin((ph + (side < 0 ? 0.5 : 0)) * Math.PI * 2);
        const hy = DECK + 0.4 + 0.48 + (run ? -0.18 : -0.3) + bounce + Math.max(0, swing) * 0.08;
        p.hand(side, [side * (run ? 0.3 : 0.35), hy, z + swing * (run ? 0.24 : 0.16) + 0.05]);
      }
      p.head(moving ? -0.08 : 0.05);
    },
  };
}
