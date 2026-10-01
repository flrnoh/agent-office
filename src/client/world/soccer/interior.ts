import * as THREE from 'three';
import {
  BENCHES,
  BOARD,
  GOAL,
  JOIN_SPOTS,
  MARKS,
  PITCH,
  PITCH_CX,
  SOCCER_DOOR_INSIDE,
  SOCCER_ROOM,
  STAND,
  TEAM_COLOR,
  type SoccerView,
} from '../../../shared/soccer';
import { BALL_R } from '../../../shared/soccer-ball';
import type { Collider, Interactable } from '../office';
import { mergeByMaterial, mesh, toon } from '../toon';
import { box, canvasTexture, glow, FONT } from '../casino/parts';
import { drawScoreboard, scoreboardKey } from '../../soccer/scoreboard'; // what the scoreboards say

/*
 * Inside the soccer hall (flrnoh fork, see FORK.md "The soccer hall"): a place of its own, like the
 * casino and the padel hall, built the first time you go in (client/soccer/place.ts), in the hall's
 * own coordinates (SOCCER_ROOM, the floor at y 0). A small-field pitch of artificial turf with white
 * lines, boards all round with safety nets above them, two small goals with nets, team benches along
 * the west wall, a stand of three rows behind the south goal, rows of lights under the roof, and a big
 * scoreboard over each end. The ball is drawn here too; where it is is the game's (soccer/ball.ts).
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
const W = R.maxX - R.minX;
const D = R.maxZ - R.minZ;
const CX = (R.minX + R.maxX) / 2;
const CZ = (R.minZ + R.maxZ) / 2;
const T = 0.3;
const H = R.height;
const PW = PITCH.maxX - PITCH.minX;
const PL = PITCH.maxZ - PITCH.minZ;
const PZ = (PITCH.minZ + PITCH.maxZ) / 2;
const LINE = 0.08;

/** Artificial turf: green with mown bands across the pitch and a fine grain of blades. */
function turfTexture(): THREE.CanvasTexture {
  const t = canvasTexture(256, 256, (g) => {
    for (let i = 0; i < 2; i++) {
      g.fillStyle = i ? '#3b9a4a' : '#44a653';
      g.fillRect(0, i * 128, 256, 128);
    }
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,40,0,0.08)';
      g.fillRect(Math.random() * 256, Math.random() * 256, 1, 2 + Math.random() * 2);
    }
    // A few black rubber crumbs.
    g.fillStyle = 'rgba(20,20,20,0.25)';
    for (let i = 0; i < 160; i++) g.fillRect(Math.random() * 256, Math.random() * 256, 1.5, 1.5);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** A goal's (and the safety nets') mesh: white cords on nothing. */
function netTexture(cell = 16): THREE.CanvasTexture {
  const t = canvasTexture(64, 64, (g) => {
    g.clearRect(0, 0, 64, 64);
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = 2;
    for (let i = 0; i <= 64; i += cell) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i, 64);
      g.moveTo(0, i);
      g.lineTo(64, i);
      g.stroke();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** The boards' faces: white with a green top band and sponsor-ish panels. */
function boardTexture(): THREE.CanvasTexture {
  const words = ['AGENT OFFICE', '⚽ KICK OFF', 'FLOGGE FC', 'BUILD · SHIP · SCORE', 'CAFÉ NETZROLLER'];
  const t = canvasTexture(1024, 64, (g) => {
    g.fillStyle = '#f5f6f2';
    g.fillRect(0, 0, 1024, 64);
    g.fillStyle = '#2f8f47';
    g.fillRect(0, 0, 1024, 8);
    g.fillStyle = '#1d3b2c';
    g.fillRect(0, 60, 1024, 4);
    g.font = `800 26px ${FONT}`;
    g.textBaseline = 'middle';
    g.textAlign = 'center';
    words.forEach((w, i) => {
      g.fillStyle = ['#1d3b2c', '#e63946', '#277df0', '#2f8f47', '#8a5a3b'][i];
      g.fillText(w, 102 + i * 205, 36);
    });
  });
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

/** The hall's walls: grey below, a green stripe, pale above. */
function wallTexture(): THREE.CanvasTexture {
  return canvasTexture(8, 256, (g) => {
    g.fillStyle = '#eef0ec';
    g.fillRect(0, 0, 8, 256);
    g.fillStyle = '#8f969c';
    g.fillRect(0, 216, 8, 40);
    g.fillStyle = '#2f8f47';
    g.fillRect(0, 206, 8, 10);
  });
}

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
  const white = toon('#fbfbf6');
  const steel = toon('#b7bec7');
  const dark = toon('#2b3138');
  const wood = toon('#c49262');
  const flat = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = mesh(geo, mat, x, y, z, false);
    m.rotation.x = -Math.PI / 2;
    m.receiveShadow = true;
    return m;
  };

  // ---- Floor, walls, roof ------------------------------------------------------------------------
  group.add(flat(new THREE.PlaneGeometry(W, D), toon('#5b636d'), CX, 0, CZ));
  colliders.push({ minX: R.minX - T, maxX: R.maxX + T, minZ: R.minZ - T, maxZ: R.maxZ + T, bottom: -1, top: 0 });
  const turf = turfTexture();
  // The mown bands run across the pitch, 2.25 m each (twelve over its length).
  turf.repeat.set(PW / 4.5, PL / 4.5);
  const turfMat = new THREE.MeshToonMaterial({ map: turf, gradientMap });
  group.add(flat(new THREE.PlaneGeometry(PW + 2 * BOARD.thick, PL + 2 * BOARD.thick), turfMat, PITCH_CX, 0.004, PZ));
  for (const s of [-1, 1]) group.add(flat(new THREE.PlaneGeometry(GOAL.width + 0.2, GOAL.depth + 0.1), turfMat, PITCH_CX, 0.004, PZ + s * (PL / 2 + GOAL.depth / 2)));

  const wallTex = wallTexture();
  const wallMat = new THREE.MeshToonMaterial({ map: wallTex, gradientMap });
  const walls: [number, number, number, number][] = [
    [R.minX - T, R.maxX + T, R.minZ - T, R.minZ],
    [R.minX - T, R.maxX + T, R.maxZ, R.maxZ + T],
    [R.minX - T, R.minX, R.minZ, R.maxZ],
    [R.maxX, R.maxX + T, R.minZ, R.maxZ],
  ];
  for (const [x0, x1, z0, z1] of walls) {
    group.add(mesh(box(x1 - x0, H, z1 - z0), wallMat, (x0 + x1) / 2, H / 2, (z0 + z1) / 2, false));
    colliders.push({ minX: x0, maxX: x1, minZ: z0, maxZ: z1, top: H + 1 });
  }
  // Windows high up the long walls: a band of milky glazing with daylight behind.
  const glazing = glow(
    canvasTexture(128, 32, (g) => {
      g.fillStyle = '#e9f3f7';
      g.fillRect(0, 0, 128, 32);
      g.fillStyle = 'rgba(90,110,120,0.4)';
      for (let i = 0; i < 4; i++) g.fillRect(i * 32, 0, 2, 32);
    }),
    '#e3edf0',
  );
  (glazing.map as THREE.Texture).wrapS = THREE.RepeatWrapping;
  (glazing.map as THREE.Texture).repeat.set(D / 4, 1);
  for (const s of [-1, 1]) {
    const band = mesh(new THREE.PlaneGeometry(D - 1, 1.6), glazing, s < 0 ? R.minX + 0.02 : R.maxX - 0.02, H - 1.6, CZ, false);
    band.rotation.y = s < 0 ? Math.PI / 2 : -Math.PI / 2;
    group.add(band);
  }
  // The roof: a dark ceiling, steel trusses across, and rows of light panels along the pitch.
  const ceiling = mesh(new THREE.PlaneGeometry(W, D), toon('#3a4048'), CX, H, CZ, false);
  ceiling.rotation.x = Math.PI / 2;
  group.add(ceiling);
  for (let z = R.minZ + 2; z < R.maxZ; z += 4) parts.add(mesh(box(W, 0.35, 0.18), steel, CX, H - 0.35, z, false));
  const lamp = glow(null, '#fffbea');
  for (const x of [PITCH_CX - 4.2, PITCH_CX, PITCH_CX + 4.2]) {
    for (let z = PITCH.minZ + 1.5; z < PITCH.maxZ; z += 4) {
      group.add(mesh(box(0.5, 0.08, 2.4), lamp, x, H - 0.6, z, false));
      parts.add(mesh(box(0.62, 0.14, 2.52), dark, x, H - 0.52, z, false));
    }
  }

  // ---- The pitch's lines -------------------------------------------------------------------------
  const lines = new THREE.Group();
  const paint = toon('#ffffff');
  const strip = (w: number, d: number, x: number, z: number) => lines.add(flat(new THREE.PlaneGeometry(w, d), paint, x, 0.012, z));
  // Touchlines and goal lines, just inside the boards.
  strip(PW, LINE, PITCH_CX, PITCH.minZ + LINE / 2);
  strip(PW, LINE, PITCH_CX, PITCH.maxZ - LINE / 2);
  strip(LINE, PL, PITCH.minX + LINE / 2, PZ);
  strip(LINE, PL, PITCH.maxX - LINE / 2, PZ);
  // Halfway line, centre circle and spot.
  strip(PW, LINE, PITCH_CX, PZ);
  lines.add(flat(new THREE.RingGeometry(MARKS.circle - LINE / 2, MARKS.circle + LINE / 2, 64), paint, PITCH_CX, 0.012, PZ));
  lines.add(flat(new THREE.CircleGeometry(0.12, 16), paint, PITCH_CX, 0.013, PZ));
  // The penalty areas: a quarter circle from each post and a line between them (futsal's "D"), and the spot.
  for (const s of [-1, 1]) {
    const lineZ = s < 0 ? PITCH.minZ : PITCH.maxZ;
    const inward = -s;
    for (const px of [-1, 1]) {
      const cx = PITCH_CX + px * (GOAL.width / 2);
      // A quarter from the goal line round toward the middle of the pitch, on that post's side. (The
      // ring's angles go round its xy plane from +x; laid flat, its +y points to -z.)
      const start = inward > 0 ? (px > 0 ? -Math.PI / 2 : Math.PI) : px > 0 ? 0 : Math.PI / 2;
      lines.add(flat(new THREE.RingGeometry(MARKS.area - LINE / 2, MARKS.area + LINE / 2, 32, 1, start, Math.PI / 2), paint, cx, 0.012, lineZ));
    }
    strip(GOAL.width, LINE, PITCH_CX, lineZ + inward * MARKS.area);
    lines.add(flat(new THREE.CircleGeometry(0.1, 16), paint, PITCH_CX, 0.013, lineZ + inward * MARKS.spot));
  }
  group.add(mergeByMaterial(lines));

  // ---- The boards, their safety nets, the goals ----------------------------------------------------
  const boardTex = boardTexture();
  const boardMat = new THREE.MeshToonMaterial({ map: boardTex, gradientMap });
  const netTex = netTexture();
  const netMat = new THREE.MeshBasicMaterial({ map: netTex, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
  netMat.userData.outlineParameters = { visible: false };
  const safetyTex = netTexture(8);
  const safety = new THREE.MeshBasicMaterial({ map: safetyTex, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false, color: '#dfe7e2' });
  safety.userData.outlineParameters = { visible: false };
  const boardRun = (x0: number, z0: number, x1: number, z1: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    if (len < 0.05) return;
    const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    const tex = boardTex.clone();
    tex.repeat.set(len / 12, 1);
    tex.needsUpdate = true;
    const mat = boardMat.clone();
    mat.map = tex;
    const b = mesh(alongX ? box(len, BOARD.height, BOARD.thick) : box(BOARD.thick, BOARD.height, len), mat, (x0 + x1) / 2, BOARD.height / 2, (z0 + z1) / 2);
    // Face the texture into the pitch (a box maps it on every face; good enough from either side).
    group.add(b);
    parts.add(mesh(alongX ? box(len, 0.06, BOARD.thick + 0.06) : box(BOARD.thick + 0.06, 0.06, len), dark, (x0 + x1) / 2, BOARD.height + 0.03, (z0 + z1) / 2, false));
    // Keeps players on their side (tall: nobody hops over).
    colliders.push({ minX: Math.min(x0, x1) - (alongX ? 0 : BOARD.thick / 2), maxX: Math.max(x0, x1) + (alongX ? 0 : BOARD.thick / 2), minZ: Math.min(z0, z1) - (alongX ? BOARD.thick / 2 : 0), maxZ: Math.max(z0, z1) + (alongX ? BOARD.thick / 2 : 0), top: 3, fence: true });
  };
  const bx0 = PITCH.minX - BOARD.thick / 2;
  const bx1 = PITCH.maxX + BOARD.thick / 2;
  const bz0 = PITCH.minZ - BOARD.thick / 2;
  const bz1 = PITCH.maxZ + BOARD.thick / 2;
  const gl = PITCH_CX - GOAL.width / 2 - GOAL.post;
  const gr = PITCH_CX + GOAL.width / 2 + GOAL.post;
  // The sides, whole (you get onto the pitch by joining, E at the halfway boards), the ends either side of the goals.
  boardRun(bx0, bz0 - BOARD.thick / 2, bx0, bz1 + BOARD.thick / 2);
  boardRun(bx1, bz0 - BOARD.thick / 2, bx1, bz1 + BOARD.thick / 2);
  for (const z of [bz0, bz1]) {
    boardRun(bx0, z, gl, z);
    boardRun(gr, z, bx1, z);
  }
  // Safety nets over the boards: up to 4.5 m behind the goals, 3 m along the sides.
  const netWall = (w: number, h0: number, h1: number, x: number, z: number, rotY: number) => {
    const tex = safetyTex.clone();
    tex.repeat.set(w / 1.2, (h1 - h0) / 1.2);
    tex.needsUpdate = true;
    const m = safety.clone();
    m.map = tex;
    const p = mesh(new THREE.PlaneGeometry(w, h1 - h0), m, x, (h0 + h1) / 2, z, false);
    p.rotation.y = rotY;
    p.castShadow = false;
    group.add(p);
  };
  for (const z of [bz0, bz1]) netWall(PW + BOARD.thick * 2, BOARD.height, 4.5, PITCH_CX, z, 0);
  for (const x of [bx0, bx1]) netWall(PL + BOARD.thick * 2, BOARD.height, 3, x, PZ, Math.PI / 2);
  // Poles holding the nets up.
  for (const x of [bx0, bx1]) {
    for (let i = 0; i <= 4; i++) {
      const h = i === 0 || i === 4 ? 4.5 : 3;
      parts.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, h, 6), steel, x, h / 2, PITCH.minZ + (i * PL) / 4, false));
    }
  }

  // The goals: white posts and bar on the goal line, nets back to a frame on the floor.
  const postMat = toon('#ffffff');
  for (const s of [-1, 1]) {
    const lineZ = s < 0 ? PITCH.minZ : PITCH.maxZ;
    const back = lineZ + s * GOAL.depth;
    const gz = (lineZ + back) / 2;
    for (const px of [-1, 1]) {
      const x = PITCH_CX + px * (GOAL.width / 2 + GOAL.post / 2);
      parts.add(mesh(new THREE.CylinderGeometry(GOAL.post, GOAL.post, GOAL.height + GOAL.post, 10), postMat, x, (GOAL.height + GOAL.post) / 2, lineZ));
      // The frame's top and bottom back to the net's back.
      const top = mesh(new THREE.CylinderGeometry(0.02, 0.02, GOAL.depth, 6), steel, x, GOAL.height - 0.1, gz, false);
      top.rotation.x = Math.PI / 2;
      parts.add(top);
      const foot = mesh(new THREE.CylinderGeometry(0.025, 0.025, GOAL.depth, 6), steel, x, 0.025, gz, false);
      foot.rotation.x = Math.PI / 2;
      parts.add(foot);
      parts.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, GOAL.height - 0.1, 6), steel, x, (GOAL.height - 0.1) / 2, back, false));
    }
    const bar = mesh(new THREE.CylinderGeometry(GOAL.post, GOAL.post, GOAL.width + GOAL.post * 4, 10), postMat, PITCH_CX, GOAL.height + GOAL.post, lineZ);
    bar.rotation.z = Math.PI / 2;
    parts.add(bar);
    // The net: back, sides and roof.
    const net = (w: number, h: number, x: number, y: number, z: number, rx: number, ry: number) => {
      const tex = netTex.clone();
      tex.repeat.set(w / 0.5, h / 0.5);
      tex.needsUpdate = true;
      const m = netMat.clone();
      m.map = tex;
      const p = mesh(new THREE.PlaneGeometry(w, h), m, x, y, z, false);
      p.rotation.set(rx, ry, 0);
      p.castShadow = false;
      group.add(p);
    };
    net(GOAL.width, GOAL.height - 0.1, PITCH_CX, (GOAL.height - 0.1) / 2, back, 0, 0);
    for (const px of [-1, 1]) net(GOAL.depth, GOAL.height, PITCH_CX + px * (GOAL.width / 2 + GOAL.post / 2), GOAL.height / 2, gz, 0, Math.PI / 2);
    net(GOAL.width, GOAL.depth, PITCH_CX, GOAL.height - 0.05, gz, Math.PI / 2 - s * 0.08, 0);
    // Players can walk into the goal's mouth, not through its net.
    const nz0 = Math.min(lineZ, back);
    const nz1 = Math.max(lineZ, back);
    colliders.push({ minX: PITCH_CX - GOAL.width / 2 - 0.1, maxX: PITCH_CX + GOAL.width / 2 + 0.1, minZ: s < 0 ? back - 0.06 : back, maxZ: s < 0 ? back : back + 0.06, top: 2.4, fence: true });
    for (const px of [-1, 1]) {
      const x = PITCH_CX + px * (GOAL.width / 2 + 0.05);
      colliders.push({ minX: x - 0.06, maxX: x + 0.06, minZ: nz0, maxZ: nz1, top: 2.4, fence: true });
    }
  }

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

  // ---- Benches, the stand -----------------------------------------------------------------------
  for (const b of BENCHES) {
    const len = b.z1 - b.z0;
    const zc = (b.z0 + b.z1) / 2;
    parts.add(mesh(box(0.45, 0.08, len), wood, b.x, 0.45, zc));
    parts.add(mesh(box(0.08, 0.5, len), wood, b.x - 0.2, 0.75, zc));
    for (const z of [b.z0 + 0.2, zc, b.z1 - 0.2]) parts.add(mesh(box(0.4, 0.45, 0.06), steel, b.x, 0.22, z));
    // A roof of clear plastic over it, in the team's colour.
    const shelter = mesh(box(0.9, 0.05, len + 0.4), new THREE.MeshToonMaterial({ color: TEAM_COLOR[b.team], transparent: true, opacity: 0.6 }), b.x + 0.15, 1.9, zc, false);
    group.add(shelter);
    for (const z of [b.z0 - 0.1, b.z1 + 0.1]) parts.add(mesh(box(0.05, 1.9, 0.05), steel, b.x - 0.25, 0.95, z, false));
    colliders.push({ minX: b.x - 0.3, maxX: b.x + 0.25, minZ: b.z0, maxZ: b.z1, top: 0.5 });
  }
  const riser = toon('#8b949c');
  const seat = toon('#2f8f47');
  const rowD = (STAND.maxZ - STAND.minZ) / STAND.rows;
  for (let i = 0; i < STAND.rows; i++) {
    const z0 = STAND.minZ + i * rowD;
    const top = (i + 1) * STAND.rise;
    parts.add(mesh(box(STAND.maxX - STAND.minX, top, STAND.maxZ - z0), riser, (STAND.minX + STAND.maxX) / 2, top / 2, (z0 + STAND.maxZ) / 2));
    colliders.push({ minX: STAND.minX, maxX: STAND.maxX, minZ: z0, maxZ: STAND.maxZ, top });
    // Bucket seats along the back of each row, alternating green and white.
    for (let x = STAND.minX + 0.5; x < STAND.maxX - 0.3; x += 0.7) {
      parts.add(mesh(box(0.46, 0.14, 0.4), Math.round((x - STAND.minX) / 0.7) % 3 === 1 ? white : seat, x, top + 0.07, z0 + rowD - 0.3, true));
      parts.add(mesh(box(0.46, 0.4, 0.08), Math.round((x - STAND.minX) / 0.7) % 3 === 1 ? white : seat, x, top + 0.34, z0 + rowD - 0.08, false));
    }
  }
  // A rail along its front.
  const rail = mesh(new THREE.CylinderGeometry(0.03, 0.03, STAND.maxX - STAND.minX, 8), steel, (STAND.minX + STAND.maxX) / 2, 1.0, STAND.minZ - 0.05, false);
  rail.rotation.z = Math.PI / 2;
  parts.add(rail);
  for (let x = STAND.minX; x <= STAND.maxX + 0.01; x += 2.5) parts.add(mesh(box(0.05, 1.0, 0.05), steel, x, 0.5, STAND.minZ - 0.05, false));

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

  group.add(mergeByMaterial(parts));
  return {
    group,
    colliders,
    interactables,
    pickables: [group],
    exit,
    setBall,
    setBoard,
    update() {},
  };
}
