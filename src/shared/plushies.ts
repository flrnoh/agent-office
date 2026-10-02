// flrnoh fork (see FORK.md "Shops to walk into"): the plush toys in the Spielhalle's claw machine
// (shared/funshops.ts), on their own so the shops' wares (shopwares.ts) can name them without the city.

/** The plush toys in the claw machine: what you win is held like the toy shop's teddy. */
export const PLUSHIES = [
  { id: 'plushkatze', name: 'Plüschkatze', emoji: '🐱', color: '#f4a261', label: '#ffffff' },
  { id: 'plushhase', name: 'Plüschhase', emoji: '🐰', color: '#f1f1f1', label: '#ff8fab' },
  { id: 'plushdino', name: 'Plüschdino', emoji: '🦖', color: '#7cb518', label: '#ffd166' },
  { id: 'plushpanda', name: 'Plüschpanda', emoji: '🐼', color: '#f8f9fa', label: '#1d1d1d' },
  { id: 'plushkrake', name: 'Plüschkrake', emoji: '🐙', color: '#c77dff', label: '#ff006e' },
] as const;
export type PlushId = (typeof PLUSHIES)[number]['id'];
export const PLUSH_BY_ID = new Map<string, (typeof PLUSHIES)[number]>(PLUSHIES.map((p) => [p.id, p]));
export const isPlush = (v: unknown): v is PlushId => typeof v === 'string' && PLUSH_BY_ID.has(v);

