import * as THREE from 'three';
import { BUS_LINES, nextCalls, type BusLine } from '../../../shared/citybus';
import { FURNITURE, type Furniture } from '../../../shared/streetside';
import { toon } from '../toon';
import { G } from './kit';

// flrnoh fork (see FORK.md "Traffic lights and the city bus"): what's on a bus stop's pole: the green
// H on yellow, the stop's name, the lines that call there, and the departures board, which counts the
// minutes down to the next buses off the timetable (shared/citybus.ts nextCalls) for whoever's near.

/** Where on a stop the pole stands (its own frame: `lx` along its front, `lz` toward the road). */
export function stopPole(f: Furniture): [number, number] {
  return f.stop?.pole ? [0, 0] : [2.1, 0.5];
}

/** A stop's lines: each with its place in the line's stops. */
const servedBy = (id: string): { line: BusLine; i: number }[] =>
  BUS_LINES.flatMap((line) => {
    const i = line.stops.findIndex((st) => st.id === id);
    return i < 0 ? [] : [{ line, i }];
  });

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

const tex = (c: HTMLCanvasElement) => {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
};

let hSign: THREE.MeshBasicMaterial | null = null;
/** The H: green on a yellow disc with a green ring, the same on every stop. */
function hMaterial(): THREE.MeshBasicMaterial {
  if (hSign) return hSign;
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#0a7d3b';
  g.beginPath();
  g.arc(64, 64, 62, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#ffd60a';
  g.beginPath();
  g.arc(64, 64, 52, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#0a7d3b';
  g.font = 'bold 76px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('H', 64, 68);
  return (hSign = new THREE.MeshBasicMaterial({ map: tex(c), transparent: true }));
}

/** The stop's name, and under it a badge in its color for each line that calls. */
function namePlate(name: string, lines: BusLine[]): THREE.MeshBasicMaterial {
  const [c, g] = canvas(256, 128);
  g.fillStyle = '#fbfbf7';
  g.fillRect(0, 0, 256, 128);
  g.strokeStyle = '#0a7d3b';
  g.lineWidth = 6;
  g.strokeRect(3, 3, 250, 122);
  g.fillStyle = '#0a7d3b';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let size = 40;
  do g.font = `bold ${size}px system-ui, sans-serif`;
  while (g.measureText(name).width > 236 && --size > 12);
  g.fillText(name, 128, 42);
  const w = 52;
  const x0 = 128 - (lines.length * (w + 8) - 8) / 2;
  lines.forEach((l, k) => {
    g.fillStyle = l.color;
    g.fillRect(x0 + k * (w + 8), 74, w, 40);
    g.fillStyle = '#fff';
    g.font = 'bold 28px system-ui, sans-serif';
    g.fillText(l.no, x0 + k * (w + 8) + w / 2, 95);
  });
  return new THREE.MeshBasicMaterial({ map: tex(c) });
}

/** A stop's departures board: drawn when someone's near, again when a minute changes. */
interface Board {
  f: Furniture;
  x: number;
  z: number;
  lines: { line: BusLine; i: number }[];
  g: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  key: string;
}

export interface BusStops {
  /** The boards within `near` m of (x, z), at `t` (seconds on the office's clock). */
  update(t: number, at: { x: number; z: number }, near: number): void;
  /** The stop's next departures, soonest first, as the board says them (for the hint at the stop). */
  departures(f: Furniture, t: number): { line: BusLine; secs: number }[];
}

/** Each stop's departures from `t` on: line and seconds till it's there (≤ 0: standing there now). */
function departuresOf(lines: { line: BusLine; i: number }[], t: number): { line: BusLine; secs: number }[] {
  return lines.flatMap(({ line, i }) => nextCalls(line, i, t, 2).map((at) => ({ line, secs: at - t }))).sort((a, b) => a.secs - b.secs);
}

/** Puts the signs and boards on every bus stop's pole into `group`. */
export function buildBusStops(group: THREE.Group): BusStops {
  const boards: Board[] = [];
  const steel = toon('#2b2d31');
  for (const f of FURNITURE) {
    if (f.kind !== 'bus' || !f.stop) continue;
    const lines = servedBy(f.stop.id);
    const [lx, lz] = stopPole(f);
    const c = Math.cos(f.yaw);
    const s = Math.sin(f.yaw);
    const x = f.x + lx * c + lz * s;
    const z = f.z - lx * s + lz * c;
    const sign = new THREE.Group();
    sign.position.set(x, G, z);
    // Square to the street, so it's read from along the sidewalk and from a bus coming.
    sign.rotation.y = f.yaw + Math.PI / 2;
    const plate = namePlate(f.stop.name, lines.map((l) => l.line));
    for (const side of [1, -1]) {
      const face = (geo: THREE.BufferGeometry, mat: THREE.Material, y: number) => {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(0, y, side * 0.065);
        if (side < 0) m.rotation.y = Math.PI;
        sign.add(m);
      };
      face(new THREE.CircleGeometry(0.3, 24), hMaterial(), 2.78);
      face(new THREE.PlaneGeometry(0.72, 0.36), plate, 2.27);
    }
    // The board, hung under the plate, facing both ways.
    const [cv, g] = canvas(256, 128);
    const texture = tex(cv);
    const screen = new THREE.MeshBasicMaterial({ map: texture });
    sign.add(new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.38, 0.12).translate(0, 1.72, 0), steel));
    for (const side of [1, -1]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.3), screen);
      m.position.set(0, 1.72, side * 0.062);
      if (side < 0) m.rotation.y = Math.PI;
      sign.add(m);
    }
    group.add(sign);
    boards.push({ f, x, z, lines, g, texture, key: '' });
  }

  function draw(b: Board, t: number) {
    const deps = departuresOf(b.lines, t).slice(0, 3);
    const rows = deps.map((d) => [d.line.no, d.line.dest, d.secs < 20 ? 'jetzt' : `${Math.ceil(d.secs / 60)} min`, d.line.color] as const);
    const key = rows.map((r) => r.join('|')).join(';');
    if (key === b.key) return;
    b.key = key;
    const g = b.g;
    g.fillStyle = '#050505';
    g.fillRect(0, 0, 256, 128);
    g.textBaseline = 'middle';
    rows.forEach(([no, dest, when, color], k) => {
      const y = 22 + k * 40;
      g.fillStyle = color;
      g.fillRect(8, y - 14, 38, 28);
      g.fillStyle = '#fff';
      g.font = 'bold 20px monospace';
      g.textAlign = 'center';
      g.fillText(no, 27, y + 1);
      g.textAlign = 'left';
      g.fillStyle = '#ffb627';
      g.font = 'bold 20px monospace';
      g.fillText(dest.slice(0, 10), 54, y + 1);
      g.textAlign = 'right';
      g.fillText(when, 248, y + 1);
    });
    b.texture.needsUpdate = true;
  }

  return {
    update(t, at, near) {
      for (const b of boards) if (Math.abs(b.x - at.x) < near && Math.abs(b.z - at.z) < near) draw(b, t);
    },
    departures(f, t) {
      const b = boards.find((x) => x.f === f);
      return b ? departuresOf(b.lines, t) : [];
    },
  };
}
