import { CAR_W, LAPS, RIVALS, ROAD_W, SEG, TRACK, heightAt, lapText, ordinal, segmentAt, wrap, type RaceFrame, type Scenery } from '../../shared/racing';
import { RIG_GAME, type RigScores } from '../../shared/rig';

// What the racing rig's screen shows (flrnoh fork, see FORK.md): OFFICE GP in the old pseudo-3D
// style, drawn from a RaceFrame (shared/racing.ts), whether it's your own race or someone else's
// coming in over the network, and the building's tables with nobody at the wheel.

/** The screen, in its own units: 16:9, like the TV it's on. */
export const W = 640;
export const H = 360;

/** Everything the screen needs to draw one picture. */
export interface RigScreenView {
  /** The race; null with nobody racing (the tables and the title). */
  frame: RaceFrame | null;
  /** Who's driving, and their car's color. */
  driver?: { name: string; color: string };
  scores: RigScores;
  /** Whose times to pick out on the tables. */
  mine?: string;
  /** The line at the bottom: what to press. */
  prompt?: string;
  /** Where the finished race went on the tables (0 for not on it). */
  ranks?: { race: number; lap: number };
  /** Seconds, for anything that blinks. */
  t: number;
}

const FONT = 'Nunito, ui-rounded, system-ui, sans-serif';
const FOV = 100;
const CAM_H = 1000;
const DEPTH = 1 / Math.tan(((FOV / 2) * Math.PI) / 180);
/** The camera rides this far behind your car. */
const PLAYER_Z = CAM_H * DEPTH;
/** How many segments ahead it draws. */
const DRAW = 150;
const LANES = 3;
/** A car, in the road's units: 0.3 of the road's half-width across, as wide as CAR_W. */
const CAR_WORLD_W = CAR_W * ROAD_W;
const FOG = '#dfe7fd';

const COLORS = {
  light: { road: '#6c757d', grass: '#8fd694', rumble: '#ef476f', lane: '#f8f9fa' },
  dark: { road: '#646b72', grass: '#7cc985', rumble: '#f8f9fa', lane: '' },
};

/** Where a point of road ends up on the screen, and how big things there are. */
interface Proj {
  x: number;
  y: number;
  /** The road's half-width there, in pixels. */
  w: number;
  scale: number;
}

/** The attract mode's still: a little way down the start straight, the rivals lined up ahead. */
const ATTRACT: RaceFrame = { phase: 'count', t: -3000, dist: 28 * SEG, x: 0.2, speed: 0, steer: 0, boost: 1, boosting: false, laps: [], place: 6, cars: RIVALS.flatMap((_, i) => [(33 + i * 5) * SEG, i % 2 ? 0.45 : -0.45, 0]) };

export function paintRig(g: CanvasRenderingContext2D, v: RigScreenView) {
  g.save();
  const f = v.frame ?? ATTRACT;
  paintRoad(g, f, v.driver?.color ?? '#ef476f', v.t);
  if (!v.frame) paintAttract(g, v);
  else paintHud(g, v, v.frame);
  g.restore();
}

// ---- The road --------------------------------------------------------------------------------

function paintRoad(g: CanvasRenderingContext2D, f: RaceFrame, color: string, t: number) {
  const segs = TRACK.segments;
  const N = segs.length;
  const L = TRACK.length;
  const camZ = wrap(f.dist - PLAYER_Z, L);
  const base = segmentAt(TRACK, camZ);
  const basePct = wrap(camZ, SEG) / SEG;
  const playerY = heightAt(TRACK, f.dist);
  const camY = playerY + CAM_H;
  const camX = f.x * ROAD_W;

  paintSky(g, TRACK.turned[base.index] + base.curve * basePct, playerY);

  const p1s: (Proj | null)[] = new Array(DRAW).fill(null);
  const p2s: (Proj | null)[] = new Array(DRAW).fill(null);
  const clips: number[] = new Array(DRAW).fill(H);
  let maxy = H;
  let x = 0;
  let dx = -(base.curve * basePct);
  const project = (y: number, z: number, cx: number): Proj => {
    const scale = DEPTH / z;
    return { x: W / 2 - scale * cx * (W / 2), y: H / 2 - scale * (y - camY) * (H / 2), w: scale * ROAD_W * (W / 2), scale };
  };
  for (let n = 0; n < DRAW; n++) {
    const seg = segs[(base.index + n) % N];
    const looped = seg.index < base.index;
    const z1 = seg.index * SEG + (looped ? L : 0) - camZ;
    const z2 = z1 + SEG;
    clips[n] = maxy;
    if (z1 <= DEPTH) {
      x += dx;
      dx += seg.curve;
      continue;
    }
    const p1 = project(seg.y1, z1, camX - x);
    const p2 = project(seg.y2, z2, camX - x - dx);
    x += dx;
    dx += seg.curve;
    p1s[n] = p1;
    p2s[n] = p2;
    if (p2.y >= p1.y || p2.y >= maxy) continue;
    paintSegment(g, seg.index, p1, p2, n / DRAW);
    maxy = p2.y;
  }

  // Back to front: the scenery and the rivals on each segment, hidden behind any hill in front.
  const rivals = RIVALS.map((r, i) => ({ color: r.color, dist: f.cars[i * 3], x: f.cars[i * 3 + 1] }));
  for (let n = DRAW - 1; n > 0; n--) {
    const p1 = p1s[n];
    const p2 = p2s[n];
    if (!p1 || !p2) continue;
    const seg = segs[(base.index + n) % N];
    const clip = clips[n];
    for (const s of seg.scenery) paintScenery(g, s, p1, clip);
    for (const r of rivals) {
      if (Math.floor(wrap(r.dist, L) / SEG) !== seg.index) continue;
      const pct = wrap(r.dist, SEG) / SEG;
      const scale = p1.scale + (p2.scale - p1.scale) * pct;
      const sx = p1.x + (p2.x - p1.x) * pct + scale * r.x * ROAD_W * (W / 2);
      const sy = p1.y + (p2.y - p1.y) * pct;
      const w = scale * CAR_WORLD_W * (W / 2);
      clipped(g, clip, sy, () => paintCar(g, sx, sy, w, r.color, 0, false));
    }
  }

  // You: right in front of the camera, bobbing a little over the bumps.
  const w = (CAR_WORLD_W / CAM_H) * (W / 2);
  const bounce = f.speed > 0 ? Math.sin(t * 40) * Math.min(1.5, f.speed / 6000) : 0;
  const offroad = Math.abs(f.x) > 1 && f.speed > 0 ? Math.sin(t * 90) * 2.5 : 0;
  paintCar(g, W / 2, H - 6 + bounce + offroad, w, color, f.steer, f.boosting);
}

function paintSky(g: CanvasRenderingContext2D, turned: number, y: number) {
  const sky = g.createLinearGradient(0, 0, 0, H / 2);
  sky.addColorStop(0, '#4cc9f0');
  sky.addColorStop(1, '#caf0f8');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);
  // The sun, and a couple of clouds, far off.
  const sun = wrap(W * 0.72 - turned * 0.35, W * 2) - W / 2;
  g.fillStyle = '#ffd166';
  g.beginPath();
  g.arc(sun, 52, 22, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.85)';
  for (const [cx, cy, s] of [
    [120, 60, 1],
    [430, 38, 0.8],
    [820, 70, 1.2],
  ]) {
    const px = wrap(cx - turned * 0.6, W + 200) - 100;
    for (const [ox, oy, r] of [
      [0, 0, 16],
      [18, -6, 20],
      [38, 0, 15],
    ])
      g.beginPath(), g.arc(px + ox * s, cy + oy * s, r * s, 0, Math.PI * 2), g.fill();
  }
  // Two rows of hills, the far one turning slower, both sinking as you climb.
  const horizon = H / 2 + 14 + Math.max(-30, Math.min(30, y / 400));
  hills(g, horizon, turned * 1.2, '#b8c0ff', 34, 0.011);
  hills(g, horizon + 6, turned * 2.4, '#9bd4a6', 22, 0.02);
  // The town on the far side of the hills: the office's building among others.
  const town = wrap(-turned * 3.2, W * 1.5);
  for (let i = 0; i < 14; i++) {
    const bx = wrap(town + i * 71, W * 1.5) - W * 0.25;
    const bh = 18 + ((i * 37) % 30);
    g.fillStyle = i % 5 === 2 ? '#f4a261' : '#8d99ae';
    g.fillRect(bx, horizon - bh, 24, bh);
    g.fillStyle = '#ffe8a3';
    for (let wy = horizon - bh + 5; wy < horizon - 4; wy += 7) g.fillRect(bx + 5, wy, 4, 3), g.fillRect(bx + 14, wy, 4, 3);
  }
  g.fillStyle = COLORS.dark.grass;
  g.fillRect(0, horizon, W, H - horizon);
}

function hills(g: CanvasRenderingContext2D, base: number, turned: number, color: string, height: number, k: number) {
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(0, base);
  for (let x = 0; x <= W; x += 8) {
    const u = x + turned;
    g.lineTo(x, base - height * (0.55 + 0.3 * Math.sin(u * k) + 0.15 * Math.sin(u * k * 2.7 + 1)));
  }
  g.lineTo(W, base);
  g.closePath();
  g.fill();
}

function quad(g: CanvasRenderingContext2D, x1: number, y1: number, w1: number, x2: number, y2: number, w2: number, color: string) {
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(x1 - w1, y1);
  g.lineTo(x2 - w2, y2);
  g.lineTo(x2 + w2, y2);
  g.lineTo(x1 + w1, y1);
  g.closePath();
  g.fill();
}

function paintSegment(g: CanvasRenderingContext2D, index: number, p1: Proj, p2: Proj, far: number) {
  const c = Math.floor(index / 3) % 2 ? COLORS.dark : COLORS.light;
  g.fillStyle = c.grass;
  g.fillRect(0, p2.y, W, p1.y - p2.y + 1);
  const r1 = p1.w / 6;
  const r2 = p2.w / 6;
  quad(g, p1.x, p1.y + 1, p1.w + r1, p2.x, p2.y, p2.w + r2, c.rumble);
  quad(g, p1.x, p1.y + 1, p1.w, p2.x, p2.y, p2.w, c.road);
  if (index < 3) {
    // The start line: a band of checks right across.
    const cells = 10;
    for (let i = 0; i < cells; i++) {
      if ((i + index) % 2) continue;
      const a = -1 + (2 * i) / cells;
      const b = a + 2 / cells;
      g.fillStyle = '#f8f9fa';
      g.beginPath();
      g.moveTo(p1.x + a * p1.w, p1.y + 1);
      g.lineTo(p2.x + a * p2.w, p2.y);
      g.lineTo(p2.x + b * p2.w, p2.y);
      g.lineTo(p1.x + b * p1.w, p1.y + 1);
      g.fill();
    }
  } else if (c.lane) {
    const l1 = p1.w / 32;
    const l2 = p2.w / 32;
    for (let lane = 1; lane < LANES; lane++) {
      const a = -1 + (2 * lane) / LANES;
      quad(g, p1.x + a * p1.w, p1.y + 1, l1, p2.x + a * p2.w, p2.y, l2, c.lane);
    }
  }
  // Fog, thicker further off.
  const fog = 1 - Math.exp(-far * far * 4.5);
  if (fog > 0.02) {
    g.globalAlpha = fog;
    g.fillStyle = FOG;
    g.fillRect(0, p2.y, W, p1.y - p2.y + 1);
    g.globalAlpha = 1;
  }
}

/** `draw` hidden below `clip` (a hill in front), where it reaches down past it. */
function clipped(g: CanvasRenderingContext2D, clip: number, bottom: number, draw: () => void) {
  if (bottom <= clip) return draw();
  g.save();
  g.beginPath();
  g.rect(0, 0, W, clip);
  g.clip();
  draw();
  g.restore();
}

/** Scenery sizes in the road's units: width and height. */
const SIZES: Record<Scenery['kind'], [number, number]> = {
  tree: [1100, 1500],
  bush: [900, 450],
  palm: [1000, 1800],
  lamp: [260, 1500],
  sign: [1700, 1150],
  cone: [170, 240],
};

function paintScenery(g: CanvasRenderingContext2D, s: Scenery, p: Proj, clip: number) {
  const [ww, wh] = SIZES[s.kind];
  const w = ww * p.scale * (W / 2);
  const h = wh * p.scale * (W / 2);
  if (w < 1.2 || p.y - h > H) return;
  // Out beside the road, never over it: the near edge at `offset`.
  const x = p.x + p.scale * s.offset * ROAD_W * (W / 2) + (s.offset < 0 ? -w : 0);
  if (x > W || x + w < 0) return;
  const y = p.y;
  clipped(g, clip, y, () => {
    switch (s.kind) {
      case 'tree':
        g.fillStyle = '#8a5a3b';
        g.fillRect(x + w * 0.44, y - h * 0.38, w * 0.12, h * 0.38);
        g.fillStyle = '#2a9d8f';
        blob(g, x + w * 0.5, y - h * 0.62, w * 0.42, h * 0.3);
        g.fillStyle = '#40b39f';
        blob(g, x + w * 0.42, y - h * 0.72, w * 0.26, h * 0.2);
        break;
      case 'bush':
        g.fillStyle = '#52b788';
        blob(g, x + w * 0.5, y - h * 0.45, w * 0.5, h * 0.45);
        g.fillStyle = '#ef476f';
        blob(g, x + w * 0.35, y - h * 0.55, w * 0.05, w * 0.05);
        blob(g, x + w * 0.62, y - h * 0.4, w * 0.05, w * 0.05);
        break;
      case 'palm': {
        g.strokeStyle = '#b07d4f';
        g.lineWidth = Math.max(1, w * 0.1);
        g.beginPath();
        g.moveTo(x + w * 0.5, y);
        g.quadraticCurveTo(x + w * 0.62, y - h * 0.5, x + w * 0.5, y - h * 0.88);
        g.stroke();
        g.fillStyle = '#06d6a0';
        for (const a of [-2.6, -2, -1.2, -0.5, 0.2]) {
          g.beginPath();
          g.ellipse(x + w * 0.5 + Math.cos(a) * w * 0.28, y - h * 0.88 + Math.sin(a) * h * 0.06 + h * 0.04, w * 0.3, h * 0.035, a + Math.PI / 2 + 1.4, 0, Math.PI * 2);
          g.fill();
        }
        break;
      }
      case 'lamp':
        g.fillStyle = '#495057';
        g.fillRect(x + w * 0.4, y - h, w * 0.2, h);
        g.fillStyle = '#ffd166';
        blob(g, x + w * 0.5, y - h, w * 0.5, w * 0.35);
        break;
      case 'sign': {
        g.fillStyle = '#495057';
        g.fillRect(x + w * 0.15, y - h * 0.45, w * 0.05, h * 0.45);
        g.fillRect(x + w * 0.8, y - h * 0.45, w * 0.05, h * 0.45);
        g.fillStyle = '#1b1d3a';
        round(g, x, y - h, w, h * 0.6, h * 0.06);
        g.fillStyle = '#ffd166';
        round(g, x + w * 0.04, y - h * 0.95, w * 0.92, h * 0.5, h * 0.04);
        if (w > 18) {
          g.fillStyle = '#1b1d3a';
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.font = `900 ${Math.round(h * 0.26)}px ${FONT}`;
          g.fillText(s.text ?? '', x + w / 2, y - h * 0.7, w * 0.86);
        }
        break;
      }
      case 'cone':
        g.fillStyle = '#ff8a5b';
        g.beginPath();
        g.moveTo(x + w * 0.5, y - h);
        g.lineTo(x + w, y);
        g.lineTo(x, y);
        g.fill();
        g.fillStyle = '#f8f9fa';
        g.fillRect(x + w * 0.3, y - h * 0.5, w * 0.4, h * 0.12);
        break;
    }
  });
}

function blob(g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number) {
  g.beginPath();
  g.ellipse(x, y, Math.max(0.5, rx), Math.max(0.5, ry), 0, 0, Math.PI * 2);
  g.fill();
}

function round(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2)));
  g.fill();
}

/** A car from behind, `w` wide, its wheels on `y`; leaning into `steer`, with flames out the back on the boost. */
function paintCar(g: CanvasRenderingContext2D, x: number, y: number, w: number, color: string, steer: number, boosting: boolean) {
  if (w < 1.5) return;
  const h = w * 0.55;
  g.save();
  g.translate(x, y);
  g.rotate(steer * 0.05);
  if (boosting) {
    g.fillStyle = '#ffd166';
    blob(g, -w * 0.22, -h * 0.18, w * 0.07, h * 0.12);
    blob(g, w * 0.22, -h * 0.18, w * 0.07, h * 0.12);
    g.fillStyle = '#ff8a5b';
    blob(g, -w * 0.22, -h * 0.18, w * 0.04, h * 0.07);
    blob(g, w * 0.22, -h * 0.18, w * 0.04, h * 0.07);
  }
  // Shadow, tyres, body, the cabin with its rear window, the spoiler and the lights.
  g.fillStyle = 'rgba(0,0,0,0.25)';
  blob(g, 0, -h * 0.02, w * 0.55, h * 0.1);
  g.fillStyle = '#1b1d2e';
  round(g, -w * 0.5, -h * 0.42, w * 0.2, h * 0.42, w * 0.04);
  round(g, w * 0.3, -h * 0.42, w * 0.2, h * 0.42, w * 0.04);
  g.fillStyle = color;
  round(g, -w * 0.46, -h * 0.72, w * 0.92, h * 0.5, w * 0.08);
  round(g, -w * 0.3 - steer * w * 0.04, -h * 0.98, w * 0.6, h * 0.36, w * 0.1);
  g.fillStyle = '#233044';
  round(g, -w * 0.24 - steer * w * 0.05, -h * 0.92, w * 0.48, h * 0.22, w * 0.05);
  g.fillStyle = '#1b1d2e';
  round(g, -w * 0.5, -h * 0.8, w, h * 0.08, w * 0.02);
  g.fillStyle = '#ef233c';
  round(g, -w * 0.4, -h * 0.6, w * 0.16, h * 0.1, w * 0.03);
  round(g, w * 0.24, -h * 0.6, w * 0.16, h * 0.1, w * 0.03);
  g.fillStyle = '#f8f9fa';
  round(g, -w * 0.1, -h * 0.5, w * 0.2, h * 0.09, w * 0.02);
  g.restore();
}

// ---- The words over it ---------------------------------------------------------------------------

function panel(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  g.fillStyle = 'rgba(27,29,58,0.78)';
  round(g, x, y, w, h, 10);
}

function text(g: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color = '#f8f9fa', align: CanvasTextAlign = 'left', weight = 900) {
  g.font = `${weight} ${size}px ${FONT}`;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.lineWidth = Math.max(2, size / 7);
  g.strokeStyle = '#1b1d3a';
  g.lineJoin = 'round';
  g.strokeText(s, x, y);
  g.fillStyle = color;
  g.fillText(s, x, y);
}

function paintHud(g: CanvasRenderingContext2D, v: RigScreenView, f: RaceFrame) {
  const done = f.laps.reduce((a, b) => a + b, 0);
  const lap = Math.min(LAPS, f.laps.length + 1);
  const best = f.laps.length ? Math.min(...f.laps) : 0;
  // Lap and time, top left.
  panel(g, 10, 10, 150, 58);
  text(g, `LAP ${lap}/${LAPS}`, 22, 28, 18, '#ffd166');
  text(g, lapText(Math.max(0, f.phase === 'done' ? done : f.t)), 22, 52, 20);
  // Place, top right.
  panel(g, W - 110, 10, 100, 58);
  text(g, ordinal(f.place), W - 60, 34, 30, f.place === 1 ? '#ffd166' : '#f8f9fa', 'center');
  text(g, `of ${RIVALS.length + 1}`, W - 60, 58, 12, '#caf0f8', 'center', 800);
  // Best lap and who's driving, top middle.
  if (best) text(g, `BEST ${lapText(best)}`, W / 2, 22, 14, '#caf0f8', 'center');
  if (v.driver) text(g, `▶ ${v.driver.name.toUpperCase()}`, W / 2, best ? 42 : 24, 13, '#f8f9fa', 'center', 800);
  // Speed, bottom left.
  panel(g, 10, H - 50, 112, 40);
  text(g, `${Math.round((f.speed / 12000) * 240)}`, 64, H - 30, 22, '#f8f9fa', 'right');
  text(g, 'km/h', 70, H - 28, 12, '#caf0f8', 'left', 800);
  // The boost, bottom right.
  panel(g, W - 132, H - 50, 122, 40);
  text(g, 'BOOST', W - 122, H - 38, 10, '#caf0f8', 'left', 800);
  g.fillStyle = '#1b1d2e';
  round(g, W - 122, H - 29, 102, 12, 6);
  g.fillStyle = f.boosting ? '#ff8a5b' : '#06d6a0';
  round(g, W - 122, H - 29, 102 * f.boost, 12, 6);

  if (f.phase === 'count') {
    // The lights: red, red, red, and the number.
    const lit = f.t < -2000 ? 1 : f.t < -1000 ? 2 : 3;
    panel(g, W / 2 - 70, 70, 140, 44);
    for (let i = 0; i < 3; i++) {
      g.fillStyle = i < lit ? '#ef233c' : '#3a3d5c';
      g.beginPath();
      g.arc(W / 2 - 40 + i * 40, 92, 14, 0, Math.PI * 2);
      g.fill();
    }
    text(g, String(Math.ceil(-f.t / 1000)), W / 2, H / 2 + 10, 72, '#ffd166', 'center');
  } else if (f.phase === 'race' && f.t < 900) {
    text(g, 'GO!', W / 2, H / 2, 80, '#06d6a0', 'center');
  } else if (f.phase === 'race' && f.laps.length && f.t - done < 1800) {
    const last = f.laps[f.laps.length - 1];
    const record = best === last && f.laps.length > 1;
    text(g, lap === LAPS ? 'FINAL LAP' : `LAP ${lap}`, W / 2, H / 2 - 50, 40, '#ffd166', 'center');
    text(g, `${lapText(last)}${record ? ' · BEST!' : ''}`, W / 2, H / 2 - 14, 22, record ? '#06d6a0' : '#f8f9fa', 'center');
  } else if (f.phase === 'done') {
    panel(g, W / 2 - 170, 60, 340, 200);
    text(g, f.place === 1 ? '🏆 YOU WIN!' : `FINISHED ${ordinal(f.place).toUpperCase()}`, W / 2, 92, 30, '#ffd166', 'center');
    text(g, `RACE  ${lapText(done)}`, W / 2, 132, 20, '#f8f9fa', 'center');
    text(g, `BEST LAP  ${lapText(best)}`, W / 2, 160, 18, '#caf0f8', 'center');
    const r = v.ranks;
    const note = r ? [r.race ? `#${r.race} fastest race` : '', r.lap ? `#${r.lap} fastest lap` : ''].filter(Boolean).join(' · ') : '';
    if (note) text(g, `🏁 ${note}`, W / 2, 192, 16, '#06d6a0', 'center');
    if (v.prompt && Math.floor(v.t * 1.6) % 2 === 0) text(g, v.prompt, W / 2, 232, 15, '#f8f9fa', 'center');
  }
}

function paintAttract(g: CanvasRenderingContext2D, v: RigScreenView) {
  g.fillStyle = 'rgba(27,29,58,0.35)';
  g.fillRect(0, 0, W, H);
  // The title, in the cabinet's colors.
  const letters = [...RIG_GAME];
  const colors = ['#ef476f', '#ffd166', '#06d6a0', '#4cc9f0', '#b388eb', '#ff8a5b'];
  g.font = `900 54px ${FONT}`;
  const widths = letters.map((ch) => g.measureText(ch).width);
  let x = W / 2 - widths.reduce((a, b) => a + b, 0) / 2;
  letters.forEach((ch, i) => {
    text(g, ch, x + widths[i] / 2, 50, 54, colors[i % colors.length], 'center');
    x += widths[i];
  });
  const table = (title: string, list: RigScores['races'], x0: number) => {
    panel(g, x0, 86, 290, 196);
    text(g, title, x0 + 145, 104, 15, '#ffd166', 'center');
    if (!list.length) text(g, 'no times yet', x0 + 145, 180, 14, '#caf0f8', 'center', 800);
    list.slice(0, 7).forEach((s, i) => {
      const y = 132 + i * 21;
      const me = s.name === v.mine;
      text(g, `${i + 1}.`, x0 + 26, y, 14, me ? '#06d6a0' : '#caf0f8', 'right', 800);
      g.fillStyle = s.color;
      g.beginPath();
      g.arc(x0 + 38, y, 5, 0, Math.PI * 2);
      g.fill();
      text(g, s.name.slice(0, 14).toUpperCase(), x0 + 50, y, 14, me ? '#06d6a0' : '#f8f9fa', 'left', 800);
      text(g, lapText(s.ms), x0 + 276, y, 14, me ? '#06d6a0' : '#f8f9fa', 'right', 800);
    });
  };
  table('🏁 FASTEST RACES', v.scores.races, 22);
  table('⏱️ LAP RECORDS', v.scores.laps, W - 312);
  if (v.prompt && Math.floor(v.t * 1.6) % 2 === 0) text(g, v.prompt, W / 2, H - 38, 22, '#f8f9fa', 'center');
}
