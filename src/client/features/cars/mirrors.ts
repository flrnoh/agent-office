import * as THREE from 'three';
import type { CarView } from './world';

// flrnoh fork: wing mirrors that work (the Bulli's; see world/bulli.ts). While you're sitting in a car
// that has them, what's behind it is drawn small into a picture for each glass, one mirror a frame,
// from a camera out at the mirror looking back along the car's side. Everyone else's stay dull grey.

/** How sharp each mirror's picture is (pixels, square), and how wide it sees (degrees). */
const SIZE = 192;
const FOV = 30;
/** How far each looks out from straight back (radians), the way they're set to see past the van's side, and down. */
const TOE = 0.12;
const DIP = 0.05;

const DULL = new THREE.Color('#8e9aa8');

interface Glass {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  target: THREE.WebGLRenderTarget;
}

export class Mirrors {
  private glass: Glass[] = [];
  /** The car whose mirrors are live, or null. */
  private car: CarView | null = null;
  private next = 0;
  private readonly cam = new THREE.PerspectiveCamera(FOV, 1, 0.3, 600);
  private readonly at = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private readonly turn = new THREE.Quaternion();

  constructor(
    private renderer: THREE.WebGLRenderer,
    private scene: THREE.Scene,
  ) {}

  /** Each frame: `car` is the one you're sitting in (null when you aren't), its mirrors drawn if it has any. */
  update(car: CarView | null) {
    const live = car?.mirrors?.length && car.root.visible ? car : null;
    if (live !== this.car) this.switchTo(live);
    if (!live || !this.glass.length) return;
    // One mirror a frame, in turn: half the cost, and still smooth enough at a glance.
    const g = this.glass[this.next++ % this.glass.length];
    this.draw(g);
  }

  private switchTo(car: CarView | null) {
    for (const g of this.glass) {
      g.mesh.material.map = null;
      g.mesh.material.color.copy(DULL);
      g.mesh.material.needsUpdate = true;
      g.target.dispose();
    }
    this.glass = [];
    this.car = car;
    for (const mesh of car?.mirrors ?? []) {
      const target = new THREE.WebGLRenderTarget(SIZE, SIZE, { samples: 2 });
      target.texture.colorSpace = THREE.SRGBColorSpace;
      const m = mesh as Glass['mesh'];
      m.material.map = target.texture;
      m.material.color.set('#ffffff');
      m.material.needsUpdate = true;
      this.glass.push({ mesh: m, target });
    }
  }

  private draw(g: Glass) {
    const side = (g.mesh.userData.side as number) ?? 1;
    g.mesh.updateWorldMatrix(true, false);
    g.mesh.getWorldPosition(this.at);
    g.mesh.getWorldQuaternion(this.turn);
    // Back along the car (its -z), a little out to its side (+x is its left) and a little down.
    this.look.set(side * Math.sin(TOE), -Math.sin(DIP), -1).normalize().applyQuaternion(this.turn).add(this.at);
    this.cam.position.copy(this.at);
    this.cam.up.set(0, 1, 0);
    this.cam.lookAt(this.look);
    this.cam.updateMatrixWorld();
    // Not its own glass in its own picture (that's a feedback loop WebGL won't draw), and the shadows
    // as the screen last drew them, not worked out again for a picture this small.
    const shown = this.glass.map((x) => x.mesh.visible);
    for (const x of this.glass) x.mesh.visible = false;
    const was = this.renderer.getRenderTarget();
    const shadows = this.renderer.shadowMap.autoUpdate;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.setRenderTarget(g.target);
    this.renderer.render(this.scene, this.cam);
    this.renderer.setRenderTarget(was);
    this.renderer.shadowMap.autoUpdate = shadows;
    this.glass.forEach((x, i) => (x.mesh.visible = shown[i]));
  }
}
