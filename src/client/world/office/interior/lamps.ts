import * as THREE from 'three';
import type { LampKind } from '../../../../shared/interiors';
import { mesh, toon } from '../../toon';
import { pendant } from '../props';

// flrnoh fork (see FORK.md, "Each storey its own interior"): the lamps an interior hangs from the
// ceiling over the desk pods and the lounge. Each is like pendant(): its shade at its origin, on a cord
// `cord` meters up to the ceiling. `i` is which of the room's lamps it is, for the ones that vary.

/** Something that glows: no shading, so it reads as lit by day and by night. */
const glow = (color: string) => new THREE.MeshBasicMaterial({ color });

/** A cord, a wire or a rope: too thin for a cartoon outline, which would make it a pole. */
const WIRES = new Map<string, THREE.MeshToonMaterial>();
export function wire(color: string): THREE.MeshToonMaterial {
  let m = WIRES.get(color);
  if (!m) {
    m = toon(color).clone();
    m.userData.outlineParameters = { visible: false };
    WIRES.set(color, m);
  }
  return m;
}

function cordUp(g: THREE.Group, cord: number, from = 0, color = '#2b2d42', r = 0.012) {
  const len = cord - from;
  g.add(mesh(new THREE.CylinderGeometry(r, r, len, 5), wire(color), 0, from + len / 2, 0, false));
  // The rose on the ceiling.
  g.add(mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.04, 12), toon(color), 0, cord - 0.02, 0, false));
}

/** An Edison bulb, its filament glowing amber. */
function edison(y: number): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.SphereGeometry(0.11, 12, 10).scale(1, 1.35, 1), new THREE.MeshBasicMaterial({ color: '#ffcf7a', transparent: true, opacity: 0.85 }), 0, y, 0, false));
  g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.08, 10), toon('#b08d57'), 0, y + 0.17, 0, false));
  return g;
}

/** Three wire cages with Edison bulbs on cords of different lengths. */
function cage(cord: number, i: number): THREE.Group {
  const g = new THREE.Group();
  const black = toon('#1f2126');
  [-0.55, 0, 0.55].forEach((dx, k) => {
    const drop = [0.35, 0, 0.2][(k + i) % 3];
    const one = new THREE.Group();
    one.position.set(dx, -drop, k === 1 ? 0 : (k - 1) * 0.25);
    cordUp(one, cord + drop, 0.2, '#1f2126', 0.008);
    one.add(edison(0));
    for (const y of [-0.17, 0.17]) {
      const ring = mesh(new THREE.TorusGeometry(0.16, 0.012, 4, 16), black, 0, y, 0, false);
      ring.rotation.x = Math.PI / 2;
      one.add(ring);
    }
    for (let b = 0; b < 6; b++) {
      const a = (b / 6) * Math.PI * 2;
      one.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.36, 3), wire('#1f2126'), Math.sin(a) * 0.16, 0, Math.cos(a) * 0.16, false));
    }
    g.add(one);
  });
  return g;
}

/** A big white paper globe. */
function globe(cord: number): THREE.Group {
  const g = new THREE.Group();
  cordUp(g, cord, 0.4, '#f4f1ea', 0.01);
  g.add(mesh(new THREE.SphereGeometry(0.45, 20, 14), toon('#ffffff', { emissive: '#f5e9cf' }), 0, 0, 0, false));
  return g;
}

/** A brass chandelier: a ring of candles on curved arms round a column, crystal drops hanging off it. */
function chandelier(cord: number): THREE.Group {
  const g = new THREE.Group();
  const brass = toon('#c9a24a', { emissive: '#3a2a00' });
  cordUp(g, cord, 0.5, '#8a6d2c', 0.02);
  g.add(mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.6, 10), brass, 0, 0.15, 0, false));
  g.add(mesh(new THREE.SphereGeometry(0.12, 12, 10), brass, 0, -0.2, 0, false));
  const ring = mesh(new THREE.TorusGeometry(0.55, 0.025, 6, 32), brass, 0, -0.05, 0, false);
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  const candle = toon('#fbf6ea');
  const flame = glow('#ffd27a');
  const crystal = new THREE.MeshBasicMaterial({ color: '#e8f4ff', transparent: true, opacity: 0.75 });
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const x = Math.sin(a) * 0.55;
    const z = Math.cos(a) * 0.55;
    g.add(mesh(new THREE.CylinderGeometry(0.06, 0.04, 0.05, 10), brass, x, 0, z, false));
    g.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.16, 8), candle, x, 0.1, z, false));
    g.add(mesh(new THREE.SphereGeometry(0.035, 8, 6).scale(1, 1.6, 1), flame, x, 0.22, z, false));
    // Drops off the ring, between the candles.
    const b = a + Math.PI / 8;
    g.add(mesh(new THREE.OctahedronGeometry(0.045).scale(1, 1.8, 1), crystal, Math.sin(b) * 0.55, -0.16, Math.cos(b) * 0.55, false));
  }
  return g;
}

/** Rattan, seen from inside the dome too (its own: the toon cache's is one-sided). */
let weave: THREE.MeshToonMaterial | undefined;

/** A woven rattan dome. */
function rattan(cord: number): THREE.Group {
  const g = new THREE.Group();
  cordUp(g, cord, 0.3, '#5c4630', 0.012);
  weave ??= Object.assign(toon('#c8a165').clone(), { side: THREE.DoubleSide });
  g.add(mesh(new THREE.SphereGeometry(0.55, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.7, 1), weave, 0, -0.1, 0, false));
  // The weave's rings round it.
  const strand = toon('#a07a45');
  for (const [y, r] of [[0.15, 0.36], [0.05, 0.47], [-0.06, 0.54]]) {
    const ring = mesh(new THREE.TorusGeometry(r, 0.012, 4, 24), strand, 0, y, 0, false);
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
  }
  g.add(mesh(new THREE.SphereGeometry(0.12, 10, 8), glow('#ffe2a8'), 0, -0.12, 0, false));
  return g;
}

/** A seventies mushroom dome, glossy orange, the bulb showing underneath. */
function dome(cord: number, i: number): THREE.Group {
  const g = new THREE.Group();
  cordUp(g, cord, 0.3, '#3b2414', 0.015);
  const color = ['#e07a1f', '#c9a227', '#9c4a1a'][i % 3];
  const shade = mesh(new THREE.SphereGeometry(0.5, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.75, 1), toon(color), 0, -0.05, 0, false);
  g.add(shade);
  const under = mesh(new THREE.CircleGeometry(0.5, 20), glow('#fff1c7'), 0, -0.05, 0, false);
  under.rotation.x = Math.PI / 2;
  g.add(under);
  return g;
}

/** A neon ring on three wires, cyan or magenta. */
function ring(cord: number, i: number): THREE.Group {
  const g = new THREE.Group();
  const color = ['#19e3ff', '#ff3dcb', '#8a5cff'][i % 3];
  const tube = mesh(new THREE.TorusGeometry(0.7, 0.04, 8, 40), glow(color), 0, 0, 0, false);
  tube.rotation.x = Math.PI / 2;
  g.add(tube);
  // A soft halo inside it.
  const halo = mesh(new THREE.TorusGeometry(0.7, 0.11, 8, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, depthWrite: false }), 0, 0, 0, false);
  halo.rotation.x = Math.PI / 2;
  g.add(halo);
  const cable = wire('#3a3f55');
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    const x = Math.sin(a) * 0.7;
    const z = Math.cos(a) * 0.7;
    const len = Math.hypot(cord, 0.7);
    const w = mesh(new THREE.CylinderGeometry(0.005, 0.005, len, 3), cable, x / 2, cord / 2, z / 2, false);
    w.lookAt(new THREE.Vector3(0, cord, 0));
    w.rotateX(Math.PI / 2);
    g.add(w);
  }
  return g;
}

/** A Japanese paper lantern: a ribbed white barrel, dark caps top and bottom. */
function lantern(cord: number): THREE.Group {
  const g = new THREE.Group();
  cordUp(g, cord, 0.42, '#3a2a1e', 0.01);
  g.add(mesh(new THREE.SphereGeometry(0.34, 18, 14).scale(1, 1.25, 1), toon('#fffaf0', { emissive: '#f0dcb0' }), 0, 0, 0, false));
  const wood = toon('#3a2a1e');
  for (const y of [-0.4, 0.4]) g.add(mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.06, 14), wood, 0, y, 0, false));
  const rib = toon('#d9cdb3');
  for (const y of [-0.28, -0.14, 0, 0.14, 0.28]) {
    const r = 0.34 * Math.sqrt(1 - (y / 0.425) ** 2);
    const t = mesh(new THREE.TorusGeometry(r, 0.006, 3, 24), rib, 0, y, 0, false);
    t.rotation.x = Math.PI / 2;
    g.add(t);
  }
  return g;
}

/** Lamp `kind`, its shade at its origin, on a cord `cord` meters up to the ceiling. */
export function lamp(kind: LampKind, cord: number, i: number): THREE.Group {
  switch (kind) {
    case 'cone':
      return pendant(cord);
    case 'cage':
      return cage(cord, i);
    case 'globe':
      return globe(cord);
    case 'chandelier':
      return chandelier(cord);
    case 'rattan':
      return rattan(cord);
    case 'dome':
      return dome(cord, i);
    case 'ring':
      return ring(cord, i);
    case 'lantern':
      return lantern(cord);
  }
}
