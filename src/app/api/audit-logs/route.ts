import { NextRequest, NextResponse } from "next/server";
import { getAuditLogs } from "@/lib/db/db-adapter";
import { authenticateRequest, authFailureResponse, requirePermission } from "@/lib/api-auth";

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) {
    return authFailureResponse(auth);
  }

  // Audit logs are strictly restricted to Admin and HR
  const permError = requirePermission(auth, "audit_logs:view");
  if (permError) return permError;

  try {
    const logs = await getAuditLogs();
    return NextResponse.json({ success: true, data: logs });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
