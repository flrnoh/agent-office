import { driveAt, driveEnd, type Drive } from './drive.js';
import { pathOf, pathPoint, type Path, type Place } from './roads.js';

// flrnoh fork (see FORK.md "Waymo"): the robotaxi fleet as the office keeps it and every page draws
// it. Each car has the drive it's on (worked out by the office, shared/waymo/drive.ts), sent as where
// it starts, the crossings it goes through, where it ends, when it set off and where it is every
// quarter second; every page lays the same path from that (pathOf) and plays it back off the office's
// clock. While a booked car's way is changed it finishes the bit of its old drive up to where the new
// one starts (`prev`).

/** How many robotaxis there are in town. */
export const FLEET_SIZE = 8;
/** Its seats, in its own frame (nose +x, right +z): the driver's (always empty), beside it, three at the back. */
export const WAYMO_SEATS: readonly { x: number; z: number; front: boolean }[] = [
  { x: 0.2, z: 0.4, front: true },
  { x: -0.85, z: 0.45, front: false },
  { x: -0.85, z: -0.45, front: false },
  { x: -0.85, z: 0, front: false },
];
/** The driver's seat, where the wheel turns by itself. */
export const DRIVER_SEAT = { x: 0.2, z: -0.4 } as const;
/** How high your hips are, sitting in one (over the street). */
export const WAYMO_HIPS = 0.32;

/** A drive as it goes over the wire: the path's ends and crossings, when it set off, where it is every SAMPLE s. */
export interface WireDrive {
  id: number;
  from: Place;
  nodes: [number, number][];
  to: Place;
  t0: number;
  s: number[];
}

export type WaymoMode = 'cruise' | 'coming' | 'waiting' | 'riding' | 'arrived';

export interface WaymoCar {
  id: number;
  mode: WaymoMode;
  drive: WireDrive;
  /** The old drive it finishes first, up to where `drive` starts. */
  prev?: WireDrive;
  /** Who booked it, their initials (on the dome) and their color. */
  booker?: string;
  initials?: string;
  color?: string;
  /** Where it's taking them, and where it picks them up (the curb by `drive`'s end while coming). */
  dest?: { name: string; x: number; z: number };
  /** Who sits in each of WAYMO_SEATS. */
  riders: (string | null)[];
  /** Waiting or there: when it stops waiting (s on the office's clock). */
  until?: number;
}

export type WaymoClientMsg =
  /** The fleet as it is, please (a page that's just come). */
  | { t: 'waymo.hello' }
  /** A robotaxi to where you are (`x`, `z`), to take you to `dest`. */
  | { t: 'waymo.book'; x: number; z: number; dest: { name: string; x: number; z: number } }
  /** Never mind the one you booked. */
  | { t: 'waymo.cancel' }
  /** Get into car `car` (a seat's found for you), out of the one you're in, set off, pull over now, honk yours. */
  | { t: 'waymo.enter'; car: number }
  | { t: 'waymo.leave' }
  | { t: 'waymo.go' }
  | { t: 'waymo.pullover' }
  | { t: 'waymo.honk' };

export type WaymoServerMsg =
  /** Every car (to a page that said hello). */
  | { t: 'waymo.fleet'; cars: WaymoCar[] }
  /** One car changed. */
  | { t: 'waymo.car'; car: WaymoCar }
  /** Car `car` honked (its booker, to find it). */
  | { t: 'waymo.honked'; car: number };

/** The client messages, for the guests' lists. */
export const WAYMO_CLIENT_MSGS = ['waymo.hello', 'waymo.book', 'waymo.cancel', 'waymo.enter', 'waymo.leave', 'waymo.go', 'waymo.pullover', 'waymo.honk'] as const satisfies readonly WaymoClientMsg['t'][];
export const WAYMO_SERVER_MSGS = ['waymo.fleet', 'waymo.car', 'waymo.honked'] as const satisfies readonly WaymoServerMsg['t'][];

const paths = new Map<string, Path>();
const placeKey = (p: Place) => `${p.a},${p.b},${p.d},${p.along}`;
/** The path a wire drive goes along (laid once per drive; by what it is, not only its number, which starts again with the office). */
export function pathFor(d: WireDrive): Path {
  const k = `${d.id}|${placeKey(d.from)}|${d.nodes.join(';')}|${placeKey(d.to)}`;
  let p = paths.get(k);
  if (!p) {
    p = pathOf(d.from, d.nodes, d.to);
    paths.set(k, p);
    if (paths.size > 200) paths.delete(paths.keys().next().value!);
  }
  return p;
}

/** A wire drive as a drive. */
export const asDrive = (d: WireDrive): Drive => ({ path: pathFor(d), t0: d.t0, s: d.s });

export interface WaymoPose {
  x: number;
  z: number;
  yaw: number;
  speed: number;
  /** Stopped at the end of its drive. */
  done: boolean;
  /** How far along its path, and the path (for what's ahead: the corners, the screen's route). */
  s: number;
  path: Path;
}

/** Where car `c` is at `t` (s on the office's clock). */
export function waymoAt(c: WaymoCar, t: number): WaymoPose {
  const d = c.prev && t < c.drive.t0 ? c.prev : c.drive;
  const drive = asDrive(d);
  const at = driveAt(drive, t);
  const p = pathPoint(drive.path, at.s);
  return { x: p.x, z: p.z, yaw: p.yaw, speed: at.speed, done: at.done && d === c.drive, s: at.s, path: drive.path };
}

/** When car `c` gets where it's going (s on the office's clock). */
export const waymoEta = (c: WaymoCar) => driveEnd(asDrive(c.drive));

/** Two letters for the dome, from someone's name. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const two = words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '?').slice(0, 2);
  return two.toUpperCase();
}

/** A place someone asks to go to, as the office takes it: a name and a place on the map, else none. */
export function destOf(v: unknown): { name: string; x: number; z: number } | null {
  if (!v || typeof v !== 'object') return null;
  const { name, x, z } = v as Record<string, unknown>;
  if (typeof name !== 'string' || typeof x !== 'number' || typeof z !== 'number' || !Number.isFinite(x) || !Number.isFinite(z)) return null;
  if (Math.abs(x) > 1000 || Math.abs(z) > 1000) return null;
  return { name: name.slice(0, 40), x, z };
}
