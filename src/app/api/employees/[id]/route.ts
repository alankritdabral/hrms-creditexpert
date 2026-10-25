import { NextRequest, NextResponse } from "next/server";
import { getEmployeeById, reviseSalary, updateEmployeeAvatar } from "@/lib/db/db-adapter";
import {
  authenticateRequest,
  authFailureResponse,
  requirePermission,
  requireEmployeeScope,
  requireBranchScope,
} from "@/lib/api-auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) {
    return authFailureResponse(auth);
  }

  try {
    const { id } = await params;

    // Branch & Employee isolation: An employee can ONLY access their own profile!
    const scopeErr = requireEmployeeScope(auth, id);
    if (scopeErr) return scopeErr;

    const employee = await getEmployeeById(id);
    if (!employee) {
      return NextResponse.json({ success: false, error: "Employee not found" }, { status: 404 });
    }

    // Branch isolation verification
    const branchErr = requireBranchScope(auth, employee.employment.branch);
    if (branchErr) return branchErr;

    return NextResponse.json({ success: true, data: employee });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) {
    return authFailureResponse(auth);
  }

  // Salary revision strictly requires salary:manage permission (Admin & HR only)
  const permError = requirePermission(auth, "salary:manage");
  if (permError) return permError;

  try {
    const { id } = await params;
    const body = await req.json();
    const {
      newAnnualCtc,
      monthlySalary,
      salaryBasis,
      includePf = true,
      pfType = "percentage",
      pfValue = 12,
      revisionReason,
      isIncentiveOnly: requestedIncentiveOnly,
    } = body;

    const isIncentiveOnly = salaryBasis === "incentive_only" || Boolean(requestedIncentiveOnly);

    if (!revisionReason || (!isIncentiveOnly && newAnnualCtc === undefined && monthlySalary === undefined)) {
      return NextResponse.json(
        { success: false, error: "Monthly salary (or annual CTC) and revisionReason are required" },
        { status: 400 }
      );
    }

    const employee = await getEmployeeById(id);
    if (!employee) {
      return NextResponse.json({ success: false, error: "Employee not found" }, { status: 404 });
    }

    // Branch check: ensure actor has scope over this employee's branch
    const branchErr = requireBranchScope(auth, employee.employment.branch);
    if (branchErr) return branchErr;

    const updated = await reviseSalary(
      id,
      {
        newAnnualCtc: isIncentiveOnly ? 0 : newAnnualCtc ? Number(newAnnualCtc) : undefined,
        monthlySalary: isIncentiveOnly ? 0 : monthlySalary !== undefined ? Number(monthlySalary) : undefined,
        salaryBasis: isIncentiveOnly ? "incentive_only" : salaryBasis || "monthly_net",
        includePf: isIncentiveOnly ? false : Boolean(includePf),
        pfType: pfType === "fixed" ? "fixed" : "percentage",
        pfValue: isIncentiveOnly ? 0 : typeof pfValue === "number" ? pfValue : Number(pfValue) || 12,
        isIncentiveOnly,
        revisionReason,
      },
      revisionReason,
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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) {
    return authFailureResponse(auth);
  }

  try {
    const { id } = await params;

    // Scope isolation: Employees can update their own profile; Admin & HR can manage all
    const scopeErr = requireEmployeeScope(auth, id);
    if (scopeErr) return scopeErr;

    const employee = await getEmployeeById(id);
    if (!employee) {
      return NextResponse.json({ success: false, error: "Employee not found" }, { status: 404 });
    }

    const branchErr = requireBranchScope(auth, employee.employment.branch);
    if (branchErr) return branchErr;

    const body = await req.json();
    const { avatarUrl, passportPhotoUrl, customAvatarUrl, avatarPreference } = body;

    const updated = await updateEmployeeAvatar(
      id,
      {
        avatarUrl,
        passportPhotoUrl,
        customAvatarUrl,
        avatarPreference,
      },
      {
        name: auth.actor.name,
        role: auth.actor.role,
      }
    );

    if (!updated) {
      return NextResponse.json(
        { success: false, error: "Failed to update profile photograph" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
