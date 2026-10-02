/**
 * flrnoh fork (see FORK.md "Traffic lights and the city bus"): the garage's cars don't have to stop at
 * a red light (nothing stops them), but drive over a stop line on red at more than 30 km/h and a speed
 * camera flashes: a white flash over the screen and a "geblitzt!" toast with how fast you were. Only
 * your page sees it; nobody's fined.
 */
import { CITY_ROAD } from '../../../shared/city';
import { LIT, STOP_AT, lampAt } from '../../../shared/traffic-lights';
import type { Ctx } from '../../core/context';
import { store } from '../../state';
import { toast } from '../../ui/dom';

/** Faster than this over a red line (m/s) and it flashes. */
const LIMIT = 30 / 3.6;
const H = CITY_ROAD / 2;

export function speedCamera(ctx: Ctx) {
  let last: { car: number; x: number; z: number } | null = null;
  let flashedAt = -Infinity;

  function flash(kmh: number) {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;inset:0;background:#fff;opacity:0.9;pointer-events:none;z-index:50;transition:opacity 0.45s ease-out';
    document.body.appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => (el.style.opacity = '0')));
    setTimeout(() => el.remove(), 600);
    toast(`📸 Geblitzt! ${kmh} km/h über Rot`, 'warn');
  }

  ctx.ticks.add('env', ({ t }) => {
    const i = store.cars.findIndex((c) => c?.driver === store.you);
    const pose = i >= 0 ? ctx.office.cars.cars[i]?.pose : undefined;
    if (!pose || !ctx.inOffice()) {
      last = null;
      return;
    }
    const was = last && last.car === i ? last : null;
    last = { car: i, x: pose.x, z: pose.z };
    if (!was || Math.abs(pose.speed) < LIMIT || t - flashedAt < 5) return;
    const now = store.officeNow() / 1000;
    for (const l of LIT) {
      const c = l.c;
      if (Math.abs(pose.x - c.x) > 20 || Math.abs(pose.z - c.z) > 20) continue;
      // Over a stop line, coming in: along x past x = c.x ± STOP_AT on its lane's half, or along z.
      for (const axis of ['x', 'z'] as const) {
        const [a0, a1, side] = axis === 'x' ? [was.x - c.x, pose.x - c.x, pose.z - c.z] : [was.z - c.z, pose.z - c.z, pose.x - c.x];
        if (Math.abs(side) > H) continue;
        const inward = Math.abs(a0) > STOP_AT && Math.abs(a1) <= STOP_AT && Math.sign(a0) === Math.sign(a1 || a0);
        if (!inward) continue;
        const lamp = lampAt(l, axis, now);
        if (lamp !== 'red' && lamp !== 'redamber') continue;
        flashedAt = t;
        flash(Math.round(Math.abs(pose.speed) * 3.6));
        return;
      }
    }
  });
}
