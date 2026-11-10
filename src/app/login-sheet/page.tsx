"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Download, Edit2, FileSpreadsheet, Pencil, Plus, Search, Table2, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Pagination } from "@/components/ui/Pagination";
import { MultiSelect } from "@/components/login-sheet/MultiSelect";
import { ImportModal } from "@/components/login-sheet/ImportModal";
import { RenameEmployeeModal } from "@/components/login-sheet/RenameEmployeeModal";
import { entriesToXlsx } from "@/lib/login-sheet-excel";
import { downloadBlob, XLSX_MIME } from "@/lib/download";
import { EntryFormModal, type EntryPayload, type SheetEmployee } from "@/components/login-sheet/EntryFormModal";
import { CellEditor, type CellMove, type Choice } from "@/components/login-sheet/CellEditor";
import {
  SHEET_COLUMNS,
  applyEdits,
  applyPatch,
  cellCopyText,
  cellDraft,
  diffRow,
  formatSheetDate as formatDate,
  type EditOutcome,
  type SheetColumnKey,
} from "@/lib/login-sheet-edit";
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
  LOGIN_SHEET_PRODUCTS,
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

/** Extra classes per column for the read-only look of a cell. */
const NOWRAP = "whitespace-nowrap";
const CELL_STYLE: Partial<Record<SheetColumnKey, string>> = {
  customerName: "font-semibold text-slate-900",
  panNo: `${NOWRAP} font-mono text-[10px] text-slate-700`,
  phone: `${NOWRAP} font-mono text-[10px] text-slate-700`,
  date: `${NOWRAP} font-mono text-[10px]`,
  bankName: "font-medium",
  loginId: "font-mono break-all",
  amount: `${NOWRAP} text-right font-mono text-[10px]`,
  time: `${NOWRAP} font-mono text-[10px]`,
  remarks: "text-slate-600",
  insuranceDetails: "text-slate-600",
  amount2: `${NOWRAP} text-right font-mono text-[10px]`,
};

/** Text that stops at 3 lines with "..." and opens in full when clicked (click again to fold it back). */
function ClampedText({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [clipped, setClipped] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || expanded) return;
    const measure = () => setClipped(el.scrollHeight > el.clientHeight + 1);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text, expanded]);

  const toggle = clipped || expanded;
  return (
    <span
      ref={ref}
      className={toggle ? "cursor-pointer" : undefined}
      style={
        expanded
          ? { display: "block" }
          : { display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 3, overflow: "hidden" }
      }
      title={toggle ? (expanded ? "Click to collapse" : "Click to see the full text") : undefined}
      onClick={toggle ? () => setExpanded((v) => !v) : undefined}
    >
      {text}
    </span>
  );
}

type CellPos = { id: string; col: number };
type Editing = CellPos & { draft: string; error: string | null };
type SaveableEdit = Extract<EditOutcome, { ok: true }>;

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
const RANGE_STORAGE_KEY = "login-sheet-date-range";
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
  const [renaming, setRenaming] = useState<{ employeeId: string; name: string } | null>(null);
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

  // The chosen range survives a refresh (this tab only). Importing older rows widens the range to show them;
  // without this a refresh went back to "this month" and the imported rows seemed to have vanished.
  const [rangeReady, setRangeReady] = useState(false);
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(RANGE_STORAGE_KEY) || "null");
      if (saved && /^\d{4}-\d{2}-\d{2}$/.test(saved.dateFrom) && /^\d{4}-\d{2}-\d{2}$/.test(saved.dateTo) && saved.dateFrom <= saved.dateTo) {
        setFilters((p) => ({ ...p, dateFrom: saved.dateFrom, dateTo: saved.dateTo }));
      }
    } catch {
      /* storage unavailable: use the default range */
    }
    setRangeReady(true);
  }, []);
  useEffect(() => {
    if (!rangeReady || !rangeValid) return;
    try {
      const d = defaultRange();
      if (dateFrom === d.from && dateTo === d.to) sessionStorage.removeItem(RANGE_STORAGE_KEY);
      else sessionStorage.setItem(RANGE_STORAGE_KEY, JSON.stringify({ dateFrom, dateTo }));
    } catch {
      /* storage unavailable */
    }
  }, [rangeReady, rangeValid, dateFrom, dateTo]);

  const loadEntries = useCallback(async () => {
    if (!rangeValid || !rangeReady) return;
    setIsLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/login-sheet?from=${dateFrom}&to=${dateTo}`);
      const json = await res.json();
      // Sorted once here, not on every render: an edited date or time must not make the row jump away from the cursor.
      if (json.success && Array.isArray(json.data)) setEntries(sortLoginSheet(json.data));
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
  }, [dateFrom, dateTo, rangeValid, rangeReady]);

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
              .map((e: any) => ({ employeeId: e.employeeId, name: e.name || e.employeeId, branch: e.branch, isTemporary: !!e.isTemporary }))
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

  const filtered = useMemo(() => filterLoginSheet(entries, filters), [entries, filters]);
  const summary = useMemo(() => summarizeLoginSheet(filtered), [filtered]);
  // Chip counts ignore the status filter itself, so every status stays available to tick.
  const statusCounts = useMemo(
    () => summarizeLoginSheet(filterLoginSheet(entries, { ...filters, status: [] })).byStatus,
    [entries, filters]
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

  // ---------------------------- Excel-style cell editing ----------------------------
  // The selected cell and the cell being edited are identified by row id + column index, so they stay put when rows are re-filtered.
  const [active, setActive] = useState<CellPos | null>(null);
  const [cellEdit, setCellEdit] = useState<Editing | null>(null);
  // Handlers read the live edit from this ref: a key press and the blur it causes can run before React re-renders.
  const editingRef = useRef<Editing | null>(null);
  const cellRefs = useRef(new Map<string, HTMLTableCellElement>());
  // Saves for one row run one after another, so an older edit can never land after a newer one.
  const saveQueue = useRef(new Map<string, Promise<void>>());
  const [pendingSaves, setPendingSaves] = useState(0);

  const setEdit = (next: Editing | null) => {
    editingRef.current = next;
    setCellEdit(next);
  };
  const cellKey = (id: string, col: number) => `${id}|${col}`;

  const owners = useMemo(() => formEmployees.map((e) => ({ employeeId: e.employeeId, name: e.name })), [formEmployees]);
  const ownerChoices: Choice[] = useMemo(() => owners.map((o) => ({ value: o.employeeId, label: o.name })), [owners]);
  const columnChoices = (key: SheetColumnKey): Choice[] => {
    switch (key) {
      case "empName":
        return ownerChoices;
      case "branch":
        return [{ value: "", label: "—" }, ...BRANCHES.map((b) => ({ value: b, label: b }))];
      case "file":
        return [{ value: "", label: "—" }, ...options.files.filter((f) => f !== FILE_BLANKS).map((f) => ({ value: f, label: f }))];
      case "status":
        return options.statuses.map((s) => ({ value: s, label: s }));
      default:
        return [];
    }
  };

  const cellEditable = (row: LoginSheetEntry, col: number) => canEdit(row) && (SHEET_COLUMNS[col].key !== "empName" || canViewAll);

  /** Saves one edited row: the screen updates at once, the server follows, and a refusal puts the old values back. */
  const saveRow = (row: LoginSheetEntry, edit: SaveableEdit) => {
    const change = diffRow(row, edit.value, edit.owner);
    if (!change) return;
    const { patch, inverse } = change;
    setEntries((list) => list.map((e) => (e.id === row.id ? applyPatch(e, patch) : e)));
    // The body is built from the row as it was when edited plus this edit, so it carries earlier queued edits too.
    const body = JSON.stringify({ id: row.id, employeeId: edit.owner?.employeeId ?? row.employeeId, ...edit.value });
    setPendingSaves((n) => n + 1);
    const task = (saveQueue.current.get(row.id) ?? Promise.resolve()).then(async () => {
      try {
        const res = await fetch("/api/login-sheet", { method: "PUT", headers: { "Content-Type": "application/json" }, body });
        const json = await res.json();
        if (!json.success) throw new Error(json.error || "Please try again.");
      } catch (e: any) {
        setEntries((list) => list.map((x) => (x.id === row.id ? applyPatch(x, inverse) : x)));
        setNotice(`Change to ${row.customerName} (${row.bankName}) was not saved: ${e?.message || "Check your connection and try again."}`);
      } finally {
        setPendingSaves((n) => n - 1);
      }
    });
    saveQueue.current.set(row.id, task);
  };

  const moveActive = (from: CellPos, move: CellMove) => {
    const r = pageRows.findIndex((x) => x.id === from.id);
    if (r < 0 || move === "none") return;
    let row = r;
    let col = from.col;
    if (move === "down") row = Math.min(pageRows.length - 1, r + 1);
    else if (move === "up") row = Math.max(0, r - 1);
    else if (move === "right") {
      if (col < SHEET_COLUMNS.length - 1) col += 1;
      else if (r < pageRows.length - 1) {
        row = r + 1;
        col = 0;
      }
    } else if (move === "left") {
      if (col > 0) col -= 1;
      else if (r > 0) {
        row = r - 1;
        col = SHEET_COLUMNS.length - 1;
      }
    }
    setActive({ id: pageRows[row].id, col });
  };

  const beginEdit = (pos: CellPos, typed?: string) => {
    const row = pageRows.find((x) => x.id === pos.id);
    if (!row || !cellEditable(row, pos.col)) return;
    setActive(pos);
    setEdit({ ...pos, draft: typed ?? cellDraft(row, SHEET_COLUMNS[pos.col].key), error: null });
  };

  /**
   * Saves the open edit. `from` ties a blur to the editor that raised it: a blur from an editor that was already
   * closed (or replaced) must not save the new one.
   */
  const commitEdit = (move: CellMove | "blur", override?: string, from?: CellPos) => {
    const ed = editingRef.current;
    if (!ed || (from && (from.id !== ed.id || from.col !== ed.col))) return;
    const row = entries.find((x) => x.id === ed.id);
    const key = SHEET_COLUMNS[ed.col].key;
    if (!row) {
      setEdit(null);
      return;
    }
    const result = applyEdits(row, { [key]: override ?? ed.draft }, owners);
    if (!result.ok) {
      if (move === "blur") {
        setEdit(null);
        setNotice(result.error);
      } else {
        setEdit({ ...ed, error: result.error }); // stay in the cell, like Excel's invalid-entry alert
      }
      return;
    }
    setEdit(null);
    saveRow(row, result);
    if (move !== "blur") moveActive(ed, move);
  };

  const cancelEdit = () => setEdit(null);

  /** Empties the selected cell (Delete / Backspace). Required cells refuse with the usual message. */
  const clearCell = (pos: CellPos) => {
    const row = pageRows.find((x) => x.id === pos.id);
    if (!row || !cellEditable(row, pos.col)) return;
    const { key, editor } = SHEET_COLUMNS[pos.col];
    // Dropdown cells that must hold a value (owner, status) cannot be emptied.
    if (editor === "select" && key !== "branch" && key !== "file") return;
    const result = applyEdits(row, { [key]: "" }, owners);
    if (!result.ok) setNotice(result.error);
    else saveRow(row, result);
  };

  /** Pastes text copied from Excel (tab-separated columns, one line per row) starting at the selected cell. */
  const pasteBlock = (text: string, start: CellPos) => {
    const r0 = pageRows.findIndex((x) => x.id === start.id);
    if (r0 < 0) return;
    const grid = text.replace(/\r/g, "").replace(/\n$/, "").split("\n").map((line) => line.split("\t"));
    const plan: { row: LoginSheetEntry; edit: SaveableEdit }[] = [];
    let skipped = 0;
    for (let i = 0; i < grid.length; i++) {
      const row = pageRows[r0 + i];
      if (!row) break;
      const edits: Partial<Record<SheetColumnKey, string>> = {};
      grid[i].forEach((value, j) => {
        const col = start.col + j;
        if (col < SHEET_COLUMNS.length && cellEditable(row, col)) edits[SHEET_COLUMNS[col].key] = value;
      });
      if (Object.keys(edits).length === 0) {
        skipped++;
        continue;
      }
      const result = applyEdits(row, edits, owners);
      if (!result.ok) {
        // Nothing is saved unless every pasted row is valid.
        setNotice(`Paste cancelled. ${row.customerName} (${row.bankName}): ${result.error}`);
        return;
      }
      plan.push({ row, edit: result });
    }
    plan.forEach(({ row, edit }) => saveRow(row, edit));
    if (skipped > 0 && plan.length === 0) setNotice("Those cells cannot be changed.");
    else if (skipped > 0) setNotice(`Pasted into ${plan.length} ${plan.length === 1 ? "row" : "rows"}; ${skipped} could not be changed.`);
  };

  // Keep the browser focus on the selected cell, so the arrow keys keep working after every move or edit.
  useEffect(() => {
    if (active && !cellEdit) cellRefs.current.get(cellKey(active.id, active.col))?.focus({ preventScroll: false });
  }, [active, cellEdit]);

  const onGridKeyDown = (e: React.KeyboardEvent<HTMLTableSectionElement>) => {
    if (!active || editingRef.current) return;
    const mod = e.ctrlKey || e.metaKey || e.altKey;
    const go = (move: CellMove) => {
      e.preventDefault();
      moveActive(active, move);
    };
    switch (e.key) {
      case "ArrowDown":
        return go("down");
      case "ArrowUp":
        return go("up");
      case "ArrowRight":
        return go("right");
      case "ArrowLeft":
        return go("left");
      case "Tab": {
        const r = pageRows.findIndex((x) => x.id === active.id);
        const atEnd = e.shiftKey ? r === 0 && active.col === 0 : r === pageRows.length - 1 && active.col === SHEET_COLUMNS.length - 1;
        if (atEnd) return; // let Tab leave the sheet
        return go(e.shiftKey ? "left" : "right");
      }
      case "Home":
        e.preventDefault();
        return setActive({ id: active.id, col: 0 });
      case "End":
        e.preventDefault();
        return setActive({ id: active.id, col: SHEET_COLUMNS.length - 1 });
      case "Enter":
      case "F2":
        e.preventDefault();
        return beginEdit(active);
      case "Delete":
      case "Backspace":
        e.preventDefault();
        return clearCell(active);
      default:
        // Typing on a selected cell replaces its content, like Excel.
        if (!mod && e.key.length === 1 && SHEET_COLUMNS[active.col].editor !== "select") {
          e.preventDefault();
          beginEdit(active, e.key);
        }
    }
  };

  const onGridCopy = (e: React.ClipboardEvent) => {
    if (!active || editingRef.current) return;
    const row = pageRows.find((x) => x.id === active.id);
    if (!row) return;
    e.preventDefault();
    e.clipboardData.setData("text/plain", cellCopyText(row, SHEET_COLUMNS[active.col].key));
  };

  const onGridPaste = (e: React.ClipboardEvent) => {
    if (!active || editingRef.current) return;
    e.preventDefault();
    pasteBlock(e.clipboardData.getData("text/plain"), active);
  };

  const renderValue = (r: LoginSheetEntry, key: SheetColumnKey): React.ReactNode => {
    switch (key) {
      case "date":
        return formatDate(r.date);
      case "amount":
        return money(r.amount);
      case "amount2":
        return money(r.amount2);
      case "status":
        return <span className={`inline-flex rounded-full border px-1.5 py-0.5 text-[10px] font-bold ${statusStyle(r.status)}`}>{r.status}</span>;
      default: {
        const v = r[key];
        return typeof v === "string" && v !== "" ? <ClampedText text={v} /> : (v ?? "");
      }
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

  const handleImported = (dates: string[], count: number, skipped: number) => {
    refreshBanks(); // bank names found in the file are remembered automatically
    setNotice(
      `${count} ${count === 1 ? "row" : "rows"} imported from Excel.` +
        (skipped > 0 ? ` ${skipped} already in the sheet ${skipped === 1 ? "was" : "were"} skipped.` : "")
    );
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
              {pendingSaves > 0 && <span className="ml-2 font-semibold text-blue-600" role="status">Saving…</span>}
            </div>
          </div>
          {canManage && (
            <p className="text-[11px] text-slate-400">
              Edit cells like Excel: click to select, double-click, Enter or F2 to edit (or just type), Tab and Enter to move, Esc to cancel, Delete to clear, Ctrl+C / Ctrl+V to copy and paste (also from Excel).
            </p>
          )}

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
          <table role="grid" aria-label="Login sheet" className="w-full table-fixed text-left text-[11px] leading-snug border-separate border-spacing-0 min-w-[1040px]">
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
            <tbody
              onKeyDown={onGridKeyDown}
              onCopy={onGridCopy}
              onPaste={onGridPaste}
              onBlur={(e) => {
                // Clicking away from the sheet drops the selection.
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setActive(null);
              }}
            >
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
                  const editable = canEdit(r);
                  return (
                    <tr key={r.id} className="hover:bg-blue-50/30 transition-colors">
                      <td className={`${cell} px-1 text-center text-slate-400 bg-slate-50/60 font-mono`}>{(safePage - 1) * PAGE_SIZE + i + 1}</td>
                      {SHEET_COLUMNS.map((c, ci) => {
                        const isActive = active?.id === r.id && active.col === ci;
                        const isEditing = cellEdit?.id === r.id && cellEdit.col === ci;
                        const writable = cellEditable(r, ci);
                        return (
                          <td
                            key={c.key}
                            ref={(el) => {
                              if (el) cellRefs.current.set(cellKey(r.id, ci), el);
                              else cellRefs.current.delete(cellKey(r.id, ci));
                            }}
                            role="gridcell"
                            tabIndex={isActive ? 0 : -1}
                            aria-selected={isActive}
                            aria-readonly={!writable}
                            title={c.key === "remarks" ? r.remarks : undefined}
                            onClick={() => {
                              setActive({ id: r.id, col: ci });
                              // Dropdown cells open on a single click, so changing a status stays one click.
                              if (c.editor === "select" && !isEditing) beginEdit({ id: r.id, col: ci });
                            }}
                            onDoubleClick={() => {
                              if (!isEditing) beginEdit({ id: r.id, col: ci });
                            }}
                            className={`${cell} ${CELL_STYLE[c.key] ?? ""} relative outline-none ${writable ? "cursor-cell" : ""} ${
                              isActive ? "bg-blue-50/60 shadow-[inset_0_0_0_2px_rgb(59,130,246)]" : ""
                            }`}
                          >
                            <div className={isEditing ? "invisible" : undefined}>
                              {renderValue(r, c.key)}
                              {c.key === "empName" && canManage && canViewAll && (
                                <button
                                  type="button"
                                  onClick={(ev) => {
                                    ev.stopPropagation();
                                    setRenaming({ employeeId: r.employeeId, name: r.empName });
                                  }}
                                  onDoubleClick={(ev) => ev.stopPropagation()}
                                  onKeyDown={(ev) => ev.stopPropagation()}
                                  className="ml-1 inline-flex align-middle p-0.5 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 cursor-pointer"
                                  title={`Rename ${r.empName} (${r.employeeId}); the emp code stays the same`}
                                  aria-label={`Rename employee ${r.empName}`}
                                >
                                  <Pencil className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                            {isEditing && cellEdit && (
                              <CellEditor
                                editor={c.editor}
                                draft={cellEdit.draft}
                                error={cellEdit.error}
                                choices={columnChoices(c.key)}
                                listId={`login-sheet-${c.key}-list`}
                                alignRight={ci >= SHEET_COLUMNS.length / 2}
                                ariaLabel={`${c.label} for ${r.customerName} at ${r.bankName}`}
                                onDraft={(v) => setEdit({ ...cellEdit, draft: v, error: null })}
                                onCommit={(move) => commitEdit(move)}
                                onPick={(v) => commitEdit("none", v)}
                                onCancel={cancelEdit}
                                onBlur={() => commitEdit("blur", undefined, { id: r.id, col: ci })}
                              />
                            )}
                          </td>
                        );
                      })}
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

      {/* Suggestions for the cells that take free text. */}
      <datalist id="login-sheet-bankName-list">
        {bankSuggestions.map((b) => (
          <option key={b} value={b} />
        ))}
      </datalist>
      <datalist id="login-sheet-dsaName-list">
        {options.dsas.map((d) => (
          <option key={d} value={d} />
        ))}
      </datalist>
      <datalist id="login-sheet-file-list">
        {distinct([...LOGIN_SHEET_FILE_OPTIONS, ...options.files.filter((f) => f !== FILE_BLANKS)]).map((f) => (
          <option key={f} value={f} />
        ))}
      </datalist>
      <datalist id="login-sheet-product-list">
        {distinct([...LOGIN_SHEET_PRODUCTS, ...options.products]).map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>

      <RenameEmployeeModal
        employee={renaming}
        people={employees}
        onClose={() => setRenaming(null)}
        onMerged={(tempId, target, rows) => {
          setEntries((list) => list.map((e) => (e.employeeId === tempId ? { ...e, employeeId: target.employeeId, empName: target.name } : e)));
          setEmployees((list) => list.filter((e) => e.employeeId !== tempId));
          setRenaming(null);
          setNotice(`${tempId} was merged into ${target.name} (${target.employeeId}). ${rows} Login Sheet ${rows === 1 ? "row" : "rows"} moved.`);
          loadEntries();
        }}
        onRenamed={(employeeId, name, rows) => {
          setEntries((list) => list.map((e) => (e.employeeId === employeeId ? { ...e, empName: name } : e)));
          setEmployees((list) =>
            list.map((e) => (e.employeeId === employeeId ? { ...e, name } : e)).sort((a, b) => a.name.localeCompare(b.name))
          );
          setRenaming(null);
          setNotice(`${employeeId} is now ${name}. ${rows} ${rows === 1 ? "row" : "rows"} updated.`);
        }}
      />

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
