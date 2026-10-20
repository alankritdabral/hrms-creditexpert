import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, authFailureResponse } from "@/lib/api-auth";
import { ROLE_PERMISSIONS } from "@/lib/permissions";
import { getUserAccountById } from "@/lib/db/db-adapter";

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);

  if (!auth.authenticated) {
    return authFailureResponse(auth);
  }

  const userAccount = await getUserAccountById(auth.session.userId);

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
      }
    : {
        id: auth.session.userId,
        employeeId: auth.session.employeeId,
        email: auth.session.email,
        name: auth.session.name,
        role: auth.session.role,
        branch: auth.session.branch,
      };

  return NextResponse.json({
    success: true,
    session: auth.session,
    user: userPayload,
    role: auth.role,
    branch: auth.branch,
    branchScope: auth.branchScope,
    employeeId: auth.employeeId,
    permissions: ROLE_PERMISSIONS[auth.role],
  });
}
