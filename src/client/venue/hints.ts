import { VENUE_NAME } from '../../shared/venue';
import { MERCH_BY_ID, SCENE_NAMES, type VenueWear } from '../../shared/venue-house';
import type { Interactable } from '../world/types';

// The hint bar over the Schallwerk's things (flrnoh fork, see FORK.md "The Schallwerk"): the doors, the
// box office, the cloakroom, the merch, the photo booth, the bar, the rider, the sofas, the desks.

export type HintParts = { k: string; parts: (HTMLElement | string)[] };

/** What a hint needs of the place. */
interface Place {
  active: boolean;
  mode: 'konzert' | 'club';
  lights: { scene: keyof typeof SCENE_NAMES };
  you: { wear: VenueWear; cut: boolean; seat: string | null };
  sofas: { taken(key: string): boolean };
}

/** The house's own hint for `it`, null for nothing to say, undefined when it isn't the house's (the parts' then). */
export function venueHint(place: Place, it: Interactable, title: (t: string) => HTMLElement, key: (k: string, label: string) => HTMLElement, aside: (t: string) => HTMLElement): HintParts | null | undefined {
  if (it.kind === 'venue')
    return place.active
      ? { k: 'venue-out', parts: [title('🚪 Straße'), key('E', 'Rausgehen')] }
      : { k: `venue-in|${place.mode}`, parts: [title(`🎸 ${VENUE_NAME}`), aside(place.mode === 'club' ? 'Heute: Club · Bar · Proberäume' : 'Heute: Konzert · Bar · Proberäume'), key('E', 'Reingehen')] };
  if (!place.active) return undefined;
  const w = place.you.wear;
  switch (it.kind) {
    case 'venuekasse':
      return { k: `vn-kasse|${!!w.stamp}`, parts: [title('🎟️ Kasse'), aside(w.stamp ? 'du hast schon einen Stempel' : 'Eintritt frei, Stempel drauf'), key('E', w.stamp ? 'Nachstempeln' : 'Stempel holen')] };
    case 'venuecoat':
      return { k: `vn-coat|${w.coat ?? 0}`, parts: [title('🧥 Garderobe'), aside(w.coat ? `deine Marke: ${w.coat}` : 'Jacke abgeben, Marke mitnehmen'), key('E', w.coat ? 'Jacke abholen' : 'Jacke abgeben')] };
    case 'venuemerch': {
      const m = w.shirt ? MERCH_BY_ID.get(w.shirt) : null;
      return { k: `vn-merch|${w.shirt ?? ''}`, parts: [title('👕 Merch'), aside(m ? `du trägst: ${m.name}` : 'Shirts, Hoodie, Poster'), key('E', 'Stöbern')] };
    }
    case 'venuebooth':
      return { k: 'vn-booth', parts: [title('📸 Fotobox'), aside('vier Fotos, alle davor kommen mit drauf'), key('E', 'Rein da')] };
    case 'venuebar':
      return { k: `vn-bar|${place.you.cut}`, parts: [title('🍺 Bar'), aside(place.you.cut ? 'genug für jetzt · Mate, Spezi, Wasser gehen immer' : 'Zwickl vom Fass, Mate, Longdrinks, Kurze'), key('E', 'Bestellen')] };
    case 'venuerider':
      return { k: 'vn-rider', parts: [title('🧊 Rider'), aside('der Kühlschrank der Band'), key('E', 'Was nehmen')] };
    case 'venuelight':
      return { k: `vn-light|${place.mode}|${place.lights.scene}`, parts: [title('🎛️ Lichtpult'), aside(`${place.mode === 'club' ? 'Club' : 'Konzert'} · ${SCENE_NAMES[place.lights.scene]}`), key('E', 'Ans Pult')] };
    case 'venuemix':
      return { k: 'vn-mix', parts: [title('🎚️ Mischpult'), aside('Durchsagen für das ganze Haus'), key('E', 'Ans Pult')] };
    case 'venueseat': {
      if (place.you.seat === it.seatId) return { k: `${it.seatId}|me`, parts: [title('🛋️ Backstage'), key('W A S D', 'Aufstehen')] };
      const full = place.sofas.taken(it.seatId ?? '');
      return { k: `${it.seatId}|${full}`, parts: [title('🛋️ Backstage'), full ? aside('besetzt') : key('E', 'Hinsetzen')] };
    }
  }
  return undefined;
}
