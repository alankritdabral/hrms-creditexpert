import { NextRequest, NextResponse } from "next/server";
import {
  getIncentiveSchemes,
  getEmployeeIncentives,
  addIncentiveRecord,
  calculateAndSyncIncentivesFromLogins,
} from "@/lib/db/db-adapter";
import { authenticateRequest, authFailureResponse, requirePermission } from "@/lib/api-auth";

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) {
    return authFailureResponse(auth);
  }

  try {
    const { searchParams } = new URL(req.url);
    const month = searchParams.get("month") || undefined;
    const schemes = await getIncentiveSchemes();
    let incentives = await getEmployeeIncentives(month);

    if (auth.role === "employee") {
      incentives = incentives.filter((i) => i.employeeId === auth.employeeId);
    }

    return NextResponse.json({ success: true, data: { schemes, incentives } });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) {
    return authFailureResponse(auth);
  }

  const permError = requirePermission(auth, "incentives:manage");
  if (permError) return permError;

  try {
    const body = await req.json();

    // Auto-sync from Logins
    if (body.action === "sync_from_logins") {
      const month = body.month || new Date().toISOString().slice(0, 7);
      const synced = await calculateAndSyncIncentivesFromLogins(month, {
        name: auth.actor.name,
        role: auth.actor.role,
      });
      return NextResponse.json({ success: true, data: synced });
    }

    const {
      employeeId,
      employeeName,
      month,
      schemeId,
      schemeName,
      target,
      achievement,
      eligibleAmount,
      incentiveAmount,
      calculationBreakdown,
      sourceLoginRecordId,
    } = body;

    const record = await addIncentiveRecord(
      {
        employeeId,
        employeeName: employeeName || employeeId,
        month,
        schemeId,
        schemeName,
        target: Number(target) || 0,
        achievement: Number(achievement) || 0,
        eligibleAmount: Number(eligibleAmount) || 0,
        incentiveAmount: Number(incentiveAmount) || 0,
        status: body.status || "Approved",
        approvedBy: auth.actor.name,
        approvedDate: new Date().toISOString().split("T")[0],
        calculationBreakdown,
        sourceLoginRecordId,
      },
      {
        name: auth.actor.name,
        role: auth.actor.role,
      }
    );

    return NextResponse.json({ success: true, data: record }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) {
    return authFailureResponse(auth);
  }

  const permError = requirePermission(auth, "incentives:manage");
  if (permError) return permError;

  try {
    const body = await req.json();

    if (body.action === "update_scheme") {
      const { id, ...updates } = body;
      const { updateIncentiveScheme } = await import("@/lib/db/db-adapter");
      const scheme = await updateIncentiveScheme(id || "scheme-disbursal-slab", updates, {
        name: auth.actor.name,
        role: auth.actor.role,
      });
      return NextResponse.json({ success: true, data: scheme });
    }

    const { id, ...updates } = body;
    if (!id) {
      return NextResponse.json({ success: false, error: "Record ID is required" }, { status: 400 });
    }

    const { updateEmployeeIncentive } = await import("@/lib/db/db-adapter");
    const updated = await updateEmployeeIncentive(id, updates, {
      name: auth.actor.name,
      role: auth.actor.role,
    });

    if (!updated) {
      return NextResponse.json({ success: false, error: "Record not found" }, { status: 404 });
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

  const permError = requirePermission(auth, "incentives:manage");
  if (permError) return permError;

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ success: false, error: "Record ID is required" }, { status: 400 });
    }

    const { deleteEmployeeIncentive } = await import("@/lib/db/db-adapter");
    const success = await deleteEmployeeIncentive(id, {
      name: auth.actor.name,
      role: auth.actor.role,
    });

    return NextResponse.json({ success });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
