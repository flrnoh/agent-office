/**
 * flrnoh fork (see FORK.md "Traffic lights and the city bus"): riding the city bus. The buses
 * (world/town/bus.ts) go where the office's clock has them (shared/citybus.ts), so riding one needs
 * nothing of its own on the wire: E at an open door gets you on, and your page keeps you standing in
 * its aisle as it drives, sending where you are as walking always does, so everyone sees you in it.
 * E again and you get off at the next stop (straight away if it's standing at one). Its engine and its
 * doors' hiss come out of your speakers from where it is.
 */
import { BUS_W, DOORS, busAt, type BusLine } from '../../../shared/citybus';
import type { Ctx } from '../../core/context';
import { aside, hintTitle, key, onE } from '../../core/hint';
import { DESK_KEYS } from '../../interaction';
import { store } from '../../state';
import { h, toast } from '../../ui/dom';
import type { CityBus } from '../../world/town/bus';
import type { Interactable } from '../../world/types';
import { speedCamera } from './blitzer';

declare module '../../world/types' {
  interface InteractKinds {
    citybus: true;
  }
}

export interface CityBusDeps {
  /** Up off whatever you're sitting on, and any walk over to someone stopped. */
  free(): void;
}

/** Where you stand in it: in the aisle by the middle doors, holding on (its frame: nose +x). */
const AISLE: [number, number] = [-1.6, -0.15];
const FLOOR_Y = 0.36;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Where (lx, lz) in a bus's own frame is in the world. */
const world = (b: CityBus, lx: number, lz: number): [number, number] => {
  const c = Math.cos(b.pose.yaw);
  const s = Math.sin(b.pose.yaw);
  return [b.pose.x + lx * c + lz * s, b.pose.z - lx * s + lz * c];
};

export function installCityBus(ctx: Ctx, deps: CityBusDeps) {
  const buses = ctx.office.town.buses.buses;
  speedCamera(ctx); // a red light run in a garage car at speed: flash
  const onStreet = () => ctx.inOffice() && !ctx.upTop() && !ctx.trip() && Math.abs(ctx.player.pos.y - ctx.player.street) < 1.5;
  /** The bus you're on, the stop it was at when you got on, and whether you've asked to get off. */
  let riding: { bus: CityBus; from: number; off: boolean; left: boolean } | null = null;
  let yaw = 0;
  let camWas: { dist: number } | null = null;
  const doors: Interactable[][] = buses.map(() => DOORS.map(() => ({ kind: 'citybus', x: 0, z: 0, radius: 1.3 }) as Interactable));
  const lastDoors = buses.map(() => 0);

  ctx.usables.add({
    usable: () => {
      if (riding || !onStreet()) return [];
      const out: Interactable[] = [];
      buses.forEach((b, i) => {
        if (b.pose.doors < 0.6) return;
        DOORS.forEach((u, k) => {
          const [x, z] = world(b, u, BUS_W / 2 + 0.2);
          Object.assign(doors[i][k], { x, z });
          out.push(doors[i][k]);
        });
      });
      return out;
    },
  });

  const busOf = (it: Interactable) => buses[doors.findIndex((d) => d.includes(it))];

  function getOn(b: CityBus) {
    if (riding || ctx.trip() || b.pose.doors < 0.6) return;
    deps.free();
    ctx.activities.stopAll('start');
    const p = ctx.player;
    p.stopWalking();
    p.moving = false;
    p.vy = 0;
    riding = { bus: b, from: b.pose.stop, off: false, left: false };
    yaw = b.pose.yaw;
    if (p.view === 'first') {
      p.camYaw = yaw + Math.PI / 2 + Math.PI;
      p.lookPitch = -0.05;
    } else {
      camWas = { dist: p.camDist };
      p.camDist = 2.6;
    }
    p.rig = (dt) => ride(dt);
    p.riding = true;
    ride(0);
    toast(`🚌 Linie ${b.line.no} → ${b.line.dest}. E to get off at the next stop`);
    ctx.hint.invalidate();
  }

  /** Off through the nearest door, onto the sidewalk side. */
  function getOff() {
    if (!riding) return;
    const b = riding.bus;
    const p = ctx.player;
    p.rig = null;
    p.riding = false;
    if (camWas) {
      p.camDist = camWas.dist;
      camWas = null;
    }
    const [x, z] = world(b, DOORS[1], BUS_W / 2 + 0.9);
    p.pos.set(x, p.street, z);
    p.vy = 0;
    p.grounded = true;
    p.facing = b.pose.yaw;
    riding = null;
    ctx.hint.invalidate();
  }

  function ride(dt: number) {
    if (!riding) return;
    const b = riding.bus;
    const p = ctx.player;
    // Where it is this very frame (the town moves it later in the frame), so you don't trail behind.
    busAt(b.line, store.officeNow() / 1000, b.pose);
    const [x, z] = world(b, AISLE[0], AISLE[1]);
    p.pos.set(x, p.street + FLOOR_Y, z);
    // Facing its front, swaying round the corners with it.
    p.facing = b.pose.yaw + Math.PI / 2;
    p.moving = false;
    // In third person the camera stays in there with you (however you switched to it).
    if (p.view !== 'first' && p.camDist > 2.6) {
      camWas ??= { dist: p.camDist };
      p.camDist = 2.6;
    }
    const turned = wrap(b.pose.yaw - yaw);
    yaw = b.pose.yaw;
    p.camYaw += turned;
    if (dt > 0 && b.pose.stop < 0) riding.left = true;
    // At the next stop with the doors open: off, if you asked.
    if (riding.off && b.pose.doors > 0.7 && (riding.left || b.pose.stop !== riding.from)) getOff();
  }

  function askOff() {
    if (!riding) return;
    if (riding.bus.pose.doors > 0.7) return getOff();
    riding.off = !riding.off;
    toast(riding.off ? '🔔 Halt! Getting off at the next stop' : '🚌 Staying on', riding.off ? 'info' : 'warn');
    ctx.hint.invalidate();
  }

  ctx.interactions.define('citybus', {
    reach: 3,
    hint: (it) => {
      const b = busOf(it);
      return { k: `bus|${b.line.no}`, parts: [hintTitle(`🚌 Linie ${b.line.no}`), aside(`→ ${b.line.dest}`), key('E', 'Get on')] };
    },
    use: onE((it) => getOn(busOf(it))),
  });

  ctx.activities.add({
    id: 'citybus',
    active: () => !!riding,
    stop: (why) => {
      if (why === 'walk' || why === 'errand') return;
      getOff();
    },
    key: (e) => {
      // Walking off a moving bus isn't on: the walking keys do nothing while you ride.
      if (!['KeyE', 'KeyQ', 'KeyF', 'Space'].includes(e.code) && !(e.code in DESK_KEYS)) return false;
      if (e.repeat) return true;
      if (e.code === 'KeyE') askOff();
      return true;
    },
    hint: (el) => {
      if (!riding) return;
      const b = riding.bus;
      const at = b.pose.doors > 0.7 ? 'at a stop, doors open' : b.pose.speed < 0.2 ? 'waiting' : `${Math.round(b.pose.speed * 3.6)} km/h`;
      const k = `busride|${b.line.no}|${at}|${riding.off}`;
      ctx.hint.draw(el, k, () => [h('span.title', {}, `🚌 Linie ${b.line.no} → ${b.line.dest}`), aside(at), key('E', b.pose.doors > 0.7 ? 'Get off' : riding!.off ? 'Stay on' : 'Stop at the next stop')]);
    },
  });

  ctx.messages.onAny((msg) => {
    if ((msg.t === 'welcome' || msg.t === 'floor.enter') && riding) getOff();
  });

  // The engines in earshot, and the doors' hiss as they open and shut.
  ctx.ticks.add('env', () => {
    const down = onStreet() || !!riding;
    const list: { id: number; at: { x: number; y: number; z: number }; speed: number; inside: boolean }[] = [];
    const me = ctx.player.pos;
    buses.forEach((b, i) => {
      const p = b.pose;
      const at = { x: p.x, y: ctx.player.street + 1, z: p.z };
      const near = down && Math.hypot(p.x - me.x, p.z - me.z) < 90;
      if (near) list.push({ id: i, at, speed: p.speed, inside: riding?.bus === b });
      const open = p.doors > 0.05;
      if (near && open !== lastDoors[i] > 0.05) ctx.sound.busDoors({ ...at, y: ctx.player.street + 2 }, open);
      lastDoors[i] = p.doors;
    });
    ctx.sound.setBuses(list);
  });

  return {
    /** The line you're riding, if any. */
    riding: (): BusLine | null => riding?.bus.line ?? null,
    /** Gets you on bus `i` (of BUS_LINES), if it stands with its doors open. */
    board: (i: number) => buses[i] && getOn(buses[i]),
    getOff,
  };
}
