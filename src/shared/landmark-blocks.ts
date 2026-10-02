// flrnoh fork (see FORK.md): which blocks the city's landmarks stand on (see shared/landmarks.ts).
// No imports, so shared/city.ts can read it while it lays itself out without an import cycle.

export type LandmarkId = 'tankstelle' | 'kino' | 'baumarkt';

export interface Landmark {
  id: LandmarkId;
  /** The block it stands on (see blockAt in shared/city.ts). */
  i: number;
  j: number;
}

export const LANDMARKS: readonly Landmark[] = [
  // On the office's street, west of the office: the street side is south (+z).
  { id: 'tankstelle', i: -2, j: 0 },
  // Behind the office to the north-west.
  { id: 'kino', i: -1, j: -1 },
  // North-east, a block further out: room for its car park and garden centre.
  { id: 'baumarkt', i: 1, j: -2 },
];

/** The landmark on block (i, j), if any. */
export const landmarkAt = (i: number, j: number): Landmark | undefined => LANDMARKS.find((l) => l.i === i && l.j === j);
