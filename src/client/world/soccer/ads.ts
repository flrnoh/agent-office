import * as THREE from 'three';
import { TEAM_COLOR, type Team } from '../../../shared/soccer';
import { FONT } from '../casino/parts';
import { ADS, boardShow } from './matchday';

/*
 * The soccer hall's LED boards (flrnoh fork, see FORK.md "The soccer hall"): the panels on both faces
 * of the boards round the pitch, one mesh with one texture for all of them. The texture is an atlas of
 * rows (every ad, GOAL! in red and in blue, both also inverted), and the boards show a row by where the texture
 * sits: rolling over from one ad to the next is sliding it down a row, a marquee is sliding it along,
 * so the whole perimeter animates for the price of two numbers a frame (see matchday.ts's boardShow).
 */

/** Rows in the atlas: the ads, the first again (to roll round onto), GOAL! red and blue, and both again inverted. */
const ROWS = ADS.length + 5;
const GOAL_ROW = ADS.length + 1;
const ROW_PX = 128;
const ROW_W = 1024;
/** How tall the panels are (m), and so how long one row's picture runs along the boards. */
export const LED_H = 0.64;
const TILE = LED_H * (ROW_W / ROW_PX);

function atlas(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = ROW_W;
  c.height = ROWS * ROW_PX;
  const g = c.getContext('2d')!;
  const row = (i: number, bg: string, fg: string, text: string, glow: string) => {
    const y = i * ROW_PX;
    g.fillStyle = bg;
    g.fillRect(0, y, ROW_W, ROW_PX);
    // A soft light across the middle, like a panel lit from behind.
    const grd = g.createLinearGradient(0, y, 0, y + ROW_PX);
    grd.addColorStop(0, 'rgba(255,255,255,0.05)');
    grd.addColorStop(0.5, 'rgba(255,255,255,0.12)');
    grd.addColorStop(1, 'rgba(0,0,0,0.12)');
    g.fillStyle = grd;
    g.fillRect(0, y, ROW_W, ROW_PX);
    let px = ROW_PX * 0.5;
    g.font = `900 ${px}px ${FONT}`;
    while (g.measureText(text).width > ROW_W * 0.9 && px > 12) g.font = `900 ${(px -= 2)}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = glow;
    g.shadowBlur = 14;
    g.fillStyle = fg;
    g.fillText(text, ROW_W / 2, y + ROW_PX * 0.54);
    g.shadowBlur = 0;
    // Dots at the ends of every picture, where one tile meets the next.
    g.fillStyle = fg;
    for (const x of [18, ROW_W - 18]) {
      g.beginPath();
      g.arc(x, y + ROW_PX / 2, 7, 0, Math.PI * 2);
      g.fill();
    }
  };
  ADS.forEach(([text, fg, bg], i) => row(i, bg, fg, text, fg));
  row(ADS.length, ADS[0][2], ADS[0][1], ADS[0][0], ADS[0][1]);
  row(GOAL_ROW, TEAM_COLOR.red, '#ffffff', '⚽ GOAL!  TOR!  GOAL! ⚽', '#ffe0e0');
  row(GOAL_ROW + 1, TEAM_COLOR.blue, '#ffffff', '⚽ GOAL!  TOR!  GOAL! ⚽', '#e0ecff');
  // The strobe's other beat: the same, the other way round.
  row(GOAL_ROW + 2, '#fff4f4', TEAM_COLOR.red, '⚽ GOAL!  TOR!  GOAL! ⚽', TEAM_COLOR.red);
  row(GOAL_ROW + 3, '#f2f7ff', TEAM_COLOR.blue, '⚽ GOAL!  TOR!  GOAL! ⚽', TEAM_COLOR.blue);
  // The LED grid over everything: fine dark lines between the rows of diodes.
  g.fillStyle = 'rgba(0,0,0,0.28)';
  for (let y = 0; y < c.height; y += 4) g.fillRect(0, y, ROW_W, 1);
  g.fillStyle = 'rgba(0,0,0,0.16)';
  for (let x = 0; x < ROW_W; x += 4) g.fillRect(x, 0, 1, c.height);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

export interface LedBoards {
  mesh: THREE.Mesh;
  /** Shows what the boards show at `now` (ms): the ads rolling round, or GOAL! for `goal`'s team. */
  update(now: number, goal: { team: Team; at: number } | null): void;
}

/** A run of boards from (x0, z0) to (x1, z1) with its faces `thick` apart, the panels from y0 up. */
export interface LedRun {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

export function buildLedBoards(runs: LedRun[], thick: number, y0: number): LedBoards {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const v1 = 1 / ROWS;
  let u0 = 0;
  for (const r of runs) {
    const len = Math.hypot(r.x1 - r.x0, r.z1 - r.z0);
    const ax = (r.x1 - r.x0) / len;
    const az = (r.z1 - r.z0) / len;
    // Both faces: the normal's one way, then the other.
    for (const side of [1, -1]) {
      const nx = az * side;
      const nz = -ax * side;
      const off = thick / 2 + 0.006;
      // Wound so the face looks along its normal, the pictures reading left to right from there.
      const a = side > 0 ? [r.x0, r.z0, r.x1, r.z1] : [r.x1, r.z1, r.x0, r.z0];
      const ua = [u0 + len / TILE, u0];
      const base = pos.length / 3;
      for (const [x, z, u] of [
        [a[0], a[1], ua[0]],
        [a[2], a[3], ua[1]],
      ]) {
        pos.push(x + nx * off, y0, z + nz * off, x + nx * off, y0 + LED_H, z + nz * off);
        nor.push(nx, 0, nz, nx, 0, nz);
        uv.push(u, 0, u, v1);
      }
      idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
    // Start the next run where this one's pictures leave off, so they don't all line up.
    u0 += len / TILE + 0.37;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  const tex = atlas();
  const mat = new THREE.MeshBasicMaterial({ map: tex, color: '#ffffff' });
  mat.toneMapped = false;
  mat.userData.outlineParameters = { visible: false };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = false;
  const rowOffset = (i: number) => 1 - (i + 1) / ROWS;
  return {
    mesh,
    update(now, goal) {
      const show = boardShow(now, goal);
      if (show.kind === 'goal') {
        tex.offset.set(0, rowOffset(GOAL_ROW + (show.team === 'red' ? 0 : 1) + (show.lit ? 0 : 2)));
        return;
      }
      // Ease the roll: it starts and settles gently.
      const r = show.roll * show.roll * (3 - 2 * show.roll);
      tex.offset.set((now / 1000) * 0.045, rowOffset(show.index + r));
    },
  };
}
