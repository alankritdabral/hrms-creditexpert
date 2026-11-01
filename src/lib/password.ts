import { scryptSync, randomBytes, timingSafeEqual } from "crypto";

/**
 * Password hashing (scrypt, built into Node — no extra dependency).
 * Stored format: "scrypt$<saltHex>$<hashHex>".
 * Legacy plaintext values are still accepted by verifyPassword() so existing
 * accounts keep working; callers should re-hash them on successful login.
 */
const PREFIX = "scrypt$";
const KEY_LEN = 64;

export function isHashedPassword(value: string | undefined | null): boolean {
  return typeof value === "string" && value.startsWith(PREFIX);
}

export function hashPassword(plain: string): string {
  if (isHashedPassword(plain)) return plain; // already hashed — don't double hash
  const salt = randomBytes(16);
  const hash = scryptSync(plain, salt, KEY_LEN);
  return `${PREFIX}${salt.toString("hex")}$${hash.toString("hex")}`;
}

function safeEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

export function verifyPassword(plain: string, stored: string | undefined | null): boolean {
  if (typeof plain !== "string" || typeof stored !== "string" || !stored) return false;
  if (!isHashedPassword(stored)) {
    // Legacy plaintext record — constant-time compare.
    return safeEqual(Buffer.from(plain), Buffer.from(stored));
  }
  const [, saltHex, hashHex] = stored.split("$");
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(plain, Buffer.from(saltHex, "hex"), expected.length);
  return safeEqual(actual, expected);
}

/** Random temporary password for system-created accounts; users set their own via "Forgot password". */
export function generateTempPassword(): string {
  return randomBytes(12).toString("base64url");
}
