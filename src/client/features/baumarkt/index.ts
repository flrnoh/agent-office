/**
 * flrnoh fork (see FORK.md "The Baumarkt"): HAMMER & CO, the DIY store on its block north-east of the
 * office (world/baumarkt/ builds it). Walk in through the sliding doors: drive the forklift and move the
 * pallets (forklift.ts), push a trolley about (trolley.ts), take a tool off the tool wall or a can from
 * the paint shaker (held.ts), say hello to Gabi and Kalle (npcs.ts), and listen out for the PA. What
 * moves is everyone's on the floor: the office keeps the forklift, the pallets, the trolleys and who
 * holds what (server/baumarkt.ts).
 */
import { DOORS, LIFT_RATE, announcementIn, forkMid, type BaumarktState } from '../../../shared/baumarkt-play';
import * as THREE from 'three';
import { HALL, HALL_H, INSIDE, inHall, localPoint, onBaumarkt } from '../../../shared/baumarkt';
import type { Ctx } from '../../core/context';
import type { Parts } from '../../core/parts';
import { store } from '../../state';
import { toast } from '../../ui/dom';
import type { Person } from '../../world/character';
import { ridePose } from '../beach/poses';
import { forkliftDriving } from './forklift';
import { heldThings } from './held';
import { baumarktStaff } from './npcs';
import { trolleyPushing } from './trolley';

export interface BaumarktDeps {
  /** Up off whatever you're sitting on. */
  standUp(): void;
  /** Stops a walk over to someone. */
  stopWalking(): void;
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
/** How close the doors notice someone coming (m). */
const DOOR_NEAR = 3.2;

export function installBaumarkt(ctx: Ctx, parts: Pick<Parts, 'places' | 'peers'>, deps: BaumarktDeps) {
  /** Down on your floor's street (not up on the roof, in a place across the street, or between floors). */
  const onStreet = () => ctx.inOffice() && !ctx.upTop() && !ctx.trip() && !parts.places.active();
  const world = () => ctx.office.baumarkt;

  const trolleys = trolleyPushing(ctx, { onStreet });
  const fork = forkliftDriving(ctx, { onStreet, free: () => (deps.standUp(), deps.stopWalking()), letGo: () => trolleys.letGo() });
  const held = heldThings(ctx, { onStreet, remotes: () => parts.peers.remotes, shaker: () => world() ?? null });
  const staff = baumarktStaff(ctx, { onStreet, group: () => world()?.group ?? null });

  /** What the crosshair lands on in first person: the hall's pick boxes (world/baumarkt), each with what it's for. */
  function wirePicks(w: NonNullable<ReturnType<typeof world>>) {
    if (w.picks.toolwall.userData.interact) return;
    w.picks.toolwall.userData.interact = held.interactables.wall;
    w.picks.mixer.userData.interact = held.interactables.mixer;
    w.picks.till.userData.interact = staff.till;
    w.picks.forklift.userData.interact = fork.interactable;
    w.picks.trolleys.forEach((m, i) => (m.userData.interact = trolleys.interactables[i]));
  }

  // ---- Everything that moves, where the office (or you, driving) has it --------------------------
  /** What's drawn: eased toward where the office last said, so others' moves glide. */
  const shown = { x: 0, z: 0, rotY: 0, lift: 0, speed: 0, ready: false };
  const shownTrolleys: { x: number; z: number; rotY: number; rolled: number }[] = [];
  const drawn: BaumarktState = { fork: { ...store.baumarkt.fork }, pallets: [], trolleys: [], held: {} };
  let doors = 0;
  let beepT = 0;
  let wheelRoll = 0;
  let lastAnnounced = 0;
  const posed = new Map<string, Person>();

  function pose(id: string, person: Person | null, sitting: boolean) {
    const cur = posed.get(id);
    if (!sitting || !person) {
      if (cur) {
        cur.setWorkout(null);
        posed.delete(id);
      }
      return;
    }
    if (cur === person) return;
    cur?.setWorkout(null);
    posed.set(id, person);
    // On the seat, hands on the wheel (the beach's way of sitting in a boat).
    person.setWorkout((b) => ridePose(b, 0.85, false, true, 0));
  }

  ctx.ticks.add('world', ({ dt, t }) => {
    const w = world();
    if (!w) return;
    wirePicks(w);
    const here = onStreet();
    w.light(ctx.sky.lampsOn);
    if (!here) {
      ctx.sound.setForklift(null);
      return;
    }
    const s = store.baumarkt;
    const street = ctx.player.street;
    // The forklift: yours as you drive it, else eased toward the office's.
    const mine = fork.mine();
    const f = s.fork;
    const before = shown.lift;
    if (mine) Object.assign(shown, { x: mine.x, z: mine.z, rotY: mine.rotY, lift: mine.lift, speed: mine.speed });
    else if (!shown.ready || Math.hypot(f.x - shown.x, f.z - shown.z) > 6) Object.assign(shown, { x: f.x, z: f.z, rotY: f.rotY, lift: f.lift, speed: f.speed });
    else {
      const k = Math.min(1, dt * 12);
      shown.x += (f.x - shown.x) * k;
      shown.z += (f.z - shown.z) * k;
      shown.rotY += wrap(f.rotY - shown.rotY) * k;
      shown.lift += (f.lift - shown.lift) * k;
      shown.speed = f.speed;
    }
    shown.ready = true;
    const lifting = mine ? fork.lifting() : Math.min(1, Math.abs(shown.lift - before) / Math.max(dt, 1e-3) / LIFT_RATE);
    // The pallets, the one on the forks riding on the forks as they're drawn.
    const onForks = mine ? fork.carrying() : f.carrying;
    drawn.pallets = s.pallets.map((p, i) => (i === onForks ? { ...forkMid(shown), y: shown.lift } : p));
    // The trolleys, eased the same way (yours exactly where you push it).
    s.trolleys.forEach((tr, i) => {
      const d = (shownTrolleys[i] ??= { x: tr.x, z: tr.z, rotY: tr.rotY, rolled: 0 });
      const k = trolleys.pushing() === i || Math.hypot(tr.x - d.x, tr.z - d.z) > 5 ? 1 : Math.min(1, dt * 10);
      const ox = d.x;
      const oz = d.z;
      d.x += (tr.x - d.x) * k;
      d.z += (tr.z - d.z) * k;
      d.rotY += wrap(tr.rotY - d.rotY) * k;
      const moved = Math.hypot(d.x - ox, d.z - oz);
      const m = w.trolleys[i];
      if (m && moved > 0) for (const wheel of m.wheels) wheel.rotation.x += moved / 0.05;
      d.rolled += moved;
      if (d.rolled > 0.9) {
        d.rolled = 0;
        if (Math.hypot(d.x - ctx.player.pos.x, d.z - ctx.player.pos.z) < 25) ctx.sound.baumarkt('rattle', { x: d.x, y: street + 0.6, z: d.z }, 0.6);
      }
    });
    drawn.trolleys = shownTrolleys.map((d, i) => ({ x: d.x, z: d.z, rotY: d.rotY, by: s.trolleys[i]?.by ?? null }));
    w.place(drawn, shown);
    // Its wheels roll, its rear wheels steer, its beacon turns while someone's on it.
    wheelRoll += (shown.speed * dt) / 0.25;
    for (const wh of w.forklift.wheels) wh.rotation.x = wheelRoll;
    const steer = mine ? mine.steer : f.steer;
    for (const p of w.forklift.steerWheels) p.rotation.y = -steer;
    const driven = !!f.driver || !!mine;
    w.forklift.beacon.emissiveIntensity = driven ? 0.6 + 0.4 * Math.sin(t * 9) : 0;
    Object.assign(fork.interactable, { ...localPoint(shown, 0, -0.45), y: street });
    // Its motor and hydraulics, and the beep backing up.
    const near = Math.hypot(shown.x - ctx.player.pos.x, shown.z - ctx.player.pos.z) < 60;
    ctx.sound.setForklift(driven && near ? { at: { x: shown.x, y: street + 1, z: shown.z }, speed: shown.speed, lifting } : null);
    if (driven && near && shown.speed < -0.15) {
      beepT -= dt;
      if (beepT <= 0) {
        beepT = 0.55;
        ctx.sound.baumarkt('beep', { x: shown.x, y: street + 2, z: shown.z });
      }
    } else beepT = 0;
    // The driver in the seat: you, or whoever it is, wherever it's got to.
    pose('', ctx.me, !!mine);
    for (const [id, r] of parts.peers.remotes) {
      const driving = f.driver === id && !mine;
      if (driving) {
        const seat = localPoint(shown, 0, -0.45);
        r.person.root.position.set(seat.x, street + 0.3, seat.z);
        r.person.root.rotation.y = shown.rotY;
      }
      pose(id, r.person, driving);
    }
    for (const id of [...posed.keys()]) if (id && !parts.peers.remotes.has(id)) posed.delete(id);
    // The sliding doors, open while anyone's near.
    const kalle = staff.kalle();
    const bodies = [ctx.player.pos, ...[...parts.peers.remotes.values()].map((r) => r.person.root.position), ...(kalle ? [kalle.root.position] : [])];
    const door = DOORS[0];
    const someone = bodies.some((b) => Math.abs(b.x - door.x) < door.width / 2 + 1.2 && Math.abs(b.z - door.z) < DOOR_NEAR);
    const was = doors;
    doors = Math.min(1, Math.max(0, doors + (someone ? dt * 2.2 : -dt * 1.4)));
    if (was === 0 && doors > 0) ctx.sound.baumarkt('door', { x: door.x, y: street + 2.5, z: door.z });
    w.doors(doors);
  });

  // ---- In third person inside the hall, the camera stays inside too, under the roof ------------------
  const lookAt = new THREE.Vector3();
  ctx.ticks.add('moved', () => {
    const p = ctx.player;
    if (p.view === 'first' || !onStreet() || !inHall(p.pos.x, p.pos.z, -0.2) || p.pos.y > p.street + 2) return;
    const cam = ctx.camera.position;
    const m = 0.45;
    const x = Math.min(INSIDE.maxX - m, Math.max(INSIDE.minX + m, cam.x));
    const z = Math.min(INSIDE.maxZ - m, Math.max(INSIDE.minZ + m, cam.z));
    const y = Math.min(p.street + HALL_H - 0.6, cam.y);
    if (x === cam.x && z === cam.z && y === cam.y) return;
    cam.set(x, y, z);
    ctx.camera.lookAt(lookAt.set(p.pos.x, p.pos.y + 1.3, p.pos.z));
  });

  // ---- The PA: now and then, a ding-dong and an announcement, the same for everyone in there --------
  ctx.ticks.add('hud', () => {
    if (!onStreet()) return;
    const now = store.officeNow();
    const a = announcementIn(now);
    if (now < a.at || now > a.at + 5000 || lastAnnounced === a.at) return;
    lastAnnounced = a.at;
    const p = ctx.player.pos;
    if (!onBaumarkt(p.x, p.z, 4)) return;
    ctx.sound.baumarkt('chime', { x: (HALL.minX + HALL.maxX) / 2, y: ctx.player.street + 6, z: (HALL.minZ + HALL.maxZ) / 2 });
    window.setTimeout(() => toast(`📢 „${a.text}“`), 1300);
  });

  const api = { fork, trolleys, held, staff, shown, world };
  (window as unknown as { __baumarkt: typeof api }).__baumarkt = api; // for quick checks and screenshots
  return api;
}
