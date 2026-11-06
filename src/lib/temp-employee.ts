import "server-only";
import { ensureTemporaryEmployee } from "./db/db-adapter";
import type { AuthSuccess } from "./api-auth";

/**
 * Makes sure a signed-in person who is acting as themselves has an employee record, by creating a
 * temporary one when their account has none. Admin and HR manage employee records themselves, so
 * they are left alone. Never throws: saving the entry matters more than the placeholder.
 */
export async function ensureCallerEmployee(auth: AuthSuccess): Promise<void> {
  if (auth.role === "admin" || auth.role === "hr") return;
  try {
    await ensureTemporaryEmployee(
      {
        employeeId: auth.employeeId,
        name: auth.actor?.name || auth.session?.name || auth.employeeId,
        email: auth.actor?.email || auth.session?.email,
        branch: auth.branch,
      },
      { name: auth.actor?.name || auth.session?.name || "System", role: auth.role }
    );
  } catch (e) {
    console.warn("ensureCallerEmployee failed:", e);
  }
}
