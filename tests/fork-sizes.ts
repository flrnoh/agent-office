// flrnoh fork (see FORK.md): the size guard's ceilings for this fork (tests/size.test.ts). Upstream
// files that carry the fork's hook lines may be that much longer than upstream's ceiling, and the
// fork's own files that were already over the budget when the guard came in (01.10.2026) may not grow
// past what they were. Like upstream's list, it only ever gets shorter.
export const FORK_CEILINGS: Readonly<Record<string, number>> = {
  // Upstream files, with the fork's hook lines in them (their upstream ceiling, plus those lines).
  'src/client/features/rooftop/world.ts': 1010,
  'src/client/world/sky.ts': 971,
  'src/client/world/character/person.ts': 742,
  'src/client/world/holiday.ts': 697, // shorter than upstream's ceiling: the desk presents went to world/deskgifts.ts
  // The fork's own files.
  'src/client/world/soccer/props.ts': 1020,
  'src/shared/padel/game.ts': 837,
  'src/client/soccer/place.ts': 792,
  'src/shared/soccer-ball.ts': 717,
  'src/client/tablegames/play.ts': 696,
  'src/server/casino/poker.ts': 668,
  'src/client/hall/padel.ts': 647,
  'src/client/world/gym/spa.ts': 606,
  'src/client/world/casino/interior.ts': 611,
};
