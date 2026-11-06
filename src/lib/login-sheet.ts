import { BRANCHES, type Branch, type LoginSheetEntry } from "@/lib/types";

/**
 * Pure helpers for the Login Sheet (the daily Excel-style file tracker).
 * No database or framework imports, so they run on both server and client and stay unit-testable.
 */

export const LOGIN_SHEET_STATUSES = ["SENT", "LOGIN", "APPROVED", "DISBURSED", "REJECT"] as const;
/** The File column: one choice per customer, the same for every bank the file went to. Blank is allowed. */
export const LOGIN_SHEET_FILE_OPTIONS = ["BACKEND", "PENDING", "RE LOOK"] as const;
export const LOGIN_SHEET_PRODUCTS = ["PL", "BL", "HL", "LAP", "CAR LOAN", "CC", "OD"] as const;

/** The columns of the Excel sheet, in order. Used for the table header and the export. */
export const LOGIN_SHEET_COLUMNS = [
  "Customer Name",
  "PAN No.",
  "Number",
  "Location",
  "Date",
  "Emp Name",
  "Bank Name",
  "DSA Name",
  "Login ID",
  "Product",
  "Branch",
  "File",
  "Amount",
  "Time",
  "Status",
  "Remarks 1",
  "Insurance Details",
  "Amount 2",
] as const;

export const MAX_ENTRIES_PER_REQUEST = 25;

/** What a caller may send for one row. Server-controlled fields (id, owner, timestamps) are not part of it. */
export type LoginSheetInput = Pick<
  LoginSheetEntry,
  | "customerName"
  | "panNo"
  | "phone"
  | "location"
  | "date"
  | "time"
  | "bankName"
  | "dsaName"
  | "loginId"
  | "product"
  | "branch"
  | "file"
  | "amount"
  | "status"
  | "remarks"
  | "insuranceDetails"
  | "amount2"
>;

export type NormalizeResult = { ok: true; value: LoginSheetInput } | { ok: false; error: string };

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function text(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

function upper(v: unknown, max: number): string {
  return text(v, max).toUpperCase();
}

function isRealDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function money(v: unknown): number | null {
  if (v === "" || v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}

/** Cleans and validates one row as typed in the sheet. Names/codes are stored upper-case, like the Excel sheet. */
export function normalizeEntryInput(raw: unknown): NormalizeResult {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Invalid entry." };
  const r = raw as Record<string, unknown>;

  const customerName = upper(r.customerName, 120);
  if (!customerName) return { ok: false, error: "Customer name is required." };

  const bankName = upper(r.bankName, 80);
  if (!bankName) return { ok: false, error: `Bank name is required (customer ${customerName}).` };

  const status = upper(r.status, 40);
  if (!status) return { ok: false, error: `Status is required (customer ${customerName}).` };

  const date = text(r.date, 10);
  if (!isRealDate(date)) return { ok: false, error: "Date must be a valid date (YYYY-MM-DD)." };

  const timeRaw = text(r.time, 5);
  if (timeRaw && !TIME_RE.test(timeRaw)) return { ok: false, error: "Time must be in HH:mm format." };

  const panNo = upper(r.panNo, 10).replace(/\s/g, "");
  if (panNo && !PAN_RE.test(panNo)) return { ok: false, error: `PAN "${panNo}" is not valid (expected format ABCDE1234F).` };

  let phone = typeof r.phone === "string" || typeof r.phone === "number" ? String(r.phone).replace(/\D/g, "") : "";
  if (phone.length === 12 && phone.startsWith("91")) phone = phone.slice(2);
  if (phone && phone.length !== 10) return { ok: false, error: "Mobile number must be 10 digits." };

  const amount = money(r.amount);
  if (amount === null) return { ok: false, error: "Amount is required." };
  if (Number.isNaN(amount)) return { ok: false, error: "Amount must be a positive number." };

  const amount2 = money(r.amount2);
  if (amount2 !== null && Number.isNaN(amount2)) return { ok: false, error: "Amount 2 must be a positive number." };

  let branch: Branch | undefined;
  const branchRaw = text(r.branch, 20);
  if (branchRaw) {
    branch = BRANCHES.find((b) => b.toLowerCase() === branchRaw.toLowerCase());
    if (!branch) return { ok: false, error: `Branch must be one of: ${BRANCHES.join(", ")}.` };
  }

  const value: LoginSheetInput = {
    customerName,
    date,
    bankName,
    status,
    amount,
  };
  if (panNo) value.panNo = panNo;
  if (phone) value.phone = phone;
  if (timeRaw) value.time = timeRaw;
  if (branch) value.branch = branch;
  if (amount2 !== null) value.amount2 = amount2;
  for (const [key, max] of [
    ["location", 80],
    ["dsaName", 80],
    ["loginId", 60],
    ["product", 40],
    ["file", 60],
  ] as const) {
    const v = upper(r[key], max);
    if (v) value[key] = v;
  }
  for (const [key, max] of [
    ["remarks", 300],
    ["insuranceDetails", 200],
  ] as const) {
    const v = text(r[key], max);
    if (v) value[key] = v;
  }
  return { ok: true, value };
}

// ----------------------------- Filters -----------------------------

export interface LoginSheetFilters {
  search: string;
  dateFrom: string; // "" = open
  dateTo: string; // "" = open
  employeeId: string; // "" = anyone
  branch: string;
  bank: string;
  dsa: string;
  product: string;
  /** Any of these statuses; empty = all. */
  status: string[];
}

export const EMPTY_LOGIN_SHEET_FILTERS: LoginSheetFilters = {
  search: "",
  dateFrom: "",
  dateTo: "",
  employeeId: "",
  branch: "",
  bank: "",
  dsa: "",
  product: "",
  status: [],
};

/** Number of dropdown/date filters that are narrowing the list (the search box is not counted). */
export function activeSheetFilterCount(f: LoginSheetFilters): number {
  return [f.dateFrom, f.dateTo, f.employeeId, f.branch, f.bank, f.dsa, f.product, f.status.length > 0 ? "x" : ""].filter(Boolean).length;
}

export function filterLoginSheet(entries: LoginSheetEntry[], f: LoginSheetFilters): LoginSheetEntry[] {
  const q = f.search.trim().toLowerCase();
  return entries.filter((e) => {
    if (q) {
      const hay = [e.customerName, e.panNo, e.phone, e.loginId, e.empName, e.employeeId, e.file, e.location, e.remarks]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (f.dateFrom && e.date < f.dateFrom) return false;
    if (f.dateTo && e.date > f.dateTo) return false;
    if (f.employeeId && e.employeeId !== f.employeeId) return false;
    if (f.branch && e.branch !== f.branch) return false;
    if (f.bank && e.bankName !== f.bank) return false;
    if (f.dsa && e.dsaName !== f.dsa) return false;
    if (f.product && e.product !== f.product) return false;
    if (f.status.length > 0 && !f.status.includes(e.status)) return false;
    return true;
  });
}

/** Newest first: by date, then time, then creation order. */
export function sortLoginSheet(entries: LoginSheetEntry[]): LoginSheetEntry[] {
  return [...entries].sort(
    (a, b) =>
      b.date.localeCompare(a.date) ||
      (b.time || "").localeCompare(a.time || "") ||
      (b.createdAt || "").localeCompare(a.createdAt || "")
  );
}

/**
 * Identifies a customer across rows: the same person sent to many banks is one customer.
 * Name plus mobile number (PAN only when there is no number), so a PAN typed differently
 * on one bank's row does not turn one customer into two.
 */
export function customerKey(e: Pick<LoginSheetEntry, "panNo" | "phone" | "customerName">): string {
  return `${e.customerName.trim().toUpperCase()}|${e.phone || e.panNo || ""}`;
}

export interface LoginSheetSummary {
  files: number;
  customers: number;
  totalAmount: number;
  totalAmount2: number;
  byStatus: Record<string, number>;
}

export function summarizeLoginSheet(entries: LoginSheetEntry[]): LoginSheetSummary {
  const byStatus: Record<string, number> = {};
  let totalAmount = 0;
  let totalAmount2 = 0;
  const customers = new Set<string>();
  for (const e of entries) {
    byStatus[e.status] = (byStatus[e.status] || 0) + 1;
    totalAmount += e.amount || 0;
    totalAmount2 += e.amount2 || 0;
    customers.add(customerKey(e));
  }
  return { files: entries.length, customers: customers.size, totalAmount, totalAmount2, byStatus };
}

// ----------------------------- Export -----------------------------

function csvCell(v: string | number | undefined): string {
  const s = v === undefined || v === null ? "" : String(v);
  // Cells starting with = + - @ would be run as formulas when opened in Excel.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** The sheet as CSV (opens in Excel), columns in the same order as the on-screen table. */
export function loginSheetToCsv(entries: LoginSheetEntry[]): string {
  const rows = entries.map((e) =>
    [
      e.customerName,
      e.panNo,
      e.phone,
      e.location,
      e.date,
      e.empName,
      e.bankName,
      e.dsaName,
      e.loginId,
      e.product,
      e.branch,
      e.file,
      e.amount,
      e.time,
      e.status,
      e.remarks,
      e.insuranceDetails,
      e.amount2,
    ]
      .map(csvCell)
      .join(",")
  );
  return [LOGIN_SHEET_COLUMNS.join(","), ...rows].join("\r\n");
}
