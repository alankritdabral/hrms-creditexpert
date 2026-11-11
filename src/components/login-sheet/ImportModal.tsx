"use client";

import React, { useMemo, useRef, useState } from "react";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { MAX_ENTRIES_PER_REQUEST, type LoginSheetInput } from "@/lib/login-sheet";
import { duplicateKey, parseSheetRows, type ImportRow } from "@/lib/login-sheet-import";
import { entriesToXlsx, xlsxToGrid } from "@/lib/login-sheet-excel";
import { findSimilarEmployees, nameSimilarity } from "@/lib/name-match";
import { downloadBlob, XLSX_MIME } from "@/lib/download";
import type { LoginSheetEntry } from "@/lib/types";
import type { SheetEmployee } from "@/components/login-sheet/EntryFormModal";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Whether the user may import rows for other employees (matched by the EMP NAME column). */
  canPickEmployee: boolean;
  self: SheetEmployee;
  employees: SheetEmployee[];
  /** Rows already loaded on the page, used to skip duplicates. */
  existing: LoginSheetEntry[];
  onImported: (dates: string[], count: number, skipped: number) => void;
}

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** Choice for a name in the sheet that matches no employee: create a temporary one (the default) or use this employee. */
const TEMP = "__temp__";

interface PlannedRow {
  row: ImportRow;
  employeeId?: string;
  /** Set when the name matches nobody and a temporary employee will be created for it. */
  tempName?: string;
  problem?: string;
  duplicate?: boolean;
}

/** Every saved row dated between the earliest and latest date in the file, fetched in windows the API accepts. Best effort: the server skips duplicates again when saving. */
async function fetchStoredRows(dates: string[]): Promise<LoginSheetEntry[]> {
  if (dates.length === 0) return [];
  const sorted = [...dates].sort();
  const DAY = 86400000;
  const out: LoginSheetEntry[] = [];
  try {
    for (let from = Date.parse(`${sorted[0]}T00:00:00Z`); from <= Date.parse(`${sorted[sorted.length - 1]}T00:00:00Z`); from += 360 * DAY) {
      const to = Math.min(from + 359 * DAY, Date.parse(`${sorted[sorted.length - 1]}T00:00:00Z`));
      const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
      const json = await (await fetch(`/api/login-sheet?from=${iso(from)}&to=${iso(to)}`)).json();
      if (json.success && Array.isArray(json.data)) out.push(...json.data);
    }
  } catch {
    /* the server still skips duplicates */
  }
  return out;
}

/** Who a batch of rows goes to: an employee ID, or a typed name that becomes a temporary employee. */
const groupKey = (p: { employeeId?: string; tempName?: string }) => (p.employeeId ? `id:${p.employeeId}` : `tmp:${norm(p.tempName || "")}`);

interface UnmatchedName {
  key: string;
  name: string;
  rows: number;
  similar: { employeeId: string; name: string }[];
}

export function ImportModal({ isOpen, onClose, canPickEmployee, self, employees, existing, onImported }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ImportRow[] | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** What to do with each sheet name that matches no employee, by normalised name. */
  const [choices, setChoices] = useState<Record<string, string>>({});
  /** Rows already saved for the dates in the file. The page only holds one date range, so this is fetched per file. */
  const [stored, setStored] = useState<LoginSheetEntry[]>([]);

  /** The sheet as read from the file, kept so the date format can be switched without choosing the file again. */
  const gridRef = useRef<unknown[][] | null>(null);
  const [monthFirst, setMonthFirst] = useState(false);

  const reset = () => {
    gridRef.current = null;
    setStored([]);
    setChoices({});
    setFileName("");
    setParsed(null);
    setFatal(null);
    setProgress(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  };
  const close = () => {
    if (progress) return; // an import is running
    reset();
    onClose();
  };

  const plan: PlannedRow[] = useMemo(() => {
    if (!parsed) return [];
    // A name matches an employee when it is the same ignoring case, spacing, titles and word order.
    const matchEmployee = (name: string) => employees.find((e) => norm(e.name) === norm(name) || nameSimilarity(e.name, name) === 1)?.employeeId;
    const seen = new Set([...existing, ...stored].map((e) => `${e.employeeId}|${duplicateKey(e)}`));
    return parsed.map((row) => {
      if (row.error || !row.input) return { row, problem: row.error };
      let employeeId = self.employeeId;
      if (canPickEmployee && row.empName) {
        const match = matchEmployee(row.empName);
        if (match) employeeId = match;
        else {
          const choice = choices[norm(row.empName)] ?? TEMP;
          if (choice === TEMP) {
            // Not an employee yet: a temporary one is created, to be attached to the real person later.
            const tempKey = `tmp:${norm(row.empName)}|${duplicateKey(row.input)}`;
            if (seen.has(tempKey)) return { row, tempName: row.empName, duplicate: true };
            seen.add(tempKey);
            return { row, tempName: row.empName };
          }
          employeeId = choice;
        }
      }
      const key = `${employeeId}|${duplicateKey(row.input)}`;
      if (seen.has(key)) return { row, employeeId, duplicate: true };
      seen.add(key);
      return { row, employeeId };
    });
  }, [parsed, employees, existing, stored, self.employeeId, canPickEmployee, choices]);

  // Sheet names that match no employee, with the registered people they look like.
  const unmatched: UnmatchedName[] = useMemo(() => {
    if (!parsed || !canPickEmployee) return [];
    const map = new Map<string, UnmatchedName>();
    for (const row of parsed) {
      if (row.error || !row.input || !row.empName) continue;
      if (employees.some((e) => norm(e.name) === norm(row.empName) || nameSimilarity(e.name, row.empName) === 1)) continue;
      const key = norm(row.empName);
      const found = map.get(key);
      if (found) found.rows += 1;
      else map.set(key, { key, name: row.empName, rows: 1, similar: findSimilarEmployees(row.empName, employees).map((m) => m.employee) });
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [parsed, canPickEmployee, employees]);

  const ready = plan.filter((p) => (p.employeeId || p.tempName) && !p.problem && !p.duplicate);
  const problems = plan.filter((p) => p.problem);
  const duplicates = plan.filter((p) => p.duplicate);
  const renamed = !canPickEmployee && parsed ? parsed.filter((r) => r.empName && norm(r.empName) !== norm(self.name)).length : 0;

  const applyGrid = async (grid: unknown[][], mf: boolean) => {
    const result = parseSheetRows(grid, { monthFirst: mf });
    if (result.fatal) {
      setFatal(result.fatal);
      setParsed(null);
    } else {
      setFatal(null);
      setStored(await fetchStoredRows(result.rows.flatMap((r) => (r.input ? [r.input.date] : []))));
      setParsed(result.rows);
      setChoices({});
    }
  };

  const onMonthFirst = async (mf: boolean) => {
    setMonthFirst(mf);
    if (!gridRef.current) return;
    setReading(true);
    try {
      await applyGrid(gridRef.current, mf);
    } finally {
      setReading(false);
    }
  };

  const onFile = async (file: File | undefined) => {
    reset();
    if (!file) return;
    if (!/\.xlsx$/i.test(file.name)) {
      setFatal("Please choose an .xlsx file. In Excel, use File → Save As → Excel Workbook (.xlsx).");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setFatal("That file is larger than 5 MB.");
      return;
    }
    setFileName(file.name);
    setReading(true);
    try {
      const grid = await xlsxToGrid(await file.arrayBuffer());
      gridRef.current = grid;
      await applyGrid(grid, monthFirst);
    } catch {
      setFatal("Could not read that file. Make sure it is a valid .xlsx workbook.");
    } finally {
      setReading(false);
    }
  };

  const downloadTemplate = async () => {
    downloadBlob(new Blob([await entriesToXlsx([])], { type: XLSX_MIME }), "login-sheet-template.xlsx");
  };

  const runImport = async () => {
    setError(null);
    // One request per employee, in chunks the server accepts.
    const groups = new Map<string, { employeeId?: string; tempName?: string; rows: LoginSheetInput[] }>();
    for (const p of ready) {
      const k = groupKey(p);
      const g = groups.get(k) ?? { employeeId: p.employeeId, tempName: p.tempName, rows: [] };
      g.rows.push(p.row.input!);
      groups.set(k, g);
    }
    const total = ready.length;
    let done = 0;
    let skipped = 0;
    const dates: string[] = [];
    setProgress({ done, total });
    try {
      for (const group of groups.values()) {
        // For a temporary employee the first request creates it; later requests reuse the ID it returns.
        let employeeId = group.employeeId;
        for (let i = 0; i < group.rows.length; i += MAX_ENTRIES_PER_REQUEST) {
          const chunk = group.rows.slice(i, i + MAX_ENTRIES_PER_REQUEST);
          const res = await fetch("/api/login-sheet", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              employeeId ? { employeeId, entries: chunk, skipDuplicates: true } : { newEmployeeName: group.tempName, entries: chunk, skipDuplicates: true }
            ),
          });
          const json = await res.json();
          if (!json.success) throw new Error(json.error || "The server rejected some rows.");
          if (!employeeId && json.data?.[0]?.employeeId) employeeId = json.data[0].employeeId;
          const skippedHere = Number(json.skipped) || 0;
          skipped += skippedHere;
          done += chunk.length - skippedHere;
          dates.push(...chunk.map((c) => c.date));
          setProgress({ done, total });
        }
      }
      onImported(dates, done, skipped);
      reset();
      onClose();
    } catch (e: any) {
      setProgress(null);
      setError(
        `${e?.message || "Import failed."}${done > 0 ? ` ${done} of ${total} rows were already saved before this happened; they were not rolled back.` : " Nothing was saved."}`
      );
      if (done > 0) onImported(dates, done, skipped);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      title="Import from Excel"
      subtitle="Upload an .xlsx file with the Login Sheet columns. Rows are checked first; nothing is saved until you confirm."
      maxWidth="3xl"
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            id="login-sheet-file"
            onChange={(e) => onFile(e.target.files?.[0])}
            disabled={Boolean(progress)}
          />
          <Button type="button" size="sm" onClick={() => fileRef.current?.click()} disabled={Boolean(progress) || reading} icon={<Upload className="w-4 h-4" />}>
            {parsed ? "Choose another file" : "Choose Excel file"}
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={downloadTemplate} icon={<Download className="w-4 h-4" />}>
            Download template
          </Button>
          {fileName && (
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-600">
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" /> {fileName}
            </span>
          )}
        </div>

        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" checked={monthFirst} disabled={Boolean(progress) || reading} onChange={(e) => onMonthFirst(e.target.checked)} />
          Dates typed as text are MM/DD/YYYY (month first). Leave off for DD/MM/YYYY. Real Excel dates are always read correctly.
        </label>

        {reading && <div className="text-xs text-slate-500">Reading the file…</div>}
        {fatal && (
          <div role="alert" className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-2.5">
            {fatal}
          </div>
        )}

        {parsed && (
          <>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
                <div className="text-xl font-bold text-emerald-800 font-mono">{ready.length}</div>
                <div className="text-[11px] text-emerald-700">ready to import</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-xl font-bold text-slate-700 font-mono">{duplicates.length}</div>
                <div className="text-[11px] text-slate-500">duplicates, skipped</div>
              </div>
              <div className={`rounded-xl border p-3 ${problems.length ? "border-rose-200 bg-rose-50/60" : "border-slate-200 bg-slate-50"}`}>
                <div className={`text-xl font-bold font-mono ${problems.length ? "text-rose-700" : "text-slate-700"}`}>{problems.length}</div>
                <div className={`text-[11px] ${problems.length ? "text-rose-600" : "text-slate-500"}`}>with problems, skipped</div>
              </div>
            </div>

            {renamed > 0 && (
              <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-2.5">
                {renamed} {renamed === 1 ? "row names" : "rows name"} a different employee. All rows are added under your name ({self.name}).
              </div>
            )}

            {unmatched.length > 0 && (
              <div className="rounded-xl border border-amber-200 overflow-hidden">
                <div className="px-3 py-2 bg-amber-50 text-xs text-amber-900">
                  <span className="font-bold">{unmatched.length} {unmatched.length === 1 ? "name is" : "names are"} not in the employee list.</span>{" "}
                  They are added as temporary employees you can attach to the registered person later, or choose an existing employee here.
                </div>
                <ul className="max-h-48 overflow-y-auto divide-y divide-amber-100 text-xs">
                  {unmatched.map((u) => (
                    <li key={u.key} className="px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-slate-800 truncate">{u.name}</div>
                        <div className="text-[11px] text-slate-500">
                          {u.rows} {u.rows === 1 ? "row" : "rows"}
                          {u.similar.length > 0 && (
                            <span className="text-amber-700 font-medium">
                              {" "}
                              · looks like {u.similar.map((m) => `${m.name} (${m.employeeId})`).join(", ")}
                            </span>
                          )}
                        </div>
                      </div>
                      <select
                        className="text-xs rounded-lg border border-slate-200 bg-white px-2 py-1.5 max-w-[16rem] text-slate-900"
                        value={choices[u.key] ?? TEMP}
                        onChange={(e) => setChoices((c) => ({ ...c, [u.key]: e.target.value }))}
                        aria-label={`What to do with ${u.name}`}
                      >
                        <option value={TEMP}>Create temporary employee</option>
                        {u.similar.length > 0 && (
                          <optgroup label="Looks like">
                            {u.similar.map((m) => (
                              <option key={`s-${m.employeeId}`} value={m.employeeId}>
                                Attach to {m.name} ({m.employeeId})
                              </option>
                            ))}
                          </optgroup>
                        )}
                        <optgroup label="Attach to another employee">
                          {employees.map((e) => (
                            <option key={e.employeeId} value={e.employeeId}>
                              {e.name} ({e.employeeId})
                            </option>
                          ))}
                        </optgroup>
                      </select>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {problems.length > 0 && (
              <div className="rounded-xl border border-rose-200 overflow-hidden">
                <div className="px-3 py-2 bg-rose-50 text-xs font-bold text-rose-800">Fix these in Excel and import again</div>
                <ul className="max-h-40 overflow-y-auto divide-y divide-rose-100 text-xs">
                  {problems.slice(0, 100).map((p) => (
                    <li key={p.row.line} className="px-3 py-1.5 flex gap-3">
                      <span className="font-mono text-slate-500 shrink-0">Row {p.row.line}</span>
                      <span className="text-rose-700">{p.problem}</span>
                    </li>
                  ))}
                  {problems.length > 100 && <li className="px-3 py-1.5 text-slate-500">…and {problems.length - 100} more</li>}
                </ul>
              </div>
            )}

            {ready.length > 0 && (
              <div className="rounded-xl border border-slate-200 overflow-auto max-h-48">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] sticky top-0">
                    <tr>
                      <th className="py-2 px-3">Customer</th>
                      <th className="py-2 px-3">Date</th>
                      <th className="py-2 px-3">Bank</th>
                      <th className="py-2 px-3">Status</th>
                      <th className="py-2 px-3 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {ready.slice(0, 8).map((p) => (
                      <tr key={p.row.line}>
                        <td className="py-1.5 px-3 font-medium">{p.row.input!.customerName}</td>
                        <td className="py-1.5 px-3 font-mono">{p.row.input!.date}</td>
                        <td className="py-1.5 px-3">{p.row.input!.bankName}</td>
                        <td className="py-1.5 px-3">{p.row.input!.status}</td>
                        <td className="py-1.5 px-3 text-right font-mono">{p.row.input!.amount.toLocaleString("en-IN")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {ready.length > 8 && <div className="px-3 py-1.5 text-[11px] text-slate-500 bg-slate-50">…and {ready.length - 8} more</div>}
              </div>
            )}
          </>
        )}

        {error && (
          <div role="alert" className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-2.5">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          {progress && (
            <span className="text-xs text-slate-500 mr-auto">
              Importing {progress.done} of {progress.total}…
            </span>
          )}
          <Button type="button" variant="ghost" onClick={close} disabled={Boolean(progress)}>
            Cancel
          </Button>
          <Button type="button" onClick={runImport} disabled={ready.length === 0 || Boolean(progress)} isLoading={Boolean(progress)}>
            {ready.length > 0 ? `Import ${ready.length} ${ready.length === 1 ? "row" : "rows"}` : "Import"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
