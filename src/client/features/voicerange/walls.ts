/**
 * flrnoh fork (see FORK.md "Hörkreise" and "The rehearsal wing"): walls voice doesn't get through,
 * whatever the circles say. A part with rooms of their own (the Schallwerk's rehearsal rooms) adds a
 * wall: given where you and someone else are, whether a wall stands between you. Then your voice
 * isn't sent to them (index.ts, the gate: not even the PA's) and theirs isn't played to you
 * (features/peers, the volume).
 */

/** Where someone is: the floor (or place) they're on, and where on it. */
export interface Earshot {
  floor?: string | null;
  x: number;
  z: number;
}

export type VoiceWall = (a: Earshot, b: Earshot) => boolean;

const walls: VoiceWall[] = [];

/** A wall voice doesn't get through. What it hands back takes it down again. */
export function addVoiceWall(wall: VoiceWall): () => void {
  walls.push(wall);
  return () => {
    const i = walls.indexOf(wall);
    if (i >= 0) walls.splice(i, 1);
  };
}

/** Whether any wall stands between `a` and `b`. */
export const voiceWalled = (a: Earshot, b: Earshot): boolean => walls.some((w) => w(a, b));
