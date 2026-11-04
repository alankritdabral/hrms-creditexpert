import { NextRequest, NextResponse } from "next/server";
import { getAuditLogs } from "@/lib/db/db-adapter";
import { paginateList } from "@/lib/pagination";
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
    const paged = paginateList(logs, new URL(req.url).searchParams, (l, q) =>
      [l.action, l.who, l.details, l.employeeName].some((v) => v?.toLowerCase().includes(q))
    );
    if (paged) return NextResponse.json({ success: true, ...paged });
    return NextResponse.json({ success: true, data: logs });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
