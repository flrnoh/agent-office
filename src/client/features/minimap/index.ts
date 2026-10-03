/**
 * flrnoh fork (see FORK.md "The minimap"): with a whole town round the office, a way back to it. A
 * round map in the bottom-right corner turns with you (straight ahead is up), with the office, the
 * places and the shops round about, the people on your floor, and at its rim an arrow to the office
 * (and to wherever you picked on the big map) once they're out of its sight, with how far. J, or a
 * click on it, opens the big map: the whole town and the loop, north up; click a place to head there.
 */
import './ui.css';
import * as THREE from 'three';
import { inTown } from '../../../shared/city';
import { ROOF } from '../../../shared/rooftop';
import { PLACES, placeAt } from '../../../shared/scenic';
import { SHOP_KIND_BY_ID, shopAt } from '../../../shared/shops';
import type { Ctx } from '../../core/context';
import { store } from '../../state';
import { $, h } from '../../ui/dom';
import { atlas, PX } from './atlas';
import { openBigMap } from './bigmap';
import { drawBuses, drawStops } from './buses'; // the bus network
import { drawWaymos } from './waymos'; // the robotaxis
import { bindGoal } from './goal';
import { addPhoneApp } from '../phone/apps';
import { ALL_POIS, HOME, OFFICE_RECT, compassWord, distanceWord, placeSpot, type Poi } from './pois';

/** The minimap's size on screen (px, CSS), till it's laid out (ui.css has it smaller on a phone). */
const SIZE = 178;
/** How close counts as there: the picked place is crossed off, the way home stops pointing. */
const ARRIVED = 8;
/** Zoom: screen px to a meter, and how far the wheel goes either way. */
const ZOOM = { start: 1.6, min: 0.5, max: 4 };
const ZOOM_KEY = 'minimap-zoom';

export interface Where {
  x: number;
  z: number;
  /** Which way you face: 0 north (-z), clockwise. Null in a place of its own, where the map can't say. */
  heading: number | null;
  /** In words: the office, a shop, a bit of the loop, the town. */
  label: string;
}

export function installMinimap(ctx: Ctx) {
  const root = $('minimap');
  const canvas = h('canvas.minimap-canvas', { 'aria-label': 'Minimap: click for the big map (J)' }) as HTMLCanvasElement;
  const north = h('span.minimap-north', { 'aria-hidden': 'true' }, 'N');
  const where = h('div.minimap-where');
  const way = h('div.minimap-way');
  const info = h('div.minimap-info', {}, where, way);
  root.replaceChildren(h('div.minimap-dial', { title: 'Stadtplan (J) · Mausrad zoomt' }, canvas, north), info);
  const dial = root.querySelector('.minimap-dial') as HTMLElement;
  const g = canvas.getContext('2d')!;

  let zoom = ZOOM.start;
  try {
    const z = Number(localStorage.getItem(ZOOM_KEY));
    if (z >= ZOOM.min && z <= ZOOM.max) zoom = z;
  } catch {
    // storage blocked
  }
  /** Where you picked on the big map, until you get there. */
  let target: Poi | null = null;
  const look = new THREE.Vector3();

  /** Where you are on the map, which way you face, and what it's called there; null off the office's own map. */
  function whereAmI(): Where | null {
    if (!ctx.inOffice()) return null;
    const inside = placeSpot(store.floor);
    if (inside) {
      const p = ALL_POIS.find((q) => q.id === store.floor);
      return { ...inside, heading: null, label: p ? `${p.icon} ${p.name}` : '' };
    }
    const { x, z } = ctx.player.pos;
    ctx.camera.getWorldDirection(look);
    const heading = Math.atan2(look.x, -look.z);
    return { x, z, heading, label: labelAt(x, z) };
  }

  function labelAt(x: number, z: number): string {
    if (store.floor === ROOF || ctx.upTop()) return '🍸 Dachterrasse';
    if (x > OFFICE_RECT.minX - 3 && x < OFFICE_RECT.maxX + 3 && z > OFFICE_RECT.minZ - 10 && z < OFFICE_RECT.maxZ + 8) return `${HOME.icon} ${HOME.name}`;
    const shop = shopAt(x, z);
    if (shop) {
      const k = SHOP_KIND_BY_ID.get(shop.kind);
      if (k) return `${k.emoji} ${k.name}`;
    }
    const near = ALL_POIS.find((p) => p.kind === 'place' && Math.hypot(p.x - x, p.z - z) < 16);
    if (near) return `${near.icon} ${near.name}`;
    const place = placeAt(x, z);
    if (place && place !== 'town') return `${PLACES[place].icon} ${PLACES[place].name}`;
    return inTown(x, z) || place === 'town' ? '🏙️ Downtown' : '🌳 Draußen';
  }

  /** Picks where to head (the big map's click), or nothing. */
  function setTarget(p: Poi | null) {
    target = p;
  }

  function draw() {
    const me = whereAmI();
    root.classList.toggle('off-map', !me);
    if (!me || root.classList.contains('hud-off')) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const css = dial.clientWidth - 6 || SIZE;
    const size = Math.round(css * dpr);
    if (canvas.width !== size) {
      canvas.width = size;
      canvas.height = size;
    }
    const r = size / 2;
    const k = zoom * dpr;
    const turn = me.heading ?? 0;
    const map = atlas();
    g.save();
    g.clearRect(0, 0, size, size);
    g.beginPath();
    g.arc(r, r, r, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = '#bfdc9c';
    g.fillRect(0, 0, size, size);
    g.translate(r, r);
    g.rotate(-turn);
    g.scale(k / PX, k / PX);
    // Only the bit of the drawn map round you (a square the dial's diagonal wide).
    const reach = (r / k) * 1.5 * PX;
    const cx = map.px(me.x);
    const cz = map.pz(me.z);
    const sx = Math.max(0, cx - reach);
    const sz = Math.max(0, cz - reach);
    const sw = Math.min(map.canvas.width, cx + reach) - sx;
    const sh = Math.min(map.canvas.height, cz + reach) - sz;
    if (sw > 0 && sh > 0) g.drawImage(map.canvas, sx, sz, sw, sh, sx - cx, sz - cz, sw, sh);
    g.restore();

    /** Meters on the map to the dial's pixels. */
    const cos = Math.cos(-turn);
    const sin = Math.sin(-turn);
    const toDial = (x: number, z: number) => {
      const dx = (x - me.x) * k;
      const dz = (z - me.z) * k;
      return { x: r + dx * cos - dz * sin, y: r + dx * sin + dz * cos };
    };
    const inDial = (p: { x: number; y: number }, pad: number) => Math.hypot(p.x - r, p.y - r) < r - pad;

    // The places and the shops round about, upright.
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const p of ALL_POIS) {
      if (p === HOME) continue;
      const at = toDial(p.x, p.z);
      if (!inDial(at, 8 * dpr)) continue;
      const shop = p.kind === 'shop';
      if (shop && zoom < 1.2) continue;
      g.font = `${(shop ? 11 : 15) * dpr}px system-ui, sans-serif`;
      g.fillText(p.icon, at.x, at.y);
    }
    // The bus stops (zoomed in) and the buses round about (buses.ts).
    if (zoom >= 1.2) drawStops(g, toDial, 2.6 * dpr);
    drawBuses(g, toDial, ctx.office.town.buses.buses.filter((b) => inDial(toDial(b.pose.x, b.pose.z), 6 * dpr)), 11 * dpr);
    drawWaymos(g, toDial, 12 * dpr, (p) => inDial(p, 6 * dpr)); // the robotaxis (waymos.ts)
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    // The people on your floor.
    for (const peer of store.peers.values()) {
      if (peer.id === store.you || peer.lite || !store.onMyFloor(peer)) continue;
      const at = toDial(peer.x, peer.z);
      if (!inDial(at, 5 * dpr)) continue;
      g.fillStyle = peer.color;
      g.strokeStyle = '#2b2d42';
      g.lineWidth = 2 * dpr;
      g.beginPath();
      g.arc(at.x, at.y, 4.5 * dpr, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    // The office, and where you're headed: on the dial, or at its rim pointing the way.
    const marks: { p: Poi; color: string }[] = [{ p: HOME, color: '#ff8a5b' }];
    if (target && target !== HOME) marks.push({ p: target, color: '#ef476f' });
    for (const { p, color } of marks) {
      const at = toDial(p.x, p.z);
      g.font = `${17 * dpr}px system-ui, sans-serif`;
      if (inDial(at, 12 * dpr)) {
        badge(at.x, at.y, p === HOME ? p.icon : '📍', color, dpr);
        continue;
      }
      const a = Math.atan2(at.y - r, at.x - r);
      const rim = r - 13 * dpr;
      const x = r + Math.cos(a) * rim;
      const y = r + Math.sin(a) * rim;
      g.save();
      g.translate(x, y);
      g.rotate(a);
      g.fillStyle = color;
      g.strokeStyle = '#2b2d42';
      g.lineWidth = 2 * dpr;
      g.beginPath();
      g.moveTo(13 * dpr, 0);
      g.lineTo(2 * dpr, -8 * dpr);
      g.lineTo(2 * dpr, 8 * dpr);
      g.closePath();
      g.fill();
      g.stroke();
      g.restore();
      badge(x - Math.cos(a) * 3 * dpr, y - Math.sin(a) * 3 * dpr, p === HOME ? p.icon : '📍', color, dpr);
    }
    // You, in the middle, facing up (or a pin, inside a place of its own).
    g.save();
    g.translate(r, r);
    g.fillStyle = '#5bc0eb';
    g.strokeStyle = '#2b2d42';
    g.lineWidth = 2.5 * dpr;
    g.beginPath();
    if (me.heading == null) g.arc(0, 0, 6 * dpr, 0, Math.PI * 2);
    else {
      g.moveTo(0, -10 * dpr);
      g.lineTo(7 * dpr, 8 * dpr);
      g.lineTo(0, 4 * dpr);
      g.lineTo(-7 * dpr, 8 * dpr);
      g.closePath();
    }
    g.fill();
    g.stroke();
    g.restore();

    // N at the rim, where north is.
    const nAngle = -turn - Math.PI / 2;
    const nr = css / 2 - 2;
    north.style.transform = `translate(${(css / 2 + Math.cos(nAngle) * nr).toFixed(1)}px, ${(css / 2 + Math.sin(nAngle) * nr).toFixed(1)}px)`;

    // In words underneath: where you are, and the way to the office (or to where you're headed).
    setText(where, me.label);
    const goal = target ?? HOME;
    const d = Math.hypot(goal.x - me.x, goal.z - me.z);
    if (target && d < ARRIVED) {
      target = null;
      setText(way, `✅ Angekommen`);
    } else if (!target && (d < 40 || me.label.startsWith(HOME.icon))) setText(way, '');
    else {
      const bearing = Math.atan2(goal.x - me.x, -(goal.z - me.z));
      setText(way, `${goal === HOME ? HOME.icon : '📍'} ${goal.name} · ${distanceWord(d)} ${compassWord(bearing)}`);
    }
  }

  /** An emoji on a round colored badge. */
  function badge(x: number, y: number, icon: string, color: string, dpr: number) {
    g.fillStyle = color;
    g.strokeStyle = '#2b2d42';
    g.lineWidth = 2 * dpr;
    g.beginPath();
    g.arc(x, y, 11 * dpr, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle = '#2b2d42';
    g.font = `${13 * dpr}px system-ui, sans-serif`;
    g.fillText(icon, x, y + dpr);
  }

  function setText(el: HTMLElement, text: string) {
    if (el.textContent !== text) el.textContent = text;
    el.classList.toggle('hidden', !text);
  }

  function openMap() {
    openBigMap({
      me: () => whereAmI(),
      target: () => target,
      setTarget: (p) => setTarget(p),
      buses: () => ctx.office.town.buses.buses,
    });
  }

  canvas.addEventListener('click', () => openMap());
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      zoom = Math.max(ZOOM.min, Math.min(ZOOM.max, zoom * Math.exp(-e.deltaY * 0.0015)));
      try {
        localStorage.setItem(ZOOM_KEY, String(zoom));
      } catch {
        // storage blocked
      }
    },
    { passive: false },
  );
  ctx.keys.bind({ code: 'KeyJ', run: () => openMap() });
  // Other features send you places (goal.ts); the map's an app on the phone too.
  bindGoal(setTarget, () => target);
  addPhoneApp({ id: 'map', name: 'Karte', icon: '🗺️', color: '#34c759', open: (_, phone) => (phone.close(), openMap()) });
  // Once the frame's drawn, so the camera faces where you see.
  ctx.ticks.add('render', () => draw());

  return {
    /** The big map, from the ☰ menu. */
    openMap,
    /** Where you're headed (the big map's pick), if anywhere. */
    target: () => target,
  };
}
