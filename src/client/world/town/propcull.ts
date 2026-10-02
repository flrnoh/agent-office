import * as THREE from 'three';

// flrnoh fork (see FORK.md): small things far off aren't drawn. The landmarks and halls round the
// office (the cinema's seats, the DIY store's trolleys and racks of goods, the petrol station's
// pumps) are made of many small parts, each its own draw call; from the office, a hundred metres
// off, you can't tell one from another anyway. So every few frames each part of what's out there is
// weighed by how big it is against how far it is from the camera, and what would be a speck isn't
// drawn: it's moved to a layer the camera doesn't see (its own `visible` stays its owner's to set).

/** The layer culled things go on: not the camera's (0), nor anything else's in the office. */
const CULLED = 7;
/** A part is drawn while it's within this many of its own radii of the camera, plus SLACK metres. */
const RADII = 40;
const SLACK = 25;
/** Coming back needs a little nearer than going, so a part at the edge doesn't flicker. */
const HYSTERESIS = 0.9;
/** A group with more children than this, and bigger than BIG metres across, is weighed part by part. */
const MANY = 6;
const BIG = 6;

interface Part {
  obj: THREE.Object3D;
  /** Its bounding sphere in its own frame, so a part that moves (a trolley) is weighed where it is. */
  center: THREE.Vector3;
  radius: number;
  culled: boolean;
}

const box = new THREE.Box3();
const sphere = new THREE.Sphere();
const at = new THREE.Vector3();

/** Sets `obj` and everything under it on the culled layer, or back on the camera's. */
function setCulled(obj: THREE.Object3D, culled: boolean) {
  obj.traverse((o) => {
    if (culled) o.layers.set(CULLED);
    else o.layers.set(0);
  });
}

export class PropCull {
  private parts: Part[] = [];
  private next = 0;

  /** Weighs the parts of each of `roots` from now on (their children, and big crowded groups' children). */
  add(...roots: THREE.Object3D[]) {
    for (const root of roots) {
      root.updateMatrixWorld(true);
      for (const child of root.children) this.take(child, 0);
    }
  }

  private take(obj: THREE.Object3D, depth: number) {
    box.setFromObject(obj);
    if (box.isEmpty()) return;
    box.getBoundingSphere(sphere);
    if (obj.children.length > MANY && sphere.radius > BIG && depth < 2) {
      for (const c of obj.children) this.take(c, depth + 1);
      return;
    }
    // Its sphere in its own frame: where it is is worked out from its matrix each time.
    const inv = new THREE.Matrix4().copy(obj.matrixWorld).invert();
    const scale = obj.matrixWorld.getMaxScaleOnAxis() || 1;
    this.parts.push({ obj, center: sphere.center.clone().applyMatrix4(inv), radius: sphere.radius / scale, culled: false });
  }

  /** Weighs a share of the parts against where `camera` is: all of them every `every` calls. */
  update(camera: THREE.Camera, every = 4) {
    const n = this.parts.length;
    if (!n) return;
    const per = Math.ceil(n / every);
    for (let k = 0; k < per; k++) {
      const p = this.parts[(this.next + k) % n];
      at.copy(p.center).applyMatrix4(p.obj.matrixWorld);
      const r = p.radius * p.obj.matrixWorld.getMaxScaleOnAxis();
      const reach = r * RADII + SLACK;
      const d = at.distanceTo(camera.position);
      const cull = p.culled ? d > reach * HYSTERESIS : d > reach;
      if (cull !== p.culled) {
        p.culled = cull;
        setCulled(p.obj, cull);
      }
    }
    this.next = (this.next + per) % n;
  }

  /** How many parts are weighed, and how many aren't drawn just now. */
  stats(): { parts: number; culled: number } {
    return { parts: this.parts.length, culled: this.parts.filter((p) => p.culled).length };
  }
}
