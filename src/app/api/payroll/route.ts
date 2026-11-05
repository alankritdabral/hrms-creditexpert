import { NextRequest, NextResponse } from "next/server";
import {
  getPayrollRuns,
  savePayrollRun,
  getEmployees,
  getAttendanceRecords,
  getEmployeeIncentives,
} from "@/lib/db/db-adapter";
import { calculateEmployeePayrollSnapshot, nextPayrollStatus, LOCKED_PAYROLL_STATUSES } from "@/lib/payroll-engine";
import { PayrollRun, PayrollStatus } from "@/lib/types";
import { authenticateRequest, authFailureResponse, requirePermission } from "@/lib/api-auth";
import { hasPermission } from "@/lib/permissions";

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) {
    return authFailureResponse(auth);
  }

  try {
    let runs = await getPayrollRuns();

    // Callers without payroll:view (employees and custom roles) only ever get their own payslip lines
    if (!hasPermission(auth.role, "payroll:view")) {
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

    const runCode = `PAY-${month}`;

    // A finalized run is a locked snapshot: recalculating would silently rewrite issued payslips.
    const existingRun = (await getPayrollRuns()).find((r) => r.runCode === runCode);
    if (existingRun && LOCKED_PAYROLL_STATUSES.includes(existingRun.status)) {
      return NextResponse.json(
        {
          success: false,
          error: `Payroll for ${month} is already ${existingRun.status} and cannot be recalculated.`,
        },
        { status: 409 }
      );
    }

    const employees = await getEmployees();
    // One payslip per person, even if the directory ever holds a duplicate record
    const activeEmployees = Array.from(
      new Map(
        employees
          .filter((e) => ["Active", "Probation", "Confirmed", "On Notice"].includes(e.employment.employmentStatus))
          .map((e) => [e.employeeId, e])
      ).values()
    );

    // Only the payroll month — previously this loaded (and counted) every month ever recorded.
    const attendanceRecords = await getAttendanceRecords({ from: `${month}-01`, to: `${month}-31` });
    const approvedIncentives = (await getEmployeeIncentives(month)).filter(
      (i) => i.status === "Approved"
    );

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
      id: runCode,
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

    // A run only ever moves to its next stage; no skipping ahead and no going back.
    if (status !== nextPayrollStatus(run.status)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid status change: ${run.status} can only advance to ${nextPayrollStatus(run.status) ?? "nothing (final stage)"}.`,
        },
        { status: 400 }
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
