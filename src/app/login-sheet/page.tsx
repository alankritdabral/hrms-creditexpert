"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Edit2, FileSpreadsheet, Plus, Search, Table2, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Pagination } from "@/components/ui/Pagination";
import { MultiSelect } from "@/components/login-sheet/MultiSelect";
import { ImportModal } from "@/components/login-sheet/ImportModal";
import { entriesToXlsx } from "@/lib/login-sheet-excel";
import { downloadBlob, XLSX_MIME } from "@/lib/download";
import { EntryFormModal, type EntryPayload, type SheetEmployee } from "@/components/login-sheet/EntryFormModal";
import { useAuth } from "@/lib/auth-context";
import { useLenderBanks } from "@/lib/use-lender-banks";
import { mergeBankLists } from "@/lib/lender-banks";
import { getISTDateString } from "@/lib/attendance/ist-time";
import { distinct } from "@/lib/logins-filter";
import {
  EMPTY_LOGIN_SHEET_FILTERS,
  FILE_BLANKS,
  LOGIN_SHEET_FILE_OPTIONS,
  LOGIN_SHEET_COLUMNS,
  LOGIN_SHEET_STATUSES,
  activeSheetFilterCount,
  filterLoginSheet,
  loginSheetToCsv,
  sortLoginSheet,
  summarizeLoginSheet,
  type LoginSheetFilters,
} from "@/lib/login-sheet";
import { BRANCHES, type LoginSheetEntry } from "@/lib/types";

const PAGE_SIZE = 50;

const STATUS_STYLE: Record<string, string> = {
  SENT: "bg-slate-100 text-slate-700 border-slate-200",
  LOGIN: "bg-blue-50 text-blue-700 border-blue-200",
  APPROVED: "bg-amber-50 text-amber-700 border-amber-200",
  DISBURSED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  REJECT: "bg-rose-50 text-rose-700 border-rose-200",
};
const statusStyle = (s: string) => STATUS_STYLE[s] || "bg-purple-50 text-purple-700 border-purple-200";

const money = (n: number | undefined) => (n === undefined ? "" : n.toLocaleString("en-IN"));
const formatDate = (d: string) => {
  const [y, m, day] = d.split("-");
  return y && m && day ? `${day}-${m}-${y}` : d;
};

function defaultRange() {
  const today = getISTDateString();
  return { from: `${today.slice(0, 7)}-01`, to: today };
}

const filterCls = (active: boolean) =>
  `w-full py-1.5 px-2.5 text-xs rounded-xl border focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 ${
    active ? "border-blue-300 bg-blue-50/60 text-blue-900 font-semibold" : "border-slate-200 bg-slate-50/50 text-slate-700"
  }`;

/** Relative width of each column (about pixels at a 1440px-wide screen); the table scales them to fill the page width. */
const COLUMN_WIDTHS: Record<(typeof LOGIN_SHEET_COLUMNS)[number], number> = {
  "Customer Name": 72,
  "PAN No.": 66,
  Number: 64,
  Location: 48,
  Date: 66,
  "Emp Name": 70,
  "Bank Name": 52,
  "DSA Name": 46,
  "Login ID": 56,
  Product: 48,
  Branch: 50,
  File: 48,
  Amount: 62,
  Time: 38,
  Status: 78,
  "Remarks 1": 58,
  "Insurance Details": 56,
  "Amount 2": 62,
};
const NUM_COL = 22;
const ACTIONS_COL = 52;

export default function LoginSheetPage() {
  const { currentUser, hasPermission } = useAuth();
  const canViewAll = hasPermission("logins:view_all");
  const canManage = hasPermission("logins:manage");
  const { banks: savedBanks, refresh: refreshBanks } = useLenderBanks();

  const [filters, setFilters] = useState<LoginSheetFilters>(() => ({ ...EMPTY_LOGIN_SHEET_FILTERS, ...rangeFilters() }));
  const [entries, setEntries] = useState<LoginSheetEntry[]>([]);
  const [employees, setEmployees] = useState<SheetEmployee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<LoginSheetEntry | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  function rangeFilters() {
    const r = defaultRange();
    return { dateFrom: r.from, dateTo: r.to };
  }

  const setFilter = <K extends keyof LoginSheetFilters>(key: K, value: LoginSheetFilters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  };

  // The date range decides what is fetched; every other filter narrows the loaded rows in the browser.
  const { dateFrom, dateTo } = filters;
  const rangeValid = Boolean(dateFrom) && Boolean(dateTo) && dateFrom <= dateTo;

  const loadEntries = useCallback(async () => {
    if (!rangeValid) return;
    setIsLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/login-sheet?from=${dateFrom}&to=${dateTo}`);
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) setEntries(json.data);
      else {
        setEntries([]);
        setLoadError(json.error || "Could not load the login sheet.");
      }
    } catch {
      setEntries([]);
      setLoadError("Could not load the login sheet. Check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  }, [dateFrom, dateTo, rangeValid]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  // People the user may enter rows for: everyone (name list only) with logins:view_all, only themselves otherwise.
  const loadDirectory = useCallback(() => {
    if (!canViewAll) return;
    fetch("/api/employee-directory")
      .then((r) => r.json())
      .then((json) => {
        if (json.success && Array.isArray(json.data)) {
          setEmployees(
            json.data
              .map((e: any) => ({ employeeId: e.employeeId, name: e.name || e.employeeId, branch: e.branch }))
              .sort((a: SheetEmployee, b: SheetEmployee) => a.name.localeCompare(b.name))
          );
        }
      })
      .catch(() => {});
  }, [canViewAll]);
  useEffect(() => {
    loadDirectory();
  }, [loadDirectory]);

  const self: SheetEmployee = useMemo(
    () => ({ employeeId: currentUser.employeeId, name: currentUser.name, branch: currentUser.branch }),
    [currentUser.employeeId, currentUser.name, currentUser.branch]
  );
  const formEmployees = useMemo(
    () => (canViewAll ? (employees.some((e) => e.employeeId === self.employeeId) ? employees : [self, ...employees]) : [self]),
    [canViewAll, employees, self]
  );

  const sorted = useMemo(() => sortLoginSheet(entries), [entries]);
  const filtered = useMemo(() => filterLoginSheet(sorted, filters), [sorted, filters]);
  const summary = useMemo(() => summarizeLoginSheet(filtered), [filtered]);
  // Chip counts ignore the status filter itself, so every status stays available to tick.
  const statusCounts = useMemo(
    () => summarizeLoginSheet(filterLoginSheet(sorted, { ...filters, status: [] })).byStatus,
    [sorted, filters]
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const def = defaultRange();
  const dateChanged = dateFrom !== def.from || dateTo !== def.to;
  const filterCount = activeSheetFilterCount({ ...filters, dateFrom: "", dateTo: "" }) + (dateChanged ? 1 : 0);
  const hasAnyFilter = filterCount > 0 || filters.search.trim() !== "";
  const resetFilters = () => {
    setFilters({ ...EMPTY_LOGIN_SHEET_FILTERS, ...rangeFilters() });
    setPage(1);
  };

  const options = useMemo(
    () => ({
      employees: Array.from(new Map(entries.map((e) => [e.employeeId, e.empName])).entries()).sort((a, b) => a[1].localeCompare(b[1])),
      banks: distinct(entries.map((e) => e.bankName)),
      dsas: distinct(entries.map((e) => e.dsaName)),
      products: distinct(entries.map((e) => e.product)),
      statuses: distinct([...LOGIN_SHEET_STATUSES, ...entries.map((e) => e.status)]),
      files: [...distinct([...LOGIN_SHEET_FILE_OPTIONS, ...entries.map((e) => e.file)]), FILE_BLANKS],
    }),
    [entries]
  );
  const bankSuggestions = useMemo(() => mergeBankLists(savedBanks, options.banks), [savedBanks, options.banks]);

  const columnTotal = NUM_COL + (canManage ? ACTIONS_COL : 0) + LOGIN_SHEET_COLUMNS.reduce((n, c) => n + COLUMN_WIDTHS[c], 0);
  const pct = (w: number) => `${((w / columnTotal) * 100).toFixed(3)}%`;

  const canEdit = (row: LoginSheetEntry) => canManage && (canViewAll || row.employeeId === currentUser.employeeId);

  const openAdd = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (row: LoginSheetEntry) => {
    setEditing(row);
    setFormOpen(true);
  };

  /** Returns an error message to show in the form, or null when everything was saved. */
  const handleSubmit = async (
    rows: EntryPayload[],
    employeeId: string,
    editingId: string | null,
    newEmployeeName?: string
  ): Promise<string | null> => {
    try {
      const res = await fetch("/api/login-sheet", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          editingId ? { id: editingId, employeeId, newEmployeeName, ...rows[0] } : { employeeId, newEmployeeName, entries: rows }
        ),
      });
      const json = await res.json();
      if (!json.success) return json.error || "Could not save. Please try again.";

      // Make sure the saved rows are inside the visible date range.
      const dates: string[] = (editingId ? [json.data] : json.data).map((e: LoginSheetEntry) => e.date);
      const lo = dates.reduce((a, b) => (b < a ? b : a), dateFrom);
      const hi = dates.reduce((a, b) => (b > a ? b : a), dateTo);
      const widened = lo !== dateFrom || hi !== dateTo;
      setFormOpen(false);
      setEditing(null);
      if (newEmployeeName) loadDirectory(); // the new temporary employee joins the picker
      refreshBanks(); // a new bank name typed here is remembered by the server
      setNotice(editingId ? "Row updated." : `${rows.length} ${rows.length === 1 ? "row" : "rows"} added.`);
      if (widened) setFilters((p) => ({ ...p, dateFrom: lo, dateTo: hi }));
      else await loadEntries();
      return null;
    } catch {
      return "Could not save. Check your connection and try again.";
    }
  };

  const changeStatus = async (row: LoginSheetEntry, status: string) => {
    if (status === row.status) return;
    const previous = entries;
    setEntries((list) => list.map((e) => (e.id === row.id ? { ...e, status } : e)));
    try {
      const res = await fetch("/api/login-sheet", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...row, status }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Could not update status.");
      setEntries((list) => list.map((e) => (e.id === row.id ? json.data : e)));
    } catch (e: any) {
      setEntries(previous);
      setNotice(e?.message || "Could not update status.");
    }
  };

  const deleteRow = async (row: LoginSheetEntry) => {
    if (!confirm(`Delete the row for ${row.customerName} (${row.bankName})?`)) return;
    try {
      const res = await fetch(`/api/login-sheet?id=${encodeURIComponent(row.id)}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Could not delete the row.");
      setEntries((list) => list.filter((e) => e.id !== row.id));
      setNotice("Row deleted.");
    } catch (e: any) {
      setNotice(e?.message || "Could not delete the row.");
    }
  };

  const exportCsv = () => {
    downloadBlob(new Blob(["\ufeff" + loginSheetToCsv(filtered)], { type: "text/csv;charset=utf-8" }), `login-sheet_${dateFrom}_to_${dateTo}.csv`);
  };

  const exportExcel = async () => {
    setExporting(true);
    try {
      downloadBlob(new Blob([await entriesToXlsx(filtered)], { type: XLSX_MIME }), `login-sheet_${dateFrom}_to_${dateTo}.xlsx`);
    } catch {
      setNotice("Could not create the Excel file. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  const handleImported = (dates: string[], count: number) => {
    refreshBanks(); // bank names found in the file are remembered automatically
    setNotice(`${count} ${count === 1 ? "row" : "rows"} imported from Excel.`);
    const lo = dates.reduce((a, b) => (b < a ? b : a), dateFrom);
    const hi = dates.reduce((a, b) => (b > a ? b : a), dateTo);
    if (lo !== dateFrom || hi !== dateTo) setFilters((p) => ({ ...p, dateFrom: lo, dateTo: hi }));
    else loadEntries();
  };

  const dropdowns: { label: string; key: "employeeId" | "branch" | "bank" | "dsa" | "product"; any: string; opts: { value: string; label: string }[]; show?: boolean }[] = [
    {
      label: "Employee",
      key: "employeeId",
      any: "All employees",
      opts: options.employees.map(([value, label]) => ({ value, label })),
      show: canViewAll,
    },
    { label: "Branch", key: "branch", any: "All branches", opts: BRANCHES.map((b) => ({ value: b, label: b })) },
    { label: "Bank", key: "bank", any: "All banks", opts: options.banks.map((b) => ({ value: b, label: b })) },
    { label: "DSA", key: "dsa", any: "All DSAs", opts: options.dsas.map((b) => ({ value: b, label: b })) },
    { label: "Product", key: "product", any: "All products", opts: options.products.map((b) => ({ value: b, label: b })) },
  ];

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
            <Table2 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Login Sheet</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              File-wise log of every customer sent to a bank: DSA, login ID, status, amounts and remarks.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Button size="sm" variant="secondary" onClick={exportExcel} isLoading={exporting} disabled={filtered.length === 0} icon={<FileSpreadsheet className="w-4 h-4 text-emerald-600" />}>
            Export Excel
          </Button>
          <Button size="sm" variant="secondary" onClick={exportCsv} disabled={filtered.length === 0} icon={<Download className="w-4 h-4" />}>
            CSV
          </Button>
          {canManage && (
            <Button size="sm" variant="outline" onClick={() => setImportOpen(true)} icon={<Upload className="w-4 h-4" />}>
              Import Excel
            </Button>
          )}
          {canManage && (
            <Button size="sm" onClick={openAdd} icon={<Plus className="w-4 h-4" />}>
              Add Entry
            </Button>
          )}
        </div>
      </div>

      {notice && (
        <div role="status" className="flex items-center justify-between gap-3 text-xs text-slate-700 bg-white border border-slate-200 rounded-xl px-4 py-2.5 shadow-xs">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="text-slate-400 hover:text-slate-700 cursor-pointer" aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Files", value: summary.files.toLocaleString("en-IN"), sub: `${summary.customers.toLocaleString("en-IN")} customers` },
          { label: "Total Amount", value: `₹${money(summary.totalAmount)}`, sub: `${(summary.totalAmount / 100000).toLocaleString("en-IN", { maximumFractionDigits: 2 })} Lakhs` },
          { label: "Total Amount 2", value: `₹${money(summary.totalAmount2)}`, sub: `${(summary.totalAmount2 / 100000).toLocaleString("en-IN", { maximumFractionDigits: 2 })} Lakhs` },
          { label: "Disbursed Files", value: (summary.byStatus["DISBURSED"] || 0).toLocaleString("en-IN"), sub: `${summary.byStatus["REJECT"] || 0} rejected` },
        ].map((c) => (
          <div key={c.label} className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-xs">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{c.label}</div>
            <div className="mt-2 text-xl sm:text-2xl font-bold text-slate-900 tracking-tight font-mono">{c.value}</div>
            <div className="text-[11px] text-slate-500 mt-1">{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Sheet */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search customer, PAN, number, login ID, file..."
                value={filters.search}
                onChange={(e) => setFilter("search", e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-slate-50/50"
              />
            </div>
            <div className="text-xs text-slate-500">
              Showing {filtered.length.toLocaleString("en-IN")} of {entries.length.toLocaleString("en-IN")} rows
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-2.5">
            <label className="flex flex-col gap-1 min-w-[8.5rem] flex-1 sm:flex-none">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">From</span>
              <input type="date" value={dateFrom} max={dateTo || undefined} onChange={(e) => setFilter("dateFrom", e.target.value)} className={filterCls(dateFrom !== def.from)} />
            </label>
            <label className="flex flex-col gap-1 min-w-[8.5rem] flex-1 sm:flex-none">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">To</span>
              <input type="date" value={dateTo} min={dateFrom || undefined} onChange={(e) => setFilter("dateTo", e.target.value)} className={filterCls(dateTo !== def.to)} />
            </label>
            {dropdowns
              .filter((d) => d.show !== false)
              .map((d) => (
                <label key={d.key} className="flex flex-col gap-1 min-w-[9rem] flex-1 sm:flex-none">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{d.label}</span>
                  <select value={filters[d.key]} onChange={(e) => setFilter(d.key, e.target.value)} className={filterCls(Boolean(filters[d.key]))}>
                    <option value="">{d.any}</option>
                    {d.opts.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            <MultiSelect
              label="Status"
              anyLabel="All statuses"
              options={options.statuses}
              value={filters.status}
              onChange={(v) => setFilter("status", v)}
            />
            <MultiSelect
              label="File"
              anyLabel="All files"
              options={options.files}
              value={filters.file}
              onChange={(v) => setFilter("file", v)}
            />
            {hasAnyFilter && (
              <button
                type="button"
                onClick={resetFilters}
                className="py-1.5 px-3 text-xs font-semibold text-blue-700 hover:bg-blue-50 rounded-xl border border-blue-200 transition-colors cursor-pointer"
              >
                Clear filters{filterCount > 0 ? ` (${filterCount})` : ""}
              </button>
            )}
          </div>

          {/* Status counts double as quick filters */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {Object.entries(statusCounts)
              .sort((a, b) => b[1] - a[1])
              .map(([status, count]) => (
                <button
                  key={status}
                  type="button"
                  onClick={() =>
                    setFilter("status", filters.status.includes(status) ? filters.status.filter((x) => x !== status) : [...filters.status, status])
                  }
                  className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold cursor-pointer transition-shadow ${statusStyle(status)} ${
                    filters.status.includes(status) ? "ring-2 ring-blue-400" : ""
                  }`}
                  title={filters.status.includes(status) ? `Stop filtering by ${status}` : `Also show ${status}`}
                >
                  {status} · {count}
                </button>
              ))}
          </div>
          {!rangeValid && <div className="text-xs text-rose-600">Choose a valid date range (From must not be after To).</div>}
        </div>

        {/* Fixed layout: the 18 columns share the page width (long text wraps) instead of scrolling sideways.
            Only very narrow screens fall back to a minimum width and scroll. */}
        <div className="overflow-x-auto overflow-y-auto max-h-[70vh]">
          <table className="w-full table-fixed text-left text-[11px] leading-snug border-separate border-spacing-0 min-w-[1040px]">
            <colgroup>
              <col style={{ width: pct(NUM_COL) }} />
              {LOGIN_SHEET_COLUMNS.map((c) => (
                <col key={c} style={{ width: pct(COLUMN_WIDTHS[c]) }} />
              ))}
              {canManage && <col style={{ width: pct(ACTIONS_COL) }} />}
            </colgroup>
            <thead>
              <tr className="text-slate-600 font-semibold uppercase text-[9px] leading-tight">
                <th className="sticky top-0 z-10 bg-slate-100 border-b border-r border-slate-200 py-2 px-1 text-center">#</th>
                {LOGIN_SHEET_COLUMNS.map((c) => (
                  <th key={c} className="sticky top-0 z-10 bg-slate-100 border-b border-r border-slate-200 py-2 px-1 [overflow-wrap:normal]">
                    {c}
                  </th>
                ))}
                {canManage && <th className="sticky top-0 z-10 bg-slate-100 border-b border-slate-200 py-2 px-1 text-right"><span className="sr-only">Actions</span></th>}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={LOGIN_SHEET_COLUMNS.length + 2} className="py-14 text-center text-slate-400">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                      <span>Loading the login sheet...</span>
                    </div>
                  </td>
                </tr>
              ) : loadError ? (
                <tr>
                  <td colSpan={LOGIN_SHEET_COLUMNS.length + 2} className="py-14 text-center">
                    <div className="space-y-3">
                      <div className="text-rose-600">{loadError}</div>
                      <Button size="sm" variant="outline" onClick={loadEntries}>
                        Try again
                      </Button>
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={LOGIN_SHEET_COLUMNS.length + 2} className="py-14 text-center text-slate-400">
                    <div className="space-y-3">
                      <div>{hasAnyFilter && entries.length > 0 ? "No rows match these filters." : "No rows in this date range yet."}</div>
                      {hasAnyFilter && entries.length > 0 ? (
                        <Button size="sm" variant="outline" onClick={resetFilters}>
                          Clear filters
                        </Button>
                      ) : (
                        canManage && (
                          <Button size="sm" onClick={openAdd} icon={<Plus className="w-4 h-4" />}>
                            Add first entry
                          </Button>
                        )
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                pageRows.map((r, i) => {
                  const cell = "border-b border-r border-slate-100 py-1.5 px-1 align-top break-words";
                  const nowrap = "whitespace-nowrap";
                  const editable = canEdit(r);
                  return (
                    <tr key={r.id} className="hover:bg-blue-50/30 transition-colors">
                      <td className={`${cell} px-1 text-center text-slate-400 bg-slate-50/60 font-mono`}>{(safePage - 1) * PAGE_SIZE + i + 1}</td>
                      <td className={`${cell} font-semibold text-slate-900`}>{r.customerName}</td>
                      <td className={`${cell} ${nowrap} font-mono text-[10px] text-slate-700`}>{r.panNo}</td>
                      <td className={`${cell} ${nowrap} font-mono text-[10px] text-slate-700`}>{r.phone}</td>
                      <td className={cell}>{r.location}</td>
                      <td className={`${cell} ${nowrap} font-mono text-[10px]`}>{formatDate(r.date)}</td>
                      <td className={cell}>{r.empName}</td>
                      <td className={`${cell} font-medium`}>{r.bankName}</td>
                      <td className={cell}>{r.dsaName}</td>
                      <td className={`${cell} font-mono break-all`}>{r.loginId}</td>
                      <td className={cell}>{r.product}</td>
                      <td className={cell}>{r.branch}</td>
                      <td className={cell}>{r.file}</td>
                      <td className={`${cell} ${nowrap} text-right font-mono text-[10px]`}>{money(r.amount)}</td>
                      <td className={`${cell} ${nowrap} font-mono text-[10px]`}>{r.time}</td>
                      <td className={cell}>
                        {editable ? (
                          <select
                            value={r.status}
                            onChange={(e) => changeStatus(r, e.target.value)}
                            aria-label={`Status for ${r.customerName} at ${r.bankName}`}
                            title="Change status"
                            className={`w-full max-w-full appearance-none text-center rounded-full border px-1 py-0.5 text-[10px] font-bold cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-400 ${statusStyle(r.status)}`}
                          >
                            {!(LOGIN_SHEET_STATUSES as readonly string[]).includes(r.status) && <option value={r.status}>{r.status}</option>}
                            {LOGIN_SHEET_STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className={`inline-flex rounded-full border px-1.5 py-0.5 text-[10px] font-bold ${statusStyle(r.status)}`}>{r.status}</span>
                        )}
                      </td>
                      <td className={`${cell} text-slate-600`} title={r.remarks}>
                        {r.remarks}
                      </td>
                      <td className={`${cell} text-slate-600`}>{r.insuranceDetails}</td>
                      <td className={`${cell} ${nowrap} text-right font-mono text-[10px]`}>{money(r.amount2)}</td>
                      {canManage && (
                        <td className="border-b border-slate-100 py-1.5 px-1 text-right align-top">
                          {editable && (
                            <div className="flex items-center justify-end gap-0.5">
                              <button
                                type="button"
                                onClick={() => openEdit(r)}
                                className="p-1 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                                title="Edit row"
                                aria-label={`Edit ${r.customerName} at ${r.bankName}`}
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteRow(r)}
                                className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                title="Delete row"
                                aria-label={`Delete ${r.customerName} at ${r.bankName}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="px-5 pb-4">
          <Pagination page={safePage} totalPages={totalPages} total={filtered.length} onPageChange={setPage} disabled={isLoading} />
        </div>
      </div>

      <ImportModal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        canPickEmployee={canViewAll}
        self={self}
        employees={formEmployees}
        existing={entries}
        onImported={handleImported}
      />

      <EntryFormModal
        isOpen={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        editing={editing}
        employees={formEmployees}
        canPickEmployee={canViewAll}
        self={self}
        bankOptions={bankSuggestions}
        dsaOptions={options.dsas}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
