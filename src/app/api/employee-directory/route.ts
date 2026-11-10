import { NextRequest, NextResponse } from "next/server";
import { getEmployees } from "@/lib/db/db-adapter";
import { authenticateRequest, authFailureResponse } from "@/lib/api-auth";
import { hasPermission } from "@/lib/permissions";

/**
 * A name-only list of every employee (id, name, branch, department), for pickers such as "enter this Login Sheet
 * row for someone else". It deliberately carries no contact, salary or statutory details, so it can be
 * offered to callers who may act on everyone's logins without opening up the full employee directory.
 */
export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) return authFailureResponse(auth);

  if (!hasPermission(auth, "logins:view_all") && !hasPermission(auth, "employees:view_all")) {
    return NextResponse.json(
      { success: false, error: 'Forbidden: Action requires permission "logins:view_all".', code: "FORBIDDEN" },
      { status: 403 }
    );
  }

  try {
    const people: { employeeId: string; name: string; department?: string; branch?: string; isTemporary?: boolean }[] = (await getEmployees()).map((e) => ({
      employeeId: e.employeeId,
      name: e.personal?.fullName || e.employeeId,
      department: e.employment?.department,
      branch: e.employment?.branch,
      ...(e.isTemporary ? { isTemporary: true } : {}),
    }));
    // A signed-in user with no employee record (for example a login-only account) must still be able to pick themselves.
    if (!people.some((p) => p.employeeId === auth.employeeId)) {
      people.push({
        employeeId: auth.employeeId,
        name: auth.actor?.name || auth.session?.name || auth.employeeId,
        branch: auth.branch,
      });
    }
    people.sort((a, b) => a.name.localeCompare(b.name));
    return NextResponse.json({ success: true, data: people });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
