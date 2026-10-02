import * as THREE from 'three';
import { BOWLING_ROOM, ZONES } from '../../../shared/bowling';
import { MG_BOARD, MG_DOOR, MG_ROOM, MG_STAND, MG_WALL } from '../../../shared/minigolf';
import { mesh, toon } from '../../world/toon';
import type { Collider } from '../../world/types';
import { BAKED, Batch, dotTexture, halo, stripGeo, unlit } from './look';
import { NEON, carpetTexture, muralTexture, rng, signTexture } from './paint';

/*
 * The black-light mini golf's room (flrnoh fork, see FORK.md "Black-light mini golf"): its own walls
 * on the south and west (a door in the south one, a neon sign over it outside), murals in fluorescent
 * paint all round inside, the black carpet with its glowing confetti, a black ceiling with UV tubes,
 * a strip curtain in the doorway, "Schläger & Bälle" (the stand just inside the door, putters and
 * balls in every colour), the scorecard board, and a corner to sit in. Interior coordinates.
 */

export interface MinigolfRoom {
  group: THREE.Group;
  colliders: Collider[];
  /** The scorecard board's canvas and texture (board.ts draws on it). */
  board: { canvas: HTMLCanvasElement; texture: THREE.CanvasTexture };
  /** Every frame: the curtain sways (harder with someone near the door), the tubes hum. */
  update(t: number, near: (x: number, z: number, r: number) => boolean): void;
}

const Z = ZONES.minigolf;
/** The building's walls stand this high; ours go up to its ceiling. */
const TALL = BOWLING_ROOM.height;

export function buildRoom(): MinigolfRoom {
  const group = new THREE.Group();
  group.name = 'minigolf-room';
  const colliders: Collider[] = [];
  const R = MG_ROOM;
  const H = R.ceiling;
  const W = R.maxX - R.minX;
  const D = R.maxZ - R.minZ;
  const cx = (R.minX + R.maxX) / 2;
  const cz = (R.minZ + R.maxZ) / 2;

  // The carpet.
  const carpet = carpetTexture();
  carpet.repeat.set(W / 2, D / 2);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshBasicMaterial({ map: carpet }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cx, 0.005, cz);
  group.add(floor);

  // The ceiling: black, with rows of UV tubes and their glow.
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(W, D), unlit('#04020a'));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(cx, H, cz);
  group.add(ceiling);
  const tubes = new Batch();
  for (let x = R.minX + 2.5; x < R.maxX - 1; x += 4.2) {
    for (let z = R.minZ + 2.2; z < R.maxZ - 1; z += 3.6) {
      const tube = new THREE.CylinderGeometry(0.035, 0.035, 1.2, 8, 1);
      tube.rotateZ(Math.PI / 2);
      tube.translate(x, H - 0.09, z);
      tubes.add(tube, unlit('#c9a6ff'));
      const box = new THREE.BoxGeometry(1.3, 0.05, 0.14);
      box.translate(x, H - 0.03, z);
      tubes.baked(box, '#1a1424');
      tubes.add(stripGeo(x - 0.75, z, x + 0.75, z, H - 0.12, 0.7), halo('#8a4dff', 0.32));
    }
  }
  tubes.build(group, 2);

  // Our own walls: west and south, the full height of the building, a door in the south one.
  const outside = toon('#2a2140');
  const wallTop = TALL;
  const west = mesh(new THREE.BoxGeometry(MG_WALL, wallTop, Z.maxZ - Z.minZ), outside, Z.minX + MG_WALL / 2, wallTop / 2, (Z.minZ + Z.maxZ) / 2, false);
  group.add(west);
  colliders.push({ minX: Z.minX, maxX: Z.minX + MG_WALL, minZ: Z.minZ, maxZ: Z.maxZ, top: wallTop });
  const sz = Z.maxZ - MG_WALL / 2;
  const southPiece = (x0: number, x1: number, y0 = 0, y1 = wallTop) => {
    group.add(mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, MG_WALL), outside, (x0 + x1) / 2, (y0 + y1) / 2, sz, false));
    if (y0 === 0) colliders.push({ minX: x0, maxX: x1, minZ: Z.maxZ - MG_WALL, maxZ: Z.maxZ, top: y1 });
  };
  southPiece(Z.minX + MG_WALL, MG_DOOR.x0);
  southPiece(MG_DOOR.x1, Z.maxX);
  southPiece(MG_DOOR.x0, MG_DOOR.x1, MG_DOOR.height, wallTop);

  // Outside: the neon sign over the door, and glowing stripes along the walls.
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(5.6, 1.1),
    new THREE.MeshBasicMaterial({
      map: signTexture(
        [
          { text: 'SCHWARZLICHT', color: '#ff2bd6', size: 92 },
          { text: '★ MINIGOLF ★', color: '#00e5ff', size: 84 },
        ],
        1024,
        220,
        null,
      ),
      transparent: true,
    }),
  );
  sign.position.set((MG_DOOR.x0 + MG_DOOR.x1) / 2, MG_DOOR.height + 1.05, Z.maxZ + 0.02);
  group.add(sign);
  const stripes = new Batch();
  for (const [y, color] of [
    [0.25, '#ff2bd6'],
    [2.9, '#00e5ff'],
  ] as const) {
    stripes.add(stripGeo(Z.minX, Z.maxZ + 0.015, MG_DOOR.x0 - 0.2, Z.maxZ + 0.015, y, 0.05, true), unlit(color));
    stripes.add(stripGeo(MG_DOOR.x1 + 0.2, Z.maxZ + 0.015, Z.maxX, Z.maxZ + 0.015, y, 0.05, true), unlit(color));
    stripes.add(stripGeo(Z.minX - 0.015, Z.minZ, Z.minX - 0.015, Z.maxZ, y, 0.05, true), unlit(color));
  }
  // The door's frame glows.
  stripes.add(stripGeo(MG_DOOR.x0 - 0.06, Z.maxZ + 0.015, MG_DOOR.x1 + 0.06, Z.maxZ + 0.015, MG_DOOR.height + 0.04, 0.08, true), unlit('#fffb00'));
  for (const x of [MG_DOOR.x0 - 0.04, MG_DOOR.x1 + 0.04]) {
    const post = new THREE.BoxGeometry(0.06, MG_DOOR.height, 0.24);
    post.translate(x, MG_DOOR.height / 2, sz);
    stripes.add(post, unlit('#fffb00'));
  }
  stripes.build(group);

  // The murals inside, all round, up to the ceiling.
  const mural = (kind: 'jungle' | 'space' | 'ocean' | 'entrance', x0: number, z0: number, x1: number, z1: number, seed: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, H), new THREE.MeshBasicMaterial({ map: muralTexture(kind, len, H, seed) }));
    m.position.set((x0 + x1) / 2, H / 2, (z0 + z1) / 2);
    // Facing into the room: its normal turned from +z to the left of the line a→b.
    m.rotation.y = Math.atan2(-(z1 - z0), x1 - x0);
    group.add(m);
  };
  const e = 0.012;
  mural('jungle', R.minX + e, R.maxZ, R.minX + e, R.minZ, 3); // west, facing east
  mural('space', R.minX, R.minZ + e, R.maxX, R.minZ + e, 5); // north (the building's wall), facing south
  mural('ocean', R.maxX - e, R.minZ, R.maxX - e, R.maxZ, 9); // east (the building's wall), facing west
  mural('entrance', R.maxX, R.maxZ - e, MG_DOOR.x1, R.maxZ - e, 13); // south, east of the door, facing north
  mural('jungle', MG_DOOR.x0, R.maxZ - e, R.minX, R.maxZ - e, 17); // south, west of the door
  // Over the door inside, a little sign: back out to the bowling.
  const exit = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4), new THREE.MeshBasicMaterial({ map: signTexture([{ text: '← BOWLING', color: '#39ff14', size: 70 }], 512, 128), transparent: true }));
  exit.position.set((MG_DOOR.x0 + MG_DOOR.x1) / 2, MG_DOOR.height + 0.32, R.maxZ - 0.03);
  exit.rotation.y = Math.PI;
  group.add(exit);

  // The strip curtain in the doorway.
  const curtain: THREE.Mesh[] = [];
  const strips = 13;
  const r = rng(21);
  for (let i = 0; i < strips; i++) {
    const g = new THREE.PlaneGeometry(0.13, MG_DOOR.height - 0.08);
    g.translate(0, -(MG_DOOR.height - 0.08) / 2, 0);
    const m = new THREE.Mesh(g, unlit(NEON[i % NEON.length], { transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
    m.position.set(MG_DOOR.x0 + 0.08 + (i / (strips - 1)) * (MG_DOOR.x1 - MG_DOOR.x0 - 0.16), MG_DOOR.height - 0.02, sz);
    m.userData.phase = r() * Math.PI * 2;
    curtain.push(m);
    group.add(m);
  }

  // "Schläger & Bälle": a counter against the wall, putters in a rack, buckets of balls in every colour.
  const stand = new Batch();
  const s = MG_STAND;
  const counter = new THREE.BoxGeometry(s.width, 0.95, s.depth);
  counter.translate(s.x, 0.475, s.z);
  stand.baked(counter, '#1b1430');
  const top = new THREE.BoxGeometry(s.width + 0.06, 0.04, s.depth + 0.06);
  top.translate(s.x, 0.97, s.z);
  stand.baked(top, '#ff2bd6', 0.85);
  stand.add(stripGeo(s.x - s.width / 2, s.z - s.depth / 2 - 0.005, s.x + s.width / 2, s.z - s.depth / 2 - 0.005, 0.6, 0.05, true), unlit('#00e5ff'));
  for (let i = 0; i < 8; i++) {
    // Putters standing in the rack behind it, their heads glowing.
    const x = s.x - s.width / 2 + 0.12 + i * ((s.width - 0.24) / 7);
    const shaft = new THREE.CylinderGeometry(0.009, 0.009, 0.95, 6);
    shaft.translate(x, 1.0 + 0.47, s.z + 0.12);
    stand.baked(shaft, '#c9c9d9');
    const head = new THREE.BoxGeometry(0.1, 0.035, 0.035);
    head.translate(x, 1.97, s.z + 0.12);
    stand.baked(head, NEON[i], 0.9);
    const grip = new THREE.CylinderGeometry(0.014, 0.014, 0.2, 6);
    grip.translate(x, 1.02 + 0.1, s.z + 0.12);
    stand.baked(grip, NEON[(i + 3) % NEON.length], 0.7);
  }
  for (let i = 0; i < 4; i++) {
    const bx = s.x - 0.5 + i * 0.33;
    const bucket = new THREE.CylinderGeometry(0.11, 0.09, 0.14, 12, 1, true);
    bucket.translate(bx, 1.06, s.z - 0.1);
    stand.baked(bucket, '#2b2440');
    for (let k = 0; k < 5; k++) {
      const ball = new THREE.SphereGeometry(0.026, 8, 6);
      ball.translate(bx + Math.cos(k * 1.3) * 0.05, 1.12 + (k % 2) * 0.02, s.z - 0.1 + Math.sin(k * 1.3) * 0.05);
      stand.baked(ball, NEON[(i * 2 + k) % NEON.length], 1);
    }
  }
  stand.build(group);
  const standSign = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.36), new THREE.MeshBasicMaterial({ map: signTexture([{ text: 'Schläger & Bälle', color: '#fffb00', size: 64 }], 512, 132), transparent: true }));
  standSign.position.set(s.x, 2.3, R.maxZ - 0.02);
  standSign.rotation.y = Math.PI;
  group.add(standSign);
  colliders.push({ minX: s.x - s.width / 2, maxX: s.x + s.width / 2, minZ: s.z - s.depth / 2, maxZ: R.maxZ, top: 1 });

  // The scorecard board, framed in neon, on the south wall.
  const b = MG_BOARD;
  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = Math.round((1280 * b.height) / b.width);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const board = new THREE.Mesh(new THREE.PlaneGeometry(b.width, b.height), new THREE.MeshBasicMaterial({ map: texture }));
  board.position.set(b.x, b.y + b.height / 2, b.z - 0.02);
  board.rotation.y = Math.PI;
  group.add(board);
  const frame = new Batch();
  const fz = b.z - 0.025;
  const corners: [number, number][] = [
    [b.x - b.width / 2 - 0.05, b.y - 0.05],
    [b.x + b.width / 2 + 0.05, b.y - 0.05],
    [b.x + b.width / 2 + 0.05, b.y + b.height + 0.05],
    [b.x - b.width / 2 - 0.05, b.y + b.height + 0.05],
  ];
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = corners[i];
    const [bx2, by] = corners[(i + 1) % 4];
    const len = Math.hypot(bx2 - ax, by - ay);
    const bar = new THREE.BoxGeometry(len + 0.05, 0.05, 0.03);
    bar.rotateZ(Math.atan2(by - ay, bx2 - ax));
    bar.translate((ax + bx2) / 2, (ay + by) / 2, fz);
    frame.add(bar, unlit('#00e5ff'));
  }
  frame.build(group);

  // The corner to sit in (north-west, past the last hole): benches with glowing edges, a jellyfish lamp.
  const lounge = new Batch();
  for (const [x, z, rot] of [
    [-1.5, -19.6, 0],
    [1.5, -19.6, 0],
    [-4.0, -17.0, Math.PI / 2],
  ] as const) {
    const seat = new THREE.BoxGeometry(2.2, 0.42, 0.55);
    seat.rotateY(rot);
    seat.translate(x, 0.21, z);
    lounge.baked(seat, '#24183c');
    const edge = new THREE.BoxGeometry(2.24, 0.04, 0.04);
    edge.translate(0, 0.43, 0.27);
    edge.rotateY(rot);
    edge.translate(x, 0, z);
    lounge.add(edge, unlit(rot ? '#39ff14' : '#ff2bd6'));
    colliders.push(rot ? { minX: x - 0.28, maxX: x + 0.28, minZ: z - 1.1, maxZ: z + 1.1, top: 0.42 } : { minX: x - 1.1, maxX: x + 1.1, minZ: z - 0.28, maxZ: z + 0.28, top: 0.42 });
  }
  lounge.build(group);
  const jelly = new THREE.Group();
  const bell = new THREE.Mesh(new THREE.SphereGeometry(0.6, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), unlit('#ff2bd6', { transparent: true, opacity: 0.45, side: THREE.DoubleSide }));
  jelly.add(bell);
  const glowBall = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTexture(), color: '#ff2bd6', transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }));
  glowBall.scale.set(2, 2, 1);
  jelly.add(glowBall);
  const tentacles: THREE.Mesh[] = [];
  for (let i = 0; i < 9; i++) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.004, 1.3, 4, 6), unlit(i % 2 ? '#b14dff' : '#00e5ff'));
    t.geometry.translate(0, -0.65, 0);
    const a = (i / 9) * Math.PI * 2;
    t.position.set(Math.cos(a) * 0.4, 0, Math.sin(a) * 0.4);
    tentacles.push(t);
    jelly.add(t);
  }
  jelly.position.set(0, 2.6, -17.2);
  group.add(jelly);

  // The UV light on the people in here (everything else in the room is unlit and glows by itself).
  for (const [x, z] of [
    [2, -6],
    [12, -6],
    [8, -16],
  ] as const) {
    const l = new THREE.PointLight('#8a5cff', 4, 11, 1.2);
    l.position.set(x, H - 0.4, z);
    group.add(l);
  }

  return {
    group,
    colliders,
    board: { canvas, texture },
    update(t, near) {
      const busy = near((MG_DOOR.x0 + MG_DOOR.x1) / 2, Z.maxZ, 1.6);
      for (const m of curtain) {
        const k = busy ? 0.35 : 0.06;
        m.rotation.x = Math.sin(t * (busy ? 5 : 1.3) + m.userData.phase) * k;
      }
      jelly.position.y = 2.6 + Math.sin(t * 0.6) * 0.12;
      bell.scale.set(1 + Math.sin(t * 1.6) * 0.06, 1 - Math.sin(t * 1.6) * 0.08, 1 + Math.sin(t * 1.6) * 0.06);
      tentacles.forEach((tm, i) => {
        tm.rotation.x = Math.sin(t * 1.4 + i) * 0.18;
        tm.rotation.z = Math.cos(t * 1.1 + i * 0.7) * 0.18;
      });
    },
  };
}

export { BAKED };
