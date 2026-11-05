import { NextRequest, NextResponse } from "next/server";
import { getLeaveRequests, applyLeave, reviewLeave, ConflictError } from "@/lib/db/db-adapter";
import { paginateList } from "@/lib/pagination";
import {
  authenticateRequest,
  authFailureResponse,
  requirePermission,
  callerOf,
} from "@/lib/api-auth";
import { hasPermission } from "@/lib/permissions";
import { ownOrScoped, resolveTargetEmployeeId } from "@/lib/access";

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) {
    return authFailureResponse(auth);
  }

  try {
    const { searchParams } = new URL(req.url);
    const requestedEmpId = searchParams.get("employeeId") || undefined;

    let leaves = await getLeaveRequests();

    // Callers without leaves:view_all (employees, custom roles) only ever see their own leave records
    leaves = ownOrScoped(callerOf(auth), "leaves:view_all", leaves, (l) => l.employeeId);
    if (requestedEmpId && hasPermission(auth.role, "leaves:view_all")) {
      leaves = leaves.filter((l) => l.employeeId === requestedEmpId);
    }

    // status=pending / status=past lets the UI page the history while keeping the pending queue whole
    const statusFilter = searchParams.get("status");
    if (statusFilter === "pending") leaves = leaves.filter((l) => l.status === "Pending");
    else if (statusFilter === "past") leaves = leaves.filter((l) => l.status !== "Pending");

    const paged = paginateList(leaves, searchParams);
    if (paged) return NextResponse.json({ success: true, ...paged });
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

    // Only leaves:manage (admin/HR) may apply on someone else's behalf
    const targetEmployeeId = resolveTargetEmployeeId(callerOf(auth), employeeId, "leaves:manage");
    const targetEmployeeName = targetEmployeeId === auth.employeeId ? auth.actor.name : employeeName || targetEmployeeId;

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
    return NextResponse.json(
      { success: false, error: error.message },
      { status: error instanceof ConflictError ? 409 : 500 }
    );
  }
}
