// The wellness area (flrnoh fork, see shared/gym.ts): the sauna, the steam room, the jacuzzi, the
// cold plunge, the massage loungers and the stretch studio. This is where the energy your workouts
// spend comes back: just being in there tops you up over time, faster the more soothing the spot,
// and you earn a little "recovery" XP for taking care of yourself. Several people share the bigger
// rooms. Pure and shared, so the server and the tests agree on how fast you recover.

/** What each wellness spot is, and how it looks after you. */
export interface WellnessSpot {
  name: string;
  icon: string;
  /** How warm it reads on the panel. */
  temp: string;
  /** Energy given back per second in here. */
  regenPerSec: number;
  /** Recovery XP per minute spent. */
  xpPerMin: number;
  /** A cold spot (the plunge): a bracing burst the moment you get in. */
  coldBurst?: number;
  /** A word for what you do here. */
  note: string;
  /** Whether pouring water / flowing through poses is a thing here (a bit of extra XP and a puff of steam). */
  action?: 'ladle' | 'pose';
}

export const WELLNESS_SPOTS: Record<string, WellnessSpot> = {
  sauna: { name: 'Finnish sauna', icon: '🧖', temp: '85 °C', regenPerSec: 1.4, xpPerMin: 8, note: 'Sweat it out on the cedar benches.', action: 'ladle' },
  steam: { name: 'Steam room', icon: '💨', temp: '45 °C', regenPerSec: 1.2, xpPerMin: 7, note: 'Breathe the eucalyptus steam.', action: 'ladle' },
  hottub: { name: 'Jacuzzi', icon: '🛁', temp: '38 °C', regenPerSec: 1.6, xpPerMin: 6, note: 'Let the jets work your shoulders.' },
  coldplunge: { name: 'Cold plunge', icon: '🧊', temp: '4 °C', regenPerSec: 0.6, xpPerMin: 10, coldBurst: 35, note: 'Brace — then feel the rush.' },
  massage: { name: 'Massage lounger', icon: '💆', temp: 'warm', regenPerSec: 2.2, xpPerMin: 9, note: 'Sink into the shiatsu rollers.' },
  yoga: { name: 'Stretch studio', icon: '🧘', temp: 'mild', regenPerSec: 0.8, xpPerMin: 6, note: 'Flow through the poses.', action: 'pose' },
};

/** XP for a single splash of water on the stones, or one held pose. */
export const ACTION_XP = 5;
/** Energy a held pose / a good stretch gives on top of the steady trickle. */
export const ACTION_STAMINA = 4;

/** Recovery XP earned over `secs` in a spot (used by the server as it ticks). */
export function relaxXp(spot: WellnessSpot, secs: number): number {
  return Math.round((spot.xpPerMin / 60) * secs);
}

/** What the server sends everyone about a wellness spot. */
export interface WellnessView {
  kind: 'wellness';
  machine: string;
  /** Who's in here (names). */
  occupants: string[];
  /** How full it is. */
  seats: number;
  /** When someone last poured water / struck a pose, so a puff of steam animates for everyone. */
  puffAt?: number;
  /** Fork: who poured it (the walk-in rooms' Aufguss). */
  puffBy?: string;
  /** Fork: a walk-in room (shared/gym-rooms.ts): you're in it while you stand inside, not by sitting down. */
  walkIn?: boolean;
}
