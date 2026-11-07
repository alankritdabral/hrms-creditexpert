import { NextRequest, NextResponse } from "next/server";
import { getLoginSheetEntries, getPersistedUserAccounts } from "@/lib/db/db-adapter";
import { sendReportEmail } from "@/lib/email";
import { getISTDateString } from "@/lib/attendance/ist-time";
import { buildDailyLoginReport, renderDailyLoginReport } from "@/lib/daily-login-report";

export const maxDuration = 60;

/**
 * Vercel Cron (see vercel.json): 14:30 UTC = 20:00 IST, every day.
 * Emails each active employee who has Login Sheet rows this month their progress: files and amount per bank
 * with statuses, last login date, today's CIBIL count and today's logins. Add ?dryRun=1 to list who would get
 * one without sending anything.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const dryRun = new URL(req.url).searchParams.get("dryRun") === "1";
    const today = getISTDateString();
    const [rows, accounts] = await Promise.all([getLoginSheetEntries(`${today.slice(0, 7)}-01`, today), getPersistedUserAccounts()]);

    const rowsByEmployee = new Map<string, typeof rows>();
    for (const r of rows) {
      const key = r.employeeId.toLowerCase();
      rowsByEmployee.set(key, [...(rowsByEmployee.get(key) ?? []), r]);
    }

    const recipients = accounts.filter((u) => u.status === "Active" && u.email && rowsByEmployee.has(u.employeeId.toLowerCase()));
    const withoutEmail = [...rowsByEmployee.keys()].filter(
      (id) => !accounts.some((u) => u.status === "Active" && u.email && u.employeeId.toLowerCase() === id)
    ).length;

    if (dryRun) {
      return NextResponse.json({ success: true, dryRun: true, date: today, recipients: recipients.length, withoutEmail });
    }

    const base = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "");
    let sent = 0;
    let failed = 0;
    for (const u of recipients) {
      try {
        const report = buildDailyLoginReport(u.name, rowsByEmployee.get(u.employeeId.toLowerCase()) ?? [], today);
        const mail = renderDailyLoginReport(report, { portalUrl: base ? `${base}/login-sheet` : undefined });
        (await sendReportEmail(u.email, mail)) ? sent++ : failed++;
      } catch {
        failed++;
      }
    }
    return NextResponse.json({ success: true, date: today, recipients: recipients.length, sent, failed, withoutEmail });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
