import { NextRequest, NextResponse } from "next/server";
import {
  getAttendanceRecords,
  punchAttendance,
  adjustAttendance,
} from "@/lib/db/db-adapter";
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
    const date = searchParams.get("date") || undefined;
    const requestedEmpId = searchParams.get("employeeId") || undefined;

    let records = await getAttendanceRecords(date);

    // If requesting user is an employee, restrict strictly to their own attendance
    if (auth.role === "employee") {
      records = records.filter((r) => r.employeeId === auth.employeeId);
    } else if (requestedEmpId) {
      records = records.filter((r) => r.employeeId === requestedEmpId);
    }

    return NextResponse.json({ success: true, data: records });
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
    const { type, employeeId } = body;

    if (!type) {
      return NextResponse.json(
        { success: false, error: "Punch type ('checkIn' | 'checkOut') is required" },
        { status: 400 }
      );
    }

    // Security check: An employee can ONLY punch attendance for their own employeeId
    const targetEmployeeId = auth.role === "employee" ? auth.employeeId : employeeId || auth.employeeId;

    const record = await punchAttendance(
      targetEmployeeId,
      type,
      {
        name: auth.actor.name,
        role: auth.actor.role,
      }
    );

    return NextResponse.json({ success: true, data: record });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) {
    return authFailureResponse(auth);
  }

  // Attendance manual adjustment strictly requires attendance:manage (Admin & HR)
  const permError = requirePermission(auth, "attendance:manage");
  if (permError) return permError;

  try {
    const body = await req.json();
    const { recordId, updates } = body;

    if (!recordId || !updates) {
      return NextResponse.json(
        { success: false, error: "recordId and updates are required" },
        { status: 400 }
      );
    }

    const updated = await adjustAttendance(
      recordId,
      updates,
      {
        name: auth.actor.name,
        role: auth.actor.role,
      }
    );

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
