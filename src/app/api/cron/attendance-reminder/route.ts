import { NextRequest, NextResponse } from "next/server";
import {
  getPersistedUserAccounts,
  getAttendanceRecords,
  getCustomRoles,
  getHolidays,
  getLeaveRequests,
  getPolicy,
} from "@/lib/db/db-adapter";
import { sendAttendanceReminderEmail, type AttendanceRuleReminder } from "@/lib/email";
import { getISTDateString } from "@/lib/attendance/ist-time";
import { lateAfterOf, resolveTimingProfile } from "@/lib/attendance/late-policy";

export const maxDuration = 60;

/**
 * Vercel Cron (see vercel.json): 04:15 UTC = 09:45 IST, Mon–Sat.
 * Emails only people whose role is on Timing 1 (roles are assigned a timing in Settings) who haven't
 * marked attendance today. The email carries the Timing 1 half-day rule.
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

    const [accounts, roles, holidays, records, leaves, policy] = await Promise.all([
      getPersistedUserAccounts(),
      getCustomRoles(),
      getHolidays(),
      getAttendanceRecords({ date: today }),
      getLeaveRequests(),
      getPolicy(),
    ]);

    // People on approved leave today are not reminded
    const onLeave = new Set(
      leaves
        .filter((l) => l.status === "Approved" && l.startDate <= today && l.endDate >= today)
        .map((l) => l.employeeId.toLowerCase())
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
        resolveTimingProfile(u.role, roles, policy).id === "timing1" &&
        !marked.has(u.employeeId.toLowerCase()) &&
        !onLeave.has(u.employeeId.toLowerCase()) &&
        !allHoliday &&
        !holidayBranches.has(u.branch)
    );

    let sent = 0;
    let failed = 0;
    for (const u of targets) {
      try {
        const profile = resolveTimingProfile(u.role, roles, policy);
        const rule: AttendanceRuleReminder | undefined = profile.halfDayRules
          ? {
              lateAfter: lateAfterOf(profile),
              weeklyLateAllowance: profile.halfDayRules.weeklyLateAllowance,
              hardCutoffTime: profile.halfDayRules.hardCutoffTime,
            }
          : undefined;
        const ok = await sendAttendanceReminderEmail(u.email, u.name, today, rule);
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
