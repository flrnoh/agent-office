import * as THREE from 'three';
import { FOUL_LINE_Z, LANE_COUNT, LANE_X } from '../../../shared/bowling';
import { BALLS, BALL_RADIUS, DECK_D, PIN_COUNT, PIT_D, RELEASE_S, pairOf, type BowlingRoll, type LaneView, type StandingPin } from '../../../shared/bowling-game';
import { BowlSim, PinState, SIM_HZ, lean, type SimEvent } from '../../../shared/bowling-sim';
import { celebration } from '../../../shared/bowling-score';
import type { Person } from '../../world/character';
import { BAR_REST, TABLE_LOW_Y, type Machines } from './machine';
import { hoodSpot, landingSpot, type Furniture } from './furniture';
import { SURF } from './lanes3d';
import { ballMaterial, ballMesh, pinGeometry, pinMaterial } from './props';
import type { BowlSound } from './sound';
import { deliveryPose, POSE_S } from './pose';

/*
 * The lanes as everyone in the centre sees them (flrnoh fork, see FORK.md "Bowling lanes"): the pins
 * on the decks, each ball down its lane played back from its throw with the very simulation the
 * office counted it with (so it's the same pins for everyone), the bowler's steps and swing, the
 * sounds, the pinsetter's sweep and the fresh rack, the ball coming back up the return, the ball in
 * the hand of whoever's up, and the celebrations on the monitors once the pins have settled.
 */

const PIN_SLOTS = LANE_COUNT * PIN_COUNT;
const SWEEP = 2.4;
/** A ball's back on the return this long after it reached the pit. */
const RETURN_AFTER = 2.6;
const now = () => performance.now() / 1000;
const zOf = (d: number) => FOUL_LINE_Z - d;

interface DrawPin {
  n: number;
  u: number;
  d: number;
  s: number;
  du: number;
  dd: number;
  wob: number;
  /** Lifted off the deck (by the setting table), or dropped (into the pit). */
  y: number;
  gone: boolean;
}
const standingPin = (p: StandingPin): DrawPin => ({ n: p.n, u: p.u, d: p.d, s: 0, du: 0, dd: 1, wob: 0, y: 0, gone: false });

interface Playback {
  roll: BowlingRoll;
  sim: BowlSim;
  releaseAt: number;
  released: boolean;
  steps: number;
  hitYet: boolean;
  strike: boolean;
  pitAt: number | null;
}
interface Sweep {
  t0: number;
  /** Lift the standing ones and set them back (true), or rake the lot and bring a fresh rack. */
  keep: boolean;
  after: StandingPin[];
  /** The pins as they lay when it started. */
  from: DrawPin[];
  /** Where the bar comes down: in front of the first of the deadwood. */
  barStart: number;
  sounded: number;
}
interface Lane {
  view: LaneView | null;
  shown: LaneView | null;
  pins: DrawPin[];
  play: Playback | null;
  sweep: Sweep | null;
  ball: THREE.Mesh;
  party: { kind: NonNullable<ReturnType<typeof celebration>> | 'gutter'; t0: number; who: string } | null;
}

export interface LanesViewDeps {
  root: THREE.Object3D;
  machines: Machines;
  furniture: Furniture;
  sound(kind: BowlSound, at: { x: number; y: number; z: number }, strength?: number): void;
  rolling(lane: number, at: { x: number; y: number; z: number }, speed: number, gutter: boolean): void;
  /** Someone in the centre as you see them (yourself too). */
  person(id: string): Person | undefined;
  confetti(x: number, y: number, z: number, n: number, power: number): void;
  /** A lane's screens need drawing again (its view or its celebration changed). */
  changed(lane: number): void;
}

export class LanesView {
  private readonly lanes: Lane[];
  private readonly pinMesh: THREE.InstancedMesh;
  private readonly returning: { mesh: THREE.Mesh; t0: number; lane: number }[] = [];
  private readonly hand: { mesh: THREE.Mesh; on: Person | null; ball: number }[] = [];
  private readonly posed = new Map<Person, number>();
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly axis = new THREE.Vector3();
  private readonly one = new THREE.Vector3(1, 1, 1);
  private readonly hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  private readonly wobQ = new THREE.Quaternion();
  private readonly xAxis = new THREE.Vector3(1, 0, 0);

  constructor(private readonly deps: LanesViewDeps) {
    this.pinMesh = new THREE.InstancedMesh(pinGeometry(), pinMaterial(), PIN_SLOTS);
    this.pinMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pinMesh.castShadow = true;
    this.pinMesh.receiveShadow = true;
    this.pinMesh.frustumCulled = false;
    deps.root.add(this.pinMesh);
    this.lanes = Array.from({ length: LANE_COUNT }, () => {
      const ball = ballMesh(4);
      ball.visible = false;
      deps.root.add(ball);
      return { view: null, shown: null, pins: [], play: null, sweep: null, ball, party: null };
    });
    for (let i = 0; i < LANE_COUNT; i++) {
      const m = ballMesh(4);
      m.visible = false;
      this.hand.push({ mesh: m, on: null, ball: 4 });
    }
    for (let lane = 0; lane < LANE_COUNT; lane++) this.drawPins(lane);
  }

  /** What a lane's screens show: the game as it stood before a ball that's still rolling. */
  shown(lane: number): LaneView | null {
    return this.lanes[lane].shown;
  }
  /** The latest the office says. */
  latest(lane: number): LaneView | null {
    return this.lanes[lane].view;
  }
  /** A celebration on a lane's monitor, and how far through it is (0–1), if one's playing. */
  party(lane: number): { kind: NonNullable<ReturnType<typeof celebration>> | 'gutter'; k: number; who: string } | null {
    const p = this.lanes[lane].party;
    if (!p) return null;
    const k = (now() - p.t0) / 2.8;
    if (k >= 1) {
      this.lanes[lane].party = null;
      this.deps.changed(lane);
      return null;
    }
    return { kind: p.kind, k, who: p.who };
  }
  /** Whether a ball is rolling or the pinsetter's at work on `lane`. */
  busy(lane: number): boolean {
    const l = this.lanes[lane];
    return !!l.play || !!l.sweep;
  }
  rolling(lane: number): boolean {
    return !!this.lanes[lane].play;
  }
  /** Where the ball is on `lane` now, if it's rolling (for the bowler's camera), and its speed. */
  ballAt(lane: number): { pos: THREE.Vector3; d: number; speed: number; done: boolean } | null {
    const p = this.lanes[lane].play;
    if (!p || !p.released) return null;
    const b = p.sim.ball;
    return { pos: this.lanes[lane].ball.position, d: b.d, speed: Math.hypot(b.vu, b.vd), done: b.done };
  }

  /** Every lane from the office (coming in). */
  setAll(views: LaneView[]) {
    for (const v of views) this.set(v, true);
  }

  /** A lane's news. While its ball rolls the screens wait for it (the roll brings its own view). */
  set(view: LaneView, fresh = false) {
    const l = this.lanes[view.lane];
    if (!l) return;
    l.view = view;
    if (!l.play) {
      l.shown = view;
      if (fresh || !l.sweep) {
        l.pins = view.pins.map(standingPin);
        l.sweep = null;
        this.drawPins(view.lane);
      }
    }
    this.deps.changed(view.lane);
  }

  /** A ball down a lane: played back from `ago` seconds after its bowler let go of the button. */
  roll(r: BowlingRoll, ago = 0) {
    const l = this.lanes[r.lane];
    if (!l) return;
    if (l.play) this.finish(r.lane);
    l.sweep = null;
    l.pins = r.pins.map(standingPin);
    this.drawPins(r.lane);
    l.view = r.view;
    const t = now();
    const releaseAt = t + Math.max(0, RELEASE_S - ago);
    l.play = { roll: r, sim: new BowlSim(r.params, BALLS[r.ball]?.lbs ?? 12, r.pins), releaseAt, released: false, steps: 0, hitYet: false, strike: r.pins.length === PIN_COUNT && r.roll.pins === PIN_COUNT && !r.foul, pitAt: null };
    l.ball.material = ballMaterial(r.ball);
    // The bowler's steps and swing.
    const who = this.deps.person(r.by);
    if (who) {
      who.setWorkout(deliveryPose(releaseAt - RELEASE_S));
      this.posed.set(who, releaseAt - RELEASE_S + POSE_S);
    }
    // The ball waiting on the return goes back down for its next trip.
    for (const ret of this.returning) if (pairOf(ret.lane) === pairOf(r.lane)) ret.mesh.visible = false;
    this.deps.changed(r.lane);
  }

  /** Every frame. */
  update() {
    const t = now();
    for (let lane = 0; lane < LANE_COUNT; lane++) {
      const l = this.lanes[lane];
      if (l.play) this.stepPlay(lane, l, t);
      else if (l.sweep) this.stepSweep(lane, l, t);
    }
    this.stepReturns(t);
    this.stepHands();
    for (const [p, until] of this.posed)
      if (t > until) {
        p.setWorkout(null);
        this.posed.delete(p);
      }
  }

  private stepPlay(lane: number, l: Lane, t: number) {
    const p = l.play!;
    if (t < p.releaseAt) return;
    const at = (u: number, d: number, y = 0.2) => ({ x: LANE_X[lane] + u, y: SURF + y, z: zOf(d) });
    if (!p.released) {
      p.released = true;
      l.ball.visible = true;
      this.deps.sound('release', at(p.sim.ball.u, p.sim.ball.d), p.roll.params.power);
      if (p.roll.foul) this.deps.sound('foul', at(0, 0, 0.6));
    }
    // Catch up with the clock, a lot of steps at once if the tab was asleep.
    const want = Math.min(Math.floor((t - p.releaseAt) * SIM_HZ), p.steps + SIM_HZ);
    let hit = 0;
    let hits = 0;
    let downs = 0;
    const b = p.sim.ball;
    const turn0 = b.turn;
    while (p.steps < want && !p.sim.done) {
      p.sim.step();
      p.steps++;
      for (const e of p.sim.events) this.event(e, at, () => (hits++, (hit = Math.max(hit, e.k === 'pin' ? e.s : 0))), () => downs++);
    }
    if (hits) {
      const pin = p.sim.pins.find((x) => x.state !== PinState.Gone) ?? p.sim.pins[0];
      if (!p.hitYet && p.strike) this.deps.sound('strike', at(pin?.u ?? 0, pin?.d ?? PIT_D - 1));
      else this.deps.sound('pins', at(pin?.u ?? 0, pin?.d ?? PIT_D - 1), Math.min(1, hit / 3));
      p.hitYet = true;
    }
    if (downs) this.deps.sound('down', at(0, PIT_D - 0.6, 0.05), Math.min(1, downs / 4));
    // The ball: where it is, turned by how far it rolled, down into the gutter, into the pit.
    if (!b.done || b.d < PIT_D + 0.4) {
      const y = SURF + BALL_RADIUS - (b.gutter ? 0.045 : 0) - Math.max(0, b.d - PIT_D) * 0.6;
      l.ball.position.set(LANE_X[lane] + b.u, y, zOf(b.d));
      const sp = Math.hypot(b.vu, b.vd);
      if (sp > 1e-3) {
        this.axis.set(b.vd, 0, b.vu).normalize();
        this.q.setFromAxisAngle(this.axis, -(b.turn - turn0));
        l.ball.quaternion.premultiply(this.q);
      }
      if (!b.done) this.deps.rolling(lane, l.ball.position, sp, b.gutter);
    }
    if (b.done && b.d > PIT_D) l.ball.visible = false;
    if (b.done && p.pitAt === null) {
      p.pitAt = t;
      this.returning.push({ mesh: this.returnMesh(lane, p.roll.ball), t0: t + RETURN_AFTER, lane });
    }
    l.pins = p.sim.pins.map((s) => ({ n: s.n, u: s.u, d: s.d, s: s.s, du: s.du, dd: s.dd, wob: s.wob * Math.sin(t * 22 + s.n), y: s.state === PinState.Gone ? -1 : 0, gone: s.state === PinState.Gone }));
    this.drawPins(lane);
    if (p.sim.done) this.finish(lane);
  }

  private event(e: SimEvent, at: (u: number, d: number, y?: number) => { x: number; y: number; z: number }, hit: () => void, down: () => void) {
    if (e.k === 'pin') hit();
    else if (e.k === 'down') down();
    else if (e.k === 'gutter') this.deps.sound('gutter', at(e.u, e.d, 0.05));
    else if (e.k === 'pit') this.deps.sound('pit', at(e.u, e.d, 0.1));
    else if (e.k === 'kick') this.deps.sound('kick', at(e.u, e.d, 0.3));
  }

  /** The ball's done and the pins have settled: the screens catch up, the celebration, then the pinsetter. */
  private finish(lane: number) {
    const l = this.lanes[lane];
    const p = l.play!;
    if (!p.sim.done) p.sim.run();
    l.play = null;
    l.ball.visible = false;
    if (p.pitAt === null) this.returning.push({ mesh: this.returnMesh(lane, p.roll.ball), t0: now() + RETURN_AFTER, lane });
    const r = p.roll;
    l.shown = l.view;
    // What it was: the score sheet decides, a gutter ball is the ball's own.
    const rolls = r.view.players.find((x) => x.id === r.by)?.rolls ?? [];
    const kind = r.foul ? 'foul' : p.sim.ball.gutter && r.roll.pins === 0 ? 'gutter' : rolls.length ? celebration(rolls) : null;
    if (kind) {
      l.party = { kind, t0: now(), who: r.name };
      const at = { x: LANE_X[lane], y: 3, z: 3.4 };
      const yay: Partial<Record<string, BowlSound>> = { strike: 'yay-strike', double: 'yay-strike', turkey: 'yay-turkey', hambone: 'yay-turkey', perfect: 'yay-perfect', spare: 'yay-spare', split: 'aww-split', gutter: 'aww-gutter' };
      const s = yay[kind];
      if (s) this.deps.sound(s, at);
      if (kind === 'turkey' || kind === 'hambone' || kind === 'perfect') this.deps.confetti(LANE_X[lane], SURF + 0.4, zOf(PIT_D - 1.4), kind === 'perfect' ? 400 : 220, 1.1);
    }
    // The pinsetter: keep what stands (set back where it stood), or rake it all and bring ten.
    const standing = p.sim.standing();
    const keep = !r.foul && sameSet(standing, r.after);
    const from = l.pins.map((p) => ({ ...p }));
    const keepN = new Set(keep ? r.after.map((p) => p.n) : []);
    const dead = from.filter((p) => !p.gone && !(keepN.has(p.n) && p.s === 0));
    const barStart = Math.max(DECK_D - 2.2, Math.min(BAR_REST.d, ...dead.map((p) => p.d - 0.2)));
    l.sweep = { t0: now(), keep, after: r.after, from, barStart, sounded: 0 };
    this.deps.sound('pinsetter', { x: LANE_X[lane], y: 1.2, z: zOf(PIT_D) });
    this.deps.changed(lane);
  }

  /** The sweep, a step at a time (see machine.ts: the table, the bar). */
  private stepSweep(lane: number, l: Lane, t: number) {
    const s = l.sweep!;
    const k = t - s.t0;
    const M = this.deps.machines;
    const ramp = (a: number, b: number) => Math.min(1, Math.max(0, (k - a) / (b - a)));
    const ease = (x: number) => x * x * (3 - 2 * x);
    const keepSet = new Set(s.keep ? s.after.map((p) => p.n) : []);
    let tableDrop: number;
    let lift = 0;
    // The bar comes down in front of the first of the deadwood, rakes it all into the pit, and goes back up.
    const [a0, a1, b0, b1, r0, r1] = s.keep ? [0.5, 0.8, 0.8, 1.4, 1.5, 2.0] : [0, 0.3, 0.3, 0.9, 1.0, 1.4];
    const barDrop = ease(ramp(a0, a1)) * (1 - ease(ramp(r0 - 0.1, r0 + 0.2)));
    const back = ease(ramp(r0, r1));
    const barD = (BAR_REST.d + (s.barStart - BAR_REST.d) * ease(ramp(a0, a1)) + (PIT_D + 0.1 - s.barStart) * ease(ramp(b0, b1))) * (1 - back) + BAR_REST.d * back;
    if (s.keep) {
      tableDrop = ease(ramp(0, 0.45)) * (1 - ease(ramp(0.45, 0.75))) + ease(ramp(1.6, 2.0)) * (1 - ease(ramp(2.0, 2.4)));
      lift = k > 0.45 && k < 2.0 ? 1 : 0;
    } else tableDrop = ease(ramp(0.9, 1.6)) * (1 - ease(ramp(1.9, 2.4)));
    if (k > 0.3 && s.sounded === 0) {
      s.sounded = 1;
      this.deps.sound('sweep', { x: LANE_X[lane], y: 0.4, z: zOf(PIT_D - 0.5) });
    }
    if (k > (s.keep ? 1.95 : 1.6) && s.sounded === 1) {
      s.sounded = 2;
      this.deps.sound('set', { x: LANE_X[lane], y: 0.4, z: zOf(PIT_D - 0.5) });
    }
    M.bar(lane, barD, barDrop);
    const under = M.table(lane, tableDrop);
    // The pins: lifted with the table, raked by the bar, or a new rack hanging under the table.
    const hang = under - TABLE_LOW_Y; // how far over the deck a pin hanging from the table is
    const pins: DrawPin[] = [];
    for (const pin of s.from) {
      if (pin.gone) continue;
      if (keepSet.has(pin.n) && pin.s === 0) {
        const want = s.after.find((a) => a.n === pin.n)!;
        pins.push({ ...pin, u: want.u, d: want.d, y: lift ? hang : 0, wob: 0 });
        continue;
      }
      // Deadwood (or the whole rack): pushed back by the bar once it's down, into the pit.
      if (barDrop > 0.6 && pin.d < barD + 0.12) pin.d = barD + 0.12;
      if (pin.d > PIT_D + 0.05) {
        pin.gone = true;
        continue;
      }
      pins.push({ ...pin, wob: 0 });
    }
    if (!s.keep && k > 0.9) {
      // The fresh rack comes down under the table, and stays once it's set.
      const set = k > 1.6;
      for (const a of s.after) pins.push({ ...standingPin(a), y: set ? 0 : hang });
    }
    l.pins = pins;
    this.drawPins(lane);
    if (k >= SWEEP) {
      l.sweep = null;
      l.pins = (l.view?.pins ?? s.after).map(standingPin);
      M.bar(lane, BAR_REST.d, 0);
      M.table(lane, 0);
      this.drawPins(lane);
    }
  }

  /** A ball for the return, in the colours of the one just bowled. */
  private returnMesh(lane: number, ball: number): THREE.Mesh {
    const m = ballMesh(ball);
    m.visible = false;
    this.deps.root.add(m);
    for (const r of this.returning)
      if (pairOf(r.lane) === pairOf(lane)) {
        r.mesh.removeFromParent();
        r.t0 = -1;
      }
    return m;
  }

  private stepReturns(t: number) {
    for (let i = this.returning.length - 1; i >= 0; i--) {
      const r = this.returning[i];
      const k = t - r.t0;
      if (r.t0 < 0 || k > 14) {
        r.mesh.removeFromParent();
        this.returning.splice(i, 1);
        continue;
      }
      if (k < 0) continue;
      const pair = pairOf(r.lane);
      const hood = hoodSpot(pair);
      const land = landingSpot(pair);
      if (k < 0.35) {
        if (!r.mesh.visible) {
          r.mesh.visible = true;
          this.deps.sound('pop', hood);
        }
        r.mesh.position.set(hood.x, hood.y - 0.3 + (k / 0.35) * 0.3 + BALL_RADIUS, hood.z);
      } else if (k < 0.95) {
        const f = (k - 0.35) / 0.6;
        const e = f * f;
        r.mesh.position.set(hood.x, THREE.MathUtils.lerp(hood.y + BALL_RADIUS, land.y, e), THREE.MathUtils.lerp(hood.z, land.z, e));
        r.mesh.rotateX(0.2);
        if (f > 0.93 && !r.mesh.userData.clunk) {
          r.mesh.userData.clunk = true;
          this.deps.sound('return', land);
        }
      } else r.mesh.position.copy(land);
    }
  }

  /** The ball in the hand of whoever's up (and not yet let go), on each lane. */
  private stepHands() {
    for (let lane = 0; lane < LANE_COUNT; lane++) {
      const l = this.lanes[lane];
      const h = this.hand[lane];
      const up = l.view?.up ?? null;
      const p = l.play;
      const who = p ? (p.released ? null : p.roll.by) : up;
      const person = who ? this.deps.person(who) : undefined;
      const ball = p ? p.roll.ball : (l.view?.players.find((x) => x.id === up)?.ball ?? 4);
      if (person !== h.on) {
        h.mesh.removeFromParent();
        h.on = person ?? null;
        if (person) {
          person.wear(h.mesh, 'hand');
          h.mesh.position.set(0, -0.47, 0.05);
          h.mesh.visible = true;
        }
      }
      if (ball !== h.ball) {
        h.ball = ball;
        h.mesh.material = ballMaterial(ball);
      }
    }
  }

  /** Puts lane `lane`'s pins where they're drawn. */
  private drawPins(lane: number) {
    const pins = this.lanes[lane].pins;
    const base = lane * PIN_COUNT;
    for (let i = 0; i < PIN_COUNT; i++) {
      const p = pins[i];
      if (!p || p.gone || p.y < -0.5) {
        this.pinMesh.setMatrixAt(base + i, this.hidden);
        continue;
      }
      const angle = (p.s * Math.PI) / 2;
      this.axis.set(-p.dd, 0, -p.du);
      if (this.axis.lengthSq() < 1e-6) this.axis.set(1, 0, 0);
      this.axis.normalize();
      this.q.setFromAxisAngle(this.axis, angle);
      if (p.wob) this.q.multiply(this.wobQ.setFromAxisAngle(this.xAxis, p.wob * 0.12));
      this.v.set(LANE_X[lane] + p.u, SURF + p.y + 0.05 * lean(p.s), zOf(p.d));
      this.m.compose(this.v, this.q, this.one);
      this.pinMesh.setMatrixAt(base + i, this.m);
    }
    this.pinMesh.instanceMatrix.needsUpdate = true;
  }
}

const sameSet = (a: readonly StandingPin[], b: readonly StandingPin[]) => a.length === b.length && a.every((p) => b.some((q) => q.n === p.n));
