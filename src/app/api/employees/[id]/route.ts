import { NextRequest, NextResponse } from "next/server";
import { getEmployeeById, reviseSalary } from "@/lib/db/db-adapter";
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
      revisionReason,
    } = body;

    if ((!newAnnualCtc && !monthlySalary) || !revisionReason) {
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
        newAnnualCtc: newAnnualCtc ? Number(newAnnualCtc) : undefined,
        monthlySalary: monthlySalary ? Number(monthlySalary) : undefined,
        salaryBasis: salaryBasis || "monthly_gross",
        includePf: Boolean(includePf),
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
