import * as THREE from 'three';
import { mergeByColor, mergeByMaterial, mesh, roundedBox, toon } from '../../world/toon';

/*
 * The rehearsal wing's furniture and bits (flrnoh fork, see FORK.md "The rehearsal wing"): sofas,
 * fridges, PA tops on stands, the mixer table, lava lamps, fairy lights, rugs, posters, amps, plants,
 * crates, a broken guitar. Each is built round its own middle on the floor, its front to +z.
 */

export const box = (w: number, h: number, d: number, color: THREE.ColorRepresentation, x = 0, y = 0, z = 0) => mesh(new THREE.BoxGeometry(w, h, d), toon(color), x, y + h / 2, z);
export const rbox = (w: number, h: number, d: number, color: THREE.ColorRepresentation, r = 0.05, x = 0, y = 0, z = 0) => mesh(roundedBox(w, h, d, r), toon(color), x, y + h / 2, z);
export const cyl = (rt: number, rb: number, h: number, color: THREE.ColorRepresentation, x = 0, y = 0, z = 0, seg = 14) => mesh(new THREE.CylinderGeometry(rt, rb, h, seg), toon(color), x, y + h / 2, z);

/** Something that glows (no light of its own): unlit, its colour as it is. */
export function glow(color: THREE.ColorRepresentation, opacity = 1): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
}

/** A flat picture (a poster, a sign) `w` × `h`, facing +z. */
export function picture(tex: THREE.Texture, w: number, h: number, lit = false): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), lit ? new THREE.MeshBasicMaterial({ map: tex, transparent: true }) : new THREE.MeshToonMaterial({ map: tex, transparent: true, alphaTest: 0.02 }));
  m.receiveShadow = true;
  return m;
}

/**
 * The static bits of `root` made cheap to draw: every plain toon mesh merged into one (mergeByColor),
 * the untextured rest (glows, glass) merged by material, anything textured kept as it is.
 */
export function bake(root: THREE.Object3D): THREE.Group {
  root.updateMatrixWorld(true);
  const plain = new THREE.Group();
  const rich: THREE.Mesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mat = m.material as THREE.Material;
    const isPlain = mat instanceof THREE.MeshToonMaterial && !mat.map && !mat.transparent && mat.emissive.getHex() === 0;
    const copy = new THREE.Mesh(m.geometry, mat);
    copy.applyMatrix4(m.matrixWorld);
    copy.castShadow = m.castShadow;
    copy.receiveShadow = m.receiveShadow;
    if (isPlain) plain.add(copy);
    else rich.push(copy);
  });
  const out = plain.children.length ? mergeByColor(plain) : new THREE.Group();
  const flat = new THREE.Group();
  for (const m of rich) {
    const mat = m.material as THREE.Material & { map?: THREE.Texture | null };
    if (!mat.map && !(m as THREE.Mesh & { isInstancedMesh?: boolean }).isInstancedMesh && m.geometry.attributes.position) flat.add(m);
    else out.add(m);
  }
  if (flat.children.length) out.add(...mergeByMaterial(flat).children);
  return out;
}

/** A sofa `w` wide in `color`, a throw over one arm in `throwColor`. */
export function sofa(w: number, color: string, throwColor?: string): THREE.Group {
  const g = new THREE.Group();
  const dark = `#${new THREE.Color(color).multiplyScalar(0.7).getHexString()}`;
  g.add(rbox(w, 0.24, 0.86, dark, 0.06, 0, 0.08));
  for (let i = 0; i < 3; i++) g.add(rbox((w - 0.4) / 3 - 0.02, 0.16, 0.66, color, 0.07, -w / 2 + 0.2 + ((w - 0.4) / 3) * (i + 0.5), 0.3, 0.06));
  g.add(rbox(w, 0.5, 0.22, color, 0.08, 0, 0.3, -0.33));
  for (const s of [-1, 1]) g.add(rbox(0.2, 0.36, 0.86, dark, 0.07, s * (w / 2 - 0.1), 0.24));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(0.03, 0.03, 0.08, '#2b2b2b', sx * (w / 2 - 0.08), 0, sz * 0.36));
  if (throwColor) {
    const t = rbox(0.5, 0.04, 0.9, throwColor, 0.02, -w / 2 + 0.25, 0.57, 0.02);
    t.rotation.z = 0.08;
    g.add(t);
    g.add(rbox(0.36, 0.12, 0.3, throwColor, 0.06, w / 2 - 0.45, 0.48, -0.12));
  }
  return g;
}

/** A fridge `h` tall with a beer brand's sticker and bottles on top. */
export function fridge(w: number, h: number, d: number, color = '#e9edf0'): THREE.Group {
  const g = new THREE.Group();
  g.add(rbox(w, h, d, color, 0.04));
  g.add(box(w * 0.92, 0.01, 0.01, '#9aa0a6', 0, h * 0.68, d / 2 + 0.005));
  g.add(box(0.03, h * 0.3, 0.04, '#b0b5ba', w / 2 - 0.08, h * 0.32, d / 2 + 0.02));
  g.add(box(0.03, h * 0.12, 0.04, '#b0b5ba', w / 2 - 0.08, h * 0.78, d / 2 + 0.02));
  g.add(box(w * 0.5, 0.12, 0.005, '#c8102e', -0.04, h * 0.5, d / 2 + 0.003));
  for (let i = 0; i < 3; i++) g.add(bottle('#6b3d12', -w / 2 + 0.12 + i * 0.12, h, 0));
  return g;
}

/** A beer bottle standing at (x, y, z). */
export function bottle(color: string, x: number, y: number, z: number): THREE.Group {
  const g = new THREE.Group();
  g.add(cyl(0.032, 0.032, 0.16, color, 0, 0, 0, 8));
  g.add(cyl(0.012, 0.03, 0.07, color, 0, 0.16, 0, 8));
  g.add(cyl(0.013, 0.013, 0.01, '#d9b44a', 0, 0.23, 0, 8));
  g.position.set(x, y, z);
  return g;
}

/** A PA top on a tripod stand, its top at `h`, turned towards the room by its group's rotation. */
export function paTop(h = 1.9): THREE.Group {
  const g = new THREE.Group();
  g.add(cyl(0.02, 0.02, h - 0.55, '#1c1c1c', 0, 0.12));
  for (let i = 0; i < 3; i++) {
    const leg = box(0.025, 0.025, 0.55, '#1c1c1c', 0, 0, 0);
    leg.position.set(Math.cos((i * Math.PI * 2) / 3) * 0.22, 0.12, Math.sin((i * Math.PI * 2) / 3) * 0.22);
    leg.rotation.y = -(i * Math.PI * 2) / 3 + Math.PI / 2;
    leg.rotation.x = 0.5;
    g.add(leg);
  }
  const top = rbox(0.42, 0.62, 0.36, '#202124', 0.04, 0, h - 0.62);
  g.add(top);
  g.add(box(0.38, 0.58, 0.01, '#3a3b3f', 0, h - 0.6, 0.185));
  const woofer = mesh(new THREE.CircleGeometry(0.14, 20), toon('#111'), 0, h - 0.42, 0.192);
  const horn = mesh(new THREE.PlaneGeometry(0.22, 0.1), toon('#0d0d0d'), 0, h - 0.13, 0.192);
  g.add(woofer, horn);
  return g;
}

/** A combo amp (the lobby's side table, the studio's spare). */
export function comboAmp(w = 0.55, h = 0.62, d = 0.3, tolex = '#1d1d1d', grille = '#bfa98a'): THREE.Group {
  const g = new THREE.Group();
  g.add(rbox(w, h, d, tolex, 0.03));
  g.add(box(w - 0.06, h * 0.62, 0.01, grille, 0, 0.04, d / 2 + 0.004));
  g.add(box(w - 0.06, 0.08, 0.01, '#2e2e2e', 0, h - 0.13, d / 2 + 0.004));
  for (let i = 0; i < 6; i++) g.add(cyl(0.012, 0.012, 0.02, '#e5e5e5', -w / 2 + 0.1 + i * 0.07, h - 0.1, d / 2 + 0.01, 8).rotateX(Math.PI / 2));
  g.add(box(0.12, 0.02, 0.02, '#c9c9c9', 0, h, 0));
  return g;
}

/** A lava lamp: a gold cone, a glass full of `color`, blobs that rise and fall (update). */
export function lavaLamp(color: string): { group: THREE.Group; update(t: number): void; recolor(color: string): void } {
  const g = new THREE.Group();
  g.add(cyl(0.035, 0.07, 0.14, '#c9a227', 0, 0, 0, 16));
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.24, 16), new THREE.MeshBasicMaterial({ color: '#ffcf8a', transparent: true, opacity: 0.55, depthWrite: false }));
  glass.position.y = 0.26;
  g.add(glass);
  g.add(cyl(0.02, 0.045, 0.06, '#c9a227', 0, 0.38, 0, 16));
  const blobs: THREE.Mesh[] = [];
  const goo = glow(color);
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.022 + i * 0.006, 10, 8), goo);
    blobs.push(b);
    g.add(b);
  }
  return {
    group: g,
    recolor(c) {
      goo.color.set(c);
    },
    update(t) {
      blobs.forEach((b, i) => {
        const k = (Math.sin(t * (0.25 + i * 0.07) + i * 1.9) + 1) / 2;
        b.position.set(Math.sin(t * 0.3 + i) * 0.012, 0.17 + k * 0.17, Math.cos(t * 0.27 + i) * 0.012);
        b.scale.set(1, 1 + Math.sin(t * 0.8 + i) * 0.25, 1);
      });
    },
  };
}

/**
 * Fairy lights hung along `points` (each span sagging a little), in warm white or `colors` in turn:
 * one instanced mesh, twinkling (update).
 */
export function fairyLights(points: THREE.Vector3[], colors: string[] = ['#ffd27a'], every = 0.16): { group: THREE.Group; update(t: number): void } {
  const spots: THREE.Vector3[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const n = Math.max(1, Math.round(a.distanceTo(b) / every));
    for (let k = 0; k < n; k++) {
      const f = k / n;
      const p = a.clone().lerp(b, f);
      p.y -= Math.sin(f * Math.PI) * 0.12;
      spots.push(p);
    }
  }
  const im = new THREE.InstancedMesh(new THREE.SphereGeometry(0.018, 6, 5), new THREE.MeshBasicMaterial({ color: '#ffffff' }), spots.length);
  const m = new THREE.Matrix4();
  const base = spots.map((_, i) => new THREE.Color(colors[i % colors.length]));
  spots.forEach((p, i) => {
    m.makeTranslation(p.x, p.y, p.z);
    im.setMatrixAt(i, m);
    im.setColorAt(i, base[i]);
  });
  const g = new THREE.Group();
  g.add(im);
  // The wire.
  const wire = new THREE.Line(new THREE.BufferGeometry().setFromPoints(spots), new THREE.LineBasicMaterial({ color: '#2a3b2a' }));
  g.add(wire);
  const c = new THREE.Color();
  let last = -1;
  return {
    group: g,
    update(t) {
      const step = Math.floor(t * 6);
      if (step === last) return;
      last = step;
      for (let i = 0; i < spots.length; i++) {
        const k = 0.65 + 0.35 * Math.sin(t * 2.1 + i * 1.7);
        im.setColorAt(i, c.copy(base[i]).multiplyScalar(k));
      }
      im.instanceColor!.needsUpdate = true;
    },
  };
}

/** A rug `w` × `d` with its texture, lying just over the floor. */
export function rug(tex: THREE.Texture, w: number, d: number, y = 0.006): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshToonMaterial({ map: tex }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = y;
  m.receiveShadow = true;
  return m;
}

/** A standing lamp with a fabric shade, lit (the shade glows). */
export function floorLamp(shade = '#f6d7a7'): THREE.Group {
  const g = new THREE.Group();
  g.add(cyl(0.16, 0.18, 0.03, '#2b2b2b'));
  g.add(cyl(0.012, 0.012, 1.45, '#2b2b2b', 0, 0.03));
  const s = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, 0.26, 18, 1, true), new THREE.MeshBasicMaterial({ color: shade, side: THREE.DoubleSide }));
  s.position.y = 1.5;
  g.add(s);
  return g;
}

/** A potted plant (a rubber tree that's seen some gigs). */
export function plant(): THREE.Group {
  const g = new THREE.Group();
  g.add(cyl(0.17, 0.13, 0.32, '#8a4b2a'));
  g.add(cyl(0.015, 0.015, 0.8, '#5a3a1f', 0, 0.3));
  const leaf = new THREE.SphereGeometry(0.11, 8, 6);
  leaf.scale(1, 0.35, 1.8);
  for (let i = 0; i < 9; i++) {
    const l = mesh(leaf, toon(i % 3 ? '#2f6b3a' : '#3f8a4a'), Math.cos(i * 2.3) * 0.16, 0.55 + (i / 9) * 0.55, Math.sin(i * 2.3) * 0.16);
    l.rotation.set(0.5, i * 2.3, 0.3);
    g.add(l);
  }
  return g;
}

/** A stack of beer crates (empties). */
export function crates(n = 3): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const c = new THREE.Group();
    c.add(box(0.4, 0.3, 0.3, i % 2 ? '#1f5f2b' : '#7a1515'));
    for (let k = 0; k < 4; k++) for (let j = 0; j < 3; j++) c.add(cyl(0.025, 0.025, 0.05, '#4a2a0a', -0.15 + k * 0.1, 0.3, -0.1 + j * 0.1, 6));
    c.position.set((i % 2) * 0.05, i * 0.3, 0);
    c.rotation.y = (i % 3) * 0.08;
    g.add(c);
  }
  return g;
}

/** A flight case with its corners and catches (black, aluminium edges). */
export function flightCase(w: number, h: number, d: number, stencil = '#e8e8e8'): THREE.Group {
  const g = new THREE.Group();
  g.add(box(w, h, d, '#1a1a1a'));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.04, h + 0.01, 0.04, '#b9bec4', sx * (w / 2 - 0.015), 0, sz * (d / 2 - 0.015)));
  g.add(box(w + 0.01, 0.03, d + 0.01, '#b9bec4', 0, h * 0.62));
  g.add(box(w * 0.4, 0.06, 0.005, stencil, 0, h * 0.3, d / 2 + 0.004));
  return g;
}

/** A guitar smashed on stage once, hung on the wall as a trophy: its body cracked, its neck snapped. */
export function brokenGuitar(color = '#b3121b'): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Shape();
  body.moveTo(0, -0.25);
  body.bezierCurveTo(0.22, -0.25, 0.22, -0.02, 0.12, 0.02);
  body.bezierCurveTo(0.2, 0.08, 0.17, 0.22, 0.05, 0.2);
  body.lineTo(-0.02, 0.12);
  body.bezierCurveTo(-0.14, 0.24, -0.22, 0.08, -0.12, 0.02);
  body.bezierCurveTo(-0.24, -0.04, -0.2, -0.25, 0, -0.25);
  const geo = new THREE.ExtrudeGeometry(body, { depth: 0.045, bevelEnabled: false });
  g.add(mesh(geo, toon(color), 0, 0, 0));
  g.add(mesh(new THREE.BoxGeometry(0.08, 0.06, 0.01), toon('#111'), 0, -0.1, 0.05));
  // The crack.
  const crack = mesh(new THREE.BoxGeometry(0.015, 0.22, 0.01), toon('#2b1a10'), 0.06, -0.02, 0.05);
  crack.rotation.z = 0.5;
  g.add(crack);
  // The neck, snapped half way, hanging at an angle by its strings.
  g.add(box(0.05, 0.2, 0.025, '#6b4423', 0, 0.18, 0.012));
  const top = new THREE.Group();
  top.add(box(0.05, 0.24, 0.025, '#6b4423', 0, 0, 0));
  top.add(box(0.07, 0.1, 0.025, '#1a1a1a', 0, 0.24, 0));
  top.position.set(0.04, 0.38, 0.03);
  top.rotation.z = -0.9;
  g.add(top);
  return g;
}

/** A fluorescent tube fixture on the ceiling (the glow is the tube's own). */
export function tubeLight(len = 1.2, color = '#eef6ff'): THREE.Group {
  const g = new THREE.Group();
  g.add(box(len + 0.06, 0.05, 0.16, '#d8dde2', 0, -0.05));
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, len, 8), glow(color));
  tube.rotation.z = Math.PI / 2;
  tube.position.y = -0.075;
  g.add(tube);
  return g;
}

/** `o`, moved to (x, y, z). */
export function placed<T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T {
  o.position.set(x, y, z);
  return o;
}
