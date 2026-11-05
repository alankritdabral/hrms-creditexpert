/** Pure helpers for employee IDs of the form EMP-0001. */

/** Highest numeric part among IDs like "EMP-0049" (0 when there are none). */
export function maxEmployeeNumber(ids: Array<string | undefined | null>): number {
  let max = 0;
  for (const id of ids) {
    const m = /^EMP-(\d+)$/i.exec((id || "").trim());
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max;
}

export function formatEmployeeId(n: number): string {
  return `EMP-${String(n).padStart(4, "0")}`;
}

/** The next ID after the highest existing one. */
export function nextEmployeeId(existingIds: Array<string | undefined | null>): string {
  return formatEmployeeId(maxEmployeeNumber(existingIds) + 1);
}
