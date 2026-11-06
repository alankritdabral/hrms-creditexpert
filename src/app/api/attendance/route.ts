import { NextRequest, NextResponse } from "next/server";
import {
  getAttendanceRecords,
  punchAttendance,
  adjustAttendance,
  upsertAttendanceRecord,
  getEmployees,
  clearAttendanceRecords,
} from "@/lib/db/db-adapter";
import {
  authenticateRequest,
  authFailureResponse,
  requirePermission,
  requireBranchScope,
  callerOf,
} from "@/lib/api-auth";
import { hasPermission } from "@/lib/permissions";
import { resolveTargetEmployeeId } from "@/lib/access";
import { isLocalEnvironment } from "@/lib/env";
import { getISTDateString } from "@/lib/attendance/ist-time";
import { validateCoordinates } from "@/lib/attendance/geolocation";

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) {
    return authFailureResponse(auth);
  }

  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date") || undefined;
    const requestedEmpId = searchParams.get("employeeId") || undefined;

    const month = searchParams.get("month");
    const from = searchParams.get("from") || (month ? `${month}-01` : undefined);
    const to = searchParams.get("to") || (month ? `${month}-31` : undefined);
    const own = !hasPermission(auth, "attendance:view_all");
    const targetEmp = own ? auth.employeeId : requestedEmpId;

    // Always scope the database read; with no filter at all, default to the current month
    // instead of loading every record ever created.
    const scoped = date || from || to || targetEmp;
    let records = await getAttendanceRecords(
      scoped
        ? { date, from, to, employeeId: targetEmp }
        : { from: `${getISTDateString().slice(0, 7)}-01` }
    );

    // Own records only, unless the role may view everyone — and then only within its branch scope.
    if (own) {
      records = records.filter((r) => r.employeeId === auth.employeeId);
    } else {
      const allowed = new Set(
        (await getEmployees())
          .filter((e) => auth.branchScope.includes(e.employment.branch))
          .map((e) => e.employeeId)
      );
      records = records.filter((r) => allowed.has(r.employeeId));
      if (requestedEmpId) records = records.filter((r) => r.employeeId === requestedEmpId);
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
    const { type = "checkIn", employeeId, latitude, longitude, accuracy } = body;

    if (type === "checkOut") {
      return NextResponse.json(
        { success: false, error: "Clock-out is not supported. Attendance is recorded on Clock-In." },
        { status: 400 }
      );
    }

    let locationData: { latitude: number; longitude: number; accuracy: number } | undefined;

    // If coordinates are provided, validate them
    if (latitude !== undefined || longitude !== undefined) {
      const coordCheck = validateCoordinates(latitude, longitude, accuracy ?? 0);
      if (!coordCheck.valid) {
        return NextResponse.json(
          { success: false, error: coordCheck.error },
          { status: 400 }
        );
      }
      locationData = {
        latitude: Number(latitude),
        longitude: Number(longitude),
        accuracy: Number(accuracy ?? 0),
      };
    } else if (!hasPermission(auth, "attendance:manage")) {
      // Everyone except attendance managers (admin/HR) must provide GPS location
      return NextResponse.json(
        {
          success: false,
          code: "LOCATION_REQUIRED",
          error: "GPS location is required to clock in. Please enable location access in your browser.",
        },
        { status: 400 }
      );
    }

    // Only attendance:manage (admin/HR) may clock someone else in; everyone else clocks in as themselves
    const targetEmployeeId = resolveTargetEmployeeId(callerOf(auth), employeeId, "attendance:manage");

    const record = await punchAttendance(
      targetEmployeeId,
      "checkIn",
      {
        name: auth.actor.name,
        role: auth.actor.role,
      },
      locationData
    );

    return NextResponse.json({
      success: true,
      data: record,
      message: "Attendance marked successfully.",
      distanceMeters: record.checkInDistanceMeters,
    });
  } catch (error: any) {
    const message = error.message || "Failed to process attendance";
    const isOutside = message.includes("outside the allowed office attendance area");
    const isLowAccuracy = message.includes("GPS accuracy is too low");
    const isAlreadyClockedIn = message.includes("already clocked in");

    const statusCode = isOutside ? 403 : 400;
    const errorCode = isOutside
      ? "OUTSIDE_ATTENDANCE_RADIUS"
      : isLowAccuracy
      ? "LOW_GPS_ACCURACY"
      : isAlreadyClockedIn
      ? "ALREADY_CHECKED_IN"
      : "ATTENDANCE_ERROR";

    return NextResponse.json(
      { success: false, code: errorCode, error: message },
      { status: statusCode }
    );
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
    const { recordId, updates, employeeId, date } = body;

    if ((!recordId && !(employeeId && date)) || !updates) {
      return NextResponse.json(
        { success: false, error: "updates plus recordId (or employeeId + date) are required" },
        { status: 400 }
      );
    }
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ success: false, error: "date must be YYYY-MM-DD" }, { status: 400 });
    }

    // Only allow editing of these fields, and only within the editor's branch scope.
    const safe: Record<string, unknown> = {};
    for (const k of ["status", "checkIn", "remarks"]) if (k in updates) safe[k] = updates[k];
    const actor = { name: auth.actor.name, role: auth.actor.role };
    const employees = await getEmployees();

    let updated;
    if (employeeId && date) {
      const emp = employees.find((e) => e.employeeId === employeeId);
      if (!emp) {
        return NextResponse.json({ success: false, error: "Employee not found" }, { status: 404 });
      }
      const scopeErr = requireBranchScope(auth, emp.employment.branch);
      if (scopeErr) return scopeErr;
      updated = await upsertAttendanceRecord(
        { employeeId, employeeName: emp.personal.fullName || emp.personal.firstName },
        date,
        safe,
        actor
      );
    } else {
      const existing = (await getAttendanceRecords()).find((r) => r.id === recordId);
      const emp = existing && employees.find((e) => e.employeeId === existing.employeeId);
      if (emp) {
        const scopeErr = requireBranchScope(auth, emp.employment.branch);
        if (scopeErr) return scopeErr;
      }
      updated = await adjustAttendance(recordId, safe, actor);
      if (!updated) {
        return NextResponse.json({ success: false, error: "Record not found" }, { status: 404 });
      }
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) {
    return authFailureResponse(auth);
  }

  const permError = requirePermission(auth, "attendance:manage");
  if (permError) return permError;

  // Wiping the whole collection is a development-only reset.
  if (!isLocalEnvironment(req)) {
    return NextResponse.json(
      { success: false, error: "Forbidden: resetting attendance data is disabled in production." },
      { status: 403 }
    );
  }

  try {
    const deletedCount = await clearAttendanceRecords({
      name: auth.actor.name,
      role: auth.actor.role,
    });

    return NextResponse.json({
      success: true,
      message: `Cleared all attendance records for a fresh start. (${deletedCount} documents deleted from cloud store)`,
      deletedCount,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

