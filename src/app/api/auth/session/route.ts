import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, authFailureResponse, toPublicSession } from "@/lib/api-auth";
import { getRolePermissions } from "@/lib/permissions";
import { getUserAccountById } from "@/lib/db/db-adapter";
import { resolveAllowedSections } from "@/lib/allowed-sections";

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
  const allowedSections = await resolveAllowedSections(userAccount?.role || auth.session.role);

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
    session: toPublicSession(auth.session),
    user: userPayload,
    role: userPayload.role,
    branch: auth.branch,
    branchScope: auth.branchScope,
    employeeId: auth.employeeId,
    allowedSections,
    permissions: getRolePermissions(auth.role),
  });
}
