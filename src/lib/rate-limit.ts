/**
 * Small in-memory fixed-window rate limiter for abuse-prone endpoints
 * (login, OTP, upload, registration). Per-instance; for multi-instance
 * deployments back this with a shared store (Redis/Firestore).
 */
type Bucket = { count: number; resetAt: number };

const g = globalThis as unknown as { __hrms_rate_buckets?: Map<string, Bucket> };
const buckets = (g.__hrms_rate_buckets ??= new Map<string, Bucket>());

export function getClientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd ? fwd.split(",")[0].trim() : req.headers.get("x-real-ip")) || "unknown";
}

export interface RateLimitResult {
  ok: boolean;
  retryAfterSec: number;
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  if (buckets.size > 5000) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0 };
  }
  b.count += 1;
  if (b.count > limit) {
    return { ok: false, retryAfterSec: Math.ceil((b.resetAt - now) / 1000) };
  }
  return { ok: true, retryAfterSec: 0 };
}

/** Returns a 429 Response when over the limit, otherwise null. */
export function enforceRateLimit(
  req: Request,
  scope: string,
  limit: number,
  windowMs: number,
  extraKey = ""
): Response | null {
  const r = rateLimit(`${scope}:${getClientIp(req)}:${extraKey}`, limit, windowMs);
  if (r.ok) return null;
  return Response.json(
    { success: false, error: `Too many requests. Please try again in ${r.retryAfterSec}s.` },
    { status: 429, headers: { "Retry-After": String(r.retryAfterSec) } }
  );
}
