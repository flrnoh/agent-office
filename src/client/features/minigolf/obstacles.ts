import * as THREE from 'three';
import { LANE_Y } from '../../../shared/minigolf';
import { BRIDGE, BUMPERS, PLANET, TOWER, VOLCANO } from '../../../shared/minigolf-holes';
import { BALL_R, heightAt, loopPoint, sailAngle, slideAt, spinAngle, type Loop } from '../../../shared/minigolf-physics';
import type { Collider } from '../../world/types';
import type { HoleView } from './course';
import { Batch, dotTexture, halo, stripGeo, unlit } from './look';
import { NEON, rng } from './paint';

/*
 * The holes' obstacles and what makes each its own (flrnoh fork, see FORK.md "Black-light mini
 * golf"): the windmill's turning sails, the loop's rails, the jump's glowing gap, the planet with its
 * ring and tunnels, the volcano's lava, the sliding bridge over the reef, the tower's deck and clear
 * pipe, the pinball's mushrooms and spinner. All move by the shared clock (`t`, seconds), so everyone
 * sees the windmill in the same place. Each hole's pieces in its own frame.
 */

export interface Obstacles {
  /** Every frame, by the shared clock. */
  update(t: number, dt: number): void;
  /** A bumper was hit: it flashes. */
  flash(hole: number, x: number, z: number): void;
  /** Where the ball goes through hole `n`'s clear pipe `i`, `k` of the way (0–1), if it shows there. */
  pipePoint(n: number, i: number, k: number): THREE.Vector3 | null;
  /** What people walk into (in room coordinates). */
  colliders: Collider[];
}

/** A collider round a box in a hole's frame, in the room. */
function boxIn(v: HoleView, minX: number, maxX: number, minZ: number, maxZ: number, top: number): Collider {
  const g = v.group;
  const pts = [
    [minX, minZ],
    [maxX, minZ],
    [minX, maxZ],
    [maxX, maxZ],
  ].map(([x, z]) => new THREE.Vector3(x, 0, z).applyAxisAngle(new THREE.Vector3(0, 1, 0), g.rotation.y).add(g.position));
  return { minX: Math.min(...pts.map((p) => p.x)), maxX: Math.max(...pts.map((p) => p.x)), minZ: Math.min(...pts.map((p) => p.z)), maxZ: Math.max(...pts.map((p) => p.z)), top, fence: true };
}

export function buildObstacles(holes: HoleView[]): Obstacles {
  const ticks: ((t: number, dt: number) => void)[] = [];
  const flashes: { hole: number; x: number; z: number; mat: THREE.MeshBasicMaterial; base: THREE.Color; k: number }[] = [];
  const pipes = new Map<string, THREE.CatmullRomCurve3>();
  const colliders: Collider[] = [];
  for (const v of holes) {
    const c = v.def.course;
    const glow = v.def.glow;
    const add = new Batch();
    switch (v.def.theme) {
      case 'jungle': {
        // Two glowing palms in the corner of the dog-leg, and a tiki mask.
        for (const [x, z, h] of [
          [1.5, -4.3, 2.3],
          [2.6, -3.6, 1.8],
        ] as const) {
          const trunk = new THREE.CylinderGeometry(0.06, 0.1, h, 8, 4);
          trunk.translate(x, h / 2 - LANE_Y, z);
          add.baked(trunk, '#3b2a12');
          for (let i = 0; i < 4; i++) {
            const ring = new THREE.TorusGeometry(0.085 - i * 0.006, 0.01, 4, 12);
            ring.rotateX(Math.PI / 2);
            ring.translate(x, 0.3 + i * (h / 4), z);
            add.add(ring, unlit('#ff7a00'));
          }
          for (let i = 0; i < 7; i++) {
            const a = (i / 7) * Math.PI * 2;
            const leaf = new THREE.ConeGeometry(0.12, 1.0, 4, 1);
            leaf.rotateX(Math.PI / 2 + 0.5);
            leaf.translate(0, -0.1, 0.5);
            leaf.rotateY(a);
            leaf.translate(x, h - LANE_Y, z);
            add.add(leaf, unlit(i % 2 ? '#39ff14' : '#00ffb3'));
          }
        }
        const tiki = new THREE.BoxGeometry(0.4, 0.7, 0.2);
        tiki.translate(0.3, 0.35 - LANE_Y, -3.2);
        add.baked(tiki, '#1c1206');
        for (const [ex, color] of [
          [-0.09, '#fffb00'],
          [0.09, '#fffb00'],
        ] as const) {
          const eye = new THREE.CircleGeometry(0.05, 12);
          eye.rotateY(-Math.PI / 2);
          eye.translate(0.3 - 0.101, 0.48 - LANE_Y, -3.2 + ex);
          add.add(eye, unlit(color));
        }
        colliders.push(boxIn(v, 1.35, 1.65, -4.45, -4.15, 2), boxIn(v, 2.45, 2.75, -3.75, -3.45, 2));
        break;
      }
      case 'mill': {
        const m = c.windmill!;
        // The house over the lane, its door under the sails.
        const house = new THREE.Group();
        const body = new Batch();
        const front = m.z - 0.075;
        const back = -4.8;
        const wall = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, color: string, glowK = 0) => {
          const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
          g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
          body.baked(g, color, glowK);
        };
        wall(-0.75, -0.13, -LANE_Y, 0.95, back, front, '#3a1a8c');
        wall(0.13, 0.75, -LANE_Y, 0.95, back, front, '#3a1a8c');
        wall(-0.13, 0.13, 0.32, 0.95, back, front, '#3a1a8c');
        // A roof, glowing windows and a door frame.
        const roof = new THREE.ConeGeometry(0.85, 0.55, 4, 1);
        roof.rotateY(Math.PI / 4);
        roof.translate(0, 0.95 + 0.27, (front + back) / 2);
        body.baked(roof, '#ff2bd6', 0.6);
        for (const x of [-0.42, 0.42]) {
          const win = new THREE.PlaneGeometry(0.16, 0.2);
          win.translate(x, 0.62, front + 0.002);
          body.add(win, unlit('#fffb00'));
        }
        body.add(stripGeo(-0.15, front + 0.004, 0.15, front + 0.004, 0.33, 0.025, true), unlit('#00e5ff'));
        for (const x of [-0.14, 0.14]) {
          const post = new THREE.BoxGeometry(0.025, 0.33, 0.02);
          post.translate(x, 0.33 / 2 - 0.01, front + 0.004);
          body.add(post, unlit('#00e5ff'));
        }
        body.build(house);
        v.group.add(house);
        // The sails, turning in front of it.
        const hub = new THREE.Group();
        hub.position.set(m.x, m.hub, m.z);
        const sails = new Batch();
        for (let i = 0; i < 4; i++) {
          const a = (i * Math.PI) / 2;
          const arm = new THREE.BoxGeometry(0.03, m.len, 0.02);
          arm.translate(0, -m.len / 2, 0);
          arm.rotateZ(a);
          sails.baked(arm, '#d9d9e8');
          const sail = new THREE.PlaneGeometry(m.width, m.len * 0.72);
          sail.translate(m.width / 2 - 0.02, -m.len * 0.62, 0.012);
          sail.rotateZ(a);
          sails.add(sail, unlit(NEON[i * 2], { side: THREE.DoubleSide, transparent: true, opacity: 0.85 }));
          const edge = new THREE.BoxGeometry(0.012, m.len * 0.72, 0.014);
          edge.translate(m.width - 0.02, -m.len * 0.62, 0.012);
          edge.rotateZ(a);
          sails.add(edge, unlit('#ffffff'));
        }
        const cap = new THREE.CylinderGeometry(0.07, 0.07, 0.06, 12);
        cap.rotateX(Math.PI / 2);
        sails.baked(cap, '#fffb00', 0.9);
        sails.build(hub);
        v.group.add(hub);
        ticks.push((t) => (hub.rotation.z = sailAngle(m, t)));
        colliders.push(boxIn(v, -0.8, 0.8, back, front + 0.1, 2.2));
        break;
      }
      case 'loop': {
        const l = c.loop!;
        loopRails(l, add, glow);
        const ys = Math.max(0.05, l.r * 2);
        colliders.push(boxIn(v, l.x - 0.15, l.x + l.lat + 0.15, l.z - l.r - 0.1, l.z + l.r + 0.1, ys + 0.1));
        break;
      }
      case 'jump': {
        // The gap: a trench of glowing lava under clear glass sides.
        const pit = new THREE.Group();
        const lava = lavaTexture();
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.8), new THREE.MeshBasicMaterial({ map: lava }));
        floor.rotation.x = -Math.PI / 2;
        floor.position.set(0, -LANE_Y + 0.01, -4.4);
        pit.add(floor);
        const glowBox = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.8), halo('#ff7a00', 0.4));
        glowBox.rotation.x = -Math.PI / 2;
        glowBox.position.set(0, -LANE_Y + 0.06, -4.4);
        pit.add(glowBox);
        v.group.add(pit);
        ticks.push((t) => (lava.offset.set(Math.sin(t * 0.3) * 0.05, t * 0.04)));
        // Chevrons up the ramp.
        for (let i = 0; i < 3; i++) {
          const z = -3.2 - i * 0.28;
          const y = heightAt(c.surfaces[1].h, 0, z)[0] + 0.004;
          add.add(stripGeo(-0.2, z + 0.1, 0, z, y, 0.035), unlit('#fffb00'));
          add.add(stripGeo(0, z, 0.2, z + 0.1, y, 0.035), unlit('#fffb00'));
        }
        // The lip, glowing.
        add.add(stripGeo(-0.55, -4.0, 0.55, -4.0, 0.225, 0.03), unlit('#ff2bd6'));
        add.add(stripGeo(-0.55, -4.8, 0.55, -4.8, 0.004, 0.03), unlit('#39ff14'));
        break;
      }
      case 'space': {
        // The planet: bands of neon, a tilted ring, three dark mouths with glowing rims.
        const planet = new THREE.Group();
        planet.position.set(PLANET.x, 0.47 - 0.0, PLANET.z);
        const R = 1.15;
        const sphere = new THREE.Mesh(new THREE.SphereGeometry(R, 48, 32), new THREE.MeshBasicMaterial({ map: planetTexture() }));
        planet.add(sphere);
        const ring = new THREE.Mesh(new THREE.RingGeometry(R * 1.25, R * 1.6, 64), unlit('#b14dff', { transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
        ring.rotation.x = -Math.PI / 2 + 0.35;
        ring.rotation.y = 0.25;
        planet.add(ring);
        const ringGlow = new THREE.Mesh(new THREE.RingGeometry(R * 1.22, R * 1.65, 64), halo('#ff2bd6', 0.18));
        ringGlow.rotation.copy(ring.rotation);
        planet.add(ringGlow);
        v.group.add(planet);
        ticks.push((t) => {
          sphere.rotation.y = t * 0.12;
          ring.rotation.z = t * 0.05;
          ringGlow.rotation.z = t * 0.05;
        });
        for (const mx of PLANET.mouths) {
          const fz = PLANET.z + Math.sqrt(PLANET.r * PLANET.r - mx * mx);
          const mouth = new THREE.CircleGeometry(PLANET.mouth + 0.03, 16, 0, Math.PI);
          mouth.rotateY(Math.atan2(mx, fz - PLANET.z));
          mouth.translate(mx, -0.005, fz + 0.03);
          add.add(mouth, unlit('#000000', { side: THREE.DoubleSide }));
          const rim = new THREE.TorusGeometry(PLANET.mouth + 0.03, 0.012, 6, 16, Math.PI);
          rim.rotateY(Math.atan2(mx, fz - PLANET.z));
          rim.translate(mx, 0, fz + 0.035);
          add.add(rim, unlit('#00e5ff'));
        }
        // Where the tunnels come out.
        for (const p of c.pipes ?? []) {
          const ox = p.out.x - Math.sin(p.out.dir) * 0.12;
          const oz = p.out.z - Math.cos(p.out.dir) * 0.12;
          const pipe = new THREE.CylinderGeometry(0.07, 0.07, 0.25, 14, 1, true);
          pipe.rotateX(Math.PI / 2);
          pipe.rotateY(p.out.dir);
          pipe.translate(ox, 0.05, oz);
          add.baked(pipe, '#2b1b55');
          const rim = new THREE.TorusGeometry(0.07, 0.01, 6, 16);
          rim.rotateY(p.out.dir);
          rim.translate(ox + Math.sin(p.out.dir) * 0.125, 0.05, oz + Math.cos(p.out.dir) * 0.125);
          add.add(rim, unlit('#fffb00'));
        }
        // A few little stars on stalks round it.
        const r = rng(31);
        for (let i = 0; i < 6; i++) {
          const x = (r() - 0.5) * 3;
          const z = -5.6 - r() * 1.6;
          const star = new THREE.OctahedronGeometry(0.06);
          star.translate(x, 0.35 + r() * 0.5, z);
          add.add(star, unlit(NEON[i % NEON.length]));
        }
        colliders.push(boxIn(v, -1.2, 1.2, PLANET.z - 1.2, PLANET.z + 1.0, 1.6));
        break;
      }
      case 'volcano': {
        // Lava running down its sides, a glow over the crater that breathes, the rim alight.
        const r = rng(41);
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * Math.PI * 2 + r() * 0.3;
          const pts: THREE.Vector3[] = [];
          for (let k = 0; k <= 8; k++) {
            const rr = 0.34 + (k / 8) * (VOLCANO.r - 0.4);
            const wob = Math.sin(k * 1.7 + i) * 0.06;
            const x = VOLCANO.x + Math.cos(a + wob) * rr;
            const z = VOLCANO.z + Math.sin(a + wob) * rr;
            pts.push(new THREE.Vector3(x, heightAt(c.surfaces[1].h, x, z)[0] + 0.006, z));
          }
          const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.018 - i * 0.0008, 4, false);
          add.add(tube, unlit(i % 3 ? '#ff7a00' : '#ffd000'));
        }
        const rim = new THREE.TorusGeometry(0.32, 0.016, 6, 40);
        rim.rotateX(Math.PI / 2);
        rim.translate(VOLCANO.x, 0.425, VOLCANO.z);
        add.add(rim, unlit('#ff3b3b'));
        const steam = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTexture(), color: '#ff5a00', transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
        steam.position.set(VOLCANO.x, 0.75, VOLCANO.z);
        steam.scale.set(1.4, 1.4, 1);
        v.group.add(steam);
        ticks.push((t) => {
          const k = 0.5 + 0.5 * Math.sin(t * 1.3);
          steam.material.opacity = 0.3 + 0.25 * k;
          steam.scale.setScalar(1.2 + 0.3 * k);
        });
        break;
      }
      case 'reef': {
        // The reef under the bridge: a glowing seabed down in the gap, jellyfish drifting.
        const { from, to } = BRIDGE;
        const bed = new THREE.Mesh(new THREE.PlaneGeometry(1.0, from - to), new THREE.MeshBasicMaterial({ map: reefTexture() }));
        bed.rotation.x = -Math.PI / 2;
        bed.position.set(0, -LANE_Y + 0.01, (from + to) / 2);
        v.group.add(bed);
        const sea = new THREE.Mesh(new THREE.PlaneGeometry(1.0, from - to), halo('#00e5ff', 0.22));
        sea.rotation.x = -Math.PI / 2;
        sea.position.set(0, -0.05, (from + to) / 2);
        v.group.add(sea);
        const jellies: THREE.Sprite[] = [];
        for (let i = 0; i < 3; i++) {
          const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTexture(), color: NEON[[1, 5, 2][i]], transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
          s.scale.setScalar(0.14);
          v.group.add(s);
          jellies.push(s);
        }
        const bridge = v.moving.get('bridge');
        ticks.push((t) => {
          if (bridge) bridge.position.x = slideAt(BRIDGE.slide, t).x;
          jellies.forEach((s, i) => s.position.set(Math.sin(t * 0.4 + i * 2) * 0.35, -0.03 + Math.sin(t * 0.9 + i) * 0.015, from - 0.3 - i * 0.5 + Math.cos(t * 0.3 + i) * 0.1));
        });
        break;
      }
      case 'tower': {
        // The clear pipe from the hole in the deck down to the lower green, the ball seen going through it.
        const { drop } = TOWER;
        const p = c.pipes![0];
        const curve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(drop.x, TOWER.deck - 0.08, drop.z),
          new THREE.Vector3(drop.x, TOWER.deck - 0.2, drop.z - 0.15),
          new THREE.Vector3(0.75, 0.32, -5.45),
          new THREE.Vector3(p.out.x, 0.16, p.out.z - 0.35),
          new THREE.Vector3(p.out.x, BALL_R + 0.12, p.out.z - 0.05),
        ]);
        pipes.set(`${v.def.n}:0`, curve);
        add.add(new THREE.TubeGeometry(curve, 40, 0.045, 10, false), unlit('#9ff6ff', { transparent: true, opacity: 0.18, side: THREE.DoubleSide }));
        add.add(new THREE.TubeGeometry(curve, 40, 0.008, 4, false), unlit('#fffb00'));
        // Pillars under the deck's edge, a glowing "2" on its end.
        for (const [x, z] of [
          [-0.5, -2.4],
          [0.5, -2.4],
          [-0.5, -5.6],
          [0.5, -5.6],
        ] as const) {
          const pillar = new THREE.BoxGeometry(0.05, TOWER.deck + LANE_Y, 0.05);
          pillar.translate(x, (TOWER.deck - LANE_Y) / 2, z);
          add.add(pillar, unlit(glow));
        }
        colliders.push(boxIn(v, -0.55, 0.55, TOWER.end, TOWER.rampTo, 0.5));
        break;
      }
      case 'pinball': {
        // Mushroom bumpers that flash when they kick, the spinner, lights in the table.
        for (const b of BUMPERS) {
          const y = heightAt(c.surfaces[0].h, b.x, b.z)[0];
          const stem = new THREE.CylinderGeometry(b.r * 0.8, b.r * 0.9, 0.1 + LANE_Y, 20);
          stem.translate(b.x, y + 0.05 - LANE_Y / 2, b.z);
          add.baked(stem, '#2a0d3a');
          const mat = new THREE.MeshBasicMaterial({ color: '#ff2bd6' });
          const capGeo = new THREE.CylinderGeometry(b.r * 1.15, b.r * 1.2, 0.05, 20);
          const cap = new THREE.Mesh(capGeo, mat);
          cap.position.set(b.x, y + 0.13, b.z);
          v.group.add(cap);
          const ringMat = new THREE.MeshBasicMaterial({ color: '#fffb00' });
          const ring = new THREE.Mesh(new THREE.TorusGeometry(b.r * 1.02, 0.014, 6, 24), ringMat);
          ring.rotation.x = Math.PI / 2;
          ring.position.set(b.x, y + 0.06, b.z);
          v.group.add(ring);
          flashes.push({ hole: v.def.n, x: b.x, z: b.z, mat, base: mat.color.clone(), k: 0 });
          flashes.push({ hole: v.def.n, x: b.x, z: b.z, mat: ringMat, base: ringMat.color.clone(), k: 0 });
        }
        const s = c.spinners![0];
        const spinner = new THREE.Group();
        spinner.position.set(s.x, heightAt(c.surfaces[0].h, s.x, s.z)[0], s.z);
        const bar = new THREE.Mesh(new THREE.BoxGeometry(s.len * 2, 0.06, 0.05), unlit('#00e5ff'));
        bar.position.y = 0.04;
        spinner.add(bar);
        const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.1, 10), unlit('#fffb00'));
        pin.position.y = 0.04;
        spinner.add(pin);
        v.group.add(spinner);
        // spinAngle turns the bar's (cos, sin) in x and z: as a rotation.y, that's the other way round.
        ticks.push((t) => (spinner.rotation.y = -spinAngle(s, t)));
        const lights: THREE.MeshBasicMaterial[] = [];
        for (let i = 0; i < 6; i++) {
          const z = -0.9 - i * 0.55;
          const y = heightAt(c.surfaces[0].h, 0, z)[0] + 0.004;
          const tri = new THREE.CircleGeometry(0.07, 3);
          tri.rotateX(-Math.PI / 2);
          tri.rotateY(Math.PI / 2);
          tri.translate(1.1, y, z);
          const mat = new THREE.MeshBasicMaterial({ color: NEON[i % NEON.length] });
          v.group.add(new THREE.Mesh(tri, mat));
          lights.push(mat);
        }
        ticks.push((t) => lights.forEach((m, i) => m.color.set(Math.floor(t * 4 - i) % 6 === 0 ? '#ffffff' : NEON[i % NEON.length])));
        // The backbox at the far end.
        const box = new THREE.BoxGeometry(2.4, 1.2, 0.15);
        box.translate(0, 0.6, -5.85);
        add.baked(box, '#1b0f30');
        const face = new THREE.PlaneGeometry(2.2, 1.0);
        face.translate(0, 0.62, -5.77);
        add.add(face, new THREE.MeshBasicMaterial({ map: pinballTexture() }));
        colliders.push(boxIn(v, -1.25, 1.25, -5.95, -5.75, 1.3));
        break;
      }
    }
    add.build(v.group);
  }
  const wn = new THREE.Vector3();
  return {
    update(t, dt) {
      for (const tick of ticks) tick(t, dt);
      for (const f of flashes) {
        if (f.k <= 0) continue;
        f.k = Math.max(0, f.k - dt * 4);
        f.mat.color.copy(f.base).lerp(wn.set(1, 1, 1) as unknown as THREE.Color, f.k);
      }
    },
    flash(hole, x, z) {
      for (const f of flashes) if (f.hole === hole && Math.hypot(f.x - x, f.z - z) < 0.3) f.k = 1;
    },
    pipePoint(n, i, k) {
      const curve = pipes.get(`${n}:${i}`);
      return curve ? curve.getPoint(Math.max(0, Math.min(1, k))) : null;
    },
    colliders,
  };
}

/** The loop's two rails round it and its posts. */
function loopRails(l: Loop, out: Batch, glow: string) {
  for (const side of [-1, 1]) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 64; i++) {
      const th = (i / 64) * Math.PI * 2;
      const p = loopPoint(l, th);
      // Out from the ball's middle, a ball's width to each side.
      const cy = BALL_R + (l.r - BALL_R);
      const ny = p.y - cy;
      const nz = p.z - l.z;
      const len = Math.hypot(ny, nz) || 1;
      pts.push(new THREE.Vector3(p.x + side * 0.032, p.y + (ny / len) * BALL_R * 0.6, p.z + (nz / len) * BALL_R * 0.6));
    }
    out.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 96, 0.009, 6, false), unlit(side < 0 ? glow : '#ffffff'));
  }
  // A clear band behind it, and two stands.
  const band: THREE.Vector3[] = [];
  for (let i = 0; i <= 64; i++) {
    const p = loopPoint(l, (i / 64) * Math.PI * 2);
    band.push(new THREE.Vector3(p.x, p.y, p.z));
  }
  out.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(band), 96, 0.05, 8, false), unlit('#9ff6ff', { transparent: true, opacity: 0.08, side: THREE.DoubleSide }));
  for (const dz of [-1, 1]) {
    const stand = new THREE.BoxGeometry(0.03, l.r * 2, 0.03);
    stand.translate(l.x + l.lat / 2 + 0.12, l.r - 0.02, l.z + dz * l.r * 0.6);
    out.add(stand, unlit('#2b2440'));
  }
}

function paintCanvas(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function lavaTexture(): THREE.CanvasTexture {
  const t = paintCanvas(256, 256, (g) => {
    g.fillStyle = '#2a0500';
    g.fillRect(0, 0, 256, 256);
    const r = rng(51);
    for (let i = 0; i < 40; i++) {
      g.strokeStyle = ['#ff7a00', '#ffd000', '#ff3b3b'][i % 3];
      g.shadowColor = g.strokeStyle;
      g.shadowBlur = 12;
      g.lineWidth = 3 + r() * 6;
      g.beginPath();
      const y = r() * 256;
      g.moveTo(0, y);
      g.bezierCurveTo(80, y + (r() - 0.5) * 80, 170, y + (r() - 0.5) * 80, 256, y);
      g.stroke();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function reefTexture(): THREE.CanvasTexture {
  return paintCanvas(256, 410, (g) => {
    g.fillStyle = '#021a26';
    g.fillRect(0, 0, 256, 410);
    const r = rng(61);
    for (let i = 0; i < 26; i++) {
      const color = NEON[[1, 6, 4, 5, 3][i % 5]];
      g.strokeStyle = color;
      g.shadowColor = color;
      g.shadowBlur = 10;
      g.lineWidth = 3;
      const x = r() * 256;
      const y = r() * 410;
      for (let k = 0; k < 5; k++) {
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + Math.cos(k * 1.25) * 18, y + Math.sin(k * 1.25) * 18);
        g.stroke();
      }
    }
    for (let i = 0; i < 60; i++) {
      g.fillStyle = '#9ff6ff';
      g.globalAlpha = 0.5;
      g.beginPath();
      g.arc(r() * 256, r() * 410, 1 + r() * 2, 0, Math.PI * 2);
      g.fill();
    }
  });
}

function planetTexture(): THREE.CanvasTexture {
  return paintCanvas(512, 256, (g) => {
    g.fillStyle = '#12063a';
    g.fillRect(0, 0, 512, 256);
    const r = rng(71);
    for (let i = 0; i < 9; i++) {
      const y = 20 + i * 26 + (r() - 0.5) * 10;
      const color = NEON[[5, 1, 2, 6][i % 4]];
      g.strokeStyle = color;
      g.shadowColor = color;
      g.shadowBlur = 14;
      g.lineWidth = 4 + r() * 8;
      g.beginPath();
      g.moveTo(0, y);
      for (let x = 0; x <= 512; x += 32) g.lineTo(x, y + Math.sin(x * 0.03 + i) * 6);
      g.stroke();
    }
    for (let i = 0; i < 12; i++) {
      g.strokeStyle = '#fffb00';
      g.shadowColor = '#fffb00';
      g.shadowBlur = 8;
      g.lineWidth = 2;
      g.beginPath();
      g.arc(r() * 512, r() * 256, 4 + r() * 10, 0, Math.PI * 2);
      g.stroke();
    }
  });
}

function pinballTexture(): THREE.CanvasTexture {
  return paintCanvas(512, 232, (g) => {
    g.fillStyle = '#0a0418';
    g.fillRect(0, 0, 512, 232);
    g.textAlign = 'center';
    g.font = '900 92px "Trebuchet MS", system-ui, sans-serif';
    for (const [color, blur] of [
      ['#ff2bd6', 30],
      ['#ffffff', 0],
    ] as const) {
      g.shadowColor = color;
      g.shadowBlur = blur;
      g.fillStyle = color;
      g.fillText('FLIPPER', 256, 118);
    }
    g.font = '700 30px "Trebuchet MS", system-ui, sans-serif';
    g.shadowColor = '#00e5ff';
    g.shadowBlur = 14;
    g.fillStyle = '#00e5ff';
    g.fillText('★ EXTRA BALL ★ 1.000.000 ★', 256, 180);
  });
}
