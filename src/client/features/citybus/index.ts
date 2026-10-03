/**
 * flrnoh fork (see FORK.md "Traffic lights and the city bus"): riding the city bus. The buses
 * (world/town/bus.ts) go where the office's clock has them (shared/citybus.ts), on the lines of the
 * bus network (shared/busnet.ts). E at an open door gets you on, and then you're in there as it
 * drives: walk about (W A S D, carefully), sit down in a free seat (E), press the stop button (H: the
 * displays say HALT), stamp a ticket in the validator (E), and get off by walking out of an open door
 * (or E there). Your page keeps you in the bus's frame (cabin.ts) and tells the office where in it
 * you are (`bus.ride`), so everyone sees you in it, standing, walking or sitting (riders.ts). The
 * displays show the next stop, a gong and a voice call it (announce.ts), the stops' boards count down
 * to the next buses (world/town/busstops.ts). Its engine and its doors come out of your speakers from
 * where it is.
 */
import { BUS_RIDE_SEND_MS, type BusRide } from '../../../shared/busride';
import { BUS_L, BUS_W, DOORS, nextStop, poseOf, type BusLine } from '../../../shared/citybus';
import { FLOOR_Y, SEATS, SEAT_HIPS, inDoor } from '../../../shared/buscabin';
import { FURNITURE } from '../../../shared/streetside';
import type { Ctx } from '../../core/context';
import { aside, hintTitle, key, onE } from '../../core/hint';
import { DESK_KEYS } from '../../interaction';
import { store } from '../../state';
import { h, toast } from '../../ui/dom';
import { HIPS } from '../../world/character/rig';
import type { CityBus } from '../../world/town/bus';
import type { Interactable } from '../../world/types';
import { Announcer } from './announce';
import { speedCamera } from './blitzer';
import { doorNear, seatNear, standUp, validatorNear, walkInBus, type Ride } from './cabin';
import { busWorld, followRiders, takenSeats } from './riders';
import { busApp } from './app';

declare module '../../world/types' {
  interface InteractKinds {
    citybus: true;
  }
}

export interface CityBusDeps {
  /** Up off whatever you're sitting on, and any walk over to someone stopped. */
  free(): void;
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
/** How near (m) a bus or a stop's board has to be for its displays and its driver to be kept up. */
const NEAR = 70;
const clock = (ms: number) => new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

export function installCityBus(ctx: Ctx, deps: CityBusDeps) {
  const town = ctx.office.town;
  const buses = town.buses.buses;
  speedCamera(ctx); // a red light run in a garage car at speed: flash
  followRiders(ctx);
  busApp(ctx); // the bus app on your phone
  const onStreet = () => ctx.inOffice() && !ctx.upTop() && !ctx.trip() && Math.abs(ctx.player.pos.y - ctx.player.street) < 1.5;
  const now = () => store.officeNow() / 1000;
  let ride: Ride | null = null;
  let yaw = 0;
  let camWas: { dist: number } | null = null;
  const doors: Interactable[][] = buses.map(() => DOORS.map(() => ({ kind: 'citybus', x: 0, z: 0, radius: 4 }) as Interactable));
  const lastDoors = buses.map(() => 0);
  const announcer = new Announcer(ctx.settings, () => ride && ctx.sound.bus('gong', at(ride.bus, 2, 0)));
  /** Where (lx, lz) in bus `b`'s frame is in the world, a height `y` over the street. */
  const at = (b: CityBus, lx: number, lz: number, y = 2) => {
    const [x, z] = busWorld(b.pose, lx, lz);
    return { x, y: ctx.player.street + y, z };
  };

  // ---- Telling the office where in the bus you are ---------------------------------------------------
  let sent = '';
  let sentAt = 0;
  let sendTimer = 0;
  const mine = (): BusRide | null => (ride ? { run: ride.bus.i, x: ride.x, z: ride.z, r: ride.r, ...(ride.seat !== null ? { seat: ride.seat } : {}) } : null);
  function tell() {
    const r = mine();
    const k = r ? `${r.run}|${r.x.toFixed(2)}|${r.z.toFixed(2)}|${r.r.toFixed(2)}|${r.seat ?? ''}` : '';
    if (k === sent || sendTimer) return;
    // No more often than the office takes it: the latest goes out once the wait's over.
    const wait = Math.max(0, sentAt + BUS_RIDE_SEND_MS - performance.now());
    sendTimer = window.setTimeout(() => {
      sendTimer = 0;
      const now = mine();
      const nk = now ? `${now.run}|${now.x.toFixed(2)}|${now.z.toFixed(2)}|${now.r.toFixed(2)}|${now.seat ?? ''}` : '';
      if (nk === sent) return;
      sent = nk;
      sentAt = performance.now();
      ctx.net.send({ t: 'bus.ride', ride: now });
    }, wait);
  }
  ctx.messages.on('welcome', () => {
    sent = '';
    if (ride) getOff();
  });

  // ---- Getting on ----------------------------------------------------------------------------------
  ctx.usables.add({
    usable: () => {
      if (ride || !onStreet()) return [];
      const out: Interactable[] = [];
      buses.forEach((b, i) => {
        if (b.pose.doors < 0.6) return;
        DOORS.forEach((u, k) => {
          const w = at(b, u, BUS_W / 2 + 0.2);
          // At the street's height: the office's own things are a floor (or more) up.
          Object.assign(doors[i][k], { x: w.x, y: ctx.player.street, z: w.z });
          out.push(doors[i][k]);
        });
      });
      return out;
    },
  });

  // In first person E is for what the crosshair's on: the whole bus is, while its doors are open and you
  // can get on (otherwise it's in the way like a wall), and you get on at the door nearer you.
  const whole: Interactable[] = buses.map((b) => {
    const it = { kind: 'citybus', x: 0, z: 0, radius: BUS_L / 2, off: true } as Interactable;
    b.group.userData.interact = it;
    // What the aim can land on: the town's buses aren't the office building's.
    ctx.usables.add({ usable: () => [], pickable: () => b.group });
    return it;
  });
  ctx.ticks.add('env', () => {
    const can = !ride && onStreet();
    buses.forEach((b, i) => Object.assign(whole[i], { x: b.pose.x, y: ctx.player.street, z: b.pose.z, off: !can || b.pose.doors < 0.6 }));
  });

  const busOf = (it: Interactable) => buses[Math.max(whole.indexOf(it), doors.findIndex((d) => d.includes(it)))];
  /** The door to get on by: the one aimed at, or (aiming at the bus) the one nearer you. */
  const doorOf = (it: Interactable) => {
    const k = doors.find((d) => d.includes(it))?.indexOf(it);
    if (k !== undefined && k >= 0) return k;
    const b = busOf(it);
    const me = ctx.player.pos;
    const far = DOORS.map((u) => {
      const w = at(b, u, BUS_W / 2 + 0.2);
      return Math.hypot(w.x - me.x, w.z - me.z);
    });
    return far[0] <= far[1] ? 0 : 1;
  };

  function getOn(b: CityBus, k: number) {
    if (ride || ctx.trip() || b.pose.doors < 0.6) return;
    deps.free();
    ctx.activities.stopAll('start');
    const p = ctx.player;
    p.stopWalking();
    p.moving = false;
    p.vy = 0;
    const [x, z] = inDoor(k);
    ride = { bus: b, x, z, r: Math.PI, seat: null, halt: false, stamped: false, stops: 0 };
    yaw = b.pose.yaw;
    if (p.view === 'first') {
      // Looking in from the door, across the aisle.
      p.camYaw = yaw;
      p.lookPitch = -0.05;
    } else {
      camWas = { dist: p.camDist };
      p.camDist = 2.6;
    }
    p.rig = (dt) => step(dt);
    p.riding = true;
    p.rigFloor = true;
    step(0);
    const next = nextStop(b.line, b.pose);
    toast(`🚌 Linie ${b.line.no} → ${b.line.dest} · nächster Halt ${b.line.stops[next.at ? (next.i + 1) % b.line.stops.length : next.i].name}`);
    tell();
    ctx.hint.invalidate();
  }

  /** Off through door `k` (the nearer one if not said), onto the sidewalk side. */
  function getOff(k = ride ? (Math.abs(ride.x - DOORS[0]) < Math.abs(ride.x - DOORS[1]) ? 0 : 1) : 1) {
    if (!ride) return;
    const b = ride.bus;
    const p = ctx.player;
    if (ride.seat !== null) sitDown(null);
    p.rig = null;
    p.riding = false;
    p.rigFloor = false;
    if (camWas) {
      p.camDist = camWas.dist;
      camWas = null;
    }
    const w = at(b, DOORS[k], BUS_W / 2 + 0.9, 0);
    p.pos.set(w.x, p.street, w.z);
    p.vy = 0;
    p.grounded = true;
    p.facing = b.pose.yaw; // out of the door, away from the bus
    if (ride.stops >= 2 && !ride.stamped) toast('🎫 Ohne Fahrschein? Diesmal hat keiner kontrolliert …', 'warn');
    ride = null;
    announcer.reset();
    tell();
    ctx.hint.invalidate();
  }

  // ---- In there --------------------------------------------------------------------------------------
  function sitDown(i: number | null) {
    if (!ride) return;
    const p = ctx.player;
    if (i === null) {
      if (ride.seat !== null) standUp(ride, ride.seat);
      ctx.me.sit(null);
      p.eyeDrop = 0;
    } else {
      ride.seat = i;
      ride.x = SEATS[i].x + 0.02;
      ride.z = SEATS[i].z;
      ride.r = SEATS[i].rotY;
      ctx.me.sit(SEAT_HIPS);
      p.eyeDrop = HIPS - SEAT_HIPS;
      // In first person you look the way the seat faces.
      if (p.view === 'first') p.camYaw = ride.bus.pose.yaw + SEATS[i].rotY - Math.PI;
    }
    tell();
    ctx.hint.invalidate();
  }

  function press() {
    if (!ride) return;
    if (ride.bus.pose.doors > 0.7) return;
    ride.halt = !ride.halt;
    if (ride.halt) ctx.sound.bus('ding', at(ride.bus, ride.x, ride.z, 1.6));
    toast(ride.halt ? '🔴 Halt! Der Bus hält an der nächsten Haltestelle' : '🚌 Doch weiterfahren', ride.halt ? 'info' : 'warn');
    ctx.hint.invalidate();
  }

  function stamp() {
    if (!ride) return;
    ctx.sound.bus('stamp', at(ride.bus, ride.x, ride.z, 1.4));
    const line = ride.bus.line;
    toast(ride.stamped ? '🎫 Schon entwertet – gilt bis zur Endhaltestelle' : `🎫 Entwertet: Linie ${line.no} · ${new Date(store.officeNow()).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`);
    ride.stamped = true;
    ctx.hint.invalidate();
  }

  /** Each frame you ride: where the bus is, you in it, walking or sitting, and off through an open door. */
  function step(dt: number) {
    if (!ride) return;
    const b = ride.bus;
    const p = ctx.player;
    // Where it is this very frame (the town moves it later in the frame), so you don't trail behind.
    const wasStop = b.pose.stop;
    poseOf(b.run, now(), b.pose);
    if (b.pose.stop >= 0 && b.pose.stop !== wasStop) {
      ride.stops++;
      ride.halt = false;
    }
    const turned = wrap(b.pose.yaw - yaw);
    yaw = b.pose.yaw;
    p.camYaw += turned;
    const open = b.pose.doors > 0.7;
    const steer = { ahead: p.held('KeyW') || p.held('ArrowUp'), back: p.held('KeyS') || p.held('ArrowDown'), left: p.held('KeyA') || p.held('ArrowLeft'), right: p.held('KeyD') || p.held('ArrowRight') };
    if (ride.seat !== null && (steer.ahead || steer.back || steer.left || steer.right)) sitDown(null);
    let moved = false;
    if (ride.seat === null && dt > 0) {
      const walk = walkInBus(ride, steer, p.camYaw, yaw, dt, open, p.view === 'first');
      if (walk.out >= 0) return getOff(walk.out);
      moved = walk.moved;
    }
    if (p.view === 'first' && ride.seat === null) ride.r = wrap(p.camYaw + Math.PI - yaw);
    const w = at(b, ride.x, ride.z, FLOOR_Y);
    p.pos.set(w.x, w.y, w.z);
    p.facing = yaw + ride.r;
    p.moving = moved;
    // In third person the camera stays in there with you (however you switched to it).
    if (p.view !== 'first' && p.camDist > 2.6) {
      camWas ??= { dist: p.camDist };
      p.camDist = 2.6;
    }
    announcer.update(b.i, b.pose);
    tell();
  }

  /** What E does where you stand in the bus, if anything: the nearest of a door (open), a validator and a free seat. */
  function eAction(): { label: string; run(): void } | null {
    if (!ride) return null;
    if (ride.seat !== null) return { label: 'Aufstehen', run: () => sitDown(null) };
    const r = ride;
    const b = r.bus;
    const options: { d: number; label: string; run(): void }[] = [];
    const k = doorNear(r);
    if (k >= 0 && b.pose.doors > 0.7) options.push({ d: Math.abs(r.x - DOORS[k]) + (BUS_W / 2 - r.z), label: 'Aussteigen', run: () => getOff(k) });
    const v = validatorNear(r);
    if (v) options.push({ d: v.d, label: r.stamped ? 'Fahrschein (entwertet)' : 'Fahrschein entwerten', run: stamp });
    const s = seatNear(r, takenSeats(b.i));
    if (s.i >= 0) options.push({ d: s.d, label: 'Hinsetzen', run: () => sitDown(s.i) });
    return options.sort((x, y) => x.d - y.d)[0] ?? null;
  }

  ctx.interactions.define('citybus', {
    // From the sidewalk or the shelter, and through an open door to the far side of the bus.
    reach: 6.5,
    hint: (it) => {
      const b = busOf(it);
      const next = nextStop(b.line, b.pose);
      const via = b.line.stops[(next.i + 1) % b.line.stops.length].name;
      return { k: `bus|${b.i}|${next.i}`, parts: [hintTitle(`🚌 Linie ${b.line.no}`), aside(`→ ${b.line.dest} · über ${via}`), key('E', 'Einsteigen')] };
    },
    use: onE((it) => getOn(busOf(it), doorOf(it))),
  });

  ctx.activities.add({
    id: 'citybus',
    active: () => !!ride,
    stop: (why) => {
      if (why === 'walk' || why === 'errand') return;
      getOff();
    },
    key: (e) => {
      if (e.code === 'KeyH') {
        if (!e.repeat) press();
        return true;
      }
      // No jumping in a moving bus; the desk keys have nothing to do in here.
      if (!['KeyE', 'KeyQ', 'KeyF', 'Space'].includes(e.code) && !(e.code in DESK_KEYS)) return false;
      if (e.repeat) return true;
      if (e.code === 'KeyE') eAction()?.run();
      return true;
    },
    hint: (el) => {
      if (!ride) return;
      const b = ride.bus;
      const next = nextStop(b.line, b.pose);
      const stop = b.line.stops[next.i].name;
      const where = b.pose.doors > 0.7 ? `${stop} · Türen offen` : `${ride.halt ? '🔴 HALT · ' : ''}nächster Halt ${stop}`;
      const e = eAction();
      const k = `busride|${b.i}|${where}|${e?.label ?? ''}|${ride.seat}`;
      ctx.hint.draw(el, k, () => [
        h('span.title', {}, `🚌 ${b.line.no} → ${b.line.dest}`),
        aside(where),
        ...(e ? [key('E', e.label)] : []),
        ...(ride!.seat === null ? [key('W A S D', b.pose.doors > 0.7 ? 'Laufen · zur Tür raus' : 'Laufen')] : []),
        ...(b.pose.doors > 0.7 ? [] : [key('H', ride!.halt ? 'Halt zurücknehmen' : 'Halt drücken')]),
      ]);
    },
  });

  ctx.messages.onAny((msg) => {
    if (msg.t === 'floor.enter' && ride) getOff();
  });

  // The engines in earshot, the doors' hiss as they open and shut, the displays and the stops' boards.
  ctx.ticks.add('env', ({ dt, t }) => {
    const down = onStreet() || !!ride;
    const list: { id: number; at: { x: number; y: number; z: number }; speed: number; inside: boolean }[] = [];
    const me = ctx.player.pos;
    buses.forEach((b, i) => {
      const p = b.pose;
      const where = { x: p.x, y: ctx.player.street + 1, z: p.z };
      const near = down && Math.hypot(p.x - me.x, p.z - me.z) < 90;
      if (near) list.push({ id: i, at: where, speed: p.speed, inside: ride?.bus === b });
      const isOpen = p.doors > 0.05;
      if (near && isOpen !== lastDoors[i] > 0.05) ctx.sound.bus(isOpen ? 'open' : 'shut', { ...where, y: ctx.player.street + 2 });
      lastDoors[i] = p.doors;
    });
    ctx.sound.setBuses(list);
    if (!down) return;
    const wall = store.officeNow();
    town.buses.animate(dt, t, me, NEAR, clock(wall), (b) => ride?.bus === b && ride.halt);
    town.busStops.update(wall / 1000, me, 35);
  });

  return {
    /** The line you're riding, if any. */
    riding: (): BusLine | null => ride?.bus.line ?? null,
    /** Where you are in it (its frame), for a look from the console. */
    ride: () => (ride ? { run: ride.bus.i, x: ride.x, z: ride.z, seat: ride.seat, halt: ride.halt } : null),
    /** Gets you on bus `i` (of BUS_RUNS) at door `k`, if it stands with its doors open. */
    board: (i: number, k = 1) => buses[i] && getOn(buses[i], k),
    getOff,
    /** The stops in town and their next buses, for a look from the console. */
    stops: () => FURNITURE.filter((f) => f.stop).map((f) => ({ name: f.stop!.name, x: f.x, z: f.z, next: town.busStops.departures(f, now()).slice(0, 2).map((d) => `${d.line.no} ${Math.round(d.secs)}s`) })),
  };
}
