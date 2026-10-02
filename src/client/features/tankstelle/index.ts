/**
 * flrnoh fork (see FORK.md "The petrol station"): FLOGGE OIL, the petrol station with its car wash on
 * the block west of the office (world/tankstelle/ builds it). Drive a garage car up beside a pump and
 * stop, and E fills it up: the hose comes out, the pump counts litres and euros and hums for a few
 * seconds. Drive into the car wash, stop on the marking, and E starts its programme: the gantry runs
 * along the car spraying water and coloured foam, scrubbing with its brushes and drying it, and out
 * it comes shiny. The office keeps the clock (server/tankstelle.ts), so everyone on the floor sees it
 * all the same; a car being filled or washed stays put. The shop is shop.ts.
 */
import * as THREE from 'three';
import { CARS, heightOf, type CarPose } from '../../../shared/garage';
import { PUMPS, PUMP_HALF, WASH, inWashHall, onWashBay, priceParts } from '../../../shared/tankstelle';
import { FILL_MS, SHINE_MS, STILL, WASH_MS, fillerOf, fuelOf, litersAt, pumpFor, washAt, type WashMoment } from '../../../shared/tankstelle-play';
import type { Ctx } from '../../core/context';
import { aside, hintTitle, key, onE } from '../../core/hint';
import type { Parts } from '../../core/parts';
import { store } from '../../state';
import { toast } from '../../ui/dom';
import { G, hitBox } from '../../world/tankstelle/kit';
import { nozzle } from '../../world/tankstelle/canopy';
import type { WashCar, WashSign } from '../../world/tankstelle/wash';
import type { Interactable } from '../../world/types';
import { mesh, toon } from '../../world/toon';
import type { Booze } from '../bar/booze';
import type { Caffeine } from '../coffee/caffeine';
import { Gloss } from './gloss';
import { tankShop } from './shop';

declare module '../../world/types' {
  interface InteractKinds {
    fuelpump: true;
    carwash: true;
  }
}

export interface TankstelleDeps {
  booze(): Booze;
  caffeine(): Caffeine;
  reach(): void;
}

/** How long after a wash the sign says the way out is clear (ms). */
const GO_MS = 9000;
/** A car filled this recently isn't offered another fill from behind its wheel (E gets you out instead). */
const FULL_FOR = 60_000;

const euro = (v: number) => v.toFixed(2).replace('.', ',');

export function installTankstelle(ctx: Ctx, parts: Pick<Parts, 'cars' | 'places' | 'peers'>, deps: TankstelleDeps) {
  const { office } = ctx;
  const st = () => office.tankstelle;
  /** Down on your floor's street (not up on the roof, in a place across the street, or between floors). */
  const onStreet = () => ctx.inOffice() && !ctx.upTop() && !ctx.trip() && !parts.places.active();
  const driver = () => parts.cars.driver;
  const shop = tankShop(ctx, { ...deps, onStreet });
  const gloss = new Gloss();

  // ---- What the office says is going on ---------------------------------------------------------------
  const now = () => performance.now();
  const poseOf = (car: number): CarPose | undefined => office.cars.cars[car]?.pose;
  const fillAt = (pump: number) => store.tank.fills.find((f) => f.pump === pump);
  const fillOf = (car: number) => store.tank.fills.find((f) => f.car === car);
  const washing = () => {
    const w = store.tank.wash;
    return w && now() - w.at < WASH_MS ? w : null;
  };
  /** When each car last finished filling here (this page's clock), so it isn't offered again straight away. */
  const filledAt = new Map<number, number>();
  /** When the last wash ended, for the "Ausfahrt frei" sign. */
  let washEnded = -Infinity;
  /** Where each car held at a pump or in the wash stands, so it stays there. */
  const pinned = new Map<number, CarPose>();

  // ---- Using it: from behind the wheel, or standing at the pump or the wash's terminal --------------------
  /** The car standing still beside pump `pump`, if any. */
  const carAtPump = (pump: number) => office.cars.cars.findIndex((v) => Math.abs(v.pose.speed) < STILL && pumpFor(v.pose) === pump);
  const carInBay = () => office.cars.cars.findIndex((v) => Math.abs(v.pose.speed) < STILL && onWashBay(v.pose));

  function fill(pump: number, car: number) {
    if (fillAt(pump)) return toast('⛽ That pump is busy', 'warn');
    if (car < 0) return toast('⛽ Drive a car up beside the pump and stop first', 'warn');
    ctx.net.send({ t: 'tank.fill', pump, car });
  }

  function wash(car: number) {
    if (washing()) return toast('🧽 The car wash is busy: please wait', 'warn');
    if (car < 0) return toast('🧽 Drive into the car wash, onto the marking, and stop first', 'warn');
    ctx.net.send({ t: 'tank.wash', car });
  }

  const pumpIts: Interactable[] = PUMPS.map((p) => ({ kind: 'fuelpump', x: p.x, z: p.z, y: 0, radius: 2.6 }));
  const pumpOf = (it: Interactable) => Math.max(0, pumpIts.indexOf(it));
  const terminal: Interactable = { kind: 'carwash', x: WASH.terminal.x, z: WASH.terminal.z, y: 0, radius: 2.2 };
  ctx.usables.add({ usable: () => (onStreet() && !driver().active ? [...pumpIts, terminal] : []) });
  // Aimed at in first person: the pumps themselves, and the terminal.
  for (const [i, p] of PUMPS.entries()) hitBox(st().group, { minX: p.x - PUMP_HALF.x - 0.15, maxX: p.x + PUMP_HALF.x + 0.15, minZ: p.z - PUMP_HALF.z, maxZ: p.z + PUMP_HALF.z }, 2, pumpIts[i]);
  hitBox(st().group, { minX: WASH.terminal.x - 0.3, maxX: WASH.terminal.x + 0.3, minZ: WASH.terminal.z - 0.25, maxZ: WASH.terminal.z + 0.25 }, 1.5, terminal);

  ctx.interactions.define('fuelpump', {
    reach: 3,
    hint: (it) => {
      const pump = pumpOf(it);
      const f = fillAt(pump);
      const car = carAtPump(pump);
      const title = hintTitle(`⛽ Pump ${PUMPS[pump].n}`);
      if (f) return { k: `pump|${pump}|busy`, parts: [title, aside(`filling the ${CARS[f.car]?.name ?? 'car'}…`)] };
      if (car < 0) return { k: `pump|${pump}|none`, parts: [title, aside('drive a car up beside it and stop')] };
      const p = priceParts(fuelOf(car).price);
      return { k: `pump|${pump}|${car}`, parts: [title, aside(`${CARS[car].name} · ${fuelOf(car).name} ${p.main}${p.nine} €/l`), key('E', 'Fill it up')] };
    },
    use: onE((it) => fill(pumpOf(it), carAtPump(pumpOf(it)))),
  });

  ctx.interactions.define('carwash', {
    reach: 3,
    hint: () => {
      const w = washing();
      const car = carInBay();
      const title = hintTitle('🧽 Car wash');
      if (w) return { k: `wash|busy|${washAt(now() - w.at).phase}`, parts: [title, aside(`${washAt(now() - w.at).name} · please wait`)] };
      if (car < 0) return { k: 'wash|none', parts: [title, aside('drive a car onto the marking inside and stop')] };
      return { k: `wash|${car}`, parts: [title, aside(`${CARS[car].name} on the marking`), key('E', 'Start the programme')] };
    },
    use: onE(() => wash(carInBay())),
  });

  /** What you can do at the station from behind the wheel right now: fill up, wash, or wait for either. */
  function fromTheWheel(): { k: string; parts: (HTMLElement | string)[]; e?: () => void } | null {
    const d = driver();
    const car = d.car;
    if (car === null || !onStreet()) return null;
    const pose = poseOf(car);
    if (!pose) return null;
    const w = washing();
    if (w?.car === car) {
      const m = washAt(now() - w.at);
      const left = Math.ceil((WASH_MS - (now() - w.at)) / 1000);
      return { k: `w|${m.phase}|${left}`, parts: [hintTitle('🧽 Bitte warten'), aside(`${m.name} · ${left} s · stay in the car`)], e: () => toast('🧽 Stay in the car until the light turns green', 'warn') };
    }
    const f = fillOf(car);
    if (f) {
      const l = litersAt(f.liters, now() - f.at);
      return { k: `f|${l.toFixed(1)}`, parts: [hintTitle(`⛽ Filling up`), aside(`${l.toFixed(2).replace('.', ',')} l · ${euro(l * fuelOf(car).price)} €`)], e: () => toast('⛽ Wait for the click: still filling', 'warn') };
    }
    if (Math.abs(pose.speed) >= STILL) return null;
    const pump = pumpFor(pose);
    if (pump !== undefined && now() - (filledAt.get(car) ?? -Infinity) > FULL_FOR && !fillAt(pump)) {
      const p = priceParts(fuelOf(car).price);
      return { k: `p|${pump}`, parts: [hintTitle(`⛽ Pump ${PUMPS[pump].n}`), aside(`${fuelOf(car).name} ${p.main}${p.nine} €/l`), key('E', 'Fill it up'), key('W A S D', 'Drive on')], e: () => fill(pump, car) };
    }
    const shine = store.tank.shine.get(car) ?? 0;
    if (onWashBay(pose) && !w && shine - now() < SHINE_MS - 30_000) {
      return { k: 'b', parts: [hintTitle('🧽 Car wash'), aside('on the marking'), key('E', 'Start the programme'), key('W A S D', 'Drive on')], e: () => wash(car) };
    }
    return null;
  }

  ctx.activities.add({
    id: 'forecourt',
    active: () => !!fromTheWheel(),
    stop: () => {},
    // E fills up, starts the wash, or (while either runs) is held back; everything else goes on to the car.
    key: (e) => {
      if (e.code !== 'KeyE') return false;
      if (!e.repeat) fromTheWheel()?.e?.();
      return true;
    },
    hint: (el) => {
      const hnt = fromTheWheel();
      if (hnt) ctx.hint.draw(el, `forecourt|${hnt.k}`, () => [...hnt.parts, key('H', 'Honk')]);
    },
    hidesHands: true,
  });

  // ---- Each frame: hoses and displays, the wash, the shine, the sounds ------------------------------------
  const hoses = new Map<number, { tube: THREE.Mesh; nozzle: THREE.Group; key: string }>();
  const shown = new Map<number, string>();
  const rubber = toon('#1d1e24');
  let lastFills = new Set<number>();
  let lastWash: number | null = null;
  let wetAt = 0;
  let wetSaid = -Infinity;

  /** The hose out of pump `pump`'s side toward car `car`, its nozzle in the car's filler. */
  function hose(pump: number, car: number, pose: CarPose) {
    const q = PUMPS[pump];
    const view = st().pumps[pump];
    const side = pose.x > q.x ? 1 : -1;
    const fl = fillerOf(pose, pump);
    const k = `${side}|${fl.x.toFixed(2)}|${fl.z.toFixed(2)}`;
    let hs = hoses.get(pump);
    if (hs?.key === k) return;
    if (hs) {
      hs.tube.removeFromParent();
      hs.tube.geometry.dispose();
      hs.nozzle.removeFromParent();
    }
    for (const s of view.sides) s.holstered.visible = s.face !== side;
    const out = view.sides.find((s) => s.face === side)!.outlet;
    const end = new THREE.Vector3(fl.x, G + 0.78, fl.z);
    const mid = out.clone().lerp(end, 0.5);
    mid.y = G + 0.35;
    const curve = new THREE.CatmullRomCurve3([out, out.clone().lerp(mid, 0.5).setY(G + 0.7), mid, end.clone().lerp(mid, 0.3).setY(G + 0.6), end]);
    const tube = mesh(new THREE.TubeGeometry(curve, 24, 0.03, 6), rubber, 0, 0, 0, false);
    const nz = nozzle(end, Math.sign(end.x - out.x) || side, 'filling', fuelOf(car).color);
    nz.rotation.z = 0.5 * side;
    st().group.add(tube, nz);
    hoses.set(pump, { tube, nozzle: nz, key: k });
  }

  function putBack(pump: number) {
    const hs = hoses.get(pump);
    if (hs) {
      hs.tube.removeFromParent();
      hs.tube.geometry.dispose();
      hs.nozzle.removeFromParent();
      hoses.delete(pump);
    }
    for (const s of st().pumps[pump].sides) s.holstered.visible = true;
  }

  ctx.ticks.add('moved', () => {
    // A car held at a pump or in the wash stays where it is, whatever its driver's feet do (the office takes no moves for it either).
    const d = driver();
    const held = new Set<number>([...store.tank.fills.map((f) => f.car), ...(washing() ? [washing()!.car] : [])]);
    for (const car of pinned.keys()) if (!held.has(car)) pinned.delete(car);
    for (const car of held) {
      const pose = poseOf(car);
      if (!pose) continue;
      if (!pinned.has(car)) pinned.set(car, { ...pose, speed: 0, steer: 0 });
      if (d.car === car && d.driving) office.cars.place(car, { ...pinned.get(car)! });
    }
  });

  ctx.ticks.add('world', ({ dt, t }) => {
    const station = st();
    const tnow = now();
    // ---- The pumps ----
    const fills = new Set<number>();
    for (const f of store.tank.fills) {
      const ms = tnow - f.at;
      const pose = poseOf(f.car);
      if (ms >= FILL_MS + 400 || !pose) continue;
      fills.add(f.pump);
      if (!lastFills.has(f.pump)) ctx.sound.tankstelle('nozzle', { x: pose.x, y: ctx.player.street + 0.8, z: pose.z });
      hose(f.pump, f.car, pose);
      const l = litersAt(f.liters, ms);
      const k = l.toFixed(2);
      if (shown.get(f.pump) !== k) {
        shown.set(f.pump, k);
        station.pumps[f.pump].show({ liters: l, euros: l * fuelOf(f.car).price, fuel: fuelOf(f.car) });
      }
    }
    for (const pump of lastFills) {
      if (fills.has(pump)) continue;
      // Done: the click, the nozzle back on its hook, the display keeps the total.
      putBack(pump);
      shown.delete(pump);
      const q = PUMPS[pump];
      ctx.sound.tankstelle('full', { x: q.x, y: ctx.player.street + 1, z: q.z });
    }
    lastFills = fills;
    // ---- The wash ----
    const w = washing();
    let m: WashMoment | null = null;
    let car: WashCar | null = null;
    if (w) {
      m = washAt(tnow - w.at);
      const v = office.cars.cars[w.car];
      if (v) car = { pose: v.pose, ...heightOf(w.car), van: CARS[w.car]?.kind === 'bulli', occupied: v.occupied };
      if (lastWash !== w.car) ctx.sound.tankstelle('chime', { x: WASH.lane, y: ctx.player.street + 3, z: WASH.bay.z });
    } else if (lastWash !== null) {
      washEnded = tnow;
      ctx.sound.tankstelle('chime', { x: WASH.lane, y: ctx.player.street + 3, z: WASH.bay.z });
      if (store.carOf(store.you)?.car === lastWash) toast(`✨ Spotless! The ${CARS[lastWash]?.name ?? 'car'} is shining. Ausfahrt frei: drive out the north door`, 'info');
    }
    lastWash = w?.car ?? null;
    const sign: WashSign = w ? 'wait' : tnow - washEnded < GO_MS ? 'go' : 'idle';
    station.wash.update(Math.min(dt, 0.1), t, m, car, sign);
    // Anyone standing in the wash while it sprays gets soaked (they're never shut in: nothing there holds them).
    const spraying = !!m && m.phase !== 'done';
    if (spraying && onStreet() && tnow - wetAt > 220) {
      wetAt = tnow;
      const me = ctx.player.pos;
      if (!driver().active && inWashHall(me.x, me.z) && Math.abs(me.y - ctx.player.street) < 2) {
        station.wash.fx.splash(me.x, G, me.z);
        if (tnow - wetSaid > 12_000) {
          wetSaid = tnow;
          ctx.sound.tankstelle('drip', { x: me.x, y: me.y + 1.5, z: me.z });
          ctx.me.say('💦 Klatschnass!', 2.5);
          toast('💦 You walked into the car wash mid-programme: soaked to the skin!', 'info');
        }
      }
      for (const [id, r] of parts.peers.remotes) {
        const p = r.person.root.position;
        if (inWashHall(p.x, p.z) && Math.abs(p.y - ctx.player.street) < 2 && !store.carOf(id)) station.wash.fx.splash(p.x, G, p.z, 8);
      }
    }
    // ---- The shine ----
    const shiny = new Set<number>();
    for (const [c, until] of store.tank.shine) if (until > tnow) shiny.add(c);
    gloss.update(office.cars.cars, shiny, t);
    // ---- The sounds ----
    const street = ctx.player.street;
    ctx.sound.setStation(
      onStreet()
        ? {
            pumps: [...fills].map((p) => ({ x: PUMPS[p].x, y: street + 1, z: PUMPS[p].z })),
            wash: spraying ? { at: { x: WASH.lane, y: street + 2, z: car?.pose.z ?? WASH.bay.z }, water: m!.phase === 'prewash' || m!.phase === 'rinse' ? 1 : m!.phase === 'foam' ? 0.6 : m!.phase === 'brush' ? 0.35 : 0, brush: m!.phase === 'brush' ? 1 : 0, dryer: m!.phase === 'dry' ? 1 : 0 } : null,
          }
        : { pumps: [], wash: null },
    );
    for (const it of [...pumpIts, terminal]) it.y = street;
  });

  ctx.messages.on('tankstelle', () => {
    // A fill of yours that's done: what it came to.
    for (const f of store.tank.fills) filledAt.set(f.car, now() + FILL_MS - (now() - f.at));
    ctx.hint.invalidate();
  });
  // Someone else's fill ending says nothing; yours gets the bill (on the house).
  let mine = new Map<number, { car: number; liters: number }>();
  ctx.messages.on('tankstelle', () => {
    const next = new Map(store.tank.fills.filter((f) => f.by === store.you).map((f) => [f.pump, { car: f.car, liters: f.liters }]));
    for (const [pump, f] of mine) {
      if (next.has(pump)) continue;
      toast(`⛽ Full! ${f.liters.toFixed(2).replace('.', ',')} l ${fuelOf(f.car).name} for ${euro(f.liters * fuelOf(f.car).price)} €. On the house. Gute Fahrt!`, 'info');
    }
    mine = next;
  });

  return {
    shop,
    gloss,
    /** For screenshots and the console: start a fill or a wash as if E were pressed. */
    fill,
    wash,
  };
}
