import { NPC_NAMES, REACH, TEAMS, VOLLEY, ballAt, flightEnd, freshState, playerHit, serveSpot, standAt, type BallState, type VolleySide, type VolleyState } from '../../../shared/volley';
import type { Ctx } from '../../core/context';
import { aside, key } from '../../core/hint';
import { store } from '../../state';
import { h, modalOpen, toast } from '../../ui/dom';
import { G } from '../../world/scenic/kit';
import { VolleyView } from './volley-view';

// Beach volleyball on Sunset Beach (flrnoh fork, see FORK.md "A day at the beach"; the court is
// world/scenic/volleycourt.ts, what moves on it volley-view.ts, the rules are
// shared/volley.ts, the score and the computer team the office's, server/volley.ts). Walk onto the
// court and you're playing for that side; anyone else on the beach watches (with nobody on the court,
// the computer team plays a show rally for them). E or a click hits the ball when it's in reach: a
// bump over the net where you're facing, Shift for a set up to a teammate, and up in the air by the
// net with the ball high, a spike. Behind your baseline with the ball over your spot, E serves.

export interface VolleyDeps {
  /** Plays the reach on your hands and your character, and shows it to everyone else. */
  reach(): void;
  /** Down on your floor's street, where the beach is. */
  onStreet(): boolean;
}

const say = ['Hab ihn!', 'Meiner!', 'Und hoch!', 'Rüber damit!', 'Schöner Ball!'];

export function beachVolley(ctx: Ctx, deps: VolleyDeps) {
  let state: VolleyState = freshState();
  let view: VolleyView | null = null;
  /** Where you are about the court, as the office last heard it. */
  let told: VolleySide | -1 | null | undefined;
  let spin = 0;
  let shift = false;
  /** The last ball the office sent, to notice a new hit (the computer's swing) or a point. */
  let lastBall: BallState = state.ball;

  const now = () => store.officeNow();
  const mySide = (): VolleySide | undefined => state.players[store.you];

  function made(): VolleyView | null {
    if (view) return view;
    const scenic = ctx.office.scenic;
    if (!scenic) return null;
    return (view = new VolleyView(scenic.group));
  }

  function soundAt(x: number, y: number, z: number) {
    return { x, y: ctx.player.street + y, z };
  }

  /** What changed with the ball: the computer's touch, a point. */
  function news(prev: BallState, next: BallState) {
    const v = view;
    if (next.k === 'fly' && (prev.k !== 'fly' || prev.f.t0 !== next.f.t0)) {
      const p = next.f.p;
      ctx.sound.beach(next.kind === 'spike' ? 'spike' : 'bump', soundAt(p.x, p.y, p.z), next.kind === 'spike' ? 1 : 0.7);
      const npc = next.by.startsWith('npc:') ? Number(next.by.slice(4)) : -1;
      if (v && npc >= 0) {
        v.npcs[npc].reach();
        if (Math.random() < 0.25) v.npcs[npc].say(say[Math.floor(Math.random() * say.length)], 1.6);
      }
    }
    if (next.k === 'down' && prev.k !== 'down') {
      ctx.sound.beach('thud', soundAt(next.x, 0.1, next.z), 0.8);
      ctx.sound.beach('whistle', soundAt(VOLLEY.x + VOLLEY.halfW + 1.8, 2.5, VOLLEY.z), 0.8);
      const side = mySide();
      if (side !== undefined) {
        const t = TEAMS[next.won];
        const why = next.why === 'net' ? 'ins Netz' : next.why === 'out' ? 'im Aus' : 'im Feld';
        toast(`${t.icon} Punkt ${t.name} – Ball ${why} · ${state.score[0]} : ${state.score[1]}`);
      }
      const set = state.won as -1 | VolleySide;
      if (set >= 0 && v) {
        const w = TEAMS[set as VolleySide];
        for (const p of set === 0 ? [v.npcs[0], v.npcs[1]] : [v.npcs[2], v.npcs[3]]) if (state.cpu[set as VolleySide]) p.say(`${w.icon} Satz!`, 3);
        if (side !== undefined) toast(`🏆 ${w.icon} ${w.name} gewinnen den Satz ${state.score[0]} : ${state.score[1]}!`);
      }
    }
  }

  ctx.messages.on('volley', (m) => {
    const mine = m.by === store.you && state.ball.k === 'fly' && state.ball.by === store.you;
    const prev = lastBall;
    // Your own hit's echo: your page already has it flying (from your own clock), so it keeps that.
    state = mine ? { ...m.state, ball: state.ball } : m.state;
    lastBall = state.ball;
    if (!mine) news(prev, state.ball);
    ctx.hint.invalidate();
  });

  ctx.messages.on('welcome', () => {
    told = undefined;
    state = freshState();
  });

  /** Where the ball is now, above the sand. */
  const ballNow = () => ballAt(state.ball, now());

  /** The ball, if it's yours to hit from where you stand: in reach, or over your serving spot. */
  function hittable(): { serving: boolean } | null {
    const side = mySide();
    if (side === undefined) return null;
    const b = ballNow();
    if (!b) return null;
    const p = ctx.player.pos;
    if (state.ball.k === 'serve') {
      const s = serveSpot(state.ball.side);
      return state.ball.side === side && Math.hypot(p.x - s.x, p.z - s.z) < 2.6 ? { serving: true } : null;
    }
    if (state.ball.k !== 'fly') return null;
    const up = b.y - (p.y - ctx.player.street);
    return Math.hypot(b.x - p.x, b.z - p.z) <= REACH.r && up >= REACH.low && up <= REACH.high ? { serving: false } : null;
  }

  function hit(): boolean {
    const can = hittable();
    if (!can) return false;
    const b = can.serving ? serveSpot(mySide()!) : ballNow()!;
    const p = ctx.player;
    const shot = playerHit(b, { x: p.pos.x, z: p.pos.z, yaw: p.facing, airborne: !p.grounded, shift, serving: can.serving }, Math.random);
    const kind = can.serving ? 'serve' : shot.kind;
    ctx.net.send({ t: 'volley.hit', p: b, v: shot.v, kind });
    // On your page at once, from your own clock; the office's word on it follows.
    const prev = state.ball;
    const f = { p: b, v: shot.v, t0: now(), side: mySide()! };
    state = { ...state, ball: { k: 'fly', f, kind, by: store.you } };
    lastBall = state.ball;
    news(prev, { k: 'fly', f, kind, by: '' });
    deps.reach();
    if (kind === 'spike') ctx.shake(0.15);
    return true;
  }

  ctx.activities.add({
    id: 'volley',
    active: () => deps.onStreet() && mySide() !== undefined && !ctx.player.seat,
    // Walking off the court is how you stop.
    stop: () => {},
    key: (e) => {
      if (e.code === 'KeyE') {
        if (!e.repeat) hit();
        return true;
      }
      return false;
    },
    hint: (el) => {
      const side = mySide()!;
      const can = hittable();
      const team = TEAMS[side];
      const serving = state.ball.k === 'serve' && state.ball.side === side;
      ctx.hint.draw(el, `volley|${side}|${state.score}|${can ? (can.serving ? 's' : 'h') : '-'}|${serving}|${state.won}`, () => [
        h('span.title', {}, `🏐 ${team.icon} ${team.name}`),
        aside(`${TEAMS[0].icon} ${state.score[0]} : ${state.score[1]} ${TEAMS[1].icon}${state.cpu[1 - side] ? ' · gegen Kalle & Co.' : ''}`),
        ...(can?.serving ? [key('E', 'Aufschlag')] : serving ? [aside('Hinter die Grundlinie zum Aufschlag')] : []),
        ...(can && !can.serving ? [key('E', 'Baggern'), key('⇧+E', 'Pritschen'), key('Space→E', 'Am Netz schmettern')] : []),
        ...(!can && !serving ? [aside('Lauf unter den Ball · E oder Klick schlägt ihn')] : []),
      ]);
    },
  });

  // A click hits it too, on the court (in first person, with the mouse captured).
  window.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || !document.pointerLockElement || modalOpen()) return;
    if (!deps.onStreet() || mySide() === undefined) return;
    hit();
  });
  window.addEventListener('keydown', (e) => (shift = e.shiftKey));
  window.addEventListener('keyup', (e) => (shift = e.shiftKey));

  ctx.ticks.add('world', ({ dt, t }) => {
    const here = deps.onStreet();
    const p = ctx.player.pos;
    // In a car, on a jetski, sitting or swimming you're about the court, not on it.
    const where = here ? standAt(p.x, p.z) : null;
    const at = where !== null && where >= 0 && (ctx.player.rig || ctx.player.seat) ? -1 : where;
    if (at !== told) {
      told = at;
      ctx.net.send({ t: 'volley.stand', side: at });
      ctx.hint.invalidate();
    }
    if (!here || at === null) return;
    const v = made();
    if (!v) return;
    const b = ballNow();
    if (b) {
      spin += dt * (state.ball.k === 'fly' ? 9 : 0);
      v.setBall(b.x, b.y, b.z, spin);
    }
    const banner = state.won >= 0 ? `${TEAMS[state.won].icon} ${TEAMS[state.won].name} gewinnen den Satz!` : state.cpu[0] && state.cpu[1] ? 'Showmatch – komm aufs Feld!' : '';
    v.setScore(state, banner);
    // The computer team runs to where they'll play the ball (or stroll to their spots), facing it.
    const nowMs = now();
    v.npcs.forEach((n, i) => {
      const goal = state.npcs[i];
      const r = n.root;
      const dx = goal.x - r.position.x;
      const dz = goal.z - r.position.z;
      const d = Math.hypot(dx, dz);
      const left = goal.at ? Math.max(0.15, (goal.at - nowMs) / 1000) : 0;
      const speed = goal.at ? Math.min(9, Math.max(2.5, d / left)) : 2.2;
      const moving = d > 0.05;
      if (moving) {
        const step = Math.min(d, speed * dt);
        r.position.x += (dx / d) * step;
        r.position.z += (dz / d) * step;
      }
      const look = b && (moving ? d < 1 : true) ? Math.atan2(b.x - r.position.x, b.z - r.position.z) : Math.atan2(dx, dz);
      r.rotation.y += Math.atan2(Math.sin(look - r.rotation.y), Math.cos(look - r.rotation.y)) * Math.min(1, dt * 6);
      // Up off the sand for a spike.
      const spiking = state.ball.k === 'fly' && state.ball.by === `npc:${i}` && state.ball.kind === 'spike' && nowMs - state.ball.f.t0 < 450;
      r.position.y = G + (spiking ? Math.sin(((nowMs - (state.ball.k === 'fly' ? state.ball.f.t0 : 0)) / 450) * Math.PI) * 0.5 : 0);
      n.update(dt, t, moving && speed > 0.3, spiking, speed > 4 ? 1.6 : 1);
    });
  });

  return {
    /** For tests and screenshots. */
    state: () => state,
    view: () => view,
    hit,
    hittable,
    names: NPC_NAMES,
    flightEnd,
  };
}
