/**
 * flrnoh fork (see FORK.md "Waymo"): the robotaxis on your page. The office plans every car's drive
 * and says when one changes (shared/waymo/fleet.ts); here they're drawn where the office's clock has
 * them (world/waymo/model.ts): the wheels and the lidar turning, the wheel steering itself, the
 * indicators before a corner, the brake lights, your initials on the dome of the one coming for you.
 * Book one on your phone (app.ts); when it's waiting at the curb, E at it gets you in (a friend's too,
 * while it waits), and you sit in it as it drives you there: E sets off, Q gets out (or pulls over on
 * the way), the screens show what it sees (screen.ts). Everyone sees you sitting in it (state.ts).
 */
import { CAR_L, CAR_W } from '../../../shared/waymo/drive';
import { WAYMO_HIPS, WAYMO_SEATS, waymoEta, type WaymoCar } from '../../../shared/waymo/fleet';
import { placeAt } from '../../../shared/waymo/roads';
import type { Ctx } from '../../core/context';
import { aside, hintTitle, key, onE } from '../../core/hint';
import { DESK_KEYS } from '../../interaction';
import { store } from '../../state';
import { h, toast } from '../../ui/dom';
import { G } from '../../world/town/kit';
import type { Collider, Interactable } from '../../world/types';
import { buildWaymo, type WaymoModel } from '../../world/waymo/model';
import { headTo, headingTo } from '../minimap/goal';
import { waymoApp } from './app';
import { RideScreen, idleScreen } from './screen';
import { carWorld, fleet, posesNow, putCar, seatOf, setStreet } from './state';

declare module '../../world/types' {
  interface InteractKinds {
    waymo: true;
  }
}

export interface WaymoDeps {
  /** Up off whatever you're sitting on, and any walk over to someone stopped. */
  free(): void;
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
/** How far below a standing eye your view sits in a seat (m): under the roof. */
const SEATED_EYE = 0.2;

interface Drawn {
  model: WaymoModel;
  it: Interactable;
  box: Collider;
  /** Its yaw and speed last frame (for the wheel and the brake lights), the wheels' turn, the lights' flash after a honk. */
  yaw: number;
  speed: number;
  roll: number;
  flash: number;
}

export function installWaymo(ctx: Ctx, deps: WaymoDeps) {
  const town = ctx.office.town;
  setStreet(() => ctx.player.street);
  const drawn = new Map<number, Drawn>();
  const screen = new RideScreen();
  const onStreet = () => ctx.inOffice() && !ctx.upTop() && !ctx.trip() && Math.abs(ctx.player.pos.y - ctx.player.street) < 1.5;
  const now = () => store.officeNow() / 1000;

  /** The car on your page for `c`, built the first time it comes. */
  function drawnOf(c: WaymoCar): Drawn {
    let d = drawn.get(c.id);
    if (d) return d;
    const model = buildWaymo();
    model.screen.map = idleScreen();
    town.group.add(model.group);
    const it = { kind: 'waymo', x: 0, z: 0, radius: 3.5, off: true } as Interactable;
    model.group.userData.interact = it;
    const box: Collider = { minX: 0, maxX: 0, minZ: 0, maxZ: 0, bottom: 0, top: 0 };
    town.traffic.push(box);
    d = { model, it, box, yaw: 0, speed: 0, roll: 0, flash: 0 };
    drawn.set(c.id, d);
    return d;
  }

  // ---- What the office says ------------------------------------------------------------------------
  ctx.messages.on('welcome', () => ctx.net.send({ t: 'waymo.hello' }));
  ctx.messages.on('waymo.fleet', (msg) => {
    for (const c of msg.cars) changed(c);
  });
  ctx.messages.on('waymo.car', (msg) => changed(msg.car));
  ctx.messages.on('waymo.honked', (msg) => {
    const d = drawn.get(msg.car);
    const p = posesNow().get(msg.car);
    if (!d || !p) return;
    d.flash = 1.2;
    if (onStreet()) ctx.sound.honk({ x: p.x, y: ctx.player.street + 1, z: p.z }, 'ferrari');
  });

  /** What a change to car `c` means for you: your booking on its way, waiting, you in it, there. */
  function changed(c: WaymoCar) {
    const was = fleet.find((x) => x.id === c.id);
    const before = was ? { mode: was.mode, mine: was.booker === store.you, in: was.riders.includes(store.you) } : null;
    putCar(c);
    drawnOf(c);
    const mine = c.booker === store.you;
    const inIt = c.riders.includes(store.you);
    if (mine && c.mode === 'coming' && (!before?.mine || before.mode !== 'coming')) {
      const curb = placeAt(c.drive.to, 2);
      headTo({ id: 'waymo-pickup', name: 'Dein Waymo', icon: '🚕', x: curb.x, z: curb.z, kind: 'place' });
      toast(`🚕 Dein Waymo kommt in ${Math.max(1, Math.ceil((waymoEta(c) - now()) / 60))} min · die Minimap zeigt dir den Abholpunkt`);
    }
    if (mine && c.mode === 'waiting' && before?.mode === 'coming') toast(`🚕 Dein Waymo wartet am Abholpunkt · ${c.initials} auf dem Dach`);
    if (before?.mine && !mine && headingTo()?.id === 'waymo-pickup') headTo(null);
    if (inIt && c.mode === 'riding' && before?.mode !== 'riding') ctx.sound.bus('gong', here());
    if (inIt && c.mode === 'arrived' && before?.mode !== 'arrived') {
      ctx.sound.bus('ding', here());
      toast(`🚕 Du bist da: ${c.dest?.name ?? ''} · Q zum Aussteigen`);
    }
    if (inIt && !riding) getIn(c);
    if (!inIt && riding?.car === c.id) getOut();
    ctx.hint.invalidate();
  }
  const here = () => ({ x: ctx.player.pos.x, y: ctx.player.pos.y + 1, z: ctx.player.pos.z });

  // ---- Getting in --------------------------------------------------------------------------------
  /** Whether you may get into `c` now: waiting at the curb, a seat free, you in none. */
  const mayEnter = (c: WaymoCar) => !riding && onStreet() && c.mode === 'waiting' && c.riders.includes(null) && !seatOf(store.you);
  ctx.usables.add({
    usable: () => fleet.flatMap((c) => (mayEnter(c) ? [drawnOf(c).it] : [])),
    pickable: () => town.group,
  });
  const carOf = (it: Interactable) => fleet.find((c) => drawn.get(c.id)?.it === it);

  ctx.interactions.define('waymo', {
    // From the curb, and through its glass to the far side.
    reach: 6,
    hint: (it) => {
      const c = carOf(it);
      if (!c) return { k: '', parts: [] };
      const yours = c.booker === store.you;
      const who = yours ? 'Dein Waymo' : `Waymo · ${c.initials ?? ''}`;
      return { k: `waymo|${c.id}|${yours}`, parts: [hintTitle(`🚕 ${who}`), aside(`→ ${c.dest?.name ?? ''}`), key('E', yours ? 'Einsteigen' : 'Mitfahren')] };
    },
    use: onE((it) => {
      const c = carOf(it);
      if (!c || !mayEnter(c)) return;
      ctx.net.send({ t: 'waymo.enter', car: c.id });
    }),
  });

  // ---- Riding ------------------------------------------------------------------------------------
  let riding: { car: number; seat: number; yaw: number; camWas: number | null } | null = null;

  function getIn(c: WaymoCar) {
    const seat = c.riders.indexOf(store.you);
    if (seat < 0) return;
    deps.free();
    ctx.activities.stopAll('start');
    const p = ctx.player;
    p.stopWalking();
    p.moving = false;
    p.vy = 0;
    const pose = posesNow().get(c.id);
    riding = { car: c.id, seat, yaw: pose?.yaw ?? 0, camWas: null };
    if (p.view === 'first') {
      p.camYaw = riding.yaw + Math.PI / 2 - Math.PI;
      p.lookPitch = -0.08;
    } else {
      riding.camWas = p.camDist;
      p.camDist = 3.8;
    }
    p.rig = () => sit();
    p.riding = true;
    p.rigFloor = true;
    ctx.me.sit(WAYMO_HIPS);
    p.eyeDrop = SEATED_EYE;
    drawnOf(c).model.screen.map = screen.texture;
    sit();
    if (c.mode === 'waiting') toast('🚕 Willkommen! E: Fahrt starten · Q: Aussteigen');
    ctx.hint.invalidate();
  }

  /** Out of the car, beside your door. */
  function getOut() {
    if (!riding) return;
    const r = riding;
    const p = ctx.player;
    riding = null;
    p.rig = null;
    p.riding = false;
    p.rigFloor = false;
    p.eyeDrop = 0;
    ctx.me.sit(null);
    if (r.camWas !== null) p.camDist = r.camWas;
    const pose = posesNow().get(r.car);
    const d = drawn.get(r.car);
    if (d) d.model.screen.map = idleScreen();
    if (pose) {
      const seat = WAYMO_SEATS[r.seat];
      const side = seat.z < 0 ? -1 : 1;
      // Out onto the curb on its right, into the road on its left (mind the traffic).
      const [x, z] = carWorld(pose, seat.x, side * (CAR_W / 2 + 1.1));
      p.pos.set(x, p.street, z);
      p.facing = pose.yaw + (side > 0 ? 0 : Math.PI);
    }
    p.vy = 0;
    p.grounded = true;
    ctx.hint.invalidate();
  }

  /** Each frame in the car: in your seat as it goes, the view turning with it. */
  function sit() {
    if (!riding) return;
    const pose = posesNow().get(riding.car);
    if (!pose) return;
    const p = ctx.player;
    const seat = WAYMO_SEATS[riding.seat];
    const [x, z] = carWorld(pose, seat.x, seat.z);
    p.pos.set(x, p.street, z);
    p.facing = pose.yaw + Math.PI / 2;
    p.moving = false;
    p.camYaw += wrap(pose.yaw - riding.yaw);
    riding.yaw = pose.yaw;
    if (p.view !== 'first' && p.camDist > 3.8) {
      riding.camWas ??= p.camDist;
      p.camDist = 3.8;
    }
  }

  const myCar = () => (riding ? fleet.find((c) => c.id === riding!.car) : undefined);

  ctx.activities.add({
    id: 'waymo',
    active: () => !!riding,
    hidesHands: true,
    stop: (why) => {
      if (why === 'walk' || why === 'errand') return;
      // Only where it may let you out.
      const c = myCar();
      if (c && c.mode !== 'riding') ctx.net.send({ t: 'waymo.leave' });
    },
    key: (e) => {
      if (!['KeyE', 'KeyQ', 'KeyF', 'Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code) && !(e.code in DESK_KEYS)) return false;
      if (e.repeat) return true;
      const c = myCar();
      if (!c) return true;
      if (e.code === 'KeyE') {
        if (c.mode === 'waiting') ctx.net.send({ t: 'waymo.go' });
        else if (c.mode === 'arrived') ctx.net.send({ t: 'waymo.leave' });
      } else if (e.code === 'KeyQ') {
        if (c.mode === 'riding') {
          ctx.net.send({ t: 'waymo.pullover' });
          toast('🚕 Es hält an der nächsten Stelle, wo es halten darf');
        } else ctx.net.send({ t: 'waymo.leave' });
      }
      return true;
    },
    hint: (el) => {
      const c = myCar();
      if (!c) return;
      const t = now();
      const mins = Math.max(0, Math.ceil((waymoEta(c) - t) / 60));
      const what = c.mode === 'waiting' ? 'wartet' : c.mode === 'riding' ? `→ ${c.dest?.name ?? ''} · ${mins} min` : c.mode === 'arrived' ? `angekommen: ${c.dest?.name ?? ''}` : '';
      ctx.hint.draw(el, `waymo|${c.mode}|${what}`, () => [
        h('span.title', {}, '🚕 Waymo'),
        aside(what),
        ...(c.mode === 'waiting' ? [key('E', 'Fahrt starten'), key('Q', 'Aussteigen')] : []),
        ...(c.mode === 'riding' ? [key('Q', 'Rechts ran')] : []),
        ...(c.mode === 'arrived' ? [key('E', 'Aussteigen')] : []),
      ]);
    },
  });

  ctx.messages.onAny((msg) => {
    // Another floor: the office has got you out (fleet.gone), and you're out on your page too.
    if (msg.t === 'floor.enter' && riding) getOut();
  });

  // ---- Each frame: the cars where they are --------------------------------------------------------
  ctx.ticks.add('env', ({ dt, now: ms }) => {
    const poses = posesNow();
    const t = now();
    const me = ctx.player.pos;
    const blink = Math.floor(ms / 380) % 2 === 0;
    for (const c of fleet) {
      const d = drawnOf(c);
      const p = poses.get(c.id);
      if (!p) continue;
      const m = d.model;
      m.group.position.set(p.x, G, p.z);
      m.group.rotation.y = p.yaw;
      const fx = Math.cos(p.yaw);
      const fz = -Math.sin(p.yaw);
      const ex = (CAR_L / 2) * Math.abs(fx) + (CAR_W / 2) * Math.abs(fz);
      const ez = (CAR_L / 2) * Math.abs(fz) + (CAR_W / 2) * Math.abs(fx);
      Object.assign(d.box, { minX: p.x - ex, maxX: p.x + ex, minZ: p.z - ez, maxZ: p.z + ez, bottom: ctx.player.street, top: ctx.player.street + 1.6 });
      d.it.x = p.x;
      d.it.z = p.z;
      d.it.y = ctx.player.street;
      d.it.off = !mayEnter(c);
      // Near you only: the moving parts and the lights.
      if (Math.abs(p.x - me.x) > 120 || Math.abs(p.z - me.z) > 120) continue;
      const step = Math.max(dt, 1e-3);
      d.roll += (p.speed * dt) / 0.36;
      for (const w of m.wheels) w.rotation.z = -d.roll;
      m.lidar.rotation.y += dt * 9;
      // The wheel follows how hard it's turning.
      const turn = wrap(p.yaw - d.yaw) / step;
      d.yaw = p.yaw;
      m.steering.rotation.x = Math.max(-2.4, Math.min(2.4, -turn * 4));
      // Indicators before a corner (25 m ahead), the brake lights slowing or stopped.
      const corner = p.path.corners.find(([a, b]) => b > p.s && a - p.s < 25);
      const side = corner?.[2] ?? 0;
      const flash = d.flash > 0 && blink;
      d.flash = Math.max(0, d.flash - dt);
      m.blinkL.color.set((side < 0 && blink) || flash ? '#ffb000' : '#5a3a10');
      m.blinkR.color.set((side > 0 && blink) || flash ? '#ffb000' : '#5a3a10');
      m.brake.color.set(p.speed < d.speed - 0.02 || p.speed < 0.3 ? '#ff1f3d' : '#7a0b1a');
      m.heads.color.set(flash ? '#ffffff' : '#fdf8e6');
      d.speed = p.speed;
      // Its rider's initials on the dome while it's theirs.
      m.sign.show(c.initials && c.mode !== 'cruise' ? c.initials : '');
      if (riding?.car === c.id) {
        const people = town.people.list();
        const vehicles = [
          ...town.buses.buses.map((b) => ({ x: b.pose.x, z: b.pose.z, yaw: b.pose.yaw, l: 11, w: 2.5, kind: 'bus' as const })),
          ...fleet.filter((o) => o !== c).flatMap((o) => {
            const q = poses.get(o.id);
            return q ? [{ x: q.x, z: q.z, yaw: q.yaw, l: CAR_L, w: CAR_W, kind: 'waymo' as const }] : [];
          }),
          ...town.traffic.filter((b) => b.top - (b.bottom ?? 0) < 2 && b.top - (b.bottom ?? 0) > 1).map((b) => {
            const along = b.maxX - b.minX > b.maxZ - b.minZ;
            return { x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2, yaw: along ? 0 : Math.PI / 2, l: Math.max(b.maxX - b.minX, b.maxZ - b.minZ), w: Math.min(b.maxX - b.minX, b.maxZ - b.minZ), kind: 'car' as const };
          }).filter((v) => !fleet.some((o) => Math.hypot((poses.get(o.id)?.x ?? 1e9) - v.x, (poses.get(o.id)?.z ?? 1e9) - v.z) < 0.5)),
        ];
        screen.draw(ms, c, p, t, { vehicles, people: [...people, ...[...store.peers.values()].filter((q) => q.id !== store.you && store.onMyFloor(q))] });
      }
    }
  });

  waymoApp(ctx); // the robotaxis on your phone

  return {
    /** The car you're in, if any, for a look from the console. */
    riding: () => (riding ? { ...riding, mode: myCar()?.mode } : null),
    fleet: () => fleet.map((c) => ({ id: c.id, mode: c.mode, booker: c.booker, initials: c.initials, riders: c.riders, dest: c.dest?.name, at: posesNow().get(c.id) && { x: posesNow().get(c.id)!.x, z: posesNow().get(c.id)!.z, yaw: posesNow().get(c.id)!.yaw, speed: posesNow().get(c.id)!.speed } })),
  };
}
