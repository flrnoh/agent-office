import * as THREE from 'three';
import { STAGE_HEIGHT, ZONES } from '../../../shared/venue';
import { FX_LASTS_MS, type VenueFx } from '../../../shared/venue-house';
import { mulberry32 } from '../../../shared/rng';
import { mergeByMaterial, mesh, toon } from '../toon';
import { box } from '../casino/parts';
import { softDot } from './signs';
import { noPick } from './pick';

/*
 * The light desk's effects (flrnoh fork, see FORK.md "The Schallwerk"), played from the moment the
 * office says they went off (its clock), so everyone inside sees the same and whoever comes in late
 * sees the rest of it: the CO₂ jets blasting white plumes down from the front truss over the crowd,
 * the confetti cannons on the truss throwing a cloud of paper that flutters down onto the floor and
 * lies there a while, the cold sparkler fountains along the stage's front lip, and the haze machines
 * puffing either side of the stage (the haze in the air is lighting.ts').
 */

const FRONT_Z = 4.6;
/** The CO₂ jets on the front truss, the confetti cannons, the spark fountains on the stage's front lip, the haze machines. */
export const CO2_JETS: readonly number[] = [-7, -1, 6, 12];
const CANNONS: readonly number[] = [0, 6];
export const SPARKERS: readonly { x: number; z: number }[] = [-8.5, -3.2, 8.2, 13.4].map((x) => ({ x, z: ZONES.stage.minZ + 0.12 }));
const HAZERS: readonly { x: number; z: number }[] = [
  { x: ZONES.stage.minX + 0.6, z: 6 },
  { x: ZONES.stage.maxX - 0.6, z: 6 },
];

const CONFETTI = 520;
const SPARKS = 140;
const PUFFS = 36;

export interface VenueFxShow {
  /** An effect went off at `at` (office clock, ms). */
  fire(fx: VenueFx, at: number): void;
  update(now: number): void;
}

export function buildFx(group: THREE.Group): VenueFxShow {
  const fired: Partial<Record<VenueFx, number>> = {};
  const black = toon('#121215');
  const hardware = new THREE.Group();
  // The jets and the cannons on the truss, the sparkers' little boxes on the lip, the hazers at the sides.
  for (const x of CO2_JETS) {
    hardware.add(mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.5, 10), black, x, 6.95, FRONT_Z - 0.25, false));
    hardware.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.6, 6).rotateZ(Math.PI / 2), toon('#5c6470'), x, 7.15, FRONT_Z - 0.25, false));
  }
  for (const x of CANNONS) {
    const c = mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.9, 12), toon('#2a2a33'), x + 1.5, 7.0, FRONT_Z - 0.3, false);
    c.rotation.x = 0.9;
    hardware.add(c);
  }
  for (const s of SPARKERS) hardware.add(mesh(box(0.26, 0.12, 0.2), black, s.x, STAGE_HEIGHT + 0.06, s.z, false));
  for (const h of HAZERS) hardware.add(mesh(box(0.5, 0.3, 0.35), black, h.x, 7.0, h.z, false));
  group.add(mergeByMaterial(hardware));

  // ---- CO₂: sprites of white mist down each jet ------------------------------------------------------
  const dot = softDot();
  const puffs: THREE.Sprite[][] = CO2_JETS.map(() =>
    Array.from({ length: PUFFS }, () => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: '#f4f7ff', transparent: true, depthWrite: false, opacity: 0 }));
      s.visible = false;
      group.add(s);
      return s;
    }),
  );
  // The haze machines' puffs.
  const hazePuffs = HAZERS.map(() =>
    Array.from({ length: 10 }, () => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: '#dfe6f0', transparent: true, depthWrite: false, opacity: 0 }));
      s.visible = false;
      group.add(s);
      return s;
    }),
  );

  // ---- Confetti: an instanced cloud of paper ------------------------------------------------------
  const paperMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  paperMat.userData.outlineParameters = { visible: false };
  const paper = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.06, 0.09), paperMat, CONFETTI);
  paper.frustumCulled = false;
  paper.visible = false;
  const r = mulberry32(4242);
  const shots = Array.from({ length: CONFETTI }, (_, i) => {
    const x0 = CANNONS[i % CANNONS.length] + 1.5;
    return { x0, vx: (r() - 0.5) * 9, vy: 4 + r() * 5, vz: -(5 + r() * 7), spin: r() * 10, flutter: r() * Math.PI * 2, rate: 2 + r() * 3 };
  });
  const colors = ['#ff2d3d', '#ffd166', '#2ee6ff', '#ffffff', '#c77dff', '#3ddc84', '#ff8fab'];
  const col = new THREE.Color();
  for (let i = 0; i < CONFETTI; i++) paper.setColorAt(i, col.set(colors[i % colors.length]));
  group.add(paper);

  // ---- Sparks: points shooting up from each fountain --------------------------------------------
  const sparkGeo = new THREE.BufferGeometry();
  const sparkPos = new Float32Array(SPARKERS.length * SPARKS * 3);
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparkMat = new THREE.PointsMaterial({ map: dot, color: '#ffd27a', size: 0.12, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
  sparkMat.userData.outlineParameters = { visible: false };
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  sparks.frustumCulled = false;
  sparks.visible = false;
  group.add(sparks);
  const sparkSeeds = Array.from({ length: SPARKERS.length * SPARKS }, () => ({ off: r(), v: 6 + r() * 2.2, ax: (r() - 0.5) * 1.4, az: (r() - 0.5) * 1.4 }));
  const glows = SPARKERS.map((s) => {
    const g = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: '#ffb347', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    g.position.set(s.x, STAGE_HEIGHT + 0.6, s.z);
    g.scale.set(1.6, 2.4, 1);
    group.add(g);
    return g;
  });

  noPick(...puffs.flat(), ...hazePuffs.flat(), paper, sparks, ...glows);

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const sc = new THREE.Vector3(1, 1, 1);

  return {
    fire(fx, at) {
      fired[fx] = at;
    },
    update(now) {
      const since = (fx: VenueFx) => {
        const at = fired[fx];
        if (at === undefined) return -1;
        const s = (now - at) / 1000;
        return s >= 0 && s * 1000 < FX_LASTS_MS[fx] ? s : -1;
      };

      // CO₂: each puff leaves its jet in turn over the first 0.8 s, shoots down and out, swells and fades.
      const co2 = since('co2');
      puffs.forEach((jet, j) => {
        for (let i = 0; i < jet.length; i++) {
          const s = jet[i];
          const age = co2 - i * 0.022;
          s.visible = co2 >= 0 && age > 0 && age < 1.3;
          if (!s.visible) continue;
          // Fast and narrow out of the nozzle, slowing and billowing out at the bottom.
          const k = 1 - Math.exp(-age * 3.6);
          p.set(CO2_JETS[j] + Math.sin(i * 2.3) * 0.6 * k * k, 6.9 - k * 5.6, FRONT_Z - 0.3 - k * 2.2 + Math.cos(i * 1.7) * 0.5 * k * k);
          s.position.copy(p);
          s.scale.set(0.25 + age * 2.6, 0.5 + age * 3.2, 1);
          s.material.opacity = 0.42 * Math.min(1, age * 6) * (1 - age / 1.3);
        }
      });

      // The haze machines: a few slow puffs rolling out over the stage in the first 6 s.
      const neb = since('nebel');
      hazePuffs.forEach((m, j) => {
        for (let i = 0; i < m.length; i++) {
          const s = m[i];
          const age = neb - i * 0.4;
          s.visible = neb >= 0 && age > 0 && age < 6;
          if (!s.visible) continue;
          const dir = j === 0 ? 1 : -1;
          s.position.set(HAZERS[j].x + dir * age * 1.6, 6.8 - age * 0.5, HAZERS[j].z + Math.sin(i) * 0.6 - age * 0.3);
          s.scale.setScalar(1 + age * 1.6);
          s.material.opacity = 0.35 * Math.min(1, age * 2) * (1 - age / 6);
        }
      });

      // Confetti: out of the cannons, drag and gravity to a slow flutter, onto the floor; it fades at the end.
      const conf = since('konfetti');
      paper.visible = conf >= 0;
      if (paper.visible) {
        const k = 1.6;
        const vt = 0.8;
        const fade = Math.min(1, (FX_LASTS_MS.konfetti / 1000 - conf) / 2);
        for (let i = 0; i < CONFETTI; i++) {
          const c = shots[i];
          const t = Math.max(0, conf - (i % 40) * 0.004);
          const ex = (1 - Math.exp(-k * t)) / k;
          let y = 7.0 - vt * t + (c.vy + vt) * ex;
          const landed = y <= 0.02;
          if (landed) y = 0.02;
          p.set(c.x0 + c.vx * ex + Math.sin(t * c.rate + c.flutter) * 0.3 * Math.min(1, t), y, FRONT_Z - 0.3 + c.vz * ex);
          if (landed) e.set(-Math.PI / 2, 0, c.spin);
          else e.set(t * c.rate, t * c.spin, t * 2);
          q.setFromEuler(e);
          sc.setScalar(fade);
          m4.compose(p, q, sc);
          paper.setMatrixAt(i, m4);
        }
        paper.instanceMatrix.needsUpdate = true;
      }

      // Sparks: each particle loops up and falls back, for the fountains' 3.5 s.
      const sp = since('funken');
      sparks.visible = sp >= 0;
      const on = sp >= 0 ? Math.min(1, sp * 4) * Math.min(1, (FX_LASTS_MS.funken / 1000 - sp) * 2) : 0;
      sparkMat.opacity = on;
      glows.forEach((g) => (g.material.opacity = 0.5 * on * (0.8 + 0.2 * Math.sin(now * 0.05))));
      if (sparks.visible) {
        for (let f = 0; f < SPARKERS.length; f++)
          for (let i = 0; i < SPARKS; i++) {
            const n = f * SPARKS + i;
            const s = sparkSeeds[n];
            const life = 0.85;
            const age = (((sp + s.off * life) % life) + life) % life;
            const y = STAGE_HEIGHT + 0.12 + s.v * age - 4.9 * age * age;
            sparkPos[n * 3] = SPARKERS[f].x + s.ax * age;
            sparkPos[n * 3 + 1] = Math.max(STAGE_HEIGHT + 0.1, y);
            sparkPos[n * 3 + 2] = SPARKERS[f].z + s.az * age;
          }
        sparkGeo.attributes.position.needsUpdate = true;
      }
    },
  };
}
