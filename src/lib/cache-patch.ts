/**
 * Pure helpers for the Firestore read cache (no server-only imports, so they are unit-testable).
 *
 * Identity rule: a cached item's `id` is ALWAYS its Firestore document ID. Many documents also
 * store their own `id` field (e.g. employees are stored under "EMP-0049" but carry id "emp-1730..."),
 * and letting that field win made write-through patches miss the cached copy and append a duplicate.
 */
export type CacheFilter = { field: string; op: "==" | ">=" | "<="; value: string | number | boolean };

export function matchesFilters(doc: Record<string, unknown> | null | undefined, filters: CacheFilter[]): boolean {
  return filters.every((f) => {
    const v = doc?.[f.field] as string | number | boolean | undefined | null;
    if (v === undefined || v === null) return false;
    if (f.op === "==") return v === f.value;
    if (f.op === ">=") return v >= f.value;
    return v <= f.value;
  });
}

/** Builds a cache/record object from a Firestore document: the document ID always wins over a stored `id` field. */
export function docWithId<T>(docId: string, data: Record<string, unknown> | undefined): T {
  return { ...(data || {}), id: docId } as T;
}

/**
 * Applies one write (data) or delete (data === null) to a cached list.
 * When `filters` is given the list is a filtered-query result: the document is added, kept or
 * removed depending on whether it still matches.
 */
export function patchCachedList<T extends { id?: string }>(
  list: T[],
  docId: string,
  data: Record<string, unknown> | null,
  filters?: CacheFilter[]
): T[] {
  const idx = list.findIndex((d) => d.id === docId);
  if (data === null) return idx === -1 ? list : list.filter((_, i) => i !== idx);
  const merged = { ...(idx === -1 ? {} : list[idx]), ...data, id: docId } as unknown as T;
  const belongs = !filters || matchesFilters(merged as unknown as Record<string, unknown>, filters);
  if (idx === -1) return belongs ? [...list, merged] : list;
  if (!belongs) return list.filter((_, i) => i !== idx);
  const next = list.slice();
  next[idx] = merged;
  return next;
}
