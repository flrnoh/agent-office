// flrnoh fork (see FORK.md "The minimap" and "Traffic lights and the city bus"): the bus network on the
// maps. On the big map (J) every line's route in its color, the stops as little H's, and the buses
// where they are now, each a tag with its line's number; on the minimap the buses and, zoomed in, the
// stops round about.

import { BUS_LINES, type BusLine, type BusPose } from '../../../shared/citybus';
import { FURNITURE } from '../../../shared/streetside';

type Point = (x: number, z: number) => { x: number; y: number };

/** The bus stops, once. */
const STOPS = FURNITURE.filter((f) => f.stop);

/** Every line's route, a line in its color (`width` px), each a little to its own side so they don't hide each other. */
export function drawRoutes(g: CanvasRenderingContext2D, at: Point, width: number) {
  g.save();
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.globalAlpha = 0.75;
  for (const line of BUS_LINES) {
    g.strokeStyle = line.color;
    g.lineWidth = width;
    g.beginPath();
    for (let i = 0; i <= line.xs.length; i += 6) {
      const k = i % line.xs.length;
      const p = at(line.xs[k], line.zs[k]);
      if (i === 0) g.moveTo(p.x, p.y);
      else g.lineTo(p.x, p.y);
    }
    g.closePath();
    g.stroke();
  }
  g.restore();
}

/** The stops: a yellow dot with a green ring (`r` px), and with `names` their names under them. */
export function drawStops(g: CanvasRenderingContext2D, at: Point, r: number, names = false) {
  g.save();
  for (const f of STOPS) {
    const p = at(f.x, f.z);
    g.fillStyle = '#ffd60a';
    g.strokeStyle = '#0a7d3b';
    g.lineWidth = Math.max(1.5, r * 0.45);
    g.beginPath();
    g.arc(p.x, p.y, r, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    if (!names) continue;
    g.font = `600 ${Math.round(r * 2.2)}px system-ui, sans-serif`;
    g.fillStyle = '#0a5b2b';
    g.textAlign = 'center';
    g.textBaseline = 'top';
    g.fillText(f.stop!.name, p.x, p.y + r + 2);
  }
  g.restore();
}

/** The buses where they are now: a tag in the line's color with its number (`s` px high). */
export function drawBuses(g: CanvasRenderingContext2D, at: Point, buses: readonly { line: BusLine; pose: BusPose }[], s: number) {
  g.save();
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `bold ${Math.round(s * 0.72)}px system-ui, sans-serif`;
  for (const b of buses) {
    const p = at(b.pose.x, b.pose.z);
    const w = s * 1.25 + (b.line.no.length - 1) * s * 0.4;
    g.fillStyle = b.line.color;
    g.strokeStyle = '#2b2d42';
    g.lineWidth = Math.max(1.5, s * 0.12);
    g.beginPath();
    g.roundRect(p.x - w / 2, p.y - s / 2, w, s, s * 0.3);
    g.fill();
    g.stroke();
    g.fillStyle = '#fff';
    g.fillText(b.line.no, p.x, p.y + s * 0.04);
  }
  g.restore();
}
