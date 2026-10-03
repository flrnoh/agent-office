/**
 * flrnoh fork (see FORK.md "Waymo"): the Waymo app on your phone. Where to? (the town's places and
 * bus stops, a search over them); booked, the car on its way with how long and how far, the curb it
 * comes to (the minimap points you there), honk to find it, cancel; waiting, how long it waits;
 * riding, when you'll be there and pull over; there, a thank you.
 */
import { FURNITURE } from '../../../shared/streetside';
import { waymoAt, waymoEta, type WaymoCar } from '../../../shared/waymo/fleet';
import { placeAt } from '../../../shared/waymo/roads';
import type { Ctx } from '../../core/context';
import { store } from '../../state';
import { h } from '../../ui/dom';
import { headTo } from '../minimap/goal';
import { PLACES_ON_MAP } from '../minimap/pois';
import { addPhoneApp } from '../phone/apps';
import { fleet } from './state';

interface Where {
  name: string;
  icon: string;
  x: number;
  z: number;
}

/** Everywhere it takes you: the town's places, then its bus stops (each name once). */
const PLACES: readonly Where[] = [
  ...PLACES_ON_MAP.filter((p) => p.id !== 'coaster').map((p) => ({ name: p.name, icon: p.icon, x: p.x, z: p.z })),
  ...FURNITURE.filter((f, i, all) => f.stop && all.findIndex((g) => g.stop?.name === f.stop!.name) === i).map((f) => ({ name: f.stop!.name, icon: '🚏', x: f.x, z: f.z })),
];

const mins = (s: number) => (s < 60 ? `${Math.max(1, Math.round(s))} s` : `${Math.ceil(s / 60)} min`);

export function waymoApp(ctx: Ctx) {
  const now = () => store.officeNow() / 1000;
  const mine = (): WaymoCar | undefined => fleet.find((c) => c.booker === store.you || c.riders.includes(store.you));

  addPhoneApp({
    id: 'waymo',
    name: 'Waymo',
    icon: 'W',
    color: '#00a99d',
    badge: () => {
      const c = mine();
      return c && (c.mode === 'coming' || c.mode === 'waiting') ? '1' : null;
    },
    open(screen) {
      const root = h('div.waymo-app', {});
      screen.append(root);
      let shown = '';
      let query = '';
      const search = h('input.waymo-search', { type: 'search', placeholder: 'Wohin?', autocomplete: 'off' }) as HTMLInputElement;
      const results = h('div.phone-list', {});
      search.addEventListener('input', () => {
        query = search.value.trim().toLowerCase();
        list();
      });
      // Typing in it isn't walking about.
      search.addEventListener('keydown', (e) => e.stopPropagation());

      const book = (w: Where) => {
        const me = ctx.player.pos;
        ctx.net.send({ t: 'waymo.book', x: me.x, z: me.z, dest: { name: w.name, x: w.x, z: w.z } });
      };

      function list() {
        results.replaceChildren(
          ...PLACES.filter((p) => !query || p.name.toLowerCase().includes(query)).map((p) => {
            const row = h('button.phone-row.waymo-place', { type: 'button' }, h('span.waymo-icon', {}, p.icon), h('span', {}, p.name));
            row.addEventListener('click', () => book(p));
            return row;
          }),
        );
      }

      function draw() {
        const c = mine();
        const t = now();
        const k = c ? `${c.id}|${c.mode}` : 'none';
        // The booking form stays as it is while you type in it.
        if (k === shown && !c) return;
        shown = k;
        if (!c) {
          root.replaceChildren(h('div.waymo-head', {}, h('strong', {}, 'waymo'), h('span', {}, 'Wohin soll es gehen?')), h('div.phone-pad', {}, search, results));
          list();
          return;
        }
        const p = waymoAt(c, t);
        const me = ctx.player.pos;
        const curb = placeAt(c.drive.to, 2);
        const far = Math.round(Math.hypot(curb.x - me.x, curb.z - me.z));
        const eta = waymoEta(c) - t;
        const lines: (HTMLElement | string)[] = [];
        const buttons: HTMLElement[] = [];
        const btn = (label: string, fn: () => void, kind = '') => {
          const b = h(`button.waymo-btn${kind}`, { type: 'button' }, label);
          b.addEventListener('click', fn);
          buttons.push(b);
        };
        if (c.mode === 'coming') {
          lines.push(h('div.waymo-big', {}, `Kommt in ${mins(eta)}`), h('div', {}, `${Math.round(Math.hypot(p.x - curb.x, p.z - curb.z))} m entfernt · ${c.initials} leuchtet auf dem Dach`), h('div.waymo-sub', {}, `Abholpunkt: ${far} m von dir`));
          btn('📍 Abholpunkt zeigen', () => headTo({ id: 'waymo-pickup', name: 'Dein Waymo', icon: '🚕', x: curb.x, z: curb.z, kind: 'place' }));
          btn('🔊 Hupen', () => ctx.net.send({ t: 'waymo.honk' }));
          btn('Stornieren', () => ctx.net.send({ t: 'waymo.cancel' }), '.waymo-quiet');
        } else if (c.mode === 'waiting') {
          lines.push(h('div.waymo-big', {}, 'Dein Waymo wartet'), h('div', {}, `Am Abholpunkt, ${far} m von dir · ${c.initials} auf dem Dach`), h('div.waymo-sub', {}, `Wartet noch ${mins((c.until ?? t) - t)} · E am Auto zum Einsteigen`));
          btn('📍 Abholpunkt zeigen', () => headTo({ id: 'waymo-pickup', name: 'Dein Waymo', icon: '🚕', x: curb.x, z: curb.z, kind: 'place' }));
          btn('🔊 Hupen', () => ctx.net.send({ t: 'waymo.honk' }));
          btn('Stornieren', () => ctx.net.send({ t: 'waymo.cancel' }), '.waymo-quiet');
        } else if (c.mode === 'riding') {
          const at = new Date(waymoEta(c) * 1000).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
          lines.push(h('div.waymo-big', {}, c.dest?.name ?? ''), h('div', {}, `Ankunft ${at} · noch ${mins(eta)}`), h('div.waymo-sub', {}, `${Math.round(p.speed * 3.6)} km/h`));
          btn('Rechts ran', () => ctx.net.send({ t: 'waymo.pullover' }), '.waymo-quiet');
        } else if (c.mode === 'arrived') {
          lines.push(h('div.waymo-big', {}, 'Du bist da'), h('div', {}, c.dest?.name ?? ''), h('div.waymo-sub', {}, 'Danke fürs Mitfahren!'));
        }
        root.replaceChildren(h('div.waymo-head', {}, h('strong', {}, 'waymo'), h('span', {}, c.booker === store.you ? 'Deine Fahrt' : 'Mitfahrt')), h('div.phone-pad.waymo-card', {}, ...lines, h('div.waymo-buttons', {}, ...buttons)));
      }
      draw();
      // While it's coming, the numbers count down.
      const timer = window.setInterval(() => {
        if (mine()) shown = '';
        draw();
      }, 1000);
      return () => clearInterval(timer);
    },
  });
}
