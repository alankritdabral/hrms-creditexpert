import { NextRequest, NextResponse } from "next/server";
import { getLeaveRequests, applyLeave, reviewLeave } from "@/lib/db/db-adapter";
import {
  authenticateRequest,
  authFailureResponse,
  requirePermission,
} from "@/lib/api-auth";

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) {
    return authFailureResponse(auth);
  }

  try {
    const { searchParams } = new URL(req.url);
    const requestedEmpId = searchParams.get("employeeId") || undefined;

    let leaves = await getLeaveRequests();

    // If requesting user is an employee, restrict strictly to their own leave records
    if (auth.role === "employee") {
      leaves = leaves.filter((l) => l.employeeId === auth.employeeId);
    } else if (requestedEmpId) {
      leaves = leaves.filter((l) => l.employeeId === requestedEmpId);
    }

    return NextResponse.json({ success: true, data: leaves });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) {
    return authFailureResponse(auth);
  }

  try {
    const body = await req.json();
    const { employeeId, employeeName, department, leaveType, startDate, endDate, days, reason } = body;

    if (!leaveType || !startDate || !endDate) {
      return NextResponse.json(
        { success: false, error: "Missing required leave parameters (leaveType, startDate, endDate)" },
        { status: 400 }
      );
    }

    // Security check: An employee can ONLY apply for leave under their own employeeId
    const targetEmployeeId = auth.role === "employee" ? auth.employeeId : employeeId || auth.employeeId;
    const targetEmployeeName = auth.role === "employee" ? auth.actor.name : employeeName || auth.actor.name;

    const newLeave = await applyLeave(
      {
        employeeId: targetEmployeeId,
        employeeName: targetEmployeeName,
        department: department || "General",
        leaveType,
        startDate,
        endDate,
        days: days || 1,
        reason: reason || "",
      },
      {
        name: auth.actor.name,
        role: auth.actor.role,
      }
    );

    return NextResponse.json({ success: true, data: newLeave }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) {
    return authFailureResponse(auth);
  }

  // Approving/rejecting leave strictly requires leaves:manage (Admin & HR)
  const permError = requirePermission(auth, "leaves:manage");
  if (permError) return permError;

  try {
    const body = await req.json();
    const { leaveId, status, reviewNotes } = body;

    if (!leaveId || !status) {
      return NextResponse.json(
        { success: false, error: "leaveId and status ('Approved' | 'Rejected') are required" },
        { status: 400 }
      );
    }

    const reviewed = await reviewLeave(
      leaveId,
      status,
      reviewNotes || "",
      {
        name: auth.actor.name,
        role: auth.actor.role,
      }
    );

    if (!reviewed) {
      return NextResponse.json({ success: false, error: "Leave request not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: reviewed });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
