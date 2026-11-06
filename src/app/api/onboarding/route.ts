import { NextRequest, NextResponse } from "next/server";
import {
  getOnboardingRecords,
  createOnboardingRecord,
} from "@/lib/db/db-adapter";
import {
  authenticateRequest,
  authFailureResponse,
  requirePermission,
} from "@/lib/api-auth";
import { hasPermission } from "@/lib/permissions";
import { Branch } from "@/lib/types";

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) {
    return authFailureResponse(auth);
  }

  // Callers without onboarding:view_all (employees, custom roles) only see their own record
  if (!hasPermission(auth, "onboarding:view_all")) {
    const all = await getOnboardingRecords();
    const self = all.filter((r) => r.employeeId === auth.employeeId || r.email === auth.actor.email);
    return NextResponse.json({ success: true, data: self });
  }

  try {
    const { searchParams } = new URL(req.url);
    const branchFilter = searchParams.get("branch") as Branch | null;
    const statusFilter = searchParams.get("status");

    let records = await getOnboardingRecords(branchFilter || undefined);

    if (statusFilter && statusFilter !== "All") {
      records = records.filter((r) => r.status.toLowerCase() === statusFilter.toLowerCase());
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

  const permError = requirePermission(auth, "onboarding:manage");
  if (permError) return permError;

  try {
    const body = await req.json();
    const {
      candidateName,
      email,
      phone,
      branch,
      department,
      designation,
      joiningDate,
      annualCtc,
      assignedHrName,
      notes,
    } = body;

    if (!candidateName || !email || !branch || !designation || !joiningDate) {
      return NextResponse.json(
        { success: false, error: "Candidate name, email, branch, designation, and joining date are required." },
        { status: 400 }
      );
    }

    const newRecord = await createOnboardingRecord(
      {
        candidateName,
        email,
        phone: phone || "",
        branch,
        department: department || "General Operations",
        designation,
        joiningDate,
        annualCtc: annualCtc !== undefined && annualCtc !== "" && annualCtc !== null ? Number(annualCtc) : undefined,
        assignedHrName: assignedHrName || auth.actor.name,
        notes: notes || "",
      },
      { name: auth.actor.name, role: auth.role }
    );

    return NextResponse.json({ success: true, data: newRecord }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
