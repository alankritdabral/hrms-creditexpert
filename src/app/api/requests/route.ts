import { NextRequest, NextResponse } from "next/server";
import { getRequests, createRequest, updateRequestStatus } from "@/lib/db/db-adapter";
import { authenticateRequest, authFailureResponse, requirePermission } from "@/lib/api-auth";

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) {
    return authFailureResponse(auth);
  }

  try {
    const { searchParams } = new URL(req.url);
    const requestedEmpId = searchParams.get("employeeId") || undefined;

    let requests = await getRequests();

    if (auth.role === "employee") {
      requests = requests.filter((r) => r.employeeId === auth.employeeId);
    } else if (requestedEmpId) {
      requests = requests.filter((r) => r.employeeId === requestedEmpId);
    }

    return NextResponse.json({ success: true, data: requests });
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
    const { employeeId, employeeName, department, requestType, subject, details } = body;

    const targetEmployeeId = auth.role === "employee" ? auth.employeeId : employeeId || auth.employeeId;
    const targetEmployeeName = auth.role === "employee" ? auth.actor.name : employeeName || auth.actor.name;

    const newRequest = await createRequest(
      {
        employeeId: targetEmployeeId,
        employeeName: targetEmployeeName,
        department: department || "General",
        requestType,
        subject,
        details,
      },
      {
        name: auth.actor.name,
        role: auth.actor.role,
      }
    );

    return NextResponse.json({ success: true, data: newRequest }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) {
    return authFailureResponse(auth);
  }

  // Resolving or rejecting HR requests requires requests:manage (Admin & HR)
  const permError = requirePermission(auth, "requests:manage");
  if (permError) return permError;

  try {
    const body = await req.json();
    const { id, status, resolutionNotes } = body;

    const updated = await updateRequestStatus(
      id,
      status,
      resolutionNotes,
      {
        name: auth.actor.name,
        role: auth.actor.role,
      }
    );

    if (!updated) {
      return NextResponse.json({ success: false, error: "Request not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
