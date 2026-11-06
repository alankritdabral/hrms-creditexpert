import { NextRequest, NextResponse } from "next/server";
import { getEmployees, createEmployee } from "@/lib/db/db-adapter";
import { calculateSalaryBreakdown, calculateSalaryFromMonthly } from "@/lib/payroll-engine";
import {
  authenticateRequest,
  authFailureResponse,
  requirePermission,
  requireBranchScope,
  callerOf,
} from "@/lib/api-auth";
import { hasPermission } from "@/lib/permissions";
import { redactEmployee } from "@/lib/access";
import { paginateList } from "@/lib/pagination";
import { Branch } from "@/lib/types";
import { getISTDateString } from "@/lib/attendance/ist-time";

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.authenticated) {
      return authFailureResponse(auth);
    }

    const { searchParams } = new URL(req.url);
    const branchFilter = searchParams.get("branch") as Branch | null;

    let employees = await getEmployees();

    // Callers who may view everyone (admin/HR) get the full directory, optionally filtered by branch.
    // Everyone else (employees and custom roles) gets their own record plus same-branch colleagues.
    if (hasPermission(auth, "employees:view_all")) {
      if (branchFilter) employees = employees.filter((e) => e.employment.branch === branchFilter);
    } else {
      employees = employees.filter(
        (e) => e.employeeId === auth.employeeId || e.employment.branch === auth.branch
      );
    }
    // Statutory/bank details and salary of other people are masked or removed by permission.
    const caller = callerOf(auth);
    employees = employees.map((e) => redactEmployee(e, caller));

    const allDepartments = Array.from(new Set(employees.map((e) => e.employment.department))).sort();
    const department = searchParams.get("department");
    const status = searchParams.get("status");
    if (department && department !== "All") employees = employees.filter((e) => e.employment.department === department);
    if (status && status !== "All") employees = employees.filter((e) => e.employment.employmentStatus === status);

    const paged = paginateList(employees, searchParams, (e, q) =>
      [e.personal.fullName, e.employeeId, e.employment.designation, e.employment.department, e.employment.branch].some(
        (v) => v?.toLowerCase().includes(q)
      )
    );
    if (paged) return NextResponse.json({ success: true, ...paged, departments: allDepartments });
    return NextResponse.json({ success: true, data: employees });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.authenticated) {
      return authFailureResponse(auth);
    }

    // Creating an employee requires employees:manage permission (Admin & HR)
    const permError = requirePermission(auth, "employees:manage");
    if (permError) return permError;


    const body = await req.json();
    const {
      personal,
      employment,
      statutory,
      annualCtc,
      monthlySalary,
      includePf = true,
      pfType = "percentage",
      pfValue = 12,
    } = body;

    if (!personal?.firstName || !employment?.department || !employment?.designation) {
      return NextResponse.json(
        { success: false, error: "Missing required employee fields" },
        { status: 400 }
      );
    }

    const targetBranch = (employment.branch || "Delhi") as Branch;
    const branchErr = requireBranchScope(auth, targetBranch);
    if (branchErr) return branchErr;

    const isIncentiveOnly = Boolean(body.isIncentiveOnly || body.salaryBasis === "incentive_only");
    if (!isIncentiveOnly && !monthlySalary && !annualCtc) {
      return NextResponse.json(
        { success: false, error: "Monthly salary or annual CTC is required (or mark the employee incentive-only)" },
        { status: 400 }
      );
    }

    const salary = isIncentiveOnly
      ? calculateSalaryFromMonthly({
          monthlyAmount: 0,
          salaryBasis: "incentive_only",
          includePf: false,
        })
      : monthlySalary
      ? calculateSalaryFromMonthly({
          monthlyAmount: Number(monthlySalary),
          includePf: Boolean(includePf),
          pfType: pfType === "fixed" ? "fixed" : "percentage",
          pfValue: typeof pfValue === "number" ? pfValue : Number(pfValue) || 12,
        })
      : calculateSalaryBreakdown(
          Number(annualCtc),
          Boolean(includePf),
          pfType === "fixed" ? "fixed" : "percentage",
          typeof pfValue === "number" ? pfValue : Number(pfValue) || 12
        );
    const ctc = salary.annualCtc;
    const newEmp = await createEmployee(
      {
        personal: {
          ...personal,
          fullName: `${personal.firstName} ${personal.lastName || ""}`.trim(),
        },
        employment: {
          ...employment,
          branch: targetBranch,
        },
        statutory: {
          ...statutory,
        },
        currentSalary: salary,
        salaryHistory: [
          {
            id: `rev-${Date.now()}`,
            effectiveFrom: employment.dateOfJoining || getISTDateString(),
            annualCtc: ctc,
            monthlySalary: salary.grossSalary,
            netSalary: salary.netSalary,
            includePf: Boolean(salary.includePf),
            pfType: salary.pfType,
            pfValue: salary.pfValue,
            salaryBasis: isIncentiveOnly ? "incentive_only" : monthlySalary ? "monthly_net" : "monthly_ctc",
            isIncentiveOnly,
            components: salary,
            revisionReason: isIncentiveOnly ? "Incentive-Only (Commission Based) Contract" : "Initial Appointment",
            updatedBy: `${auth.actor.name} (${auth.actor.role.toUpperCase()})`,
            createdAt: new Date().toISOString(),
          },
        ],
      },
      {
        name: auth.actor.name,
        role: auth.actor.role,
      }
    );

    return NextResponse.json({ success: true, data: newEmp }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
