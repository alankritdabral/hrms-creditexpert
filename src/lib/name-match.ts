/**
 * Fuzzy matching of person names, to spot "Ravi Kumar" typed as "ravi kumr" or "Kumar Ravi" and offer the
 * registered employee instead of creating a duplicate. Pure: no I/O, runs on server and client.
 */

const TITLES = new Set(["mr", "mrs", "ms", "miss", "dr", "shri", "smt", "sh"]);

/** Lower-case words with punctuation, titles and extra spaces removed. */
export function nameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t && !TITLES.has(t));
}

/** Comparable form of a name: tokens in a fixed order, so word order does not matter. */
export function normalizeName(name: string): string {
  return nameTokens(name).sort().join(" ");
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

function tokenSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  // An initial ("r") stands for the full word ("ravi").
  if ((a.length === 1 && b.startsWith(a)) || (b.length === 1 && a.startsWith(b))) return 0.7;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

/** 0 (nothing alike) to 1 (same name, ignoring case, punctuation, titles and word order). */
export function nameSimilarity(a: string, b: string): number {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (!ta.length || !tb.length) return 0;
  if (normalizeName(a) === normalizeName(b)) return 1;

  // Pair every word of the shorter name with its best partner in the longer one.
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const used = new Set<number>();
  let total = 0;
  for (const s of short) {
    let best = 0;
    let bestIdx = -1;
    long.forEach((l, i) => {
      if (used.has(i)) return;
      const sim = tokenSimilarity(s, l);
      if (sim > best) {
        best = sim;
        bestIdx = i;
      }
    });
    if (bestIdx >= 0) used.add(bestIdx);
    total += best;
  }
  const score = total / short.length;
  // Extra words ("Ravi Kumar Singh" vs "Ravi Kumar") lower the score a little, not to zero.
  const penalty = (long.length - short.length) * 0.08;
  return Math.max(0, score - penalty);
}

export interface NameCandidate {
  employeeId: string;
  name: string;
}

export interface SimilarMatch<T extends NameCandidate> {
  employee: T;
  score: number;
}

/** Below this a name is treated as a different person. */
export const SIMILAR_NAME_THRESHOLD = 0.75;

/** Registered people whose name is close to `name` but not identical, best first. */
export function findSimilarEmployees<T extends NameCandidate>(
  name: string,
  people: T[],
  limit = 3,
  threshold = SIMILAR_NAME_THRESHOLD
): SimilarMatch<T>[] {
  return people
    .map((employee) => ({ employee, score: nameSimilarity(name, employee.name) }))
    .filter((m) => m.score >= threshold)
    .sort((a, b) => b.score - a.score || a.employee.name.localeCompare(b.employee.name))
    .slice(0, limit);
}
