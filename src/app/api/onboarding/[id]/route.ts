import { NextRequest, NextResponse } from "next/server";
import {
  getOnboardingRecordById,
  updateOnboardingChecklist,
  advanceEmployeeLifecycle,
  activateOnboardedEmployee,
} from "@/lib/db/db-adapter";
import {
  authenticateRequest,
  authFailureResponse,
  requirePermission,
} from "@/lib/api-auth";
import { EmploymentStatus } from "@/lib/types";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) {
    return authFailureResponse(auth);
  }

  const { id } = await params;
  const record = await getOnboardingRecordById(id);

  if (!record) {
    return NextResponse.json({ success: false, error: "Record not found" }, { status: 404 });
  }

  // Employee self-service check
  if (auth.role === "employee" && record.employeeId !== auth.employeeId && record.email !== auth.actor.email) {
    return NextResponse.json({ success: false, error: "Forbidden: Not your record" }, { status: 403 });
  }

  return NextResponse.json({ success: true, data: record });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) {
    return authFailureResponse(auth);
  }

  const permError = requirePermission(auth, "onboarding:manage");
  if (permError) return permError;

  const { id } = await params;

  try {
    const body = await req.json();
    const { action } = body;

    if (action === "update_checklist") {
      const { itemKey, completed, verified, notes } = body;
      if (!itemKey) {
        return NextResponse.json({ success: false, error: "itemKey is required" }, { status: 400 });
      }

      const updated = await updateOnboardingChecklist(
        id,
        itemKey,
        { completed, verified, notes },
        { name: auth.actor.name, role: auth.role }
      );
      return NextResponse.json({ success: true, data: updated });
    }

    if (action === "advance_lifecycle") {
      const { newStatus } = body as { newStatus: EmploymentStatus };
      if (!newStatus) {
        return NextResponse.json({ success: false, error: "newStatus is required" }, { status: 400 });
      }

      const updated = await advanceEmployeeLifecycle(id, newStatus, {
        name: auth.actor.name,
        role: auth.role,
      });
      return NextResponse.json({ success: true, data: updated });
    }

    if (action === "activate_employee") {
      const result = await activateOnboardedEmployee(id, {
        name: auth.actor.name,
        role: auth.role,
      });
      return NextResponse.json({ success: true, data: result });
    }

    return NextResponse.json({ success: false, error: "Unknown action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
