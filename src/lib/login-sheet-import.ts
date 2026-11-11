import { normalizeEntryInput, type LoginSheetInput } from "@/lib/login-sheet";
import type { LoginSheetEntry } from "@/lib/types";

/**
 * Turns the cells of an uploaded Excel sheet into Login Sheet rows. Pure (no Excel library, no I/O):
 * the caller hands over a grid of cell values, so this is easy to test and runs in the browser.
 */

const FIELD_ALIASES = {
  customerName: ["customername", "customer", "clientname", "name"],
  panNo: ["panno", "pan", "pannumber"],
  phone: ["number", "mobile", "mobileno", "mobilenumber", "phone", "phoneno", "contact"],
  location: ["location", "city"],
  date: ["date"],
  empName: ["empname", "employeename", "employee"],
  bankName: ["bankname", "bank"],
  dsaName: ["dsaname", "dsa"],
  loginId: ["loginid"],
  product: ["product"],
  branch: ["branch"],
  file: ["file", "fileno"],
  amount: ["amount", "amount1", "loanamount"],
  time: ["time"],
  status: ["status"],
  remarks: ["remarks1", "remarks", "remark"],
  insuranceDetails: ["insurancedetails", "insurance"],
  amount2: ["amount2"],
} as const;

type Field = keyof typeof FIELD_ALIASES;

export const MAX_IMPORT_ROWS = 2000;

export interface ImportRow {
  /** Row number in the Excel sheet (1-based), for error messages. */
  line: number;
  /** Employee name written in the sheet's EMP NAME column. */
  empName: string;
  input?: LoginSheetInput;
  error?: string;
}

export interface ParsedImport {
  rows: ImportRow[];
  fatal?: string;
}

const squash = (v: unknown) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Unwraps what Excel libraries return for formulas, rich text and hyperlinks. */
export function flattenCell(v: unknown): unknown {
  if (v === null || v === undefined) return "";
  if (v instanceof Date || typeof v !== "object") return v;
  const o = v as Record<string, unknown>;
  if ("result" in o) return flattenCell(o.result);
  if (Array.isArray(o.richText)) return o.richText.map((t) => (t as { text?: string }).text ?? "").join("");
  if ("text" in o) return flattenCell(o.text);
  if ("error" in o) return "";
  return "";
}

const pad = (n: number) => String(n).padStart(2, "0");
const isoDate = (y: number, m: number, d: number) => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null;
};

/** Excel dates arrive as Date objects, serial numbers or typed text (day first, as in India, unless monthFirst is set). */
export function parseSheetDate(v: unknown, monthFirst = false): { value: string } | { error: string } {
  if (v instanceof Date) {
    return Number.isNaN(v.getTime()) ? { error: "Date is not valid." } : { value: v.toISOString().slice(0, 10) };
  }
  if (typeof v === "number") {
    if (v < 1 || v > 80000) return { error: "Date is not valid." };
    return { value: new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000).toISOString().slice(0, 10) };
  }
  const s = String(v ?? "").trim();
  if (!s) return { error: "Date is required." };
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s);
  if (m) {
    const r = isoDate(+m[1], +m[2], +m[3]);
    return r ? { value: r } : { error: `Date "${s}" is not valid.` };
  }
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(s);
  if (m) {
    const year = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    const r = monthFirst ? isoDate(year, +m[1], +m[2]) : isoDate(year, +m[2], +m[1]);
    return r ? { value: r } : { error: `Date "${s}" is not valid.` };
  }
  return { error: `Date "${s}" is not valid (use ${monthFirst ? "MM-DD-YYYY" : "DD-MM-YYYY"}).` };
}

/** Excel times arrive as Date objects, a fraction of a day, or text such as "12:22" or "1:05 PM". Blank is allowed. */
export function parseSheetTime(v: unknown): { value: string } | { error: string } {
  if (v === "" || v === null || v === undefined) return { value: "" };
  if (v instanceof Date) {
    return Number.isNaN(v.getTime()) ? { error: "Time is not valid." } : { value: `${pad(v.getUTCHours())}:${pad(v.getUTCMinutes())}` };
  }
  if (typeof v === "number") {
    if (v < 0 || v >= 1) return { error: "Time is not valid." };
    const mins = Math.round(v * 1440) % 1440;
    return { value: `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}` };
  }
  const s = String(v).trim();
  if (!s) return { value: "" };
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?$/i.exec(s);
  if (m) {
    let h = +m[1];
    const min = +m[2];
    const ap = m[3]?.toLowerCase();
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
    if (h < 24 && min < 60) return { value: `${pad(h)}:${pad(min)}` };
  }
  return { error: `Time "${s}" is not valid (use HH:mm).` };
}

function cleanText(v: unknown): string {
  if (v instanceof Date) return "";
  if (typeof v === "number") return String(v);
  return String(v ?? "").trim();
}

function cleanAmount(v: unknown): string | number {
  if (typeof v === "number") return v;
  return String(v ?? "").replace(/[₹,\s]|rs\.?/gi, "");
}

/** Reads the header row and every data row below it. */
export function parseSheetRows(grid: unknown[][], opts: { monthFirst?: boolean } = {}): ParsedImport {
  // The header row is the first one (within the top 10) that names both a customer and a bank column.
  let headerIdx = -1;
  for (let i = 0; i < Math.min(grid.length, 10); i++) {
    const names = new Set((grid[i] || []).map(squash));
    const has = (f: Field) => FIELD_ALIASES[f].some((a) => names.has(a));
    if (has("customerName") && has("bankName")) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) {
    return { rows: [], fatal: "Could not find the header row. The sheet needs CUSTOMER NAME and BANK NAME columns." };
  }

  const colOf: Partial<Record<Field, number>> = {};
  (grid[headerIdx] || []).forEach((h, c) => {
    const key = squash(h);
    if (!key) return;
    for (const f of Object.keys(FIELD_ALIASES) as Field[]) {
      if (colOf[f] === undefined && (FIELD_ALIASES[f] as readonly string[]).includes(key)) colOf[f] = c;
    }
  });
  const missing = (["date", "status", "amount"] as Field[]).filter((f) => colOf[f] === undefined);
  if (missing.length) {
    return { rows: [], fatal: `The sheet is missing these columns: ${missing.map((m) => m.toUpperCase()).join(", ")}.` };
  }

  const cell = (row: unknown[], f: Field): unknown => (colOf[f] === undefined ? "" : flattenCell(row[colOf[f]!]));

  const rows: ImportRow[] = [];
  for (let i = headerIdx + 1; i < grid.length; i++) {
    const row = grid[i] || [];
    if (row.every((c) => cleanText(flattenCell(c)) === "")) continue; // blank line
    const line = i + 1;
    const empName = cleanText(cell(row, "empName"));

    const date = parseSheetDate(cell(row, "date"), opts.monthFirst);
    if ("error" in date) {
      rows.push({ line, empName, error: date.error });
      continue;
    }
    const time = parseSheetTime(cell(row, "time"));
    if ("error" in time) {
      rows.push({ line, empName, error: time.error });
      continue;
    }

    const result = normalizeEntryInput({
      customerName: cleanText(cell(row, "customerName")),
      panNo: cleanText(cell(row, "panNo")),
      phone: typeof cell(row, "phone") === "number" ? String(Math.round(cell(row, "phone") as number)) : cleanText(cell(row, "phone")),
      location: cleanText(cell(row, "location")),
      date: date.value,
      time: time.value,
      bankName: cleanText(cell(row, "bankName")),
      dsaName: cleanText(cell(row, "dsaName")),
      loginId: cleanText(cell(row, "loginId")),
      product: cleanText(cell(row, "product")),
      branch: cleanText(cell(row, "branch")),
      file: cleanText(cell(row, "file")),
      amount: cleanAmount(cell(row, "amount")),
      status: cleanText(cell(row, "status")),
      remarks: cleanText(cell(row, "remarks")),
      insuranceDetails: cleanText(cell(row, "insuranceDetails")),
      amount2: cleanAmount(cell(row, "amount2")),
    });
    rows.push(result.ok ? { line, empName, input: result.value } : { line, empName, error: result.error });
  }

  if (rows.length > MAX_IMPORT_ROWS) {
    return { rows: [], fatal: `The sheet has ${rows.length} rows; import at most ${MAX_IMPORT_ROWS} at a time.` };
  }
  return { rows };
}

/** Identifies the same file sent to the same bank on the same day, to avoid importing a sheet twice. */
export function duplicateKey(e: Pick<LoginSheetInput, "customerName" | "panNo" | "phone" | "bankName" | "date" | "loginId">): string {
  return [e.date, e.panNo || e.phone || e.customerName, e.bankName, e.loginId || ""].join("|").toUpperCase();
}
