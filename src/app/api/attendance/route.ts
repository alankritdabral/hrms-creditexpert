import { NextRequest, NextResponse } from "next/server";
import {
  getAttendanceRecords,
  punchAttendance,
  adjustAttendance,
  clearAttendanceRecords,
} from "@/lib/db/db-adapter";
import {
  authenticateRequest,
  authFailureResponse,
  requirePermission,
} from "@/lib/api-auth";
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
    } else if (auth.role === "employee") {
      // Employees are required to provide GPS location
      return NextResponse.json(
        {
          success: false,
          code: "LOCATION_REQUIRED",
          error: "GPS location is required to clock in. Please enable location access in your browser.",
        },
        { status: 400 }
      );
    }

    // Security check: An employee can ONLY punch attendance for their own employeeId
    const targetEmployeeId = auth.role === "employee" ? auth.employeeId : employeeId || auth.employeeId;

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

export async function DELETE(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) {
    return authFailureResponse(auth);
  }

  const permError = requirePermission(auth, "attendance:manage");
  if (permError) return permError;

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

