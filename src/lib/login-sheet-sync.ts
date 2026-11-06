import { customerKey } from "@/lib/login-sheet";
import type { BankDisbursalBreakdown, CustomerDisbursalEntry, EmployeeLoginRecord, LoginSheetEntry } from "@/lib/types";

/**
 * Pulls Login Sheet rows into the monthly Logins & Disbursals record. Pure (no database access).
 *
 * Rules:
 *  - A customer counts as logged in once any of their rows is past SENT (link sent). Files Count = those
 *    customers, so one customer sent to five banks is one login, not five.
 *  - DISBURSED rows count as disbursed, using Amount 2 (the disbursed amount) and falling back to Amount.
 *  - Every row is listed under its bank as a customer case, so the bank breakdown and filters see it.
 *  - Sheet rows are added on top of anything entered by hand; they are read-only and never saved into the record.
 */

export const SHEET_SOURCE = "login-sheet" as const;
const SHEET_BANK_PREFIX = "sheet-bank-";

export function isSheetCustomer(c: CustomerDisbursalEntry): boolean {
  return c.source === SHEET_SOURCE;
}

/** Sheet status text (SENT, LOGIN, APPROVED, DISBURSED, REJECT, ...) as a customer-case status. */
export function toCustomerStatus(sheetStatus: string): CustomerDisbursalEntry["status"] {
  const s = sheetStatus.trim().toUpperCase();
  if (s.startsWith("DISBURS")) return "Disbursed";
  if (s.startsWith("APPROV") || s.startsWith("SANCTION")) return "Sanctioned";
  if (s.startsWith("REJECT") || s.startsWith("DECLIN") || s === "CANCELLED" || s === "CANCELED") return "Rejected";
  return "In Process";
}

/** Whether the file has actually been logged in at the bank (not just a link sent to the customer). */
export function isLoggedIn(sheetStatus: string): boolean {
  return sheetStatus.trim().toUpperCase() !== "SENT";
}

const isAxis = (bankName: string) => bankName.toLowerCase().includes("axis");
const sameBank = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Sum of Disbursed cases only, which is what counts towards disbursal and incentives. */
function disbursedTotal(customers: CustomerDisbursalEntry[]): number {
  return customers.reduce((sum, c) => sum + (c.status === "Disbursed" ? Number(c.amount) || 0 : 0), 0);
}

function withTotals(banks: BankDisbursalBreakdown[]) {
  let axis = 0;
  let other = 0;
  const out = banks.map((b) => {
    const isAxisBank = b.isAxisBank || isAxis(b.bankName);
    const totalAmount = disbursedTotal(b.customers || []);
    if (isAxisBank) axis += totalAmount;
    else other += totalAmount;
    return { ...b, isAxisBank, totalAmount };
  });
  return { banks: out, axisBankDisbursal: axis, otherBanksDisbursal: other, totalDisbursal: axis + other };
}

/** Totals from the given banks (Disbursed cases only), used when saving the hand-entered part. */
export const totalsFromBanks = withTotals;

/** Removes sheet-derived cases (and the banks that only existed because of them) before saving. */
export function stripSheetEntries(banks: BankDisbursalBreakdown[]): BankDisbursalBreakdown[] {
  return banks
    .map((b) => ({ ...b, customers: (b.customers || []).filter((c) => !isSheetCustomer(c)) }))
    .filter((b) => !(b.id.startsWith(SHEET_BANK_PREFIX) && b.customers.length === 0));
}

/** The customer case a sheet row becomes. */
function toCustomer(row: LoginSheetEntry): CustomerDisbursalEntry {
  const status = toCustomerStatus(row.status);
  return {
    id: `sheet-${row.id}`,
    customerName: row.customerName,
    amount: status === "Disbursed" ? row.amount2 ?? row.amount : row.amount,
    status,
    remarks: [row.status, row.remarks].filter(Boolean).join(" · "),
    date: row.date,
    source: SHEET_SOURCE,
  };
}

/** The monthly record with that employee's Login Sheet rows folded in. Returns the record unchanged when there are none. */
export function applySheetRows(record: EmployeeLoginRecord, rows: LoginSheetEntry[]): EmployeeLoginRecord {
  // Start from the hand-entered banks only, so applying twice never doubles anything.
  const banks: BankDisbursalBreakdown[] = stripSheetEntries(record.banks || []).map((b) => ({ ...b, customers: [...b.customers] }));
  if (rows.length === 0) {
    const t = withTotals(banks);
    return { ...record, banks: t.banks, sheetRows: 0 };
  }

  const ordered = [...rows].sort((a, b) => a.date.localeCompare(b.date) || (a.time || "").localeCompare(b.time || ""));
  for (const row of ordered) {
    let bank = banks.find((b) => sameBank(b.bankName, row.bankName));
    if (!bank) {
      bank = {
        id: `${SHEET_BANK_PREFIX}${record.employeeId}-${row.bankName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        bankName: row.bankName,
        isAxisBank: isAxis(row.bankName),
        totalAmount: 0,
        customers: [],
      };
      banks.push(bank);
    }
    bank.customers.push(toCustomer(row));
  }

  const t = withTotals(banks);
  return {
    ...record,
    banks: t.banks,
    totalDisbursal: t.totalDisbursal,
    axisBankDisbursal: t.axisBankDisbursal,
    otherBanksDisbursal: t.otherBanksDisbursal,
    loginsCount: new Set(rows.filter((r) => isLoggedIn(r.status)).map(customerKey)).size,
    lastLoginDate: ordered.filter((r) => isLoggedIn(r.status)).map((r) => r.date).pop() ?? record.lastLoginDate,
    sheetRows: rows.length,
  };
}

/** Groups rows by the employee they belong to. */
export function groupByEmployee(rows: LoginSheetEntry[]): Map<string, LoginSheetEntry[]> {
  const map = new Map<string, LoginSheetEntry[]>();
  for (const r of rows) {
    const list = map.get(r.employeeId);
    if (list) list.push(r);
    else map.set(r.employeeId, [r]);
  }
  return map;
}
