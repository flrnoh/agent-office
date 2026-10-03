// flrnoh fork (see FORK.md "The minimap"): the big map, J or a click on the minimap. The whole town
// and the loop round it, north up: drag to look about, the wheel (or + and −) zooms. Click a place or
// a shop to head there (the minimap points the way, with how far), or "Zum Büro" for the way back.

import { store } from '../../state';
import type { BusLine, BusPose } from '../../../shared/citybus';
import { h, openModal } from '../../ui/dom';
import { atlas, BOUNDS, COLORS, PX } from './atlas';
import { drawBuses, drawRoutes, drawStops } from './buses'; // the bus network
import { drawWaymos } from './waymos'; // the robotaxis
import type { Where } from './index';
import { ALL_POIS, HOME, distanceWord, type Poi } from './pois';

export interface BigMapOptions {
  me(): Where | null;
  target(): Poi | null;
  setTarget(p: Poi | null): void;
  /** The city's buses where they are now (buses.ts). */
  buses(): readonly { line: BusLine; pose: BusPose }[];
}

/** Screen px to a meter: the least shows the whole map, shops get their names past SHOP_NAMES. */
const ZOOM = { min: 0.35, max: 6 };
const SHOP_NAMES = 2.4;
const SHOP_ICONS = 1.1;
/** How near a click (px) has to land to a place to pick it. */
const PICK = 16;

export function openBigMap(opts: BigMapOptions) {
  const canvas = h('canvas.bigmap-canvas') as HTMLCanvasElement;
  const close = h('button.btn.close', { type: 'button', 'aria-label': 'Close' }, '✕');
  const home = h('button.btn', { type: 'button', title: 'Die Minimap zeigt dir den Weg zurück' }, `${HOME.icon} Zum Büro`);
  const clear = h('button.btn', { type: 'button' }, 'Ziel löschen');
  const here = h('button.btn', { type: 'button', title: 'Wieder zu dir' }, '🎯 Ich');
  const status = h('span.grow');
  const tip = h('div.bigmap-tip.hidden');
  const el = h(
    'div.modal.bigmap',
    { role: 'dialog', 'aria-label': 'Stadtplan' },
    h('header', {}, h('h2', {}, '🗺️ Stadtplan'), close),
    h('div.bigmap-stage', {}, canvas, tip),
    h('footer', {}, status, here, clear, home),
  );
  const modal = openModal(el, { doing: '🗺️ looking at the map' });
  close.addEventListener('click', () => modal.close());
  const g = canvas.getContext('2d')!;
  const map = atlas();

  const me = opts.me();
  /** The middle of the view (m) and the zoom (screen px to a meter). */
  let cx = me?.x ?? HOME.x;
  let cz = me?.z ?? HOME.z;
  let zoom = 1.4;
  let hover: Poi | null = null;

  const view = () => {
    const rect = canvas.getBoundingClientRect();
    return { w: rect.width, hgt: rect.height, rect };
  };
  const toScreen = (x: number, z: number, w: number, hgt: number) => ({ x: w / 2 + (x - cx) * zoom, y: hgt / 2 + (z - cz) * zoom });
  const toWorld = (sx: number, sy: number, w: number, hgt: number) => ({ x: cx + (sx - w / 2) / zoom, z: cz + (sy - hgt / 2) / zoom });
  const clampView = () => {
    cx = Math.max(BOUNDS.minX, Math.min(BOUNDS.maxX, cx));
    cz = Math.max(BOUNDS.minZ, Math.min(BOUNDS.maxZ, cz));
  };

  /** What's shown at this zoom: the places always, the shops close enough in. */
  const shown = (p: Poi) => p.kind !== 'shop' || zoom >= SHOP_ICONS;

  function draw() {
    if (!el.isConnected) return;
    const { w, hgt } = view();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(hgt * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(hgt * dpr);
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Past the map's edge: the sea to the west, the country everywhere else.
    const o = toScreen(BOUNDS.minX, BOUNDS.minZ, w, hgt);
    g.fillStyle = COLORS.grass;
    g.fillRect(0, 0, w, hgt);
    g.fillStyle = COLORS.water;
    g.fillRect(0, 0, Math.max(0, o.x + 1), hgt);
    g.imageSmoothingEnabled = zoom < PX * 1.5;
    g.drawImage(map.canvas, o.x, o.y, map.canvas.width * (zoom / PX), map.canvas.height * (zoom / PX));

    // The bus lines and their stops, under the places (buses.ts).
    const pt = (x: number, z: number) => toScreen(x, z, w, hgt);
    drawRoutes(g, pt, Math.max(2, Math.min(5, zoom * 1.6)));
    drawStops(g, pt, zoom >= 1.6 ? 4.5 : 3, zoom >= SHOP_NAMES);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    taken.length = 0;
    const target = opts.target();
    // Shops first, the places over them.
    const names: { p: Poi; x: number; y: number; big: boolean }[] = [];
    const order = [...ALL_POIS].sort((a, b) => Number(a.kind !== 'shop') - Number(b.kind !== 'shop'));
    for (const p of order) {
      if (!shown(p)) continue;
      const at = toScreen(p.x, p.z, w, hgt);
      if (at.x < -40 || at.y < -40 || at.x > w + 40 || at.y > hgt + 40) continue;
      const shop = p.kind === 'shop';
      const big = p === HOME || p === target || p === hover;
      if (!shop || big) {
        g.fillStyle = p === HOME ? '#ff8a5b' : p === target ? '#ef476f' : '#fffaf3';
        g.strokeStyle = '#2b2d42';
        g.lineWidth = 2;
        g.beginPath();
        g.arc(at.x, at.y, big ? 15 : 12, 0, Math.PI * 2);
        g.fill();
        g.stroke();
      }
      g.font = `${shop && !big ? 13 : 16}px system-ui, sans-serif`;
      g.fillStyle = '#2b2d42';
      g.fillText(p === target && p !== HOME ? '📍' : p.icon, at.x, at.y + 1);
      if (!shop || zoom >= SHOP_NAMES || big) names.push({ p, x: at.x, y: at.y + (big ? 26 : 22), big });
    }
    // The names after, the office's and the picked place's first, then the places', then the shops'.
    const rank = (n: { p: Poi; big: boolean }) => (n.p === HOME ? 0 : n.big ? 1 : n.p.kind === 'shop' ? 3 : 2);
    names.sort((a, b) => rank(a) - rank(b));
    for (const n of names) label(n.p.name, n.x, n.y, n.p === HOME, n.big);
    drawBuses(g, pt, opts.buses(), 16);
    drawWaymos(g, pt, 18); // the robotaxis (waymos.ts)
    // The people on your floor.
    for (const peer of store.peers.values()) {
      if (peer.id === store.you || peer.lite || !store.onMyFloor(peer)) continue;
      const at = toScreen(peer.x, peer.z, w, hgt);
      g.fillStyle = peer.color;
      g.strokeStyle = '#2b2d42';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(at.x, at.y, 6, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      label(peer.name, at.x, at.y - 15, false);
    }
    // You.
    const now = opts.me();
    if (now) {
      const at = toScreen(now.x, now.z, w, hgt);
      g.save();
      g.translate(at.x, at.y);
      g.fillStyle = '#5bc0eb';
      g.strokeStyle = '#2b2d42';
      g.lineWidth = 2.5;
      g.beginPath();
      if (now.heading == null) g.arc(0, 0, 8, 0, Math.PI * 2);
      else {
        g.rotate(now.heading);
        g.moveTo(0, -13);
        g.lineTo(9, 10);
        g.lineTo(0, 5);
        g.lineTo(-9, 10);
        g.closePath();
      }
      g.fill();
      g.stroke();
      g.restore();
    }
    const t = opts.target();
    status.textContent = t && now ? `📍 ${t.name} · ${distanceWord(Math.hypot(t.x - now.x, t.z - now.z))}` : 'Klick auf einen Ort: die Minimap zeigt dir den Weg';
    clear.classList.toggle('hidden', !t);
    requestAnimationFrame(draw);
  }

  /** The name tags drawn so far this frame, so the next one doesn't land on top of one. */
  const taken: { x0: number; x1: number; y0: number; y1: number }[] = [];

  /** A name on a little paper tag, unless another's there already (`always`: it goes on anyway). */
  function label(text: string, x: number, y: number, strong: boolean, always = true) {
    g.font = `${strong ? 900 : 800} 12px Nunito, system-ui, sans-serif`;
    const tw = g.measureText(text).width + 10;
    const box = { x0: x - tw / 2, x1: x + tw / 2, y0: y - 9, y1: y + 9 };
    if (!always && taken.some((t) => t.x0 < box.x1 && t.x1 > box.x0 && t.y0 < box.y1 && t.y1 > box.y0)) return;
    taken.push(box);
    g.fillStyle = strong ? '#2b2d42' : 'rgba(255,250,243,.92)';
    g.beginPath();
    g.roundRect(x - tw / 2, y - 9, tw, 18, 7);
    g.fill();
    g.fillStyle = strong ? '#fffaf3' : '#2b2d42';
    g.fillText(text, x, y + 1);
  }

  /** The place under (sx, sy) on the canvas, if any is near enough. */
  function poiAt(sx: number, sy: number): Poi | null {
    const { w, hgt } = view();
    let best: Poi | null = null;
    let bestD = PICK;
    for (const p of ALL_POIS) {
      if (!shown(p)) continue;
      const at = toScreen(p.x, p.z, w, hgt);
      const d = Math.hypot(at.x - sx, at.y - sy) - (p.kind === 'shop' ? 0 : 4);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  function pick(p: Poi) {
    opts.setTarget(p);
    modal.close();
  }

  // Dragging looks about; a click without a drag picks what's under it.
  let drag: { x: number; y: number; moved: boolean; id: number } | null = null;
  canvas.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, moved: false, id: e.pointerId };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    const { rect } = view();
    if (drag && drag.id === e.pointerId) {
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (drag.moved || Math.hypot(dx, dy) > 4) {
        drag.moved = true;
        cx -= dx / zoom;
        cz -= dy / zoom;
        clampView();
        drag.x = e.clientX;
        drag.y = e.clientY;
      }
    }
    hover = drag?.moved ? null : poiAt(e.clientX - rect.left, e.clientY - rect.top);
    canvas.style.cursor = drag?.moved ? 'grabbing' : hover ? 'pointer' : 'grab';
    tip.classList.toggle('hidden', !hover);
    if (hover) {
      tip.textContent = `${hover.icon} ${hover.name} · klicken: hinlaufen`;
      tip.style.transform = `translate(${Math.round(e.clientX - rect.left + 14)}px, ${Math.round(e.clientY - rect.top + 14)}px)`;
    }
  });
  canvas.addEventListener('pointerup', (e) => {
    const { rect } = view();
    const was = drag;
    drag = null;
    if (was && !was.moved) {
      const p = poiAt(e.clientX - rect.left, e.clientY - rect.top);
      if (p) pick(p);
    }
  });
  const zoomBy = (f: number, sx?: number, sy?: number) => {
    const { w, hgt } = view();
    const ax = sx ?? w / 2;
    const ay = sy ?? hgt / 2;
    const before = toWorld(ax, ay, w, hgt);
    zoom = Math.max(ZOOM.min, Math.min(ZOOM.max, zoom * f));
    const after = toWorld(ax, ay, w, hgt);
    cx += before.x - after.x;
    cz += before.z - after.z;
    clampView();
  };
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const { rect } = view();
      zoomBy(Math.exp(-e.deltaY * 0.0015), e.clientX - rect.left, e.clientY - rect.top);
    },
    { passive: false },
  );
  el.addEventListener('keydown', (e) => {
    if (e.key === '+' || e.key === '=') zoomBy(1.25);
    else if (e.key === '-') zoomBy(0.8);
    else return;
    e.preventDefault();
    e.stopPropagation();
  });
  home.addEventListener('click', () => pick(HOME));
  clear.addEventListener('click', () => opts.setTarget(null));
  here.addEventListener('click', () => {
    const now = opts.me();
    if (now) {
      cx = now.x;
      cz = now.z;
    }
  });
  el.tabIndex = -1;
  setTimeout(() => el.focus(), 30);
  requestAnimationFrame(draw);
}
