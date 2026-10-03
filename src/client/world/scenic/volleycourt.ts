import * as THREE from 'three';
import { VOLLEY, npcBench } from '../../../shared/volley';
import { tilingCanvasTexture } from '../texture';
import { mesh, textPlane, toon } from '../toon';
import type { ScenicKit } from './kit';
import { G, box } from './kit';

// The beach volleyball court on Sunset Beach (flrnoh fork, see FORK.md "A day at the beach"; the game
// is shared/volley.ts, played by features/beach/volley.ts): the blue lines in the sand, the posts, the net
// with its two antennas, the referee's chair by the net, and a bench along the far sideline where
// the computer team waits while people play. The scoreboard is the feature's: its numbers change.

const C = VOLLEY;

/** The net's mesh: a dark grid, drawn once, repeated along it. */
function netTexture(): THREE.CanvasTexture {
  const t = tilingCanvasTexture(32, 32, (g) => {
    g.clearRect(0, 0, 32, 32);
    g.strokeStyle = 'rgba(25,28,38,0.9)';
    g.lineWidth = 3;
    g.strokeRect(1.5, 1.5, 29, 29);
  });
  return t;
}

export function buildVolleyCourt(kit: ScenicKit) {
  const { root, parts, labels, colliders, taken, around } = kit;
  const b = parts.beach;
  const blue = toon('#1d3fbb');
  const white = toon('#f8f9fa');
  const yellow = toon('#ffd166');
  const wood = toon('#b08968');
  // The lines: blue bands pinned into the sand (lines are in, see inCourt).
  const LW = 0.07;
  for (const s of [-1, 1]) {
    b.add(mesh(box(LW, 0.02, C.halfL * 2 + LW), blue, C.x + s * C.halfW, G + 0.012, C.z, false));
    b.add(mesh(box(C.halfW * 2 + LW, 0.02, LW), blue, C.x, G + 0.012, C.z + s * C.halfL, false));
  }
  // The posts, padded, a little out past each sideline, and their guy ropes' pegs.
  const postX = C.halfW + C.netOver;
  for (const s of [-1, 1]) {
    const x = C.x + s * postX;
    b.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, C.net + 0.35, 8), toon('#adb5bd'), x, G + (C.net + 0.35) / 2, C.z));
    b.add(mesh(new THREE.CylinderGeometry(0.13, 0.13, 1.6, 10), yellow, x, G + 0.8, C.z));
    colliders.push({ minX: x - 0.15, maxX: x + 0.15, minZ: C.z - 0.15, maxZ: C.z + 0.15, bottom: G, top: G + C.net + 0.3 });
    const rope = new THREE.Vector3(x + s * 1.6, G, C.z);
    const top = new THREE.Vector3(x, G + C.net + 0.2, C.z);
    const len = rope.distanceTo(top);
    const r = mesh(new THREE.CylinderGeometry(0.012, 0.012, len, 4), white, (rope.x + top.x) / 2, (rope.y + top.y) / 2, C.z, false);
    r.rotation.z = Math.atan2(rope.x - top.x, top.y - rope.y);
    b.add(r);
    b.add(mesh(box(0.08, 0.12, 0.08), wood, rope.x, G + 0.04, C.z, false));
  }
  // The net: its top and bottom bands, the mesh between (not merged: it has a texture), and the antennas over the sidelines.
  const span = postX * 2;
  b.add(mesh(box(span, 0.07, 0.03), white, C.x, G + C.net - 0.035, C.z));
  b.add(mesh(box(span, 0.05, 0.03), white, C.x, G + C.net - 1.0, C.z, false));
  const tex = netTexture();
  tex.repeat.set(span / 0.1, 0.95 / 0.1);
  const net = new THREE.Mesh(new THREE.PlaneGeometry(span, 0.95), new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
  net.position.set(C.x, G + C.net - 0.52, C.z);
  net.material.userData.outlineParameters = { visible: false };
  root.add(net);
  around(net, C.x, C.z, span / 2 + 1, 4);
  for (const s of [-1, 1]) {
    const x = C.x + s * C.halfW;
    for (let k = 0; k < 9; k++) b.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.2, 5), k % 2 ? white : toon('#e63946'), x, G + C.net - 0.9 + k * 0.2, C.z + 0.03, false));
  }
  // The referee's chair by the net, on the road side.
  {
    const x = C.x + postX + 0.9;
    const z = C.z;
    for (const [dx, dz] of [
      [-0.35, -0.35],
      [0.35, -0.35],
      [-0.35, 0.35],
      [0.35, 0.35],
    ])
      b.add(mesh(box(0.07, 1.7, 0.07), white, x + dx, G + 0.85, z + dz));
    b.add(mesh(box(0.85, 0.08, 0.85), wood, x, G + 1.7, z));
    b.add(mesh(box(0.08, 0.6, 0.85), wood, x + 0.4, G + 2.0, z));
    for (let y = 0.3; y < 1.6; y += 0.35) b.add(mesh(box(0.06, 0.05, 0.7), white, x + 0.42, G + y, z, false));
    colliders.push({ minX: x - 0.45, maxX: x + 0.45, minZ: z - 0.45, maxZ: z + 0.45, bottom: G, top: G + 1.75 });
  }
  // A bench along the sea-side sideline for the computer team, a cooler and their towels.
  {
    const first = npcBench(0);
    const last = npcBench(3);
    const x = first.x - 0.9;
    const z0 = first.z - 0.8;
    const z1 = last.z + 0.8;
    b.add(mesh(box(0.45, 0.06, z1 - z0), wood, x, G + 0.45, (z0 + z1) / 2));
    for (const z of [z0 + 0.3, (z0 + z1) / 2, z1 - 0.3]) b.add(mesh(box(0.4, 0.45, 0.07), wood, x, G + 0.22, z, false));
    colliders.push({ minX: x - 0.25, maxX: x + 0.25, minZ: z0, maxZ: z1, bottom: G, top: G + 0.48 });
    b.add(mesh(box(0.6, 0.42, 0.4), toon('#06d6a0'), x, G + 0.21, z1 + 0.8));
    b.add(mesh(box(0.62, 0.06, 0.42), white, x, G + 0.44, z1 + 0.8, false));
    ['#ef476f', '#118ab2', '#ffd166'].forEach((c, i) => b.add(mesh(box(0.9, 0.02, 1.8), toon(c), x - 1.5, G + 0.01, z0 + 1.2 + i * 2.2, false)));
  }
  // A sign at the court: who may play.
  const sign = textPlane('🏐 Beachvolleyball · Mitspielen erwünscht!', { color: '#ffffff', bg: '#1d3fbb', border: '#ffd166', size: 40 });
  sign.scale.setScalar(0.9);
  const sx = C.x + C.halfW + 4.5;
  const sz = C.z - C.halfL - 3;
  b.add(mesh(box(0.08, 2.1, 0.08), toon('#3d405b'), sx, G + 1.05, sz));
  sign.position.set(sx, G + 2.3, sz);
  sign.rotation.y = Math.PI / 2;
  labels.add(sign);
  // Nothing else goes on the court or round it.
  for (const dz of [-6, 0, 6]) taken.push({ x: C.x, z: C.z + dz, r: 8 });
}
