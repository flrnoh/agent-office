import * as THREE from 'three';
import { HAIR_COLORS, SKIN_TONES, lookFromSeed } from '../../../shared/avatar';
import { SLOTS, bodyAt, epochOf, planFor, type Body, type Plan } from '../../../shared/passersby';
import { mulberry32 } from '../../../shared/rng';
import { WALKS, detour, onRoad, walkCoords, walkPoint } from '../../../shared/sidewalks';
import { HIPS } from '../character/rig';
import { G } from './kit';
import { BAGS, DOGS, MAX_DOGS, MAX_PEOPLE, SHIRTS, TROUSERS, UMBRELLAS, buildPeopleMeshes } from './people-models';
import type { Obstacle } from './traffic';

// flrnoh fork (see FORK.md): the city's passers-by (see town/index.ts). Where each of them is comes
// from shared/passersby.ts, from the office's clock alone, so everyone sees the same people at the
// same places. What's only this page's: they step aside for you and anyone else down here (holding
// back a moment when there's no room, and catching up after), stumble and look round when you bump
// into them, glance at you going by, and their heads, arms and legs. Only the ones within SEE of
// where you look from are drawn, the far ones without faces or hands; everyone in all is a few
// instanced meshes (town/people-models.ts).

/** How far off they're drawn, and how far off the faces and hands still are. */
const SEE = 122;
const DETAIL = 45;
/** Slots whose crossing is further than this from you can't have anyone within SEE. */
const SLOT_REACH = SEE + 130;

export interface PeopleClock {
  /** Seconds on the office's clock (store.officeNow), the same on every page. */
  now: number;
  /** Where you're looking from. */
  eyeX: number;
  eyeZ: number;
  /** How hard it's raining, 0–1 (Sky.rain). */
  rain: number;
  /** How light it is at `ms` on the office's clock, 0 at night … 1 by day. */
  dayAt(ms: number): number;
}

export interface Passersby {
  group: THREE.Group;
  /** Set each frame before update (see features/town). */
  clock: PeopleClock | null;
  /** For a look from the console: seconds added to the office's clock (half an hour on is the night, say). */
  shift: number;
  /** Walks everyone on to now, stepping aside for `avoid`; whoever's out in the road goes in `inRoad`, for the cars. */
  update(dt: number, avoid: readonly Obstacle[], inRoad: Obstacle[]): void;
  /** A footstep near you, and two people talking near you (see features/town/people.ts for their sounds). */
  onStep: ((x: number, z: number) => void) | null;
  onChat: ((x: number, z: number) => void) | null;
  /** How many are out round you, how many drawn, how many dogs, and the last update's milliseconds. */
  readonly stats: { out: number; drawn: number; dogs: number; ms: number };
  /** For a look from the console: who's drawn right now, where, doing what, with whom. */
  list(): { x: number; z: number; yaw: number; act: string; company: string; d: number }[];
}

/** What a slot's outing looks like: drawn from its plan's seed. */
interface Who {
  scale: [number, number];
  skin: [THREE.Color, THREE.Color];
  hair: [THREE.Color, THREE.Color];
  style: [number, number];
  shirt: [THREE.Color, THREE.Color];
  trousers: [THREE.Color, THREE.Color];
  bag: THREE.Color;
  umbrella: THREE.Color | null;
  dog: THREE.Color;
  dogScale: number;
}

/** One body's own state on this page: where it faces, how far it's stepped aside, its stride, and what it's looking at. */
interface Member {
  yaw: number;
  ox: number;
  oz: number;
  phase: number;
  head: number;
  stumble: number;
  lookT: number;
  lookX: number;
  lookZ: number;
  fresh: boolean;
}

interface Local {
  epoch: number;
  plan: Plan | null;
  who: Who | null;
  lag: number;
  members: [Member, Member, Member];
  chatIn: number;
}

const member = (): Member => ({ yaw: 0, ox: 0, oz: 0, phase: 0, head: 0, stumble: 0, lookT: 0, lookX: 0, lookZ: 0, fresh: true });
const colors = (list: string[]) => list.map((c) => new THREE.Color(c));
const SKIN = colors(SKIN_TONES);
const HAIR = colors(HAIR_COLORS);
const SHIRT = colors(SHIRTS);
const TROUSER = colors(TROUSERS);
const BAG = colors(BAGS);
const UMBRELLA = colors(UMBRELLAS);
const DOG = colors(DOGS);

function whoOf(plan: Plan): Who {
  const r = mulberry32(plan.seed);
  const pick = <T>(list: T[]) => list[Math.floor(r() * list.length)];
  const one = (k: number) => {
    const look = lookFromSeed(`passerby:${plan.seed}:${k}`);
    return { scale: 0.86 + r() * 0.2, skin: SKIN[look.skin], hair: HAIR[look.hair], style: look.style, shirt: pick(SHIRT), trousers: pick(TROUSER) };
  };
  const a = one(0);
  const b = one(1);
  return {
    scale: [a.scale, b.scale],
    skin: [a.skin, b.skin],
    hair: [a.hair, b.hair],
    style: [a.style, b.style],
    shirt: [a.shirt, b.shirt],
    trousers: [a.trousers, b.trousers],
    bag: pick(BAG),
    // Most have an umbrella with them when it rains; the rest hurry.
    umbrella: r() < 0.75 ? pick(UMBRELLA) : null,
    dog: pick(DOG),
    dogScale: 0.75 + r() * 0.5,
  };
}

/** The shortest turn from angle `a` to `b`. */
const turn = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function buildPassersby(): Passersby {
  const group = new THREE.Group();
  const m = buildPeopleMeshes();
  group.add(...m.all);
  const locals = new Map<number, Local>();
  /** Where each thing to step aside for was last frame, for how fast it's coming. */
  const was = new Map<Obstacle, { x: number; z: number }>();
  const speeds = new Map<Obstacle, number>();
  const roadPool: Obstacle[] = [];
  const bodies: [Body, Body, Body] = [{} as Body, {} as Body, {} as Body];
  /** This frame's people to draw: their slot, which of the party, where, and how far from you. */
  type Drawn = { l: Local; who: 0 | 1; x: number; z: number; yaw: number; act: Body['act']; speed: number; d: number; dog: boolean; dx: number; dz: number; dogYaw: number };
  const drawn: Drawn[] = [];
  const pool: Drawn[] = [];
  const stats = { out: 0, drawn: 0, dogs: 0, ms: 0 };
  let stepBudget = 0;

  // Scratch for the matrices.
  const M = new THREE.Matrix4();
  const L = new THREE.Matrix4();
  const O = new THREE.Matrix4();
  /** An arm's, kept while the next parts go on. */
  const S = new THREE.Matrix4();
  const v = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const sc = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const hand = new THREE.Vector3();
  const root = (x: number, y: number, z: number, yaw: number, pitch: number, s: number) => {
    e.set(pitch, yaw, 0, 'YXZ');
    M.compose(v.set(x, y, z), q.setFromEuler(e), sc.set(s, s, s));
  };
  const part = (mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
    e.set(rx, ry, rz, 'YXZ');
    L.compose(v.set(x, y, z), q.setFromEuler(e), one);
    O.multiplyMatrices(M, L);
    mesh.setMatrixAt(i, O);
    return O;
  };

  /** Steps member `mb` at `b` aside for whatever's close, and says whether something's right in its way. */
  function avoid(mb: Member, b: Body, list: readonly Obstacle[], dt: number, l: Local): boolean {
    const fx = Math.sin(b.yaw);
    const fz = Math.cos(b.yaw);
    const rx = -fz;
    const rz = fx;
    let tx = 0;
    let tz = 0;
    let blocked = false;
    for (const o of list) {
      const dx = b.x + mb.ox - o.x;
      const dz = b.z + mb.oz - o.z;
      const d = Math.hypot(dx, dz);
      if (d > 2.4 || d < 1e-4) continue;
      const ahead = -(dx * fx + dz * fz);
      const lateral = dx * rx + dz * rz;
      const fast = speeds.get(o) ?? 0;
      if (d < 0.62 && fast > 1.4 && mb.stumble <= 0) {
        // Bumped into: a stumble, a step back, and a look at who it was.
        mb.stumble = 0.9;
        mb.lookT = 3;
        mb.lookX = o.x;
        mb.lookZ = o.z;
        mb.ox += (dx / d) * 0.35;
        mb.oz += (dz / d) * 0.35;
        l.lag += 0.6;
      }
      if (d < 3 && mb.lookT <= 0 && ahead > 0) {
        mb.lookT = 1.2;
        mb.lookX = o.x;
        mb.lookZ = o.z;
      }
      if (ahead < -0.6) continue;
      const push = clamp((2.1 - d) / 1.3, 0, 1) * 0.85;
      const s = lateral >= 0 ? 1 : -1;
      tx += rx * s * push;
      tz += rz * s * push;
      if (b.speed > 0 && ahead > 0 && ahead < 0.95 && Math.abs(lateral) < 0.55) blocked = true;
    }
    const k = 1 - Math.exp(-dt * 5);
    mb.ox += (tx - mb.ox) * k;
    mb.oz += (tz - mb.oz) * k;
    return blocked;
  }

  /** `b` with its member's step aside, kept on the sidewalk and round what stands on it. */
  function placed(mb: Member, b: Body): void {
    if (b.walk >= 0) {
      const w = WALKS[b.walk];
      const [a, off] = walkCoords(w, b.x + mb.ox, b.z + mb.oz);
      [b.x, b.z] = walkPoint(w, a, detour(w, a, off));
    } else {
      // Off the sidewalk (round a corner, across a zebra, to a door or a bench) only a little.
      const o = Math.hypot(mb.ox, mb.oz);
      const k = o > 0.35 ? 0.35 / o : 1;
      b.x += mb.ox * k;
      b.z += mb.oz * k;
    }
  }

  function update(dt: number, list: readonly Obstacle[], inRoad: Obstacle[]) {
    const t0 = performance.now();
    const clock = api.clock;
    drawn.length = 0;
    stats.out = 0;
    // How fast each thing to step aside for is going.
    for (const o of list) {
      const p = was.get(o);
      speeds.set(o, p && dt > 0 ? Math.hypot(o.x - p.x, o.z - p.z) / dt : 0);
      if (p) {
        p.x = o.x;
        p.z = o.z;
      } else was.set(o, { x: o.x, z: o.z });
    }
    if (was.size > list.length * 2 + 8) {
      was.clear();
      speeds.clear();
    }
    if (!clock) return finish(t0);
    const t = clock.now + api.shift;
    const { eyeX, eyeZ } = clock;
    for (const slot of SLOTS) {
      if (Math.hypot(slot.x - eyeX, slot.z - eyeZ) > SLOT_REACH) {
        locals.delete(slot.id);
        continue;
      }
      let l = locals.get(slot.id);
      const { epoch, start } = epochOf(slot, t);
      if (!l || l.epoch !== epoch) {
        const plan = planFor(slot, epoch, clamp(clock.dayAt(start * 1000), 0, 1));
        l = { epoch, plan, who: plan && whoOf(plan), lag: 0, members: [member(), member(), member()], chatIn: 1 + Math.random() * 3 };
        locals.set(slot.id, l);
      }
      const plan = l.plan;
      if (!plan) continue;
      const tl = t - l.lag;
      const party = plan.company === 'pair' ? 2 : 1;
      if (!bodyAt(plan, tl, 0, bodies[0])) continue;
      if (Math.hypot(bodies[0].x - eyeX, bodies[0].z - eyeZ) > SEE + 2) continue;
      if (party > 1) bodyAt(plan, tl, 1, bodies[1]);
      const dog = plan.company === 'dog' && !!bodyAt(plan, tl, 2, bodies[2]);
      let blocked = false;
      for (let k = 0; k < party; k++) if (avoid(l.members[k], bodies[k], list, dt, l)) blocked = true;
      // No room to get by: they wait a moment, and walk a little quicker after to catch up.
      l.lag = blocked ? Math.min(8, l.lag + dt) : Math.max(0, l.lag - dt * 0.22);
      for (let k = 0; k < party; k++) {
        const b = bodies[k];
        if (!b.out) continue;
        const mb = l.members[k];
        placed(mb, b);
        stats.out++;
        if (onRoad(b.x, b.z)) {
          const o = (roadPool[inRoad.length] ??= { x: 0, z: 0 });
          o.x = b.x;
          o.z = b.z;
          inRoad.push(o);
        }
        const d = Math.hypot(b.x - eyeX, b.z - eyeZ);
        if (d > SEE) continue;
        const it = (pool[drawn.length] ??= {} as Drawn);
        Object.assign(it, { l, who: k, x: b.x, z: b.z, yaw: b.yaw, act: b.act, speed: blocked ? 0 : b.speed, d, dog: false });
        if (k === 0 && dog && bodies[2].out) {
          const db = bodies[2];
          placed(l.members[2], db);
          it.dog = true;
          it.dx = db.x;
          it.dz = db.z;
          it.dogYaw = db.yaw;
        }
        drawn.push(it);
      }
    }
    // The nearest first, as many as there's room for.
    drawn.sort((p, q2) => p.d - q2.d);
    draw(dt, t, clock);
    return finish(t0);
  }

  function finish(t0: number) {
    stats.ms = performance.now() - t0;
  }

  function draw(dt: number, t: number, clock: PeopleClock) {
    let n = 0;
    let near = 0;
    let dogs = 0;
    let bags = 0;
    let umbrellas = 0;
    const styleCount = m.hair.map(() => 0);
    const leadPos = m.leads.geometry.getAttribute('position') as THREE.BufferAttribute;
    const raining = clock.rain > 0.25;
    stepBudget = Math.min(6, stepBudget + dt * 10);
    for (const it of drawn) {
      if (n >= MAX_PEOPLE) break;
      const { l, who: k } = it;
      const who = l.who!;
      const mb = l.members[k];
      const moving = it.speed > 0.05;
      // Turning to face the way they go, quickly but not at once.
      if (mb.fresh) {
        mb.yaw = it.yaw;
        mb.fresh = false;
      } else mb.yaw += turn(mb.yaw, it.yaw) * (1 - Math.exp(-dt * 9));
      const before = Math.sin(mb.phase);
      if (moving) mb.phase += dt * it.speed * 6.4;
      else mb.phase *= Math.exp(-dt * 6);
      if (moving && it.d < 9 && Math.sign(Math.sin(mb.phase)) !== Math.sign(before) && stepBudget >= 1) {
        stepBudget--;
        api.onStep?.(it.x, it.z);
      }
      mb.stumble = Math.max(0, mb.stumble - dt);
      mb.lookT = Math.max(0, mb.lookT - dt);
      // Where the head turns: at whoever bumped them or is coming close, at the one they're talking
      // to, up and down the street at a crossing or a bus stop, or just ahead.
      let head = 0;
      if (mb.lookT > 0) head = clamp(turn(mb.yaw, Math.atan2(mb.lookX - it.x, mb.lookZ - it.z)), -1.2, 1.2);
      else if (l.plan!.company === 'pair' && Math.sin(t * 0.45 + l.plan!.seed % 7) > -0.2) head = (k === 0 ? 1 : -1) * (moving ? 0.45 : 0.8);
      else if (it.act === 'wait') head = Math.sin(t * 0.9 + k + (l.plan!.seed % 5)) * 0.9;
      mb.head += (head - mb.head) * (1 - Math.exp(-dt * 5));
      if (k === 0 && l.plan!.company === 'pair' && it.d < 11) {
        l.chatIn -= dt;
        if (l.chatIn <= 0) {
          l.chatIn = 1.5 + Math.random() * 3.5;
          api.onChat?.(it.x, it.z);
        }
      }
      const s = who.scale[k];
      const sitting = it.act === 'sit';
      const swing = Math.sin(mb.phase) * 0.62 * Math.min(1, it.speed / 0.8);
      const bob = moving ? Math.abs(Math.sin(mb.phase)) * 0.05 : 0;
      const stumble = mb.stumble > 0 ? Math.sin((0.9 - mb.stumble) * 7) * 0.28 * (mb.stumble / 0.9) : 0;
      root(it.x, G + (sitting ? 0.07 : bob), it.z, mb.yaw, stumble, s);
      part(m.torso, n, 0, 0.72, 0);
      m.torso.setColorAt(n, who.shirt[k]);
      part(m.head, n, 0, 1.32, 0, sitting ? 0.05 : 0, mb.head);
      m.head.setColorAt(n, who.skin[k]);
      const hair = m.hair[who.style[k]];
      const hi = styleCount[who.style[k]]++;
      hair.setMatrixAt(hi, O);
      hair.setColorAt(hi, who.hair[k]);
      const detail = it.d < DETAIL;
      if (detail) {
        m.face.setMatrixAt(near, O);
      }
      const umbrella = raining && who.umbrella && !sitting;
      for (const side of [-1, 1] as const) {
        const li = n * 2 + (side > 0 ? 1 : 0);
        part(m.legs, li, side * 0.12, HIPS, 0, sitting ? -Math.PI / 2 : swing * side);
        m.legs.setColorAt(li, who.trousers[k]);
        // The right arm (on -x) holds the umbrella up; the other swings, or the lead or the bag.
        let arm = sitting ? -0.45 : -swing * side * 0.8;
        if (umbrella && side < 0) arm = -1.4;
        const shoulder = S.copy(part(m.arms, li, side * 0.33, 0.9, 0, arm, 0, side * 0.08));
        m.arms.setColorAt(li, who.shirt[k]);
        if (detail) {
          const hj = near * 2 + (side > 0 ? 1 : 0);
          m.hands.setMatrixAt(hj, shoulder);
          m.hands.setColorAt(hj, who.skin[k]);
        }
        if (side < 0 && umbrella) {
          part(m.umbrellas, umbrellas, side * 0.3, 1.7, 0.37, 0.08);
          m.umbrellas.setColorAt(umbrellas++, who.umbrella!);
        }
        if (side > 0 && l.plan!.bag && k === 0 && !it.dog && !sitting) {
          part(m.bags, bags, side * 0.37, 0.53, 0, arm * 0.25);
          m.bags.setColorAt(bags++, who.bag);
        }
        if (side > 0 && it.dog && dogs < MAX_DOGS) {
          // The lead, from this hand down to the dog's collar.
          hand.set(0, -0.4, 0).applyMatrix4(shoulder);
          leadPos.setXYZ(dogs * 2, hand.x, hand.y, hand.z);
        }
      }
      if (detail) near++;
      if (it.dog && dogs < MAX_DOGS) {
        const dm = l.members[2];
        if (dm.fresh) {
          dm.yaw = it.dogYaw;
          dm.fresh = false;
        } else dm.yaw += turn(dm.yaw, it.dogYaw) * (1 - Math.exp(-dt * 7));
        if (moving) dm.phase += dt * it.speed * 9;
        const ds = who.dogScale;
        // Sitting by them while they stand about; its tail going all the while.
        root(it.dx, G + (moving ? Math.abs(Math.sin(dm.phase)) * 0.03 : 0), it.dz, dm.yaw, moving ? 0 : -0.35, ds);
        part(m.dogs, dogs, 0, 0, 0);
        m.dogs.setColorAt(dogs, who.dog);
        v.set(0, 0.53, 0.25).applyMatrix4(M);
        leadPos.setXYZ(dogs * 2 + 1, v.x, v.y, v.z);
        const legSwing = moving ? Math.sin(dm.phase) * 0.6 : 0;
        let j = 0;
        for (const lz of [0.2, -0.2]) {
          for (const lx of [-0.09, 0.09]) {
            const sw = (lx > 0) === (lz > 0) ? legSwing : -legSwing;
            part(m.dogLegs, dogs * 4 + j, lx, 0.32, lz, moving ? sw : lz < 0 ? -1.2 : 0);
            m.dogLegs.setColorAt(dogs * 4 + j++, who.dog);
          }
        }
        dogs++;
      }
      n++;
    }
    m.torso.count = m.head.count = n;
    m.legs.count = m.arms.count = n * 2;
    m.face.count = near;
    m.hands.count = near * 2;
    m.bags.count = bags;
    m.umbrellas.count = umbrellas;
    m.dogs.count = dogs;
    m.dogLegs.count = dogs * 4;
    m.hair.forEach((h, i) => (h.count = styleCount[i]));
    m.leads.geometry.setDrawRange(0, dogs * 2);
    leadPos.needsUpdate = true;
    for (const mesh of [m.torso, m.head, m.face, m.legs, m.arms, m.hands, m.bags, m.umbrellas, m.dogs, m.dogLegs, ...m.hair]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    stats.drawn = n;
    stats.dogs = dogs;
  }

  const peek = () => drawn.map((it) => ({ x: it.x, z: it.z, yaw: it.yaw, act: it.act, company: it.l.plan!.company, d: it.d }));
  const api: Passersby = { group, clock: null, shift: 0, update, onStep: null, onChat: null, stats, list: peek };
  return api;
}
