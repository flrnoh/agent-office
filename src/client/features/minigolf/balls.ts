import * as THREE from 'three';
import { MG_COLORS, clockSec, type MgShot, type MgView } from '../../../shared/minigolf';
import { HOLES, toRoom, type HoleDef } from '../../../shared/minigolf-holes';
import { BALL_R, putt, settled, step, support, type Ball, type BallEvent } from '../../../shared/minigolf-physics';
import { feltAt } from './course';
import { dotTexture } from './look';

/*
 * Everyone's balls in the mini golf room (flrnoh fork, see FORK.md "Black-light mini golf"): lying
 * where they stopped, or rolling. A putt comes as where from, which way, how hard and when (MgShot);
 * every page rolls it with the same physics the office worked it out with, stepping it along the
 * shared clock, so it rolls the same everywhere (and the windmill's sails are where the office had
 * them). Your own starts the moment you putt; everyone else's catches up to where it is by now. What
 * it hits on the way comes out as events, for the sounds and the bumpers' flash.
 */

interface View {
  mesh: THREE.Mesh;
  glow: THREE.Sprite;
  trail: THREE.Line;
  trailPts: Float32Array;
  trailN: number;
  color: string;
}

interface Play {
  shot: MgShot;
  def: HoleDef;
  ball: Ball;
  t0: number;
  mine: boolean;
  /** When it settled (performance.now()), and how it ended up. */
  endedAt: number;
}

export interface BallHooks {
  /** The office's clock now (ms). */
  shared(): number;
  /** Something the ball did, where in the room, on which hole, whose. */
  event(e: BallEvent, at: THREE.Vector3, hole: number, id: string): void;
}

/** Steps a page catches up at most in one frame (10 s of roll). */
const CATCH_UP = 2400;

const ballGeo = new THREE.SphereGeometry(BALL_R, 16, 12);

export class Balls {
  private views = new Map<string, View>();
  private plays = new Map<string, Play>();
  private view: MgView | null = null;
  private readonly pos = new THREE.Vector3();

  constructor(
    private readonly group: THREE.Group,
    private readonly hooks: BallHooks,
  ) {}

  /** How the mini golf stands now: who has a ball, where the still ones lie. */
  set(view: MgView) {
    this.view = view;
    const ids = new Set(view.players.map((p) => p.id));
    for (const [id, v] of this.views) {
      if (ids.has(id)) continue;
      this.group.remove(v.mesh, v.glow, v.trail);
      v.trail.geometry.dispose();
      this.views.delete(id);
      this.plays.delete(id);
    }
    for (const p of view.players) {
      const color = MG_COLORS[p.color % MG_COLORS.length][0];
      let v = this.views.get(p.id);
      if (!v || v.color !== color) {
        if (v) this.group.remove(v.mesh, v.glow, v.trail);
        v = this.make(color);
        this.views.set(p.id, v);
      }
      // The office has the putt's end on the card now: the roll's over for good.
      const play = this.plays.get(p.id);
      if (play && !p.rolling && play.endedAt) this.plays.delete(p.id);
    }
  }

  private make(color: string): View {
    const mesh = new THREE.Mesh(ballGeo, new THREE.MeshBasicMaterial({ color }));
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTexture(), color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.setScalar(BALL_R * 9);
    const trailPts = new Float32Array(24 * 3);
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(trailPts, 3));
    const fade = new Float32Array(24 * 3);
    const c = new THREE.Color(color);
    for (let i = 0; i < 24; i++) {
      const k = (1 - i / 23) ** 1.5;
      fade[i * 3] = c.r * k;
      fade[i * 3 + 1] = c.g * k;
      fade[i * 3 + 2] = c.b * k;
    }
    tg.setAttribute('color', new THREE.BufferAttribute(fade, 3));
    tg.setDrawRange(0, 0);
    const trail = new THREE.Line(tg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    trail.frustumCulled = false;
    this.group.add(mesh, glow, trail);
    return { mesh, glow, trail, trailPts, trailN: 0, color };
  }

  /** A putt (anyone's): it rolls here from where it was on the office's clock. Yours again (the office's echo) changes nothing. */
  shoot(shot: MgShot, mine: boolean) {
    const had = this.plays.get(shot.id);
    if (had && had.shot.at === shot.at && had.shot.dir === shot.dir && had.shot.power === shot.power) {
      had.shot = shot;
      return;
    }
    const def = HOLES[shot.hole - 1];
    if (!def) return;
    const t0 = clockSec(shot.at);
    this.plays.set(shot.id, { shot, def, ball: putt(def.course, shot.from, shot.dir, shot.power, t0), t0, mine, endedAt: 0 });
    const v = this.views.get(shot.id);
    if (v) v.trailN = 0;
  }

  /** Whether `id`'s ball is rolling here, and where it is (room). */
  rolling(id: string): boolean {
    const p = this.plays.get(id);
    return !!p && !p.endedAt;
  }

  /** `id`'s ball in the room right now (null with none), and how it's going. */
  where(id: string): { at: THREE.Vector3; ball: Ball | null; hole: number; ended: number } | null {
    const v = this.views.get(id);
    if (!v || !v.mesh.visible) return null;
    const p = this.plays.get(id);
    return { at: v.mesh.position.clone(), ball: p?.ball ?? null, hole: p?.shot.hole ?? 0, ended: p?.endedAt ?? 0 };
  }

  /** The balls rolling now, how fast, and where (for the felt's sound). */
  *moving(): Generator<{ at: THREE.Vector3; speed: number }> {
    for (const [id, p] of this.plays) {
      if (p.endedAt || p.ball.mode !== 'roll') continue;
      const v = this.views.get(id);
      if (v) yield { at: v.mesh.position, speed: Math.hypot(p.ball.vx, p.ball.vz) };
    }
  }

  /** Every frame: the rolls stepped along to now, every ball in its place. */
  update(now: number) {
    const shared = this.hooks.shared();
    for (const [id, p] of this.plays) {
      if (p.endedAt) continue;
      const elapsed = (shared - p.shot.at) / 1000;
      const events: BallEvent[] = [];
      let n = 0;
      while (!settled(p.ball) && p.ball.t - p.t0 < elapsed && n++ < CATCH_UP) step(p.def.course, p.ball, events);
      // Too far behind (a page asleep): straight to how it ended.
      if (!settled(p.ball) && p.ball.t - p.t0 < elapsed - 1) this.finish(p);
      const fresh = elapsed - (p.ball.t - p.t0) < 0.25;
      if (fresh) for (const e of events) this.hooks.event(e, this.roomPoint(p.def, e.x, e.y, e.z, e.k === 'cup'), p.shot.hole, id);
      if (settled(p.ball) || p.ball.t - p.t0 > p.shot.result.time + 0.5) {
        this.finish(p);
        p.endedAt = now;
      }
    }
    if (!this.view) return;
    for (const pl of this.view.players) {
      const v = this.views.get(pl.id);
      if (!v) continue;
      const p = this.plays.get(pl.id);
      // A roll the office never had (a putt it turned down): back to where it says the ball is.
      if (p?.endedAt && !pl.rolling && now - p.endedAt > 2500) this.plays.delete(pl.id);
      else if (p) {
        this.placeRolling(v, p, now);
        continue;
      }
      // Lying still: on its hole, unless it's down already (waiting for the group) or the round's done.
      const def = HOLES[pl.hole - 1];
      const shown = !!def && pl.card[pl.hole - 1] == null;
      v.mesh.visible = v.glow.visible = shown;
      v.trail.visible = false;
      if (!shown) continue;
      const at = toRoom(def, pl.ball.x, pl.ball.z);
      v.mesh.position.set(at.x, def.base + feltAt(def, pl.ball.x, pl.ball.z) + BALL_R, at.z);
      v.glow.position.copy(v.mesh.position);
    }
  }

  /** The roll, to its end as the office had it. */
  private finish(p: Play) {
    const r = p.shot.result;
    const b = p.ball;
    if (r.out) {
      b.mode = 'out';
    } else if (r.holed) {
      b.mode = 'cup';
      b.x = p.def.course.cup.x;
      b.z = p.def.course.cup.z;
      b.y = feltAt(p.def, b.x, b.z) - 0.06;
    } else {
      // Where the office has it, if this page's roll came out a hair different.
      b.mode = 'rest';
      b.x = r.x;
      b.z = r.z;
      b.y = support(p.def.course, r.x, r.z, b.t, 99)?.y ?? feltAt(p.def, r.x, r.z);
    }
    b.vx = b.vy = b.vz = 0;
  }

  private placeRolling(v: View, p: Play, now: number) {
    const b = p.ball;
    let shown = true;
    if (b.mode === 'pipe') {
      // Through a clear pipe it's seen going; in a tunnel, not.
      shown = false;
    } else if (b.mode === 'cup') {
      shown = !p.endedAt || now - p.endedAt < 900;
    } else if (b.mode === 'out') {
      // Gone: back where it was putted from, a moment later.
      const back = !p.endedAt || now - p.endedAt > 700;
      if (back) {
        const at = toRoom(p.def, p.shot.from.x, p.shot.from.z);
        this.pos.set(at.x, p.def.base + feltAt(p.def, p.shot.from.x, p.shot.from.z) + BALL_R, at.z);
      } else shown = false;
    }
    if (b.mode !== 'out') this.pos.copy(this.roomPoint(p.def, b.x, b.y, b.z, b.mode === 'loop'));
    v.mesh.visible = v.glow.visible = shown;
    v.mesh.position.copy(this.pos);
    v.glow.position.copy(this.pos);
    // The trail behind it while it moves.
    const moving = !p.endedAt && shown && b.mode !== 'rest';
    v.trail.visible = moving || v.trailN > 1;
    if (moving) {
      v.trailPts.copyWithin(3, 0, (23) * 3);
      v.trailPts[0] = this.pos.x;
      v.trailPts[1] = this.pos.y;
      v.trailPts[2] = this.pos.z;
      v.trailN = Math.min(24, v.trailN + 1);
    } else v.trailN = Math.max(0, v.trailN - 1);
    v.trail.geometry.setDrawRange(0, v.trailN);
    v.trail.geometry.getAttribute('position').needsUpdate = true;
  }

  /** A point on hole `def` (its frame; `centre`: y is the ball's middle already, as round the loop) in the room. */
  roomPoint(def: HoleDef, x: number, y: number, z: number, centre = false): THREE.Vector3 {
    const at = toRoom(def, x, z);
    return new THREE.Vector3(at.x, def.base + y + (centre ? 0 : BALL_R), at.z);
  }

  /** How far `id`'s ball is through its pipe, if it's in one (for the tower's clear pipe). */
  inPipe(id: string): { hole: number; pipe: number; k: number } | null {
    const p = this.plays.get(id);
    if (!p || p.ball.mode !== 'pipe') return null;
    const pipe = p.def.course.pipes?.[p.ball.pipe];
    if (!pipe) return null;
    return { hole: p.def.n, pipe: p.ball.pipe, k: 1 - p.ball.left / pipe.time };
  }

  /** Puts a ball shown in a clear pipe where it is in it (obstacles.ts knows the pipe's curve). */
  showInPipe(id: string, at: THREE.Vector3 | null) {
    const v = this.views.get(id);
    if (!v || !at) return;
    v.mesh.visible = v.glow.visible = true;
    v.mesh.position.copy(at);
    v.glow.position.copy(at);
  }
}
