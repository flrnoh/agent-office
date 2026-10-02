import * as THREE from 'three';
import { FLOOR, WALL_HEIGHT, WING, type Opening, type Side } from '../../../../shared/layout';
import type { InteriorStyle, WallFinish } from '../../../../shared/interiors';
import { mulberry32 } from '../../../../shared/rng';
import { mesh, toon } from '../../toon';
import { shade } from './paint';

// flrnoh fork (see FORK.md, "Each storey its own interior"): what an interior puts on the office's
// walls, past their paint: a skin just off the inside of a wall (round its windows and doors, like the
// accent wall in storey-walls.ts, but textured in meters so a brick is the same size everywhere), and
// the rails and mouldings that go along it.

/** How far off the wall a finish's skin is: in front of the accent wall's paint (0.006). */
const OFF = 0.012;
const BASE = 0.25;
const SIDES: Side[] = ['north', 'south', 'east', 'west'];

/** Where along wall `side` the skin goes: the north wall's stops where the back office comes through. */
function span(side: Side): [number, number] {
  if (side === 'north') return [FLOOR.minX, WING.minX];
  if (side === 'south') return [FLOOR.minX, FLOOR.maxX];
  return [FLOOR.minZ, FLOOR.maxZ];
}

/** The way into the room from wall `side`, and where its inside face is. */
function frame(side: Side, off: number): { along: 'x' | 'z'; at: number; rotY: number; inX: number; inZ: number } {
  switch (side) {
    case 'north':
      return { along: 'x', at: FLOOR.minZ + off, rotY: 0, inX: 0, inZ: 1 };
    case 'south':
      return { along: 'x', at: FLOOR.maxZ - off, rotY: Math.PI, inX: 0, inZ: -1 };
    case 'west':
      return { along: 'z', at: FLOOR.minX + off, rotY: Math.PI / 2, inX: 1, inZ: 0 };
    case 'east':
      return { along: 'z', at: FLOOR.maxX - off, rotY: -Math.PI / 2, inX: -1, inZ: 0 };
  }
}

/** The stretches of wall `side` between `y0` and `y1` that no opening in `holes` cuts into, as [u0, u1, y0, y1] pieces. */
export function wallPieces(side: Side, holes: readonly Opening[], y0: number, y1: number): [number, number, number, number][] {
  const [u0, u1] = span(side);
  const out: [number, number, number, number][] = [];
  const piece = (a: number, b: number, lo: number, hi: number) => {
    lo = Math.max(lo, y0);
    hi = Math.min(hi, y1);
    if (b - a > 0.001 && hi - lo > 0.001) out.push([a, b, lo, hi]);
  };
  let u = u0;
  for (const o of holes.filter((h) => h.wall === side).sort((a, b) => a.u - b.u)) {
    const h0 = Math.max(u0, o.u - o.width / 2);
    const h1 = Math.min(u1, o.u + o.width / 2);
    if (h1 <= h0) continue;
    piece(u, h0, y0, y1);
    piece(h0, h1, o.y1, y1);
    piece(h0, h1, y0, o.y0);
    u = h1;
  }
  piece(u, u1, y0, y1);
  return out;
}

/**
 * A skin over wall `side` from `y0` up to `y1` in `mat`, round `holes`. Its uvs are in meters along the
 * wall and up it, over `tile` (a texture repeats every `tile` meters).
 */
function skin(side: Side, mat: THREE.Material, holes: readonly Opening[], y0: number, y1: number, tile: [number, number], off = OFF): THREE.Group {
  const g = new THREE.Group();
  const f = frame(side, off);
  for (const [a, b, lo, hi] of wallPieces(side, holes, y0, y1)) {
    const geo = new THREE.PlaneGeometry(b - a, hi - lo);
    // Meters along and up, so the pattern lines up from one piece to the next.
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    // Looking at the wall from inside the room, along runs left to right: +x on the north wall, -x on the south, and so on.
    const flip = side === 'south' || side === 'west' ? -1 : 1;
    for (let i = 0; i < uv.count; i++) {
      const u = (a + b) / 2 + pos.getX(i) * flip;
      uv.setXY(i, (u * flip) / tile[0], ((lo + hi) / 2 + pos.getY(i)) / tile[1]);
    }
    const u = (a + b) / 2;
    const m = mesh(geo, mat, f.along === 'x' ? u : f.at, (lo + hi) / 2, f.along === 'x' ? f.at : u, false);
    m.rotation.y = f.rotY;
    m.receiveShadow = true;
    g.add(m);
  }
  return g;
}

/** A moulding or rail `h` high, `d` deep along wall `side` with its middle `y` up, broken where an opening comes down (or up) through it. */
function rail(side: Side, mat: THREE.Material, holes: readonly Opening[], y: number, h: number, d: number): THREE.Group {
  const g = new THREE.Group();
  const f = frame(side, d / 2);
  for (const [a, b, lo, hi] of wallPieces(side, holes, y - h / 2, y + h / 2)) {
    if (hi - lo < h - 0.001) continue; // only a sliver left: no rail there
    const len = b - a;
    const u = (a + b) / 2;
    const geo = f.along === 'x' ? new THREE.BoxGeometry(len, h, d) : new THREE.BoxGeometry(d, h, len);
    g.add(mesh(geo, mat, f.along === 'x' ? u : f.at, (lo + hi) / 2, f.along === 'x' ? f.at : u, false));
  }
  return g;
}

/** The finishes' materials, made once a style (their textures are canvases worth keeping). */
const MADE = new Map<string, THREE.Material>();
function once<M extends THREE.Material>(key: string, make: () => M): M {
  let m = MADE.get(key) as M | undefined;
  if (!m) MADE.set(key, (m = make()));
  return m;
}

/** Plain paint in `color`, without a cartoon outline (it's a flat wall). */
function flat(color: string): THREE.MeshToonMaterial {
  const m = toon(color).clone();
  m.userData.outlineParameters = { visible: false };
  return m;
}

/** A canvas texture `w` by `h` px, painted by `paint`, repeating, without a cartoon outline on what wears it. */
function canvasMaterial(w: number, h: number, paint: (g: CanvasRenderingContext2D) => void, opts: { emissive?: string } = {}): THREE.MeshToonMaterial {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  paint(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  const m = toon('#ffffff').clone();
  m.map = t;
  if (opts.emissive) {
    m.emissive = new THREE.Color(opts.emissive);
    m.emissiveMap = t;
  }
  m.userData.outlineParameters = { visible: false };
  return m;
}

/** Brick, 1.2 m by 0.6 m a repeat: four bricks a course, four courses, every other one set over by half. */
function brick(): THREE.MeshToonMaterial {
  return canvasMaterial(256, 128, (g) => {
    g.fillStyle = '#d8cfc4';
    g.fillRect(0, 0, 256, 128);
    const reds = ['#a5543a', '#b5603f', '#9a4b33', '#b8694a', '#8f4530', '#c07254', '#a14f36'];
    for (let row = 0; row < 4; row++) {
      const off = row % 2 ? 32 : 0;
      // One brick past each edge, cut off by the canvas: the course carries on across the repeat.
      for (let col = -1; col <= 4; col++) {
        const x = off + col * 64;
        const k = (((col % 4) + 4) % 4) + row * 4;
        g.fillStyle = reds[(k * 5) % reds.length];
        g.fillRect(x + 3, row * 32 + 3, 58, 26);
        // A darker edge along the bottom, for depth.
        g.fillStyle = 'rgba(0,0,0,0.12)';
        g.fillRect(x + 3, row * 32 + 25, 58, 4);
      }
    }
  });
}

/** Light wooden battens on a dark backing, 0.6 m a repeat. */
function slats(style: InteriorStyle): THREE.MeshToonMaterial {
  return canvasMaterial(128, 32, (g) => {
    g.fillStyle = shade(style.wood, -0.35);
    g.fillRect(0, 0, 128, 32);
    for (let i = 0; i < 4; i++) {
      g.fillStyle = i % 2 ? style.wood : shade(style.wood, 0.04);
      g.fillRect(i * 32 + 4, 0, 24, 32);
      g.fillStyle = shade(style.wood, -0.08);
      g.fillRect(i * 32 + 25, 0, 3, 32);
    }
  });
}

/** Panelling below the dado rail: raised frames, 1.2 m wide. */
function wainscot(style: InteriorStyle): THREE.MeshToonMaterial {
  const trim = style.paint?.trim ?? '#ffffff';
  return canvasMaterial(128, 96, (g) => {
    g.fillStyle = trim;
    g.fillRect(0, 0, 128, 96);
    g.strokeStyle = shade(trim, -0.12);
    g.lineWidth = 4;
    g.strokeRect(14, 12, 100, 70);
    g.strokeStyle = shade(trim, -0.05);
    g.lineWidth = 2;
    g.strokeRect(22, 20, 84, 54);
  });
}

/** A moss wall: cushions of green in every shade, 1.2 m a repeat. */
function moss(): THREE.MeshToonMaterial {
  return canvasMaterial(128, 128, (g) => {
    g.fillStyle = '#4f7a3a';
    g.fillRect(0, 0, 128, 128);
    const rnd = mulberry32(13);
    const greens = ['#5f8f45', '#3f6b2f', '#6fa152', '#87b35f', '#355d27', '#7aa856'];
    for (let i = 0; i < 260; i++) {
      const x = rnd() * 128;
      const y = rnd() * 128;
      const r = 3 + rnd() * 9;
      g.fillStyle = greens[i % greens.length];
      for (const dx of [-128, 0, 128]) {
        for (const dy of [-128, 0, 128]) {
          g.beginPath();
          g.arc(x + dx, y + dy, r, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
  });
}

/** Seventies wallpaper: rings in orange, brown and mustard on cream, 0.8 m a repeat. */
function wallpaper(): THREE.MeshToonMaterial {
  return canvasMaterial(128, 128, (g) => {
    g.fillStyle = '#f3dfb8';
    g.fillRect(0, 0, 128, 128);
    const rings = ['#e07a1f', '#9c4a1a', '#c9a227'];
    for (const [cx, cy] of [[32, 32], [96, 96], [96, 32], [32, 96]]) {
      rings.forEach((color, i) => {
        g.fillStyle = color;
        g.beginPath();
        g.arc(cx, cy, 28 - i * 9, 0, Math.PI * 2);
        g.fill();
      });
      g.fillStyle = '#f3dfb8';
      g.beginPath();
      g.arc(cx, cy, 4, 0, Math.PI * 2);
      g.fill();
    }
  });
}

/** Dark acoustic panels with a thin glowing seam, 1.2 m a repeat. */
function panels(style: InteriorStyle): THREE.MeshToonMaterial {
  const glow = style.paint?.trim ?? '#19e3ff';
  return canvasMaterial(128, 128, (g) => {
    g.fillStyle = '#1b1e2c';
    g.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 128; y += 64) {
      for (let x = 0; x < 128; x += 64) {
        g.fillStyle = (x + y) % 128 ? '#22263a' : '#1e2234';
        g.fillRect(x + 3, y + 3, 58, 58);
        // Felt grooves.
        g.fillStyle = '#181a26';
        for (let i = 10; i < 58; i += 8) g.fillRect(x + 3, y + i, 58, 2);
      }
    }
    g.fillStyle = glow;
    g.fillRect(0, 63, 128, 2);
  }, { emissive: '#ffffff' });
}

/** Shoji: paper in a dark wooden lattice, 0.9 m a repeat. */
function shoji(style: InteriorStyle): THREE.MeshToonMaterial {
  const wood = style.paint?.trim ?? '#3a2a1e';
  return canvasMaterial(96, 128, (g) => {
    g.fillStyle = '#fbf6ea';
    g.fillRect(0, 0, 96, 128);
    g.fillStyle = wood;
    for (let x = 0; x <= 96; x += 32) g.fillRect(x - 2, 0, 4, 128);
    for (let y = 0; y <= 128; y += 32) g.fillRect(0, y - 2, 96, 4);
  }, { emissive: '#3a352a' });
}

/** The wall finishes as built for a storey: what `build` makes, given the walls they go on and the openings in them. */
type Build = (style: InteriorStyle, sides: readonly Side[], holes: readonly Opening[]) => THREE.Object3D[];

const FINISHES: Record<WallFinish, Build> = {
  none: () => [],
  brick: (_s, sides, holes) => {
    const mat = once('brick', brick);
    return sides.map((side) => skin(side, mat, holes, BASE, WALL_HEIGHT, [1.2, 0.6]));
  },
  slats: (s, sides, holes) => {
    const mat = once(`slats|${s.id}`, () => slats(s));
    const wood = toon(shade(s.wood, -0.1));
    return sides.flatMap((side) => [skin(side, mat, holes, BASE, 3.2, [0.6, 0.6]), rail(side, wood, holes, 3.25, 0.1, 0.06)]);
  },
  wainscot: (s, sides, holes) => {
    const mat = once(`wainscot|${s.id}`, () => wainscot(s));
    const trim = toon(s.paint?.trim ?? '#ffffff');
    return sides.flatMap((side) => [
      skin(side, mat, holes, BASE, 1.08, [1.2, 0.9]),
      // The dado rail over the panels, a picture rail high up, and the crown moulding under the ceiling.
      rail(side, trim, holes, 1.1, 0.07, 0.05),
      rail(side, trim, holes, WALL_HEIGHT - 0.9, 0.05, 0.03),
      rail(side, trim, holes, WALL_HEIGHT - 0.12, 0.24, 0.16),
      rail(side, trim, holes, WALL_HEIGHT - 0.3, 0.1, 0.09),
    ]);
  },
  moss: (s, sides, holes) => {
    const mat = once('moss', moss);
    const wood = toon(s.wood);
    return sides.flatMap((side) => [skin(side, mat, holes, 0.6, 4.6, [1.2, 1.2]), rail(side, wood, holes, 0.55, 0.1, 0.12), rail(side, wood, holes, 4.65, 0.1, 0.12)]);
  },
  wallpaper: (s, sides, holes) => {
    const mat = once('wallpaper', wallpaper);
    const panel = toon(s.wood);
    return sides.flatMap((side) => [
      skin(side, mat, holes, 1.2, WALL_HEIGHT, [0.8, 0.8]),
      // Dark wood panelling up to it, its grooves a rail at a time.
      skin(side, once(`panelling|${s.id}`, () => panelling(s.wood)), holes, BASE, 1.2, [0.4, 1]),
      rail(side, panel, holes, 1.22, 0.06, 0.05),
    ]);
  },
  panels: (s, sides, holes) => {
    const mat = once(`panels|${s.id}`, () => panels(s));
    return sides.map((side) => skin(side, mat, holes, BASE, WALL_HEIGHT, [1.2, 1.2]));
  },
  shoji: (s, sides, holes) => {
    const mat = once(`shoji|${s.id}`, () => shoji(s));
    const wood = toon(s.paint?.trim ?? '#3a2a1e');
    return sides.flatMap((side) => [skin(side, mat, holes, BASE, 2.9, [0.9, 1.2]), rail(side, wood, holes, 2.95, 0.12, 0.08), rail(side, wood, holes, WALL_HEIGHT - 0.1, 0.2, 0.1)]);
  },
};

/** Vertical tongue-and-groove boards in `wood`, 0.4 m a repeat. */
function panelling(wood: string): THREE.MeshToonMaterial {
  return canvasMaterial(64, 32, (g) => {
    g.fillStyle = shade(wood, -0.05);
    g.fillRect(0, 0, 64, 32);
    g.fillStyle = shade(wood, -0.2);
    g.fillRect(0, 0, 2, 32);
    g.fillRect(32, 0, 2, 32);
    g.fillStyle = shade(wood, 0.04);
    g.fillRect(4, 0, 10, 32);
  });
}

/**
 * Interior `style`'s wall finish for a storey whose accent wall is `accent` (the west wall on a floor
 * with none), round `holes` (its windows and doors). Its shapes are its own (dispose them when it
 * goes); its materials are kept for next time.
 */
export function wallFinish(style: InteriorStyle, accent: Side | null, holes: readonly Opening[]): THREE.Group {
  const sides = style.walls.where === 'all' ? SIDES : [accent ?? 'west'];
  const g = new THREE.Group();
  // The accent wall in the interior's own color, over the storey's, under the finish.
  if (style.accent && accent) g.add(skin(accent, once(`accent|${style.accent}`, () => flat(style.accent!)), holes, BASE, WALL_HEIGHT, [1, 1], OFF - 0.003));
  for (const part of FINISHES[style.walls.finish](style, sides, holes)) g.add(part);
  return g;
}
