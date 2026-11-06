import { describe, expect, it } from "vitest";
import {
  EMPTY_LOGIN_SHEET_FILTERS,
  activeSheetFilterCount,
  filterLoginSheet,
  FILE_BLANKS,
  loginSheetToCsv,
  normalizeEntryInput,
  sortLoginSheet,
  summarizeLoginSheet,
  type LoginSheetFilters,
} from "./login-sheet";
import type { LoginSheetEntry } from "./types";

const base = { customerName: "Amit", bankName: "Tata Capital", status: "sent", date: "2026-11-06", amount: 1250000 };

describe("normalizeEntryInput", () => {
  it("accepts the Excel sample row and upper-cases names and codes", () => {
    const r = normalizeEntryInput({
      ...base,
      panNo: "abcde1111a ",
      phone: "9999999999",
      location: "Delhi",
      time: "12:22",
      dsaName: "fb",
      product: "pl",
      branch: "dehradun",
      remarks: "Link sent",
      amount2: "1200000",
    });
    expect(r).toEqual({
      ok: true,
      value: {
        customerName: "AMIT",
        bankName: "TATA CAPITAL",
        status: "SENT",
        date: "2026-11-06",
        amount: 1250000,
        panNo: "ABCDE1111A",
        phone: "9999999999",
        location: "DELHI",
        time: "12:22",
        dsaName: "FB",
        product: "PL",
        branch: "Dehradun",
        remarks: "Link sent",
        amount2: 1200000,
      },
    });
  });

  it("requires customer, bank, status, a real date and an amount", () => {
    expect(normalizeEntryInput({ ...base, customerName: " " })).toMatchObject({ ok: false });
    expect(normalizeEntryInput({ ...base, bankName: "" })).toMatchObject({ ok: false });
    expect(normalizeEntryInput({ ...base, status: "" })).toMatchObject({ ok: false });
    expect(normalizeEntryInput({ ...base, date: "2026-02-31" })).toMatchObject({ ok: false });
    expect(normalizeEntryInput({ ...base, date: "06-11-2026" })).toMatchObject({ ok: false });
    expect(normalizeEntryInput({ ...base, amount: "" })).toMatchObject({ ok: false });
    expect(normalizeEntryInput({ ...base, amount: -5 })).toMatchObject({ ok: false });
    expect(normalizeEntryInput(null)).toMatchObject({ ok: false });
  });

  it("validates PAN, mobile number, time and branch only when given", () => {
    expect(normalizeEntryInput({ ...base, panNo: "12345" })).toMatchObject({ ok: false });
    expect(normalizeEntryInput({ ...base, panNo: "ABCD1111A" })).toMatchObject({ ok: false }); // 9 characters
    expect(normalizeEntryInput({ ...base, phone: "12345" })).toMatchObject({ ok: false });
    expect(normalizeEntryInput({ ...base, time: "25:00" })).toMatchObject({ ok: false });
    expect(normalizeEntryInput({ ...base, branch: "Mumbai" })).toMatchObject({ ok: false });
    expect(normalizeEntryInput({ ...base, panNo: "", phone: "", time: "", branch: "" })).toMatchObject({ ok: true });
  });

  it("strips +91 and punctuation from the mobile number", () => {
    const r = normalizeEntryInput({ ...base, phone: "+91 98765-43210" });
    expect(r).toMatchObject({ ok: true, value: { phone: "9876543210" } });
  });

  it("accepts amounts typed with commas and allows an Amount 2 of zero", () => {
    expect(normalizeEntryInput({ ...base, amount: "12,50,000", amount2: 0 })).toMatchObject({
      ok: true,
      value: { amount: 1250000, amount2: 0 },
    });
  });
});

const row = (o: Partial<LoginSheetEntry> & { id: string }): LoginSheetEntry => ({
  employeeId: "E1",
  empName: "Shourya",
  customerName: "AMIT",
  date: "2026-11-06",
  bankName: "HDFC BANK",
  status: "SENT",
  amount: 100,
  createdAt: "2026-11-06T00:00:00.000Z",
  updatedAt: "2026-11-06T00:00:00.000Z",
  ...o,
});

const data = [
  row({ id: "a", panNo: "ABCD1111A", dsaName: "FB", product: "PL", branch: "Delhi", status: "SENT", time: "10:00", file: "BACKEND" }),
  row({ id: "b", panNo: "ABCD1111A", bankName: "ICICI BANK", dsaName: "CREDILIO", product: "PL", branch: "Dehradun", status: "LOGIN", loginId: "US999", time: "12:22", amount: 200, file: "RE LOOK" }),
  row({ id: "c", employeeId: "E2", empName: "Ravi", customerName: "SITA", date: "2026-11-05", bankName: "HDFC BANK", product: "HL", status: "DISBURSED", amount: 300, amount2: 250 }),
];
const ids = (f: Partial<LoginSheetFilters>) => filterLoginSheet(data, { ...EMPTY_LOGIN_SHEET_FILTERS, ...f }).map((r) => r.id);

describe("filterLoginSheet", () => {
  it("returns everything with no filters", () => expect(ids({})).toEqual(["a", "b", "c"]));
  it("searches customer, PAN, login id and employee", () => {
    expect(ids({ search: "sita" })).toEqual(["c"]);
    expect(ids({ search: "abcd1111" })).toEqual(["a", "b"]);
    expect(ids({ search: "us999" })).toEqual(["b"]);
    expect(ids({ search: "ravi" })).toEqual(["c"]);
  });
  it("filters by each dropdown", () => {
    expect(ids({ bank: "HDFC BANK" })).toEqual(["a", "c"]);
    expect(ids({ dsa: "CREDILIO" })).toEqual(["b"]);
    expect(ids({ product: "HL" })).toEqual(["c"]);
    expect(ids({ branch: "Dehradun" })).toEqual(["b"]);
    expect(ids({ status: ["DISBURSED"] })).toEqual(["c"]);
    expect(ids({ employeeId: "E2" })).toEqual(["c"]);
  });
  it("matches any of several selected statuses", () => {
    expect(ids({ status: ["SENT", "DISBURSED"] })).toEqual(["a", "c"]);
    expect(ids({ status: ["LOGIN", "REJECT"] })).toEqual(["b"]);
    expect(ids({ status: [] })).toEqual(["a", "b", "c"]);
  });
  it("filters by File, where (Blanks) matches rows with none", () => {
    expect(ids({ file: ["BACKEND"] })).toEqual(["a"]);
    expect(ids({ file: ["BACKEND", "RE LOOK"] })).toEqual(["a", "b"]);
    expect(ids({ file: [FILE_BLANKS] })).toEqual(["c"]);
    expect(ids({ file: ["PENDING", FILE_BLANKS] })).toEqual(["c"]);
    expect(ids({ file: [] })).toEqual(["a", "b", "c"]);
  });
  it("filters by an inclusive date range", () => {
    expect(ids({ dateFrom: "2026-11-06" })).toEqual(["a", "b"]);
    expect(ids({ dateTo: "2026-11-05" })).toEqual(["c"]);
    expect(ids({ dateFrom: "2026-11-05", dateTo: "2026-11-05" })).toEqual(["c"]);
  });
  it("combines filters", () => expect(ids({ bank: "HDFC BANK", status: ["SENT"] })).toEqual(["a"]));
});

describe("activeSheetFilterCount", () => {
  it("counts dropdown and date filters but not the search box", () => {
    expect(activeSheetFilterCount(EMPTY_LOGIN_SHEET_FILTERS)).toBe(0);
    expect(activeSheetFilterCount({ ...EMPTY_LOGIN_SHEET_FILTERS, search: "x", bank: "A", status: ["B", "C"], dateFrom: "2026-11-01" })).toBe(3);
  });
});

describe("sortLoginSheet", () => {
  it("sorts newest date first, then latest time", () => expect(sortLoginSheet(data).map((r) => r.id)).toEqual(["b", "a", "c"]));
});

describe("summarizeLoginSheet", () => {
  it("totals amounts, counts files, customers and statuses", () => {
    expect(summarizeLoginSheet(data)).toEqual({
      files: 3,
      customers: 2,
      totalAmount: 600,
      totalAmount2: 250,
      byStatus: { SENT: 1, LOGIN: 1, DISBURSED: 1 },
    });
  });
});

describe("loginSheetToCsv", () => {
  it("writes the Excel columns, quoting commas and neutralising formulas", () => {
    const csv = loginSheetToCsv([row({ id: "x", customerName: "=CMD()", remarks: 'ROI 11%, PF "9000"', amount2: 5 })]);
    const [header, line] = csv.split("\r\n");
    expect(header).toBe(
      "Customer Name,PAN No.,Number,Location,Date,Emp Name,Bank Name,DSA Name,Login ID,Product,Branch,File,Amount,Time,Status,Remarks 1,Insurance Details,Amount 2"
    );
    expect(line.startsWith("'=CMD(),")).toBe(true);
    expect(line).toContain('"ROI 11%, PF ""9000"""');
    expect(line.endsWith(",5")).toBe(true);
  });
});
