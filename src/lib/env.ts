/**
 * Environment & Host Detection Utility
 * Enforces separation between Localhost/Development vs Main Website (Production)
 */

/**
 * Checks whether the current browser client is running on localhost.
 */
export function isLocalhost(): boolean {
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname.endsWith(".localhost") ||
      hostname === "[::1]" ||
      hostname.startsWith("192.168.") ||
      hostname.startsWith("10.") ||
      hostname.startsWith("172.")
    );
  }

  return process.env.NODE_ENV !== "production";
}

/**
 * Server and Client runtime environment checker.
 * Returns true only when executing on a local development host.
 */
export function isLocalEnvironment(req?: Request | { headers: { get: (name: string) => string | null } }): boolean {
  if (req) {
    const host = (req.headers.get("x-forwarded-host") || req.headers.get("host") || "").toLowerCase();
    const hostname = host.split(":")[0];
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname.endsWith(".localhost") ||
      hostname === "[::1]" ||
      hostname.startsWith("192.168.") ||
      hostname.startsWith("10.") ||
      hostname.startsWith("172.")
    ) {
      return true;
    }
    // If request comes from a verified production domain (e.g. creditexpertindia.com)
    if (host && (host.includes("creditexpertindia.com") || host.includes("vercel.app"))) {
      return false;
    }
  }

  if (typeof window !== "undefined") {
    return isLocalhost();
  }

  return process.env.NODE_ENV !== "production";
}
