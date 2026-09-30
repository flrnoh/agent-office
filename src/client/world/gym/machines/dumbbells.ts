import * as THREE from 'three';
import { nearestSize } from '../../../../shared/gym-motion';
import { mergeByColor } from '../../toon';
import { canvasTexture } from '../parts';
import { C, beam, box, dumbbell, foot, type Machine, type V3 } from './kit';

/*
 * The dumbbell rack (flrnoh fork, see kit.ts): a two-tier steel rack behind the lifter with a row of
 * hex dumbbells on each tier, lightest on top, each pair's weight on a lime tag. On it, the pair
 * nearest the weight that's set leaves its cradle for the lifter's hands, and they curl it facing
 * the mirror, rep after rep.
 */

const SIZES = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 50];
const RACK_Z = -0.72;
const HANG: V3 = [0.36, 0.53, 0.1];
const CURL: V3 = [0.3, 0.9, 0.24];

export function dumbbells(): Machine {
  const statics = new THREE.Group();
  const live = new THREE.Group();
  // The rack: end frames, two tiers sloping toward the lifter, the weight tags.
  const W = 1.9;
  for (const s of [-1, 1]) {
    statics.add(beam([s * W / 2, 0, RACK_Z - 0.15], [s * W / 2, 0.82, RACK_Z - 0.1], 0.07));
    statics.add(beam([s * W / 2, 0, RACK_Z + 0.2], [s * W / 2, 0.5, RACK_Z + 0.16], 0.07));
    statics.add(foot(0.12, s * W / 2, RACK_Z));
  }
  statics.add(box(W, 0.035, 0.26, C.frame, 0, 0.45, RACK_Z + 0.08).rotateX(0.2));
  statics.add(box(W, 0.035, 0.24, C.frame, 0, 0.78, RACK_Z - 0.1).rotateX(0.2));
  statics.add(box(W, 0.02, 0.02, C.lime, 0, 0.44, RACK_Z + 0.21));
  statics.add(box(W, 0.02, 0.02, C.lime, 0, 0.77, RACK_Z + 0.02));
  // The weight tags along each tier's front lip: one strip of numbers per tier.
  for (const top of [true, false]) {
    const sizes = SIZES.slice(top ? 0 : 8, top ? 8 : 16);
    const tex = canvasTexture(512, 32, (g) => {
      g.fillStyle = '#16241f';
      g.fillRect(0, 0, 512, 32);
      g.fillStyle = '#a3e635';
      g.font = '900 22px ui-rounded, system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      sizes.forEach((kg, i) => g.fillText(`${kg}`, ((0.12 + i * ((W - 0.24) / 7)) / W) * 512, 17));
    });
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(W, 0.05), new THREE.MeshBasicMaterial({ map: tex }));
    strip.position.set(0, top ? 0.74 : 0.41, top ? RACK_Z + 0.04 : RACK_Z + 0.225);
    strip.rotation.x = -0.2;
    live.add(strip);
  }

  // Live: the dumbbells on the rack (rebuilt when a pair leaves or comes back), and the pair in hand.
  const onRack = new THREE.Group();
  live.add(onRack);
  const inHand = [new THREE.Group(), new THREE.Group()];
  live.add(...inHand);
  let rackKey = '';
  const slot = (i: number): V3 => {
    const top = i < 8;
    const x = -W / 2 + 0.12 + (i % 8) * ((W - 0.24) / 7);
    return [x, top ? 0.86 : 0.54, top ? RACK_Z - 0.1 : RACK_Z + 0.08];
  };
  const fill = (out: number) => {
    const key = String(out);
    if (key === rackKey) return;
    rackKey = key;
    for (const c of [...onRack.children]) {
      onRack.remove(c);
      c.traverse((m) => (m as THREE.Mesh).geometry?.dispose());
    }
    const g = new THREE.Group();
    SIZES.forEach((kg, i) => {
      if (i === out) return;
      const [x, y, z] = slot(i);
      // A pair side by side in the cradle, handles front to back.
      for (const dz of [-0.06, 0.06]) {
        const d = dumbbell(kg);
        d.rotation.y = Math.PI / 2;
        d.scale.setScalar(0.85);
        d.position.set(x + (dz < 0 ? -0.04 : 0.04), y, z + dz * 0.4);
        g.add(d);
      }
    });
    onRack.add(mergeByColor(g));
    for (const h of inHand) {
      for (const c of [...h.children]) {
        h.remove(c);
        c.traverse((m) => (m as THREE.Mesh).geometry?.dispose());
      }
      if (out >= 0) {
        const d = dumbbell(SIZES[out]);
        d.scale.setScalar(0.85);
        h.add(d);
      }
    }
  };
  const handAt = (side: -1 | 1, e: number): V3 => [side * THREE.MathUtils.lerp(HANG[0], CURL[0], e), THREE.MathUtils.lerp(HANG[1], CURL[1], e), THREE.MathUtils.lerp(HANG[2], CURL[2], e)];
  const armE = (side: -1 | 1, s: { set: { u: number; stage: string; failing: boolean } | null }) => {
    // Alternating: the right arm curls in the first half of the rep, the left in the second.
    const st = s.set;
    if (!st || st.stage !== 'rep') return 0;
    const u = side < 0 ? st.u * 2 : st.u * 2 - 1;
    const most = st.failing && side > 0 ? 0.45 : 1;
    return u > 0 && u < 1 ? Math.sin(u * Math.PI) ** 2 * most : 0;
  };

  return {
    statics,
    live,
    shift: [0, 0], // on its station again: the spa wall moved east to x 24.6 (shared/gym-rooms.ts SPA)
    spot: [0, 0, 0.12],
    off: [0, 0.95],
    size: { w: W + 0.1, d: 0.6, top: 0.9, cz: RACK_Z },
    cam: { eye: [1.5, 1.9, 2.2], look: [0, 0.5, 0] },
    update(s) {
      const out = s.on ? SIZES.indexOf(nearestSize(s.weight, SIZES)) : -1;
      fill(out);
      inHand.forEach((h) => (h.visible = s.on));
    },
    pose(p, s) {
      p.hips([0, 0.42, 0.12], 0.04);
      for (const side of [-1, 1] as const) {
        const e = armE(side, s);
        const h = handAt(side, e);
        const at: V3 = [h[0], h[1], h[2] + 0.12];
        p.foot(side, [side * 0.15, 0.06, 0.14]);
        p.hand(side, at);
        const d = inHand[side < 0 ? 0 : 1];
        d.position.set(at[0], at[1] - 0.02, at[2]);
        d.rotation.set(0, 0, -side * 0.25 * e);
      }
      p.head(0.05);
    },
  };
}
