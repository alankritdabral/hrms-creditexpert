import { getCustomRoles } from "@/lib/db/db-adapter";
import { APP_SECTIONS, DEFAULT_ROLES } from "@/lib/types";

/**
 * Resolves which app sections a role may open. Shared by login and session
 * so both responses always agree (a custom role must not look different
 * right after login than it does after a refresh).
 */
export async function resolveAllowedSections(role: string | undefined | null): Promise<string[]> {
  const effectiveRole = (role || "employee").toLowerCase();
  if (effectiveRole === "admin") return APP_SECTIONS.map((s) => s.id);

  const roles = await getCustomRoles();
  const matchedRole = roles.find((r) => r.id.toLowerCase() === effectiveRole);
  if (matchedRole) return matchedRole.sections;

  return DEFAULT_ROLES.find((r) => r.id === "employee")?.sections || [];
}
