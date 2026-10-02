import { inForkArea } from '../../../shared/baumarkt';
import { FORKLIFT, LIFT_MAX, LIFT_RATE, driveForklift, forkliftFits, liftStep } from '../../../shared/baumarkt-play';
import { localPoint } from '../../../shared/baumarkt';
import type { CarPose, Pedals } from '../../../shared/garage';
import type { Ctx, Hint } from '../../core/context';
import { aside, hintTitle, key, onE } from '../../core/hint';
import { DESK_KEYS } from '../../interaction';
import { store } from '../../state';
import { h, toast } from '../../ui/dom';
import type { Interactable } from '../../world/types';

// The forklift at the Baumarkt (flrnoh fork, see FORK.md "The Baumarkt"): E gets you on if nobody's
// driving it; W and S drive, A and D steer its rear wheels (its tail swings out), R or Space raise the
// forks, F or Shift lower them, H sounds the horn, E gets you off. Drive the forks into a pallet's
// pockets on the floor and raise them: it's on; lower them to the floor and it's set down (where
// there's room). Like the boats, your page drives it and the office checks it stays in the hall and
// the delivery bay; the office works out what's picked up and set down, the same way your page does.

declare module '../../world/types' {
  interface InteractKinds {
    forklift: true;
  }
}

export interface ForkDeps {
  /** Down on your floor's street. */
  onStreet(): boolean;
  /** Up off whatever you're sitting on, and any walk over to someone stopped. */
  free(): void;
  /** Lets go of a trolley you're pushing. */
  letGo(): void;
}

const SEND_EVERY = 0.066;
const STEP = 0.2;
const SEAT_Z = -0.45;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export function forkliftDriving(ctx: Ctx, deps: ForkDeps) {
  /** Your forklift as your page drives it (null: you're not on it). */
  let mine: (CarPose & { lift: number }) | null = null;
  let carrying = -1;
  let pending = 0;
  let clock = 0;
  let sent = { at: -Infinity, x: 0, z: 0, rotY: 0, lift: 0, speed: 0 };
  let yaw = 0;
  let camWas: { dist: number; pitch: number } | null = null;
  let bumpedAt = -Infinity;
  /** How fast the forks are moving now (m/s), for the hydraulics. */
  let lifting = 0;
  const it: Interactable = { kind: 'forklift', x: 0, z: 0, y: 0, radius: 2.6 };

  ctx.usables.add({ usable: () => (deps.onStreet() && !mine ? [it] : []) });

  function seat(p: { x: number; z: number; rotY: number }) {
    return localPoint(p, 0, SEAT_Z);
  }

  function getOn() {
    const f = store.baumarkt.fork;
    if (mine || ctx.trip()) return;
    if (f.driver) return toast(`🚜 ${store.peers.get(f.driver)?.name ?? 'Someone'} is driving the forklift`, 'warn');
    if (ctx.carrying()) return toast('🗂️ Your hands are full: put the card back first (Q)', 'warn');
    deps.free();
    deps.letGo();
    ctx.activities.stopAll('start');
    mine = { x: f.x, z: f.z, rotY: f.rotY, speed: 0, steer: 0, lift: f.lift };
    carrying = f.carrying;
    const p = ctx.player;
    p.stopWalking();
    p.moving = false;
    p.vy = 0;
    yaw = f.rotY;
    if (p.view === 'first') {
      p.camYaw = f.rotY + Math.PI;
      p.lookPitch = -0.15;
    } else {
      camWas = { dist: p.camDist, pitch: p.camPitch };
      p.camDist = Math.max(p.camDist, 6);
      p.camYaw = f.rotY + Math.PI;
    }
    p.rig = (dt) => step(dt);
    p.riding = true;
    pending++;
    ctx.net.send({ t: 'bm.fork.enter' });
    ctx.sound.baumarkt('door', { x: f.x, y: p.street + 1, z: f.z }, 0.5);
    sit(0);
    ctx.hint.invalidate();
  }

  /** Off it, beside the seat: the forklift stays where it is, its forks as they are. */
  function getOff(tell = true) {
    if (!mine) return;
    const pose = { ...mine, speed: 0, steer: 0 };
    if (tell) send(pose, true);
    const p = ctx.player;
    p.rig = null;
    p.riding = false;
    if (camWas) {
      p.camDist = camWas.dist;
      p.camPitch = camWas.pitch;
      camWas = null;
    }
    // Down on the driver's side (its left), or the other if that's in the way.
    for (const side of [1, -1]) {
      const at = localPoint(pose, side * (FORKLIFT.HALF_W + 0.55), SEAT_Z);
      if (inForkArea(at.x, at.z) || side < 0) {
        p.pos.set(at.x, p.street, at.z);
        break;
      }
    }
    p.vy = 0;
    p.grounded = true;
    p.facing = pose.rotY;
    mine = null;
    lifting = 0;
    if (tell) {
      pending++;
      ctx.net.send({ t: 'bm.fork.leave' });
    }
    ctx.hint.invalidate();
  }

  function step(dt: number) {
    if (!mine) return;
    clock += dt;
    const p = ctx.player;
    const pedals: Pedals = {
      gas: (p.holding('KeyW', 'ArrowUp') ? 1 : 0) - (p.holding('KeyS', 'ArrowDown') ? 1 : 0),
      turn: (p.holding('KeyA', 'ArrowLeft') ? 1 : 0) - (p.holding('KeyD', 'ArrowRight') ? 1 : 0),
      brake: false,
    };
    const up = (p.holding('KeyR') || p.holding('Space') ? 1 : 0) - (p.holding('KeyF') || p.holding('ShiftLeft') || p.holding('ShiftRight') ? 1 : 0);
    const pallets = store.baumarkt.pallets;
    // The forks first: up or down, taking a pallet or setting it down.
    const before = mine.lift;
    const lift = Math.min(LIFT_MAX, Math.max(0, before + up * LIFT_RATE * dt));
    lifting = Math.abs(lift - before) / Math.max(dt, 1e-3) / LIFT_RATE;
    if (lift !== before) {
      const was = carrying;
      carrying = liftStep(mine, before, lift, carrying, pallets);
      mine.lift = lift;
      if (was !== carrying) {
        ctx.sound.baumarkt('clunk', { x: mine.x, y: p.street + 0.3, z: mine.z });
        ctx.hint.invalidate();
      }
    }
    // Then the wheels, in short steps, stopping at whatever's in the way.
    const n = Math.max(1, Math.ceil((Math.abs(mine.speed) * dt) / STEP));
    const hdt = dt / n;
    let pose: CarPose = mine;
    for (let i = 0; i < n; i++) {
      const next = driveForklift(pose, pedals, hdt);
      if (forkliftFits(next, carrying, pallets)) {
        pose = next;
        continue;
      }
      if (Math.abs(pose.speed) > 1.2 && clock - bumpedAt > 0.4) {
        bumpedAt = clock;
        ctx.sound.baumarkt('clunk', { x: pose.x, y: p.street + 0.5, z: pose.z }, Math.min(1, Math.abs(pose.speed) / 4));
        ctx.shake(Math.min(0.5, Math.abs(pose.speed) / 8));
      }
      pose = { ...pose, steer: next.steer, speed: -pose.speed * 0.2 };
      break;
    }
    Object.assign(mine, pose);
    // What's on the forks rides along.
    if (carrying >= 0) liftStep(mine, mine.lift, mine.lift, carrying, pallets);
    send(mine);
    sit(dt);
  }

  function send(pose: CarPose & { lift: number }, now = false) {
    const changed = Math.abs(pose.x - sent.x) + Math.abs(pose.z - sent.z) > 0.01 || Math.abs(wrap(pose.rotY - sent.rotY)) > 0.004 || pose.lift !== sent.lift || pose.speed !== sent.speed;
    if (!changed || (!now && clock - sent.at < SEND_EVERY)) return;
    sent = { at: clock, x: pose.x, z: pose.z, rotY: pose.rotY, lift: pose.lift, speed: pose.speed };
    ctx.net.send({ t: 'bm.fork.drive', x: pose.x, z: pose.z, rotY: pose.rotY, speed: pose.speed, steer: pose.steer, lift: pose.lift });
  }

  /** You in the seat, wherever it's got to: in first person turning as it turns, in third the camera swinging round behind. */
  function sit(dt: number) {
    if (!mine) return;
    const p = ctx.player;
    const at = seat(mine);
    p.pos.set(at.x, p.street + 0.3, at.z);
    p.facing = mine.rotY;
    p.moving = false;
    const turned = wrap(mine.rotY - yaw);
    yaw = mine.rotY;
    if (p.view === 'first') p.camYaw += turned;
    else {
      const k = Math.min(1, dt * 2 * Math.min(1, Math.abs(mine.speed) / 2));
      p.camYaw += wrap(mine.rotY + Math.PI - p.camYaw) * k;
    }
  }

  ctx.interactions.define('forklift', {
    reach: 3,
    hint: () => {
      const f = store.baumarkt.fork;
      const who = f.driver ? (store.peers.get(f.driver)?.name ?? 'Someone') : '';
      const k = `fork|${who}`;
      const title = hintTitle('🚜 Gabelstapler');
      if (who) return { k, parts: [title, aside(`${who} is driving`)] };
      return { k, parts: [title, aside(f.carrying >= 0 ? 'a pallet on its forks' : 'key in, battery full'), key('E', 'Get on')] };
    },
    use: onE(() => getOn()),
  });

  ctx.activities.add({
    id: 'forklift',
    active: () => !!mine,
    stop: (why) => {
      if (why === 'walk' || why === 'errand') return;
      getOff();
    },
    key: (e) => {
      // E, H, and the forks' keys (F would hang a picture, Space jump) are the forklift's while you're on it.
      if (!['KeyE', 'KeyH', 'KeyQ', 'KeyF', 'Space'].includes(e.code) && !(e.code in DESK_KEYS)) return false;
      if (e.repeat) return true;
      if (e.code === 'KeyE') getOff();
      else if (e.code === 'KeyH') horn();
      return true;
    },
    hint: (el) => {
      if (!mine) return;
      const kmh = Math.round(Math.abs(mine.speed) * 3.6);
      const load = carrying >= 0 ? 'a pallet on the forks' : 'forks empty';
      const hint: Hint = {
        k: `fork|${kmh}|${mine.lift.toFixed(1)}|${carrying}`,
        parts: [h('span.title', {}, '🚜 Gabelstapler'), aside(`${kmh} km/h · forks ${mine.lift.toFixed(1)} m · ${load}`), key('W S', 'Drive'), key('A D', 'Steer'), key('R F', 'Forks up/down'), key('H', 'Horn'), key('E', 'Get off')],
      };
      ctx.hint.draw(el, hint.k, () => hint.parts);
    },
    hidesHands: true,
  });

  let hornedAt = 0;
  function horn() {
    const now = performance.now();
    if (!mine || now - hornedAt < 500) return;
    hornedAt = now;
    ctx.sound.baumarkt('horn', { x: mine.x, y: ctx.player.street + 1.5, z: mine.z });
    ctx.net.send({ t: 'bm.fork.horn' });
  }

  /** The office said who's on it: someone got there first, or it let go of you. */
  ctx.messages.on('baumarkt', (msg) => {
    if (msg.answer) pending = Math.max(0, pending - 1);
    if (pending > 0 || !mine) return;
    const f = store.baumarkt.fork;
    if (f.driver !== store.you) {
      toast(`🚜 ${(f.driver && store.peers.get(f.driver)?.name) || 'Someone'} got on first`, 'warn');
      getOff(false);
      return;
    }
    // The office's word on what's on the forks.
    carrying = f.carrying;
  });
  ctx.messages.on('bm.fork.horn', () => {
    const f = store.baumarkt.fork;
    ctx.sound.baumarkt('horn', { x: f.x, y: ctx.player.street + 1.5, z: f.z });
  });
  ctx.messages.onAny((msg) => {
    if ((msg.t === 'welcome' || msg.t === 'floor.enter') && mine) getOff(false);
  });

  return {
    /** Your forklift as you drive it, if you're on it. */
    mine: () => mine,
    lifting: () => lifting,
    /** The pallet on your forks as your page has it (-1 none). */
    carrying: () => carrying,
    interactable: it,
    getOn,
    getOff,
  };
}
