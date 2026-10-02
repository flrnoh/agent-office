/*
 * flrnoh fork (see FORK.md "Hörkreise"): a Hörkreis drawn on the floor: a thin bright edge and a
 * faint fill, in the speaker's colour. The edge keeps its width whatever the circle's size, so its
 * geometry is made again when the size changes (rarely: a key press, a message).
 */
import * as THREE from 'three';

/** The edge's width (m). */
const EDGE = 0.1;
/** Just above the floor, so it doesn't flicker into it. */
const LIFT = 0.035;

export class Ring {
  readonly root = new THREE.Group();
  private readonly edge: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private readonly fill: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  private radius = 0;
  /** How much it shows now (0–1), easing towards `target`. */
  private shown = 0;
  private target = 0;
  private strong = 1;

  constructor(color: string) {
    const mat = (opacity: number) =>
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, fog: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.edge = new THREE.Mesh(new THREE.RingGeometry(1 - EDGE, 1, 8), mat(0));
    this.fill = new THREE.Mesh(new THREE.CircleGeometry(1, 8), mat(0));
    for (const m of [this.fill, this.edge]) {
      m.rotation.x = -Math.PI / 2;
      m.renderOrder = 2;
      // Nobody uses the floor through it.
      m.raycast = () => {};
      this.root.add(m);
    }
    this.root.name = 'voice-ring';
    this.root.visible = false;
  }

  setRadius(r: number) {
    if (Math.abs(r - this.radius) < 0.01) return;
    this.radius = r;
    const segs = Math.round(Math.min(160, Math.max(40, r * 8)));
    this.edge.geometry.dispose();
    this.edge.geometry = new THREE.RingGeometry(Math.max(0.01, r - EDGE), r, segs);
    this.fill.geometry.dispose();
    this.fill.geometry = new THREE.CircleGeometry(Math.max(0.01, r - EDGE), segs);
  }

  setColor(color: string) {
    this.edge.material.color.set(color);
    this.fill.material.color.set(color);
  }

  /** Show it (`strong`: you're in it or it's yours) or let it fade. */
  want(on: boolean, strong = true) {
    this.target = on ? 1 : 0;
    this.strong = strong ? 1 : 0.45;
  }

  place(x: number, y: number, z: number) {
    this.root.position.set(x, y + LIFT, z);
  }

  /** Eases in quick and out slowly, so a pause between words doesn't blink it. */
  update(dt: number) {
    const rate = this.target > this.shown ? 8 : 1.6;
    this.shown += (this.target - this.shown) * Math.min(1, dt * rate);
    if (this.shown < 0.01 && this.target === 0) this.shown = 0;
    this.root.visible = this.shown > 0;
    this.edge.material.opacity = 0.75 * this.shown * this.strong;
    this.fill.material.opacity = 0.07 * this.shown * this.strong;
  }

  dispose() {
    this.root.removeFromParent();
    this.edge.geometry.dispose();
    this.fill.geometry.dispose();
    this.edge.material.dispose();
    this.fill.material.dispose();
  }
}
