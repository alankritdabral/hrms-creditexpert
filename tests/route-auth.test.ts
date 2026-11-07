import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Every exported route handler must call authenticateRequest(), except the ones
 * listed here. KNOWN_GAPS is empty (Phase 3 of plans/code-improvement-plan.md closed them); add an entry only with a documented reason.
 */
const PUBLIC_BY_DESIGN = new Set([
  "src/app/api/auth/login/route.ts POST",
  "src/app/api/auth/logout/route.ts POST",
  "src/app/api/auth/forgot-password/send-otp/route.ts POST",
  "src/app/api/auth/forgot-password/verify-otp/route.ts POST",
  "src/app/api/auth/forgot-password/reset/route.ts POST",
  "src/app/api/auth/register/send-otp/route.ts POST",
  "src/app/api/auth/register/verify-otp/route.ts POST",
  "src/app/api/auth/register/submit/route.ts POST",
  "src/app/api/cron/attendance-reminder/route.ts GET", // protected by CRON_SECRET
  "src/app/api/cron/daily-login-report/route.ts GET", // protected by CRON_SECRET
]);

const KNOWN_GAPS = new Set<string>([]);

/** Handlers for people who have no account yet; they must verify the email with a one-time code instead. */
const OTP_GATED = new Set([
  "src/app/api/auth/register/draft/route.ts GET",
  "src/app/api/auth/register/draft/route.ts POST",
  "src/app/api/auth/register/draft/route.ts DELETE",
]);

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : e.name === "route.ts" ? [p] : [];
  });
}

function unauthenticatedHandlers(): string[] {
  const out: string[] = [];
  for (const abs of [...walk("src/app/api"), ...walk("src/app/uploads")]) {
    const rel = abs.split(path.sep).join("/");
    const src = fs.readFileSync(abs, "utf8");
    const re = /export\s+(?:async\s+function|function|const)\s+(GET|POST|PUT|PATCH|DELETE)\b/g;
    const handlers: { name: string; idx: number }[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) handlers.push({ name: m[1], idx: m.index });
    handlers.forEach((h, i) => {
      const body = src.slice(h.idx, i + 1 < handlers.length ? handlers[i + 1].idx : src.length);
      const key = `${rel} ${h.name}`;
      if (OTP_GATED.has(key)) {
        if (!/isEmailOtpVerified\(/.test(body)) out.push(key);
        return;
      }
      if (!/authenticateRequest\(/.test(body)) out.push(key);
    });
  }
  return out.sort();
}

describe("API route authentication", () => {
  const found = unauthenticatedHandlers();

  it("has no unauthenticated handler outside the allow-lists", () => {
    const unexpected = found.filter((h) => !PUBLIC_BY_DESIGN.has(h) && !KNOWN_GAPS.has(h));
    expect(unexpected).toEqual([]);
  });

  it("keeps KNOWN_GAPS honest: every entry still lacks auth", () => {
    const fixed = [...KNOWN_GAPS].filter((h) => !found.includes(h));
    expect(fixed).toEqual([]);
  });

  it("keeps PUBLIC_BY_DESIGN honest: every entry exists and is unauthenticated", () => {
    const stale = [...PUBLIC_BY_DESIGN].filter((h) => !found.includes(h));
    expect(stale).toEqual([]);
  });
});
