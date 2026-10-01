import { JETTY, SEA_LEVEL, inSwimZone } from '../../../shared/beach';
import { CRAFTS, CRAFT_SPECS, craftPoint } from '../../../shared/boats';
import type { Ctx, Hint } from '../../core/context';
import { aside, hintTitle, key, onE } from '../../core/hint';
import { DESK_KEYS } from '../../interaction';
import { store } from '../../state';
import { clip, h, toast } from '../../ui/dom';
import { G } from '../../world/scenic/kit';
import { Flotilla } from './craft';
import type { SeaFx } from './fx';
import { Helm } from './helm';

// The jetskis and the motorboat at the jetty (flrnoh fork, see FORK.md "A day at the beach"): E at one
// gets you on (at the helm if it's free, else a free seat), W A S D drive it on open water, H sounds
// its horn, E gets you off: onto the jetty when you're alongside it, else into the water for a swim
// (inside the buoys). Its wake and its engine for everyone on the floor. Like the garage's cars
// (features/cars), the office only says who's in which seat and passes on where each one is.

declare module '../../world/types' {
  interface InteractKinds {
    watercraft: true;
  }
}

export interface BoatsDeps {
  fx: SeaFx;
  /** Down on your floor's street, where the beach is. */
  onStreet(): boolean;
  /** Up off whatever you're sitting on, and any walk over to someone stopped. */
  free(): void;
  /** Into the water at (x, z) off the side of a craft. */
  swimFrom(x: number, z: number): void;
  /** Out of the water's hold on you (getting onto a craft while swimming). */
  outOfWater(): void;
}

const iconOf = (i: number) => CRAFT_SPECS[CRAFTS[i].kind].icon;

export function jettyBoats(ctx: Ctx, deps: BoatsDeps) {
  const fleet = new Flotilla(ctx.office.scenic.group, G);
  const helm = new Helm(ctx.player, fleet, {
    moved: (craft, p) => ctx.net.send({ t: 'boat.drive', craft, x: p.x, z: p.z, rotY: p.rotY, speed: p.speed, steer: p.steer }),
    bump: (at, speed) => {
      ctx.sound.beach('splash', { x: at.x, y: fleet.water + 0.3, z: at.z }, Math.min(1, speed / 10));
      deps.fx.splash(at.x, fleet.water, at.z, Math.min(1, speed / 12));
      ctx.shake(Math.min(0.7, speed / 14));
    },
  });
  /** boat.enter and boat.leave of yours the office hasn't answered yet. */
  let pending = 0;

  ctx.usables.add({ usable: () => (deps.onStreet() ? fleet.crafts.map((v) => v.interactable) : []) });

  function hornAt(i: number) {
    const p = fleet.crafts[i]?.pose ?? CRAFTS[i];
    return { x: p.x, y: fleet.water + 1, z: p.z };
  }

  /** E at a craft: the helm if it's free, else the first free seat. */
  function getOn(i: number) {
    const c = store.boats[i];
    const def = CRAFTS[i];
    if (ctx.trip() || helm.active || !c || !def) return;
    if (ctx.carrying()) return toast('🗂️ Your hands are full: put the card back first (Q)', 'warn');
    if (ctx.holdingBall()) return toast('🏀 Put the ball down first (Q)', 'warn');
    const seat = c.riders.findIndex((r) => !r);
    if (seat < 0) return toast(`${iconOf(i)} The ${def.name} is full`, 'warn');
    deps.free();
    ctx.activities.stopAll('start');
    deps.outOfWater();
    helm.enter(i, seat);
    pending++;
    ctx.net.send({ t: 'boat.enter', craft: i, seat });
    ctx.sound.beach('ladder', hornAt(i), 0.5);
    ctx.hint.invalidate();
  }

  ctx.interactions.define('watercraft', {
    reach: 4,
    hint: (it) => {
      const i = it.craft ?? -1;
      const c = store.boats[i];
      const def = CRAFTS[i];
      if (!c || !def) return { k: '', parts: [] };
      const name = (id: string | null) => (id ? clip(store.peers.get(id)?.name ?? 'Someone', 18) : '');
      const at = name(c.riders[0]);
      const aboard = c.riders.filter(Boolean).length;
      const free = c.riders.length - aboard;
      const k = `boat|${i}|${at}|${aboard}`;
      const title = hintTitle(`${iconOf(i)} ${def.name}`);
      if (!free) return { k, parts: [title, aside(`${at || 'Someone'} at the helm · full`)] };
      if (!at) return { k, parts: [title, aside(aboard ? `${aboard} aboard, nobody at the helm` : 'key in, tank full'), key('E', 'Take the helm')] };
      return { k, parts: [title, aside(`${at} at the helm`), key('E', 'Hop on')] };
    },
    use: onE((it) => {
      if (it.craft !== undefined) getOn(it.craft);
    }),
  });

  /** Where getting off puts you: onto the jetty's deck if you're alongside it, else into the water (inside the buoys). */
  function wayOff(): { deck: { x: number; z: number } } | { swim: { x: number; z: number } } | null {
    const i = helm.craft;
    if (i === null) return null;
    const v = fleet.crafts[i];
    const spec = CRAFT_SPECS[v.def.kind];
    const inset = 0.6;
    const x0 = JETTY.x1 + inset;
    const x1 = JETTY.x0 - 4;
    const z0 = JETTY.z - JETTY.width / 2 + inset;
    const z1 = JETTY.z + JETTY.width / 2 - inset;
    const seat = spec.seats[helm.seat ?? 0];
    const me = craftPoint(v.pose, seat.x, seat.z);
    const dx = Math.max(x0 - me.x, 0, me.x - x1);
    const dz = Math.max(z0 - me.z, 0, me.z - z1);
    if (Math.hypot(dx, dz) < 4.5) return { deck: { x: Math.min(x1, Math.max(x0, me.x)), z: Math.min(z1, Math.max(z0, me.z)) } };
    // Over the side, a little way out from it.
    for (const side of [1, -1]) {
      const at = craftPoint(v.pose, side * (spec.width / 2 + 0.9), seat.z);
      if (inSwimZone(at.x, at.z)) return { swim: at };
    }
    return null;
  }

  /** E aboard: off, onto the jetty or into the water. False if you're too far out. */
  function getOff(): boolean {
    const i = helm.craft;
    if (i === null) return true;
    const way = wayOff();
    if (!way) {
      toast('🌊 Too far out to swim back: head for the jetty, or inside the buoys', 'warn');
      return false;
    }
    const pose = fleet.crafts[i].pose;
    helm.drop();
    left(i);
    const p = ctx.player;
    if ('deck' in way) {
      p.pos.set(way.deck.x, p.street + JETTY.deck, way.deck.z);
      p.vy = 0;
      p.grounded = true;
      p.facing = pose.rotY;
    } else {
      p.pos.set(way.swim.x, p.street + SEA_LEVEL, way.swim.z);
      deps.swimFrom(way.swim.x, way.swim.z);
    }
    return true;
  }

  /** Off wherever you are (to another floor, a desk): the craft stays where it is. */
  function dropOff() {
    const i = helm.craft;
    if (i === null) return;
    helm.drop();
    left(i);
  }

  function left(i: number) {
    pending++;
    ctx.net.send({ t: 'boat.leave' });
    ctx.sound.beach('ladder', hornAt(i), 0.4);
    ctx.hint.invalidate();
  }

  ctx.activities.add({
    id: 'helm',
    active: () => helm.active,
    stop: (why) => {
      if (why === 'walk' || why === 'errand') return;
      dropOff();
    },
    key: (e) => {
      if (e.code !== 'KeyE' && e.code !== 'KeyH' && e.code !== 'KeyF' && !(e.code in DESK_KEYS)) return false;
      if (e.repeat) return true;
      if (e.code === 'KeyE') getOff();
      else if (e.code === 'KeyH') horn();
      return true;
    },
    hint: (el) => renderHint(el),
    hidesHands: true,
  });

  let hornedAt = 0;
  function horn() {
    const i = helm.craft;
    const now = performance.now();
    if (i === null || now - hornedAt < 450) return;
    hornedAt = now;
    ctx.sound.beach(CRAFTS[i].kind === 'boat' ? 'hornboat' : 'hornski', hornAt(i));
    ctx.net.send({ t: 'boat.horn' });
  }

  ctx.ticks.add('vehicles', ({ dt, t, now }) => {
    fleet.setStreet(ctx.player.street);
    fleet.update(dt, t, store.boats, store.boatsAt, now, helm.driving ? helm.craft : null);
  });

  /** Spray and rings off every craft going, and the engines of those with someone at the helm. */
  let wakeT = 0;
  ctx.ticks.add('others', ({ dt }) => {
    const engines: Parameters<typeof ctx.sound.setOutboards>[0] = [];
    if (!deps.onStreet()) {
      ctx.sound.setOutboards(engines);
      return;
    }
    wakeT += dt;
    const ring = wakeT > 0.22;
    if (ring) wakeT = 0;
    const near = ctx.player.pos;
    for (const v of fleet.crafts) {
      const c = store.boats[v.index];
      const mine = helm.craft === v.index && helm.driving;
      const speed = Math.abs(v.pose.speed);
      if (Math.hypot(v.pose.x - near.x, v.pose.z - near.z) > 220) continue;
      const spec = CRAFT_SPECS[v.def.kind];
      if (speed > 1.2) {
        const stern = craftPoint(v.pose, 0, -spec.length / 2);
        const vx = Math.sin(v.pose.rotY) * v.pose.speed;
        const vz = Math.cos(v.pose.rotY) * v.pose.speed;
        deps.fx.spray(stern.x, fleet.water, stern.z, vx, vz, speed * dt * (v.def.kind === 'jetski' ? 9 : 7));
        if (ring) deps.fx.ring(stern.x, fleet.water, stern.z, 1.5 + speed * 0.12, 2.6);
        if (speed > 6) {
          const bow = craftPoint(v.pose, 0, spec.length * 0.3);
          deps.fx.spray(bow.x, fleet.water, bow.z, vx * 0.2, vz * 0.2, speed * dt * 2);
        }
      }
      if (c?.riders[0] || mine) engines.push({ id: v.index, at: hornAt(v.index), speed: v.pose.speed, gas: mine ? helm.gas : Math.min(1, speed / 8), high: v.def.kind === 'jetski' });
    }
    ctx.sound.setOutboards(engines);
  });

  /** The office said who's in which craft (`answer`: to a boat.enter or boat.leave of yours). */
  function news(answer: boolean) {
    if (answer) pending = Math.max(0, pending - 1);
    if (pending > 0) return;
    const mine = store.boatOf(store.you);
    if (helm.active) {
      if (mine?.craft === helm.craft && mine.seat === helm.seat) return;
      const who = store.boats[helm.craft!]?.riders[helm.seat!];
      const i = helm.craft!;
      if (!getOff()) {
        dropOff();
        // Too far out with nowhere to go: back on the jetty.
        ctx.player.pos.set(JETTY.ladder.top.x, ctx.player.street + JETTY.deck, JETTY.ladder.top.z);
      }
      toast(`${iconOf(i)} ${(who && store.peers.get(who)?.name) || 'Someone'} got there first`, 'warn');
    } else if (mine) {
      pending++;
      ctx.net.send({ t: 'boat.leave' });
    }
  }
  ctx.messages.on('boats', (msg) => news(!!msg.answer));
  ctx.messages.on('boat.horn', (msg) => {
    if (msg.craft >= 0 && msg.craft < CRAFTS.length) ctx.sound.beach(CRAFTS[msg.craft].kind === 'boat' ? 'hornboat' : 'hornski', hornAt(msg.craft));
  });
  ctx.messages.onAny((msg) => {
    if (msg.t === 'welcome' || msg.t === 'floor.enter') {
      fleet.snap(store.boats);
      // Back after a reconnect (the office let go of your seat): back into it if it's still free.
      pending = 0;
      const i = helm.craft;
      const seat = helm.seat;
      if (msg.t === 'welcome' && i !== null && seat !== null) {
        if (store.boats[i]?.riders[seat]) dropOff();
        else {
          pending++;
          ctx.net.send({ t: 'boat.enter', craft: i, seat });
        }
      }
    }
  });

  function renderHint(el: HTMLElement) {
    const i = helm.craft!;
    const c = store.boats[i];
    const name = (id: string | null | undefined) => (id && id !== store.you ? (store.peers.get(id)?.name ?? '') : '');
    const crew = (c?.riders ?? []).map(name).filter(Boolean);
    const title = h('span.title', {}, `${iconOf(i)} ${CRAFTS[i].name}`);
    const off = wayOff();
    const offLabel = !off ? 'Too far out to get off' : 'deck' in off ? 'Onto the jetty' : 'Jump in';
    let hint: Hint;
    if (helm.driving) {
      const kn = Math.round(Math.abs(helm.pose?.speed ?? 0) * 1.944);
      hint = { k: `helm|${kn}|${crew.join()}|${offLabel}`, parts: [title, aside(`${kn} kn${crew.length ? ` · with ${clip(crew.join(', '), 30)}` : ''}`), key('W A S D', 'Steer'), key('Space', 'Slow down'), key('H', 'Horn'), key('E', offLabel)] };
    } else {
      const at = name(c?.riders[0]);
      hint = { k: `aboard|${at}|${offLabel}`, parts: [title, aside(at ? `${clip(at, 20)} at the helm` : 'nobody at the helm'), key('H', 'Horn'), key('E', offLabel)] };
    }
    ctx.hint.draw(el, `boat|${hint.k}`, () => hint.parts);
  }

  return { fleet, helm, getOn, getOff };
}
