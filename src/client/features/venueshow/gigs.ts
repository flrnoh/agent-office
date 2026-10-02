import { upcoming, type Gig } from '../../../shared/venueshow';
import { gigPoster } from './posters';

/*
 * The SCHALLWERK's gig calendar on this page (flrnoh fork, see FORK.md "The show"): what the office
 * says is coming up, kept here for the poster wall, the programme window, and the building's façade
 * frames and marquee, which read it through this seam:
 *
 *   upcomingGigs()        the gigs still to come (or on now), soonest first
 *   liveGig()             the one on now, or null
 *   onGigsChanged(fn)     calls fn whenever the calendar changes; returns how to stop
 *   gigPoster(gig, w?)    a canvas with the gig's poster (posters.ts), w pixels wide
 */

let gigs: Gig[] = [];
let liveId: string | null = null;
const watchers = new Set<() => void>();

/** What the office said (the `gigs` message). */
export function setGigs(list: Gig[], live: string | null) {
  gigs = list;
  liveId = live;
  watchers.forEach((fn) => fn());
}

export const upcomingGigs = (now = Date.now()): Gig[] => upcoming(gigs, now);
export const liveGig = (): Gig | null => gigs.find((g) => g.id === liveId) ?? null;
export function onGigsChanged(fn: () => void): () => void {
  watchers.add(fn);
  return () => void watchers.delete(fn);
}
export { gigPoster };
