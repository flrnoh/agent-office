/**
 * flrnoh fork (see FORK.md "Pool party on the roof"): a pool on the roof, for an afterwork pool party.
 * It's put on the roof the first time the roof's built (world.ts), with its deck, its steps and what's
 * on it in the roof's way; jump in off the deck (or E there for a cannonball), swim, E at a wall to climb
 * out. Everyone up there sees who's swimming from where they are, posed as in the sea, with a splash as
 * they go in; the floats drift where the office's clock says, the same on every page.
 */
import { DIVE, POOL, POOL_DECK, SLIDE, inPoolAt, overPool, slideAt, slidingAt } from '../../../shared/roofpool';
import type { Ctx } from '../../core/context';
import { aside, hintTitle, key } from '../../core/hint';
import { store } from '../../state';
import { h } from '../../ui/dom';
import type { Person } from '../../world/character';
import type { Interactable } from '../../world/types';
import { SeaFx } from '../beach/fx';
import { ridePose, seaPose } from '../beach/poses';
import { SlideRide } from './slide';
import { DiveClimb } from './dive';
import type { Rooftop } from '../rooftop/world';
import { PoolSwim } from './swim';
import { buildRoofPool, type RoofPool } from './world';

declare module '../../world/types' {
  interface InteractKinds {
    pool: true;
    slide: true;
    dive: true;
  }
}

export interface RoofPoolDeps {
  /** The roof, once it's built (see features/rooftop). */
  roof(): Rooftop | null;
  /** The people up here with you, by id (see features/peers). */
  remotes(): ReadonlyMap<string, { person: Person }>;
}

export function installRoofPool(ctx: Ctx, deps: RoofPoolDeps) {
  const fx = new SeaFx();
  ctx.scene.add(fx.group);
  let pool: RoofPool | null = null;
  let on: Rooftop | null = null;
  const splash = (x: number, z: number, strength: number) => {
    ctx.sound.beach('splash', { x, y: POOL.surface, z }, strength);
    fx.splash(x, POOL.surface, z, strength);
  };

  /** On the roof the first time it's there: the pool and what it puts in the roof's way. */
  const placed = (): RoofPool | null => {
    const roof = deps.roof();
    if (!roof) return null;
    if (on !== roof) {
      on = roof;
      pool = buildRoofPool(ctx.office.night);
      roof.group.add(pool.group);
      roof.pickables.push(pool.group); // what the pointer's ray looks at up here
      roof.colliders.push(...pool.colliders);
      const it: Interactable = { kind: 'pool', x: (POOL.minX + POOL.maxX) / 2, z: (POOL.minZ + POOL.maxZ) / 2, y: POOL_DECK.top, radius: 4.2 };
      const ladder: Interactable = { kind: 'slide', x: SLIDE.foot.x, z: SLIDE.foot.z, y: POOL_DECK.top, radius: 1.3 };
      const diveUp: Interactable = { kind: 'dive', x: DIVE.foot.x, z: DIVE.foot.z, y: POOL_DECK.top, radius: 1.3 };
      const diveDown: Interactable = { kind: 'dive', x: DIVE.up.x, z: DIVE.up.z, y: DIVE.top, radius: 1.0 };
      roof.interactables.push(ladder, diveUp, diveDown, it);
      pool.diving.userData.interact = diveUp;
      // Looking at the water or the slide is looking at them (the pointer's ray: input/pointer.ts).
      pool.surface.userData.interact = it;
      pool.tower.userData.interact = ladder;
    }
    return pool;
  };

  const swim = new PoolSwim(ctx.player, {
    stroke: (at) => {
      ctx.sound.beach('stroke', { x: at.x, y: POOL.surface, z: at.z });
      fx.ring(at.x, POOL.surface, at.z, 1.1, 1.3);
    },
    out: () => {
      ctx.sound.beach('ladder', { x: ctx.player.pos.x, y: POOL_DECK.top, z: ctx.player.pos.z });
      ctx.hint.invalidate();
    },
  });

  // The water slide: E at the foot of its ladder, up and down into the pool.
  const ride = new SlideRide(ctx.player, {
    whoosh: () => ctx.sound.beach('ladder', { x: SLIDE.x, y: SLIDE.top, z: SLIDE.z }),
    splashDown: () => {
      swim.enter(1);
      splash(ctx.player.pos.x, ctx.player.pos.z, 1);
      ctx.hint.invalidate();
    },
  });
  ctx.interactions.define('slide', {
    reach: 1.8,
    hint: () => (ride.active || swim.active ? { k: '', parts: [] } : { k: 'slide', parts: [hintTitle('🛝 Water slide'), aside('Once round and into the pool'), key('E', 'Climb up and slide')] }),
    use: (_it, k) => {
      if (k === 'E' && !ride.active && !swim.active) ride.start();
    },
  });
  ctx.activities.add({
    id: 'slide',
    active: () => ride.active,
    stop: (why) => {
      if (why !== 'walk' && why !== 'errand') ride.stop();
    },
    key: () => true,
    hint: (el) => ctx.hint.draw(el, `slide|${ride.phase}`, () => [h('span.title', {}, ride.phase === 'climb' ? '🪜 Up the ladder' : '🛝 Wheee!'), aside('into the pool')]),
    hidesHands: true,
  });

  // The diving tower: E at its ladder climbs up, E by the ladder up top climbs back down; off the board is the way in.
  const climb = new DiveClimb(ctx.player);
  const upTop = () => ctx.player.pos.y > DIVE.top - 0.3;
  ctx.interactions.define('dive', {
    reach: 1.8,
    hint: () =>
      climb.active || swim.active
        ? { k: '', parts: [] }
        : upTop()
          ? { k: 'dive-down', parts: [hintTitle('🤿 Diving tower'), aside('3.5 m: off the board into the pool'), key('E', 'Climb down')] }
          : { k: 'dive-up', parts: [hintTitle('🤿 Diving tower'), aside('3.5 m over the water'), key('E', 'Climb up')] },
    use: (_it, k) => {
      if (k === 'E' && !climb.active && !swim.active) climb.start(!upTop());
    },
  });
  ctx.activities.add({
    id: 'dive',
    active: () => climb.active,
    stop: (why) => {
      if (why !== 'walk' && why !== 'errand') climb.stop();
    },
    key: () => true,
    hint: (el) => ctx.hint.draw(el, 'dive', () => [h('span.title', {}, '🪜 On the ladder'), aside('the diving tower')]),
    hidesHands: true,
  });

  // E on the deck: a cannonball into the middle of it.
  ctx.interactions.define('pool', {
    reach: 4.6,
    hint: () => {
      const y = ctx.player.pos.y;
      const up = y > POOL_DECK.top - 0.2 && y < POOL_DECK.top + 0.5 && !swim.active; // on the deck (not up the diving tower)
      return up ? { k: 'pool', parts: [hintTitle('🏊 Pool'), aside('Pool party on the roof'), key('E', 'Cannonball!')] } : { k: '', parts: [] };
    },
    use: (_it, k) => {
      const p = ctx.player;
      if (k !== 'E' || swim.active || p.pos.y < POOL_DECK.top - 0.2 || p.pos.y > POOL_DECK.top + 0.5) return;
      // Up and out over the water toward its middle.
      const x = Math.min(POOL.maxX - 1, Math.max(POOL.minX + 1, p.pos.x));
      const z = Math.min(POOL.maxZ - 1, Math.max(POOL.minZ + 1, p.pos.z));
      p.stopWalking();
      p.pos.set(x, POOL_DECK.top + 0.9, z);
      p.vy = 3.5;
      p.grounded = false;
    },
  });

  ctx.activities.add({
    id: 'pool',
    active: () => swim.active,
    stop: (why) => {
      if (why !== 'walk' && why !== 'errand') swim.leave();
    },
    key: (e) => {
      if (e.code === 'KeyE' && swim.atEdge) {
        if (!e.repeat) swim.climbOut();
        return true;
      }
      if (e.code === 'Space') {
        if (!e.repeat) splash(ctx.player.pos.x, ctx.player.pos.z, 0.4);
        return true;
      }
      return false;
    },
    hint: (el) => {
      const edge = swim.atEdge;
      ctx.hint.draw(el, `pool|${edge}`, () => [h('span.title', {}, '🏊 Pool party'), aside('on the roof'), key('W A S D', 'Swim'), key('Shift', 'Faster'), key('Space', 'Splash'), ...(edge ? [key('E', 'Climb out')] : [])]);
    },
    hidesHands: true,
  });

  /** How high you've been since you were last on your feet: how hard you go in. */
  let peak = 0;
  ctx.ticks.add('moved', ({ dt }) => {
    fx.update(dt);
    const p = ctx.player;
    if (!ctx.upTop()) {
      if (swim.active) swim.leave();
      if (ride.active) ride.stop();
      if (climb.active) climb.stop();
      return;
    }
    placed();
    if (swim.active || ride.active || climb.active) return;
    if (p.rig || p.seat) {
      peak = p.pos.y;
      return;
    }
    peak = Math.max(peak, p.pos.y);
    if (overPool(p.pos.x, p.pos.z, 0.2) && p.pos.y < POOL.surface) {
      const jump = Math.min(1, Math.max(0, (peak - POOL.surface) / 2));
      swim.enter(jump);
      splash(p.pos.x, p.pos.z, 0.35 + 0.65 * jump);
      ctx.hint.invalidate();
      peak = p.pos.y;
      return;
    }
    if (p.grounded) peak = p.pos.y;
  });

  // ---- How everyone looks in the water --------------------------------------------------------------
  const posed = new Map<string, { person: Person; moving: boolean; phase: number }>();
  const was = new Map<string, { y: number; wet: boolean; ringT: number }>();
  const pose = (id: string, person: Person, wet: boolean, moving: boolean) => {
    const cur = posed.get(id);
    if (!wet) {
      if (cur) {
        cur.person.setWorkout(null);
        posed.delete(id);
      }
      return;
    }
    if (cur && cur.person === person) {
      cur.moving = moving;
      return;
    }
    cur?.person.setWorkout(null);
    const st = { person, moving, phase: id.length * 0.7 + (id.charCodeAt(0) || 0) * 0.13 };
    posed.set(id, st);
    person.setWorkout((b, _dt, t) => seaPose(b, 1.25, st.moving, t, st.phase));
  };

  /** Who's sat in the slide's tube on the way down, posed sitting with their arms up. */
  const sitting = new Map<string, Person>();
  const sit = (id: string, person: Person, on: boolean) => {
    const cur = sitting.get(id);
    if (!on) {
      if (cur) {
        cur.setWorkout(null);
        sitting.delete(id);
      }
      return;
    }
    if (cur === person) return;
    cur?.setWorkout(null);
    sitting.set(id, person);
    person.setWorkout((b) => {
      ridePose(b, 0.12, false, false, 0);
      b.armR.rotation.set(-2.9, 0, -0.3);
      b.armL.rotation.set(-2.9, 0, 0.3);
    });
  };

  ctx.ticks.add('others', ({ dt }) => {
    const up = ctx.upTop();
    const now = store.officeNow() / 1000;
    // The floats keep clear of you swimming, and of where you'll come down off the slide.
    const clear = swim.active ? ctx.player.pos : ride.active ? slideAt(1) : null;
    if (up && pool) pool.update(now, ctx.sky.lampsOn, clear);
    pose('', ctx.me, up && swim.active, ctx.player.moving);
    sit('', ctx.me, up && ride.active && ride.phase === 'slide');
    const remotes = deps.remotes();
    for (const [id, r] of remotes) {
      const p = store.peers.get(id);
      const wet = !!p && up && inPoolAt(p.x, p.y, p.z);
      pose(id, r.person, wet, !!p?.moving);
      sit(id, r.person, !!p && up && !wet && slidingAt(p.x, p.y, p.z));
      if (!p || !up) continue;
      // A splash as they go in from up on the deck; rings round them while they swim.
      const last = was.get(id) ?? { y: p.y, wet, ringT: 0 };
      if (wet && !last.wet) splash(p.x, p.z, Math.min(1, Math.max(0.3, (last.y - POOL.surface) / 2)));
      last.ringT += dt;
      if (wet && last.ringT > (p.moving ? 0.7 : 1.2)) {
        last.ringT = 0;
        fx.ring(p.x, POOL.surface, p.z, p.moving ? 1.2 : 0.8, 1.4);
      }
      was.set(id, { y: p.y, wet, ringT: last.ringT });
    }
    for (const id of [...posed.keys()]) if (id && !remotes.has(id)) posed.delete(id);
    for (const id of [...sitting.keys()]) if (id && !remotes.has(id)) sitting.delete(id);
    for (const id of [...was.keys()]) if (!remotes.has(id)) was.delete(id);
  });

  return { swim, pool: () => pool };
}
