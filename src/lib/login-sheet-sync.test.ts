import { describe, expect, it } from "vitest";
import { applySheetRows, isLoggedIn, stripSheetEntries, toCustomerStatus } from "./login-sheet-sync";
import type { EmployeeLoginRecord, LoginSheetEntry } from "./types";

const record = (o: Partial<EmployeeLoginRecord> = {}): EmployeeLoginRecord => ({
  id: "login-E1-2026-11",
  employeeId: "E1",
  employeeName: "Shourya",
  month: "2026-11",
  commitment: 5000000,
  loginsCount: 0,
  totalDisbursal: 0,
  axisBankDisbursal: 0,
  otherBanksDisbursal: 0,
  banks: [],
  lastUpdatedAt: "",
  ...o,
});

const row = (o: Partial<LoginSheetEntry> & { id: string }): LoginSheetEntry => ({
  employeeId: "E1",
  empName: "Shourya",
  customerName: "AMIT",
  date: "2026-11-06",
  bankName: "HDFC BANK",
  status: "SENT",
  amount: 1250000,
  createdAt: "",
  updatedAt: "",
  ...o,
});

// The five rows of the Excel sample: one customer sent to five banks.
const sample = [
  row({ id: "1", bankName: "TATA CAPITAL", status: "SENT" }),
  row({ id: "2", bankName: "ICICI BANK", status: "LOGIN" }),
  row({ id: "3", bankName: "HDFC BANK", status: "APPROVED" }),
  row({ id: "4", bankName: "AXIS BANK", status: "DISBURSED", amount2: 1200000 }),
  row({ id: "5", bankName: "POONAWALA", status: "REJECT" }),
];

describe("status mapping", () => {
  it("maps sheet statuses to customer-case statuses", () => {
    expect(toCustomerStatus("DISBURSED")).toBe("Disbursed");
    expect(toCustomerStatus("approved")).toBe("Sanctioned");
    expect(toCustomerStatus("REJECT")).toBe("Rejected");
    expect(toCustomerStatus("LOGIN")).toBe("In Process");
    expect(toCustomerStatus("SENT")).toBe("In Process");
    expect(toCustomerStatus("HOLD")).toBe("In Process");
  });
  it("treats everything except SENT as logged in", () => {
    expect(isLoggedIn("SENT")).toBe(false);
    expect(isLoggedIn("login")).toBe(true);
    expect(isLoggedIn("REJECT")).toBe(true);
  });
});

describe("applySheetRows", () => {
  it("returns the record with no sheet data when there are no rows", () => {
    const r = applySheetRows(record({ loginsCount: 7, totalDisbursal: 0 }), []);
    expect(r.loginsCount).toBe(7);
    expect(r.sheetRows).toBe(0);
  });

  it("counts logins, lists every bank and totals only disbursed amounts (Amount 2 first)", () => {
    const r = applySheetRows(record({ loginsCount: 99 }), sample);
    expect(r.loginsCount).toBe(1); // one customer sent to five banks is one login (and SENT alone is not a login)
    expect(r.sheetRows).toBe(5);
    expect(r.totalDisbursal).toBe(1200000);
    expect(r.axisBankDisbursal).toBe(1200000);
    expect(r.otherBanksDisbursal).toBe(0);
    expect(r.banks.map((b) => b.bankName).sort()).toEqual(["AXIS BANK", "HDFC BANK", "ICICI BANK", "POONAWALA", "TATA CAPITAL"]);
    const axis = r.banks.find((b) => b.bankName === "AXIS BANK")!;
    expect(axis).toMatchObject({ isAxisBank: true, totalAmount: 1200000 });
    expect(axis.customers[0]).toMatchObject({ customerName: "AMIT", status: "Disbursed", amount: 1200000, source: "login-sheet" });
    expect(r.banks.find((b) => b.bankName === "HDFC BANK")!.customers[0]).toMatchObject({ status: "Sanctioned", amount: 1250000 });
  });

  it("counts each logged-in customer once, whatever the number of banks", () => {
    const rows = [
      row({ id: "a", customerName: "AMIT", panNo: "ABCDE1111A", bankName: "HDFC BANK", status: "LOGIN" }),
      row({ id: "b", customerName: "AMIT", panNo: "ABCDE1111A", bankName: "ICICI BANK", status: "APPROVED" }),
      row({ id: "c", customerName: "SITA", phone: "9999999999", bankName: "HDFC BANK", status: "REJECT" }),
      row({ id: "d", customerName: "RAVI", bankName: "HDFC BANK", status: "SENT" }), // link only: not a login yet
      row({ id: "e", customerName: "RAVI", bankName: "ICICI BANK", status: "SENT" }),
    ];
    expect(applySheetRows(record(), rows).loginsCount).toBe(2);
    // Once any of the customer's rows moves past SENT, they count as logged in.
    expect(applySheetRows(record(), [...rows.slice(0, 4), row({ id: "e", customerName: "RAVI", bankName: "ICICI BANK", status: "LOGIN" })]).loginsCount).toBe(3);
  });

  it("treats the same name and mobile as one customer even if the PAN differs between rows", () => {
    const rows = ["ABCDE1111A", "ABCDE1112A", "ABCDE1113A"].map((panNo, i) =>
      row({ id: `p${i}`, customerName: "AMIT", phone: "9999999999", panNo, bankName: `BANK ${i}`, status: "LOGIN" })
    );
    expect(applySheetRows(record(), rows).loginsCount).toBe(1);
    expect(applySheetRows(record(), [...rows, row({ id: "z", customerName: "AMIT", phone: "8888888888", status: "LOGIN" })]).loginsCount).toBe(2);
  });

  it("falls back to Amount when a disbursed row has no Amount 2", () => {
    const r = applySheetRows(record(), [row({ id: "a", status: "DISBURSED", bankName: "HDFC BANK" })]);
    expect(r.totalDisbursal).toBe(1250000);
    expect(r.otherBanksDisbursal).toBe(1250000);
  });

  it("adds sheet rows on top of hand-entered banks, merging a bank of the same name", () => {
    const manual = record({
      banks: [{ id: "bank-1", bankName: "Axis Bank", isAxisBank: true, totalAmount: 500000, customers: [{ id: "c1", customerName: "RAVI", amount: 500000, status: "Disbursed", date: "2026-11-01" }] }],
    });
    const r = applySheetRows(manual, [row({ id: "x", bankName: "AXIS BANK", status: "DISBURSED", amount2: 300000 })]);
    expect(r.banks).toHaveLength(1);
    expect(r.banks[0].customers.map((c) => c.customerName)).toEqual(["RAVI", "AMIT"]);
    expect(r.totalDisbursal).toBe(800000);
  });

  it("is idempotent: applying twice does not double anything", () => {
    const once = applySheetRows(record(), sample);
    const twice = applySheetRows(once, sample);
    expect(twice.totalDisbursal).toBe(once.totalDisbursal);
    expect(twice.banks.flatMap((b) => b.customers)).toHaveLength(5);
  });
});

describe("stripSheetEntries", () => {
  it("removes sheet cases and sheet-only banks but keeps hand-entered data", () => {
    const merged = applySheetRows(
      record({ banks: [{ id: "bank-1", bankName: "Axis Bank", isAxisBank: true, totalAmount: 1, customers: [{ id: "c1", customerName: "RAVI", amount: 1, status: "Disbursed", date: "2026-11-01" }] }] }),
      sample
    );
    const stripped = stripSheetEntries(merged.banks);
    expect(stripped.map((b) => b.id)).toEqual(["bank-1"]);
    expect(stripped[0].customers.map((c) => c.id)).toEqual(["c1"]);
  });
});
