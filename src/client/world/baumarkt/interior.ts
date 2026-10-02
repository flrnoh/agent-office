import * as THREE from 'three';
import { AISLES, AISLE_SIGN_Z, CHECKOUTS, GATES, HALL, HALL_H, INSIDE, MIXER, PAINT_COUNTER, PROMO, RACKS, RACK_BAY, RACK_DEEP, RACK_H, SHELVES, TOOL_WALL, type Rack } from '../../../shared/baumarkt';
import { PAINTS, TOOLS } from '../../../shared/baumarkt-play';
import { mulberry32 } from '../../../shared/rng';
import { mergeByMaterial, mesh } from '../toon';
import type { Collider } from '../types';
import { G } from '../town/kit';
import { BLUE, ORANGE, box, glowing, indoor, signPlane, slab, writeSign } from './kit';
import { toolModel } from './models';

// flrnoh fork (see FORK.md "The Baumarkt"): inside the hall: aisles of high-bay racks (blue uprights,
// orange beams) stacked with timber, tiles, pipes and paint pots, cardboard boxes on the top shelves,
// all of it instanced, so the whole lot is a handful of draw calls; the aisle signs hanging from the
// roof, the checkouts, the paint counter with its shaker, and the tool wall.

export interface InteriorParts {
  /** The shaker's clamp with the can in it: shaken while it mixes. */
  shaker: THREE.Group;
  /** The can in the shaker, coloured as it's mixed (hidden when it's empty). */
  shakerCan: THREE.Mesh<THREE.BufferGeometry, THREE.MeshToonMaterial>;
}

const BAY = RACK_BAY;

/** Instances of one shape, each placed and coloured, made into one InstancedMesh. */
class Batch {
  private mats: THREE.Matrix4[] = [];
  private colors: THREE.Color[] = [];
  private readonly q = new THREE.Quaternion();
  private readonly one = new THREE.Vector3(1, 1, 1);

  constructor(private geo: THREE.BufferGeometry) {}

  add(x: number, y: number, z: number, color: string, rotY = 0, scale?: THREE.Vector3) {
    this.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
    this.mats.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), this.q, scale ?? this.one));
    this.colors.push(new THREE.Color(color));
  }

  mesh(): THREE.InstancedMesh {
    const m = new THREE.InstancedMesh(this.geo, glowing(new THREE.MeshToonMaterial({ color: '#ffffff', gradientMap: indoor('#fff').gradientMap })), this.mats.length);
    this.mats.forEach((mat, i) => {
      m.setMatrixAt(i, mat);
      m.setColorAt(i, this.colors[i]);
    });
    m.castShadow = false;
    m.receiveShadow = true;
    m.computeBoundingSphere();
    return m;
  }
}

export function buildInterior(group: THREE.Group, colliders: Collider[]): InteriorParts {
  const r = mulberry32(20261002);
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
  const frame = new THREE.Group();
  const upright = indoor(BLUE);
  const beam = indoor(ORANGE);
  const deck = indoor('#b8bec6');

  // ---- The racks ---------------------------------------------------------------------------
  const boxes = new Batch(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0));
  const pipes = new Batch(new THREE.CylinderGeometry(0.045, 0.045, 2.15, 8).rotateX(Math.PI / 2).translate(0, 0.045, 0));
  const pots = new Batch(new THREE.CylinderGeometry(0.12, 0.11, 0.24, 10).translate(0, 0.12, 0));
  const lids = new Batch(new THREE.CylinderGeometry(0.115, 0.115, 0.02, 10).translate(0, 0.25, 0));
  const woods = ['#deb887', '#d2a679', '#c19a6b', '#e3c08d'];
  const tiles = ['#9e9e9e', '#c2603f', '#e9e4da', '#5c6b73', '#d4c5a9', '#264653'];
  const pipeColors = ['#f1f1f1', '#d8d8d8', '#b87333', '#8d949e'];
  const cardboard = ['#c49a6c', '#b98c5e', '#d1a877'];
  const v = new THREE.Vector3();

  const fill = (rack: Rack) => {
    const bays = Math.round((rack.z1 - rack.z0) / BAY);
    // Uprights on both faces at every bay, beams along each face at each shelf, the decks.
    for (let k = 0; k <= bays; k++) for (const s of [-1, 1]) frame.add(box(0.1, RACK_H, 0.1, upright, rack.x + s * (RACK_DEEP / 2 - 0.05), G, rack.z0 + k * BAY));
    for (const y of SHELVES.slice(1)) {
      for (const s of [-1, 1]) frame.add(box(0.06, 0.12, rack.z1 - rack.z0, beam, rack.x + s * (RACK_DEEP / 2 - 0.05), G + y - 0.12, (rack.z0 + rack.z1) / 2));
      frame.add(box(RACK_DEEP - 0.1, 0.03, rack.z1 - rack.z0, deck, rack.x, G + y, (rack.z0 + rack.z1) / 2, false));
    }
    frame.add(box(0.08, 0.1, rack.z1 - rack.z0, beam, rack.x, G + RACK_H - 0.1, (rack.z0 + rack.z1) / 2));
    for (let k = 0; k < bays; k++) {
      const z = rack.z0 + (k + 0.5) * BAY;
      SHELVES.forEach((y0, level) => {
        const y = G + y0 + 0.03;
        for (const s of [-1, 1]) {
          const x = rack.x + s * 0.34;
          // The top shelf is the stock: cardboard boxes, and the odd shrink-wrapped bundle.
          if (level === SHELVES.length - 1) {
            for (let n = 0; n < 2; n++) if (r() < 0.85) boxes.add(x, y, z + (n - 0.5) * 1.1, pick(cardboard), 0, v.set(0.6, 0.55 + r() * 0.35, 0.95).clone());
            continue;
          }
          switch (rack.goods) {
            case 'timber':
              for (let n = 0; n < 3; n++) boxes.add(x + (n - 1) * 0.2, y, z, pick(woods), 0, v.set(0.17, 0.1 + r() * 0.5, BAY - 0.15).clone());
              break;
            case 'tiles':
              for (let n = 0; n < 3; n++) {
                const c = pick(tiles);
                for (let h = 0; h < 1 + Math.floor(r() * 3); h++) boxes.add(x, y + h * 0.27, z + (n - 1) * 0.72, c, 0, v.set(0.6, 0.25, 0.62).clone());
              }
              break;
            case 'pipes':
              for (let row = 0; row < 3; row++) for (let n = 0; n < 5; n++) pipes.add(x - 0.24 + n * 0.12, y + row * 0.095, z, pipeColors[(n + level + row) % pipeColors.length]);
              break;
            case 'paint':
              for (let row = 0; row < 2; row++)
                for (let n = 0; n < 8; n++) {
                  const c = PAINTS[(n + level * 3 + row + k) % PAINTS.length].color;
                  const px = x + (row - 0.5) * 0.28;
                  const pz = z - 1.03 + n * 0.29;
                  pots.add(px, y, pz, '#e4e7eb');
                  lids.add(px, y, pz, c);
                  // A second can on top now and then.
                  if (r() < 0.4) {
                    pots.add(px, y + 0.26, pz, '#e4e7eb');
                    lids.add(px, y + 0.26, pz, c);
                  }
                }
              break;
          }
        }
      });
    }
    colliders.push({ minX: rack.x - RACK_DEEP / 2, maxX: rack.x + RACK_DEEP / 2, minZ: rack.z0 - 0.05, maxZ: rack.z1 + 0.05, bottom: G, top: G + RACK_H });
  };
  RACKS.forEach(fill);
  group.add(boxes.mesh(), pipes.mesh(), pots.mesh(), lids.mesh());

  // ---- The aisle signs, hanging from the roof on wires ---------------------------------------
  const wire = indoor('#3d405b');
  AISLES.forEach((a, i) => {
    const y = G + HALL_H - 2.1;
    for (const side of [1, -1]) {
      const sign = signPlane(3.2, 0.85, 520, (g, W, H) => {
        g.fillStyle = BLUE;
        g.fillRect(0, 0, W, H);
        g.fillStyle = ORANGE;
        g.fillRect(0, 0, H, H);
        g.fillStyle = '#ffffff';
        g.font = `900 ${H * 0.6}px Nunito, sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(String(i + 1), H / 2, H * 0.55);
        g.font = `800 ${H * 0.36}px Nunito, sans-serif`;
        g.textAlign = 'left';
        g.fillText(`${a.icon} ${a.name}`, H * 1.15, H * 0.55, W - H * 1.25);
      });
      sign.position.set(a.x, y, AISLE_SIGN_Z + side * 0.02);
      if (side < 0) sign.rotation.y = Math.PI;
      group.add(sign);
    }
    for (const s of [-1, 1]) frame.add(mesh(new THREE.CylinderGeometry(0.01, 0.01, 1.7, 4), wire, a.x + s * 1.4, y + 0.42 + 0.85, AISLE_SIGN_Z, false));
  });

  // ---- The checkouts: counters with a belt, a till, a lane light ------------------------------
  const counter = indoor('#4a4e69');
  const belt = indoor('#1d1d1d');
  CHECKOUTS.forEach((c, i) => {
    frame.add(slab(c.minX, c.maxX, c.minZ, c.maxZ, G, G + 0.9, counter));
    frame.add(slab(c.minX + 0.08, c.maxX - 0.08, c.minZ + 0.1, c.maxZ - 0.6, G + 0.9, G + 0.93, belt, false));
    frame.add(box(0.3, 0.25, 0.25, indoor('#e9ecef'), c.maxX - 0.2, G + 0.9, c.maxZ - 0.4));
    frame.add(box(0.05, 0.3, 0.25, indoor('#2b2d42'), c.maxX - 0.05, G + 1.15, c.maxZ - 0.4));
    frame.add(box(0.06, 2.1, 0.06, wire, c.minX + 0.1, G + 0.9, c.minZ + 0.1));
    const lane = signPlane(0.9, 0.5, 220, (g, W, H) => writeSign(g, W, H, `Kasse ${i + 1}`, { bg: ORANGE, fg: '#ffffff' }));
    lane.position.set(c.minX + 0.1, G + 3.1, c.minZ + 0.1);
    lane.rotation.y = 0;
    group.add(lane);
    colliders.push({ ...c, bottom: G, top: G + 0.95 });
  });
  for (const g of GATES) {
    frame.add(slab(g.minX, g.maxX, g.minZ, g.maxZ, G, G + 1.5, indoor('#d9dde3')));
    colliders.push({ ...g, bottom: G, top: G + 1.5 });
  }

  // ---- The paint counter: its shaker, the tint turret and a rack of colour cards ---------------
  const pc = PAINT_COUNTER;
  frame.add(slab(pc.minX, pc.maxX, pc.minZ, pc.maxZ, G, G + 0.95, indoor('#f1f3f5')));
  frame.add(slab(pc.minX - 0.02, pc.maxX, pc.minZ, pc.maxZ, G + 0.95, G + 0.99, indoor(BLUE), false));
  colliders.push({ ...pc, bottom: G, top: G + 1 });
  // The shaker: a grey cabinet on the counter, its clamp and the can inside, behind a window.
  const mx = MIXER;
  // Open to the front (west), so you watch your can shake: its back, its sides, its top.
  const cab = indoor('#6c757d');
  frame.add(box(0.08, 1.0, 0.95, cab, mx.x + 0.41, G + 0.99, mx.z));
  for (const s of [-1, 1]) frame.add(box(0.9, 1.0, 0.06, cab, mx.x, G + 0.99, mx.z + s * 0.445));
  frame.add(box(0.9, 0.06, 0.95, cab, mx.x, G + 0.99, mx.z));
  frame.add(box(0.92, 0.12, 0.97, indoor(ORANGE), mx.x, G + 1.99, mx.z));
  const shaker = new THREE.Group();
  shaker.position.set(mx.x - 0.12, G + 1.18, mx.z);
  shaker.add(box(0.5, 0.04, 0.5, indoor('#343a40'), 0, 0, 0, false), box(0.5, 0.04, 0.5, indoor('#343a40'), 0, 0.42, 0, false));
  const shakerCan = mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.36, 16), glowing(new THREE.MeshToonMaterial({ color: '#ffffff', gradientMap: indoor('#fff').gradientMap })), 0, 0.22, 0, false) as THREE.Mesh<THREE.BufferGeometry, THREE.MeshToonMaterial>;
  shakerCan.visible = false;
  shaker.add(shakerCan);
  group.add(shaker);
  // The tint turret: a ring of canisters in every colour.
  PAINTS.forEach((p, i) => {
    const a = (i / PAINTS.length) * Math.PI * 2;
    frame.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.32, 8), indoor(p.color), pc.minX + 0.45 + Math.cos(a) * 0.25, G + 1.15, pc.minZ + 0.5 + Math.sin(a) * 0.25, false));
  });
  frame.add(mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.05, 16), indoor('#adb5bd'), pc.minX + 0.45, G + 1.0, pc.minZ + 0.5, false));
  const mixSign = signPlane(2.6, 0.7, 420, (g, W, H) => writeSign(g, W, H, '🎨 Farbmischservice', { bg: ORANGE, fg: '#ffffff' }));
  mixSign.position.set(INSIDE.maxX - 0.03, G + 3, (pc.minZ + pc.maxZ) / 2);
  mixSign.rotation.y = -Math.PI / 2;
  group.add(mixSign);
  // Colour cards in a fan on the wall beside it.
  PAINTS.forEach((p, i) => frame.add(box(0.02, 0.5, 0.16, indoor(p.color), INSIDE.maxX - 0.02, G + 1.3, pc.minZ - 1.6 + i * 0.18, false)));

  // ---- The tool wall: a pegboard with drills, screwdrivers, hammers and saws hanging on it ------
  const tw = TOOL_WALL;
  frame.add(slab(tw.x - 0.06, tw.x - 0.02, tw.z0, tw.z1, G + 0.4, G + 3.2, indoor('#c8a97e'), false));
  const hung = new THREE.Group();
  const per = Math.floor((tw.z1 - tw.z0 - 0.6) / 0.65);
  for (let row = 0; row < 3; row++)
    for (let k = 0; k < per; k++) {
      const tool = TOOLS[(k + row) % TOOLS.length];
      const { group: m } = toolModel(tool.id);
      m.scale.setScalar(tool.id === 'chainsaw' ? 1 : 1.5);
      // Facing out of the wall (its business end down the room), hung on its pegs.
      m.rotation.set(0, Math.PI / 2, tool.id === 'hammer' ? 0 : -0.25);
      m.position.set(tw.x - 0.18, G + 0.9 + row * 0.85, tw.z0 + 0.6 + k * 0.65);
      hung.add(m);
    }
  const hungMerged = mergeByMaterial(hung);
  // Lit like the rest of the hall after dark.
  hungMerged.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) m.material = indoor(`#${(m.material as THREE.MeshToonMaterial).color.getHexString()}`);
  });
  group.add(hungMerged);
  const toolSign = signPlane(3, 0.7, 420, (g, W, H) => writeSign(g, W, H, '🔨 Werkzeug zum Ausprobieren', { bg: BLUE, fg: '#ffffff' }));
  toolSign.position.set(tw.x - 0.03, G + 3.65, (tw.z0 + tw.z1) / 2);
  toolSign.rotation.y = -Math.PI / 2;
  group.add(toolSign);

  // ---- An AKTION stack of charcoal by the checkouts ------------------------------------------------
  const ax = (PROMO.minX + PROMO.maxX) / 2;
  const az = (PROMO.minZ + PROMO.maxZ) / 2;
  for (let layer = 0; layer < 4; layer++) for (let n = 0; n < 6; n++) frame.add(box(0.48, 0.18, 0.7, indoor(layer % 2 ? '#2b2d42' : '#3d405b'), ax - 0.75 + (n % 3) * 0.5, G + layer * 0.19, az - 0.36 + Math.floor(n / 3) * 0.72, false));
  const aktion = signPlane(1.2, 0.5, 260, (g, W, H) => writeSign(g, W, H, 'AKTION!', { bg: '#ffd23f', fg: '#d62828' }));
  aktion.position.set(ax, G + 1.2, az + 0.75);
  group.add(aktion);
  colliders.push({ ...PROMO, bottom: G, top: G + 0.8 });

  group.add(mergeByMaterial(frame));
  return { shaker, shakerCan };
}
