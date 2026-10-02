import { BAY, DOCK, ENTRANCE, HALL, INSIDE, SOLIDS, inForkArea, localPoint, rectHits, rectInArea, type Box } from './baumarkt.js';
import type { CarPose, Pedals } from './garage.js';

// flrnoh fork (see FORK.md "The Baumarkt"): what there is to do at HAMMER & CO (layout in baumarkt.ts).
// The forklift, driven by whoever's on it like the garage's cars (their page runs it, the office checks
// it stays in the hall and the bay and passes it on) with its rear wheels steering and its forks going
// up and down; the pallets it lifts and sets down, which the office keeps track of; the shopping
// trolleys you push about; the tools off the tool wall and the paint from the shaker in your hand; and
// the PA's announcements now and then. Every floor has its own (see server/baumarkt.ts).

// ---- The forklift ------------------------------------------------------------------------------

/**
 * Its body in its own frame (x across, z toward the forks): from REAR to NOSE, HALF_W either side.
 * The drive wheels are at the front (FRONT_AXLE), the steering wheels at the back (REAR_AXLE): it
 * turns about its front axle and its tail swings out.
 */
export const FORKLIFT = { HALF_W: 0.6, REAR: -1.35, NOSE: 0.95, FRONT_AXLE: 0.5, REAR_AXLE: -1.0, FORK_LEN: 1.15 } as const;
/** Where a carried pallet's middle is, ahead of its nose. */
export const FORK_MID = FORKLIFT.NOSE + 0.08 + FORKLIFT.FORK_LEN / 2;
/** How high the forks go (m over the floor), and how fast. */
export const LIFT_MAX = 2.6;
export const LIFT_RATE = 0.7;
/** Forks raised past this pick up the pallet they're in; lowered to this they set it down. */
export const PICK_UP = 0.06;
export const SET_DOWN = 0.03;

export interface ForkTuning {
  top: number;
  reverse: number;
  accel: number;
  brake: number;
  coast: number;
  steer: number;
  steerRate: number;
}
export const FORK_TUNING: ForkTuning = { top: 4.2, reverse: 2.6, accel: 2.4, brake: 5, coast: 2.2, steer: 0.95, steerRate: 2.6 };
const WHEELBASE = FORKLIFT.FRONT_AXLE - FORKLIFT.REAR_AXLE;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * The forklift `dt` seconds on with these pedals: a bicycle model about its front axle, so the back
 * swings out as the rear wheels steer. A turns its nose left, D right, like any car.
 */
export function driveForklift(p: CarPose, pedals: Pedals, dt: number, t: ForkTuning = FORK_TUNING): CarPose {
  const want = clamp(pedals.turn, -1, 1) * t.steer;
  const steer = p.steer + clamp(want - p.steer, -t.steerRate * dt, t.steerRate * dt);
  let v = p.speed;
  const toward = (target: number, rate: number) => (v += clamp(target - v, -rate * dt, rate * dt));
  const gas = clamp(pedals.gas, -1, 1);
  if (pedals.brake) toward(0, t.brake);
  else if (gas > 0) v = v < 0 ? Math.min(0, v + t.brake * dt) : Math.min(t.top, v + t.accel * gas * dt);
  else if (gas < 0) v = v > 0 ? Math.max(0, v - t.brake * dt) : Math.max(-t.reverse, v + t.accel * gas * dt);
  else toward(0, t.coast);
  const yaw = (v * Math.tan(steer)) / WHEELBASE;
  const front = localPoint(p, 0, FORKLIFT.FRONT_AXLE);
  const mid = p.rotY + (yaw * dt) / 2;
  const fx = front.x + Math.sin(mid) * v * dt;
  const fz = front.z + Math.cos(mid) * v * dt;
  const rotY = wrap(p.rotY + yaw * dt);
  return { x: fx - Math.sin(rotY) * FORKLIFT.FRONT_AXLE, z: fz - Math.cos(rotY) * FORKLIFT.FRONT_AXLE, rotY, speed: v, steer };
}

/** The body as a rectangle round its middle: its middle, and half its width and length. */
export function forkBody(p: { x: number; z: number; rotY: number }) {
  const mid = (FORKLIFT.NOSE + FORKLIFT.REAR) / 2;
  return { at: { ...localPoint(p, 0, mid), rotY: p.rotY }, hw: FORKLIFT.HALF_W, hl: (FORKLIFT.NOSE - FORKLIFT.REAR) / 2 };
}

/** Where the middle of what's on the forks is, and which way it lies. */
export function forkMid(p: { x: number; z: number; rotY: number }): { x: number; z: number; rotY: number } {
  return { ...localPoint(p, 0, FORK_MID), rotY: p.rotY };
}

// ---- Pallets ----------------------------------------------------------------------------------

/** A Euro pallet: 1.2 m along its runners (the way the forks go in), 0.8 across, and what's stacked on it. */
export const PALLET = { HALF_L: 0.6, HALF_W: 0.4, H: 0.144 } as const;
export type PalletLoad = 'cement' | 'boxes' | 'tiles' | 'bricks' | 'soil' | 'timber';
export interface PalletDef {
  load: PalletLoad;
  x: number;
  z: number;
  rotY: number;
}
const WEST = INSIDE.minX + 2.6;
export const PALLETS: readonly PalletDef[] = [
  { load: 'cement', x: WEST, z: HALL.minZ + 4.5, rotY: 0 },
  { load: 'boxes', x: WEST, z: HALL.minZ + 7.5, rotY: 0 },
  { load: 'tiles', x: WEST, z: HALL.maxZ - 6.5, rotY: 0 },
  { load: 'bricks', x: BAY.minX + 5, z: BAY.minZ + 7, rotY: 0 },
  { load: 'soil', x: BAY.minX + 5, z: BAY.minZ + 10.5, rotY: 0 },
  { load: 'timber', x: BAY.minX + 2.2, z: BAY.minZ + 15, rotY: 0 },
];
export const LOAD_H: Record<PalletLoad, number> = { cement: 0.75, boxes: 0.95, tiles: 0.55, bricks: 0.7, soil: 0.8, timber: 0.5 };

/** A pallet as the office has it: where it is, and how high (0 on the floor; up on the forks while carried). */
export interface PalletState {
  x: number;
  z: number;
  rotY: number;
  y: number;
}

/** The forklift as the office has it: who's on it, where it's got to, its forks, and the pallet on them (-1 none). */
export interface ForkliftState extends CarPose {
  lift: number;
  driver: string | null;
  carrying: number;
}

export const FORKLIFT_START = { x: BAY.minX + 6, z: HALL.maxZ - 3, rotY: Math.PI } as const;

/** Whether the forks (at `p`, down on the floor) are in pallet `pal`'s pockets: lined up with its runners and in far enough. */
export function forksIn(p: { x: number; z: number; rotY: number }, pal: PalletState): boolean {
  if (pal.y > PICK_UP) return false;
  const m = forkMid(p);
  const dx = pal.x - m.x;
  const dz = pal.z - m.z;
  const along = dx * Math.sin(p.rotY) + dz * Math.cos(p.rotY);
  const across = dx * Math.cos(p.rotY) - dz * Math.sin(p.rotY);
  const turned = Math.abs(wrap(2 * (pal.rotY - p.rotY))) / 2;
  return Math.abs(along) < 0.32 && Math.abs(across) < 0.18 && turned < 0.22;
}

/** Whether pallet `i` may stand at `at` on the floor: in the forklift's area, clear of the racks, the walls and every other pallet. */
export function palletFits(at: { x: number; z: number; rotY: number }, pallets: readonly PalletState[], i: number): boolean {
  const hw = PALLET.HALF_W;
  const hl = PALLET.HALF_L;
  if (!rectInArea(at, hw, hl)) return false;
  for (const b of SOLIDS) if (rectHits(at, hw, hl, b)) return false;
  for (let k = 0; k < pallets.length; k++) {
    if (k === i) continue;
    const o = pallets[k];
    if (Math.hypot(o.x - at.x, o.z - at.z) < 1.05) return false;
  }
  return true;
}

/**
 * The forks went from `before` up or down to `lift` at `p`: raised out of the bottom, they take the
 * pallet they're in; lowered to the floor, they set theirs down where it is (if it fits there). What's
 * on them follows them. Hands back what's carried now; the pallets are changed in place.
 */
export function liftStep(p: { x: number; z: number; rotY: number }, before: number, lift: number, carrying: number, pallets: PalletState[]): number {
  if (carrying >= 0 && pallets[carrying]) {
    const m = forkMid(p);
    const pal = pallets[carrying];
    Object.assign(pal, { x: m.x, z: m.z, rotY: m.rotY, y: lift });
    if (lift > SET_DOWN || !palletFits(m, pallets, carrying)) return carrying;
    pal.y = 0;
    return -1;
  }
  if (before > PICK_UP || lift <= PICK_UP) return -1;
  const i = pallets.findIndex((pal) => forksIn(p, pal));
  if (i < 0) return -1;
  pallets[i].y = lift;
  return i;
}

/** Whether the forklift fits at `p` (its body in the area, clear of the solids and the pallets on the floor; what it carries too). */
export function forkliftFits(p: { x: number; z: number; rotY: number }, carrying: number, pallets: readonly PalletState[], extra: readonly Box[] = []): boolean {
  const b = forkBody(p);
  if (!rectInArea(b.at, b.hw, b.hl)) return false;
  for (const s of SOLIDS) if (rectHits(b.at, b.hw, b.hl, s)) return false;
  for (const s of extra) if (rectHits(b.at, b.hw, b.hl, s)) return false;
  for (let k = 0; k < pallets.length; k++) {
    if (k === carrying || pallets[k].y > 0.5) continue;
    if (rectHits(b.at, b.hw, b.hl, palletBox(pallets[k]))) return false;
  }
  if (carrying >= 0) {
    const m = forkMid(p);
    if (!rectInArea(m, PALLET.HALF_W, PALLET.HALF_L)) return false;
    for (const s of SOLIDS) if (rectHits(m, PALLET.HALF_W, PALLET.HALF_L, s)) return false;
  }
  return true;
}

/** A pallet's footprint as a box (square to the hall, a little wider when it's turned). */
export function palletBox(p: PalletState): Box {
  const s = Math.abs(Math.sin(p.rotY));
  const c = Math.abs(Math.cos(p.rotY));
  const ex = PALLET.HALF_W * c + PALLET.HALF_L * s;
  const ez = PALLET.HALF_W * s + PALLET.HALF_L * c;
  return { minX: p.x - ex, maxX: p.x + ex, minZ: p.z - ez, maxZ: p.z + ez };
}

/** Whether the office takes a forklift pose: its middle in the area, the numbers sane. */
export function forkPoseOk(p: CarPose & { lift: number }): boolean {
  return [p.x, p.z, p.rotY, p.speed, p.steer, p.lift].every(Number.isFinite) && inForkArea(p.x, p.z);
}

// ---- Shopping trolleys --------------------------------------------------------------------------

export const TROLLEY = { HALF_W: 0.3, HALF_L: 0.48, AHEAD: 0.95 } as const;
/** The corral by the entrance: each trolley's slot, nested one behind the other. */
export const CORRAL = { x: ENTRANCE.x - 6.2, z: HALL.maxZ + 4, rotY: -Math.PI / 2 } as const;
export const TROLLEY_COUNT = 6;
export const corralSlot = (i: number) => ({ x: CORRAL.x + 1.4 - i * 0.42, z: CORRAL.z, rotY: CORRAL.rotY });

export interface TrolleyState {
  x: number;
  z: number;
  rotY: number;
  /** Who's pushing it (a PeerInfo id), or null. */
  by: string | null;
}

// ---- What's in your hand ----------------------------------------------------------------------

export type ToolId = 'drill' | 'screwdriver' | 'hammer' | 'chainsaw';
export interface Tool {
  id: ToolId;
  name: string;
  emoji: string;
  /** What a click does with it. */
  verb: string;
  blurb: string;
}
export const TOOLS: readonly Tool[] = [
  { id: 'drill', name: 'Bohrmaschine', emoji: '🔩', verb: 'Drill', blurb: 'Schlagbohrmaschine, 850 W: click and it whirrs' },
  { id: 'screwdriver', name: 'Akkuschrauber', emoji: '🪛', verb: 'Screw', blurb: '18 V, two speeds, the little light comes on' },
  { id: 'hammer', name: 'Hammer', emoji: '🔨', verb: 'Hammer', blurb: 'Schlosserhammer, 500 g: knock knock' },
  { id: 'chainsaw', name: 'Kettensäge', emoji: '🪚', verb: 'Saw', blurb: 'Petrol, 40 cm bar. Loud. Very loud' },
];
export const TOOL_BY_ID = new Map<ToolId, Tool>(TOOLS.map((t) => [t.id, t]));

/** The shaker's colours: a can of each, mixed while you wait. */
export const PAINTS: readonly { name: string; color: string }[] = [
  { name: 'Signalrot', color: '#d62828' },
  { name: 'Sonnengelb', color: '#ffd23f' },
  { name: 'Orange', color: '#f77f00' },
  { name: 'Grasgrün', color: '#4caf50' },
  { name: 'Mint', color: '#7fd8be' },
  { name: 'Himmelblau', color: '#4ea8de' },
  { name: 'Flieder', color: '#b388eb' },
  { name: 'Altrosa', color: '#e8a1b0' },
  { name: 'Anthrazit', color: '#3d405b' },
  { name: 'Schneeweiß', color: '#f8f9fa' },
];
/** How long the shaker shakes a can (ms). */
export const MIX_MS = 4200;

/** What you can hold here: a tool off the wall, or a can of paint `paint<i>` (its place in PAINTS). */
export type HeldId = ToolId | `paint${number}`;
export function isHeldId(v: unknown): v is HeldId {
  if (typeof v !== 'string') return false;
  if (TOOL_BY_ID.has(v as ToolId)) return true;
  const m = /^paint(\d{1,2})$/.exec(v);
  return !!m && Number(m[1]) < PAINTS.length;
}
export const paintOf = (h: HeldId | null | undefined): number => (h && h.startsWith('paint') ? Number(h.slice(5)) : -1);

// ---- The PA ----------------------------------------------------------------------------------

export const ANNOUNCEMENTS: readonly string[] = [
  'Kollege aus der Sanitärabteilung bitte zur Kasse 3. Kollege aus der Sanitärabteilung bitte zur Kasse 3.',
  'Der Halter des roten Lambos auf dem Parkplatz: Ihr Licht ist noch an.',
  'Liebe Kunden, heute im Angebot: Schrauben, so viele Sie tragen können.',
  'Herr Müller bitte in die Holzabteilung, der Zuschnitt wartet.',
  'Ein kleiner Junge namens Jarvis möchte an der Information abgeholt werden.',
  'Achtung, Staplerverkehr in Gang eins. Bitte Abstand halten.',
  'Unsere Farbmischmaschine schüttelt heute jede Farbe gratis. Alles aufs Haus!',
  'Liebe Kunden, in fünfzehn Minuten schließt unser Gartencenter. Die Pflanzen bleiben aber da.',
  'Kollegin aus der Fliesenabteilung bitte zur Kasse 1.',
  'Wer hat seinen Akkuschrauber am Werkzeugregal vergessen? Er vermisst Sie.',
];
/** One announcement in every PA_EVERY, at a time in it everyone's page works out alike. */
export const PA_EVERY = 150_000;
const hash = (k: number) => {
  let h = Math.imul(k ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
};
/** The announcement in the PA_EVERY slot that `ms` (the office's clock) falls in: when it's made and which. */
export function announcementIn(ms: number): { at: number; text: string; index: number } {
  const k = Math.floor(ms / PA_EVERY);
  const h = hash(k);
  const index = h % ANNOUNCEMENTS.length;
  return { at: k * PA_EVERY + (h % (PA_EVERY - 20_000)) + 10_000, text: ANNOUNCEMENTS[index], index };
}

// ---- The whole of it, and the messages -------------------------------------------------------

export interface BaumarktState {
  fork: ForkliftState;
  pallets: PalletState[];
  trolleys: TrolleyState[];
  /** What each person here holds (PeerInfo id → a tool or a can). */
  held: Record<string, HeldId>;
}

/** Everything where it is when the office starts. */
export function freshBaumarkt(): BaumarktState {
  return {
    fork: { ...FORKLIFT_START, speed: 0, steer: 0, lift: 0, driver: null, carrying: -1 },
    pallets: PALLETS.map((p) => ({ x: p.x, z: p.z, rotY: p.rotY, y: 0 })),
    trolleys: Array.from({ length: TROLLEY_COUNT }, (_, i) => ({ ...corralSlot(i), by: null })),
    held: {},
  };
}

export type BaumarktClientMsg =
  /** On the forklift (if nobody is), off it, and where it's got to with its forks. */
  | { t: 'bm.fork.enter' }
  | { t: 'bm.fork.leave' }
  | { t: 'bm.fork.drive'; x: number; z: number; rotY: number; speed: number; steer: number; lift: number }
  | { t: 'bm.fork.horn' }
  /** Take trolley `i` (if nobody has), push it to here, let go of it. */
  | { t: 'bm.trolley.grab'; i: number }
  | { t: 'bm.trolley.push'; i: number; x: number; z: number; rotY: number }
  | { t: 'bm.trolley.let' }
  /** Take a tool off the wall or a mixed can (null: put it back), and use it. */
  | { t: 'bm.hold'; item: HeldId | null }
  | { t: 'bm.use' }
  /** A can of paint `paint` (its place in PAINTS) into the shaker. */
  | { t: 'bm.mix'; paint: number };

export type BaumarktServerMsg =
  /** All of it, as it is now; `answer` to each enter/leave/grab/let of yours. */
  | { t: 'baumarkt'; state: BaumarktState; answer?: boolean }
  /** The forklift moved (or its forks), and the pallet on them with it. */
  | { t: 'bm.fork'; x: number; z: number; rotY: number; speed: number; steer: number; lift: number; carrying: number }
  | { t: 'bm.fork.horn' }
  /** A trolley's being pushed. */
  | { t: 'bm.trolley'; i: number; x: number; z: number; rotY: number }
  /** Someone took something in hand or put it back, used it, or put a can in the shaker. */
  | { t: 'bm.held'; id: string; item: HeldId | null }
  | { t: 'bm.used'; id: string; item: HeldId }
  | { t: 'bm.mixing'; id: string; paint: number };

/** Where the doors are, for anyone walking in or out: the entrance and the dock. */
export const DOORS = [
  { x: ENTRANCE.x, z: ENTRANCE.z, alongX: true, width: ENTRANCE.width },
  { x: DOCK.x, z: DOCK.z, alongX: false, width: DOCK.width },
] as const;
