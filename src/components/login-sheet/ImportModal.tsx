"use client";

import React, { useMemo, useRef, useState } from "react";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { MAX_ENTRIES_PER_REQUEST, type LoginSheetInput } from "@/lib/login-sheet";
import { duplicateKey, parseSheetRows, type ImportRow } from "@/lib/login-sheet-import";
import { entriesToXlsx, xlsxToGrid } from "@/lib/login-sheet-excel";
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
  onImported: (dates: string[], count: number) => void;
}

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

interface PlannedRow {
  row: ImportRow;
  employeeId?: string;
  problem?: string;
  duplicate?: boolean;
}

export function ImportModal({ isOpen, onClose, canPickEmployee, self, employees, existing, onImported }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ImportRow[] | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
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
    const byName = new Map(employees.map((e) => [norm(e.name), e.employeeId]));
    const seen = new Set(existing.map((e) => `${e.employeeId}|${duplicateKey(e)}`));
    return parsed.map((row) => {
      if (row.error || !row.input) return { row, problem: row.error };
      let employeeId = self.employeeId;
      if (canPickEmployee && row.empName) {
        const match = byName.get(norm(row.empName));
        if (!match) return { row, problem: `Employee "${row.empName}" was not found.` };
        employeeId = match;
      }
      const key = `${employeeId}|${duplicateKey(row.input)}`;
      if (seen.has(key)) return { row, employeeId, duplicate: true };
      seen.add(key);
      return { row, employeeId };
    });
  }, [parsed, employees, existing, self.employeeId, canPickEmployee]);

  const ready = plan.filter((p) => p.employeeId && !p.problem && !p.duplicate);
  const problems = plan.filter((p) => p.problem);
  const duplicates = plan.filter((p) => p.duplicate);
  const renamed = !canPickEmployee && parsed ? parsed.filter((r) => r.empName && norm(r.empName) !== norm(self.name)).length : 0;

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
      const result = parseSheetRows(await xlsxToGrid(await file.arrayBuffer()));
      if (result.fatal) setFatal(result.fatal);
      else setParsed(result.rows);
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
    const groups = new Map<string, LoginSheetInput[]>();
    for (const p of ready) {
      const list = groups.get(p.employeeId!) ?? [];
      list.push(p.row.input!);
      groups.set(p.employeeId!, list);
    }
    const total = ready.length;
    let done = 0;
    const dates: string[] = [];
    setProgress({ done, total });
    try {
      for (const [employeeId, rows] of groups) {
        for (let i = 0; i < rows.length; i += MAX_ENTRIES_PER_REQUEST) {
          const chunk = rows.slice(i, i + MAX_ENTRIES_PER_REQUEST);
          const res = await fetch("/api/login-sheet", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ employeeId, entries: chunk }),
          });
          const json = await res.json();
          if (!json.success) throw new Error(json.error || "The server rejected some rows.");
          done += chunk.length;
          dates.push(...chunk.map((c) => c.date));
          setProgress({ done, total });
        }
      }
      onImported(dates, done);
      reset();
      onClose();
    } catch (e: any) {
      setProgress(null);
      setError(
        `${e?.message || "Import failed."}${done > 0 ? ` ${done} of ${total} rows were already saved before this happened; they were not rolled back.` : " Nothing was saved."}`
      );
      if (done > 0) onImported(dates, done);
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
