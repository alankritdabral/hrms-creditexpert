/**
 * The evening "your logins this month" email. Pure (no database, no mail transport) and written with
 * type-only imports, so it is unit-testable and can also run from a plain Node script.
 */
import type { LoginSheetEntry } from "./types";

/** The Login Sheet fields the report reads. */
export type ReportRow = Pick<
  LoginSheetEntry,
  "customerName" | "phone" | "panNo" | "date" | "time" | "bankName" | "loginId" | "product" | "amount" | "amount2" | "status" | "remarks" | "insuranceDetails"
>;

export interface BankProgress {
  bank: string;
  files: number;
  amount: number;
  /** Status → number of files, e.g. { LOGIN: 2, DISBURSED: 1 }. */
  statuses: Record<string, number>;
}

export interface DailyLoginReport {
  employeeName: string;
  /** "YYYY-MM" */
  month: string;
  /** "YYYY-MM-DD" (IST) */
  today: string;
  /** Files (rows) and distinct customers in the month so far. */
  files: number;
  customers: number;
  /** Customers with at least one file past SENT. */
  loggedInCustomers: number;
  totalAmount: number;
  /** Disbursed files only, using Amount 2 (the disbursed amount) and falling back to Amount. */
  disbursedAmount: number;
  byStatus: Record<string, number>;
  banks: BankProgress[];
  /** Date of the most recent file that went past SENT, or null when none has. */
  lastLoginDate: string | null;
  /** CIBIL pulls today, counted as the distinct customers entered on the sheet today. */
  cibilToday: number;
  /** Today's rows, in the order they were entered. */
  todayRows: ReportRow[];
}

const LOAN_TYPES: Record<string, string> = {
  PL: "Personal Loan",
  BL: "Business Loan",
  HL: "Home Loan",
  LAP: "Loan Against Property",
  "CAR LOAN": "Car Loan",
  CC: "Credit Card",
  OD: "Overdraft",
};

/** "PL" → "Personal Loan"; unknown products are shown as typed. */
export function loanTypeName(product?: string): string {
  const key = (product || "").trim().toUpperCase();
  return LOAN_TYPES[key] || (product || "").trim();
}

const customerId = (r: Pick<ReportRow, "customerName" | "phone" | "panNo">) =>
  `${r.customerName.trim().toUpperCase()}|${r.phone || r.panNo || ""}`;
const upper = (s: string) => s.trim().toUpperCase();
const loggedIn = (status: string) => upper(status) !== "SENT";

/** Builds one employee's report from their Login Sheet rows for the month so far (rows dated after `today` are ignored). */
export function buildDailyLoginReport(employeeName: string, rows: ReportRow[], today: string): DailyLoginReport {
  const month = today.slice(0, 7);
  const mine = rows.filter((r) => r.date.startsWith(month) && r.date <= today);

  const byStatus: Record<string, number> = {};
  const banks = new Map<string, BankProgress>();
  const customers = new Set<string>();
  const loggedInCustomers = new Set<string>();
  let totalAmount = 0;
  let disbursedAmount = 0;
  let lastLoginDate: string | null = null;

  for (const r of mine) {
    const status = upper(r.status);
    byStatus[status] = (byStatus[status] || 0) + 1;
    customers.add(customerId(r));
    if (loggedIn(r.status)) {
      loggedInCustomers.add(customerId(r));
      if (!lastLoginDate || r.date > lastLoginDate) lastLoginDate = r.date;
    }
    totalAmount += Number(r.amount) || 0;
    if (status.startsWith("DISBURS")) disbursedAmount += Number(r.amount2 ?? r.amount) || 0;

    const bankKey = upper(r.bankName);
    const bank = banks.get(bankKey) ?? { bank: bankKey, files: 0, amount: 0, statuses: {} };
    bank.files += 1;
    bank.amount += Number(r.amount) || 0;
    bank.statuses[status] = (bank.statuses[status] || 0) + 1;
    banks.set(bankKey, bank);
  }

  const todayRows = mine
    .filter((r) => r.date === today)
    .sort((a, b) => (a.time || "").localeCompare(b.time || ""));

  return {
    employeeName,
    month,
    today,
    files: mine.length,
    customers: customers.size,
    loggedInCustomers: loggedInCustomers.size,
    totalAmount,
    disbursedAmount,
    byStatus,
    banks: [...banks.values()].sort((a, b) => b.files - a.files || a.bank.localeCompare(b.bank)),
    lastLoginDate,
    cibilToday: new Set(todayRows.map(customerId)).size,
    todayRows,
  };
}

// ----------------------------- Rendering -----------------------------

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "2026-11-06" → "06-11-2026" */
export const dmy = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}` : iso);
const longDate = (iso: string) => `${Number(iso.slice(8))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
const monthLabel = (month: string) => `${MONTHS_LONG[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
const rupees = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

const STATUS_COLORS: Record<string, [string, string]> = {
  SENT: ["#f1f5f9", "#475569"],
  LOGIN: ["#dbeafe", "#1d4ed8"],
  APPROVED: ["#fef3c7", "#b45309"],
  DISBURSED: ["#d1fae5", "#047857"],
  REJECT: ["#ffe4e6", "#be123c"],
};
function pill(status: string): string {
  const [bg, fg] = STATUS_COLORS[upper(status)] || ["#f1f5f9", "#475569"];
  return `<span style="display:inline-block;background:${bg};color:${fg};border-radius:10px;padding:1px 8px;font-size:11px;font-weight:bold;">${esc(status)}</span>`;
}

const th = "padding:6px 8px;text-align:left;background:#f1f5f9;color:#475569;font-size:11px;border-bottom:1px solid #e2e8f0;white-space:nowrap;";
const td = "padding:6px 8px;border-bottom:1px solid #eef2f7;font-size:12px;color:#334155;vertical-align:top;";

function statusSummary(statuses: Record<string, number>): string {
  const order = ["SENT", "LOGIN", "APPROVED", "DISBURSED", "REJECT"];
  const keys = Object.keys(statuses).sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99) || a.localeCompare(b));
  return keys.map((k) => `${pill(k)} ${statuses[k]}`).join(" &nbsp; ");
}

export interface RenderedReport {
  subject: string;
  html: string;
  text: string;
}

/** The email for one employee. `isTest` adds a banner and a [TEST] subject prefix. */
export function renderDailyLoginReport(r: DailyLoginReport, opts: { isTest?: boolean; portalUrl?: string } = {}): RenderedReport {
  const subject = `${opts.isTest ? "[TEST] " : ""}Login progress for ${r.employeeName}: ${longDate(r.today)}`;

  const stat = (label: string, value: string, sub = "") =>
    `<td style="padding:12px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc;width:25%;vertical-align:top;">
       <div style="font-size:11px;color:#64748b;text-transform:uppercase;">${esc(label)}</div>
       <div style="font-size:20px;font-weight:bold;color:#0f172a;margin-top:4px;">${value}</div>
       ${sub ? `<div style="font-size:11px;color:#64748b;margin-top:2px;">${sub}</div>` : ""}
     </td>`;

  const bankRows = r.banks
    .map(
      (b) => `<tr>
        <td style="${td}font-weight:bold;">${esc(b.bank)}</td>
        <td style="${td}text-align:right;">${b.files}</td>
        <td style="${td}text-align:right;">${rupees(b.amount)}</td>
        <td style="${td}">${statusSummary(b.statuses)}</td>
      </tr>`
    )
    .join("");

  const todayRows = r.todayRows
    .map(
      (x) => `<tr>
        <td style="${td}font-weight:bold;">${esc(x.customerName)}</td>
        <td style="${td}">${esc(x.phone || "")}</td>
        <td style="${td}white-space:nowrap;">${esc(dmy(x.date))}</td>
        <td style="${td}">${esc(x.bankName)}</td>
        <td style="${td}">${esc(x.loginId || "")}</td>
        <td style="${td}">${esc(loanTypeName(x.product))}</td>
        <td style="${td}text-align:right;white-space:nowrap;">${rupees(Number(x.amount) || 0)}</td>
        <td style="${td}">${pill(x.status)}</td>
        <td style="${td}">${esc(x.remarks || "")}</td>
        <td style="${td}">${esc(x.insuranceDetails || "")}</td>
        <td style="${td}text-align:right;white-space:nowrap;">${x.amount2 !== undefined && x.amount2 !== null ? rupees(Number(x.amount2)) : ""}</td>
      </tr>`
    )
    .join("");

  const html = `
  <div style="font-family:Arial,sans-serif;max-width:900px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:8px;color:#334155;">
    ${opts.isTest ? `<div style="background:#fef3c7;border:1px solid #fde68a;color:#92400e;border-radius:6px;padding:8px 12px;font-size:12px;margin-bottom:14px;"><strong>TEST EMAIL.</strong> The names and figures below are made-up sample data.</div>` : ""}
    <h2 style="margin:0 0 4px 0;color:#1d4ed8;">Your logins: ${esc(monthLabel(r.month))}</h2>
    <p style="margin:0 0 16px 0;font-size:14px;">Dear <strong>${esc(r.employeeName)}</strong>, here is your progress for the month so far, as of ${esc(longDate(r.today))}.</p>

    <table role="presentation" cellspacing="8" cellpadding="0" style="width:100%;border-collapse:separate;margin:0 -8px 8px -8px;"><tr>
      ${stat("Files this month", String(r.files), `${r.customers} customer${r.customers === 1 ? "" : "s"}, ${r.loggedInCustomers} logged in`)}
      ${stat("Total amount", rupees(r.totalAmount))}
      ${stat("Disbursed", rupees(r.disbursedAmount), `${r.byStatus["DISBURSED"] || 0} file${(r.byStatus["DISBURSED"] || 0) === 1 ? "" : "s"}`)}
      ${stat("Last login date", r.lastLoginDate ? esc(dmy(r.lastLoginDate)) : "None yet", r.lastLoginDate ? "" : "no file past SENT")}
    </tr></table>

    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px 16px;margin:12px 0 20px 0;">
      <span style="font-size:13px;">CIBILs pulled today: </span><strong style="font-size:18px;color:#1d4ed8;">${r.cibilToday}</strong>
      <div style="font-size:11px;color:#64748b;margin-top:2px;">Counted as the customers you entered on the Login Sheet today.</div>
    </div>

    <h3 style="margin:0 0 8px 0;font-size:14px;color:#0f172a;">Where your files are going this month</h3>
    ${
      r.banks.length
        ? `<table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;margin-bottom:22px;">
      <tr><th style="${th}">Bank</th><th style="${th}text-align:right;">Files</th><th style="${th}text-align:right;">Amount</th><th style="${th}">Status</th></tr>
      ${bankRows}
    </table>`
        : `<p style="font-size:13px;color:#64748b;">No files yet this month.</p>`
    }

    <h3 style="margin:0 0 8px 0;font-size:14px;color:#0f172a;">Today's logins (${esc(dmy(r.today))})</h3>
    ${
      r.todayRows.length
        ? `<table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;">
      <tr>
        <th style="${th}">Customer name</th><th style="${th}">Number</th><th style="${th}">Date</th><th style="${th}">Bank</th>
        <th style="${th}">Login ID</th><th style="${th}">Product</th><th style="${th}text-align:right;">Amount</th><th style="${th}">Status</th>
        <th style="${th}">Remarks</th><th style="${th}">Insurance</th><th style="${th}text-align:right;">Amount 2</th>
      </tr>
      ${todayRows}
    </table>`
        : `<p style="font-size:13px;color:#64748b;">You did not add any logins today.</p>`
    }

    ${opts.portalUrl ? `<p style="margin:22px 0 0 0;font-size:12px;"><a href="${esc(opts.portalUrl)}" style="color:#4f46e5;">Open the Login Sheet</a></p>` : ""}
    <p style="color:#94a3b8;font-size:11px;text-align:center;margin:18px 0 0 0;">Sent automatically every evening at 8 PM IST. &copy; ${esc(r.today.slice(0, 4))} Credit Expert India</p>
  </div>`;

  const lines = [
    `${opts.isTest ? "[TEST - sample data] " : ""}Login progress for ${r.employeeName}, ${monthLabel(r.month)} (as of ${dmy(r.today)})`,
    "",
    `Files this month: ${r.files} (${r.customers} customers, ${r.loggedInCustomers} logged in)`,
    `Total amount: ${rupees(r.totalAmount)}   Disbursed: ${rupees(r.disbursedAmount)}`,
    `Last login date: ${r.lastLoginDate ? dmy(r.lastLoginDate) : "none yet"}`,
    `CIBILs pulled today: ${r.cibilToday}`,
    "",
    "By bank:",
    ...r.banks.map((b) => `  ${b.bank}: ${b.files} files, ${rupees(b.amount)} (${Object.entries(b.statuses).map(([s, n]) => `${s} ${n}`).join(", ")})`),
    "",
    `Today's logins (${dmy(r.today)}):`,
    ...(r.todayRows.length
      ? r.todayRows.map(
          (x) =>
            `  ${x.customerName} | ${x.phone || "-"} | ${dmy(x.date)} | ${x.bankName} | ${x.loginId || "-"} | ${loanTypeName(x.product) || "-"} | ${rupees(Number(x.amount) || 0)} | ${x.status} | ${x.remarks || "-"} | ${x.insuranceDetails || "-"} | ${x.amount2 ?? "-"}`
        )
      : ["  none"]),
  ];
  return { subject, html, text: lines.join("\n") };
}
