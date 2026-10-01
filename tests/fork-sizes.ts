// flrnoh fork (see FORK.md): the size guard's ceilings for this fork (tests/size.test.ts). Upstream
// files that carry the fork's hook lines may be that much longer than upstream's ceiling, and the
// fork's own files that were already over the budget when the guard came in (30.09.2026) may not grow
// past what they were. Like upstream's list, it only ever gets shorter.
export const FORK_CEILINGS: Readonly<Record<string, number>> = {
};
