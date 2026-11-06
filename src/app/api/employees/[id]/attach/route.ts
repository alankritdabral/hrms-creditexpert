import { NextRequest, NextResponse } from "next/server";
import { attachTemporaryEmployee, ConflictError, ValidationError } from "@/lib/db/db-adapter";
import { authenticateRequest, authFailureResponse, requirePermission } from "@/lib/api-auth";

/** Merges a temporary employee into a registered one (moves their Login Sheet rows, logins and incentives). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) return authFailureResponse(auth);
  const permError = requirePermission(auth, "employees:manage");
  if (permError) return permError;

  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const targetEmployeeId = typeof body?.targetEmployeeId === "string" ? body.targetEmployeeId.trim() : "";
    if (!targetEmployeeId) {
      return NextResponse.json({ success: false, error: "Choose the employee to attach to." }, { status: 400 });
    }
    const result = await attachTemporaryEmployee(id, targetEmployeeId, {
      name: auth.actor?.name || auth.session?.name || "User",
      role: auth.actor?.role || auth.role,
    });
    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    const status = error instanceof ConflictError ? 409 : error instanceof ValidationError ? 400 : 500;
    return NextResponse.json({ success: false, error: error.message }, { status });
  }
}
