import { NextRequest, NextResponse } from "next/server";
import { attachTemporaryEmployee, getEmployeeRenameDetails, renameEmployee, ConflictError, ValidationError } from "@/lib/db/db-adapter";
import { authenticateRequest, authFailureResponse, requirePermission, type AuthSuccess } from "@/lib/api-auth";

/**
 * Employee details for the Login Sheet "rename" dialog (GET) and the rename itself (PATCH).
 * Both need logins:manage and logins:view_all, the same rights as entering rows for other people.
 * The employee ID never changes; only the name does.
 */
function guard(auth: AuthSuccess) {
  const manage = requirePermission(auth, "logins:manage");
  if (manage) return manage;
  const viewAll = requirePermission(auth, "logins:view_all");
  if (viewAll) return viewAll;
  return null;
}

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) return authFailureResponse(auth);
  const denied = guard(auth);
  if (denied) return denied;
  const id = (req.nextUrl.searchParams.get("employeeId") || "").trim();
  if (!id) return NextResponse.json({ success: false, error: "Employee ID is required." }, { status: 400 });
  try {
    const details = await getEmployeeRenameDetails(id);
    if (!details) return NextResponse.json({ success: false, error: "Employee not found." }, { status: 404 });
    return NextResponse.json({ success: true, data: details });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) return authFailureResponse(auth);
  const denied = guard(auth);
  if (denied) return denied;
  try {
    const body = await req.json().catch(() => ({}));
    const employeeId = typeof body?.employeeId === "string" ? body.employeeId.trim() : "";
    const name = typeof body?.name === "string" ? body.name : "";
    if (!employeeId) return NextResponse.json({ success: false, error: "Employee ID is required." }, { status: 400 });
    const result = await renameEmployee(employeeId, name, {
      name: auth.actor?.name || auth.session?.name || "User",
      role: auth.actor?.role || auth.role,
    });
    if (!result) return NextResponse.json({ success: false, error: "Employee not found." }, { status: 404 });
    return NextResponse.json({
      success: true,
      data: {
        employeeId: result.employee.employeeId,
        name: result.employee.personal.fullName,
        oldName: result.oldName,
        loginSheetRows: result.loginSheetRows,
      },
    });
  } catch (error: any) {
    const status = error instanceof ConflictError ? 409 : error instanceof ValidationError ? 400 : 500;
    return NextResponse.json({ success: false, error: error.message }, { status });
  }
}

/**
 * Merges a temporary employee into a registered one: the temporary employee's login data (Login Sheet rows,
 * monthly login records and manual incentives) moves to the registered employee, whose own name and record
 * are left as they are. The temporary record is then removed.
 */
export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) return authFailureResponse(auth);
  const denied = guard(auth);
  if (denied) return denied;
  try {
    const body = await req.json().catch(() => ({}));
    const temporaryId = typeof body?.temporaryId === "string" ? body.temporaryId.trim() : "";
    const targetEmployeeId = typeof body?.targetEmployeeId === "string" ? body.targetEmployeeId.trim() : "";
    if (!temporaryId || !targetEmployeeId) {
      return NextResponse.json({ success: false, error: "Choose the employee to merge into." }, { status: 400 });
    }
    const result = await attachTemporaryEmployee(temporaryId, targetEmployeeId, {
      name: auth.actor?.name || auth.session?.name || "User",
      role: auth.actor?.role || auth.role,
    });
    return NextResponse.json({
      success: true,
      data: {
        temporaryId,
        employeeId: result.target.employeeId,
        name: result.target.personal.fullName,
        loginSheetRows: result.loginSheetRows,
        loginRecords: result.loginRecords,
        incentives: result.incentives,
        accountMoved: result.accountMoved,
      },
    });
  } catch (error: any) {
    const status = error instanceof ConflictError ? 409 : error instanceof ValidationError ? 400 : 500;
    return NextResponse.json({ success: false, error: error.message }, { status });
  }
}
