import * as THREE from 'three';
import { TEAM_COLOR, type Team } from '../../../shared/soccer';
import { toon } from '../toon';
import { canvasTexture } from '../casino/parts';
import { fanAct, seatTaken, type CrowdAct, type CrowdState } from './matchday';

/*
 * The soccer hall's crowd (flrnoh fork, see FORK.md "The soccer hall"): low-poly spectators in the
 * stands, all of them in six instanced meshes (legs, bodies, heads, hair, arms, scarves: six draw calls
 * however full it is). Each seat has a regular who turns up at some density (see crowdDensity), and
 * everyone's pose is worked out on the CPU every frame from the crowd's state (see matchday.ts): they
 * sit and bob, clap, get half up with their hands on their heads for an "oooh", and jump with their
 * arms and scarves up when their team scores (the other end sits it out).
 */

export interface Seat {
  /** Where the seat's top is, and which way its occupant looks (toward the pitch). */
  x: number;
  y: number;
  z: number;
  rotY: number;
  /** Whose fans sit here (the red end, the blue end), or neutral. */
  fan: Team | null;
}

export interface Crowd {
  group: THREE.Group;
  /** How many seats there are. */
  seats: number;
  /** How many have someone in them right now (a fraction of `seats`, counting the ones on their way in). */
  present(): number;
  update(t: number, dt: number, density: number, state: CrowdState, now: number): void;
}

/** A seeded random, so the crowd sits the same way for everyone and every time. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SKIN = ['#f1c7a5', '#e0ac85', '#c68a62', '#9a6344', '#6e4630', '#f6d8c0'];
const CASUAL = ['#f4f1ea', '#2b2f36', '#6c7a89', '#f2c14e', '#7fb069', '#9b5de5', '#ff924c', '#3d5a80', '#d8d4cc', '#c9ada7'];
const HAIR = ['#2b1d14', '#4a3222', '#7a5230', '#c9a15a', '#e8d6a8', '#1b1b1b', '#9aa0a6', '#a0442a'];
const TROUSERS = ['#2f3e5c', '#394867', '#23262b', '#6b6152', '#44546a'];

/** Pose numbers per spectator, eased toward what the crowd's doing. */
interface Pose {
  stand: number;
  lean: number;
  arm: number;
  spread: number;
  scarf: number;
}

const TARGET: Record<CrowdAct, Pose> = {
  idle: { stand: 0, lean: 0.04, arm: -0.4, spread: 0.85, scarf: 0 },
  clap: { stand: 0, lean: 0.12, arm: -1.25, spread: 0.55, scarf: 0 },
  oooh: { stand: 0.55, lean: 0.32, arm: -2.55, spread: 0.72, scarf: 0 },
  cheer: { stand: 1, lean: -0.05, arm: -2.95, spread: 1.15, scarf: 1 },
};

export function buildCrowd(seats: Seat[]): Crowd {
  const n = seats.length;
  const group = new THREE.Group();
  const gradientMap = (toon('#fff') as THREE.MeshToonMaterial).gradientMap;
  const mat = () => {
    const m = new THREE.MeshToonMaterial({ color: '#ffffff', gradientMap });
    m.userData.outlineParameters = { visible: false };
    return m;
  };
  const inst = (geo: THREE.BufferGeometry, material: THREE.Material) => {
    const m = new THREE.InstancedMesh(geo, material, n);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    m.castShadow = false;
    m.receiveShadow = false;
    // Never what you aim at (and not worth testing a ray against every spectator).
    m.raycast = () => {};
    group.add(m);
    return m;
  };
  // Shapes, each with its pivot at the origin (see update): legs hang from the hip, the body stands
  // on it, arms hang from the shoulders.
  const legsGeo = new THREE.BoxGeometry(0.3, 0.78, 0.16).translate(0, -0.39, 0);
  const bodyGeo = new THREE.CapsuleGeometry(0.16, 0.26, 3, 8).scale(1.1, 1, 0.72).translate(0, 0.3, 0);
  const headGeo = new THREE.SphereGeometry(0.115, 10, 8);
  const armL = new THREE.BoxGeometry(0.075, 0.44, 0.075).translate(-0.215, -0.2, 0);
  const armR = new THREE.BoxGeometry(0.075, 0.44, 0.075).translate(0.215, -0.2, 0);
  const armsGeo = new THREE.BufferGeometry();
  {
    // Both arms in one shape (they swing together).
    const a = armL.toNonIndexed();
    const b = armR.toNonIndexed();
    const pos = new Float32Array([...(a.attributes.position.array as Float32Array), ...(b.attributes.position.array as Float32Array)]);
    const nor = new Float32Array([...(a.attributes.normal.array as Float32Array), ...(b.attributes.normal.array as Float32Array)]);
    armsGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    armsGeo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  }
  const scarfGeo = new THREE.BoxGeometry(0.95, 0.13, 0.02);
  const scarfMat = new THREE.MeshToonMaterial({
    color: '#ffffff',
    gradientMap,
    map: canvasTexture(64, 8, (g) => {
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, 64, 8);
      g.fillStyle = 'rgba(255,255,255,0.35)';
      for (let i = 0; i < 64; i += 16) g.fillRect(i, 0, 8, 8);
      g.fillStyle = '#f4f4f4';
      g.fillRect(0, 0, 3, 8);
      g.fillRect(61, 0, 3, 8);
    }),
  });
  scarfMat.userData.outlineParameters = { visible: false };
  const legs = inst(legsGeo, mat());
  const bodies = inst(bodyGeo, mat());
  const heads = inst(headGeo, mat());
  // Hair (or a beanie in the team's colour): a cap over the back and top of the head.
  const hairGeo = new THREE.SphereGeometry(0.125, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.52).translate(0, 0.012, -0.012);
  const hair = inst(hairGeo, mat());
  const arms = inst(armsGeo, mat());
  const scarves = inst(scarfGeo, scarfMat);
  const all = [legs, bodies, heads, hair, arms, scarves];

  // Who sits where, what they wear: fixed per seat.
  const rnd = seeded(20260930);
  const people = seats.map((s) => {
    const kit = s.fan && rnd() < 0.62;
    const shirt = new THREE.Color(kit ? TEAM_COLOR[s.fan!] : CASUAL[Math.floor(rnd() * CASUAL.length)]);
    if (kit) shirt.offsetHSL(0, 0, (rnd() - 0.5) * 0.12);
    return {
      seat: s,
      threshold: rnd(),
      phase: rnd() * Math.PI * 2,
      rate: 4 + rnd() * 6,
      shirt,
      skin: new THREE.Color(SKIN[Math.floor(rnd() * SKIN.length)]),
      trousers: new THREE.Color(TROUSERS[Math.floor(rnd() * TROUSERS.length)]),
      scarfed: !!s.fan && rnd() < 0.7,
      hair: new THREE.Color(s.fan && rnd() < 0.22 ? TEAM_COLOR[s.fan] : HAIR[Math.floor(rnd() * HAIR.length)]),
      size: 0.92 + rnd() * 0.14,
      presence: 0,
      pose: { ...TARGET.idle },
    };
  });
  people.forEach((p, i) => {
    legs.setColorAt(i, p.trousers);
    bodies.setColorAt(i, p.shirt);
    arms.setColorAt(i, p.shirt);
    heads.setColorAt(i, p.skin);
    hair.setColorAt(i, p.hair);
    scarves.setColorAt(i, new THREE.Color(p.seat.fan ? TEAM_COLOR[p.seat.fan] : '#ffffff'));
  });
  for (const m of all) if (m.instanceColor) m.instanceColor.needsUpdate = true;

  const seatM = new THREE.Matrix4();
  const hip = new THREE.Matrix4();
  const body = new THREE.Matrix4();
  const tmp = new THREE.Matrix4();
  const out = new THREE.Matrix4();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const rotX = (a: number) => tmp.makeRotationX(a);
  let present = 0;

  const update = (t: number, dt: number, density: number, state: CrowdState, now: number) => {
    present = 0;
    const k = Math.min(1, dt);
    for (let i = 0; i < n; i++) {
      const p = people[i];
      const want = seatTaken(p.threshold, density) ? 1 : 0;
      // Turning up and leaving takes a moment (and not all at once).
      p.presence += Math.sign(want - p.presence) * Math.min(Math.abs(want - p.presence), k * (0.5 + p.threshold));
      present += p.presence;
      if (p.presence < 0.01) {
        for (const m of all) m.setMatrixAt(i, zero);
        continue;
      }
      const act = fanAct(state, p.seat.fan);
      const goal = TARGET[act];
      const e = Math.min(1, k * p.rate);
      const q = p.pose;
      q.stand += (goal.stand - q.stand) * e;
      q.lean += (goal.lean - q.lean) * e;
      q.arm += (goal.arm - q.arm) * e;
      q.spread += (goal.spread - q.spread) * e;
      q.scarf += (goal.scarf - q.scarf) * e;
      const ph = p.phase;
      // What they're doing on top of the pose: bobbing, clapping, jumping, waving.
      let bob = 0.012 * Math.sin(t * 1.4 + ph);
      let arm = q.arm;
      let spread = q.spread;
      let lean = q.lean + 0.03 * Math.sin(t * 0.37 + ph * 3);
      if (act === 'cheer') {
        bob += 0.17 * Math.max(0, Math.sin(t * 7.5 + ph)) * q.stand;
        arm += 0.22 * Math.sin(t * 5 + ph);
      } else if (act === 'clap') {
        spread = 0.3 + 0.32 * Math.abs(Math.sin(t * 8 + ph));
      } else if (act === 'oooh') {
        lean += 0.05 * Math.sin(t * 3 + ph);
      }
      // Sitting down, the hips sink onto the seat as they arrive.
      const sink = (1 - p.presence) * 0.9;
      const s = p.seat;
      seatM.makeRotationY(s.rotY).setPosition(s.x, s.y, s.z);
      hip.makeTranslation(0, 0.06 + q.stand * 0.42 + bob - sink, q.stand * 0.08);
      hip.premultiply(seatM);
      tmp.makeScale(p.size * p.presence, p.size * p.presence, p.size * p.presence);
      hip.multiply(tmp);
      // Legs: out in front when sitting, straight down standing.
      out.copy(hip).multiply(rotX(-1.42 * (1 - q.stand)));
      out.multiply(tmp.makeScale(1, 0.55 + 0.45 * q.stand, 1));
      legs.setMatrixAt(i, out);
      body.copy(hip).multiply(rotX(lean));
      bodies.setMatrixAt(i, body);
      out.copy(body).multiply(tmp.makeTranslation(0, 0.68, 0.01));
      heads.setMatrixAt(i, out);
      hair.setMatrixAt(i, out);
      out.copy(body).multiply(tmp.makeTranslation(0, 0.5, 0)).multiply(rotX(arm)).multiply(tmp.makeScale(spread, 1, 1));
      arms.setMatrixAt(i, out);
      if (p.scarfed) {
        if (q.scarf > 0.5) {
          // Held up between the hands, swung about.
          out.copy(body).multiply(tmp.makeTranslation(0, 0.5, 0)).multiply(rotX(arm)).multiply(tmp.makeTranslation(0, -0.42, 0));
          out.multiply(tmp.makeRotationZ(0.35 * Math.sin(t * 5 + ph)));
          out.multiply(tmp.makeScale(Math.max(0.5, spread * 0.95), 1, 1));
        } else {
          // Round the neck.
          out.copy(body).multiply(tmp.makeTranslation(0, 0.5, 0.1)).multiply(tmp.makeScale(0.42, 1.1, 1));
        }
        scarves.setMatrixAt(i, out);
      } else scarves.setMatrixAt(i, zero);
    }
    for (const m of all) m.instanceMatrix.needsUpdate = true;
  };

  return { group, seats: n, present: () => present, update };
}
