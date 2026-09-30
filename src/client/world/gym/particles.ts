import * as THREE from 'three';
import { softDot } from './textures';

/*
 * Soft particles for the gym's spa (flrnoh fork, see FORK.md "Rooms, spa and detail"): the sauna's
 * Aufguss steam and heat shimmer, the steam room's mist, the jacuzzi's bubbles. One THREE.Points per
 * cloud (one draw call), each particle with its own size and fade, recycled from a fixed pool.
 */

let dot: THREE.CanvasTexture | null = null;

const VERT = /* glsl */ `
attribute float size;
attribute float alpha;
varying float vAlpha;
uniform float uScale;
void main() {
  vAlpha = alpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * uScale / max(0.1, -mv.z);
  gl_Position = projectionMatrix * mv;
}
`;
const FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uColor;
varying float vAlpha;
void main() {
  vec4 t = texture2D(uMap, gl_PointCoord);
  if (t.a * vAlpha < 0.01) discard;
  gl_FragColor = vec4(uColor, t.a * vAlpha);
}
`;

export interface EmitOpts {
  /** Where they start, and how far around it (a box's half sizes). */
  at: THREE.Vector3Like;
  spread: THREE.Vector3Like;
  /** Their drift (m/s), and how much each varies. */
  vel: THREE.Vector3Like;
  jitter: number;
  /** Seconds they live, sizes (m) from birth to death, peak opacity. */
  life: number;
  size0: number;
  size1: number;
  alpha: number;
}

/** A cloud of soft round particles in one colour. */
export class Cloud {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private vel: Float32Array;
  private age: Float32Array;
  private life: Float32Array;
  private s0: Float32Array;
  private s1: Float32Array;
  private a0: Float32Array;
  private size: THREE.BufferAttribute;
  private alpha: THREE.BufferAttribute;
  private next = 0;
  private mat: THREE.ShaderMaterial;
  /** Keeps them inside this box (a cabin's walls). */
  bounds: THREE.Box3 | null = null;
  /** Upward pull (m/s²): steam rises. */
  lift = 0.25;
  /** How fast they slow down (per second). */
  drag = 0.6;

  constructor(
    readonly max: number,
    color: THREE.ColorRepresentation,
  ) {
    dot ??= softDot();
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.age = new Float32Array(max).fill(1e9);
    this.life = new Float32Array(max).fill(1);
    this.s0 = new Float32Array(max);
    this.s1 = new Float32Array(max);
    this.a0 = new Float32Array(max);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.size = new THREE.BufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    this.alpha = new THREE.BufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('size', this.size);
    geo.setAttribute('alpha', this.alpha);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: dot }, uColor: { value: new THREE.Color(color) }, uScale: { value: 400 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
    });
    this.mat.userData.outlineParameters = { visible: false };
    // Not something to look at or measure: rays (what you're aiming at) and bounding boxes pass through.
    geo.boundingBox = new THREE.Box3();
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 0);
    this.points = new THREE.Points(geo, this.mat);
    this.points.raycast = () => {};
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
  }

  /** Lets `n` new ones go. */
  emit(n: number, o: EmitOpts) {
    for (let k = 0; k < n; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.max;
      const j = i * 3;
      this.pos[j] = o.at.x + (Math.random() * 2 - 1) * o.spread.x;
      this.pos[j + 1] = o.at.y + (Math.random() * 2 - 1) * o.spread.y;
      this.pos[j + 2] = o.at.z + (Math.random() * 2 - 1) * o.spread.z;
      this.vel[j] = o.vel.x + (Math.random() * 2 - 1) * o.jitter;
      this.vel[j + 1] = o.vel.y + (Math.random() * 2 - 1) * o.jitter;
      this.vel[j + 2] = o.vel.z + (Math.random() * 2 - 1) * o.jitter;
      this.age[i] = 0;
      this.life[i] = o.life * (0.7 + Math.random() * 0.6);
      this.s0[i] = o.size0;
      this.s1[i] = o.size1;
      this.a0[i] = o.alpha;
    }
  }

  update(dt: number) {
    this.mat.uniforms.uScale.value = (window.innerHeight * Math.min(2, window.devicePixelRatio || 1)) / 2;
    const b = this.bounds;
    const damp = Math.exp(-this.drag * dt);
    const size = this.size.array as Float32Array;
    const alpha = this.alpha.array as Float32Array;
    for (let i = 0; i < this.max; i++) {
      const a = (this.age[i] += dt);
      const k = a / this.life[i];
      if (k >= 1) {
        alpha[i] = 0;
        size[i] = 0;
        continue;
      }
      const j = i * 3;
      this.vel[j] *= damp;
      this.vel[j + 2] *= damp;
      this.vel[j + 1] = this.vel[j + 1] * damp + this.lift * dt;
      let x = this.pos[j] + this.vel[j] * dt;
      let y = this.pos[j + 1] + this.vel[j + 1] * dt;
      let z = this.pos[j + 2] + this.vel[j + 2] * dt;
      if (b) {
        if (x < b.min.x || x > b.max.x) (this.vel[j] *= -0.5), (x = THREE.MathUtils.clamp(x, b.min.x, b.max.x));
        if (z < b.min.z || z > b.max.z) (this.vel[j + 2] *= -0.5), (z = THREE.MathUtils.clamp(z, b.min.z, b.max.z));
        if (y > b.max.y) (this.vel[j + 1] = 0), (y = b.max.y), (this.vel[j] += (Math.random() - 0.5) * 0.4), (this.vel[j + 2] += (Math.random() - 0.5) * 0.4);
      }
      this.pos[j] = x;
      this.pos[j + 1] = y;
      this.pos[j + 2] = z;
      size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * k;
      // Fade in fast, out slow.
      alpha[i] = this.a0[i] * Math.min(1, k * 6) * (1 - k) * (1 - k * 0.2);
    }
    (this.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    this.size.needsUpdate = true;
    this.alpha.needsUpdate = true;
  }

  /** How many are alive (for a check). */
  alive(): number {
    let n = 0;
    for (let i = 0; i < this.max; i++) if (this.age[i] < this.life[i]) n++;
    return n;
  }
}
