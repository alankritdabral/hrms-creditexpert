import { NextRequest, NextResponse } from "next/server";
import {
  getPayrollRuns,
  savePayrollRun,
  getEmployees,
  getAttendanceRecords,
  getEmployeeIncentives,
} from "@/lib/db/db-adapter";
import { calculateEmployeePayrollSnapshot } from "@/lib/payroll-engine";
import { PayrollRun, PayrollStatus } from "@/lib/types";
import { authenticateRequest, authFailureResponse, requirePermission } from "@/lib/api-auth";

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) {
    return authFailureResponse(auth);
  }

  // If not an employee, enforce payroll:view permission (Admin & HR)
  if (auth.role !== "employee") {
    const permError = requirePermission(auth, "payroll:view");
    if (permError) return permError;
  }

  try {
    let runs = await getPayrollRuns();

    // If requesting user is an employee, restrict items strictly to their own payslips
    if (auth.role === "employee") {
      runs = runs
        .map((r) => {
          const myItems = r.items.filter((i) => i.employeeId === auth.employeeId);
          return {
            ...r,
            totalEmployees: myItems.length,
            totalGross: myItems.reduce((acc, curr) => acc + curr.grossEarnings, 0),
            totalDeductions: myItems.reduce((acc, curr) => acc + curr.totalDeductions, 0),
            totalNet: myItems.reduce((acc, curr) => acc + curr.netSalary, 0),
            totalPfEmployer: myItems.reduce((acc, curr) => acc + curr.employerPf, 0),
            items: myItems,
          };
        })
        .filter((r) => r.items.length > 0);
    }

    return NextResponse.json({ success: true, data: runs });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// POST: Run Server-side Payroll Calculation Engine
export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) {
    return authFailureResponse(auth);
  }

  const permError = requirePermission(auth, "payroll:manage");
  if (permError) return permError;

  try {
    const body = await req.json();
    const { month, periodLabel } = body; // e.g. "2026-10", "October 2026"

    if (!month) {
      return NextResponse.json({ success: false, error: "Month (YYYY-MM) is required" }, { status: 400 });
    }

    const employees = await getEmployees();
    const activeEmployees = employees.filter((e) =>
      ["Active", "Probation", "Confirmed", "On Notice"].includes(e.employment.employmentStatus)
    );

    const attendanceRecords = await getAttendanceRecords();
    const approvedIncentives = (await getEmployeeIncentives(month)).filter(
      (i) => i.status === "Approved"
    );

    const runCode = `PAY-${month}`;
    const items = activeEmployees.map((emp) => {
      const empAttendance = attendanceRecords.filter((a) => a.employeeId === emp.employeeId);
      const empIncentives = approvedIncentives.filter((i) => i.employeeId === emp.employeeId);
      return calculateEmployeePayrollSnapshot({
        employee: emp,
        attendanceRecords: empAttendance,
        approvedIncentives: empIncentives,
      });
    });

    const totalGross = items.reduce((acc, curr) => acc + curr.grossEarnings, 0);
    const totalDeductions = items.reduce((acc, curr) => acc + curr.totalDeductions, 0);
    const totalNet = items.reduce((acc, curr) => acc + curr.netSalary, 0);
    const totalPfEmployer = items.reduce((acc, curr) => acc + curr.employerPf, 0);

    const payrollRun: PayrollRun = {
      id: `pay-run-${Date.now()}`,
      runCode,
      month,
      periodLabel: periodLabel || month,
      status: "CALCULATED",
      totalEmployees: items.length,
      totalGross,
      totalDeductions,
      totalNet,
      totalPfEmployer,
      items,
      createdAt: new Date().toISOString(),
    };

    // Use verified server session actor, not untrusted request body
    const saved = await savePayrollRun(payrollRun, {
      name: auth.actor.name,
      role: auth.actor.role,
    });
    return NextResponse.json({ success: true, data: saved }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// PUT: Advance Payroll Lifecycle Status
export async function PUT(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) {
    return authFailureResponse(auth);
  }

  const permError = requirePermission(auth, "payroll:manage");
  if (permError) return permError;

  try {
    const body = await req.json();
    const { runId, status } = body;

    if (!runId || !status) {
      return NextResponse.json({ success: false, error: "runId and target status are required" }, { status: 400 });
    }

    if (status === "FINALIZED") {
      const finError = requirePermission(auth, "payroll:finalize");
      if (finError) return finError;
    }

    const runs = await getPayrollRuns();
    const run = runs.find((r) => r.id === runId || r.runCode === runId);

    if (!run) {
      return NextResponse.json({ success: false, error: "Payroll run not found" }, { status: 404 });
    }

    // Once finalized, only Admin or HR can modify or advance
    if (run.status === "FINALIZED" && status !== "PAID" && !["admin", "hr"].includes(auth.role)) {
      return NextResponse.json(
        { success: false, error: "Finalized payroll cannot be modified without Admin/HR authorization." },
        { status: 403 }
      );
    }

    run.status = status as PayrollStatus;
    if (status === "FINALIZED") {
      run.finalizedAt = new Date().toISOString();
      run.approvedBy = `${auth.actor.name} (${auth.actor.role.toUpperCase()})`;
    }
    if (status === "PAID") {
      run.paidAt = new Date().toISOString();
    }

    const saved = await savePayrollRun(run, {
      name: auth.actor.name,
      role: auth.actor.role,
    });
    return NextResponse.json({ success: true, data: saved });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
