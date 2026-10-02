import * as THREE from 'three';
import { CAR } from '../../../shared/garage';
import type { CarView } from '../cars/world';

// A car fresh out of the wash (flrnoh fork, see FORK.md "The petrol station"): its paint goes from the
// office's flat cartoon colour to a deep glossy one with a bright highlight, and little glints twinkle
// over it, for everyone on the floor, until the shine wears off (the office says which cars, and how
// long: shared/tankstelle-play.ts SHINE_MS).

/** A four-pointed glint, for the sparkles. */
function glintTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 10);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = 'rgba(255,255,255,0.95)';
  for (const [w, h] of [
    [3, 60],
    [60, 3],
  ]) {
    g.beginPath();
    g.ellipse(32, 32, w / 2, h / 2, 0, 0, Math.PI * 2);
    g.fill();
  }
  return new THREE.CanvasTexture(c);
}

interface Shiny {
  swaps: { mesh: THREE.Mesh; was: THREE.Material | THREE.Material[] }[];
  /** Two sets of glints, twinkling in turn. */
  glints: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>[];
}

export class Gloss {
  private shiny = new Map<number, Shiny>();
  private readonly glint = glintTexture();
  private readonly paints = new Map<string, THREE.MeshPhongMaterial>();

  /** The glossy version of `color`. */
  private paint(color: THREE.Color): THREE.MeshPhongMaterial {
    const k = color.getHexString();
    let m = this.paints.get(k);
    if (!m) {
      m = new THREE.MeshPhongMaterial({ color: color.clone().multiplyScalar(1.1), specular: '#ffffff', shininess: 36, emissive: color.clone().multiplyScalar(0.22) });
      this.paints.set(k, m);
    }
    return m;
  }

  /** Whether car `i` is shiny now. */
  has(i: number): boolean {
    return this.shiny.has(i);
  }

  /** Makes the cars in `on` shiny (and no others), and twinkles their glints. */
  update(cars: readonly CarView[], on: ReadonlySet<number>, t: number) {
    for (const [i, s] of this.shiny) {
      if (on.has(i)) continue;
      for (const w of s.swaps) w.mesh.material = w.was;
      for (const g of s.glints) {
        g.removeFromParent();
        g.geometry.dispose();
        g.material.dispose();
      }
      this.shiny.delete(i);
    }
    for (const i of on) {
      const v = cars[i];
      if (!v) continue;
      let s = this.shiny.get(i);
      if (!s) this.shiny.set(i, (s = this.shine(v)));
      // The glints come and go, one set as the other fades.
      s.glints.forEach((g, k) => {
        const w = 0.5 + 0.5 * Math.sin(t * 4.2 + k * Math.PI + i);
        g.material.opacity = w;
        g.material.size = 0.2 + 0.32 * w;
      });
    }
  }

  /** Swaps car `v`'s paint for the glossy one and scatters glints over it. */
  private shine(v: CarView): Shiny {
    const target = new THREE.Color(v.def.color);
    const swaps: Shiny['swaps'] = [];
    v.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || Array.isArray(m.material)) return;
      const mat = m.material as THREE.MeshToonMaterial;
      if (!mat.color || mat.transparent || mat.color.getHex() !== target.getHex()) return;
      swaps.push({ mesh: m, was: mat });
      m.material = this.paint(mat.color);
    });
    const glints = [0, 1].map(() => {
      const pos: number[] = [];
      for (let k = 0; k < 10; k++) pos.push((Math.random() - 0.5) * CAR.width * 1.02, 0.55 + Math.random() * 0.6, (Math.random() - 0.5) * CAR.length * 0.95);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      const mat = new THREE.PointsMaterial({ map: this.glint, size: 0.3, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: '#ffffff' });
      const g = new THREE.Points(geo, mat);
      g.raycast = () => {};
      v.root.add(g);
      return g;
    });
    return { swaps, glints };
  }
}
