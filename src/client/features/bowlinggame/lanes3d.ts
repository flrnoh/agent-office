import * as THREE from 'three';
import { FOUL_LINE_Z, LANE_COUNT, LANE_PITCH, LANE_X, ZONES } from '../../../shared/bowling';
import { APPROACH, APPROACH_DOTS, ARROWS, BOARD, BOARDS, DECK_D, GUTTER, LANE_DOTS, LANE_HALF, LANE_WIDTH, OIL_D, PIN_SPOTS, PIT_D, boardU } from '../../../shared/bowling-game';
import { canvasTexture } from '../../world/texture';
import { mesh, toon } from '../../world/toon';
import type { Collider, Interactable } from '../../world/types';

/*
 * The six lanes themselves (flrnoh fork, see FORK.md "Bowling lanes"), in the centre's own
 * coordinates: each a 41.5-inch strip of 39 maple and pine boards from the foul line to the pit, with
 * its target arrows 15 feet out, the range dots at 7 feet, the pin spots on the deck, an approach of
 * pale maple behind the foul line with its dots, a shallow gutter either side, the capping between
 * the lanes, the kickbacks beside the pin deck and the dark pit behind it. Everything stands on a
 * low platform (SURF) so the gutters can dip into it. Cosmic bowling lays a neon copy of the arrows,
 * dots, lines and gutter edges over it all (`glow`).
 */

/** How high the lane's surface is above the centre's floor (the carpet's at 0), and the thin base under the gutters. */
export const SURF = 0.06;
const BASE = 0.012;
const W_LANE = LANE_WIDTH;
const W_ALL = LANE_WIDTH + 2 * GUTTER;
/** The capping between two lanes' gutters. */
const CAP = LANE_PITCH - W_ALL;

/** Interior z for a distance `d` down the lane. */
const zOf = (d: number) => FOUL_LINE_Z - d;

/** The lane's boards, foul line (bottom) to pit (top): maple up front and on the deck, pine between. */
function laneTexture(): THREE.CanvasTexture {
  const W = 512;
  const H = 4096;
  const px = W / W_LANE;
  const py = H / PIT_D;
  const y = (d: number) => H - d * py;
  return canvasTexture(W, H, (g) => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let b = 0; b < BOARDS; b++) {
      const x0 = Math.round(b * BOARD * px);
      const x1 = Math.round((b + 1) * BOARD * px);
      // Maple (front and deck), pine between: a little paler and more streaked.
      const tone = (rnd() - 0.5) * 14;
      const maple = `hsl(34, 62%, ${70 + tone * 0.3}%)`;
      const pine = `hsl(37, 58%, ${75 + tone * 0.35}%)`;
      g.fillStyle = maple;
      g.fillRect(x0, 0, x1 - x0, H);
      g.fillStyle = pine;
      g.fillRect(x0, y(DECK_D - 1.2), x1 - x0, y(4.6) - y(DECK_D - 1.2));
      // Grain: long thin streaks down each board.
      for (let k = 0; k < 26; k++) {
        g.fillStyle = `rgba(120, 70, 30, ${0.04 + rnd() * 0.07})`;
        const gx = x0 + rnd() * (x1 - x0);
        const gy = rnd() * H;
        g.fillRect(gx, gy, 0.8 + rnd(), 60 + rnd() * 420);
      }
      // The joint between boards.
      g.fillStyle = 'rgba(90, 50, 20, .28)';
      g.fillRect(x1 - 1, 0, 1, H);
    }
    // Butt joints where the maple meets the pine.
    g.fillStyle = 'rgba(80, 45, 18, .45)';
    g.fillRect(0, y(4.6), W, 2);
    g.fillRect(0, y(DECK_D - 1.2), W, 2);
    // The oil shows as a faint sheen up to 40 feet.
    const sheen = g.createLinearGradient(0, y(0), 0, y(OIL_D + 1));
    sheen.addColorStop(0, 'rgba(255, 250, 235, .18)');
    sheen.addColorStop(0.9, 'rgba(255, 250, 235, .1)');
    sheen.addColorStop(1, 'rgba(255, 250, 235, 0)');
    g.fillStyle = sheen;
    g.fillRect(0, y(OIL_D + 1), W, y(0) - y(OIL_D + 1));
    drawMarks(g, px, y, '#2b1a10', 1);
  });
}

/** The arrows, the dots and the pin spots, in `color` (dark inlays by day, neon in cosmic). */
function drawMarks(g: CanvasRenderingContext2D, px: number, y: (d: number) => number, color: string, k: number) {
  g.fillStyle = color;
  const ux = (u: number) => (u + W_LANE / 2) * px;
  for (const a of ARROWS) {
    const cx = ux(boardU(a.board));
    const tip = y(a.d + 0.15);
    const base = y(a.d - 0.09);
    g.beginPath();
    g.moveTo(cx, tip);
    g.lineTo(cx + BOARD * px * 0.55 * k, base);
    g.lineTo(cx - BOARD * px * 0.55 * k, base);
    g.closePath();
    g.fill();
  }
  for (const row of LANE_DOTS)
    for (const b of row.boards) {
      g.beginPath();
      g.arc(ux(boardU(b)), y(row.d), 3.2 * k, 0, Math.PI * 2);
      g.fill();
    }
  // The pin spots on the deck.
  for (const s of PIN_SPOTS) {
    g.beginPath();
    g.arc(ux(s.u), y(s.d), 5 * k, 0, Math.PI * 2);
    g.fill();
  }
}

/** The approach: pale maple, its dots at 12 and 15 feet and by the line, the foul line along its top. */
function approachTexture(): THREE.CanvasTexture {
  const W = 512;
  const H = 1536;
  const px = W / W_ALL;
  const py = H / APPROACH;
  return canvasTexture(W, H, (g) => {
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const n = Math.round(W_ALL / BOARD);
    for (let b = 0; b < n; b++) {
      const x0 = (b * W) / n;
      g.fillStyle = `hsl(38, 48%, ${80 + (rnd() - 0.5) * 5}%)`;
      g.fillRect(x0, 0, W / n + 1, H);
      for (let k = 0; k < 10; k++) {
        g.fillStyle = `rgba(140, 90, 40, ${0.03 + rnd() * 0.05})`;
        g.fillRect(x0 + rnd() * (W / n), rnd() * H, 1, 40 + rnd() * 200);
      }
      g.fillStyle = 'rgba(110, 70, 30, .18)';
      g.fillRect(x0, 0, 1, H);
    }
    drawApproachMarks(g, px, py, '#3a2414', 1);
    // The foul line, and the foul light's eye either side.
    g.fillStyle = '#16100c';
    g.fillRect(0, 0, W, 5);
  });
}

function drawApproachMarks(g: CanvasRenderingContext2D, px: number, py: number, color: string, k: number) {
  g.fillStyle = color;
  for (const row of APPROACH_DOTS)
    for (const b of row.boards) {
      g.beginPath();
      g.arc((boardU(b) + W_ALL / 2) * px, -row.d * py, 4.5 * k, 0, Math.PI * 2);
      g.fill();
    }
}

/** Cosmic bowling's neon: the lane's marks and its edges, on black (it's drawn adding light). */
function laneGlowTexture(): THREE.CanvasTexture {
  const W = 256;
  const H = 2048;
  const px = W / W_LANE;
  const py = H / PIT_D;
  const y = (d: number) => H - d * py;
  return canvasTexture(W, H, (g) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, W, H);
    g.shadowColor = '#ff3bd4';
    g.shadowBlur = 8;
    drawMarks(g, px, y, '#ff4fe0', 0.9);
    g.shadowColor = '#3bf6ff';
    g.fillStyle = '#3bf6ff';
    g.fillRect(0, 0, 3, H);
    g.fillRect(W - 3, 0, 3, H);
    // Stars down the pine, for fun.
    let seed = 5;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    g.shadowColor = '#b6ff3b';
    g.fillStyle = '#d6ff7a';
    for (let i = 0; i < 60; i++) {
      const sx = 10 + rnd() * (W - 20);
      const sy = y(5 + rnd() * (DECK_D - 7));
      g.globalAlpha = 0.3 + rnd() * 0.5;
      g.fillRect(sx, sy, 2, 2);
    }
    g.globalAlpha = 1;
  });
}

function approachGlowTexture(): THREE.CanvasTexture {
  const W = 256;
  const H = 768;
  return canvasTexture(W, H, (g) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, W, H);
    g.shadowColor = '#3bf6ff';
    g.shadowBlur = 8;
    drawApproachMarks(g, W / W_ALL, H / APPROACH, '#5af8ff', 0.6);
    g.fillStyle = '#ff4fe0';
    g.shadowColor = '#ff4fe0';
    g.fillRect(0, 0, W, 4);
  });
}

const glowMat = (map: THREE.Texture) => {
  const m = new THREE.MeshBasicMaterial({ map, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 0 });
  m.userData.outlineParameters = { visible: false };
  return m;
};

/** Light laid over things (cosmic bowling's neon): the crosshair goes straight through it. */
export function noPick<T extends THREE.Object3D>(o: T): T {
  o.raycast = () => {};
  return o;
}

export interface LanesBuilt {
  group: THREE.Group;
  colliders: Collider[];
  /** Each lane's approach: E there (or at its lane, looking down it) steps up to bowl when you're up. */
  interactables: Interactable[];
  /** Cosmic bowling's neon, faded in and out by `glow(k)` (0 off, 1 on). */
  glow(k: number): void;
}

/** A shallow gutter: a half pipe 0.235 m across, squashed to 5 cm deep, `len` long down -z from `z0`. */
function gutterGeometry(len: number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(GUTTER / 2, GUTTER / 2, len, 14, 1, true, -Math.PI / 2, Math.PI);
  g.rotateX(Math.PI / 2);
  g.scale(1, 0.42, 1);
  return g;
}

export function buildLanes(parent: THREE.Object3D): LanesBuilt {
  const group = new THREE.Group();
  group.name = 'bowling-lanes';
  parent.add(group);
  const colliders: Collider[] = [];

  const laneLen = PIT_D;
  const laneGeo = new THREE.PlaneGeometry(W_LANE, laneLen);
  laneGeo.rotateX(-Math.PI / 2);
  const laneMat = new THREE.MeshToonMaterial({ map: laneTexture(), color: '#ffffff' });
  laneMat.emissive = new THREE.Color('#1c130a');
  const apprGeo = new THREE.PlaneGeometry(W_ALL, APPROACH);
  apprGeo.rotateX(-Math.PI / 2);
  const apprMat = new THREE.MeshToonMaterial({ map: approachTexture(), color: '#ffffff' });
  const laneGlow = glowMat(laneGlowTexture());
  const apprGlow = glowMat(approachGlowTexture());
  const gutterGeo = gutterGeometry(laneLen + 0.2);
  const gutterMat = new THREE.MeshToonMaterial({ color: '#9aa1ad', side: THREE.DoubleSide });
  const gutterGlowMat = new THREE.MeshBasicMaterial({ color: '#b04bff', toneMapped: false, transparent: true, opacity: 0 });
  gutterGlowMat.userData.outlineParameters = { visible: false };
  const capMat = toon('#2b2d3a');
  const capStripe = toon('#e8b04a');
  const pitMat = new THREE.MeshBasicMaterial({ color: '#07070a' });
  pitMat.userData.outlineParameters = { visible: false };
  const kickMat = toon('#1d1f2a');
  const kickFace = toon('#c63a3a');
  const baseMat = toon('#3a2f28');

  const west = ZONES.lanes.minX;
  const east = ZONES.lanes.maxX;
  // The platform under it all, foul line to the back, and the approaches.
  const back = zOf(PIT_D + 0.9);
  // The approaches stand SURF high; past the foul line only a thin base, the lanes on their own beds, so the gutters dip between them.
  // (A centimetre short either end, so its sides stay inside the end cappings rather than in their plane.)
  const plat = mesh(new THREE.BoxGeometry(east - west - 0.02, SURF, ZONES.lanes.maxZ - FOUL_LINE_Z), baseMat, (west + east) / 2, SURF / 2 - 0.001, (ZONES.lanes.maxZ + FOUL_LINE_Z) / 2, false);
  plat.receiveShadow = true;
  group.add(plat);
  const base = mesh(new THREE.BoxGeometry(east - west, BASE, FOUL_LINE_Z - back), baseMat, (west + east) / 2, BASE / 2, (FOUL_LINE_Z + back) / 2, false);
  base.receiveShadow = true;
  group.add(base);
  const bedGeo = new THREE.BoxGeometry(W_LANE, SURF - BASE, laneLen);
  const bedMat = toon('#b9884f');
  colliders.push({ minX: west, maxX: east, minZ: FOUL_LINE_Z, maxZ: ZONES.lanes.maxZ, top: SURF });

  const glowGutters: THREE.Mesh[] = [];
  const interactables: Interactable[] = [];
  for (let i = 0; i < LANE_COUNT; i++) {
    const x = LANE_X[i];
    const it: Interactable = { kind: 'bowlapproach', x, z: FOUL_LINE_Z + 3.3, radius: 1.1, bowlLane: i };
    interactables.push(it);
    group.add(mesh(bedGeo, bedMat, x, (SURF + BASE) / 2, zOf(laneLen / 2), false));
    const lane = mesh(laneGeo, laneMat, x, SURF + 0.002, zOf(laneLen / 2), false);
    lane.receiveShadow = true;
    lane.userData.interact = it; // the crosshair on the lane (see input/pointer.ts)
    group.add(lane);
    group.add(noPick(mesh(laneGeo, laneGlow, x, SURF + 0.004, zOf(laneLen / 2), false)));
    const appr = mesh(apprGeo, apprMat, x, SURF + 0.002, zOf(-APPROACH / 2), false);
    appr.receiveShadow = true;
    appr.userData.interact = it;
    group.add(appr);
    group.add(noPick(mesh(apprGeo, apprGlow, x, SURF + 0.004, zOf(-APPROACH / 2), false)));
    for (const side of [-1, 1]) {
      const gx = x + side * (LANE_HALF + GUTTER / 2);
      const gut = mesh(gutterGeo, gutterMat, gx, SURF + 0.002, zOf(laneLen / 2 - 0.1), false);
      gut.receiveShadow = true;
      group.add(gut);
      // Cosmic: a neon strip down the bottom of each gutter.
      const strip = mesh(new THREE.BoxGeometry(0.03, 0.004, laneLen), gutterGlowMat, gx, SURF - GUTTER * 0.2 + 0.006, zOf(laneLen / 2), false);
      glowGutters.push(noPick(strip));
      group.add(strip);
      // The kickback beside the deck: a tall panel, red face toward the pins.
      const kx = x + side * (LANE_HALF + GUTTER + 0.04);
      group.add(mesh(new THREE.BoxGeometry(0.08, 0.75, PIT_D + 0.9 - DECK_D + 0.6), kickMat, kx, SURF + 0.375, zOf((DECK_D - 0.6 + PIT_D + 0.9) / 2)));
      group.add(mesh(new THREE.BoxGeometry(0.01, 0.5, 1.2), kickFace, kx - side * 0.045, SURF + 0.3, zOf(DECK_D + 0.5), false));
    }
    // The pit: black past the deck, the cushion hanging at its back.
    group.add(mesh(new THREE.PlaneGeometry(W_ALL, 0.9).rotateX(-Math.PI / 2), pitMat, x, BASE + 0.002, zOf(PIT_D + 0.45), false));
    group.add(mesh(new THREE.BoxGeometry(W_ALL, 1.0, 0.06), pitMat, x, SURF + 0.5, zOf(PIT_D + 0.85), false));
    // The foul light's little eyes on the capping either side of the line.
    for (const side of [-1, 1]) group.add(mesh(new THREE.BoxGeometry(0.05, 0.07, 0.05), toon('#1a1a1a', { emissive: '#ff2020' }), x + side * (W_ALL / 2 + 0.03), SURF + 0.075, FOUL_LINE_Z + 0.02, false));
  }
  // The capping: between each pair of lanes (the ball return's track runs under it), and either end.
  const capEdges = [west, ...Array.from({ length: LANE_COUNT - 1 }, (_, i) => (LANE_X[i] + LANE_X[i + 1]) / 2), east];
  for (let k = 0; k < capEdges.length; k++) {
    const cx = capEdges[k];
    const w = k === 0 ? LANE_X[0] - W_ALL / 2 - west : k === capEdges.length - 1 ? east - (LANE_X[LANE_COUNT - 1] + W_ALL / 2) : CAP;
    const mid = k === 0 ? west + w / 2 : k === capEdges.length - 1 ? east - w / 2 : cx;
    const zc = zOf((DECK_D - 0.6 - APPROACH) / 2);
    group.add(mesh(new THREE.BoxGeometry(w, SURF + 0.05 - BASE, DECK_D - 0.6 + APPROACH), capMat, mid, (SURF + 0.05 + BASE) / 2, zc));
    group.add(mesh(new THREE.BoxGeometry(Math.min(0.04, w * 0.3), 0.004, DECK_D - 0.6 + APPROACH), capStripe, mid, SURF + 0.052, zc, false));
  }
  // Nobody walks down the lanes: a fence along the foul line the whole width (you can't see it).
  colliders.push({ minX: west, maxX: east, minZ: FOUL_LINE_Z - 0.12, maxZ: FOUL_LINE_Z - 0.04, top: 1.2, fence: true });

  let shown = -1;
  const built: LanesBuilt = {
    group,
    colliders,
    interactables,
    glow(k: number) {
      if (Math.abs(k - shown) < 0.002) return;
      shown = k;
      laneGlow.opacity = k;
      apprGlow.opacity = k * 0.9;
      gutterGlowMat.opacity = k;
      laneMat.color.setScalar(1 - 0.72 * k);
      apprMat.color.setScalar(1 - 0.65 * k);
      gutterMat.color.set('#9aa1ad').multiplyScalar(1 - 0.6 * k);
      for (const g of glowGutters) g.visible = k > 0.01;
      laneGlow.visible = apprGlow.visible = k > 0.01;
    },
  };
  built.glow(0); // the overlays are out of sight (and out of the crosshair's way) by day
  return built;
}
