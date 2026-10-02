import type * as THREE from 'three';
import type { InstrumentNote, VenueMode } from '../../../shared/venue';
import type { ServerMsg } from '../../../shared/protocol';
import type { Collider, Interactable } from '../types';

/*
 * The Schallwerk's seam (flrnoh fork, see shared/venue.ts and FORK.md "The Schallwerk"): the
 * building (client/venue/, world/venue/) builds the house and runs the place; the instruments, the
 * rehearsal wing and the show join in with `addVenuePart(...)` from their own install functions,
 * each building only in its own zone (ZONES in shared/venue.ts). Nothing else of the building's is
 * theirs to import, and nothing of one part's is another's, bar the two seams at the bottom.
 */

/** The house inside, as the building hands it to every part once it's built (the first time anyone goes in). */
export interface VenueRoom {
  /** Interior coordinates, the floor at y 0. What the crosshair can pick. */
  group: THREE.Group;
  /** What you walk into in there (the player's). */
  colliders: Collider[];
  /** What E and the hint look at. */
  interactables: Interactable[];
}

/** Something in the Schallwerk. Everything's optional. */
export interface VenuePart {
  /** Called once with the house built: add meshes to `room.group`, push colliders and interactables. */
  build?(room: VenueRoom): void;
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
  /** The house switched between concert and club (and once on coming in). */
  mode?(mode: VenueMode): void;
}

const parts: VenuePart[] = [];
const joined = new Set<(part: VenuePart) => void>();

/** A part joins the venue. If the house is built already, it's built into it straight away. */
export function addVenuePart(part: VenuePart): void {
  parts.push(part);
  for (const fn of joined) fn(part);
}

/** The building's: every part so far, and each one that joins later. */
export function venueParts(onJoin: (part: VenuePart) => void): readonly VenuePart[] {
  joined.add(onJoin);
  return parts;
}

// ---- Seams between parts --------------------------------------------------------------------------

/**
 * The instruments' synth, for whoever wants to sound a note without anyone playing it (the
 * studio's recorder playing a take back). The instruments part sets it when it installs; until
 * then (and in tests) notes go nowhere. `at` is where it sounds, in interior coordinates, so it's
 * heard as if from there (and only in that room, see venueRoomAt).
 */
export interface VenueSynth {
  play(note: InstrumentNote, at: { x: number; y: number; z: number }): void;
}
let synth: VenueSynth | null = null;
export const setVenueSynth = (s: VenueSynth | null) => {
  synth = s;
};
export const venueSynth = (): VenueSynth | null => synth;

/**
 * How loud the show is right now, 0..1 (the stage's instruments and the DJ booth together), for
 * the lights and the crowd to move with. The instruments part and the show's DJ booth report into
 * it; the building's light show and the show's crowd read it.
 */
const levels = new Map<string, number>();
export const setVenueLevel = (source: string, level: number) => {
  levels.set(source, Math.max(0, Math.min(1, level)));
};
export const venueLevel = (): number => Math.min(1, [...levels.values()].reduce((a, b) => a + b, 0));
