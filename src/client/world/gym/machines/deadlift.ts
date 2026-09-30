import * as THREE from 'three';
import { canvasTexture } from '../parts';
import { C, box, loadedBar, tube, type Machine, type V3 } from './kit';

/*
 * A deadlift platform (flrnoh fork, see kit.ts): a wooden centre inlaid between two thick rubber
 * pads with a lime border and logo, a bar on the floor loaded with bumper plates for the weight
 * that's set, and a chalk bowl on its stand. The lifter walks up, hinges down and grips the bar,
 * pulls it to lockout and sets it down again for every rep.
 */

const FLOOR_BAR: V3 = [0, 0.28, 0.28];
const LOCKOUT: V3 = [0, 0.6, 0.27];

function woodTexture(): THREE.CanvasTexture {
  return canvasTexture(128, 128, (g) => {
    g.fillStyle = '#c29361';
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? '#b8874f' : '#cb9d6b';
      g.fillRect(0, i * 16, 128, 15);
      g.fillStyle = 'rgba(80,50,20,0.25)';
      g.fillRect(((i * 37) % 100) + 10, i * 16, 1, 15);
    }
    g.strokeStyle = 'rgba(163,230,53,0.9)';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(64, 64, 22, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = 'rgba(163,230,53,0.9)';
    g.font = '900 16px ui-rounded, system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('LIFT', 64, 65);
  });
}

export function deadlift(): Machine {
  const statics = new THREE.Group();
  const live = new THREE.Group();
  // The platform: rubber either side, wood in the middle, a lime frame round it.
  const W = 2.4;
  const D = 1.7;
  statics.add(box(W, 0.05, D, C.frame, 0, 0.025, 0.15));
  for (const s of [-1, 1]) statics.add(box(0.72, 0.012, D - 0.06, C.rubber, s * 0.82, 0.056, 0.15));
  const wood = new THREE.Mesh(new THREE.PlaneGeometry(0.9, D - 0.06), new THREE.MeshToonMaterial({ map: woodTexture(), gradientMap: (C.frame as THREE.MeshToonMaterial).gradientMap }));
  wood.rotation.x = -Math.PI / 2;
  wood.position.set(0, 0.052, 0.15);
  wood.receiveShadow = true;
  live.add(wood);
  for (const s of [-1, 1]) {
    statics.add(box(W + 0.02, 0.02, 0.03, C.lime, 0, 0.045, 0.15 + s * (D / 2)));
    statics.add(box(0.03, 0.02, D, C.lime, s * (W / 2), 0.045, 0.15));
  }
  // The chalk bowl on its stand, off the platform's left side.
  const cx = -W / 2 - 0.35;
  statics.add(box(0.3, 0.04, 0.3, C.frame, cx, 0.02, 0.15));
  statics.add(tube([cx, 0.04, 0.15], [cx, 0.72, 0.15], 0.03, C.chrome));
  statics.add(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.14, 0.12, 18), C.frame2).translateX(cx).translateY(0.78).translateZ(0.15));
  statics.add(new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.02, 18), C.white).translateX(cx).translateY(0.83).translateZ(0.15));
  statics.add(new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), C.white).translateX(cx + 0.04).translateY(0.84).translateZ(0.13));

  const bar = loadedBar(true);
  live.add(bar.group);
  const barAt = (s: { set: { extent: number; hold: number } | null }): V3 => {
    const e = s.set?.extent ?? 0;
    return [0, THREE.MathUtils.lerp(FLOOR_BAR[1], LOCKOUT[1], e), THREE.MathUtils.lerp(FLOOR_BAR[2], LOCKOUT[2], e)];
  };
  return {
    statics,
    live,
    spot: [0, 0.055, 0],
    off: [0, -1.0],
    size: { w: W - 0.1, d: 0.9, top: 1.0, cz: 0.1 },
    cam: { eye: [2.2, 1.8, 2.0], look: [0, 0.25, 0.15] },
    update(s) {
      bar.load(s.weight);
      bar.group.position.set(...barAt(s));
    },
    pose(p, s) {
      const hold = s.set?.hold ?? 0;
      const e = s.set?.extent ?? 0;
      // Set up over the bar (hold) and stand it up (extent); off the bar they stand tall behind it.
      const down = hold * (1 - e);
      p.hips([0, 0.055 + 0.42 - 0.13 * down, -0.02 - 0.14 * down], 0.1 + 0.82 * down);
      const b = barAt(s);
      for (const side of [-1, 1] as const) {
        p.foot(side, [side * 0.16, 0.11, 0.1]);
        if (hold > 0.02) p.hand(side, [side * 0.34, b[1], b[2]]);
        else p.arm(side, 0.1, 0.1);
      }
      p.head(0.3 * down - 0.05);
    },
  };
}
