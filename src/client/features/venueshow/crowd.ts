import * as THREE from 'three';
import { HAIR_COLORS, SKIN_TONES, lookFromSeed } from '../../../shared/avatar';
import { mulberry32 } from '../../../shared/rng';
import type { VenueMode } from '../../../shared/venue';
import { STAGE_FOCUS, WALKWAYS, crowdArea } from '../../../shared/venueshow';
import { MAX_CROWD, concertMood, crowdSpots, moveFor, pitPlace, stepAside, wodPlace, type Pit, type Spot } from '../../../shared/venueshow-crowd';
import type { MixFrame } from '../../../shared/venueshow-mix';
import { HIPS } from '../../world/character/rig';
import { SHIRTS, TROUSERS, buildPeopleMeshes } from '../../world/town/people-models';

// The SCHALLWERK's crowd (flrnoh fork, see FORK.md "The show"): up to 72 people on the floor, drawn
// like the city's passers-by (world/town/people-models.ts: one instanced mesh per body part for all
// of them). Where they stand and how many come is shared/venueshow-crowd.ts'; here they walk in from
// the back and out again, face the band in concert mode (swaying with their lighters up in the slow
// bits, nodding, fists up, the front rows jumping when it gets loud), dance all over in club mode
// (each their own moves, to the beat, jumping at the drop), clap and cheer between songs, chant
// "Zugabe!", make room for the real people, open a circle round a pit, part for a Wall of Death, and
// put their hands up under a crowd-surfer. Faces and hands only nearby; nothing at all while you
// can't see the hall.

/** What the crowd goes by, every frame. */
export interface CrowdInput {
  /** Office clock (ms), seconds since start, the frame's length. */
  now: number;
  t: number;
  dt: number;
  mode: VenueMode;
  /** How many should be here. */
  count: number;
  /** The beat they dance to in club mode (the DJ's set or the house mix), or null when nothing plays. */
  music: MixFrame | null;
  /** How loud the stage is (smoothed, 0..1), and its beat (counted, fractional) for the concert crowd. */
  stage: number;
  stageBeats: number;
  /** The real people on the floor (they step aside for them), and the crowd-surfers over it. */
  players: readonly Spot[];
  surfers: readonly Spot[];
  pit: Pit | null;
  wodAt: number;
  /** 0..1: the crowd's applause, its chant, its cheering right now (they fade out by themselves). */
  applause: number;
  chant: number;
  cheer: number;
  /** Where the camera is, for the detail. */
  eye: THREE.Vector3;
}

interface Npc {
  i: number;
  seed: number;
  x: number;
  z: number;
  yaw: number;
  /** Here (walking in, standing, dancing), on the way out, or gone. */
  state: 'in' | 'out' | 'gone';
  walk: number;
  /** On the way somewhere (walking, not dancing). */
  moving: boolean;
  speed: number;
  scale: number;
  skin: THREE.Color;
  hair: THREE.Color;
  style: number;
  shirt: THREE.Color;
  trousers: THREE.Color;
  /** A lighter (or a phone's light) for the slow ones, and which. */
  lighter: 'flame' | 'phone' | null;
  /** Smoothed pose. */
  p: { lift: number; nod: number; roll: number; rx: number; rz: number; lx: number; lz: number; turn: number };
}

const TAU = Math.PI * 2;
const colors = (l: readonly string[]) => l.map((c) => new THREE.Color(c));
const SKIN = colors(SKIN_TONES);
const HAIR = colors(HAIR_COLORS);
// Band shirts: mostly black, some in colour.
const SHIRT = colors([...SHIRTS, '#151515', '#151515', '#1f1f1f', '#151515', '#2a2a2a', '#151515']);
const TROUSER = colors(TROUSERS);
const turn = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
/** Where people come in from and go out to: the back of the floor (the walkway from the foyer). */
const DOOR_Z = WALKWAYS[0].minZ + 0.4;
const DETAIL = 26;

export class Crowd {
  readonly group = new THREE.Group();
  private m = buildPeopleMeshes();
  private npcs: Npc[] = [];
  private glow: THREE.InstancedMesh;
  /** How many are standing on the floor now (for the sound and the balls). */
  present = 0;
  /** Next frame, everyone who should be here is already standing in their place (coming in, the crowd's there). */
  snap = true;

  // Scratch.
  private M = new THREE.Matrix4();
  private L = new THREE.Matrix4();
  private O = new THREE.Matrix4();
  private S = new THREE.Matrix4();
  private v = new THREE.Vector3();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private sc = new THREE.Vector3();
  private one = new THREE.Vector3(1, 1, 1);
  private hand = new THREE.Vector3();
  private q2 = new THREE.Quaternion();

  constructor() {
    this.group.name = 'venue-crowd';
    this.group.add(...this.m.all);
    for (const o of [this.m.bags, this.m.umbrellas, this.m.dogs, this.m.dogLegs, this.m.leads]) o.visible = false;
    // Lighters and phone lights: a soft glow, always facing you.
    const tex = glowTexture();
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    mat.userData.outlineParameters = { visible: false };
    this.glow = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.55, 0.55), mat, MAX_CROWD + 16);
    this.glow.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.glow.frustumCulled = false;
    this.glow.raycast = () => {};
    this.glow.count = 0;
    this.group.add(this.glow);
    for (let i = 0; i < MAX_CROWD; i++) {
      const r = mulberry32(0xc0ffee + i * 977);
      const look = lookFromSeed(`venue:${i}`);
      this.npcs.push({
        i,
        seed: Math.floor(r() * 1e9),
        x: 0,
        z: DOOR_Z,
        yaw: 0,
        state: 'gone',
        walk: r() * TAU,
        moving: false,
        speed: 1.1 + r() * 0.5,
        scale: 0.86 + r() * 0.2,
        skin: SKIN[look.skin],
        hair: HAIR[look.hair],
        style: look.style,
        shirt: SHIRT[Math.floor(r() * SHIRT.length)],
        trousers: TROUSER[Math.floor(r() * TROUSER.length)],
        lighter: r() < 0.38 ? (r() < 0.45 ? 'flame' : 'phone') : null,
        p: { lift: 0, nod: 0, roll: 0, rx: 0, rz: 0, lx: 0, lz: 0, turn: 0 },
      });
    }
  }

  /** Who's where (for the console and the tests of the page). */
  list() {
    return this.npcs.filter((n) => n.state !== 'gone').map((n) => ({ i: n.i, x: n.x, z: n.z, state: n.state }));
  }

  update(f: CrowdInput, visible: boolean) {
    const spots = crowdSpots(f.mode);
    let present = 0;
    for (const n of this.npcs) {
      const wanted = n.i < f.count;
      if (wanted && n.state === 'gone') {
        // In from the back, below where they'll stand.
        n.state = 'in';
        n.x = spots[n.i].x + Math.sin(n.seed) * 0.8;
        n.z = DOOR_Z;
        n.yaw = 0;
      } else if (wanted && n.state === 'out') n.state = 'in';
      else if (!wanted && n.state === 'in') n.state = 'out';
      if (n.state === 'gone') continue;
      const target = this.targetOf(n, spots[n.i], f);
      if (this.snap && n.state === 'in') {
        n.x = target.x;
        n.z = target.z;
        n.yaw = this.faceOf(n, f);
      } else if (this.snap) n.state = 'gone';
      if (n.state === 'gone') continue;
      const dx = target.x - n.x;
      const dz = target.z - n.z;
      const d = Math.hypot(dx, dz);
      const step = Math.min(d, n.speed * (f.pit || f.wodAt ? 1.5 : 1) * f.dt);
      const moving = d > 0.06;
      n.moving = d > (n.state === 'out' ? 0 : 0.45);
      if (moving) {
        n.x += (dx / d) * step;
        n.z += (dz / d) * step;
        n.walk += f.dt * 8 * Math.min(1, d);
      }
      if (n.state === 'out' && d < 0.3) n.state = 'gone';
      if (n.state === 'in' && d < 0.8) present++;
      // Facing: the way they walk, else what they look at.
      const face = moving && d > 0.5 ? Math.atan2(dx, dz) : this.faceOf(n, f);
      n.yaw += turn(n.yaw, face) * (1 - Math.exp(-f.dt * (moving ? 8 : 4)));
    }
    this.present = present;
    this.snap = false;
    this.group.visible = visible;
    if (visible) this.draw(f);
  }

  /** Where someone wants to be now: their spot, out to the pit's ring, aside for the Wall of Death, the players. */
  private targetOf(n: Npc, spot: Spot, f: CrowdInput): Spot {
    if (n.state === 'out') return { x: spot.x, z: DOOR_Z };
    let s = spot;
    const wod = f.wodAt ? wodPlace(s, f.wodAt, f.now, f.mode) : null;
    if (wod) s = wod.spot;
    else if (f.pit) {
      const inside = Math.hypot(spot.x - f.pit.x, spot.z - f.pit.z) < f.pit.r;
      // A few of those who were inside run round the pit (a circle pit), the rest make the ring.
      if (inside && n.seed % 3 === 0) {
        const a = (n.seed % 628) / 100 + f.t * 1.3;
        s = { x: f.pit.x + Math.cos(a) * f.pit.r * 0.55, z: f.pit.z + Math.sin(a) * f.pit.r * 0.55 };
      } else s = pitPlace(spot, f.pit);
    }
    // Never pushed over the barrier, onto the stage or out of the hall.
    const t = stepAside(s, f.players, 0.95);
    const a = crowdArea(f.mode);
    return { x: Math.min(a.maxX + 0.6, Math.max(a.minX - 0.6, t.x)), z: Math.min(a.maxZ, Math.max(a.minZ - 0.6, t.z)) };
  }

  private faceOf(n: Npc, f: CrowdInput): number {
    for (const s of f.surfers) if (Math.hypot(s.x - n.x, s.z - n.z) < 1.8) return Math.atan2(s.x - n.x, s.z - n.z);
    if (f.pit && Math.hypot(f.pit.x - n.x, f.pit.z - n.z) < f.pit.r + 1.5) return Math.atan2(f.pit.x - n.x, f.pit.z - n.z);
    if (f.mode === 'konzert') return Math.atan2(STAGE_FOCUS.x - n.x, STAGE_FOCUS.z - n.z) + Math.sin(f.t * 0.3 + n.seed) * 0.15;
    // Club: each their own way, turning now and then, a little toward the DJ booth.
    const phrase = f.music ? Math.floor(f.music.beats / 32) : Math.floor(f.t / 20);
    const base = Math.atan2(19 - n.x, 7 - n.z);
    return base + (((n.seed + phrase * 7919) % 1000) / 1000 - 0.5) * 2.6;
  }

  /** The pose someone wants now: jumping, nodding, swaying, their arms. */
  private want(n: Npc, f: CrowdInput): Npc['p'] {
    const w = { lift: 0, nod: 0, roll: 0, rx: 0.05, rz: -0.12, lx: 0.05, lz: 0.12, turn: 0 };
    const k = n.seed;
    // Under a crowd-surfer: both hands up.
    if (f.surfers.some((s) => Math.hypot(s.x - n.x, s.z - n.z) < 1.6)) return { ...w, rx: -0.2, rz: -2.85, lx: -0.2, lz: 2.85, nod: -0.25 };
    const wod = f.wodAt ? f.now - f.wodAt : -1;
    if (wod >= 0 && wod < 3500) return { ...w, rz: -2.6, lz: 2.6, nod: -0.15, lift: 0.04 * Math.abs(Math.sin(f.t * 6 + k)) };
    const inPit = f.pit && Math.hypot(f.pit.x - n.x, f.pit.z - n.z) < f.pit.r + 0.9;
    if ((wod >= 3500 && wod < 10_000) || inPit) {
      const hop = Math.abs(Math.sin(f.t * 5.5 + k));
      return { ...w, lift: 0.22 * hop, rx: -0.6 * hop, rz: -1.2, lx: 0.4, lz: 1.4, nod: 0.3 * hop, roll: 0.15 * Math.sin(f.t * 4 + k) };
    }
    if (f.applause > 0.05 && k % 5 !== 0) {
      // Clapping in front of them, a few with their hands up.
      const c = Math.abs(Math.sin(f.t * 9 + (k % 7)));
      if (k % 4 === 0) return { ...w, rz: -2.6 - 0.2 * c, lz: 2.6 + 0.2 * c, lift: 0.05 * f.cheer };
      return { ...w, rx: -1.25, rz: -0.15 - 0.35 * c, lx: -1.25, lz: 0.15 + 0.35 * c };
    }
    if (f.chant > 0.05) {
      const beat = (f.t * 2.4) % 1;
      const pump = Math.sin(beat * Math.PI);
      return { ...w, rz: -(2.2 + 0.6 * pump), nod: 0.2 * pump, lift: 0.04 * pump };
    }
    if (f.mode === 'konzert') {
      const mood = concertMood(f.stage, f.stage > 0.02);
      const beats = f.stageBeats;
      const phase = beats - Math.floor(beats);
      const on = Math.sin(phase * Math.PI);
      const front = n.z > -0.5;
      if (mood === 'idle') {
        w.roll = 0.03 * Math.sin(f.t * 0.6 + k);
        w.turn = 0.4 * Math.sin(f.t * 0.25 + k) * (k % 3 === 0 ? 1 : 0.2);
        if (f.cheer > 0.05 && k % 3 === 0) return { ...w, rz: -2.5, lz: 2.5 };
        return w;
      }
      if (mood === 'slow') {
        w.roll = 0.09 * Math.sin(beats * Math.PI * 0.5 + (k % 3));
        if (n.lighter) Object.assign(w, { rx: -0.15, rz: -(2.45 + 0.12 * Math.sin(beats * Math.PI * 0.5)) });
        return w;
      }
      w.nod = (mood === 'wild' ? 0.45 : 0.24) * Math.max(0, Math.sin(phase * TAU));
      if (mood === 'wild' && (front || k % 3 === 0)) {
        w.lift = 0.26 * on;
        Object.assign(w, k % 2 ? { rz: -(2.55 + 0.35 * on), lz: 2.55 + 0.35 * on } : { rz: -(2.45 + 0.5 * on), lx: -0.5 });
      } else if (k % 3 !== 1 || mood === 'wild') Object.assign(w, { rz: -(2.45 + 0.5 * on), rx: -0.15 });
      else Object.assign(w, { rx: -0.5 - 0.3 * on, lx: -0.5 - 0.3 * on, rz: -0.25, lz: 0.25 });
      w.lift = Math.max(w.lift, 0.03 * on);
      return w;
    }
    // Club: dancing to the beat.
    const m = f.music;
    if (!m) {
      w.roll = 0.04 * Math.sin(f.t * 1.2 + k);
      return w;
    }
    const phase = m.beats - Math.floor(m.beats);
    const on = Math.sin(phase * Math.PI);
    const e = m.energy;
    const phrase = Math.floor(m.beats / 16);
    let move = moveFor(k, m.part, phrase);
    if (m.sinceDrop < 1.2) move = 'jump';
    const sway = Math.sin(m.beats * Math.PI * 0.5);
    w.lift = 0.05 * e * on;
    switch (move) {
      case 'bounce':
        return { ...w, rx: -0.9 - 0.45 * sway, lx: -0.9 + 0.45 * sway, rz: -0.35, lz: 0.35, nod: 0.18 * on };
      case 'pump':
        return { ...w, rz: -(2.45 + 0.5 * on), lx: -0.7, nod: 0.2 * on };
      case 'wave':
        return { ...w, rx: -0.1, rz: -(2.5 + 0.25 * sway), lx: -0.1, lz: 2.5 - 0.25 * sway, roll: 0.08 * sway, lift: 0.02 * on };
      case 'step':
        return { ...w, roll: 0.12 * sway, rx: -0.9 + 0.3 * sway, lx: -0.9 - 0.3 * sway, rz: -0.3, lz: 0.3 };
      case 'bang':
        return { ...w, nod: 0.5 * Math.max(0, Math.sin(phase * TAU)), rx: -0.6, lx: -0.6, rz: -0.4, lz: 0.4 };
      case 'point':
        return { ...w, rx: -0.4 * on, rz: -2.9, nod: 0.15 * on };
      case 'jump':
        return { ...w, lift: 0.32 * e * on, rz: -(2.4 + 0.4 * on), lz: 2.4 + 0.4 * on };
      case 'clap': {
        const c = Math.sin(((m.beats * (m.rise > 0.6 ? 2 : 1)) % 1) * Math.PI);
        return { ...w, rx: -0.1, rz: -(2.65 - 0.4 * c), lx: -0.1, lz: 2.65 - 0.4 * c };
      }
    }
    return w;
  }

  private draw(f: CrowdInput) {
    const m = this.m;
    const { M, L, O, S, v, q, e, sc, one } = this;
    const root = (x: number, y: number, z: number, yaw: number, roll: number, s: number) => {
      e.set(0, yaw, roll, 'YXZ');
      M.compose(v.set(x, y, z), q.setFromEuler(e), sc.set(s, s, s));
    };
    const stretch = new THREE.Vector3(1, 1, 1);
    const part = (mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, len = 1) => {
      e.set(rx, ry, rz, 'YXZ');
      L.compose(v.set(x, y, z), q.setFromEuler(e), len === 1 ? one : stretch.set(1, len, 1));
      O.multiplyMatrices(M, L);
      mesh.setMatrixAt(i, O);
      return O;
    };
    let n = 0;
    let near = 0;
    let glows = 0;
    const styleCount = m.hair.map(() => 0);
    const k = 1 - Math.exp(-f.dt * 12);
    const camQ = this.q2;
    const slow = f.mode === 'konzert' && concertMood(f.stage, f.stage > 0.02) === 'slow';
    for (const p of this.npcs) {
      if (p.state === 'gone') continue;
      const walking = p.moving;
      const want = walking ? { lift: Math.abs(Math.sin(p.walk)) * 0.04, nod: 0, roll: 0, rx: Math.sin(p.walk) * 0.6, rz: -0.1, lx: -Math.sin(p.walk) * 0.6, lz: 0.1, turn: 0 } : this.want(p, f);
      const s = p.p;
      for (const key of ['lift', 'nod', 'roll', 'rx', 'rz', 'lx', 'lz', 'turn'] as const) s[key] += (want[key] - s[key]) * k;
      root(p.x, Math.max(0, s.lift), p.z, p.yaw, s.roll, p.scale);
      part(m.torso, n, 0, 0.72, 0);
      m.torso.setColorAt(n, p.shirt);
      part(m.head, n, 0, 1.32, 0, s.nod, s.turn);
      m.head.setColorAt(n, p.skin);
      const hair = m.hair[p.style];
      const hi = styleCount[p.style]++;
      hair.setMatrixAt(hi, O);
      hair.setColorAt(hi, p.hair);
      const detail = Math.hypot(p.x - f.eye.x, p.z - f.eye.z) < DETAIL;
      if (detail) m.face.setMatrixAt(near, O);
      const legSwing = walking ? Math.sin(p.walk) * 0.6 : 0;
      for (const sd of [-1, 1] as const) {
        const li = n * 2 + (sd > 0 ? 1 : 0);
        // Knees giving a little on a jump's way down.
        part(m.legs, li, sd * 0.12, HIPS, 0, legSwing * sd - (s.lift > 0.08 ? 0.25 : 0));
        m.legs.setColorAt(li, p.trousers);
        // An arm up over that big head reaches a little further, or the hands would hide beside it.
        const rz = sd < 0 ? s.rz : s.lz;
        const len = 1 + 0.55 * Math.min(1, Math.max(0, (Math.abs(rz) - 1.7) / 0.9));
        const shoulder = S.copy(part(m.arms, li, sd * 0.33, 0.95, 0, sd < 0 ? s.rx : s.lx, 0, rz, len));
        m.arms.setColorAt(li, p.shirt);
        if (detail) {
          const hj = near * 2 + (sd > 0 ? 1 : 0);
          m.hands.setMatrixAt(hj, shoulder);
          m.hands.setColorAt(hj, p.skin);
        }
        // A lighter (or a phone) held up in the slow bits.
        if (sd < 0 && slow && p.lighter && !walking && glows < MAX_CROWD) {
          this.hand.set(0, -0.48, 0).applyMatrix4(shoulder);
          camQ.setFromRotationMatrix(this.L.lookAt(f.eye, this.hand, UP));
          const flicker = p.lighter === 'flame' ? 0.85 + 0.25 * Math.sin(f.t * 23 + p.seed) : 1;
          O.compose(this.hand, camQ, sc.set(flicker, flicker * (p.lighter === 'flame' ? 1.25 : 1), 1));
          this.glow.setMatrixAt(glows, O);
          this.glow.setColorAt(glows++, p.lighter === 'flame' ? FLAME : PHONE);
        }
      }
      if (detail) near++;
      n++;
    }
    m.torso.count = m.head.count = n;
    m.legs.count = m.arms.count = n * 2;
    m.face.count = near;
    m.hands.count = near * 2;
    m.hair.forEach((h, i) => (h.count = styleCount[i]));
    this.glow.count = glows;
    for (const mesh of [m.torso, m.head, m.face, m.legs, m.arms, m.hands, ...m.hair, this.glow]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }
}

const UP = new THREE.Vector3(0, 1, 0);
// Brighter than white, for the additive glow's hot middle.
const FLAME = new THREE.Color(2.2, 1.3, 0.45);
const PHONE = new THREE.Color(1.6, 1.8, 2.1);

/** A soft round glow, white in the middle. */
export function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.18, 'rgba(255,255,255,0.85)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.25)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
