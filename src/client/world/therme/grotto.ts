import * as THREE from 'three';
import { GROTTO, GROTTO_MOUTH, GROTTO_POOL, GROTTO_ROOF, GROTTO_SWIM } from '../../../shared/therme-paradies';
import { paradiesFixtures } from '../../../shared/therme-paradies';
import { mesh, toon } from '../toon';
import { Cloud } from '../gym/particles';
import { rock } from '../gym/basement/textures';
import { glow, plane, rand, sign, tex, wrap, type ThermeParts } from './kit';

/*
 * The dripstone grotto in the Thermenparadies's north-west corner (flrnoh fork, see shared/
 * therme-paradies.ts): rock walls round a warm basin, open to the east, a low ceiling hung with
 * stalactites (and stalagmites on the ledge), glowing crystals, a slow colour-changing light (the
 * Paradies's one point light: it reaches the grotto only), steam over the water.
 */

export interface Grotto {
  update(t: number, dt: number, me: THREE.Vector3): void;
}

export function buildGrotto(p: ThermeParts): Grotto {
  const r = rand(61);
  const map = wrap(rock(83), 2, 1);
  const rk = tex(map, '#b9a99a');
  // The walls and roof as the plan has them, in rock.
  for (const f of paradiesFixtures().filter((f) => f.id.startsWith('grotto-'))) {
    const bottom = f.bottom ?? 0;
    p.group.add(mesh(new THREE.BoxGeometry(f.maxX - f.minX, f.top - bottom, f.maxZ - f.minZ), rk, (f.minX + f.maxX) / 2, (bottom + f.top) / 2, (f.minZ + f.maxZ) / 2, false));
  }
  // Lumps of rock along the walls outside and in, so it's a cave and not a box.
  const G = GROTTO;
  const lump = (x: number, y: number, z: number, s: number) => {
    const m = mesh(new THREE.DodecahedronGeometry(s, 0), rk, x, y, z, false);
    m.rotation.set(r() * 3, r() * 3, r() * 3);
    m.scale.set(1, 0.7 + r() * 0.5, 1);
    p.group.add(m);
  };
  for (let x = G.minX + 1; x < G.maxX; x += 2.2) {
    lump(x, 0.6 + r(), G.maxZ + 0.2, 1 + r() * 0.6);
    lump(x, GROTTO_ROOF + 0.4, G.maxZ - 0.2, 1.2 + r() * 0.5);
    lump(x, GROTTO_ROOF + 0.4, G.minZ + 0.5, 1.1);
  }
  for (let z = G.minZ + 1; z < G.maxZ; z += 2.2) if (z < GROTTO_MOUTH.minZ - 0.8 || z > GROTTO_MOUTH.maxZ + 0.8) lump(G.maxX + 0.3, 0.5 + r() * 1.5, z, 0.9 + r() * 0.6);
  // Stalactites from the ceiling, stalagmites on the ledge by the water: cones, merged.
  const drip = toon('#cbbba6');
  const cones: THREE.Mesh[] = [];
  for (let i = 0; i < 70; i++) {
    const x = G.minX + 1 + r() * (G.maxX - G.minX - 2);
    const z = G.minZ + 1 + r() * (G.maxZ - G.minZ - 2);
    const h = 0.4 + r() * 1.4;
    const c = mesh(new THREE.ConeGeometry(0.08 + r() * 0.14, h, 6), drip, x, GROTTO_ROOF - h / 2, z, false);
    c.rotation.x = Math.PI;
    cones.push(c);
  }
  for (let i = 0; i < 16; i++) {
    const z = G.minZ + 1.2 + r() * (G.maxZ - G.minZ - 2.4);
    const h = 0.3 + r() * 0.8;
    cones.push(mesh(new THREE.ConeGeometry(0.1 + r() * 0.12, h, 6), drip, GROTTO_POOL.maxX + 0.5 + r() * 0.6, h / 2, z, false));
  }
  for (const c of cones) p.still.add(c);
  // The ceiling's underside.
  const ceil = mesh(new THREE.PlaneGeometry(G.maxX - G.minX, G.maxZ - G.minZ), rk, (G.minX + G.maxX) / 2, GROTTO_ROOF - 0.01, (G.minZ + G.maxZ) / 2, false);
  ceil.rotation.x = Math.PI / 2;
  p.group.add(ceil);
  // Crystals glowing in the walls, and the light that changes colour.
  const crystal = new THREE.MeshBasicMaterial({ color: '#9ff3ff' });
  crystal.toneMapped = false;
  const gems: THREE.Mesh[] = [];
  for (let i = 0; i < 18; i++) {
    const side = i % 3;
    const x = side === 0 ? G.minX + 0.85 : G.minX + 2 + r() * (G.maxX - G.minX - 4);
    const z = side === 0 ? G.minZ + 1 + r() * (G.maxZ - G.minZ - 2) : side === 1 ? G.minZ + 0.85 : G.maxZ - 0.85;
    const g = mesh(new THREE.OctahedronGeometry(0.12 + r() * 0.14, 0), crystal, x, 0.8 + r() * 2.8, z, false);
    g.userData.noOutline = true;
    gems.push(g);
    p.group.add(g);
  }
  const light = new THREE.PointLight('#7fdcff', 2.4, 22, 1.6);
  light.position.set((GROTTO_POOL.minX + GROTTO_POOL.maxX) / 2, GROTTO_ROOF - 1, (GROTTO_POOL.minZ + GROTTO_POOL.maxZ) / 2);
  p.group.add(light);
  plane(p, 2.6, 0.6, glow(sign('TROPFSTEINGROTTE', 'Warmes Wasser · 36 °C · Farblicht', '#1c2a3a', '#9ff3ff', 768, 176)), G.maxX + 0.02, 3.4, (GROTTO_MOUTH.minZ + GROTTO_MOUTH.maxZ) / 2, Math.PI / 2);
  const steam = new Cloud(160, '#e8f4ff');
  steam.lift = 0.12;
  steam.drag = 0.3;
  p.group.add(steam.points);
  const col = new THREE.Color();
  const v = new THREE.Vector3();
  return {
    update: (t, dt, me) => {
      // A slow round of colours: turquoise, violet, rose, amber, green.
      col.setHSL((t * 0.02) % 1, 0.75, 0.6);
      light.color.copy(col);
      crystal.color.copy(col).lerp(new THREE.Color('#ffffff'), 0.35);
      if (Math.hypot(me.x - (G.minX + G.maxX) / 2, me.z - (G.minZ + G.maxZ) / 2) > 40) return;
      steam.emit(Math.ceil(dt * 14), { at: v.set((GROTTO_POOL.minX + GROTTO_POOL.maxX) / 2, GROTTO_SWIM.surface + 0.1, (GROTTO_POOL.minZ + GROTTO_POOL.maxZ) / 2), spread: { x: 5.5, y: 0.05, z: 4.5 }, vel: { x: 0, y: 0.15, z: 0 }, jitter: 0.08, life: 4, size0: 0.4, size1: 1.6, alpha: 0.18 });
      steam.update(dt);
    },
  };
}
