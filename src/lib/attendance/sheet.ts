import { AttendanceRecord, AttendanceStatus } from "@/lib/types";

export interface SheetEmployee {
  employeeId: string;
  name: string;
  branch: string;
  department: string;
  dateOfJoining?: string;
}
export interface SheetLeave { employeeId: string; startDate: string; endDate: string; leaveType?: string }
export interface SheetHoliday { date: string; name: string; branch: string }
export interface SheetData {
  month: string;
  viewAll: boolean;
  canEdit: boolean;
  roster: SheetEmployee[];
  records: AttendanceRecord[];
  leaves: SheetLeave[];
  holidays: SheetHoliday[];
}

export type CellKind = "present" | "late" | "wfh" | "half" | "early" | "absent" | "leave" | "holiday" | "off" | "none";
export interface Cell {
  code: string;
  kind: CellKind;
  title: string;
  record?: AttendanceRecord;
  derived?: boolean; // computed (no record exists)
}

export const KIND_STYLE: Record<CellKind, string> = {
  present: "bg-emerald-100 text-emerald-800",
  late: "bg-orange-100 text-orange-800",
  wfh: "bg-teal-100 text-teal-800",
  half: "bg-amber-100 text-amber-800",
  early: "bg-yellow-100 text-yellow-800",
  absent: "bg-red-100 text-red-700",
  leave: "bg-violet-100 text-violet-800",
  holiday: "bg-sky-100 text-sky-800",
  off: "bg-slate-100 text-slate-400",
  none: "bg-white text-slate-300",
};

const STATUS_MAP: Record<AttendanceStatus, { code: string; kind: CellKind }> = {
  Present: { code: "P", kind: "present" },
  Late: { code: "LT", kind: "late" },
  "Work From Home": { code: "WFH", kind: "wfh" },
  "Half Day": { code: "HD", kind: "half" },
  "Early Leave": { code: "EL", kind: "early" },
  Absent: { code: "A", kind: "absent" },
  Leave: { code: "L", kind: "leave" },
  Holiday: { code: "H", kind: "holiday" },
  Weekend: { code: "WO", kind: "off" },
};

export const LEGEND: { code: string; label: string; kind: CellKind }[] = [
  { code: "P", label: "Present", kind: "present" },
  { code: "LT", label: "Late", kind: "late" },
  { code: "WFH", label: "Work from home", kind: "wfh" },
  { code: "HD", label: "Half day", kind: "half" },
  { code: "EL", label: "Early leave", kind: "early" },
  { code: "A", label: "Absent", kind: "absent" },
  { code: "L", label: "Leave", kind: "leave" },
  { code: "H", label: "Holiday", kind: "holiday" },
  { code: "WO", label: "Weekly off", kind: "off" },
];

export function daysOfMonth(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const n = new Date(y, m, 0).getDate();
  return Array.from({ length: n }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}

const isSunday = (date: string) => new Date(`${date}T00:00:00`).getDay() === 0;

export function buildCell(emp: SheetEmployee, date: string, today: string, data: SheetData, rec?: AttendanceRecord): Cell {
  if (rec) {
    const m = STATUS_MAP[rec.status] || { code: rec.status.slice(0, 2).toUpperCase(), kind: "none" as CellKind };
    const time = rec.checkIn ? ` · in ${rec.checkIn.slice(0, 5)}` : "";
    return { ...m, title: `${rec.status}${time}${rec.remarks ? ` — ${rec.remarks}` : ""}`, record: rec };
  }
  if (date > today) return { code: "", kind: "none", title: "", derived: true };
  if (emp.dateOfJoining && date < emp.dateOfJoining) return { code: "–", kind: "none", title: "Before joining", derived: true };
  const hol = data.holidays.find((h) => h.date === date && (h.branch === "All" || h.branch === emp.branch));
  if (hol) return { code: "H", kind: "holiday", title: hol.name, derived: true };
  if (isSunday(date)) return { code: "WO", kind: "off", title: "Weekly off", derived: true };
  const lv = data.leaves.find((l) => l.employeeId === emp.employeeId && date >= l.startDate && date <= l.endDate);
  if (lv) return { code: "L", kind: "leave", title: lv.leaveType || "Approved leave", derived: true };
  return { code: "A", kind: "absent", title: "No attendance recorded", derived: true };
}

export interface Totals { present: number; late: number; half: number; absent: number; leave: number; wfh: number; workingDays: number; pct: number }

export function totalsOf(cells: Cell[]): Totals {
  const t: Totals = { present: 0, late: 0, half: 0, absent: 0, leave: 0, wfh: 0, workingDays: 0, pct: 0 };
  for (const c of cells) {
    switch (c.kind) {
      case "present": t.present++; break;
      case "late": t.present++; t.late++; break;
      case "wfh": t.present++; t.wfh++; break;
      case "early": t.present++; break;
      case "half": t.half++; break;
      case "absent": t.absent++; break;
      case "leave": t.leave++; break;
    }
    if (["present", "late", "wfh", "early", "half", "absent", "leave"].includes(c.kind)) t.workingDays++;
  }
  t.pct = t.workingDays ? Math.round(((t.present + t.half * 0.5) / t.workingDays) * 100) : 0;
  return t;
}

export function toCsv(rows: (string | number)[][]): string {
  const esc = (v: string | number) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n");
}
