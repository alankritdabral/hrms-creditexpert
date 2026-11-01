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
export function isLocalEnvironment(_req?: Request | { headers: { get: (name: string) => string | null } }): boolean {
  // SECURITY: never derive "local" from request headers (Host / X-Forwarded-Host are
  // attacker-controlled). On the server, trust only the build/runtime mode, so a
  // production deployment can never be tricked into the dev auth bypass, dev OTP
  // disclosure, or the seed endpoint. The `_req` parameter is kept for API compatibility.
  if (typeof window !== "undefined") {
    return isLocalhost();
  }
  return process.env.NODE_ENV !== "production";
}
