import * as THREE from 'three';
import { FOUL_LINE_Z, LANE_COUNT, LANE_X, ZONES } from '../../../shared/bowling';
import { BALLS, BALL_RADIUS, BENCH, CONSOLE_Z, LEAGUE_BOARD, MONITOR, PAIRS, RETURN_Z, consoleSpot } from '../../../shared/bowling-game';
import { mesh, roundedBox, toon } from '../../world/toon';
import type { Collider, Interactable } from '../../world/types';
import { BOARD_H, BOARD_W, CONSOLE_H, CONSOLE_W, SHEET_H, SHEET_W } from './monitor';
import { ballMesh } from './props';
import { SURF } from './lanes3d';

/*
 * Behind the approaches (flrnoh fork, see FORK.md "Bowling lanes"), in ZONES.bowlers: a ball return
 * between each pair of lanes (its hood with the hand dryer's grille, where a ball pops up and rolls
 * down the rails onto the rack among the house balls), a scoring console per pair with a screen for
 * each lane, a curved bench behind each, the overhead monitors over the end of the approaches (two
 * screens a pair), and the league's big board on the west wall. The screens are canvases the game
 * draws on (monitor.ts).
 */

export interface Screen {
  canvas: HTMLCanvasElement;
  g: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  /** Its material, for cosmic bowling's brightness. */
  mat: THREE.MeshBasicMaterial;
}

function screen(w: number, h: number): Screen {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const mat = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
  mat.userData.outlineParameters = { visible: false };
  return { canvas, g, texture, mat };
}

/** Where a house ball rests on a return's tray: slot `k` (0–8), three across, three deep behind the hood. */
export function rackSpot(pair: number, k: number): THREE.Vector3 {
  const p = PAIRS[pair];
  return new THREE.Vector3(p.x + ((k % 3) - 1) * 0.24, SURF + 0.39 + BALL_RADIUS, RETURN_Z + 0.42 + Math.floor(k / 3) * 0.23);
}
/** Where a returning ball comes up out of the hood, and where it stops: on the lip in front of the tray. */
export const hoodSpot = (pair: number) => new THREE.Vector3(PAIRS[pair].x, SURF + 0.66, RETURN_Z - 0.1);
export const landingSpot = (pair: number) => new THREE.Vector3(PAIRS[pair].x, SURF + 0.6 + BALL_RADIUS, RETURN_Z + 0.2);

export interface Furniture {
  group: THREE.Group;
  colliders: Collider[];
  interactables: Interactable[];
  /** Each lane's overhead monitor and console screen, and the league board. */
  monitors: Screen[];
  consoles: Screen[];
  board: Screen;
  /** The house balls sitting on each return's rack (pair → balls), to hide one while someone holds it. */
  racks: THREE.Mesh[][];
}

export function buildFurniture(parent: THREE.Object3D): Furniture {
  const group = new THREE.Group();
  group.name = 'bowling-furniture';
  parent.add(group);
  const colliders: Collider[] = [];
  const interactables: Interactable[] = [];
  const shell = toon('#262a3a');
  const trim = toon('#e8b04a');
  const chrome = toon('#c9ced8');
  const vinyl = toon('#b8263a');
  const vinylDark = toon('#7e1426');
  const black = toon('#15151c');
  const racks: THREE.Mesh[][] = [];

  // ---- Ball returns ----
  for (let p = 0; p < PAIRS.length; p++) {
    const x = PAIRS[p].x;
    // The hood: a rounded tower the ball comes up through, a grille on top (the hand dryer), the lane numbers.
    const hood = mesh(roundedBox(0.5, 0.78, 0.5, 0.14), shell, x, SURF + 0.39, RETURN_Z - 0.1);
    group.add(hood);
    group.add(mesh(new THREE.BoxGeometry(0.3, 0.02, 0.18), black, x, SURF + 0.79, RETURN_Z - 0.18, false));
    group.add(mesh(new THREE.BoxGeometry(0.52, 0.05, 0.52), trim, x, SURF + 0.58, RETURN_Z - 0.1, false));
    // The tray behind it, chrome rails round it; the lip the returning ball stops on.
    group.add(mesh(new THREE.BoxGeometry(0.8, 0.06, 0.82), black, x, SURF + 0.36, RETURN_Z + 0.65));
    group.add(mesh(new THREE.BoxGeometry(0.3, 0.05, 0.3), trim, x, SURF + 0.6, RETURN_Z + 0.2, false));
    for (const side of [-1, 1]) {
      const rail = mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.82, 8), chrome, x + side * 0.4, SURF + 0.46, RETURN_Z + 0.65);
      rail.rotation.x = Math.PI / 2;
      group.add(rail);
      for (const z of [RETURN_Z + 0.28, RETURN_Z + 1.02]) group.add(mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.42, 8), chrome, x + side * 0.38, SURF + 0.21, z));
    }
    colliders.push({ minX: x - 0.42, maxX: x + 0.42, minZ: RETURN_Z - 0.36, maxZ: RETURN_Z + 1.08, top: 0.9 });
    // The house balls on the tray: every weight, the lightest at the front.
    const balls: THREE.Mesh[] = [];
    BALLS.forEach((b, k) => {
      const m = ballMesh(b.id);
      m.position.copy(rackSpot(p, k));
      m.rotation.set(k * 0.7, k * 1.3 + p, 0);
      group.add(m);
      balls.push(m);
    });
    racks.push(balls);
    interactables.push({ kind: 'bowlreturn', x, z: RETURN_Z + 0.5, radius: 0.75, bowlLane: PAIRS[p].lanes[0] });
  }

  // ---- Consoles: a pedestal and a desk, a screen per lane angled toward the bowlers ----
  const consoles: Screen[] = [];
  for (let p = 0; p < PAIRS.length; p++) {
    const x = PAIRS[p].x;
    group.add(mesh(new THREE.CylinderGeometry(0.09, 0.16, 0.8, 12), shell, x, SURF + 0.4, CONSOLE_Z));
    group.add(mesh(roundedBox(1.2, 0.06, 0.4, 0.05), shell, x, SURF + 0.83, CONSOLE_Z));
    group.add(mesh(new THREE.BoxGeometry(1.22, 0.02, 0.42), trim, x, SURF + 0.865, CONSOLE_Z, false));
    colliders.push({ minX: x - 0.62, maxX: x + 0.62, minZ: CONSOLE_Z - 0.22, maxZ: CONSOLE_Z + 0.22, top: 0.9 });
    for (const lane of PAIRS[p].lanes) {
      const spot = consoleSpot(lane);
      const s = screen(CONSOLE_W, CONSOLE_H);
      const frame = new THREE.Group();
      frame.position.set(spot.x, SURF + 1.08, CONSOLE_Z - 0.02);
      frame.rotation.x = -0.45;
      frame.add(mesh(new THREE.BoxGeometry(0.52, 0.34, 0.03), black, 0, 0, -0.016));
      const face = new THREE.Mesh(new THREE.PlaneGeometry(0.48, 0.3), s.mat);
      face.position.z = 0.001;
      frame.add(face);
      group.add(frame);
      group.add(mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.22, 6), chrome, spot.x, SURF + 0.95, CONSOLE_Z - 0.05));
      consoles[lane] = s;
      interactables.push({ kind: 'bowlconsole', x: spot.x, z: CONSOLE_Z + 0.25, radius: 0.5, bowlLane: lane });
    }
  }

  // ---- The curved benches behind the consoles, facing the lanes ----
  const backGeo = new THREE.CylinderGeometry(BENCH.radius + 0.02, BENCH.radius + 0.02, 0.95, 28, 1, true, -0.95, 1.9);
  const innerGeo = new THREE.CylinderGeometry(BENCH.radius - BENCH.depth, BENCH.radius - BENCH.depth, 0.36, 28, 1, true, -0.95, 1.9);
  for (let p = 0; p < PAIRS.length; p++) {
    const cx = PAIRS[p].x;
    const cz = BENCH.z;
    // A ring segment: the seat cushion (a disc slice with the middle cut away by the inner skirt), the high back round its outside.
    const seat = new THREE.Group();
    seat.position.set(cx, SURF, cz);
    const ring = new THREE.Mesh(new THREE.RingGeometry(BENCH.radius - BENCH.depth, BENCH.radius, 28, 1, -Math.PI / 2 - 0.95, 1.9), vinyl);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.46;
    seat.add(ring);
    seat.add(mesh(backGeo, vinylDark, 0, 0.475, 0));
    seat.add(mesh(innerGeo, vinylDark, 0, 0.22, 0));
    group.add(seat);
    // Keep people out of the seat's ring (they stand in front of it): a few boxes along the arc.
    for (let k = 0; k < 7; k++) {
      const a = -0.95 + (k + 0.5) * (1.9 / 7);
      const r = BENCH.radius - BENCH.depth / 2;
      const bx = cx + Math.sin(a) * r;
      const bz = cz + Math.cos(a) * r;
      colliders.push({ minX: bx - 0.24, maxX: bx + 0.24, minZ: bz - 0.24, maxZ: bz + 0.24, top: 0.47 });
    }
  }

  // ---- The overhead monitors: two screens a pair, hung from the ceiling on rods ----
  const monitors: Screen[] = [];
  for (let lane = 0; lane < LANE_COUNT; lane++) {
    const s = screen(SHEET_W, SHEET_H);
    const g = new THREE.Group();
    g.position.set(LANE_X[lane], MONITOR.y, MONITOR.z);
    g.rotation.x = -0.12;
    g.add(mesh(new THREE.BoxGeometry(MONITOR.w + 0.06, MONITOR.h + 0.06, 0.07), black, 0, 0, -0.04));
    const face = new THREE.Mesh(new THREE.PlaneGeometry(MONITOR.w, MONITOR.h), s.mat);
    face.position.z = 0.001;
    g.add(face);
    group.add(g);
    for (const side of [-1, 1]) group.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, ZONES.lanes.maxZ, 6), chrome, LANE_X[lane] + side * 0.5, MONITOR.y + MONITOR.h / 2 + ZONES.lanes.maxZ / 2, MONITOR.z - 0.04, false));
    monitors.push(s);
  }

  // ---- The league board on the west wall, facing the bowlers' area ----
  const board = screen(BOARD_W, BOARD_H);
  const bg = new THREE.Group();
  bg.position.set(LEAGUE_BOARD.x, LEAGUE_BOARD.y, LEAGUE_BOARD.z);
  bg.rotation.y = Math.PI / 2;
  bg.add(mesh(new THREE.BoxGeometry(LEAGUE_BOARD.w + 0.12, LEAGUE_BOARD.h + 0.12, 0.08), toon('#3a2a12'), 0, 0, -0.03));
  const face = new THREE.Mesh(new THREE.PlaneGeometry(LEAGUE_BOARD.w, LEAGUE_BOARD.h), board.mat);
  face.position.z = 0.012;
  bg.add(face);
  // Little marquee bulbs round it.
  const bulb = new THREE.MeshBasicMaterial({ color: '#ffe7a0', toneMapped: false });
  bulb.userData.outlineParameters = { visible: false };
  const bulbGeo = new THREE.SphereGeometry(0.025, 8, 6);
  for (let i = 0; i <= 16; i++)
    for (const y of [-1, 1]) bg.add(mesh(bulbGeo, bulb, -LEAGUE_BOARD.w / 2 + (i / 16) * LEAGUE_BOARD.w, y * (LEAGUE_BOARD.h / 2 + 0.03), 0.02, false));
  group.add(bg);
  interactables.push({ kind: 'bowlboard', x: LEAGUE_BOARD.x + 0.9, z: LEAGUE_BOARD.z, radius: 1.3 });

  // The approaches: E there steps up to bowl (when it's your turn).
  for (let lane = 0; lane < LANE_COUNT; lane++) interactables.push({ kind: 'bowlapproach', x: LANE_X[lane], z: FOUL_LINE_Z + 3.3, radius: 1.1, bowlLane: lane });

  return { group, colliders, interactables, monitors, consoles, board, racks };
}
