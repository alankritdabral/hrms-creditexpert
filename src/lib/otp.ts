import { createHash, randomInt, timingSafeEqual } from "node:crypto";

/** Cryptographically random 6-digit one-time code. */
export function generateOtpCode(): string {
  return String(randomInt(100000, 1000000));
}

/** Stored form of a code: a hash bound to the email it was issued for. The plain code is never stored. */
export function hashOtp(code: string, email: string): string {
  return createHash("sha256").update(`${email.toLowerCase().trim()}:${code.trim()}`).digest("hex");
}

/** Constant-time comparison of a submitted code against a stored hash. */
export function otpMatches(submitted: string, email: string, storedHash: string | undefined): boolean {
  if (typeof submitted !== "string" || typeof storedHash !== "string") return false;
  const a = Buffer.from(hashOtp(submitted, email), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
