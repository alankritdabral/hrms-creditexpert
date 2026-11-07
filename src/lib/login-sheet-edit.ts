import { LOGIN_SHEET_COLUMNS, normalizeEntryInput, type LoginSheetInput } from "@/lib/login-sheet";
import type { LoginSheetEntry } from "@/lib/types";

/**
 * Pure helpers behind the Excel-style cell editing on the Login Sheet.
 * A cell edit is validated with the same normalizeEntryInput the API uses, so what the sheet
 * accepts on screen is exactly what the server will accept.
 */

export type SheetColumnKey =
  | "customerName"
  | "panNo"
  | "phone"
  | "location"
  | "date"
  | "empName"
  | "bankName"
  | "dsaName"
  | "loginId"
  | "product"
  | "branch"
  | "file"
  | "amount"
  | "time"
  | "status"
  | "remarks"
  | "insuranceDetails"
  | "amount2";

/**
 * How a cell is edited:
 * text/date/time/amount: a text box; suggest: a text box with a list of known values;
 * select: a fixed list (opens as a dropdown).
 */
export type CellEditor = "text" | "date" | "time" | "amount" | "suggest" | "select";

export interface SheetColumn {
  key: SheetColumnKey;
  label: (typeof LOGIN_SHEET_COLUMNS)[number];
  editor: CellEditor;
}

/** Same order as LOGIN_SHEET_COLUMNS (the table header). */
export const SHEET_COLUMNS: readonly SheetColumn[] = [
  { key: "customerName", label: "Customer Name", editor: "text" },
  { key: "panNo", label: "PAN No.", editor: "text" },
  { key: "phone", label: "Number", editor: "text" },
  { key: "location", label: "Location", editor: "text" },
  { key: "date", label: "Date", editor: "date" },
  { key: "empName", label: "Emp Name", editor: "select" },
  { key: "bankName", label: "Bank Name", editor: "suggest" },
  { key: "dsaName", label: "DSA Name", editor: "suggest" },
  { key: "loginId", label: "Login ID", editor: "text" },
  { key: "product", label: "Product", editor: "suggest" },
  { key: "branch", label: "Branch", editor: "select" },
  { key: "file", label: "File", editor: "select" },
  { key: "amount", label: "Amount", editor: "amount" },
  { key: "time", label: "Time", editor: "time" },
  { key: "status", label: "Status", editor: "select" },
  { key: "remarks", label: "Remarks 1", editor: "text" },
  { key: "insuranceDetails", label: "Insurance Details", editor: "text" },
  { key: "amount2", label: "Amount 2", editor: "amount" },
];

/** dd-mm-yyyy, as shown in the sheet. */
export function formatSheetDate(d: string): string {
  const [y, m, day] = d.split("-");
  return y && m && day ? `${day}-${m}-${y}` : d;
}

/** Accepts dd-mm-yyyy, dd/mm/yyyy or dd.mm.yyyy (what people type or paste from Excel) and returns yyyy-mm-dd. Anything else is returned as typed. */
export function parseLooseDate(s: string): string {
  const t = s.trim();
  const m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(t);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : t;
}

/** Accepts 9:30, 9.30, 09:30 and 9:30:00 and returns HH:mm. Anything else is returned as typed. */
export function parseLooseTime(s: string): string {
  const t = s.trim();
  const m = /^(\d{1,2})[:.](\d{2})(?::\d{2})?$/.exec(t);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : t;
}

/** The text a cell shows when it is opened for editing (and what is copied from it). */
export function cellDraft(row: LoginSheetEntry, key: SheetColumnKey): string {
  switch (key) {
    case "date":
      return formatSheetDate(row.date);
    case "empName":
      return row.employeeId; // the owner is picked by id
    case "amount":
    case "amount2": {
      const n = row[key];
      return n === undefined ? "" : String(n);
    }
    default:
      return row[key] ?? "";
  }
}

/** The text that is copied out of a cell: what the sheet shows. */
export function cellCopyText(row: LoginSheetEntry, key: SheetColumnKey): string {
  return key === "empName" ? row.empName : cellDraft(row, key);
}

export interface OwnerChoice {
  employeeId: string;
  name: string;
}

export type EditOutcome =
  | { ok: true; value: LoginSheetInput; owner: { employeeId: string; empName: string } | null }
  | { ok: false; error: string };

/**
 * Applies typed values to a row and validates the whole row. `edits` holds the raw text per column;
 * the owner (Emp Name) is matched by employee id or by name among `owners`.
 */
export function applyEdits(row: LoginSheetEntry, edits: Partial<Record<SheetColumnKey, string>>, owners: OwnerChoice[]): EditOutcome {
  const candidate: Record<string, unknown> = { ...row };
  let owner: { employeeId: string; empName: string } | null = null;

  for (const [k, raw] of Object.entries(edits) as [SheetColumnKey, string][]) {
    if (k === "empName") {
      const q = raw.trim().toLowerCase();
      const match = owners.find((o) => o.employeeId.toLowerCase() === q) ?? owners.find((o) => o.name.toLowerCase() === q);
      if (!match) return { ok: false, error: `"${raw.trim()}" is not an employee you can assign rows to.` };
      if (match.employeeId !== row.employeeId) owner = { employeeId: match.employeeId, empName: match.name };
      continue;
    }
    candidate[k] = k === "date" ? parseLooseDate(raw) : k === "time" ? parseLooseTime(raw) : raw;
  }

  const r = normalizeEntryInput(candidate);
  if (!r.ok) return r;
  return { ok: true, value: r.value, owner };
}

const INPUT_KEYS = [
  "customerName",
  "panNo",
  "phone",
  "location",
  "date",
  "time",
  "bankName",
  "dsaName",
  "loginId",
  "product",
  "branch",
  "file",
  "amount",
  "status",
  "remarks",
  "insuranceDetails",
  "amount2",
] as const;

export type RowPatch = Partial<Record<keyof LoginSheetEntry, unknown>>;

/** What an edit changes in a row, and how to undo it. Null when nothing changed. A cleared optional field is `undefined`. */
export function diffRow(
  row: LoginSheetEntry,
  value: LoginSheetInput,
  owner: { employeeId: string; empName: string } | null
): { patch: RowPatch; inverse: RowPatch } | null {
  const patch: RowPatch = {};
  const inverse: RowPatch = {};
  for (const key of INPUT_KEYS) {
    if (value[key] !== row[key]) {
      patch[key] = value[key];
      inverse[key] = row[key];
    }
  }
  if (owner && owner.employeeId !== row.employeeId) {
    patch.employeeId = owner.employeeId;
    patch.empName = owner.empName;
    inverse.employeeId = row.employeeId;
    inverse.empName = row.empName;
  }
  return Object.keys(patch).length > 0 ? { patch, inverse } : null;
}

/** Returns the row with the patch applied; an `undefined` value removes the field. */
export function applyPatch(row: LoginSheetEntry, patch: RowPatch): LoginSheetEntry {
  const next: Record<string, unknown> = { ...row };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete next[k];
    else next[k] = v;
  }
  return next as unknown as LoginSheetEntry;
}
