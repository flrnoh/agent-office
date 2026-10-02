/**
 * flrnoh fork (see FORK.md, "Sounds of the city"): the city round the office, heard. Each frame it
 * tells the sound (sound/city.ts) where the street is from where you stand, where the city's cars
 * are (world/town/traffic.ts, read only), whether you're in a shop and whether it's warm enough for
 * crickets; and on the office's clock (shared/citysound.ts) it has the church's bell strike the hour
 * (world/church/) and, now and then, a siren go by far off. The "Stadtgeräusche" setting turns it
 * all off; in a castle there's no city to hear.
 */
import { CHURCH } from '../../../shared/church';
import { bellDue, sirenDue, summerish } from '../../../shared/citysound';
import { roofDrop } from '../../../shared/layout';
import { shopAt } from '../../../shared/shops';
import type { Ctx } from '../../core/context';
import type { CityScene } from '../../sound/city';
import { SIREN_LONG } from '../../sound/citybells';
import { store } from '../../state';

export interface CitySoundDeps {
  /** How many floors the roof stands on (see features/rooftop). */
  roofFloors(): number;
}

export function installCitySound(ctx: Ctx, deps: CitySoundDeps) {
  const cars: { x: number; z: number }[] = [];
  const scene: CityScene = { on: false, streetY: 0, sheltered: false, cars, summer: false };
  /** The office's clock last frame, to see an hour or a siren come round. */
  let prev = 0;

  ctx.ticks.add('env', () => {
    const up = ctx.upTop();
    scene.on = ctx.settings.citySounds && (up || ctx.inOffice());
    if (!scene.on) {
      ctx.sound.setCity(scene);
      prev = 0;
      return;
    }
    scene.streetY = up ? -roofDrop(deps.roofFloors()) : ctx.office.night.street;
    // The cars' boxes follow them (world/town/traffic.ts): their middles are where they are.
    const boxes = ctx.office.town.traffic;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      const c = (cars[i] ??= { x: 0, z: 0 });
      c.x = (b.minX + b.maxX) / 2;
      c.z = (b.minZ + b.maxZ) / 2;
    }
    cars.length = boxes.length;
    const eye = ctx.camera.position;
    scene.sheltered = !up && eye.y - scene.streetY < 5 && !!shopAt(eye.x, eye.z);
    const now = store.officeNow();
    scene.summer = summerish(store.sky?.temp, now);
    ctx.sound.setCity(scene);
    if (prev && CHURCH && store.sky) {
      const strikes = bellDue(prev, now, store.sky.utcOffset);
      if (strikes) ctx.sound.cityBell({ x: CHURCH.bell.x, y: scene.streetY + CHURCH.bell.y, z: CHURCH.bell.z }, strikes);
    }
    const s = prev ? sirenDue(prev, now) : null;
    if (s) {
      // It goes by across the line from the office out to it, at 50 km/h, passing that point halfway through.
      const cx = Math.cos(s.bearing) * s.dist;
      const cz = Math.sin(s.bearing) * s.dist;
      const vx = -Math.sin(s.bearing) * 14 * s.turn;
      const vz = Math.cos(s.bearing) * 14 * s.turn;
      ctx.sound.citySiren({ from: { x: cx - (vx * SIREN_LONG) / 2, y: scene.streetY + 2, z: cz - (vz * SIREN_LONG) / 2 }, vx, vz });
    }
    prev = now;
  });

  // For quick checks from the console: what the city's loops are at where you stand.
  (window as unknown as { __citySound?: () => unknown }).__citySound = () => ({ ...ctx.sound.cityLevels, scene: { ...scene, cars: cars.length } });
}
