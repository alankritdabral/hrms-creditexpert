import { NextRequest, NextResponse } from "next/server";
import { getEmployeeLogins, saveEmployeeLogin, getEmployeeLoginById } from "@/lib/db/db-adapter";
import { authenticateRequest, authFailureResponse, requirePermission } from "@/lib/api-auth";
import { hasPermission } from "@/lib/permissions";
import { ensureCallerEmployee } from "@/lib/temp-employee";
import { getISTMonthString } from "@/lib/attendance/ist-time";

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) {
    return authFailureResponse(auth);
  }

  try {
    const { searchParams } = new URL(req.url);
    const month = searchParams.get("month") || getISTMonthString();
    let logins = await getEmployeeLogins(month);

    // Callers without logins:view_all may only ever see their own records (enforced server-side, not by a client hint).
    if (!hasPermission(auth, "logins:view_all") || searchParams.get("scope") === "mine") {
      logins = logins.filter((l) => l.employeeId === auth.employeeId);
    } else {
      // Managers/HR are limited to their branch scope.
      logins = logins.filter((l) => !l.branch || auth.branchScope.includes(l.branch));
    }

    return NextResponse.json({ success: true, data: logins });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) {
    return authFailureResponse(auth);
  }

  const permError = requirePermission(auth, "logins:manage");
  if (permError) return permError;

  try {
    const body = await req.json();
    const {
      id,
      employeeId,
      employeeName,
      month,
      commitment,
      loginCommitment,
      loginsCount,
      submissionDate,
      lastLoginDate,
      banks,
      remarks,
      totalDisbursal,
      axisBankDisbursal,
      otherBanksDisbursal,
    } = body;

    if (!employeeId || !month) {
      return NextResponse.json(
        { success: false, error: "employeeId and month are required" },
        { status: 400 }
      );
    }

    // Callers without logins:view_all (employees, custom roles) can only save their OWN records.
    const canManageOthers = hasPermission(auth, "logins:view_all");
    if (!canManageOthers && employeeId !== auth.employeeId) {
      return NextResponse.json(
        { success: false, error: "Forbidden: you can only update your own login records." },
        { status: 403 }
      );
    }
    if (!canManageOthers && id && id !== `login-${auth.employeeId}-${month}`) {
      const existing = await getEmployeeLoginById(id);
      if (!existing || existing.employeeId !== auth.employeeId) {
        return NextResponse.json(
          { success: false, error: "Forbidden: invalid record for your account." },
          { status: 403 }
        );
      }
    }

    // Saving as yourself with no employee record yet: a temporary one is created so the record has an owner.
    if (employeeId === auth.employeeId) await ensureCallerEmployee(auth);

    const record = await saveEmployeeLogin(
      {
        id,
        employeeId,
        employeeName,
        month,
        commitment: Number(commitment) || 0,
        loginCommitment: Number(loginCommitment) || 0,
        loginsCount: Number(loginsCount) || 0,
        submissionDate,
        lastLoginDate,
        banks,
        remarks,
        totalDisbursal,
        axisBankDisbursal,
        otherBanksDisbursal,
      },
      {
        name: auth.actor?.name || auth.session?.name || "User",
        role: auth.actor?.role || auth.session?.role || auth.role || "employee",
      }
    );

    return NextResponse.json({ success: true, data: record });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) {
    return authFailureResponse(auth);
  }

  const permError = requirePermission(auth, "logins:manage");
  if (permError) return permError;

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ success: false, error: "Record ID is required" }, { status: 400 });
    }

    const { deleteEmployeeLogin } = await import("@/lib/db/db-adapter");

    // Callers without logins:view_all may delete only their own records.
    if (!hasPermission(auth, "logins:view_all")) {
      const existing = await getEmployeeLoginById(id);
      if (!existing || existing.employeeId !== auth.employeeId) {
        return NextResponse.json(
          { success: false, error: "Forbidden: you can only delete your own login records." },
          { status: 403 }
        );
      }
    }
    const success = await deleteEmployeeLogin(id, {
      name: auth.actor?.name || auth.session?.name || "User",
      role: auth.actor?.role || auth.session?.role || auth.role || "employee",
    });

    return NextResponse.json({ success });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
