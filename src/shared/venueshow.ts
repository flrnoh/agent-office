// The SCHALLWERK's show (flrnoh fork, see FORK.md "The show"): the crowd on the floor and what people
// do in it, the club's DJ booth, and the gig calendar with its posters. Its layout inside its two
// zones (ZONES.floor and ZONES.djbooth in shared/venue.ts), the gigs, the DJ booth's state and the
// messages; the crowd's own logic is in venueshow-crowd.ts, the beach balls' in venueshow-balls.ts.

import type { DjSet } from './djset.js';
import type { DjBeatsStatus, DjTap } from './djbeats.js';
import { STAGE_HEIGHT, ZONES, type VenueMode, type Zone } from './venue.js';

const F = ZONES.floor;
const D = ZONES.djbooth;

// ---- The floor -------------------------------------------------------------------------------------

/**
 * The ways across the floor that stay clear of the crowd: along its back (from the foyer and the
 * FOH desk to the bar and the wing), down the bar's front, the foot of the DJ booth's stairs, and in
 * front of the poster wall on the wing's wall.
 */
export const WALKWAYS: readonly Zone[] = [
  { minX: F.minX, maxX: F.maxX, minZ: F.minZ, maxZ: F.minZ + 1.1 }, // the back, from the foyer to the bar
  { minX: 16.6, maxX: F.maxX, minZ: F.minZ, maxZ: F.maxZ }, // the bar's front
  { minX: F.minX, maxX: F.minX + 1.6, minZ: F.minZ, maxZ: F.maxZ }, // the poster wall
];

/** The Wellenbrecher (the crowd barrier) in front of the stage in concert mode: from x to x along z, how tall. */
export const BARRIER = { minX: -8.6, maxX: 13.6, z: 2.6, height: 1.15 } as const;
/** The photo pit between the barrier and the stage, where security stands. */
export const PIT_ZONE: Zone = { minX: BARRIER.minX, maxX: BARRIER.maxX, minZ: BARRIER.z + 0.25, maxZ: F.maxZ };
/** The security NPC in the pit, facing the crowd. */
export const SECURITY = { x: 2.5, z: 3.45, rotY: Math.PI } as const;

/** Where the crowd may stand: the floor without its walkways, short of the barrier in concert mode, up to the stage in club mode. */
export function crowdArea(mode: VenueMode): Zone {
  return { minX: F.minX + 1.9, maxX: 16.2, minZ: F.minZ + 1.3, maxZ: mode === 'konzert' ? BARRIER.z - 0.45 : F.maxZ - 0.45 };
}

/** What everyone faces in concert mode: the middle of the stage, a little up. */
export const STAGE_FOCUS = { x: 2.5, y: STAGE_HEIGHT + 1.4, z: 7.5 } as const;

/** The edge of the stage you dive off (E there while standing on it): the strip along the stage's front. */
export const DIVE_EDGE = { minX: ZONES.stage.minX + 0.5, maxX: ZONES.stage.maxX - 0.5, z: ZONES.stage.minZ, depth: 1.4 } as const;
/** Whether (x, y, z) stands on the stage at its front edge, ready to dive. */
export const atDiveEdge = (x: number, y: number, z: number) => y > STAGE_HEIGHT - 0.3 && x >= DIVE_EDGE.minX && x <= DIVE_EDGE.maxX && z >= DIVE_EDGE.z - 0.2 && z <= DIVE_EDGE.z + DIVE_EDGE.depth;
/** How high a crowd-surfer lies on the crowd's hands. */
export const SURF_HEIGHT = 2.05;
/** How fast the crowd passes a surfer back (m/s), and where it sets them down. */
export const SURF_SPEED = 1.25;
export const SURF_END_Z = F.minZ + 1.6;

/** The poster wall on the wing's wall, facing east into the hall: E there opens the programme. */
export const POSTER_WALL = { x: F.minX + 0.12, minZ: -5.4, maxZ: -0.6, bottom: 0.5, top: 3.3 } as const;

// ---- The DJ booth ----------------------------------------------------------------------------------

/** The booth's riser (stage right, in its own zone), how high, and its stairs up from the floor on its west side. */
export const BOOTH_RISER = { minX: 17.7, maxX: D.maxX - 0.2, minZ: D.minZ + 0.25, maxZ: D.maxZ - 0.3, height: 1.0 } as const;
export const BOOTH_STAIRS = { minX: D.minX + 0.3, maxX: BOOTH_RISER.minX, minZ: D.minZ + 0.25, maxZ: D.minZ + 0.25 + 5 * 0.42, steps: 5 } as const;
/** The DJ's desk (the decks and the mixer) across the riser, its front toward the floor (-z). */
export const BOOTH_DESK = { x: 20.6, z: 5.5, width: 3.2, depth: 0.8, height: 1.0 } as const;
/** Where the DJ stands behind the decks, facing the floor. */
export const DJ_SPOT = { x: BOOTH_DESK.x, y: BOOTH_RISER.height, z: BOOTH_DESK.z + 0.95, rotY: Math.PI } as const;
/** The booth's LED backdrop, against the backstage wall. */
export const BOOTH_SCREEN = { x: 20.6, z: D.maxZ - 0.5, width: 5.2, height: 3.0, bottom: BOOTH_RISER.height + 0.6 } as const;
/** How far from the DJ spot you can be and still be at the decks (m). */
export const DJ_REACH = 2.2;
export const atDecks = (x: number, z: number, y: number = BOOTH_RISER.height) => y > BOOTH_RISER.height - 0.4 && Math.hypot(x - DJ_SPOT.x, z - DJ_SPOT.z) <= DJ_REACH;

/** The house mixes the booth plays by itself when nobody puts on a set: generated, no one's records. */
export const HOUSE_STYLES = {
  house: { name: 'Deep House', bpm: 122 },
  techno: { name: 'Techno', bpm: 130 },
  disco: { name: 'Nu Disco', bpm: 116 },
} as const;
export type HouseStyle = keyof typeof HOUSE_STYLES;
export const isHouseStyle = (s: unknown): s is HouseStyle => typeof s === 'string' && Object.hasOwn(HOUSE_STYLES, s);

/** A button on the DJ's desk: the air horn, a drop in the house mix (a build first), a Wall of Death for the crowd. */
export type DjFx = 'horn' | 'drop' | 'wod';
export const isDjFx = (s: unknown): s is DjFx => s === 'horn' || s === 'drop' || s === 'wod';

export interface VenueDjState {
  /** Who's at the decks (one at a time), or nobody. */
  dj: { id: string; name: string } | null;
  /** The set someone put on (YouTube, SoundCloud, Mixcloud: shared/djset.ts), or null while the house mix plays. */
  set: DjSet | null;
  by?: string;
  /** When it was put on, on the office's clock, and how long ago that was when this was sent (ms). */
  startedAt: number;
  elapsed: number;
  beats?: DjBeatsStatus;
  tap?: DjTap;
  /** The house mix: its style, and the last drop the DJ called (on the office's clock: the build starts at the next bar). */
  house: { style: HouseStyle; dropAt: number };
  /** The party's volume (the roof's, 0..2: the team's to set there), so the house is as loud as the roof. */
  volume: number;
}

// ---- The gigs --------------------------------------------------------------------------------------

export type GigKind = VenueMode;
export const GIG_KINDS: Record<GigKind, string> = { konzert: 'Konzert', club: 'Club' };

/** How a gig's poster looks: its layout, and its colours. */
export const POSTER_STYLES = ['Plakat', 'Neon', 'Punk', 'Rave', 'Retro', 'Minimal'] as const;
export const POSTER_COLORS = ['#ff3d81', '#ffd166', '#06d6a0', '#3a86ff', '#ff6b35', '#b388ff', '#e63946', '#f1faee'] as const;

export interface Gig {
  id: string;
  title: string;
  kind: GigKind;
  /** When it starts and ends, real time (ms). */
  start: number;
  end: number;
  /** Who's playing, a line for the poster ("Support: …"), optional. */
  text?: string;
  /** Which of POSTER_STYLES, and which of POSTER_COLORS. */
  style: number;
  color: number;
  /** Who put it in the calendar. */
  by: string;
  /** Whether the office has said it's on (once). */
  announced?: boolean;
}

/** What someone fills in: the gig without who and whether it's been announced. */
export type GigInput = Pick<Gig, 'title' | 'kind' | 'start' | 'end' | 'style' | 'color'> & { id?: string; text?: string };

export const GIG_TITLE_MAX = 60;
export const GIG_TEXT_MAX = 200;
/** How long a gig may run, and how long one runs when nobody says. */
export const GIG_MAX_MS = 12 * 3600_000;
export const GIG_DEFAULT_MS = 3 * 3600_000;
/** How far ahead gigs may go in, and how long after they're over they're kept. */
export const GIG_AHEAD_MS = 400 * 86400_000;
export const GIG_KEEP_MS = 30 * 86400_000;
export const GIGS_MAX = 120;

const clean = (s: unknown, max: number) => (typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** Reads a gig someone filled in (or one read back from the file), or says why not. */
export function cleanGig(raw: unknown, now: number, isNew: boolean): GigInput | { error: string } {
  if (!raw || typeof raw !== 'object') return { error: 'Da fehlt der Termin' };
  const g = raw as Record<string, unknown>;
  const title = clean(g.title, GIG_TITLE_MAX);
  if (!title) return { error: 'Wie heißt der Abend?' };
  const kind = g.kind === 'club' ? 'club' : g.kind === 'konzert' ? 'konzert' : null;
  if (!kind) return { error: 'Konzert oder Club?' };
  const start = typeof g.start === 'number' && Number.isFinite(g.start) ? Math.round(g.start / 60_000) * 60_000 : NaN;
  if (!Number.isFinite(start)) return { error: 'Wann geht’s los?' };
  if (isNew && start < now - 3600_000) return { error: 'Der Termin liegt schon in der Vergangenheit' };
  if (start > now + GIG_AHEAD_MS) return { error: 'So weit im Voraus geht’s noch nicht' };
  const rawEnd = typeof g.end === 'number' && Number.isFinite(g.end) ? Math.round(g.end / 60_000) * 60_000 : start + GIG_DEFAULT_MS;
  if (rawEnd <= start) return { error: 'Das Ende muss nach dem Anfang sein' };
  const end = Math.min(rawEnd, start + GIG_MAX_MS);
  const text = clean(g.text, GIG_TEXT_MAX);
  const style = Number.isInteger(g.style) && (g.style as number) >= 0 && (g.style as number) < POSTER_STYLES.length ? (g.style as number) : 0;
  const color = Number.isInteger(g.color) && (g.color as number) >= 0 && (g.color as number) < POSTER_COLORS.length ? (g.color as number) : 0;
  const id = typeof g.id === 'string' && /^[a-z0-9]{4,24}$/.test(g.id) ? g.id : undefined;
  return { ...(id ? { id } : {}), title, kind, start, end, style, color, ...(text ? { text } : {}) };
}

/** The gig on at `now`, if any. */
export const liveGig = (gigs: readonly Gig[], now: number): Gig | null => gigs.find((g) => g.start <= now && now < g.end) ?? null;
/** The gigs still to come (or on now), soonest first. */
export const upcoming = (gigs: readonly Gig[], now: number): Gig[] => gigs.filter((g) => g.end > now).sort((a, b) => a.start - b.start);
/** Whether two gigs overlap in time. */
export const clash = (a: Pick<Gig, 'start' | 'end'>, b: Pick<Gig, 'start' | 'end'>) => a.start < b.end && b.start < a.end;

// ---- What people do in the crowd -------------------------------------------------------------------

/**
 * Something someone does in the crowd, seen and heard by everyone in the house: a pogo jump, clapping,
 * the "Zugabe!" chant, a lighter (or phone light) up or down, a photo's flash.
 */
export type CrowdAct = 'pogo' | 'clap' | 'zugabe' | 'light' | 'unlight' | 'flash';
export const CROWD_ACTS: readonly CrowdAct[] = ['pogo', 'clap', 'zugabe', 'light', 'unlight', 'flash'];
export const isCrowdAct = (a: unknown): a is CrowdAct => typeof a === 'string' && (CROWD_ACTS as readonly string[]).includes(a);
/** How often one person may do each (ms). */
export const ACT_EVERY: Record<CrowdAct, number> = { pogo: 220, clap: 1000, zugabe: 4000, light: 300, unlight: 300, flash: 1800 };
/** How long a Wall of Death takes from the call: the crowd parts, waits, and runs at each other (ms). */
export const WOD_PART_MS = 3500;
export const WOD_RUN_MS = 6500;
/** The least time between two Walls of Death in the house (ms). */
export const WOD_EVERY = 40_000;

/** One beach ball, as it was last hit (venueshow-balls.ts flies it from there): where, how fast, when (office clock). */
export interface BallHit {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  at: number;
  /** How many times it's been hit: its bounces' little kicks go by it, the same on every page. */
  n: number;
}
export const BALLS = 3;

export interface VenueShowState {
  dj: VenueDjState;
  /** Who's crowd-surfing right now. */
  surfers: string[];
  /** Whose lighters are up. */
  lights: string[];
  /** Each ball's last hit, null for one nobody's hit since the office started (it's thrown in by the clock). */
  balls: (BallHit | null)[];
  /** The last Wall of Death called (office clock), 0 for none. */
  wodAt: number;
}

// ---- Messages --------------------------------------------------------------------------------------

export type VenueShowClientMsg =
  /** In the house: send me what's going on. */
  | { t: 'show.hello' }
  /** Something done in the crowd (CrowdAct). */
  | { t: 'show.act'; act: CrowdAct }
  /** Off the stage's edge onto the crowd's hands (on), or set down at the back (off). */
  | { t: 'show.surf'; on: boolean }
  /** A beach ball batted: which, and the way it flies off (the office takes where it is from its own reckoning). */
  | { t: 'show.ball'; i: number; vx: number; vy: number; vz: number }
  /** Call a Wall of Death (from the stage or the DJ booth). */
  | { t: 'show.wod' }
  /** The DJ booth: take the decks, give them back, put a set on, back to the house mix, tap the tempo, a house style, a button. */
  | { t: 'venuedj.take' }
  | { t: 'venuedj.leave' }
  | { t: 'venuedj.play'; url: string }
  | { t: 'venuedj.stop' }
  | { t: 'venuedj.tap'; bpm: number; at: number }
  | { t: 'venuedj.house'; style: HouseStyle }
  | { t: 'venuedj.fx'; fx: DjFx }
  /** The gig calendar: what's coming (anyone, from anywhere), a gig put in or changed, taken out (the team's). */
  | { t: 'gig.list' }
  | { t: 'gig.save'; gig: GigInput }
  | { t: 'gig.delete'; id: string };

export type VenueShowServerMsg =
  /** Everything at once, to whoever just came in. */
  | { t: 'show'; state: VenueShowState }
  /** Someone did something in the crowd, where they stand. */
  | { t: 'show.act'; id: string; act: CrowdAct; x: number; z: number }
  | { t: 'show.surf'; id: string; on: boolean }
  | { t: 'show.ball'; i: number; ball: BallHit; by: string }
  | { t: 'show.wod'; at: number; by: string }
  | { t: 'venuedj'; state: VenueDjState }
  /** The DJ hit the air horn. */
  | { t: 'venuedj.horn'; id: string; by: string }
  /** The calendar (to everyone in the office: the posters hang outside too), and the gig on now. */
  | { t: 'gigs'; gigs: Gig[]; live: string | null }
  /** A gig has started: everyone, on every floor, hears about it. */
  | { t: 'gig.started'; gig: Gig };
