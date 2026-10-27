import { NextRequest, NextResponse } from "next/server";
import { getEmployeeLogins, saveEmployeeLogin } from "@/lib/db/db-adapter";
import { authenticateRequest, authFailureResponse, requirePermission } from "@/lib/api-auth";

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) {
    return authFailureResponse(auth);
  }

  try {
    const { searchParams } = new URL(req.url);
    const month = searchParams.get("month") || new Date().toISOString().slice(0, 7);
    let logins = await getEmployeeLogins(month);

    if (auth.role === "employee" && searchParams.get("scope") === "mine") {
      logins = logins.filter((l) => l.employeeId === auth.employeeId);
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
    const success = await deleteEmployeeLogin(id, {
      name: auth.actor?.name || auth.session?.name || "User",
      role: auth.actor?.role || auth.session?.role || auth.role || "employee",
    });

    return NextResponse.json({ success });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
