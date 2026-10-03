import { lineX, lineZ, PERIOD, type Stretch } from './city.js';

// flrnoh fork (see FORK.md "Traffic lights and the city bus"): the Flogge Verkehrsbetriebe's network,
// Florian's "feste Linien". Every stop has a name and a place of its own (no longer wherever the street
// furniture happened to put a shelter), and each line a fixed round of them, with two buses on it.
// Plain numbers, no imports but the city's grid, so shared/streetside.ts can stand the stops on their
// strips and shared/citybus.ts work out the timetables from them without an import cycle.
//
// A bus drives on the right, so a stop serves the way that has it on its right: along x heading -x
// (west) that's the -z side, heading +x the +z side; along z heading -z (north) the +x side, heading
// +z the -x side. A stop is either a shelter (on the strip past the sidewalk, like the old ones) or,
// where there's no strip to stand one on (the office's own street, in front of a landmark), just the
// pole with its sign at the curb.

export interface StopDef {
  id: string;
  name: string;
  /** The street it's on: along x at z = lineZ(b), or along z at x = lineX(a). */
  alongX: boolean;
  a: number;
  b: number;
  /** Which side of the street (see the note above), and where along it (x for a street along x, else z). */
  side: -1 | 1;
  at: number;
  /** Just a pole and its sign at the curb, no shelter. */
  pole?: boolean;
}

/** Where a pole stands from the street's middle: on the sidewalk, half a meter in from the curb. */
export const POLE_OFF = 4.5;

const X = (b: number, side: -1 | 1, at: number, id: string, name: string, pole?: boolean): StopDef => ({ id, name, alongX: true, a: Math.floor((at - lineX(0)) / PERIOD), b, side, at, pole });
const Z = (a: number, side: -1 | 1, at: number, id: string, name: string, pole?: boolean): StopDef => ({ id, name, alongX: false, a, b: Math.floor((at - lineZ(0)) / PERIOD), side, at, pole });

/** Every stop in town. */
export const STOP_DEFS: readonly StopDef[] = [
  // The office's own street: west on the office's side, east across from it.
  X(0, -1, 50, 'bowling', 'Bowlingcenter', true),
  X(0, -1, -11, 'office', 'Flogge Office', true),
  X(0, 1, -54, 'casino', 'Casino'),
  X(0, 1, 6, 'soccer', 'Soccerhalle'),
  X(0, 1, 66, 'gym', 'Gym · Schallwerk'),
  // The side street west of the office, x = -28: north on the office's side, south on the cinema's.
  Z(-1, 1, -62, 'kino-ost', 'Kino'),
  Z(-1, -1, -168, 'stadtpark', 'Stadtpark'),
  Z(-1, -1, -114, 'kirche', 'Kirche'),
  Z(-1, -1, -60, 'kino', 'Kino', true),
  // The side street east of the office, x = 28, north past the bowling centre and the Baumarkt.
  Z(0, 1, -2, 'bowling-west', 'Bowlingcenter', true),
  Z(0, 1, -116, 'baumarkt-west', 'Baumarkt', true),
  // Up north and round the back.
  X(-4, -1, 2, 'nordstadt', 'Nordstadt', true),
  X(-2, 1, 62, 'baumarkt', 'Baumarkt'),
  Z(1, -1, -56, 'lindenallee', 'Lindenallee'),
  X(-1, -1, -60, 'kino-sued', 'Kino', true),
  // West and down into the south of town.
  Z(-2, -1, -8, 'tankstelle', 'Tankstelle', true),
  X(2, -1, -116, 'marktplatz', 'Marktplatz'),
  Z(-3, 1, 116, 'suedstadt', 'Südstadt'),
];

export const STOP_BY_ID = new Map(STOP_DEFS.map((s) => [s.id, s]));

/** The stretch of street a stop stands along. */
export function stopStretch(s: StopDef): Stretch {
  return { alongX: s.alongX, a: s.a, b: s.b };
}

/** A line: its number, where it's going (its display), its color, the crossings it goes round, and its stops in order. */
export interface LineDef {
  no: string;
  dest: string;
  color: string;
  /** The crossings (a, b on the city's grid) it turns at, going round. */
  round: [number, number][];
  /** Its stops, by id, in the order it comes to them: the first is where its rounds start and end (and a bus that's early waits). */
  stops: string[];
  /** When its first bus leaves its first stop (s on the office's clock), how many buses it has, and how many rounds each drives in BUS_PERIOD (shared/citybus.ts). */
  offset: number;
  buses: number;
  rounds: number;
}

export const LINE_DEFS: readonly LineDef[] = [
  {
    no: '7',
    dest: 'Ring',
    color: '#e63946',
    round: [[1, 0], [-1, 0], [-1, -2], [1, -2]],
    stops: ['lindenallee', 'bowling', 'office', 'kino-ost', 'baumarkt'],
    offset: 0,
    buses: 2,
    rounds: 3,
  },
  {
    no: '12',
    dest: 'Stadtpark',
    color: '#f4a261',
    round: [[0, 0], [0, -4], [-1, -4], [-1, 0]],
    stops: ['nordstadt', 'stadtpark', 'kirche', 'kino', 'soccer', 'bowling-west', 'baumarkt-west'],
    offset: 13,
    buses: 2,
    rounds: 3,
  },
  {
    no: '3',
    dest: 'Südstadt',
    color: '#3a86ff',
    round: [[-2, -1], [-2, 2], [-3, 2], [-3, 1], [-2, 1], [-2, 0], [1, 0], [1, -1]],
    stops: ['marktplatz', 'suedstadt', 'casino', 'soccer', 'gym', 'kino-sued', 'tankstelle'],
    offset: 27,
    buses: 2,
    rounds: 2,
  },
];
