/**
 * flrnoh fork (see FORK.md "A day at the beach"): Sunset Beach on the scenic loop, for playing. The
 * snack shack is open (kiosk.ts), the volleyball court is for playing on (volley.ts), the sea is for
 * swimming (swim.ts: walk in off the sand, or jump off the jetty, and back up its ladder), and the
 * jetskis and the motorboat at the jetty go out on it (boats.ts). Everyone on the floor sees it all: swimmers from where they are, the boats from the office.
 */
import { CRAFTS, CRAFT_SPECS } from '../../../shared/boats';
import { SEA_LEVEL, SWIM_SINK, inSea, swimmingAt, wadingAt } from '../../../shared/beach';
import { PLACES, placeAt } from '../../../shared/scenic';
import type { Ctx } from '../../core/context';
import { aside, key } from '../../core/hint';
import type { Parts } from '../../core/parts';
import { store } from '../../state';
import { h } from '../../ui/dom';
import type { Person } from '../../world/character';
import type { Booze } from '../bar/booze';
import { jettyBoats } from './boats';
import { SeaFx } from './fx';
import { beachKiosk } from './kiosk';
import { ridePose, seaPose } from './poses';
import { Sea } from './swim';
import { beachVolley } from './volley';

export interface BeachDeps {
  booze(): Booze;
  reach(): void;
  /** Up off whatever you're sitting on. */
  standUp(): void;
  /** Stops a walk over to someone. */
  stopWalking(): void;
}

export function installBeach(ctx: Ctx, parts: Pick<Parts, 'places' | 'peers'>, deps: BeachDeps) {
  const fx = new SeaFx();
  ctx.scene.add(fx.group);
  /** Down on your floor's street, where the beach is (not up on the roof, in a place across the street, or between floors). */
  const onStreet = () => ctx.inOffice() && !ctx.upTop() && !ctx.trip() && !parts.places.active();
  const water = () => ctx.player.street + SEA_LEVEL;

  const kiosk = beachKiosk(ctx, { booze: deps.booze, reach: deps.reach, onStreet });
  const volley = beachVolley(ctx, { reach: deps.reach, onStreet });

  // ---- Swimming ---------------------------------------------------------------------------------
  const sea = new Sea(ctx.player, {
    stroke: (at) => {
      ctx.sound.beach('stroke', { x: at.x, y: water(), z: at.z });
      fx.ring(at.x, water(), at.z, 1.4, 1.3);
    },
    out: (how) => {
      if (how === 'ladder') ctx.sound.beach('ladder', { x: ctx.player.pos.x, y: water() + 0.5, z: ctx.player.pos.z });
      ctx.hint.invalidate();
    },
  });

  function splashAt(x: number, z: number, strength: number) {
    ctx.sound.beach('splash', { x, y: water(), z }, strength);
    fx.splash(x, water(), z, strength);
  }

  /** Into the water off the side of a craft (boats.ts). */
  function swimFrom(x: number, z: number) {
    sea.enter(ctx.player.street, 0.5);
    splashAt(x, z, 0.5);
  }

  const boats = jettyBoats(ctx, { fx, onStreet, free: () => (deps.standUp(), deps.stopWalking()), swimFrom, outOfWater: () => sea.leave() });

  ctx.activities.add({
    id: 'swimmer',
    active: () => sea.active,
    // Walking over to someone (or to something) leaves you to it; everything else lifts you out where you are.
    stop: (why) => {
      if (why !== 'walk' && why !== 'errand') sea.leave();
    },
    key: (e) => {
      if (e.code === 'KeyE' && sea.atLadder) {
        if (!e.repeat) sea.climbOut();
        return true;
      }
      if (e.code === 'Space' && sea.swimming) {
        if (!e.repeat) splashAt(ctx.player.pos.x, ctx.player.pos.z, 0.35);
        return true;
      }
      return false;
    },
    hint: (el) => {
      const swim = sea.swimming;
      const ladder = sea.atLadder;
      const p = ctx.player.pos;
      const place = placeAt(p.x, p.z);
      const where = place ? `${PLACES[place].icon} ${PLACES[place].name}` : 'the sea';
      ctx.hint.draw(el, `sea|${swim}|${ladder}|${where}`, () => [
        h('span.title', {}, swim ? '🏊 Swimming' : '🌊 Wading'),
        aside(swim ? `${where} · stay inside the buoys` : `${where} · deeper out there`),
        key('W A S D', swim ? 'Swim' : 'Wade'),
        key('Shift', 'Faster'),
        ...(swim ? [key('Space', 'Splash')] : []),
        ...(ladder ? [key('E', 'Climb out')] : []),
      ]);
    },
    hidesHands: true,
  });

  /** How high you've been since you were last on your feet: how hard you go into the water. */
  let peak = 0;
  let ringT = 0;
  ctx.ticks.add('moved', ({ dt }) => {
    const p = ctx.player;
    fx.update(dt);
    if (sea.active) {
      sea.setStreet(p.street);
      if (sea.swimming && !p.moving) {
        ringT += dt;
        if (ringT > 1.1) {
          ringT = 0;
          fx.ring(p.pos.x, water(), p.pos.z, 0.9, 1.6);
        }
      }
      return;
    }
    if (!onStreet() || p.rig || p.seat) {
      peak = p.pos.y;
      return;
    }
    if (!p.grounded) {
      peak = Math.max(peak, p.pos.y);
      return;
    }
    if (inSea(p.pos.x, p.pos.z) && p.pos.y <= p.street + 0.05) {
      // Off the jetty (or the board) into the water: a splash as big as the drop.
      const jump = Math.min(1, Math.max(0, (peak - p.street) / 1.8));
      sea.enter(p.street, jump > 0.12 ? jump : 0);
      if (jump > 0.12) splashAt(p.pos.x, p.pos.z, jump);
      ctx.hint.invalidate();
    }
    peak = p.pos.y;
  });

  // ---- How everyone looks: in the sea or aboard ----------------------------------------------------
  /** What each body is posed as now (a pose laid over it by setWorkout), by peer id ('' is you). */
  const posed = new Map<string, { person: Person; kind: 'sea' | 'ride'; depth: number; moving: boolean; hips: number; astride: boolean; driving: boolean; lean: number; phase: number }>();
  /** Where each of them was last frame, for a splash as they go in. */
  const was = new Map<string, { y: number; wet: boolean; ringT: number }>();

  function pose(id: string, person: Person, kind: 'sea' | 'ride' | null, fill: Partial<NonNullable<ReturnType<typeof posed.get>>> = {}) {
    const cur = posed.get(id);
    if (!kind) {
      if (cur) {
        cur.person.setWorkout(null);
        posed.delete(id);
      }
      return;
    }
    if (!cur || cur.person !== person || cur.kind !== kind) {
      cur?.person.setWorkout(null);
      const st = { person, kind, depth: 0, moving: false, hips: 0.4, astride: false, driving: false, lean: 0, phase: id.length * 0.7 + (id.charCodeAt(0) || 0) * 0.13, ...fill };
      posed.set(id, st);
      person.setWorkout((b, _dt, t) => (st.kind === 'sea' ? seaPose(b, st.depth, st.moving, t, st.phase) : ridePose(b, st.hips, st.astride, st.driving, st.lean)));
      return;
    }
    Object.assign(cur, fill);
  }

  ctx.ticks.add('others', ({ dt }) => {
    const street = ctx.player.street;
    const here = onStreet();
    // You.
    const me = ctx.me;
    if (here && boats.helm.active) {
      const i = boats.helm.craft!;
      const seat = CRAFT_SPECS[CRAFTS[i].kind].seats[boats.helm.seat!];
      pose('', me, 'ride', { hips: seat.hips, astride: !!seat.astride, driving: boats.helm.driving, lean: Math.min(1, Math.abs(boats.fleet.crafts[i].pose.speed) / 12) });
    } else if (here && sea.active) pose('', me, 'sea', { depth: sea.depth, moving: ctx.player.moving });
    else pose('', me, null);
    // Everyone else on the floor.
    const remotes = parts.peers.remotes;
    for (const [id, r] of remotes) {
      const p = store.peers.get(id);
      if (!p || !here) {
        pose(id, r.person, null);
        continue;
      }
      const aboard = store.boatOf(id);
      const at = aboard && boats.fleet.seatAt(aboard.craft, aboard.seat);
      if (aboard && at) {
        // Right in their seat as it goes, whatever their last `move` said.
        r.person.root.position.set(at.x, at.y, at.z);
        r.person.root.rotation.y = at.rotY;
        const seat = CRAFT_SPECS[CRAFTS[aboard.craft].kind].seats[aboard.seat];
        pose(id, r.person, 'ride', { hips: seat.hips, astride: !!seat.astride, driving: aboard.seat === 0, lean: Math.min(1, Math.abs(boats.fleet.crafts[aboard.craft].pose.speed) / 12) });
        was.delete(id);
        continue;
      }
      const wet = wadingAt(p.x, p.y, p.z, street);
      if (wet) pose(id, r.person, 'sea', { depth: Math.min(SWIM_SINK, street - p.y), moving: p.moving });
      else pose(id, r.person, null);
      // A splash as they go in from up on the jetty; rings round them while they swim.
      const last = was.get(id) ?? { y: p.y, wet, ringT: 0 };
      if (wet && !last.wet && last.y > street + 0.2) splashAt(p.x, p.z, Math.min(1, (last.y - street) / 1.8));
      last.ringT += dt;
      if (swimmingAt(p.x, p.y, p.z, street) && last.ringT > (p.moving ? 0.7 : 1.2)) {
        last.ringT = 0;
        fx.ring(r.person.root.position.x, water(), r.person.root.position.z, p.moving ? 1.3 : 0.9, 1.5);
      }
      was.set(id, { y: p.y, wet, ringT: last.ringT });
    }
    for (const id of [...posed.keys()]) if (id && !remotes.has(id)) posed.delete(id);
    for (const id of [...was.keys()]) if (!remotes.has(id)) was.delete(id);
  });

  return { kiosk, sea, boats, fx, volley };
}
