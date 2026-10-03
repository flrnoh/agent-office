import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { TRect } from '../../../shared/therme';
import { mesh, toon } from '../toon';
import { rand, type ThermeParts } from './kit';

/*
 * Planting for the thermal baths (flrnoh fork, see shared/therme.ts): tropical beds under the dome
 * and round the lagoon (ferns, monstera, banana plants, flowering shrubs, ground cover on dark bark
 * over a stone kerb), and planters along the walls. Every leaf is a flattened, tilted blob of one of
 * a few greens, gathered by colour into one mesh each, so a whole bed is a handful of draw calls.
 */

const GREENS = ['#2f7a3a', '#3f8f3e', '#5aa64a', '#24663a'];
const BLOOMS = ['#ff6f91', '#ffd166', '#ff9f43', '#ffffff', '#c77dff'];

export class Planting {
  private by = new Map<string, THREE.BufferGeometry[]>();
  private r: () => number;

  constructor(seed: number) {
    this.r = rand(seed);
  }

  private add(color: string, g: THREE.BufferGeometry) {
    const list = this.by.get(color) ?? [];
    list.push(g.index ? g.toNonIndexed() : g);
    this.by.set(color, list);
  }

  /** A leaf from (x, y, z): `len` long, pointing `yaw` round and `tilt` up (0 flat, 1 straight up). */
  private leaf(x: number, y: number, z: number, len: number, wide: number, yaw: number, tilt: number, color: string) {
    const g = new THREE.SphereGeometry(1, 6, 3);
    g.scale(wide, 0.02 + wide * 0.08, len / 2);
    g.translate(0, 0, len / 2);
    g.rotateX(-tilt * (Math.PI / 2) + 0.1);
    g.rotateY(yaw);
    g.translate(x, y, z);
    this.add(color, g);
  }

  /** A fern: a rosette of long arching fronds. */
  fern(x: number, z: number, s = 1, y = 0) {
    const r = this.r;
    const n = 9;
    const c = GREENS[Math.floor(r() * 2)];
    for (let i = 0; i < n; i++) this.leaf(x, y + 0.08, z, (0.7 + r() * 0.3) * s, 0.14 * s, (i / n) * Math.PI * 2 + r() * 0.3, 0.35 + r() * 0.25, c);
  }

  /** A monstera: big round leaves on long stalks. */
  monstera(x: number, z: number, s = 1, y = 0) {
    const r = this.r;
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + r();
      const h = (0.5 + r() * 0.5) * s;
      const stalk = new THREE.CylinderGeometry(0.015, 0.02, h, 4);
      stalk.translate(x + Math.cos(a) * 0.15 * s, y + h / 2, z + Math.sin(a) * 0.15 * s);
      this.add('#3f7a35', stalk);
      this.leaf(x + Math.cos(a) * 0.15 * s, y + h, z + Math.sin(a) * 0.15 * s, 0.55 * s, 0.3 * s, a + Math.PI / 2, 0.15, i % 2 ? '#24663a' : '#2f7a3a');
    }
  }

  /** A banana plant: a green stem, long broad leaves up and out at the top. */
  banana(x: number, z: number, h = 2.6, y = 0) {
    const r = this.r;
    const stem = new THREE.CylinderGeometry(0.08, 0.12, h, 6);
    stem.translate(x, y + h / 2, z);
    this.add('#6f8f3a', stem);
    for (let i = 0; i < 7; i++) this.leaf(x, y + h - 0.1, z, 1.3 + r() * 0.5, 0.26, (i / 7) * Math.PI * 2 + r() * 0.4, 0.45 + r() * 0.35, i % 2 ? '#4f9a3e' : '#3f8f3e');
  }

  /** A flowering shrub: a rounded bush, flowers dotted over it. */
  shrub(x: number, z: number, s = 0.7, y = 0) {
    const r = this.r;
    const bush = new THREE.IcosahedronGeometry(s, 1);
    bush.scale(1, 0.75, 1);
    bush.translate(x, y + s * 0.6, z);
    this.add(GREENS[1 + Math.floor(r() * 3)], bush);
    const bloom = BLOOMS[Math.floor(r() * BLOOMS.length)];
    for (let i = 0; i < 9; i++) {
      const a = r() * Math.PI * 2;
      const e = r() * 0.9;
      const f = new THREE.IcosahedronGeometry(0.07 + r() * 0.04, 0);
      f.translate(x + Math.cos(a) * s * Math.cos(e) * 0.95, y + s * 0.6 + Math.sin(e) * s * 0.72, z + Math.sin(a) * s * Math.cos(e) * 0.95);
      this.add(bloom, f);
    }
  }

  /** A bed over `rect`: dark bark, a low stone kerb round it, plants scattered in it. */
  bed(rect: TRect, density = 1, kerb = true) {
    const r = this.r;
    const w = rect.maxX - rect.minX;
    const d = rect.maxZ - rect.minZ;
    const soil = new THREE.BoxGeometry(w, 0.08, d);
    soil.translate((rect.minX + rect.maxX) / 2, 0.04, (rect.minZ + rect.maxZ) / 2);
    this.add('#4a3426', soil);
    if (kerb)
      for (const [kx, kz, kw, kd] of [
        [(rect.minX + rect.maxX) / 2, rect.minZ, w + 0.24, 0.12],
        [(rect.minX + rect.maxX) / 2, rect.maxZ, w + 0.24, 0.12],
        [rect.minX, (rect.minZ + rect.maxZ) / 2, 0.12, d],
        [rect.maxX, (rect.minZ + rect.maxZ) / 2, 0.12, d],
      ] as const) {
        const k = new THREE.BoxGeometry(kw, 0.22, kd);
        k.translate(kx, 0.11, kz);
        this.add('#cdb995', k);
      }
    const n = Math.max(2, Math.round(w * d * 0.55 * density));
    for (let i = 0; i < n; i++) {
      const x = rect.minX + 0.35 + r() * Math.max(0.01, w - 0.7);
      const z = rect.minZ + 0.35 + r() * Math.max(0.01, d - 0.7);
      const k = r();
      if (k < 0.32) this.fern(x, z, 0.8 + r() * 0.5);
      else if (k < 0.55) this.monstera(x, z, 0.8 + r() * 0.5);
      else if (k < 0.72) this.shrub(x, z, 0.45 + r() * 0.35);
      else if (k < 0.82 && w > 1.6 && d > 1.6) this.banana(x, z, 2 + r() * 1.4);
      else this.fern(x, z, 0.6);
    }
  }

  /** A planter: a box of pale stone, a shrub or a banana in it. */
  planter(x: number, z: number, w = 1.2, d = 0.6, tall = false) {
    const box = new THREE.BoxGeometry(w, 0.6, d);
    box.translate(x, 0.3, z);
    this.add('#d8c9ad', box);
    if (tall) this.banana(x, z, 2.2, 0.6);
    else {
      this.monstera(x - w * 0.22, z, 0.8, 0.6);
      this.fern(x + w * 0.22, z, 0.8, 0.6);
    }
  }

  /** Everything planted so far, into `p.still` (one mesh a colour). */
  done(p: ThermeParts) {
    for (const [color, geos] of this.by) {
      const m = mesh(mergeGeometries(geos)!, toon(color), 0, 0, 0, false);
      for (const g of geos) g.dispose();
      p.still.add(m);
    }
    this.by.clear();
  }
}
