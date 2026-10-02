/**
 * flrnoh fork (see FORK.md): the city's passers-by (world/town/people.ts), kept on the office's clock.
 * Each frame they're told the time everyone shares (store.officeNow), where you're looking from, the
 * rain, and how light it was at any moment (the sun from the office's place, as the sky has it), so
 * every page has the same people out at the same places; and their footsteps and talk come out of
 * your speakers.
 */
import { sunPosition, skyTime } from '../../../shared/sun';
import { skyHour } from '../../../shared/shopfronts'; // fork: shop hours
import type { Ctx } from '../../core/context';
import { store } from '../../state';

const DEG = Math.PI / 180;
/** Daylight from the sun's height, as the sky has it (world/sky.ts): night below -8°, day above 4°. */
function daylight(el: number): number {
  const k = Math.min(1, Math.max(0, (el / DEG + 8) / 12));
  return k * k * (3 - 2 * k);
}

/** Wires the passers-by to the clock and the sound; call the result each frame before the town's update. */
export function drivePassersby(ctx: Ctx): () => void {
  const people = ctx.office.town.people;
  const at = { x: 0, y: 0, z: 0 };
  const sound = (kind: 'step' | 'chat') => (x: number, z: number) => {
    at.x = x;
    at.y = ctx.office.night.street + (kind === 'chat' ? 1.5 : 0.1);
    at.z = z;
    ctx.sound.passerby(kind, at);
  };
  people.onStep = sound('step');
  people.onChat = sound('chat');
  const clock = {
    now: 0,
    eyeX: 0,
    eyeZ: 0,
    rain: 0,
    dayAt(ms: number) {
      const sky = store.sky;
      // Before the server has said where the office is: by day.
      if (!sky) return 1;
      const { el } = sunPosition(skyTime(ms, sky.utcOffset), sky.lat, sky.lon);
      return daylight(el);
    },
    hourAt(ms: number) {
      // Before the server has said: midday, every shop open.
      return store.sky ? skyHour(ms, store.sky.utcOffset) : 12;
    },
  };
  return () => {
    clock.now = store.officeNow() / 1000;
    clock.eyeX = ctx.camera.position.x;
    clock.eyeZ = ctx.camera.position.z;
    clock.rain = ctx.sky.rain;
    people.clock = clock;
  };
}
