import * as THREE from 'three';
import {
  BOARD,
  JOIN_SPOTS,
  PITCH,
  PITCH_CX,
  SOCCER_DOOR_INSIDE,
  SOCCER_ROOM,
  TEAM_COLOR,
  type SoccerView,
} from '../../../shared/soccer';
import { BALL_R } from '../../../shared/soccer-ball';
import type { Collider, Interactable } from '../office';
import { mergeByColor, mesh, toon } from '../toon';
import { box, canvasTexture, glow, FONT } from '../casino/parts';
import { drawScoreboard, scoreboardKey } from '../../soccer/scoreboard'; // what the scoreboards say
import { boardRuns, buildBackRooms, buildBoardBodies, buildDugouts, buildFloodlights, buildGoals, buildPitch, buildSafetyNets, buildShell, buildStands } from './props';
import { buildLedBoards } from './ads';
import { buildCrowd } from './crowd';
import { soccerLook } from './look';

/*
 * Inside the soccer hall (flrnoh fork, see FORK.md "The soccer hall"): a place of its own, like the
 * casino and the padel hall, built the first time you go in (client/soccer/place.ts), in the hall's
 * own coordinates (SOCCER_ROOM, the floor at y 0). A small-field pitch of striped artificial turf with
 * crisp lines and the club's crest, LED boards all round with safety nets above them, proper goals with
 * sagging nets, dugouts along the west wall with the players' tunnel between them and a locker room
 * behind glass, stands at both ends and a gallery along the east wall full of fans, steel trusses and
 * floodlights under the roof, and a big scoreboard over each end (the details: props.ts; the crowd,
 * the boards' ads and the stadium's moods: crowd.ts, ads.ts, look.ts). The ball is drawn here too;
 * where it is is the game's (soccer/ball.ts).
 */

export interface SoccerInterior {
  group: THREE.Group;
  colliders: Collider[];
  interactables: Interactable[];
  pickables: THREE.Object3D[];
  /** The way out (E at the doors). */
  exit: Interactable;
  /** Puts the ball at (x, y, z) (y its bottom), rolled by (dx, dz) since last time. */
  setBall(x: number, y: number, z: number, dx: number, dz: number): void;
  /** The scoreboards show `view` with `clockMs` left; `flash` (0..1) lights them up for a goal. */
  setBoard(view: SoccerView | null, clockMs: number, flash: number): void;
  update(t: number, dt: number): void;
}

const R = SOCCER_ROOM;
const T = 0.3;
const H = R.height;
const PZ = (PITCH.minZ + PITCH.maxZ) / 2;

/** The ball's panels: white with black pentagons. */
function ballTexture(): THREE.CanvasTexture {
  return canvasTexture(256, 128, (g) => {
    g.fillStyle = '#fbfbf8';
    g.fillRect(0, 0, 256, 128);
    g.fillStyle = '#1d1d1d';
    const pent = (cx: number, cy: number, s: number) => {
      g.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = (i * Math.PI * 2) / 5;
        g[i ? 'lineTo' : 'moveTo'](cx + Math.sin(a) * s, cy - Math.cos(a) * s);
      }
      g.closePath();
      g.fill();
    };
    for (const [x, y] of [
      [32, 32],
      [96, 64],
      [160, 32],
      [224, 64],
      [32, 100],
      [160, 100],
      [96, 8],
      [224, 8],
    ]) pent(x, y, 15);
  });
}

export function buildSoccerInterior(): SoccerInterior {
  const group = new THREE.Group();
  const colliders: Collider[] = [];
  const interactables: Interactable[] = [];
  const parts = new THREE.Group();
  const gradientMap = (toon('#fff') as THREE.MeshToonMaterial).gradientMap;
  const dark = toon('#2b3138');
  const flat = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = mesh(geo, mat, x, y, z, false);
    m.rotation.x = -Math.PI / 2;
    m.receiveShadow = true;
    return m;
  };

  // ---- Floor, walls, roof, the pitch (props.ts) -------------------------------------------------
  colliders.push({ minX: R.minX - T, maxX: R.maxX + T, minZ: R.minZ - T, maxZ: R.maxZ + T, bottom: -1, top: 0 });
  const walls: [number, number, number, number][] = [
    [R.minX - T, R.maxX + T, R.minZ - T, R.minZ],
    [R.minX - T, R.maxX + T, R.maxZ, R.maxZ + T],
    [R.minX - T, R.minX, R.minZ, R.maxZ],
    [R.maxX, R.maxX + T, R.minZ, R.maxZ],
  ];
  for (const [x0, x1, z0, z1] of walls) colliders.push({ minX: x0, maxX: x1, minZ: z0, maxZ: z1, top: H + 1 });
  buildPitch(group);
  const shell = buildShell(group, parts);
  buildBackRooms(group, parts);
  const lights = buildFloodlights(group, parts);

  // ---- The boards and their LED panels, the safety nets, the goals ------------------------------
  buildBoardBodies(parts, colliders);
  const led = buildLedBoards(boardRuns(), BOARD.thick, 0.24);
  group.add(led.mesh);
  buildSafetyNets(group, parts);
  const nets = buildGoals(group, parts, colliders);

  // ---- The join boards at the halfway line --------------------------------------------------------
  const joinTex = canvasTexture(512, 256, (g) => {
    g.fillStyle = '#1d3b2c';
    g.fillRect(0, 0, 512, 256);
    g.fillStyle = TEAM_COLOR.red;
    g.fillRect(0, 0, 256, 20);
    g.fillStyle = TEAM_COLOR.blue;
    g.fillRect(256, 0, 256, 20);
    g.fillStyle = '#ffffff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `900 72px ${FONT}`;
    g.fillText('⚽ PLAY', 256, 110);
    g.font = `700 34px ${FONT}`;
    g.fillStyle = '#d7f5df';
    g.fillText('E · join a team', 256, 190);
  });
  for (const spot of JOIN_SPOTS) {
    const it: Interactable = { kind: 'soccer-pitch', x: spot.x, z: spot.z, y: 0, radius: 1.8 };
    interactables.push(it);
    // A sign standing on top of the boards, readable from both sides.
    for (const face of [-1, 1]) {
      const sign = mesh(new THREE.PlaneGeometry(1.6, 0.8), glow(joinTex), spot.x + face * 0.05, BOARD.height + 0.5, spot.z, false);
      sign.rotation.y = face > 0 ? Math.PI / 2 : -Math.PI / 2;
      sign.userData.interact = it;
      group.add(sign);
    }
    parts.add(mesh(box(0.08, 0.9, 1.7), dark, spot.x, BOARD.height + 0.5, spot.z, false));
  }

  // ---- The stands and their crowd, the dugouts -------------------------------------------------
  const seats = buildStands(group, parts, colliders);
  buildDugouts(group, parts, colliders);
  const crowd = buildCrowd(seats);
  group.add(crowd.group);
  soccerLook.attach({ crowd, led, lights, shell, nets });

  // ---- The doors (inside) -------------------------------------------------------------------------
  const dw = SOCCER_DOOR_INSIDE.width;
  const dz = R.minZ;
  parts.add(mesh(box(dw + 0.5, 0.3, 0.2), dark, SOCCER_DOOR_INSIDE.x, 2.95, dz + 0.1, false));
  for (const s of [-1, 1]) parts.add(mesh(box(0.2, 2.8, 0.2), dark, SOCCER_DOOR_INSIDE.x + s * (dw / 2 + 0.1), 1.4, dz + 0.1, false));
  const doorGlass = mesh(new THREE.PlaneGeometry(dw, 2.8), glow(canvasTexture(64, 64, (g) => {
    const grd = g.createLinearGradient(0, 0, 0, 64);
    grd.addColorStop(0, '#bcd7ef');
    grd.addColorStop(0.7, '#e7eef3');
    grd.addColorStop(1, '#9aa3ab');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = 'rgba(40,50,60,0.6)';
    g.fillRect(31, 0, 2, 64);
  })), SOCCER_DOOR_INSIDE.x, 1.4, dz + 0.02, false);
  group.add(doorGlass);
  const exitSign = mesh(new THREE.PlaneGeometry(0.9, 0.3), glow(canvasTexture(192, 64, (g) => {
    g.fillStyle = '#1f9d55';
    g.fillRect(0, 0, 192, 64);
    g.fillStyle = '#fff';
    g.font = `900 36px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('🚪 EXIT', 96, 34);
  })), SOCCER_DOOR_INSIDE.x, 3.4, dz + 0.03, false);
  group.add(exitSign);
  const exit: Interactable = { kind: 'soccer', x: SOCCER_DOOR_INSIDE.x, z: SOCCER_DOOR_INSIDE.z, y: 0, radius: 1.6 };
  interactables.push(exit);
  doorGlass.userData.interact = exit;
  exitSign.userData.interact = exit;

  // ---- The scoreboards over each end ------------------------------------------------------------
  const boardCanvas = document.createElement('canvas');
  boardCanvas.width = 1280;
  boardCanvas.height = 480;
  const board2d = boardCanvas.getContext('2d')!;
  const boardTexture2 = new THREE.CanvasTexture(boardCanvas);
  boardTexture2.colorSpace = THREE.SRGBColorSpace;
  boardTexture2.anisotropy = 4;
  const scoreMat = glow(boardTexture2);
  const SB = { w: 7.2, h: 2.7 };
  for (const s of [-1, 1]) {
    const z = s < 0 ? R.minZ + 0.2 : R.maxZ - 0.2;
    const y = s < 0 ? 5.4 : 5.2;
    const face = mesh(new THREE.PlaneGeometry(SB.w, SB.h), scoreMat, PITCH_CX, y, z, false);
    face.rotation.y = s < 0 ? 0 : Math.PI;
    group.add(face);
    // Its housing, back against the wall (its front just behind the face).
    parts.add(mesh(box(SB.w + 0.3, SB.h + 0.3, 0.14), dark, PITCH_CX, y, z + s * 0.09, false));
  }
  let drawn = '';
  const setBoard = (view: SoccerView | null, clockMs: number, flash: number) => {
    const key = scoreboardKey(view, clockMs, flash);
    if (key === drawn) return;
    drawn = key;
    drawScoreboard(board2d, boardCanvas.width, boardCanvas.height, view, clockMs, flash);
    boardTexture2.needsUpdate = true;
  };
  setBoard(null, 5 * 60_000, 0);

  // ---- The ball ---------------------------------------------------------------------------------
  const ball = new THREE.Group();
  const ballMesh = mesh(new THREE.SphereGeometry(BALL_R, 20, 14), new THREE.MeshToonMaterial({ map: ballTexture(), gradientMap }), 0, 0, 0);
  ball.add(ballMesh);
  const shadowMat = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.35, depthWrite: false });
  shadowMat.userData.outlineParameters = { visible: false };
  const shadow = flat(new THREE.CircleGeometry(BALL_R * 1.1, 16), shadowMat, 0, 0.015, 0);
  group.add(ball, shadow);
  const axis = new THREE.Vector3();
  const spin = new THREE.Quaternion();
  const setBall = (x: number, y: number, z: number, dx: number, dz: number) => {
    ball.position.set(x, y + BALL_R, z);
    shadow.position.set(x, 0.015, z);
    const k = 1 / (1 + y * 0.8);
    shadow.scale.setScalar(0.6 + k * 0.6);
    shadowMat.opacity = 0.35 * k;
    const d = Math.hypot(dx, dz);
    if (d > 1e-5 && d < 3) {
      // Rolling: turned about the axis across the way it went, by the distance over its radius.
      axis.set(dz / d, 0, -dx / d);
      spin.setFromAxisAngle(axis, d / BALL_R);
      ballMesh.quaternion.premultiply(spin);
    }
  };
  setBall(PITCH_CX, 0, PZ, 0, 0);

  // Every plain part in one draw call, whatever its colour.
  group.add(mergeByColor(parts));
  return {
    group,
    colliders,
    interactables,
    pickables: [group],
    exit,
    setBall,
    setBoard,
    update(t, dt) {
      soccerLook.frame(t, dt);
    },
  };
}
