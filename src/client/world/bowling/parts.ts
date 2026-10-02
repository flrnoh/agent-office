import type * as THREE from 'three';
import type { BowlingLights } from '../../../shared/bowling';
import type { ServerMsg } from '../../../shared/protocol';
import type { Collider, Interactable } from '../types';

/*
 * The bowling centre's seam (flrnoh fork, see shared/bowling.ts and FORK.md "The bowling centre"):
 * the building's half (features/bowling/) builds the room and runs the place; the bowling game, the
 * karaoke bar and the mini golf join in with `addBowlingPart(...)` from their own install functions,
 * each building only in its own zone (ZONES in shared/bowling.ts). Nothing else of the building's
 * half is theirs to import.
 */

/** The room inside, as the building's half hands it to every part once it's built (the first time anyone goes in). */
export interface BowlingRoom {
  /** Interior coordinates, the floor at y 0. What the crosshair can pick. */
  group: THREE.Group;
  /** What you walk into in there (the player's). */
  colliders: Collider[];
  /** What E and the hint look at. */
  interactables: Interactable[];
}

/** Something in the bowling centre. Everything's optional. */
export interface BowlingPart {
  /** Called once with the room built: add meshes to `room.group`, push colliders and interactables. */
  build?(room: BowlingRoom): void;
  /** E (or another key) at one of its interactables: true when it was its. */
  use?(it: Interactable, key: string): boolean;
  /** The hint bar over one of its interactables, or null when it isn't its. */
  hint?(it: Interactable, title: (t: string) => HTMLElement, key: (k: string, label: string) => HTMLElement, aside: (t: string) => HTMLElement): { k: string; parts: (HTMLElement | string)[] } | null;
  /** Every message from the office (inside or not). */
  onMessage?(msg: ServerMsg): void;
  /** Every frame while you're inside. */
  update?(t: number, dt: number): void;
  /** You came in (true) or went out (false). */
  place?(inside: boolean): void;
  /** The lights switched (and once on coming in): cosmic bowling has the house lights down and the UV on. */
  lights?(lights: BowlingLights): void;
}

const parts: BowlingPart[] = [];
const joined = new Set<(part: BowlingPart) => void>();

/** A part joins the centre. If the room is built already, it's built into it straight away. */
export function addBowlingPart(part: BowlingPart): void {
  parts.push(part);
  for (const fn of joined) fn(part);
}

/** The building's half: every part so far, and each one that joins later. */
export function bowlingParts(onJoin: (part: BowlingPart) => void): readonly BowlingPart[] {
  joined.add(onJoin);
  return parts;
}
