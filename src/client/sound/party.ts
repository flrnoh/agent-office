// flrnoh fork (see FORK.md): the party's volume on the roof, set at the DJ booth for everyone up there.
// Up to 100% it's how loud the DJ is anyway (as the square, like every volume here). Past it, up to
// 200% ("Disco"), the DJ is pushed into a limiter (louder, never clipping), lifted for anyone whose
// own music volume is down at the usual level (but never past what their speakers can take, and not
// at all for anyone who muted it), and carries across the whole terrace instead of fading away
// from the booth.

/** The slider's top: Disco. */
export const PARTY_MAX = 2;

const boost = (level: number) => Math.max(0, Math.min(PARTY_MAX, level) - 1);

/** Into the limiter. */
export function partyDrive(level: number): number {
  return level <= 1 ? level * level : 1 + 3 * boost(level);
}

/** Out of the limiter, before your own music volume `musicGain`: at most what keeps the peaks under full scale. */
export function partyLift(level: number, musicGain: number): number {
  if (level <= 1 || musicGain <= 0) return 1;
  return Math.max(1, Math.min(1 + 3 * boost(level), 0.95 / musicGain));
}

/** How the DJ fades with distance from the booth: as before up to 100%, hardly at all at Disco. */
export function partyFalloff(level: number): { ref: number; rolloff: number } {
  const b = boost(level);
  return { ref: 7 + 7 * b, rolloff: 0.8 * (1 - 0.75 * b) };
}

/** A set in an embedded player (it can't go through the limiter): how much louder than your music volume and the distance make it. */
export function partyEmbed(level: number, musicGain: number): number {
  return level <= 1 ? level * level : partyLift(level, musicGain);
}
