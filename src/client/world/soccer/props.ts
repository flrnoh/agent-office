import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BENCHES, BOARD, GOAL, MARKS, PITCH, PITCH_CX, SOCCER_ROOM, STAND, TEAM_COLOR, type GoalSide, type Team } from '../../../shared/soccer';
import type { Collider } from '../types';
import { mesh, toon } from '../toon';
import { box, canvasTexture, glow, FONT } from '../casino/parts';
import type { Seat } from './crowd';

/*
 * The soccer hall's details (flrnoh fork, see FORK.md "The soccer hall"): the shell (padded walls,
 * ribbed cladding, a band of windows, steel trusses under the roof), the floodlights and the pools of
 * light they throw on the pitch, the turf and its crest, proper goals (round posts, a weighted frame,
 * nets that sag and billow), the stands (south: blue, north: red, a gallery along the east wall) and
 * their seats, the dugouts with bottles, cones and a ball bag, the players' tunnel and a locker room
 * behind glass. Plain-coloured parts go into `parts` (merged into one draw call by interior.ts); the
 * textured and glowing ones are few, each one mesh.
 */

const R = SOCCER_ROOM;
const H = R.height;
const PW = PITCH.maxX - PITCH.minX;
const PL = PITCH.maxZ - PITCH.minZ;
const PZ = (PITCH.minZ + PITCH.maxZ) / 2;

/** The steel trusses across the hall, every 4 m along it; the floodlights hang from them. */
export const TRUSS_Z = [-16, -12, -8, -4, 0, 4, 8, 12, 16];
const TRUSS_DEPTH = 1.1;
/** Where the floodlights hang (x across, the trusses along), and how high. */
export const FLOOD_X = [PITCH_CX - 4.6, PITCH_CX, PITCH_CX + 4.6];
export const FLOOD_Z = TRUSS_Z.filter((z) => z > PITCH.minZ && z < PITCH.maxZ);
const FLOOD_Y = H - TRUSS_DEPTH - 0.35;

/** The stand at the north end (the red end): west of the doors, rows climbing to the wall. */
export const NORTH_STAND = { minX: R.minX, maxX: 1.9, minZ: R.minZ, maxZ: R.minZ + 2.4, rows: 3, rise: 0.3 } as const;
/** The gallery along the east wall, over the walkway: its floor, and how far along it runs. */
export const GALLERY = { minX: PITCH.maxX + 0.3, maxX: R.maxX, y: 3.2, minZ: -12, maxZ: 12 } as const;
/** The locker room behind glass in the west wall, and the players' tunnel. */
const LOCKER = { z0: -14.4, z1: -9.6, y0: 0.9, y1: 2.6, depth: 3.2 } as const;
const TUNNEL = { z0: -1.2, z1: 1.2, h: 2.6, depth: 4 } as const;

const flatMesh = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
  const m = mesh(geo, mat, x, y, z, false);
  m.rotation.x = -Math.PI / 2;
  m.receiveShadow = true;
  return m;
};

/** A stick from a to b (a box `w` thick), for trusses and frames. */
function beam(a: THREE.Vector3, b: THREE.Vector3, w: number, mat: THREE.Material, round = false): THREE.Mesh {
  const len = a.distanceTo(b);
  const geo = round ? new THREE.CylinderGeometry(w / 2, w / 2, len, 10) : box(w, len, w);
  const m = mesh(geo, mat, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, false);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return m;
}
const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// ---- The pitch -----------------------------------------------------------------------------------------

/** Artificial turf: mown stripes across the pitch, a fine grain of blades, rubber crumbs. One tile = two stripes. */
function turfTexture(): THREE.CanvasTexture {
  const t = canvasTexture(256, 256, (g) => {
    g.fillStyle = '#4db05c';
    g.fillRect(0, 0, 256, 128);
    g.fillStyle = '#378f43';
    g.fillRect(0, 128, 256, 128);
    for (let i = 0; i < 5200; i++) {
      const y = Math.random() * 256;
      const light = y < 128;
      g.fillStyle = Math.random() < 0.5 ? `rgba(255,255,255,${light ? 0.07 : 0.04})` : 'rgba(0,40,0,0.09)';
      g.fillRect(Math.random() * 256, y, 1, 2 + Math.random() * 2);
    }
    g.fillStyle = 'rgba(20,20,20,0.22)';
    for (let i = 0; i < 220; i++) g.fillRect(Math.random() * 256, Math.random() * 256, 1.5, 1.5);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** FLOGGE FC's crest, painted in the centre circle: a shield with a ball, the name round it. */
function crestTexture(): THREE.CanvasTexture {
  return canvasTexture(512, 512, (g) => {
    g.clearRect(0, 0, 512, 512);
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = 10;
    g.beginPath();
    g.arc(256, 256, 236, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 4;
    g.beginPath();
    g.arc(256, 256, 214, 0, Math.PI * 2);
    g.stroke();
    // The shield.
    g.beginPath();
    g.moveTo(256 - 92, 150);
    g.lineTo(256 + 92, 150);
    g.lineTo(256 + 92, 262);
    g.quadraticCurveTo(256 + 88, 344, 256, 380);
    g.quadraticCurveTo(256 - 88, 344, 256 - 92, 262);
    g.closePath();
    g.lineWidth = 12;
    g.stroke();
    // Red and blue halves inside it, faint.
    g.save();
    g.clip();
    g.fillStyle = 'rgba(230,57,70,0.55)';
    g.fillRect(150, 140, 106, 260);
    g.fillStyle = 'rgba(39,125,240,0.55)';
    g.fillRect(256, 140, 106, 260);
    g.restore();
    // The ball in it.
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.beginPath();
    g.arc(256, 262, 46, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(30,40,34,0.8)';
    g.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = (i * Math.PI * 2) / 5;
      g[i ? 'lineTo' : 'moveTo'](256 + Math.sin(a) * 17, 262 - Math.cos(a) * 17);
    }
    g.closePath();
    g.fill();
    // The name round the top, the year round the bottom.
    g.fillStyle = 'rgba(255,255,255,0.92)';
    g.font = `900 46px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const arc = (text: string, r: number, mid: number, dir: 1 | -1) => {
      const chars = [...text];
      const step = 0.2;
      chars.forEach((ch, i) => {
        const a = mid + dir * (i - (chars.length - 1) / 2) * step;
        g.save();
        g.translate(256 + Math.sin(a) * r, 256 - Math.cos(a) * r);
        g.rotate(dir > 0 ? a : a + Math.PI);
        g.fillText(ch, 0, 0);
        g.restore();
      });
    };
    arc('FLOGGE FC', 180, 0, 1);
    g.font = `800 30px ${FONT}`;
    arc('SEIT 2026', 184, Math.PI, -1);
  });
}

/** The floor round the pitch, the turf, its lines and the crest. */
export function buildPitch(group: THREE.Group) {
  const gradientMap = (toon('#fff') as THREE.MeshToonMaterial).gradientMap;
  // A rubber sports floor round the boards, darker in the walkways.
  const apron = canvasTexture(128, 128, (g) => {
    g.fillStyle = '#4d5560';
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.08)';
      g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
    }
  });
  apron.wrapS = apron.wrapT = THREE.RepeatWrapping;
  apron.repeat.set((R.maxX - R.minX) / 3, (R.maxZ - R.minZ) / 3);
  group.add(flatMesh(new THREE.PlaneGeometry(R.maxX - R.minX + 0.6, R.maxZ - R.minZ + 0.6), new THREE.MeshToonMaterial({ map: apron, gradientMap }), (R.minX + R.maxX) / 2, 0, (R.minZ + R.maxZ) / 2));
  const turf = turfTexture();
  // Stripes across the pitch, 2.25 m each (twelve over its length); the goals' floors carry on the pattern.
  turf.repeat.set(PW / 4.5, PL / 4.5);
  const turfMat = new THREE.MeshToonMaterial({ map: turf, gradientMap });
  group.add(flatMesh(new THREE.PlaneGeometry(PW + 2 * BOARD.thick, PL + 2 * BOARD.thick), turfMat, PITCH_CX, 0.004, PZ));
  for (const s of [-1, 1]) group.add(flatMesh(new THREE.PlaneGeometry(GOAL.width + 0.2, GOAL.depth + 0.1), turfMat, PITCH_CX, 0.008, /* over the pitch's edge, under the lines */ PZ + s * (PL / 2 + GOAL.depth / 2)));

  // The lines, crisp white, lifted clear of the turf.
  const LINE = 0.08;
  const paint = new THREE.MeshBasicMaterial({ color: '#f7faf5', polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  paint.userData.outlineParameters = { visible: false };
  const geos: THREE.BufferGeometry[] = [];
  const put = (geo: THREE.BufferGeometry, x: number, z: number) => {
    geo.rotateX(-Math.PI / 2);
    geo.translate(x, 0.012, z);
    for (const k of Object.keys(geo.attributes)) if (k !== 'position') geo.deleteAttribute(k);
    geos.push(geo.index ? geo.toNonIndexed() : geo);
  };
  const strip = (w: number, d: number, x: number, z: number) => put(new THREE.PlaneGeometry(w, d), x, z);
  strip(PW, LINE, PITCH_CX, PITCH.minZ + LINE / 2);
  strip(PW, LINE, PITCH_CX, PITCH.maxZ - LINE / 2);
  strip(LINE, PL, PITCH.minX + LINE / 2, PZ);
  strip(LINE, PL, PITCH.maxX - LINE / 2, PZ);
  strip(PW, LINE, PITCH_CX, PZ);
  put(new THREE.RingGeometry(MARKS.circle - LINE / 2, MARKS.circle + LINE / 2, 72), PITCH_CX, PZ);
  put(new THREE.CircleGeometry(0.12, 16), PITCH_CX, PZ);
  for (const s of [-1, 1]) {
    const lineZ = s < 0 ? PITCH.minZ : PITCH.maxZ;
    const inward = -s;
    for (const px of [-1, 1]) {
      const cx = PITCH_CX + px * (GOAL.width / 2);
      // A quarter from the goal line round toward the middle, on that post's side (futsal's "D"). Laid
      // flat, the ring's +y points to -z.
      const start = inward > 0 ? (px > 0 ? -Math.PI / 2 : Math.PI) : px > 0 ? 0 : Math.PI / 2;
      put(new THREE.RingGeometry(MARKS.area - LINE / 2, MARKS.area + LINE / 2, 36, 1, start, Math.PI / 2), cx, lineZ);
    }
    strip(GOAL.width, LINE, PITCH_CX, lineZ + inward * MARKS.area);
    put(new THREE.CircleGeometry(0.1, 16), PITCH_CX, lineZ + inward * MARKS.spot);
    // The corner arcs.
    for (const px of [-1, 1]) {
      const cx = px < 0 ? PITCH.minX : PITCH.maxX;
      const start = inward > 0 ? (px > 0 ? Math.PI : -Math.PI / 2) : px > 0 ? Math.PI / 2 : 0;
      put(new THREE.RingGeometry(0.25 - LINE / 2, 0.25 + LINE / 2, 8, 1, start, Math.PI / 2), cx, lineZ);
    }
  }
  const lines = new THREE.Mesh(mergeGeometries(geos)!, paint);
  lines.receiveShadow = true;
  group.add(lines);

  // The crest in the centre circle.
  const crest = new THREE.MeshToonMaterial({ map: crestTexture(), gradientMap, transparent: true, alphaTest: 0.1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, depthWrite: false });
  crest.userData.outlineParameters = { visible: false };
  const c = flatMesh(new THREE.PlaneGeometry(4.6, 4.6), crest, PITCH_CX, 0.009, PZ);
  c.rotation.z = Math.PI / 2;
  group.add(c);
}

// ---- The shell: walls, windows, roof ---------------------------------------------------------------

/** The walls inside: padded dark green below, ribbed grey cladding above, a green stripe between. One tile is 4 m along, the wall's whole height. */
function wallTexture(): THREE.CanvasTexture {
  const t = canvasTexture(256, 512, (g) => {
    const y = (m: number) => 512 - (m / H) * 512;
    g.fillStyle = '#d9dcd8';
    g.fillRect(0, 0, 256, 512);
    // Ribbed cladding.
    for (let x = 0; x < 256; x += 16) {
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fillRect(x, 0, 5, y(2.4));
      g.fillStyle = 'rgba(0,0,0,0.09)';
      g.fillRect(x + 5, 0, 2, y(2.4));
    }
    // A band under the windows.
    g.fillStyle = '#b9bfc4';
    g.fillRect(0, y(5.05), 256, y(4.9) - y(5.05));
    // Padding: panels with seams.
    g.fillStyle = '#1f4d38';
    g.fillRect(0, y(2.2), 256, 512 - y(2.2));
    g.fillStyle = 'rgba(255,255,255,0.06)';
    g.fillRect(0, y(2.2), 256, 6);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    for (let x = 0; x < 256; x += 64) g.fillRect(x, y(2.2), 3, 512 - y(2.2));
    g.fillRect(0, y(1.1), 256, 3);
    // The stripe on top of the padding, and the skirting.
    g.fillStyle = '#35c46a';
    g.fillRect(0, y(2.4), 256, y(2.2) - y(2.4));
    g.fillStyle = '#15191e';
    g.fillRect(0, y(0.12), 256, 512 - y(0.12));
  });
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** The windows' glazing: panes between mullions (tinted by daylight in update). One tile 3 m. */
function glazingTexture(): THREE.CanvasTexture {
  const t = canvasTexture(192, 96, (g) => {
    const grd = g.createLinearGradient(0, 0, 0, 96);
    grd.addColorStop(0, '#ffffff');
    grd.addColorStop(1, '#c9d4dc');
    g.fillStyle = grd;
    g.fillRect(0, 0, 192, 96);
    g.fillStyle = 'rgba(255,255,255,0.4)';
    g.beginPath();
    g.moveTo(20, 96);
    g.lineTo(70, 0);
    g.lineTo(96, 0);
    g.lineTo(46, 96);
    g.fill();
    g.fillStyle = '#39424b';
    g.fillRect(0, 0, 192, 5);
    g.fillRect(0, 91, 192, 5);
    g.fillRect(0, 46, 192, 3);
    for (let x = 0; x < 192; x += 64) g.fillRect(x, 0, 5, 96);
  });
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

export interface Shell {
  /** 1 by day, 0 at night: the windows go from daylight to the night outside. */
  setDaylight(k: number): void;
}

/** A panel of wall from (x0, z0) to (x1, z1), y0 to y1, facing into the room; UVs in world meters (the texture's 4 m wide, H tall). */
function wallPanel(x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, along0: number, tile = 4, height: number = H): THREE.BufferGeometry {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const geo = new THREE.PlaneGeometry(len, y1 - y0);
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (along0 + uv.getX(i) * len) / tile, (y0 + uv.getY(i) * (y1 - y0)) / height);
  // A plane faces +z; turn it so it faces into the room from its wall.
  const dx = (x1 - x0) / len;
  const dz = (z1 - z0) / len;
  geo.rotateY(Math.atan2(-dz, dx));
  geo.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return geo;
}

export function buildShell(group: THREE.Group, parts: THREE.Group): Shell {
  const gradientMap = (toon('#fff') as THREE.MeshToonMaterial).gradientMap;
  const steel = toon('#aeb6bf');
  const dark = toon('#2b3138');
  const panels: THREE.BufferGeometry[] = [];
  const x0 = R.minX;
  const x1 = R.maxX;
  const z0 = R.minZ;
  const z1 = R.maxZ;
  // Each wall's panels run clockwise seen from above, so each faces in: north (x0→x1), east (z0→z1), south (x1→x0), west (z1→z0).
  panels.push(wallPanel(x0, z0, x1, z0, 0, H, 0));
  panels.push(wallPanel(x1, z0, x1, z1, 0, H, 0));
  panels.push(wallPanel(x1, z1, x0, z1, 0, H, 0));
  // The west wall has holes: the locker room's window and the players' tunnel.
  const west = (za: number, zb: number, ya: number, yb: number) => panels.push(wallPanel(x0, zb, x0, za, ya, yb, z1 - zb));
  west(z0, LOCKER.z0, 0, H);
  west(LOCKER.z0, LOCKER.z1, 0, LOCKER.y0);
  west(LOCKER.z0, LOCKER.z1, LOCKER.y1, H);
  west(LOCKER.z1, TUNNEL.z0, 0, H);
  west(TUNNEL.z0, TUNNEL.z1, TUNNEL.h, H);
  west(TUNNEL.z1, z1, 0, H);
  const wallMat = new THREE.MeshToonMaterial({ map: wallTexture(), gradientMap });
  group.add(mesh(mergeGeometries(panels.map((p) => p.toNonIndexed()))!, wallMat, 0, 0, 0, false));

  // The windows high up the long walls: panes and mullions, daylight or the night behind them.
  const glazeTex = glazingTexture();
  const glaze = glow(glazeTex, '#e8f1f6');
  const band: THREE.BufferGeometry[] = [];
  const gy0 = 5.05;
  const gy1 = 6.7;
  band.push(wallPanel(x1 - 0.02, z0 + 1, x1 - 0.02, z1 - 1, gy0, gy1, 0, 3, gy1 - gy0));
  band.push(wallPanel(x0 + 0.02, z1 - 1, x0 + 0.02, z0 + 1, gy0, gy1, 0, 3, gy1 - gy0));
  for (const b of band) {
    // Undo wallPanel's y/height mapping: the glazing's tile is the band's own height.
    const uv = b.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) - gy0 / (gy1 - gy0));
  }
  group.add(mesh(mergeGeometries(band.map((p) => p.toNonIndexed()))!, glaze, 0, 0, 0, false));
  // Sills and a head over them.
  for (const x of [x0 + 0.12, x1 - 0.12]) {
    parts.add(mesh(box(0.24, 0.1, z1 - z0 - 2), dark, x, gy0 - 0.05, (z0 + z1) / 2, false));
    parts.add(mesh(box(0.24, 0.1, z1 - z0 - 2), dark, x, gy1 + 0.05, (z0 + z1) / 2, false));
  }

  // The roof: sheeting between the trusses.
  const roofTex = canvasTexture(64, 64, (g) => {
    g.fillStyle = '#4a525b';
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = 'rgba(255,255,255,0.08)';
    for (let i = 0; i < 64; i += 16) g.fillRect(i, 0, 6, 64);
  });
  roofTex.wrapS = roofTex.wrapT = THREE.RepeatWrapping;
  roofTex.repeat.set((x1 - x0) / 1, 1);
  const ceiling = mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), new THREE.MeshToonMaterial({ map: roofTex, gradientMap }), (x0 + x1) / 2, H, (z0 + z1) / 2, false);
  ceiling.rotation.x = Math.PI / 2;
  group.add(ceiling);

  // Steel trusses across: top and bottom chords, posts and diagonals between them; purlins along.
  const top = H - 0.1;
  const bot = H - TRUSS_DEPTH;
  const bays = 12;
  for (const z of TRUSS_Z) {
    parts.add(beam(v3(x0, top, z), v3(x1, top, z), 0.14, steel));
    parts.add(beam(v3(x0 + 0.4, bot, z), v3(x1 - 0.4, bot, z), 0.12, steel));
    for (let i = 0; i <= bays; i++) {
      const xa = x0 + 0.4 + (i * (x1 - x0 - 0.8)) / bays;
      parts.add(beam(v3(xa, bot, z), v3(xa, top, z), 0.06, steel));
      if (i < bays) {
        const xb = x0 + 0.4 + ((i + 1) * (x1 - x0 - 0.8)) / bays;
        parts.add(i % 2 ? beam(v3(xa, bot, z), v3(xb, top, z), 0.05, steel) : beam(v3(xa, top, z), v3(xb, bot, z), 0.05, steel));
      }
    }
    // Brackets into the walls.
    for (const x of [x0 + 0.1, x1 - 0.1]) parts.add(mesh(box(0.2, 1.6, 0.3), dark, x, H - 0.8, z, false));
  }
  for (let x = x0 + 1.5; x < x1; x += 3) parts.add(mesh(box(0.1, 0.16, z1 - z0), steel, x, top - 0.12, (z0 + z1) / 2, false));

  // Banners hanging from the trusses over each end: red over the north, blue over the south.
  for (const [z, team] of [
    [-12, 'red'],
    [12, 'blue'],
  ] as const) {
    for (const x of [-5.6, -2.8, 2.8, 5.6]) {
      parts.add(mesh(box(0.9, 2.2, 0.03), toon(TEAM_COLOR[team]), x, bot - 1.15, z + 0.12, false));
      parts.add(mesh(box(0.9, 0.2, 0.035), toon('#ffffff'), x, bot - 1.0, z + 0.12, false));
      parts.add(mesh(box(1.0, 0.05, 0.05), dark, x, bot - 0.04, z + 0.12, false));
    }
  }

  const day = new THREE.Color('#eaf3f8');
  const night = new THREE.Color('#1c2740');
  return {
    setDaylight(k) {
      glaze.color.copy(night).lerp(day, THREE.MathUtils.clamp(k, 0, 1));
    },
  };
}

// ---- The locker room and the players' tunnel -----------------------------------------------------

export function buildBackRooms(group: THREE.Group, parts: THREE.Group) {
  const x0 = R.minX;
  const tile = toon('#dfe3e6');
  const floor = toon('#8d959d');
  const dark = toon('#2b3138');
  const bench = toon('#c49262');
  // The locker room: a room behind the west wall, seen through a big window.
  {
    const z0 = LOCKER.z0 - 0.4;
    const z1 = LOCKER.z1 + 0.4;
    const zc = (z0 + z1) / 2;
    const d = LOCKER.depth;
    const xb = x0 - d;
    parts.add(mesh(box(d, 0.1, z1 - z0), floor, x0 - d / 2, -0.05, zc, false));
    parts.add(mesh(box(d, 0.1, z1 - z0), tile, x0 - d / 2, 2.95, zc, false));
    parts.add(mesh(box(0.1, 3, z1 - z0), tile, xb - 0.05, 1.5, zc, false));
    for (const z of [z0 - 0.05, z1 + 0.05]) parts.add(mesh(box(d, 3, 0.1), tile, x0 - d / 2, 1.5, z, false));
    // Lockers along the back, red doors to the north, blue to the south.
    for (let z = z0 + 0.35; z < z1 - 0.3; z += 0.5) {
      const team: Team = z < zc ? 'red' : 'blue';
      parts.add(mesh(box(0.5, 1.9, 0.46), toon(TEAM_COLOR[team]), xb + 0.3, 0.95, z, false));
      parts.add(mesh(box(0.02, 0.2, 0.04), dark, xb + 0.56, 1.1, z + 0.14, false));
      // A shirt on a peg in front of every other locker.
      if (Math.round((z - z0) / 0.5) % 2 === 0) {
        parts.add(mesh(box(0.06, 0.62, 0.42), toon(TEAM_COLOR[team]), xb + 0.62, 1.5, z, false));
        parts.add(mesh(box(0.065, 0.14, 0.14), toon('#ffffff'), xb + 0.63, 1.62, z, false));
      }
    }
    // A bench down the middle, and a tactics board on the south wall.
    parts.add(mesh(box(0.45, 0.08, z1 - z0 - 1.2), bench, x0 - d / 2 + 0.2, 0.45, zc, false));
    for (const z of [z0 + 0.8, z1 - 0.8]) parts.add(mesh(box(0.35, 0.45, 0.06), dark, x0 - d / 2 + 0.2, 0.22, z, false));
    parts.add(mesh(box(1.6, 1.0, 0.04), toon('#f7f7f2'), x0 - d / 2 - 0.2, 1.6, z1 - 0.02, false));
    parts.add(mesh(box(0.08, 0.08, 0.05), toon(TEAM_COLOR.red), x0 - d / 2 - 0.5, 1.7, z1 - 0.05, false));
    parts.add(mesh(box(0.08, 0.08, 0.05), toon(TEAM_COLOR.blue), x0 - d / 2 + 0.1, 1.45, z1 - 0.05, false));
    // Its light, glowing, and the glass (a faint sheen) with a frame.
    const lamp = mesh(new THREE.PlaneGeometry(0.4, z1 - z0 - 1), glow(null, '#fff8e6'), x0 - d / 2, 2.89, zc, false);
    lamp.rotation.x = Math.PI / 2;
    group.add(lamp);
    const glassMat = new THREE.MeshBasicMaterial({ color: '#cfe6f0', transparent: true, opacity: 0.16, depthWrite: false });
    glassMat.userData.outlineParameters = { visible: false };
    const glass = mesh(new THREE.PlaneGeometry(LOCKER.z1 - LOCKER.z0, LOCKER.y1 - LOCKER.y0), glassMat, x0 + 0.01, (LOCKER.y0 + LOCKER.y1) / 2, (LOCKER.z0 + LOCKER.z1) / 2, false);
    glass.rotation.y = Math.PI / 2;
    group.add(glass);
    for (const y of [LOCKER.y0, LOCKER.y1]) parts.add(mesh(box(0.34, 0.08, LOCKER.z1 - LOCKER.z0 + 0.08), dark, x0 - 0.13, y, (LOCKER.z0 + LOCKER.z1) / 2, false));
    for (const z of [LOCKER.z0, LOCKER.z1, (LOCKER.z0 + LOCKER.z1) / 2]) parts.add(mesh(box(0.34, LOCKER.y1 - LOCKER.y0, 0.08), dark, x0 - 0.13, (LOCKER.y0 + LOCKER.y1) / 2, z, false));
    const sign = mesh(new THREE.PlaneGeometry(2.2, 0.36), glow(canvasTexture(512, 84, (g) => {
      g.fillStyle = '#1d3b2c';
      g.fillRect(0, 0, 512, 84);
      g.fillStyle = '#ffffff';
      g.font = `900 46px ${FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('KABINE · LOCKER ROOM', 256, 44);
    })), x0 + 0.02, LOCKER.y1 + 0.35, (LOCKER.z0 + LOCKER.z1) / 2, false);
    sign.rotation.y = Math.PI / 2;
    group.add(sign);
  }
  // The players' tunnel: a lit corridor into the west wall between the benches, padded in the teams' colours.
  {
    const { z0, z1, h, depth } = TUNNEL;
    const zc = (z0 + z1) / 2;
    const xb = x0 - depth;
    parts.add(mesh(box(depth, 0.1, z1 - z0), toon('#3b434c'), x0 - depth / 2, -0.05, zc, false));
    parts.add(mesh(box(depth, 0.1, z1 - z0), toon('#2a3037'), x0 - depth / 2, h + 0.05, zc, false));
    parts.add(mesh(box(depth, h, 0.1), toon(TEAM_COLOR.red), x0 - depth / 2, h / 2, z0 - 0.05, false));
    parts.add(mesh(box(depth, h, 0.1), toon(TEAM_COLOR.blue), x0 - depth / 2, h / 2, z1 + 0.05, false));
    // The mouth: a padded frame.
    parts.add(mesh(box(0.4, 0.3, z1 - z0 + 0.6), dark, x0 + 0.1, h + 0.15, zc, false));
    for (const [z, team] of [
      [z0 - 0.15, 'red'],
      [z1 + 0.15, 'blue'],
    ] as const) parts.add(mesh(box(0.4, h, 0.3), toon(TEAM_COLOR[team]), x0 + 0.1, h / 2, z, false));
    // Lights down its ceiling, and the far end lit up with the crest's colours.
    for (let x = x0 - 0.5; x > xb + 0.3; x -= 1) {
      const l = mesh(new THREE.PlaneGeometry(0.6, 0.18), glow(null, '#f3fbff'), x, h - 0.01, zc, false);
      l.rotation.x = Math.PI / 2;
      group.add(l);
    }
    const end = mesh(new THREE.PlaneGeometry(z1 - z0, h), glow(canvasTexture(256, 256, (g) => {
      const grd = g.createLinearGradient(0, 0, 0, 256);
      grd.addColorStop(0, '#fdfbe9');
      grd.addColorStop(1, '#c8d2cc');
      g.fillStyle = grd;
      g.fillRect(0, 0, 256, 256);
      g.fillStyle = '#1d3b2c';
      g.font = `900 40px ${FONT}`;
      g.textAlign = 'center';
      g.fillText('FLOGGE FC', 128, 90);
      g.fillStyle = TEAM_COLOR.red;
      g.fillRect(40, 120, 88, 10);
      g.fillStyle = TEAM_COLOR.blue;
      g.fillRect(128, 120, 88, 10);
      g.fillStyle = '#51606b';
      g.fillRect(88, 150, 80, 106);
    })), xb + 0.06, h / 2, zc, false);
    end.rotation.y = Math.PI / 2;
    group.add(end);
    const sign = mesh(new THREE.PlaneGeometry(2.6, 0.4), glow(canvasTexture(640, 96, (g) => {
      g.fillStyle = '#101418';
      g.fillRect(0, 0, 640, 96);
      g.fillStyle = '#ffffff';
      g.font = `900 50px ${FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('SPIELERTUNNEL', 320, 50);
    })), x0 + 0.32, h + 0.5, zc, false);
    sign.rotation.y = Math.PI / 2;
    group.add(sign);
  }
}

// ---- Floodlights -------------------------------------------------------------------------------------

export interface Floodlights {
  /** How bright (1 = normal; more flares, less is dimmed), and how dark it is outside (0..1: the pools show more at night). */
  set(level: number, night?: number): void;
}

export function buildFloodlights(group: THREE.Group, parts: THREE.Group): Floodlights {
  const dark = toon('#252a31');
  const steel = toon('#aeb6bf');
  const lens: THREE.BufferGeometry[] = [];
  for (const x of FLOOD_X) {
    for (const z of FLOOD_Z) {
      // A long housing on two hangers from the truss, the lens underneath.
      parts.add(mesh(box(0.56, 0.18, 1.5), dark, x, FLOOD_Y, z, false));
      parts.add(mesh(box(0.66, 0.05, 1.6), steel, x, FLOOD_Y + 0.1, z, false));
      for (const s of [-1, 1]) parts.add(mesh(box(0.03, H - TRUSS_DEPTH - FLOOD_Y, 0.03), steel, x, (FLOOD_Y + H - TRUSS_DEPTH) / 2, z + s * 0.6, false));
      const g = new THREE.PlaneGeometry(0.46, 1.4);
      g.rotateX(Math.PI / 2);
      g.translate(x, FLOOD_Y - 0.092, z);
      lens.push(g);
    }
  }
  const lensMat = glow(null, '#fffbea');
  group.add(mesh(mergeGeometries(lens)!, lensMat, 0, 0, 0, false));

  // The pools of light they throw on the pitch: soft ovals, added onto the turf.
  const W = PW + 3;
  const L = PL + 3;
  const pools = canvasTexture(256, 512, (g) => {
    g.fillStyle = '#000000';
    g.fillRect(0, 0, 256, 512);
    g.globalCompositeOperation = 'lighter';
    for (const x of FLOOD_X) {
      for (const z of FLOOD_Z) {
        const px = ((x - PITCH_CX + W / 2) / W) * 256;
        const pz = ((z - PZ + L / 2) / L) * 512;
        const grd = g.createRadialGradient(px, pz, 0, px, pz, 70);
        grd.addColorStop(0, 'rgba(255,246,220,0.55)');
        grd.addColorStop(0.5, 'rgba(255,246,220,0.22)');
        grd.addColorStop(1, 'rgba(255,246,220,0)');
        g.fillStyle = grd;
        g.save();
        g.translate(px, pz);
        g.scale(1, 1.25);
        g.translate(-px, -pz);
        g.fillRect(px - 80, pz - 80, 160, 160);
        g.restore();
      }
    }
  });
  const poolMat = new THREE.MeshBasicMaterial({ map: pools, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.32, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  poolMat.toneMapped = false;
  poolMat.userData.outlineParameters = { visible: false };
  const pool = flatMesh(new THREE.PlaneGeometry(W, L), poolMat, PITCH_CX, 0.016, PZ);
  pool.receiveShadow = false;
  pool.raycast = () => {};
  group.add(pool);
  const base = new THREE.Color('#fffbea');
  return {
    set(level, night = 0) {
      lensMat.color.copy(base).multiplyScalar(Math.max(0.25, level));
      poolMat.opacity = (0.32 + 0.22 * night) * Math.max(0, level);
    },
  };
}

// ---- Goals ---------------------------------------------------------------------------------------------

/** A net between four corners (a, b along the top, d, c along the bottom), sagging `sag` along `dir` in the middle; UVs in 0.5 m tiles. */
function netPatch(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, dir: THREE.Vector3, sag: number, nu = 10, nv = 8): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const wu = Math.max(a.distanceTo(b), d.distanceTo(c));
  const wv = Math.max(a.distanceTo(d), b.distanceTo(c));
  const p = new THREE.Vector3();
  const q = new THREE.Vector3();
  for (let j = 0; j <= nv; j++) {
    const v = j / nv;
    for (let i = 0; i <= nu; i++) {
      const u = i / nu;
      p.copy(a).lerp(b, u);
      q.copy(d).lerp(c, u);
      p.lerp(q, v);
      p.addScaledVector(dir, sag * Math.sin(Math.PI * u) * Math.sin(Math.PI * v));
      pos.push(p.x, p.y, p.z);
      uv.push((u * wu) / 0.5, (v * wv) / 0.5);
    }
  }
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const k = j * (nu + 1) + i;
      idx.push(k, k + nu + 1, k + 1, k + 1, k + nu + 1, k + nu + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  return geo;
}

/** A goal's net: knotted white cord, crisp (alpha-tested, so it sorts fine). */
function netTexture(): THREE.CanvasTexture {
  const t = canvasTexture(64, 64, (g) => {
    g.clearRect(0, 0, 64, 64);
    g.strokeStyle = '#ffffff';
    g.lineWidth = 3;
    for (let i = 0; i <= 64; i += 16) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i, 64);
      g.moveTo(0, i);
      g.lineTo(64, i);
      g.stroke();
    }
    g.fillStyle = '#ffffff';
    for (let x = 0; x <= 64; x += 16) for (let y = 0; y <= 64; y += 16) g.fillRect(x - 2.5, y - 2.5, 5, 5);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

export interface GoalNets {
  /** The ball hit a net (a goal, a shot into the side netting): it billows out round (x, y) and settles. */
  billow(side: GoalSide, x: number, y: number, strength: number): void;
  update(dt: number): void;
}

/** Depth of the goal's top at the back (the bottom goes back GOAL.depth). */
const TOP_DEPTH = 0.8;

export function buildGoals(group: THREE.Group, parts: THREE.Group, colliders: Collider[]): GoalNets {
  const white = toon('#ffffff');
  const frame = toon('#c3c9cf');
  const weight = toon('#30363d');
  const netMat = new THREE.MeshBasicMaterial({ map: netTexture(), color: '#f4f6f2', side: THREE.DoubleSide, alphaTest: 0.45, transparent: false });
  netMat.userData.outlineParameters = { visible: false };
  const rest: THREE.BufferGeometry[] = [];
  const backs: { side: GoalSide; mesh: THREE.Mesh; base: Float32Array; out: THREE.Vector3; hit: { x: number; y: number; k: number; t: number } }[] = [];
  const ph = GOAL.height + GOAL.post;
  for (const s of [-1, 1]) {
    const side: GoalSide = s < 0 ? 'north' : 'south';
    const lineZ = s < 0 ? PITCH.minZ : PITCH.maxZ;
    const back = lineZ + s * GOAL.depth;
    const topBack = lineZ + s * TOP_DEPTH;
    const px = GOAL.width / 2 + GOAL.post / 2;
    const out = v3(0, 0, s);
    for (const sx of [-1, 1]) {
      const x = PITCH_CX + sx * px;
      // The post: round, white.
      parts.add(mesh(new THREE.CylinderGeometry(GOAL.post, GOAL.post, ph, 16), white, x, ph / 2, lineZ));
      // The frame back from it: along the top, down the back, and the weighted base along the floor.
      parts.add(beam(v3(x, GOAL.height - 0.02, lineZ), v3(x, GOAL.height - 0.08, topBack), 0.04, frame, true));
      parts.add(beam(v3(x, GOAL.height - 0.08, topBack), v3(x, 0.04, back), 0.04, frame, true));
      parts.add(mesh(box(0.09, 0.07, GOAL.depth), weight, x, 0.035, (lineZ + back) / 2));
      // Weights on the base: a couple of plates each side.
      for (const k of [0.35, 0.8]) parts.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 12), weight, x + sx * 0.02, 0.1, lineZ + s * k));
    }
    // The crossbar, the top bar at the back, the base's back bar.
    parts.add(beam(v3(PITCH_CX - px - GOAL.post, GOAL.height + GOAL.post, lineZ), v3(PITCH_CX + px + GOAL.post, GOAL.height + GOAL.post, lineZ), GOAL.post * 2, white, true));
    parts.add(beam(v3(PITCH_CX - px, GOAL.height - 0.08, topBack), v3(PITCH_CX + px, GOAL.height - 0.08, topBack), 0.04, frame, true));
    parts.add(mesh(box(GOAL.width + 0.2, 0.07, 0.09), weight, PITCH_CX, 0.035, back));
    // The nets: the roof sags, the back and the sides billow out a little.
    const L = PITCH_CX - px;
    const Rr = PITCH_CX + px;
    const yT = GOAL.height;
    const yB = GOAL.height - 0.08;
    rest.push(netPatch(v3(L, yT, lineZ), v3(Rr, yT, lineZ), v3(Rr, yB, topBack), v3(L, yB, topBack), v3(0, -1, 0), 0.1, 12, 4));
    for (const sx of [-1, 1]) {
      const x = PITCH_CX + sx * px;
      rest.push(netPatch(v3(x, yT, lineZ), v3(x, yB, topBack), v3(x, 0.02, back), v3(x, 0.02, lineZ), v3(sx, 0, 0), 0.07, 6, 8));
    }
    const backGeo = netPatch(v3(L, yB, topBack), v3(Rr, yB, topBack), v3(Rr, 0.02, back), v3(L, 0.02, back), out, 0.12, 14, 10);
    const backMesh = mesh(backGeo, netMat, 0, 0, 0, false);
    group.add(backMesh);
    backs.push({ side, mesh: backMesh, base: Float32Array.from(backGeo.attributes.position.array as Float32Array), out, hit: { x: 0, y: 0, k: 0, t: 0 } });
    // Players can walk into the goal's mouth, not through its net.
    const nz0 = Math.min(lineZ, back);
    const nz1 = Math.max(lineZ, back);
    colliders.push({ minX: PITCH_CX - GOAL.width / 2 - 0.1, maxX: PITCH_CX + GOAL.width / 2 + 0.1, minZ: s < 0 ? back - 0.06 : back, maxZ: s < 0 ? back : back + 0.06, top: 2.4, fence: true });
    for (const sx of [-1, 1]) {
      const x = PITCH_CX + sx * (GOAL.width / 2 + 0.05);
      colliders.push({ minX: x - 0.06, maxX: x + 0.06, minZ: nz0, maxZ: nz1, top: 2.4, fence: true });
    }
  }
  const nets = mesh(mergeGeometries(rest)!, netMat, 0, 0, 0, false);
  group.add(nets);
  return {
    billow(side, x, y, strength) {
      const b = backs.find((n) => n.side === side);
      if (b) b.hit = { x, y, k: Math.min(1, Math.max(0.2, strength)), t: 0 };
    },
    update(dt) {
      for (const b of backs) {
        if (b.hit.k <= 0) continue;
        b.hit.t += dt;
        // A bulge where the ball went in, pushed out and swinging back, dying away over a second or so.
        const amp = b.hit.k * 0.35 * Math.exp(-b.hit.t * 3.2) * Math.cos(b.hit.t * 11);
        const pos = b.mesh.geometry.attributes.position as THREE.BufferAttribute;
        const arr = pos.array as Float32Array;
        for (let i = 0; i < pos.count; i++) {
          const x = b.base[i * 3];
          const y = b.base[i * 3 + 1];
          const d2 = (x - b.hit.x) ** 2 + (y - b.hit.y) ** 2;
          const f = amp * Math.exp(-d2 / 0.35);
          arr[i * 3 + 2] = b.base[i * 3 + 2] + b.out.z * f;
        }
        pos.needsUpdate = true;
        if (b.hit.t > 1.6) {
          b.hit.k = 0;
          arr.set(b.base);
        }
      }
    },
  };
}

// ---- The boards' bodies and the safety nets ----------------------------------------------------------

/** The runs of boards round the pitch: the sides whole, the ends either side of the goals. */
export function boardRuns(): { x0: number; z0: number; x1: number; z1: number }[] {
  const bx0 = PITCH.minX - BOARD.thick / 2;
  const bx1 = PITCH.maxX + BOARD.thick / 2;
  const bz0 = PITCH.minZ - BOARD.thick / 2;
  const bz1 = PITCH.maxZ + BOARD.thick / 2;
  const gl = PITCH_CX - GOAL.width / 2 - GOAL.post;
  const gr = PITCH_CX + GOAL.width / 2 + GOAL.post;
  return [
    { x0: bx0, z0: bz1 + BOARD.thick / 2, x1: bx0, z1: bz0 - BOARD.thick / 2 },
    { x0: bx1, z0: bz0 - BOARD.thick / 2, x1: bx1, z1: bz1 + BOARD.thick / 2 },
    { x0: bx0, z0: bz0, x1: gl, z1: bz0 },
    { x0: gr, z0: bz0, x1: bx1, z1: bz0 },
    { x0: gl, z0: bz1, x1: bx0, z1: bz1 },
    { x0: bx1, z0: bz1, x1: gr, z1: bz1 },
  ];
}

/** The boards' frames: a rubber kick plate along the bottom, the panel's housing, a padded top; and their colliders. */
export function buildBoardBodies(parts: THREE.Group, colliders: Collider[]) {
  const housing = toon('#262b31');
  const kick = toon('#15181c');
  const pad = toon('#1d3b2c');
  for (const r of boardRuns()) {
    const len = Math.hypot(r.x1 - r.x0, r.z1 - r.z0);
    const alongX = Math.abs(r.x1 - r.x0) > Math.abs(r.z1 - r.z0);
    const cx = (r.x0 + r.x1) / 2;
    const cz = (r.z0 + r.z1) / 2;
    const sized = (w: number, h: number) => (alongX ? box(len, h, w) : box(w, h, len));
    parts.add(mesh(sized(BOARD.thick, BOARD.height - 0.06), housing, cx, (BOARD.height - 0.06) / 2, cz));
    parts.add(mesh(sized(BOARD.thick + 0.03, 0.2), kick, cx, 0.1, cz, false));
    const top = mesh(new THREE.CylinderGeometry(0.075, 0.075, len, 10), pad, cx, BOARD.height - 0.02, cz, false);
    if (alongX) top.rotation.z = Math.PI / 2;
    else top.rotation.x = Math.PI / 2;
    parts.add(top);
    // Keeps players on their side (tall: nobody hops over).
    const hx = alongX ? len / 2 : BOARD.thick / 2;
    const hz = alongX ? BOARD.thick / 2 : len / 2;
    colliders.push({ minX: cx - hx, maxX: cx + hx, minZ: cz - hz, maxZ: cz + hz, top: 3, fence: true });
  }
}

/** Safety nets over the boards (4.5 m behind the goals, 3 m along the sides), on poles, a cable along the top. */
export function buildSafetyNets(group: THREE.Group, parts: THREE.Group) {
  const steel = toon('#aeb6bf');
  const tex = canvasTexture(64, 64, (g) => {
    g.clearRect(0, 0, 64, 64);
    g.strokeStyle = 'rgba(235,242,238,0.95)';
    g.lineWidth = 2;
    for (let i = 0; i <= 64; i += 8) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i, 64);
      g.moveTo(0, i);
      g.lineTo(64, i);
      g.stroke();
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false, color: '#e7efe9' });
  mat.userData.outlineParameters = { visible: false };
  const geos: THREE.BufferGeometry[] = [];
  const bx0 = PITCH.minX - BOARD.thick / 2;
  const bx1 = PITCH.maxX + BOARD.thick / 2;
  const bz0 = PITCH.minZ - BOARD.thick / 2;
  const bz1 = PITCH.maxZ + BOARD.thick / 2;
  const wall = (x0: number, z0: number, x1: number, z1: number, h: number) => {
    const g = wallPanel(x0, z0, x1, z1, BOARD.height + 0.08, h, 0, 1.2, 1);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) / 1.2);
    geos.push(g.toNonIndexed());
    parts.add(beam(v3(x0, h, z0), v3(x1, h, z1), 0.025, steel, true));
  };
  wall(bx0, bz0, bx1, bz0, 4.5);
  wall(bx0, bz1, bx1, bz1, 4.5);
  wall(bx0, bz0, bx0, bz1, 3);
  wall(bx1, bz0, bx1, bz1, 3);
  group.add(mesh(mergeGeometries(geos)!, mat, 0, 0, 0, false));
  for (const x of [bx0, bx1]) {
    for (let i = 0; i <= 6; i++) {
      const h = i === 0 || i === 6 ? 4.5 : 3;
      parts.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, h, 8), steel, x, h / 2, PITCH.minZ + (i * PL) / 6, false));
    }
  }
  for (const z of [bz0, bz1]) for (const x of [-3.5, 3.5]) parts.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 4.5, 8), steel, x, 2.25, z, false));
}

// ---- The stands --------------------------------------------------------------------------------------

/** Seat shells (pan and back on a stem), instanced: every seat in the hall in one draw call. */
function seatMesh(list: { x: number; y: number; z: number; rotY: number; color: string }[]): THREE.InstancedMesh {
  const pan = new THREE.BoxGeometry(0.44, 0.06, 0.4).translate(0, 0, 0.02);
  const back = new THREE.BoxGeometry(0.44, 0.38, 0.06).translate(0, 0.2, -0.18);
  const stem = new THREE.BoxGeometry(0.06, 0.4, 0.06).translate(0, -0.2, 0);
  const geo = mergeGeometries([pan, back, stem].map((g) => g.toNonIndexed().deleteAttribute('uv')))!;
  const mat = new THREE.MeshToonMaterial({ color: '#ffffff', gradientMap: (toon('#fff') as THREE.MeshToonMaterial).gradientMap });
  const m = new THREE.InstancedMesh(geo, mat, list.length);
  const o = new THREE.Object3D();
  const c = new THREE.Color();
  list.forEach((s, i) => {
    o.position.set(s.x, s.y, s.z);
    o.rotation.set(0, s.rotY, 0);
    o.updateMatrix();
    m.setMatrixAt(i, o.matrix);
    m.setColorAt(i, c.set(s.color));
  });
  m.castShadow = false;
  m.receiveShadow = true;
  m.raycast = () => {};
  return m;
}

/** The stands: the blue end (south), the red end (north), the gallery (east); the dugouts' seats too. Their seats for the crowd. */
export function buildStands(group: THREE.Group, parts: THREE.Group, colliders: Collider[]): Seat[] {
  const riser = toon('#8b949c');
  const nose = toon('#d9dde0');
  const steel = toon('#aeb6bf');
  const dark = toon('#2b3138');
  const seats: Seat[] = [];
  const shells: { x: number; y: number; z: number; rotY: number; color: string }[] = [];
  const glassMat = new THREE.MeshBasicMaterial({ color: '#cfe6f0', transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide });
  glassMat.userData.outlineParameters = { visible: false };
  const glassGeos: THREE.BufferGeometry[] = [];
  const glassRun = (x0: number, z0: number, x1: number, z1: number, y0: number, h: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const g = new THREE.PlaneGeometry(len, h);
    g.rotateY(Math.atan2(-(z1 - z0), x1 - x0));
    g.translate((x0 + x1) / 2, y0 + h / 2, (z0 + z1) / 2);
    glassGeos.push(g);
    parts.add(beam(v3(x0, y0 + h, z0), v3(x1, y0 + h, z1), 0.05, steel, true));
    const n = Math.max(1, Math.round(len / 1.5));
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      parts.add(mesh(box(0.05, h, 0.05), steel, x0 + (x1 - x0) * k, y0 + h / 2, z0 + (z1 - z0) * k, false));
    }
  };

  // An end stand: rows along x climbing toward the end wall, `dir` +1 south (rows go +z), -1 north.
  const endStand = (st: { minX: number; maxX: number; minZ: number; maxZ: number; rows: number; rise: number }, dir: 1 | -1, fan: Team, colors: [string, string]) => {
    const rowD = (st.maxZ - st.minZ) / st.rows;
    const front = dir > 0 ? st.minZ : st.maxZ;
    const aisle = (st.minX + st.maxX) / 2;
    for (let i = 0; i < st.rows; i++) {
      const top = (i + 1) * st.rise;
      const za = front + dir * i * rowD;
      const zEnd = dir > 0 ? st.maxZ : st.minZ;
      parts.add(mesh(box(st.maxX - st.minX, top, Math.abs(zEnd - za)), riser, (st.minX + st.maxX) / 2, top / 2, (za + zEnd) / 2));
      parts.add(mesh(box(st.maxX - st.minX, 0.04, 0.08), nose, (st.minX + st.maxX) / 2, top + 0.01, za + dir * 0.04, false));
      colliders.push({ minX: st.minX, maxX: st.maxX, minZ: Math.min(za, zEnd), maxZ: Math.max(za, zEnd), top });
      const sz = za + dir * (rowD - 0.3);
      for (let x = st.minX + 0.45; x < st.maxX - 0.3; x += 0.66) {
        if (Math.abs(x - aisle) < 0.6) continue;
        const rotY = dir > 0 ? Math.PI : 0;
        shells.push({ x, y: top + 0.4, z: sz, rotY, color: Math.round((x - st.minX) / 0.66) % 4 === 1 ? colors[1] : colors[0] });
        seats.push({ x, y: top + 0.43, z: sz + dir * 0.02, rotY, fan });
      }
    }
    // Glass along its front, the aisle left open.
    const fz = front - dir * 0.08;
    glassRun(st.minX, fz, aisle - 0.6, fz, 0, 1.1);
    glassRun(aisle + 0.6, fz, st.maxX, fz, 0, 1.1);
    for (const [a, b] of [
      [st.minX, aisle - 0.6],
      [aisle + 0.6, st.maxX],
    ]) colliders.push({ minX: a, maxX: b, minZ: fz - 0.05, maxZ: fz + 0.05, top: 1.1, fence: true });
  };
  endStand(STAND, 1, 'blue', ['#277df0', '#f4f4f0']);
  endStand(NORTH_STAND, -1, 'red', ['#e63946', '#f4f4f0']);

  // The gallery along the east wall, over the walkway: a slab on brackets, two rows, glass in front.
  {
    const G = GALLERY;
    const zc = (G.minZ + G.maxZ) / 2;
    const len = G.maxZ - G.minZ;
    parts.add(mesh(box(G.maxX - G.minX, 0.25, len), toon('#6f7881'), (G.minX + G.maxX) / 2, G.y - 0.125, zc));
    parts.add(mesh(box(0.7, 0.4, len), riser, G.maxX - 0.35, G.y + 0.2, zc));
    parts.add(mesh(box(0.04, 0.04, len), nose, G.maxX - 0.7, G.y + 0.4, zc, false));
    // Something to stand on up there (the walkway goes on underneath), and its glass to keep you on it.
    colliders.push({ minX: G.minX, maxX: G.maxX, minZ: G.minZ, maxZ: G.maxZ, bottom: G.y - 0.25, top: G.y });
    colliders.push({ minX: G.maxX - 0.7, maxX: G.maxX, minZ: G.minZ, maxZ: G.maxZ, bottom: G.y, top: G.y + 0.4 });
    colliders.push({ minX: G.minX, maxX: G.minX + 0.1, minZ: G.minZ, maxZ: G.maxZ, bottom: G.y, top: G.y + 1, fence: true });
    for (let z = G.minZ + 1; z <= G.maxZ - 1; z += 4) parts.add(beam(v3(G.maxX, G.y - 1.6, z), v3(G.minX + 0.3, G.y - 0.25, z), 0.12, dark));
    // A fascia on its front: FLOGGE FC along the hall.
    const fascia = mesh(new THREE.PlaneGeometry(len, 0.5), glow(canvasTexture(1024, 48, (g) => {
      g.fillStyle = '#1d3b2c';
      g.fillRect(0, 0, 1024, 48);
      g.fillStyle = '#35c46a';
      g.fillRect(0, 44, 1024, 4);
      g.font = `900 32px ${FONT}`;
      g.textBaseline = 'middle';
      g.textAlign = 'center';
      for (let i = 0; i < 4; i++) {
        g.fillStyle = i % 2 ? '#ffffff' : '#ffd166';
        g.fillText(i % 2 ? 'FLOGGE FC' : '★ ARENA ★', 128 + i * 256, 25);
      }
    })), G.minX - 0.01, G.y - 0.25, zc, false);
    fascia.rotation.y = -Math.PI / 2;
    group.add(fascia);
    glassRun(G.minX + 0.05, G.minZ, G.minX + 0.05, G.maxZ, G.y, 1.0);
    for (const z of [G.minZ, G.maxZ]) glassRun(G.minX + 0.05, z, G.maxX, z, G.y, 1.0);
    const rows: [number, number][] = [
      [G.minX + 0.55, G.y],
      [G.maxX - 0.4, G.y + 0.4],
    ];
    for (const [x, y] of rows) {
      for (let z = G.minZ + 0.4; z < G.maxZ - 0.3; z += 0.62) {
        const fan: Team | null = z < -3 ? 'red' : z > 3 ? 'blue' : null;
        const rotY = -Math.PI / 2;
        shells.push({ x, y: y + 0.4, z, rotY, color: fan ? (Math.round(z / 0.62) % 5 === 0 ? '#f4f4f0' : TEAM_COLOR[fan]) : '#2f8f47' });
        seats.push({ x: x - 0.02, y: y + 0.43, z, rotY, fan });
      }
    }
  }

  // The dugouts' seats (players waiting, not the crowd's).
  for (const b of BENCHES) for (let z = b.z0 + 0.4; z < b.z1 - 0.2; z += 0.7) shells.push({ x: b.x + 0.05, y: 0.45, z, rotY: Math.PI / 2, color: TEAM_COLOR[b.team] });

  group.add(seatMesh(shells));
  group.add(mesh(mergeGeometries(glassGeos.map((g) => g.toNonIndexed()))!, glassMat, 0, 0, 0, false));
  return seats;
}

// ---- The dugouts and the bits lying about ----------------------------------------------------------------

export function buildDugouts(group: THREE.Group, parts: THREE.Group, colliders: Collider[]) {
  const steel = toon('#aeb6bf');
  const dark = toon('#2b3138');
  const white = toon('#fbfbf6');
  const orange = toon('#ff7b1c');
  for (const b of BENCHES) {
    const len = b.z1 - b.z0;
    const zc = (b.z0 + b.z1) / 2;
    const col = TEAM_COLOR[b.team];
    // A curved acrylic roof in the team's colour on a steel frame (a quarter round from the wall's top
    // over the seats, down to the front: the cylinder's axis along z), a back panel in the team's colour.
    const shell = new THREE.CylinderGeometry(1.1, 1.1, len + 0.4, 18, 1, true, Math.PI / 2, Math.PI / 2);
    const acrylic = new THREE.MeshToonMaterial({ color: col, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false });
    acrylic.userData.outlineParameters = { visible: false };
    const roof = mesh(shell, acrylic, b.x - 0.3, 1.2, zc, false);
    roof.rotation.x = Math.PI / 2;
    group.add(roof);
    for (const z of [b.z0 - 0.2, b.z1 + 0.2]) {
      // The frame's arc, in a few straight pieces.
      for (let i = 0; i < 4; i++) {
        const a0 = (i / 4) * (Math.PI / 2);
        const a1 = ((i + 1) / 4) * (Math.PI / 2);
        parts.add(beam(v3(b.x - 0.3 + Math.sin(a0) * 1.1, 1.2 + Math.cos(a0) * 1.1, z), v3(b.x - 0.3 + Math.sin(a1) * 1.1, 1.2 + Math.cos(a1) * 1.1, z), 0.06, steel));
      }
      parts.add(mesh(box(0.06, 1.2, 0.06), steel, b.x + 0.8, 0.6, z, false));
    }
    parts.add(mesh(box(0.06, 1.1, len + 0.4), toon(col), b.x - 0.3, 1.25, zc, false));
    // Kit on the floor in front: a crate of bottles, a stack of cones, a ball bag, a towel on the seats.
    const bx = b.x + 0.75;
    const bz = b.team === 'red' ? b.z1 - 0.6 : b.z0 + 0.6;
    parts.add(mesh(box(0.34, 0.14, 0.24), dark, bx, 0.07, bz, false));
    for (let i = 0; i < 6; i++) {
      const x = bx - 0.11 + (i % 3) * 0.11;
      const z = bz - 0.055 + Math.floor(i / 3) * 0.11;
      parts.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 8), white, x, 0.22, z, false));
      parts.add(mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.04, 8), toon(col), x, 0.35, z, false));
    }
    // A couple of bottles stood on the bench.
    for (const dz of [0.9, 2.3]) parts.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 8), toon(col), b.x + 0.05, 0.6, b.z0 + dz, false));
    const cz = b.team === 'red' ? b.z0 + 0.5 : b.z1 - 0.5;
    for (let i = 0; i < 4; i++) parts.add(mesh(new THREE.ConeGeometry(0.12, 0.28, 12), orange, bx, 0.14 + i * 0.05, cz, false));
    // The ball bag: a mesh sack of balls, its drawstring up.
    const gz = zc + (b.team === 'red' ? 1.2 : -1.2);
    for (const [dx, dy, dz] of [
      [0, 0.12, 0],
      [0.2, 0.12, 0.05],
      [0.1, 0.12, -0.18],
      [0.08, 0.32, -0.04],
      [-0.12, 0.12, -0.1],
    ]) parts.add(mesh(new THREE.SphereGeometry(0.11, 10, 8), white, bx + dx, dy, gz + dz, false));
    parts.add(mesh(new THREE.CylinderGeometry(0.02, 0.07, 0.25, 8), dark, bx + 0.08, 0.52, gz - 0.04, false));
    parts.add(mesh(box(0.42, 0.03, 0.5), toon('#f4f1ea'), b.x + 0.05, 0.5, zc, false));
    colliders.push({ minX: b.x - 0.3, maxX: b.x + 0.35, minZ: b.z0, maxZ: b.z1, top: 0.5 });
  }
  // A few marker cones and a spare ball behind the south goal's net, by the stand.
  for (const [x, z] of [
    [-5.5, 14.9],
    [-4.7, 14.9],
    [4.9, 14.95],
  ]) parts.add(mesh(new THREE.ConeGeometry(0.1, 0.22, 10), orange, x, 0.11, z, false));
  parts.add(mesh(new THREE.SphereGeometry(0.11, 12, 10), white, 5.6, 0.11, 14.9, false));
}
