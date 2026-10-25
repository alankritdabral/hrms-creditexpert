import { NextRequest, NextResponse } from "next/server";
import { getEmployees, createEmployee } from "@/lib/db/db-adapter";
import { calculateSalaryBreakdown, calculateSalaryFromMonthly } from "@/lib/payroll-engine";
import {
  authenticateRequest,
  authFailureResponse,
  requirePermission,
  requireBranchScope,
} from "@/lib/api-auth";
import { Branch } from "@/lib/types";

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.authenticated) {
      return authFailureResponse(auth);
    }

    const { searchParams } = new URL(req.url);
    const branchFilter = searchParams.get("branch") as Branch | null;

    let employees = await getEmployees();

    // If requesting user is an employee, scope response and redact colleagues' sensitive compensation & statutory details
    if (auth.role === "employee") {
      employees = employees
        .filter((e) => e.employeeId === auth.employeeId || e.employment.branch === auth.branch)
        .map((e) => {
          if (e.employeeId === auth.employeeId) {
            return e; // Employee can see their own compensation
          }
          // Redact sensitive compensation and statutory details of peers
          return {
            ...e,
            currentSalary: undefined as any,
            salaryHistory: [],
            statutory: {
              pan: "••••••••••",
              aadhaar: "••••••••••••",
              uan: "••••••••••••",
              pfAccountNumber: "••••••••••••",
              bankAccountNumber: "••••••••••••",
              ifscCode: "•••••••••••",
              bankName: e.statutory?.bankName || "Confidential",
            },
          };
        });
    } else if (branchFilter) {
      employees = employees.filter((e) => e.employment.branch === branchFilter);
    }

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
          annualCtc || 480000,
          Boolean(includePf),
          pfType === "fixed" ? "fixed" : "percentage",
          typeof pfValue === "number" ? pfValue : Number(pfValue) || 12
        );
    const ctc = salary.annualCtc;
    const count = (await getEmployees()).length;
    const empId = `EMP-${String(count + 1).padStart(4, "0")}`;

    const newEmp = await createEmployee(
      {
        employeeId: empId,
        personal: {
          ...personal,
          employeeId: empId,
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
            effectiveFrom: employment.dateOfJoining || new Date().toISOString().split("T")[0],
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
