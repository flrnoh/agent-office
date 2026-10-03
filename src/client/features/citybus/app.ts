/**
 * flrnoh fork (see FORK.md "Traffic lights and the city bus" and "The phone"): the bus app on your
 * phone. The stops nearest you, how far, and when the next buses come there, counting down; tap one
 * and the minimap points you there.
 */
import { FURNITURE } from '../../../shared/streetside';
import type { Ctx } from '../../core/context';
import { store } from '../../state';
import { h } from '../../ui/dom';
import { headTo } from '../minimap/goal';
import { addPhoneApp } from '../phone/apps';

const STOPS = FURNITURE.filter((f) => f.stop);

export function busApp(ctx: Ctx) {
  addPhoneApp({
    id: 'bus',
    name: 'Bus',
    icon: '🚌',
    color: '#e63946',
    open(screen, phone) {
      const list = h('div.phone-list', {});
      screen.append(h('div.phone-pad', {}, h('h3', {}, 'Abfahrten in deiner Nähe'), list));
      const draw = () => {
        const me = ctx.player.pos;
        const t = store.officeNow() / 1000;
        const near = STOPS.map((f) => ({ f, d: Math.hypot(f.x - me.x, f.z - me.z) }))
          .sort((a, b) => a.d - b.d)
          .slice(0, 4);
        list.replaceChildren(
          ...near.map(({ f, d }) => {
            const deps = ctx.office.town.busStops.departures(f, t).slice(0, 3);
            const row = h(
              'button.phone-row',
              { type: 'button' },
              h('div.phone-row-head', {}, h('strong', {}, `🚏 ${f.stop!.name}`), h('span', {}, d < 1000 ? `${Math.round(d)} m` : `${(d / 1000).toFixed(1)} km`)),
              ...deps.map((x) => h('div.phone-dep', {}, h('span.phone-line', { style: `background:${x.line.color}` }, x.line.no), h('span', {}, x.line.dest), h('span.phone-when', {}, x.secs < 20 ? 'jetzt' : `${Math.ceil(x.secs / 60)} min`))),
            );
            row.addEventListener('click', () => {
              headTo({ id: `stop:${f.stop!.id}`, name: `🚏 ${f.stop!.name}`, icon: '🚏', x: f.x, z: f.z, kind: 'place' });
              phone.close();
            });
            return row;
          }),
        );
      };
      draw();
      const timer = window.setInterval(draw, 1000);
      return () => clearInterval(timer);
    },
  });
}
