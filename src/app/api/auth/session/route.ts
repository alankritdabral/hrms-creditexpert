import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, authFailureResponse } from "@/lib/api-auth";
import { ROLE_PERMISSIONS } from "@/lib/permissions";
import { getUserAccountById, getCustomRoles } from "@/lib/db/db-adapter";
import { APP_SECTIONS, DEFAULT_ROLES } from "@/lib/types";

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);

  if (!auth.authenticated) {
    if (auth.code === "UNAUTHENTICATED") {
      return NextResponse.json(
        {
          success: false,
          authenticated: false,
          user: null,
          session: null,
        },
        { status: 200 }
      );
    }
    return authFailureResponse(auth);
  }

  const userAccount = await getUserAccountById(auth.session.userId);
  const roles = await getCustomRoles();
  const effectiveRole = (userAccount?.role || auth.session.role || "employee").toLowerCase();
  const matchedRole = roles.find((r) => r.id.toLowerCase() === effectiveRole);
  const allowedSections =
    effectiveRole === "admin"
      ? APP_SECTIONS.map((s) => s.id)
      : matchedRole
      ? matchedRole.sections
      : DEFAULT_ROLES.find((r) => r.id === "employee")?.sections || [];

  const userPayload = userAccount
    ? {
        id: userAccount.uid,
        employeeId: userAccount.employeeId,
        email: userAccount.email,
        name: userAccount.name,
        role: userAccount.role,
        branch: userAccount.branch,
        department: userAccount.department,
        avatar: userAccount.avatar,
        allowedSections,
      }
    : {
        id: auth.session.userId,
        employeeId: auth.session.employeeId,
        email: auth.session.email,
        name: auth.session.name,
        role: auth.session.role,
        branch: auth.session.branch,
        allowedSections,
      };

  return NextResponse.json({
    success: true,
    session: auth.session,
    user: userPayload,
    role: userPayload.role,
    branch: auth.branch,
    branchScope: auth.branchScope,
    employeeId: auth.employeeId,
    allowedSections,
    permissions: ROLE_PERMISSIONS[auth.role as keyof typeof ROLE_PERMISSIONS] || [],
  });
}
