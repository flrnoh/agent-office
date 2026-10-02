import type { Bones } from '../../world/character/person-bones';
import type { DjFrame } from '../../dnb';
import { HOUSE_BPM, danceCounts, danceTempo, freestyleAt, type DanceId, type FreestylePick } from '../../../shared/dance';

/*
 * flrnoh fork (see FORK.md "Dancing on the roof"): the moves themselves. Each is a shape of the body
 * worked out from the set's counts (shared/dance.ts' danceCounts: the beats, or every other one when
 * it's too fast to dance to, as drum and bass is), so it hits the beat wherever you watch from: whole
 * counts land on a beat, and `p`, how far into the count it is, says where between two.
 *
 * - Hits land on the beat: the bounce is lowest there (`dip`), a hop is back on the floor, the Robot
 *   and Vogue snap to their next pose. In between it's smooth.
 * - A Dancer (one per person dancing) eases the body towards the shape (exp smoothing, as the DJ in
 *   rooftop/dancer.ts does), so changing moves or Freestyle picking a new one blends, never pops. It
 *   works the shape out a few hundredths of a second ahead, so the easing doesn't drag it off the beat.
 * - The feet stay on the floor: legs are one piece from the hip, so bending the knees is spreading the
 *   legs, and the hips go down by as much as the leg that's most upright lifts its foot (`plant`).
 * - How hard the music goes (`energy`) makes the bounce, the hops and the sway bigger; with reduced
 *   motion it's all toned down and nobody jumps or spins.
 *
 * The Bones' arms and legs: `R` is the character's right, on -x (forward is +z). Below, an arm's `f`
 * is how far forward it's raised (π/2 straight ahead, ~2.9 overhead) and `o` how far out to the side
 * (π/2 level, ~2.9 overhead; less than 0 across the body). The same for the legs.
 */

/** What a move makes of the body. */
export interface Shape {
  /** Arms: forward and out (see above). */
  rf: number;
  ro: number;
  lf: number;
  lo: number;
  /** Legs: forward and out. */
  rlf: number;
  rlo: number;
  llf: number;
  llo: number;
  /** Knees bent, 0 standing … 1 deep (spreads the legs; the hips come down, the feet stay put). */
  crouch: number;
  /** A hop: the whole body off the floor (m). */
  lift: number;
  /** Hips to their left (+x, m) and forward (m). */
  hx: number;
  hz: number;
  /** The body leaning forward, turned to their left, tilted to their left (radians). */
  lean: number;
  twist: number;
  tilt: number;
  /** The head: nodding down, turned to their left, cocked to their left. */
  nod: number;
  turn: number;
  cock: number;
}

const KEYS = ['rf', 'ro', 'lf', 'lo', 'rlf', 'rlo', 'llf', 'llo', 'crouch', 'lift', 'hx', 'hz', 'lean', 'twist', 'tilt', 'nod', 'turn', 'cock'] as const;
/** Standing: arms a little off the body. */
const REST: Shape = { rf: 0.05, ro: 0.1, lf: 0.05, lo: 0.1, rlf: 0, rlo: 0, llf: 0, llo: 0, crouch: 0, lift: 0, hx: 0, hz: 0, lean: 0, twist: 0, tilt: 0, nod: 0, turn: 0, cock: 0 };
/** What a move adds to the body, scaled by how hard the music goes. */
const SCALED = new Set<keyof Shape>(['crouch', 'lift', 'hx', 'hz', 'tilt', 'nod']);

const TAU = Math.PI * 2;
const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
/** 1 on the beat, 0 half way to the next: the bounce. */
const dip = (p: number) => 0.5 + 0.5 * Math.cos(TAU * p);
/** -1 … 1, dwelling at the ends: a weight shift that lands on the beat and stays a moment. */
const shift = (x: number) => Math.sign(x) * Math.sqrt(Math.abs(x));

/** Hip to foot (rig.ts' HIPS): how far the hips come down when a leg's turned. */
const LEG = 0.42;

/** The roof's music: the house DJ's frame, or a set's with its own tempo. */
export type DanceFrame = DjFrame & { bpm?: number };
/** What a move (or Freestyle's extra) does at count `c`; returns how fast the body eases into it (per second). */
type Move = (s: Shape, c: number, f: DanceFrame) => number;

/** Arms for the Robot and Vogue, one shape a count: [rf, ro, lf, lo, turn, twist, nod]. */
type Snap = readonly [number, number, number, number, number, number, number];
const ROBOT: readonly Snap[] = [
  [1.57, 0, 1.57, 0, 0, 0, 0],
  [1.57, 0, 0.05, 1.57, -0.45, -0.2, 0],
  [0.05, 1.57, 0.05, 1.57, 0.45, 0.2, 0],
  [0.4, 0.55, 0.4, 0.55, 0, 0, 0.25],
  [0.05, 2.9, 1.57, 0, -0.35, 0.25, -0.1],
  [1.57, 0, 0.05, 2.9, 0.35, -0.25, -0.1],
  [1.57, -0.35, 1.57, -0.35, 0, 0, 0.2],
  [0.05, 1.57, 1.57, 0, 0.5, 0.35, 0],
];
const VOGUE: readonly Snap[] = [
  [2.45, -0.5, 2.45, -0.5, 0, 0, 0],
  [0.05, 2.9, -0.3, 0.75, 0.5, 0.3, -0.1],
  [0.05, 1.57, 2.6, -0.3, -0.4, -0.2, 0],
  [1.9, 0.55, 1.9, 0.55, 0, 0, -0.15],
  [-0.3, 0.75, 0.05, 2.9, -0.5, -0.3, -0.1],
  [0.05, 2.2, 0.05, 2.2, 0, 0, -0.25],
  [2.0, -0.75, 0.05, 1.0, 0.3, 0.15, 0.1],
  [2.8, 0.9, 2.8, 0.9, -0.2, 0, 0.15],
];
function snapTo(s: Shape, a: Snap) {
  [s.rf, s.ro, s.lf, s.lo, s.turn, s.twist, s.nod] = a;
}

/** The Macarena's arms, one hand at a time: [count, right or left, f, o]. Counts 12–15 are the hips. */
const MACARENA: readonly (readonly [number, 'r' | 'l', number, number])[] = [
  [0, 'r', 1.57, -0.1], [1, 'l', 1.57, -0.1], [2, 'r', 1.45, 0.05], [3, 'l', 1.45, 0.05],
  [4, 'r', 1.35, -1.1], [5, 'l', 1.35, -1.1], [6, 'r', 2.75, 0.9], [7, 'l', 2.75, 0.9],
  [8, 'r', 0.6, -0.7], [9, 'l', 0.6, -0.7], [10, 'r', -0.35, 0.25], [11, 'l', -0.35, 0.25],
];

const MOVES: Record<FreestylePick, Move> = {
  twostep(s, c) {
    const p = c - Math.floor(c);
    const side = shift(-Math.cos(Math.PI * c)); // +1 their left on even counts
    s.hx = 0.07 * side;
    s.tilt = -0.06 * side;
    s.twist = 0.18 * side;
    s.llo = 0.22 * Math.max(0, side);
    s.rlo = 0.22 * Math.max(0, -side);
    s.rf = 0.65 + 0.35 * side;
    s.lf = 0.65 - 0.35 * side;
    s.ro = s.lo = -0.15;
    s.crouch = 0.3 * dip(p);
    s.nod = 0.12 * dip(p);
    s.cock = 0.08 * side;
    return 16;
  },
  runningman(s, c) {
    const n = Math.floor(c);
    const p = c - n;
    const up = Math.sin(Math.PI * p);
    const right = n % 2 === 0;
    // A knee up through the count while the other foot slides back, landing on the beat.
    if (right) [s.rlf, s.llf] = [1.1 * up, -0.35 * up];
    else [s.llf, s.rlf] = [1.1 * up, -0.35 * up];
    s.rf = right ? -0.4 : 0.95;
    s.lf = right ? 0.95 : -0.4;
    s.ro = s.lo = 0.12;
    s.lean = 0.12;
    s.crouch = 0.15 + 0.25 * dip(p);
    s.nod = 0.1 * dip(p);
    s.twist = (right ? 1 : -1) * 0.12;
    return 18;
  },
  robot(s, c) {
    const n = Math.floor(c);
    const p = c - n;
    snapTo(s, ROBOT[((n % 8) + 8) % 8]);
    // A little settle after each snap, like a servo stopping.
    const tick = 0.05 * Math.exp(-p * 10) * Math.sin(p * 60);
    s.rf += tick;
    s.lf -= tick;
    s.llf = n % 4 === 1 ? 0.3 : 0;
    s.rlf = n % 4 === 3 ? 0.3 : 0;
    return 32;
  },
  shuffle(s, c) {
    const u = c * 2;
    const k = Math.floor(u);
    const q = u - k;
    const kick = Math.sin(Math.PI * q);
    // Running-man kicks twice a count, out to the side by turns; the arms cut shapes across the body.
    if (k % 2 === 0) [s.rlf, s.rlo, s.llf] = [0.5 * kick, 0.35 * kick, -0.15 * kick];
    else [s.llf, s.llo, s.rlf] = [0.5 * kick, 0.35 * kick, -0.15 * kick];
    const cut = Math.sin(Math.PI * c);
    s.rf = s.lf = 1.15;
    s.ro = -0.35 + 0.95 * cut;
    s.lo = -0.35 - 0.95 * cut;
    s.twist = -0.3 * cut;
    s.hx = 0.06 * cut;
    s.crouch = 0.35 + 0.25 * dip(q);
    s.lean = 0.1;
    s.nod = 0.08 * dip(q);
    return 20;
  },
  disco(s, c) {
    const n = Math.floor(c);
    const up = Math.floor(n / 2) % 2 === 0;
    const right = Math.floor(n / 8) % 2 === 0;
    // One finger up to the sky, then down across to the other hip; the other hand on the hip.
    const [pf, po] = up ? [0.35, 2.5] : [0.6, -0.65];
    if (right) [s.rf, s.ro, s.lf, s.lo] = [pf, po, -0.3, 0.75];
    else [s.lf, s.lo, s.rf, s.ro] = [pf, po, -0.3, 0.75];
    const side = right ? -1 : 1;
    s.nod = up ? -0.28 : 0.18;
    s.turn = side * (up ? 0.3 : -0.2);
    s.hx = 0.07 * Math.sin(Math.PI * c);
    s.tilt = 0.08 * Math.sin(Math.PI * c) + side * (up ? 0.06 : -0.04);
    s.crouch = 0.2 * dip(c - n);
    s.llf = right ? 0.2 : 0;
    s.rlf = right ? 0 : 0.2;
    return 20;
  },
  armwave(s, c) {
    // A wave in from the right hand, through the shoulders and the chest, out of the left, every four counts.
    const ph = (TAU * c) / 4;
    s.rf = s.lf = 0.2;
    s.ro = 1.45 + 0.42 * Math.sin(ph);
    s.lo = 1.45 + 0.42 * Math.sin(ph - 2.4);
    s.tilt = 0.09 * Math.sin(ph - 1.2);
    s.hx = 0.05 * Math.sin(ph - 1.2);
    s.cock = 0.14 * Math.sin(ph - 1.6);
    s.crouch = 0.15 + 0.2 * dip(c - Math.floor(c));
    return 10;
  },
  floss(s, c) {
    const hips = shift(Math.cos(Math.PI * c)); // their left on even counts
    const arms = -hips; // and the arms the other way, one behind, one in front
    s.hx = 0.09 * hips;
    s.ro = 0.5 * arms;
    s.lo = -0.5 * arms;
    s.rf = -0.4 * arms;
    s.lf = 0.4 * arms;
    s.tilt = 0.05 * hips;
    s.crouch = 0.15;
    return 22;
  },
  handsup(s, c, f) {
    const n = Math.floor(c);
    const p = c - n;
    const air = Math.sin(Math.PI * p);
    const go = 0.4 + 0.6 * f.energy;
    // Hands in the air, pumping on the beat, a hop every count with a kick by turns: back down on the beat.
    s.ro = s.lo = 2.95 - 0.35 * dip(p);
    s.rf = s.lf = 0.15;
    s.lift = 0.11 * go * air;
    if (n % 2) [s.rlf, s.llf] = [0.65 * air, -0.15 * air];
    else [s.llf, s.rlf] = [0.65 * air, -0.15 * air];
    s.nod = -0.15 + 0.15 * dip(p);
    s.crouch = 0.25 * dip(p);
    return 18;
  },
  headbang(s, c) {
    const n = Math.floor(c);
    const p = c - n;
    const d = dip(p);
    const horns = Math.floor(n / 8) % 2 === 0;
    // Horns up on one side pumping, a fist low on the other, the head right down on every beat.
    const [uf, uo, lf, lo] = [0.4, 2.6 - 0.3 * d, 0.8 + 0.3 * d, -0.1];
    if (horns) [s.lf, s.lo, s.rf, s.ro] = [uf, uo, lf, lo];
    else [s.rf, s.ro, s.lf, s.lo] = [uf, uo, lf, lo];
    s.nod = -0.1 + 0.6 * d;
    s.lean = 0.12 + 0.12 * d;
    s.crouch = 0.5 + 0.2 * d;
    return 20;
  },
  vogue(s, c) {
    const n = Math.floor(c);
    snapTo(s, VOGUE[((n % 8) + 8) % 8]);
    s.tilt = n % 2 ? 0.07 : -0.07;
    if (n % 2) s.llf = 0.25;
    else s.rlf = 0.25;
    s.crouch = n % 8 === 7 ? 0.7 : 0.1;
    return 30;
  },
  moonwalk(s, c) {
    const n = Math.floor(c);
    const p = ease(c - n);
    // A foot slides back straight while the other knee's bent, swapping every count; gliding back, then forward.
    const [a, b] = n % 2 ? [p, 1 - p] : [1 - p, p];
    s.rlf = 0.32 * a - 0.25 * b;
    s.llf = 0.32 * b - 0.25 * a;
    s.hz = 0.13 * Math.cos((Math.PI * c) / 4);
    s.lean = 0.07;
    s.nod = 0.12;
    s.rf = 0.25 * (a - b);
    s.lf = 0.25 * (b - a);
    s.ro = s.lo = 0.15;
    return 14;
  },
  bounce(s, c) {
    const n = Math.floor(c);
    const p = c - n;
    const side = Math.floor(n / 2) % 2 ? 1 : -1;
    const brush = ((n % 2) + p) / 2; // through two counts
    // Bounce on the beat, lean to one side, brush the hair back with that hand.
    s.crouch = 0.3 + 0.4 * dip(p);
    s.tilt = 0.12 * side;
    s.twist = 0.15 * side;
    const [hf, ho, of, oo] = [2.6, 0.35 + 0.55 * brush, 0.3 * dip(p), 0.15];
    if (side > 0) [s.lf, s.lo, s.rf, s.ro] = [hf, ho, of, oo];
    else [s.rf, s.ro, s.lf, s.lo] = [hf, ho, of, oo];
    s.nod = 0.15 * dip(p);
    s.cock = 0.1 * side;
    return 16;
  },
  macarena(s, c, f) {
    const n = Math.floor(c);
    const p = c - n;
    const k = ((n % 16) + 16) % 16;
    // Each hand where its last step put it (a step before the loop came round: from the counts before).
    s.rf = s.lf = -0.35;
    s.ro = s.lo = 0.25;
    for (const [at, side, f1, o1] of MACARENA) {
      if (k < 12 && at > k) break;
      if (side === 'r') [s.rf, s.ro] = [f1, o1];
      else [s.lf, s.lo] = [f1, o1];
    }
    s.crouch = 0.15 * dip(p);
    if (k >= 12 && k < 15) {
      s.hx = 0.08 * Math.sin(TAU * c);
      s.hz = 0.06 * Math.cos(TAU * c);
      s.crouch = 0.3;
    } else if (k === 15) {
      // A hop round on the last count (see SPIN).
      s.lift = 0.14 * Math.sin(Math.PI * p) * (0.5 + 0.5 * f.energy);
    }
    return 18;
  },
  sway(s, c) {
    const bar = Math.floor(c / 4);
    // A breakdown: swaying slowly, looking up; hands up waving through its second half.
    s.tilt = 0.1 * Math.sin((Math.PI * c) / 2);
    s.hx = 0.06 * Math.sin((Math.PI * c) / 2);
    s.twist = 0.15 * Math.sin((Math.PI * c) / 4);
    s.nod = -0.15;
    s.crouch = 0.12;
    if (bar % 8 >= 4) {
      const wave = Math.sin((Math.PI * c) / 2);
      s.rf = s.lf = 0.25;
      s.ro = 2.5 + 0.25 * wave;
      s.lo = 2.5 - 0.25 * wave;
    } else {
      s.rf = 0.3 * Math.sin((Math.PI * c) / 2);
      s.lf = -s.rf;
      s.ro = s.lo = 0.25;
    }
    return 6;
  },
  rise(s, c, f) {
    const r = f.rise;
    const p = c - Math.floor(c);
    // A build: lower and lower as it rises, a fist pumping (twice a count past half way), then clapping overhead.
    s.crouch = 0.25 + 0.75 * r;
    s.lean = 0.1 + 0.1 * r;
    s.nod = 0.1 * dip(p);
    if (r > 0.75) {
      const clap = Math.sin(((c * 2) % 1) * Math.PI);
      s.rf = s.lf = 0.25;
      s.ro = s.lo = 2.65 - 0.4 * clap;
      s.nod = -0.2;
    } else {
      const pump = r > 0.4 ? Math.sin(((c * 2) % 1) * Math.PI) : Math.sin(p * Math.PI);
      s.lf = 0.3;
      s.lo = 2.7 - 0.45 * pump;
      s.rf = 0.5;
      s.ro = 0.1;
    }
    return 14;
  },
  jump(s, _c, f) {
    const beat = 60 / Math.min(200, Math.max(60, f.bpm ?? HOUSE_BPM));
    // The drop lands: up in the air with both hands (and round once on its first beat, see SPIN).
    s.lift = 0.3 * Math.sin(Math.PI * Math.min(1, f.sinceDrop / (beat * 2)));
    s.ro = s.lo = 2.8;
    s.rf = s.lf = 0.1;
    s.rlf = s.llf = 0.55 * Math.sin(Math.PI * Math.min(1, f.sinceDrop / (beat * 2)));
    s.nod = -0.2;
    return 22;
  },
};

/** A turn right round that isn't eased (so it doesn't unwind): the Macarena's hop, the drop's jump. */
function spinOf(pick: FreestylePick, c: number, f: DanceFrame): number {
  if (pick === 'macarena' && ((Math.floor(c) % 16) + 16) % 16 === 15) return ease(c - Math.floor(c)) * TAU;
  if (pick === 'jump') {
    const beat = 60 / Math.min(200, Math.max(60, f.bpm ?? HOUSE_BPM));
    return f.sinceDrop < beat ? ease(f.sinceDrop / beat) * TAU : 0;
  }
  return 0;
}

/** What `dance` (a move, or Freestyle for someone with `seed`) is at in `f`. */
export function pickOf(dance: DanceId, f: DanceFrame, seed: number): FreestylePick {
  return dance === 'freestyle' ? freestyleAt(f, seed) : dance;
}

/** Works out the shape `pick` is in at `f` (into `s`); returns how fast to ease into it. */
export function shapeAt(s: Shape, pick: FreestylePick, f: DanceFrame, lead = 0): number {
  Object.assign(s, REST);
  return MOVES[pick](s, danceCounts(f) + lead * danceTempo(f), f);
}

/** One person dancing: eases their body into the move's shape each frame, and keeps their feet down. */
export class Dancer {
  private readonly now: Shape = { ...REST };
  private readonly want: Shape = { ...REST };
  /** The move it's at, for the tests and the console. */
  pick: FreestylePick | null = null;

  constructor(readonly seed: number) {}

  /** Poses `b` for `dance` at `f`: `motion` false tones it all down (reduced motion). */
  pose(b: Bones, dt: number, f: DanceFrame, dance: DanceId, motion: boolean) {
    const pick = (this.pick = pickOf(dance, f, this.seed));
    const rate = shapeAt(this.want, pick, f, 0.05);
    const go = motion ? 0.55 + 0.45 * f.energy : 0.3;
    const k = 1 - Math.exp(-dt * (motion ? rate : Math.min(rate, 8)));
    const w = this.want;
    const s = this.now;
    for (const key of KEYS) {
      let to = w[key];
      if (SCALED.has(key)) to *= go;
      if (!motion) to = REST[key] + (to - REST[key]) * (key === 'lift' ? 0 : 0.45);
      s[key] += (to - s[key]) * k;
    }
    const spin = motion ? spinOf(pick, danceCounts(f), f) : 0;
    apply(b, s, spin);
  }
}

/** Sets the bones from a shape (see Shape for the directions). */
function apply(b: Bones, s: Shape, spin: number) {
  const crouch = Math.max(0, s.crouch);
  // Knees bent: the legs spread and come forward a little.
  const rlf = s.rlf + 0.3 * crouch;
  const llf = s.llf + 0.3 * crouch;
  const rlo = s.rlo + 0.5 * crouch;
  const llo = s.llo + 0.5 * crouch;
  const lean = s.lean + 0.15 * crouch;
  b.armR.rotation.set(-s.rf, 0, -s.ro);
  b.armL.rotation.set(-s.lf, 0, s.lo);
  // The legs hang from the body: they lean and tilt with it unless they're turned back by as much.
  b.legR.rotation.set(-rlf - lean, 0, -rlo + s.tilt);
  b.legL.rotation.set(-llf - lean, 0, llo + s.tilt);
  // The hips come down by as much as the more upright leg lifts its foot: that one stays on the floor.
  const plant = Math.min(LEG * (1 - Math.cos(rlf) * Math.cos(rlo)), LEG * (1 - Math.cos(llf) * Math.cos(llo)));
  b.body.position.set(s.hx, Math.max(0, s.lift) - plant, s.hz);
  b.body.rotation.set(lean, s.twist + spin, -s.tilt);
  b.head.rotation.set(s.nod - 0.1 * crouch, s.turn, -s.cock);
}
