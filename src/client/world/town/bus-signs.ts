import * as THREE from 'three';
import type { BusLine } from '../../../shared/citybus';

// flrnoh fork (see FORK.md "Traffic lights and the city bus"): what a city bus says, drawn on canvases:
// the line and where it's going in amber dots over the windscreen, and inside the next stop over the
// aisle and the line's stops along the wall, the one coming up lit.

const AMBER = '#ffb627';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function texture(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** The dots between the LEDs, over the whole of a display. */
function dots(g: CanvasRenderingContext2D, w: number, h: number) {
  g.fillStyle = 'rgba(0,0,0,0.45)';
  for (let x = 0; x < w; x += 4) g.fillRect(x, 0, 1, h);
  for (let y = 0; y < h; y += 4) g.fillRect(0, y, w, 1);
}

/** The line's number and where it's going in amber dots on black, for the display outside. */
export function destTexture(line: BusLine): THREE.CanvasTexture {
  const [c, g] = canvas(512, 64);
  g.fillStyle = '#0b0b0b';
  g.fillRect(0, 0, 512, 64);
  g.fillStyle = AMBER;
  g.font = 'bold 50px monospace';
  g.textBaseline = 'middle';
  g.fillText(line.no, 14, 34);
  g.font = `bold ${line.dest.length > 12 ? 34 : 40}px monospace`;
  g.fillText(line.dest, 120, 34);
  dots(g, 512, 64);
  return texture(c);
}

/** Fits `text` into `w` px at most `size` px high. */
function fit(g: CanvasRenderingContext2D, text: string, w: number, size: number, weight = 'bold') {
  let s = size;
  do g.font = `${weight} ${s}px system-ui, sans-serif`;
  while (g.measureText(text).width > w && --s > 10);
}

/**
 * The display over the aisle: "Nächster Halt" and the stop's name (just the name, standing at it), the
 * line and the time, and once someone's pressed the button, HALT in red. Redrawn only when that changes.
 */
export class StopDisplay {
  readonly texture: THREE.CanvasTexture;
  private readonly g: CanvasRenderingContext2D;
  private key = '';

  constructor(private readonly line: BusLine) {
    const [c, g] = canvas(512, 128);
    this.g = g;
    this.texture = texture(c);
  }

  show(stop: string, at: boolean, halt: boolean, clock: string) {
    const key = `${stop}|${at}|${halt}|${clock}`;
    if (key === this.key) return;
    this.key = key;
    const g = this.g;
    g.fillStyle = '#06121f';
    g.fillRect(0, 0, 512, 128);
    // The line in its color, top left; the clock, top right.
    g.fillStyle = this.line.color;
    g.fillRect(12, 10, 64, 34);
    g.fillStyle = '#fff';
    g.font = 'bold 26px system-ui, sans-serif';
    g.textBaseline = 'middle';
    g.textAlign = 'center';
    g.fillText(this.line.no, 44, 28);
    g.textAlign = 'left';
    g.fillStyle = '#9fb8d0';
    g.font = '22px system-ui, sans-serif';
    g.fillText(at ? `→ ${this.line.dest}` : 'Nächster Halt', 88, 28);
    g.textAlign = 'right';
    g.fillStyle = '#fff';
    g.fillText(clock, 500, 28);
    g.textAlign = 'left';
    if (halt && !at) {
      g.fillStyle = '#e63946';
      g.fillRect(400, 52, 100, 64);
      g.fillStyle = '#fff';
      g.font = 'bold 30px system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillText('HALT', 450, 85);
      g.textAlign = 'left';
    }
    g.fillStyle = AMBER;
    fit(g, stop, halt && !at ? 370 : 480, 52);
    g.fillText(stop, 16, 86);
    this.texture.needsUpdate = true;
  }
}

/** The line's stops along the wall, left to right as the bus comes to them, the next one lit. */
export class RouteStrip {
  readonly texture: THREE.CanvasTexture;
  private readonly g: CanvasRenderingContext2D;
  private next = -1;

  constructor(private readonly line: BusLine) {
    // As long and thin as the strip it's on (6.4 m by 26 cm).
    const [c, g] = canvas(2048, 84);
    this.g = g;
    this.texture = texture(c);
    this.show(0);
  }

  show(next: number) {
    if (next === this.next) return;
    this.next = next;
    const g = this.g;
    const { stops, color, no } = this.line;
    g.fillStyle = '#f4f2ec';
    g.fillRect(0, 0, 2048, 84);
    g.fillStyle = color;
    g.fillRect(10, 12, 70, 60);
    g.fillStyle = '#fff';
    g.font = 'bold 40px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(no, 45, 43);
    // The line itself, a dot for each stop and its name over it.
    const x0 = 150;
    const x1 = 1990;
    const y = 60;
    g.fillStyle = color;
    g.fillRect(x0, y - 4, x1 - x0, 8);
    stops.forEach((st, i) => {
      const x = x0 + ((x1 - x0) * i) / Math.max(1, stops.length - 1);
      const lit = i === next;
      g.beginPath();
      g.arc(x, y, lit ? 12 : 8, 0, Math.PI * 2);
      g.fillStyle = lit ? '#e63946' : '#fff';
      g.fill();
      g.lineWidth = 4;
      g.strokeStyle = lit ? '#e63946' : color;
      g.stroke();
      g.fillStyle = lit ? '#c1121f' : '#222';
      fit(g, st.name, (x1 - x0) / stops.length + 20, 30, lit ? 'bold' : '600');
      g.textAlign = i === 0 ? 'left' : i === stops.length - 1 ? 'right' : 'center';
      g.fillText(st.name, x + (i === 0 ? -10 : i === stops.length - 1 ? 10 : 0), 24);
    });
    this.texture.needsUpdate = true;
  }
}

/** An ad over the windows: a few words on a color, for the town's own places. */
export function adTexture(head: string, sub: string, bg: string, fg = '#fff'): THREE.CanvasTexture {
  const [c, g] = canvas(512, 128);
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 128);
  g.fillStyle = fg;
  g.textBaseline = 'middle';
  fit(g, head, 480, 52);
  g.fillText(head, 16, 50);
  g.globalAlpha = 0.85;
  fit(g, sub, 480, 26, '500');
  g.fillText(sub, 16, 100);
  return texture(c);
}

/** The town's own ads, for the buses to carry inside. */
export const BUS_ADS: readonly [string, string, string][] = [
  ['Schallwerk', 'Heute live · Club ab 23 Uhr', '#1d1d2b'],
  ['Casino', 'gegenüber vom Büro · Glück auf!', '#7a0f1f'],
  ['Bowlingcenter', 'Strike! Karaoke & Schwarzlicht-Minigolf', '#3a0ca3'],
  ['Flogge Office', 'Das Büro mit Achterbahn auf dem Dach', '#0b3d2e'],
  ['Baumarkt', 'Gabelstapler fahren? Bei uns schon.', '#e85d04'],
  ['Kino', 'Diese Woche: gemeinfreie Klassiker', '#14213d'],
  ['Tankstelle FLOGGE OIL', 'Waschanlage · Kaffee · Snacks', '#c1121f'],
];
