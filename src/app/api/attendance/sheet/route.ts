import { NextRequest, NextResponse } from "next/server";
import {
  getEmployees,
  getAttendanceRecords,
  getLeaveRequests,
  getHolidays,
} from "@/lib/db/db-adapter";
import { authenticateRequest, authFailureResponse } from "@/lib/api-auth";
import { hasPermission } from "@/lib/permissions";

/**
 * One call for the attendance dashboard: roster + month records + approved leaves + holidays,
 * already authorised server-side.
 *  - Employees (or any role without attendance:view_all) only ever receive their own data.
 *  - Roles with attendance:view_all receive everyone in their branch scope.
 */
export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) return authFailureResponse(auth);

  try {
    const { searchParams } = new URL(req.url);
    const month = searchParams.get("month") || "";
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ success: false, error: "month must be YYYY-MM" }, { status: 400 });
    }

    const viewAll = auth.role !== "employee" && hasPermission(auth.role, "attendance:view_all");

    const [allEmployees, allRecords, allLeaves, allHolidays] = await Promise.all([
      getEmployees(),
      getAttendanceRecords({ from: `${month}-01`, to: `${month}-31` }),
      getLeaveRequests(),
      getHolidays(),
    ]);

    const roster = allEmployees
      .filter((e) =>
        viewAll
          ? auth.branchScope.includes(e.employment.branch)
          : e.employeeId === auth.employeeId
      )
      .filter((e) => !["Terminated", "Resigned"].includes(e.employment.employmentStatus as string))
      .map((e) => ({
        employeeId: e.employeeId,
        name: e.personal.fullName || `${e.personal.firstName} ${e.personal.lastName}`.trim(),
        branch: e.employment.branch,
        department: e.employment.department,
        dateOfJoining: e.employment.dateOfJoining,
      }));

    const ids = new Set(roster.map((r) => r.employeeId));
    // An account without an employee profile (e.g. bootstrap admin) still sees their own row.
    if (!viewAll && ids.size === 0) {
      roster.push({
        employeeId: auth.employeeId,
        name: auth.actor.name,
        branch: auth.branch,
        department: "",
        dateOfJoining: "",
      });
      ids.add(auth.employeeId);
    }

    const records = allRecords.filter((r) => r.date.startsWith(month) && ids.has(r.employeeId));
    const leaves = allLeaves
      .filter((l) => l.status === "Approved" && ids.has(l.employeeId))
      .map((l) => ({ employeeId: l.employeeId, startDate: l.startDate, endDate: l.endDate, leaveType: l.leaveType }));
    const holidays = allHolidays
      .filter((h) => h.date.startsWith(month))
      .map((h) => ({ date: h.date, name: h.name, branch: h.branch }));

    return NextResponse.json({
      success: true,
      data: {
        month,
        viewAll,
        canEdit: viewAll && hasPermission(auth.role, "attendance:manage"),
        roster,
        records,
        leaves,
        holidays,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load attendance sheet";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
