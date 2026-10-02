import type { Gig } from '../../shared/venueshow';
import { gigPoster, liveGig, onGigsChanged, upcomingGigs } from '../features/venueshow/gigs';
import { setVenueBill } from '../world/venue/bill';

// The show's gig calendar on the building (flrnoh fork, see FORK.md "The Schallwerk"): the gig on now
// on the letter board and the LED wall, the next ones under it, their posters in the façade's cases.
// With nothing in the calendar the house says what it is by its mode (world/venue/bill.ts).

const DAYS = ['SO', 'MO', 'DI', 'MI', 'DO', 'FR', 'SA'];
const when = (g: Gig) => {
  const d = new Date(g.start);
  return `${DAYS[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.`;
};
const posters = new Map<string, HTMLCanvasElement>();
const posterOf = (g: Gig) => {
  const key = `${g.id}|${g.title}|${g.style}|${g.color}|${g.start}|${g.text ?? ''}`;
  let c = posters.get(key);
  if (!c) {
    c = gigPoster(g, 360);
    posters.set(key, c);
  }
  return c;
};

/** Puts what the calendar says on the building now. */
export function billFromGigs() {
  const live = liveGig();
  const coming = upcomingGigs().filter((g) => g.id !== live?.id);
  if (!live && !coming.length) return setVenueBill(null);
  setVenueBill({
    tonight: live?.title.toUpperCase(),
    next: coming.slice(0, 1).map((g) => `${when(g)} ${g.title.toUpperCase()}`),
    posters: [...(live ? [live] : []), ...coming].slice(0, 4).map(posterOf),
  });
}

onGigsChanged(billFromGigs);
