// Floors in any order (flrnoh fork, see FORK.md): admins drag floors into another order in the
// elevator. One rule for the server (floors.json and the open floors) and the page (the numbers
// change as soon as you drop).

/**
 * `items` with the ones `ids` names put in that order, each into one of the places those items held;
 * the rest stay where they were (a floor whose checkout is gone, one added a moment ago). Ids that
 * name nothing, repeats and anything that isn't a string are left out. Undefined when nothing moves.
 */
export function reorderById<T>(items: readonly T[], idOf: (item: T) => string, ids: readonly unknown[]): T[] | undefined {
  const byId = new Map(items.map((it) => [idOf(it), it] as const));
  const wanted: T[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (typeof id !== 'string' || seen.has(id)) continue;
    const it = byId.get(id);
    if (it === undefined) continue;
    seen.add(id);
    wanted.push(it);
  }
  let k = 0;
  const next = items.map((it) => (seen.has(idOf(it)) ? wanted[k++] : it));
  return next.some((it, i) => it !== items[i]) ? next : undefined;
}

/** Puts the entries of `map` in the order `reorderById` gives, in place (a Map keeps insertion order). Whether anything moved. */
export function reorderMap<V>(map: Map<string, V>, ids: readonly unknown[]): boolean {
  const next = reorderById([...map.entries()], ([id]) => id, ids);
  if (!next) return false;
  map.clear();
  for (const [id, v] of next) map.set(id, v);
  return true;
}

/** `ids` with `id` moved to position `to` (clamped), the others keeping their order. */
export function moveId(ids: readonly string[], id: string, to: number): string[] {
  const rest = ids.filter((x) => x !== id);
  if (rest.length === ids.length) return [...ids];
  const at = Math.max(0, Math.min(rest.length, Math.round(to)));
  return [...rest.slice(0, at), id, ...rest.slice(at)];
}
