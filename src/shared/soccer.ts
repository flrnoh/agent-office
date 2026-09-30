// The soccer hall across the street (flrnoh fork, see FORK.md "The soccer hall"): a small-field
// indoor pitch with boards all round, two small goals, a stand behind the south goal and a big
// scoreboard. Shared by the server (the ball, the teams, the match: server/soccer/) and the client
// (the building, the pitch, kicking: client/soccer/, world/soccer/).
//
// Inside, the hall is a place of its own like the casino and the padel hall (SOCCER is a peer's
// `floor` while they're in there), so people from every floor meet on its pitch. Its interior is its
// own scene in its own coordinates (below): x across the hall, z along the pitch, the floor at y 0.
// Outside, it stands on every floor's street between the golf hole and the padel hall.

/** Where you are while you're in the soccer hall (a peer's `floor`, and `floor.go`'s). Never a project floor's id. */
export const SOCCER = '@soccer';
export const SOCCER_NAME = 'Soccer Hall';

// ---- The building on the street ------------------------------------------------------------------

/**
 * The building's footprint on the street (walls included): across the road, east of the golf hole
 * (whose green reaches x ≈ 0.5) and west of the padel hall (x 22), where the last neighbour stood.
 * Its front (north, z = minZ) faces the street; the pitch runs north–south inside.
 */
export const SOCCER_BOX = { minX: 2.5, maxX: 21, minZ: 36, maxZ: 72 } as const;
/** How tall its walls stand above the street (the SCENIC LOOP billboard stands on its roof, see world/scenic.ts). */
export const SOCCER_HEIGHT = 8.5;
export const SOCCER_WALL = 0.3;
/** Where the hall's middle is on the street: interior (0, 0) is here. */
export const SOCCER_CENTER = { x: (SOCCER_BOX.minX + SOCCER_BOX.maxX) / 2, z: (SOCCER_BOX.minZ + SOCCER_BOX.maxZ) / 2 } as const;
/** The front doors, in its north face (toward the street): center along x, and how wide and tall. */
export const SOCCER_DOOR = { x: SOCCER_CENTER.x + 4.5, width: 2.4, height: 2.8 } as const;
/** Where you land on the sidewalk coming out, facing the street (-z). */
export const SOCCER_STREET_SPOT = { x: SOCCER_DOOR.x, z: SOCCER_BOX.minZ - 1.8, rotY: Math.PI } as const;

// ---- Inside (interior coordinates) ---------------------------------------------------------------

/** The room inside, walls excluded. */
export const SOCCER_ROOM = {
  minX: -(SOCCER_BOX.maxX - SOCCER_BOX.minX) / 2 + SOCCER_WALL,
  maxX: (SOCCER_BOX.maxX - SOCCER_BOX.minX) / 2 - SOCCER_WALL,
  minZ: -(SOCCER_BOX.maxZ - SOCCER_BOX.minZ) / 2 + SOCCER_WALL,
  maxZ: (SOCCER_BOX.maxZ - SOCCER_BOX.minZ) / 2 - SOCCER_WALL,
  height: 7.6,
} as const;

/** The pitch, inside the boards: 27 m long (z) × 14 m wide (x). Red defends the north goal (z < 0), blue the south. */
export const PITCH = { minX: -7, maxX: 7, minZ: -13.5, maxZ: 13.5 } as const;
export const PITCH_CX = (PITCH.minX + PITCH.maxX) / 2;
/** The boards round it: how tall, and how thick (outside the pitch). */
export const BOARD = { height: 1, thick: 0.12 } as const;
/** The goals: set into the end boards, their mouths on the goal lines (z = PITCH.minZ / maxZ), `depth` back into the net. */
export const GOAL = { width: 3, height: 2, depth: 1.1, post: 0.05 } as const;
/** Radius of the centre circle, the penalty areas' arcs (from each post) and the penalty spot's distance from the line. */
export const MARKS = { circle: 3, area: 5, spot: 6 } as const;

/** The doors inside, in the north wall: E there goes back out onto the street. */
export const SOCCER_DOOR_INSIDE = { x: 4.5, z: SOCCER_ROOM.minZ + 0.4, width: 2.4 } as const;
/** Just inside the doors, facing into the hall (+z). */
export const SOCCER_ENTRY = { x: SOCCER_DOOR_INSIDE.x, z: SOCCER_ROOM.minZ + 1.5, rotY: 0 } as const;
/** The stand behind the south goal: rows along x, each a step up (the player climbs 0.3 m steps). */
export const STAND = { minX: -7.5, maxX: 7.5, minZ: SOCCER_ROOM.maxZ - 2.4, maxZ: SOCCER_ROOM.maxZ, rows: 3, rise: 0.3 } as const;
/** The team benches along the west wall, red to the north of the halfway line, blue to the south. */
export const BENCHES = [
  { team: 'red' as const, x: SOCCER_ROOM.minX + 0.35, z0: -8, z1: -2 },
  { team: 'blue' as const, x: SOCCER_ROOM.minX + 0.35, z0: 2, z1: 8 },
];
/** Where you join a team (or leave the pitch): the boards at the halfway line, both sides. */
export const JOIN_SPOTS = [
  { x: PITCH.minX - BOARD.thick / 2, z: 0 },
  { x: PITCH.maxX + BOARD.thick / 2, z: 0 },
] as const;

// ---- Teams and the match -------------------------------------------------------------------------

export type Team = 'red' | 'blue';
export const TEAMS: readonly Team[] = ['red', 'blue'];
export const TEAM_COLOR: Record<Team, string> = { red: '#e63946', blue: '#277df0' };
export const TEAM_NAME: Record<Team, string> = { red: 'Red', blue: 'Blue' };
export const other = (t: Team): Team => (t === 'red' ? 'blue' : 'red');
/** Which goal a team defends: red the north one (z = PITCH.minZ), blue the south. */
export const defends = (t: Team): GoalSide => (t === 'red' ? 'north' : 'south');
/** Who scored, from which goal the ball went into. */
export const scorerOf = (side: GoalSide): Team => (side === 'north' ? 'blue' : 'red');
export type GoalSide = 'north' | 'south';

/** At most this many a side. */
export const MAX_PER_TEAM = 5;
/** A match: this long on the clock (it only runs in play), or first to GOALS_TO_WIN. */
export const MATCH_MS = 5 * 60_000;
export const GOALS_TO_WIN = 5;
/** After a goal, the celebration before the kickoff; the kickoff's freeze; the pause after the final whistle. */
export const GOAL_MS = 3000;
export const KICKOFF_MS = 2000;
export const OVER_MS = 10_000;
/** After the kickoff's freeze, only the kicking-off team may touch the ball, for up to this long (or until it does). */
export const KICKOFF_FIRST_MS = 3000;

export type SoccerPhase = 'waiting' | 'kickoff' | 'play' | 'goal' | 'paused' | 'over';

export interface SoccerPlayer {
  id: string;
  name: string;
  team: Team;
}

/** The match as everyone in the hall sees it (a `soccer` message). Clocks are "ms left" as of when it was sent. */
export interface SoccerView {
  phase: SoccerPhase;
  score: Record<Team, number>;
  /** Left on the match clock, and whether it's running. */
  clockMs: number;
  running: boolean;
  /** Until the phase moves on by itself (the kickoff's freeze, a goal's celebration, the pause after a match), if it does. */
  phaseMs?: number;
  /** Who kicks off (in 'kickoff', and the first touch after it). */
  kickoff?: Team;
  /** The last match's winner, while it's over. */
  winner?: Team | 'draw';
  players: SoccerPlayer[];
}

/** Something that happened, for a toast, a whistle or a cheer. */
export interface SoccerEvent {
  kind: 'start' | 'kickoff' | 'play' | 'goal' | 'end' | 'pause' | 'resume' | 'reset' | 'practice' | 'join' | 'leave';
  team?: Team;
  /** Who (a goal's scorer, if the office knows; who joined or left). */
  who?: string;
  text?: string;
}

/** The ball on the wire: [x, z, y, vx, vz, vy] (interior coordinates, y the bottom of the ball above the floor). */
export type BallWire = [number, number, number, number, number, number];
/** What the ball hit since the last snapshot (the loudest), for its sound. */
export type BallHitKind = 'kick' | 'board' | 'post' | 'bar' | 'net';

export type SoccerClientMsg =
  /** Onto the pitch: into the team with fewer players. */
  | { t: 'soccer.join' }
  /** Off the pitch, back to watching. */
  | { t: 'soccer.leave' }
  /** A kick: `power` 0..1 (how long it was charged), `dir` the facing angle (sin, cos on x/z), `loft` 0..1 (a chip). */
  | { t: 'soccer.kick'; power: number; dir: number; loft: number };

export type SoccerServerMsg =
  /** The match and who plays for whom (on every change, and now and then to keep the clock true); `event` for a toast or a whistle. */
  | { t: 'soccer'; state: SoccerView; event?: SoccerEvent }
  /** The ball, ~15 times a second while it moves; `hit` and `hs` (speed) when it just hit something, `by` who kicked it. */
  | { t: 'soccer.ball'; b: BallWire; hit?: BallHitKind; hs?: number; by?: string };

export const isSoccerMsg = (t: string): t is SoccerClientMsg['t'] => t === 'soccer.join' || t === 'soccer.leave' || t === 'soccer.kick';

/** mm:ss of a clock in ms (rounded up, so it shows 0:00 only when it's done). */
export function clockText(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Whether (x, z) (interior coordinates) is on the pitch, inside the boards. */
export function onPitch(x: number, z: number, margin = 0): boolean {
  return x > PITCH.minX - margin && x < PITCH.maxX + margin && z > PITCH.minZ - margin && z < PITCH.maxZ + margin;
}
