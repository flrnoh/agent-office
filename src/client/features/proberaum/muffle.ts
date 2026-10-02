import { muffleFor, type Muffle } from '../../../shared/proberaum';
import { VENUE, venueRoomAt, type VenueRoomId } from '../../../shared/venue';

/*
 * Sound kept in, for the other parts of the Schallwerk (flrnoh fork, see FORK.md "The rehearsal
 * wing"): how the hall's music (the stage's instruments, the DJ, the PA) reaches someone in a
 * rehearsal room, heavily muffled, and a rehearsal room's out in the hall. A part that plays into the
 * hall puts a low-pass filter and a gain on its way out and, every frame (or on every note), sets
 * them with `applyMuffle(filter, gain, muffleFor(listenerRoom(...), 'hall'), ctx.currentTime)`.
 * The rules are shared/proberaum.ts's `muffleFor`; doors don't change it unless the caller says
 * (`doorOpen`, from the wing's view: features/proberaum's `doorOpen(room)`).
 */

export { muffleFor };
export type { Muffle };

/** Where the listener is by sound: a rehearsal room, or the hall (anywhere else in the venue, or not in it at all). */
export function listenerRoom(floor: string | null | undefined, x: number, z: number): VenueRoomId {
  return floor === VENUE ? venueRoomAt(x, z) : 'hall';
}

/** Glides `filter`'s cutoff and `gain`'s level to `m` from `t` (the audio clock), over `glide` seconds. */
export function applyMuffle(filter: BiquadFilterNode, gain: GainNode, m: Muffle, t: number, glide = 0.25) {
  filter.type = 'lowpass';
  filter.frequency.setTargetAtTime(m.cutoff, t, glide / 3);
  gain.gain.setTargetAtTime(m.gain, t, glide / 3);
}
