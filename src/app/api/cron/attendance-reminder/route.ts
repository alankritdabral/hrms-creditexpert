import { NextRequest, NextResponse } from "next/server";
import {
  getPersistedUserAccounts,
  getAttendanceRecords,
  getCustomRoles,
  getHolidays,
  getLeaveRequests,
} from "@/lib/db/db-adapter";
import { sendAttendanceReminderEmail } from "@/lib/email";
import { getISTDateString } from "@/lib/attendance/ist-time";

export const maxDuration = 60;

/**
 * Vercel Cron (see vercel.json): 04:15 UTC = 09:45 IST, Mon–Sat.
 * Emails active users with the "Employee" or "Backend Team" role who haven't marked attendance today.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const today = getISTDateString();
    // Day-of-week of the IST date (guard against Sunday even if the schedule is changed)
    if (new Date(`${today}T00:00:00Z`).getUTCDay() === 0) {
      return NextResponse.json({ success: true, skipped: "Sunday" });
    }

    const [accounts, roles, holidays, records, leaves] = await Promise.all([
      getPersistedUserAccounts(),
      getCustomRoles(),
      getHolidays(),
      getAttendanceRecords({ date: today }),
      getLeaveRequests(),
    ]);

    // People on approved leave today are not reminded
    const onLeave = new Set(
      leaves
        .filter((l) => l.status === "Approved" && l.startDate <= today && l.endDate >= today)
        .map((l) => l.employeeId.toLowerCase())
    );

    const backendRoleIds = new Set(
      roles.filter((r) => (r.name || "").trim().toLowerCase() === "backend team").map((r) => r.id)
    );
    const holidayBranches = new Set(
      holidays.filter((h) => h.date === today).map((h) => h.branch)
    );
    const allHoliday = holidayBranches.has("All");

    const marked = new Set(
      records.filter((r) => r.status !== "Absent").map((r) => r.employeeId.toLowerCase())
    );

    const targets = accounts.filter(
      (u) =>
        u.status === "Active" &&
        u.email &&
        (u.role === "employee" || backendRoleIds.has(u.role)) &&
        !marked.has(u.employeeId.toLowerCase()) &&
        !onLeave.has(u.employeeId.toLowerCase()) &&
        !allHoliday &&
        !holidayBranches.has(u.branch)
    );

    let sent = 0;
    let failed = 0;
    for (const u of targets) {
      try {
        const ok = await sendAttendanceReminderEmail(u.email, u.name, today);
        ok ? sent++ : failed++;
      } catch {
        failed++;
      }
    }

    return NextResponse.json({ success: true, date: today, targeted: targets.length, sent, failed });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
