"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Printer, Search, Pencil, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { getISTDateString } from "@/lib/attendance/ist-time";
import { AttendanceStatus } from "@/lib/types";
import {
  Cell,
  KIND_STYLE,
  LEGEND,
  SheetData,
  SheetEmployee,
  buildCell,
  daysOfMonth,
  toCsv,
  totalsOf,
} from "@/lib/attendance/sheet";

const STATUSES: AttendanceStatus[] = ["Present", "Late", "Work From Home", "Half Day", "Early Leave", "Absent", "Leave", "Holiday", "Weekend"];

const shiftMonth = (month: string, delta: number) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const monthLabel = (month: string) =>
  new Date(`${month}-01T00:00:00`).toLocaleString("en-IN", { month: "long", year: "numeric" });

interface EditTarget { emp: SheetEmployee; date: string; cell: Cell }

export function AttendanceDashboard() {
  const today = getISTDateString();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [data, setData] = useState<SheetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [branch, setBranch] = useState("All");
  const [search, setSearch] = useState("");
  const [groupByBranch, setGroupByBranch] = useState(true);

  const [edit, setEdit] = useState<EditTarget | null>(null);
  const [eStatus, setEStatus] = useState<AttendanceStatus>("Present");
  const [eIn, setEIn] = useState("");
  const [eRemarks, setERemarks] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/attendance/sheet?month=${month}`);
      const json = await res.json();
      if (json.success) setData(json.data);
      else setError(json.error || "Failed to load attendance");
    } catch {
      setError("Network error while loading attendance");
    } finally {
      setLoading(false);
    }
  }, [month]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const days = useMemo(() => daysOfMonth(month), [month]);

  const rows = useMemo(() => {
    if (!data) return [];
    const byKey = new Map(data.records.map((r) => [`${r.employeeId}|${r.date}`, r]));
    const q = search.trim().toLowerCase();
    return data.roster
      .filter((e) => branch === "All" || e.branch === branch)
      .filter((e) => !q || e.name.toLowerCase().includes(q) || e.employeeId.toLowerCase().includes(q))
      .sort((a, b) => (groupByBranch ? a.branch.localeCompare(b.branch) : 0) || a.name.localeCompare(b.name))
      .map((emp) => {
        const cells = days.map((d) => buildCell(emp, d, today, data, byKey.get(`${emp.employeeId}|${d}`)));
        return { emp, cells, totals: totalsOf(cells) };
      });
  }, [data, days, branch, search, groupByBranch, today]);

  const branches = useMemo(() => Array.from(new Set(data?.roster.map((r) => r.branch) || [])).sort(), [data]);

  const summary = useMemo(() => {
    const s = { present: 0, late: 0, absent: 0, leave: 0, pct: 0 };
    rows.forEach((r) => { s.present += r.totals.present; s.late += r.totals.late; s.absent += r.totals.absent; s.leave += r.totals.leave; });
    const wd = rows.reduce((a, r) => a + r.totals.workingDays, 0);
    const pr = rows.reduce((a, r) => a + r.totals.present + r.totals.half * 0.5, 0);
    s.pct = wd ? Math.round((pr / wd) * 100) : 0;
    return s;
  }, [rows]);

  const openEdit = (emp: SheetEmployee, date: string, cell: Cell) => {
    if (!data?.canEdit || date > today) return;
    setEdit({ emp, date, cell });
    setEStatus(cell.record?.status || (cell.kind === "absent" ? "Present" : "Present"));
    setEIn(cell.record?.checkIn?.slice(0, 5) || "");
    setERemarks(cell.record?.remarks || "");
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!edit) return;
    setSaving(true);
    try {
      const res = await fetch("/api/attendance", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: edit.emp.employeeId,
          date: edit.date,
          updates: { status: eStatus, checkIn: eIn ? `${eIn}:00` : "", remarks: eRemarks },
        }),
      });
      const json = await res.json();
      if (json.success) { setEdit(null); await load(); } else alert(json.error || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const exportCsv = () => {
    const header = ["Branch", "Employee ID", "Name", "Department", ...days.map((d) => String(Number(d.slice(8)))), "Present", "Late", "Half Day", "Absent", "Leave", "Attendance %"];
    const body = rows.map(({ emp, cells, totals }) => [
      emp.branch, emp.employeeId, emp.name, emp.department,
      ...cells.map((c) => c.code),
      totals.present, totals.late, totals.half, totals.absent, totals.leave, `${totals.pct}%`,
    ]);
    const blob = new Blob([toCsv([header, ...body])], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance-${month}${branch !== "All" ? `-${branch}` : ""}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading && !data) return <div className="py-16 text-center text-sm text-slate-400">Loading attendance…</div>;
  if (error && !data) return <div className="py-16 text-center text-sm text-red-500">{error}</div>;
  if (!data) return null;

  const viewAll = data.viewAll;

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="no-print flex flex-wrap items-center gap-3">
        <div className="flex items-center rounded-xl border border-slate-200 bg-white">
          <button aria-label="Previous month" className="p-2 hover:bg-slate-50 rounded-l-xl cursor-pointer" onClick={() => setMonth(shiftMonth(month, -1))}><ChevronLeft className="w-4 h-4" /></button>
          <span className="px-3 text-sm font-semibold text-slate-800 min-w-[130px] text-center">{monthLabel(month)}</span>
          <button aria-label="Next month" className="p-2 hover:bg-slate-50 rounded-r-xl cursor-pointer disabled:opacity-30" disabled={month >= today.slice(0, 7)} onClick={() => setMonth(shiftMonth(month, 1))}><ChevronRight className="w-4 h-4" /></button>
        </div>

        {viewAll && (
          <>
            <select value={branch} onChange={(e) => setBranch(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700">
              <option value="All">All branches</option>
              {branches.map((b) => <option key={b}>{b}</option>)}
            </select>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or ID" className="rounded-xl border border-slate-200 bg-white pl-8 pr-3 py-2 text-xs w-48" />
            </div>
            <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
              <input type="checkbox" checked={groupByBranch} onChange={(e) => setGroupByBranch(e.target.checked)} /> Group by branch
            </label>
            <div className="ml-auto flex gap-2">
              <Button variant="outline" size="sm" icon={<Download className="w-4 h-4" />} onClick={exportCsv}>Export Excel (CSV)</Button>
              <Button variant="outline" size="sm" icon={<Printer className="w-4 h-4" />} onClick={() => window.print()}>Print</Button>
            </div>
          </>
        )}
      </div>

      <div id="attendance-print-area" className="space-y-5">
        {/* Print-only header */}
        <div className="print-only hidden">
          <h2 className="text-lg font-bold">Credit Expert India — Attendance Sheet</h2>
          <p className="text-xs">{monthLabel(month)} · {branch === "All" ? "All branches" : branch} · Generated {new Date().toLocaleString("en-IN")}</p>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: viewAll ? "Attendance rate" : "My attendance", value: `${summary.pct}%`, tone: "text-blue-700" },
            { label: "Present days", value: summary.present, tone: "text-emerald-700" },
            { label: "Late arrivals", value: summary.late, tone: "text-orange-600" },
            { label: "Absent / Leave", value: `${summary.absent} / ${summary.leave}`, tone: "text-red-600" },
          ].map((c) => (
            <div key={c.label} className="bg-white rounded-2xl border border-slate-200 p-4">
              <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">{c.label}</div>
              <div className={`text-2xl font-bold mt-1 ${c.tone}`}>{c.value}</div>
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-1.5">
          {LEGEND.map((l) => (
            <span key={l.code} className={`px-2 py-0.5 rounded text-[10px] font-semibold ${KIND_STYLE[l.kind]}`}>{l.code} · {l.label}</span>
          ))}
        </div>

        {rows.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 py-14 text-center text-sm text-slate-400">No employees match this view.</div>
        ) : !viewAll ? (
          <MyCalendar month={month} days={days} cells={rows[0].cells} today={today} />
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto print-overflow-visible">
            <table className="text-[11px] border-collapse w-full">
              <thead>
                <tr className="bg-slate-50 text-slate-600">
                  <th className="sticky left-0 z-10 bg-slate-50 text-left px-3 py-2 min-w-[170px] border-b border-slate-200">Employee</th>
                  {days.map((d) => {
                    const dow = new Date(`${d}T00:00:00`).getDay();
                    return (
                      <th key={d} className={`px-0 py-1 w-7 min-w-[28px] border-b border-slate-200 font-semibold ${dow === 0 ? "text-slate-400" : ""}`}>
                        <div>{Number(d.slice(8))}</div>
                        <div className="text-[9px] font-normal text-slate-400">{"SMTWTFS"[dow]}</div>
                      </th>
                    );
                  })}
                  {["P", "LT", "HD", "A", "L", "%"].map((h) => <th key={h} className="px-2 py-2 border-b border-l border-slate-200 w-9">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ emp, cells, totals }, i) => (
                  <React.Fragment key={emp.employeeId}>
                    {groupByBranch && (i === 0 || rows[i - 1].emp.branch !== emp.branch) && (
                      <tr><td colSpan={days.length + 7} className="sticky left-0 bg-blue-50 text-blue-800 font-bold px-3 py-1.5 text-xs">{emp.branch}</td></tr>
                    )}
                    <tr className="hover:bg-slate-50/60">
                      <td className="sticky left-0 z-10 bg-white px-3 py-1.5 border-b border-slate-100">
                        <div className="font-semibold text-slate-800 truncate max-w-[160px]">{emp.name}</div>
                        <div className="text-[10px] text-slate-400">{emp.employeeId}{!groupByBranch ? ` · ${emp.branch}` : ""}</div>
                      </td>
                      {cells.map((c, idx) => (
                        <td key={idx} className="p-0 border-b border-slate-100">
                          <button
                            type="button"
                            title={`${emp.name} · ${days[idx]}${c.title ? `\n${c.title}` : ""}`}
                            disabled={!data.canEdit || days[idx] > today}
                            onClick={() => openEdit(emp, days[idx], c)}
                            className={`w-full h-7 text-[10px] font-semibold ${KIND_STYLE[c.kind]} ${c.derived && c.kind === "absent" ? "opacity-70" : ""} ${data.canEdit && days[idx] <= today ? "hover:ring-2 hover:ring-blue-400 hover:ring-inset cursor-pointer" : "cursor-default"}`}
                          >
                            {c.code}
                          </button>
                        </td>
                      ))}
                      <td className="px-2 text-center border-b border-l border-slate-100 font-semibold text-emerald-700">{totals.present}</td>
                      <td className="px-2 text-center border-b border-slate-100 text-orange-600">{totals.late}</td>
                      <td className="px-2 text-center border-b border-slate-100 text-amber-600">{totals.half}</td>
                      <td className="px-2 text-center border-b border-slate-100 text-red-600">{totals.absent}</td>
                      <td className="px-2 text-center border-b border-slate-100 text-violet-600">{totals.leave}</td>
                      <td className="px-2 text-center border-b border-slate-100 font-bold text-slate-800">{totals.pct}%</td>
                    </tr>
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {viewAll && data.canEdit && <p className="no-print text-[11px] text-slate-400 flex items-center gap-1"><Pencil className="w-3 h-3" /> Click any past day to edit or add an attendance entry. Pale red “A” means no record exists for that day.</p>}
      </div>

      <Modal isOpen={!!edit} onClose={() => setEdit(null)} title="Edit attendance" subtitle={edit ? `${edit.emp.name} · ${edit.date}` : ""} maxWidth="md">
        <form onSubmit={save} className="space-y-4">
          <label className="block text-xs font-semibold text-slate-600">Status
            <select value={eStatus} onChange={(e) => setEStatus(e.target.value as AttendanceStatus)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
              {STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <label className="block text-xs font-semibold text-slate-600">Check-in time (IST, optional)
            <input type="time" value={eIn} onChange={(e) => setEIn(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          </label>
          <label className="block text-xs font-semibold text-slate-600">Remarks
            <input value={eRemarks} onChange={(e) => setERemarks(e.target.value)} maxLength={200} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={() => setEdit(null)}>Cancel</Button>
            <Button type="submit" size="sm" isLoading={saving}>Save</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function MyCalendar({ month, days, cells, today }: { month: string; days: string[]; cells: Cell[]; today: string }) {
  const lead = new Date(`${month}-01T00:00:00`).getDay();
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-3"><CalendarDays className="w-4 h-4 text-blue-600" /> My calendar</h3>
      <div className="grid grid-cols-7 gap-1.5 text-center">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d} className="text-[10px] font-semibold text-slate-400 uppercase">{d}</div>)}
        {Array.from({ length: lead }).map((_, i) => <div key={`b${i}`} />)}
        {days.map((d, i) => {
          const c = cells[i];
          return (
            <div key={d} title={c.title} className={`rounded-xl p-1.5 sm:p-2 min-h-[56px] flex flex-col items-center justify-between ${KIND_STYLE[c.kind]} ${d === today ? "ring-2 ring-blue-500" : ""}`}>
              <span className="text-[11px] opacity-70">{Number(d.slice(8))}</span>
              <span className="text-xs font-bold">{c.code}</span>
              <span className="text-[9px] opacity-70">{c.record?.checkIn ? c.record.checkIn.slice(0, 5) : " "}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
