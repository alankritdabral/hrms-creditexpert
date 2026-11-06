import { AttendanceImpact } from "@/lib/payroll-engine";

const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const days = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)} day${n === 1 ? "" : "s"}`;

/** How much a month's pay was reduced by absences and half days. Renders nothing when there was no impact. */
export function AttendanceImpactSummary({
  impact,
  tone = "light",
  title = "Pay affected by attendance",
}: {
  impact: AttendanceImpact;
  tone?: "light" | "dark";
  title?: string;
}) {
  if (impact.totalAmount <= 0 && impact.absentDays <= 0 && impact.halfDayCount <= 0) return null;
  const dark = tone === "dark";
  const box = dark ? "bg-slate-900 border-slate-800" : "bg-amber-50/60 border-amber-200";
  const head = dark ? "text-amber-400" : "text-amber-800";
  const label = dark ? "text-slate-400" : "text-slate-600";
  const amount = dark ? "text-rose-400" : "text-rose-600";
  const rule = dark ? "border-slate-800" : "border-amber-200";
  const strong = dark ? "text-white" : "text-slate-900";

  return (
    <div className={`p-4 rounded-xl border space-y-2 text-xs ${box}`}>
      <span className={`text-[10px] font-semibold uppercase tracking-wider block ${head}`}>{title}</span>
      <div className="flex justify-between">
        <span className={label}>Absent ({days(impact.absentDays)})</span>
        <span className={`font-mono font-medium ${amount}`}>-{rupees(impact.absentAmount)}</span>
      </div>
      <div className="flex justify-between">
        <span className={label}>
          Half day ({impact.halfDayCount} × 0.5 = {days(impact.halfDayCount * 0.5)})
        </span>
        <span className={`font-mono font-medium ${amount}`}>-{rupees(impact.halfDayAmount)}</span>
      </div>
      <div className={`flex justify-between pt-2 border-t font-bold ${rule}`}>
        <span className={strong}>Total reduced ({days(impact.totalDays)})</span>
        <span className={`font-mono ${amount}`}>-{rupees(impact.totalAmount)}</span>
      </div>
    </div>
  );
}
