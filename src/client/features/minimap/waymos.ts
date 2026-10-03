// flrnoh fork (see FORK.md "The minimap" and "Waymo"): the robotaxis on the maps: a little white car
// for each, yours (booked or riding) in teal with your initials.
import { store } from '../../state';
import { fleet, posesNow } from '../waymo/state';

type Point = (x: number, z: number) => { x: number; y: number };

/** Every robotaxi where it is now, `s` px across; `keep` says which are worth drawing (in the dial). */
export function drawWaymos(g: CanvasRenderingContext2D, at: Point, s: number, keep: (p: { x: number; y: number }) => boolean = () => true) {
  const poses = posesNow();
  g.save();
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const c of fleet) {
    const q = poses.get(c.id);
    if (!q) continue;
    const p = at(q.x, q.z);
    if (!keep(p)) continue;
    const mine = c.booker === store.you || c.riders.includes(store.you);
    const w = mine ? s * 1.6 : s;
    g.fillStyle = mine ? '#00a99d' : '#f4f5f2';
    g.strokeStyle = '#2b2d42';
    g.lineWidth = Math.max(1.5, s * 0.14);
    g.beginPath();
    g.roundRect(p.x - w / 2, p.y - s * 0.4, w, s * 0.8, s * 0.3);
    g.fill();
    g.stroke();
    g.fillStyle = mine ? '#fff' : '#2b2d42';
    g.font = `bold ${Math.round(s * 0.55)}px system-ui, sans-serif`;
    g.fillText(mine ? (c.initials ?? 'W') : 'W', p.x, p.y + s * 0.03);
  }
  g.restore();
}
