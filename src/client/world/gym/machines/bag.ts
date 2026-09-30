import * as THREE from 'three';
import { mergeByColor, mesh, toon } from '../../toon';
import { C, beam, box, foot, plate, tube, rigid, type Machine, type V3 } from './kit';
import type { Bones } from '../../character';

/*
 * The heavy bag (flrnoh fork, see kit.ts): a stand with a long arm, a chain and swivel down to four
 * straps, a red leather bag with a lime band, a speed-bag platform off the post with its little bag,
 * and plates on the stand's foot to hold it down. The boxer squares up in red gloves and throws a
 * jab, a jab and a cross for every combo; the bag swings and twists on its chain with each one that
 * lands, and settles again.
 */

const PIVOT: V3 = [0, 2.22, 0.58];
const BAG_TOP = 1.62;
const BAG_BOTTOM = 0.62;
const R = 0.21;
/** A combo: which hand (their left +1, right -1), when in the rep it lands, and how hard. */
const COMBO: readonly { side: -1 | 1; at: number; power: number }[] = [
  { side: 1, at: 0.18, power: 0.55 },
  { side: 1, at: 0.42, power: 0.6 },
  { side: -1, at: 0.7, power: 1 },
];

function leather(): THREE.Group {
  const g = new THREE.Group();
  const len = BAG_TOP - BAG_BOTTOM;
  g.add(mesh(new THREE.CylinderGeometry(R, R * 0.96, len, 20), toon('#b3262b'), 0, -(PIVOT[1] - BAG_TOP) - len / 2, 0));
  for (const y of [BAG_TOP, BAG_BOTTOM]) g.add(mesh(new THREE.CylinderGeometry(R + 0.01, R + 0.01, 0.06, 20), C.rubber, 0, y - PIVOT[1], 0));
  g.add(mesh(new THREE.CylinderGeometry(R + 0.006, R + 0.006, 0.12, 20), C.lime, 0, 1.18 - PIVOT[1], 0));
  g.add(mesh(new THREE.CylinderGeometry(R + 0.004, R + 0.004, 0.02, 20), C.white, 0, 1.28 - PIVOT[1], 0));
  // Straps up to the swivel, and the chain up to the arm.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    g.add(tube([Math.cos(a) * R * 0.85, BAG_TOP - PIVOT[1], Math.sin(a) * R * 0.85], [0, BAG_TOP + 0.26 - PIVOT[1], 0], 0.008, C.rubber, 5));
  }
  g.add(mesh(new THREE.SphereGeometry(0.03, 8, 6), C.chrome, 0, BAG_TOP + 0.27 - PIVOT[1], 0));
  for (let i = 0; i < 5; i++) g.add(mesh(new THREE.TorusGeometry(0.022, 0.006, 5, 10).rotateY((i % 2) * (Math.PI / 2)), C.steel, 0, -0.03 - i * 0.05, 0));
  return mergeByColor(g);
}

export function bag(): Machine {
  const statics = new THREE.Group();
  const live = new THREE.Group();
  // The stand: a post behind the bag, the arm over it, a braced foot weighted with plates.
  const PZ = 1.3;
  statics.add(beam([0, 0, PZ], [0, 2.32, PZ], 0.1));
  statics.add(beam([0, 2.26, PZ + 0.05], [0, 2.26, PIVOT[2] - 0.08], 0.08));
  statics.add(beam([0, 1.8, PZ], [0, 2.22, PZ - 0.35], 0.05));
  statics.add(box(0.9, 0.06, 0.12, C.frame, 0, 0.03, PZ), box(0.12, 0.06, 0.9, C.frame, 0, 0.03, PZ + 0.1));
  for (const s of [-1, 1]) {
    statics.add(tube([s * 0.05, 0.2, PZ + 0.35], [s * 0.3, 0.2, PZ + 0.35], 0.022, C.chrome));
    const pl = plate(20, false);
    pl.position.set(s * 0.15, 0.2, PZ + 0.35);
    statics.add(pl);
  }
  statics.add(box(0.12, 0.08, 0.02, C.lime, 0, 2.26, PIVOT[2] - 0.12));
  // The speed-bag platform off the post, to the side.
  statics.add(beam([0.04, 1.85, PZ], [0.6, 1.85, PZ - 0.2], 0.05));
  const platform = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 24), C.wood, 0.62, 1.86, PZ - 0.35);
  statics.add(platform);
  statics.add(mesh(new THREE.CylinderGeometry(0.305, 0.305, 0.01, 24), C.lime, 0.62, 1.84, PZ - 0.35));
  statics.add(foot(0.2, 0.62, PZ - 0.35));

  // Live: the heavy bag on its pivot, and the speed bag.
  const swing = new THREE.Group();
  swing.position.set(...PIVOT);
  swing.add(leather());
  live.add(swing);
  const speed = new THREE.Group();
  speed.position.set(0.62, 1.82, PZ - 0.35);
  const sb = mesh(new THREE.SphereGeometry(0.09, 14, 10), toon('#c9302c'), 0, -0.13, 0);
  sb.scale.set(0.85, 1.25, 0.85);
  speed.add(sb, tube([0, 0, 0], [0, -0.03, 0], 0.012, C.steel, 6));
  live.add(rigid(speed));

  // The bag's swing: angles and their speeds, a damped pendulum.
  let ax = 0;
  let az = 0;
  let vx = 0;
  let vz = 0;
  let twist = 0;
  let vt = 0;
  let lastU = -1;
  let lastRep = -1;
  const punchK = (u: number, at: number) => {
    const d = Math.abs(u - at);
    return d < 0.1 ? Math.cos((d / 0.1) * (Math.PI / 2)) : 0;
  };

  return {
    statics,
    live,
    spot: [0, 0, -0.05],
    off: [-0.95, -0.1],
    size: { w: 0.9, d: 1.05, top: 2.3, cz: 0.95 },
    cam: { eye: [1.9, 1.9, -1.4], look: [0, 0.6, 0.35] },
    update(s, dt) {
      const st = s.set;
      if (st && st.stage === 'rep') {
        const u = st.u;
        if (st.rep !== lastRep) lastU = -1;
        for (const c of COMBO) {
          if (lastU < c.at && u >= c.at) {
            const hit = c.power * (st.failing ? 0.4 : 1);
            vx -= 1.3 * hit;
            vz += c.side * 0.35 * hit;
            vt += c.side * 0.8 * hit;
          }
        }
        lastU = u;
        lastRep = st.rep;
      } else lastU = -1;
      // Pendulum: g/L ≈ 6.5 for its chain, damped.
      const k = 6.5;
      const damp = Math.exp(-dt * 1.2);
      vx = (vx - k * Math.sin(ax) * dt) * damp;
      vz = (vz - k * Math.sin(az) * dt) * damp;
      vt = (vt - 4 * twist * dt) * Math.exp(-dt * 2);
      ax += vx * dt;
      az += vz * dt;
      twist += vt * dt;
      swing.rotation.set(ax, twist, az);
      // The speed bag rattles faintly whenever the heavy one takes a hit (they share the frame).
      speed.rotation.x = Math.sin(s.t * 23) * Math.min(0.25, Math.abs(vx) * 0.2) + Math.sin(s.t * 1.3) * 0.02;
    },
    pose(p, s) {
      const st = s.set;
      const bounce = st && st.stage !== 'done' ? Math.abs(Math.sin(s.t * 7)) * 0.02 : 0;
      p.hips([0, 0.4 + bounce, 0], 0.12, 0.08, 0);
      p.foot(1, [0.16, 0.06, 0.16]);
      p.foot(-1, [-0.14, 0.06, -0.12]);
      for (const side of [-1, 1] as const) {
        let k = 0;
        if (st && st.stage === 'rep') for (const c of COMBO) if (c.side === side) k = Math.max(k, punchK(st.u, c.at) * (st.failing ? 0.6 : 1));
        // Guard up by the chin, or out to where the bag's face is now.
        const guard: V3 = [side * 0.2, 1.05, 0.22];
        const hit: V3 = [side * 0.08, 1.02, PIVOT[2] - R - (PIVOT[1] - 1.02) * Math.sin(ax)];
        p.hand(side, [guard[0] + (hit[0] - guard[0]) * k, guard[1] + (hit[1] - guard[1]) * k, guard[2] + (hit[2] - guard[2]) * k]);
      }
      p.head(0.12);
    },
    gear(b: Bones) {
      // Red gloves over the fists.
      const gloves = [b.armL, b.armR].map((arm) => {
        const g = new THREE.Group();
        g.add(mesh(new THREE.SphereGeometry(0.11, 12, 10), toon('#c9302c'), 0, -0.39, 0.01));
        g.add(mesh(new THREE.CylinderGeometry(0.075, 0.08, 0.08, 10), C.white, 0, -0.3, 0));
        arm.add(g);
        return { arm, g };
      });
      return () => {
        for (const { arm, g } of gloves) {
          arm.remove(g);
          g.traverse((m) => (m as THREE.Mesh).geometry?.dispose());
        }
      };
    },
  };
}
