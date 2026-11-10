import { NextRequest, NextResponse } from "next/server";
import {
  getPersistedUserAccounts,
  getAttendanceRecords,
  getCustomRoles,
  getEmployees,
  getHolidays,
  getLeaveRequests,
  getPolicy,
} from "@/lib/db/db-adapter";
import { sendAttendanceReminderEmail, type AttendanceRuleReminder } from "@/lib/email";
import { getISTDateString } from "@/lib/attendance/ist-time";
import { parseReminderScope, selectReminderTargets } from "@/lib/attendance/reminder-targets";

export const maxDuration = 60;

/**
 * Vercel Cron (see vercel.json), Mon–Sat, two runs:
 * - `?scope=delhi` at 04:30 UTC = 10:00 IST: staff on a branch-wide timing (Delhi), five minutes before the 10:05 late line.
 * - `?scope=other` (also the default) at 04:15 UTC = 09:45 IST: roles on Timing 1 outside those branches.
 * Only people who haven't marked attendance today are mailed. The email carries their own half-day rule.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const scope = parseReminderScope(new URL(req.url).searchParams.get("scope"));
    const today = getISTDateString();
    // Day-of-week of the IST date (guard against Sunday even if the schedule is changed)
    if (new Date(`${today}T00:00:00Z`).getUTCDay() === 0) {
      return NextResponse.json({ success: true, skipped: "Sunday" });
    }

    const [accounts, employees, roles, holidays, records, leaves, policy] = await Promise.all([
      getPersistedUserAccounts(),
      getEmployees(),
      getCustomRoles(),
      getHolidays(),
      getAttendanceRecords({ date: today }),
      getLeaveRequests(),
      getPolicy(),
    ]);

    const targets = selectReminderTargets({
      scope,
      today,
      accounts,
      roles,
      policy,
      holidays,
      leaves,
      markedEmployeeIds: new Set(records.filter((r) => r.status !== "Absent").map((r) => r.employeeId.toLowerCase())),
      branchByEmployeeId: new Map(
        employees.filter((e) => e.employment?.branch).map((e) => [e.employeeId.toLowerCase(), e.employment.branch as string])
      ),
    });

    let sent = 0;
    let failed = 0;
    for (const { account: u, profile, lateAfter } of targets) {
      try {
        const rule: AttendanceRuleReminder | undefined = profile.halfDayRules
          ? {
              startTime: scope === "delhi" ? profile.startTime : undefined,
              lateAfter,
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

    return NextResponse.json({ success: true, scope, date: today, targeted: targets.length, sent, failed });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
