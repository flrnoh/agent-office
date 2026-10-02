/*
 * flrnoh fork (see FORK.md "Dancing on the roof"): a soft spot of light on the dance floor under
 * everyone dancing on it, in the colour of the track that's on, pulsing with the beat. One flat disc
 * each, made once and kept, so it costs next to nothing.
 */
import * as THREE from 'three';
import { DANCE_FLOOR } from '../../../shared/layout';
import type { DjFrame } from '../../dnb';

/** Just above the floor's tiles (rooftop/world.ts puts them at 0.012). */
const LIFT = 0.03;
const RADIUS = 0.75;

/** A soft round spot: bright in the middle, gone at the edge. */
function spotTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.45, 'rgba(255,255,255,.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export function onDanceFloor(x: number, z: number): boolean {
  return x >= DANCE_FLOOR.minX && x <= DANCE_FLOOR.maxX && z >= DANCE_FLOOR.minZ && z <= DANCE_FLOOR.maxZ;
}

export class Glows {
  readonly group = new THREE.Group();
  private readonly geo = new THREE.CircleGeometry(RADIUS, 24);
  private readonly tex = spotTexture();
  private readonly spots: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly color = new THREE.Color();

  constructor() {
    this.group.name = 'dance-glows';
  }

  /** One spot under each of `at` that's on the dance floor (the rest hidden), lit by `f`. */
  update(at: readonly { x: number; y: number; z: number }[], f: DjFrame, seed: (i: number) => number) {
    let n = 0;
    for (const [i, p] of at.entries()) {
      if (!onDanceFloor(p.x, p.z)) continue;
      const spot = this.spots[n] ?? this.make();
      // Each dancer a little round the colour wheel from the track's, so two side by side aren't one blob.
      this.color.setHSL((f.hue + (seed(i) % 7) * 0.04) % 1, 0.9, 0.6);
      spot.material.color.copy(this.color);
      spot.material.opacity = 0.22 + 0.4 * f.beat * (0.4 + 0.6 * f.energy);
      spot.position.set(p.x, p.y + LIFT, p.z);
      spot.scale.setScalar(1 + 0.12 * f.beat);
      spot.visible = true;
      n++;
    }
    for (let i = n; i < this.spots.length; i++) this.spots[i].visible = false;
  }

  private make() {
    const mat = new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const spot = new THREE.Mesh(this.geo, mat);
    spot.rotation.x = -Math.PI / 2;
    spot.renderOrder = 2;
    spot.raycast = () => {};
    this.group.add(spot);
    this.spots.push(spot);
    return spot;
  }

  hide() {
    for (const s of this.spots) s.visible = false;
  }
}
