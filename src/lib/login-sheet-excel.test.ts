import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { entriesToXlsx, xlsxToGrid } from "./login-sheet-excel";
import { parseSheetDate, parseSheetRows, parseSheetTime, duplicateKey } from "./login-sheet-import";
import type { LoginSheetEntry } from "./types";

const entry = (o: Partial<LoginSheetEntry> = {}): LoginSheetEntry => ({
  id: "x",
  employeeId: "E1",
  empName: "SHOURYA KAUSHIK",
  customerName: "AMIT",
  panNo: "ABCDE1111A",
  phone: "9999999999",
  location: "DELHI",
  date: "2026-11-06",
  time: "12:22",
  bankName: "DISBURSED BANK",
  dsaName: "FB",
  loginId: "US999",
  product: "PL",
  branch: "Dehradun",
  amount: 1250000,
  status: "DISBURSED",
  remarks: "ROI - 11% PF 12000",
  insuranceDetails: "5000 - 5 YEARS",
  amount2: 1200000,
  createdAt: "",
  updatedAt: "",
  ...o,
});

describe("Excel export then import", () => {
  it("round-trips every column", async () => {
    const original = [entry(), entry({ bankName: "ICICI BANK", status: "SENT", time: undefined, amount2: undefined, loginId: undefined })];
    const grid = await xlsxToGrid(await entriesToXlsx(original));
    expect(grid[0][0]).toBe("CUSTOMER NAME");
    const parsed = parseSheetRows(grid);
    expect(parsed.fatal).toBeUndefined();
    expect(parsed.rows.map((r) => r.error)).toEqual([undefined, undefined]);
    expect(parsed.rows[0].empName).toBe("SHOURYA KAUSHIK");
    expect(parsed.rows[0].input).toEqual({
      customerName: "AMIT",
      panNo: "ABCDE1111A",
      phone: "9999999999",
      location: "DELHI",
      date: "2026-11-06",
      time: "12:22",
      bankName: "DISBURSED BANK",
      dsaName: "FB",
      loginId: "US999",
      product: "PL",
      branch: "Dehradun",
      amount: 1250000,
      status: "DISBURSED",
      remarks: "ROI - 11% PF 12000",
      insuranceDetails: "5000 - 5 YEARS",
      amount2: 1200000,
    });
    expect(parsed.rows[1].input).not.toHaveProperty("time");
    expect(parsed.rows[1].input).not.toHaveProperty("amount2");
  });

  it("reads a sheet laid out like the original Excel (numbers, dates, times, trailing spaces)", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Sheet1");
    ws.addRow(["CUSTOMER NAME", "PAN NO.", "NUMBER", "LOCATION", "DATE", "EMP NAME", "BANK NAME", "DSA NAME", "LOGINID", "PRODUCT", "BRANCH", "FILE", "AMOUNT", "TIME", "STATUS", "REMARKS 1", "INSURANCE DETAILS", "AMOUNT 2"]);
    ws.addRow(["AMIT", "ABCDE1111A ", 9999999999, "DELHI", new Date(Date.UTC(2026, 10, 6)), "SHOURYA KAUSHIK", "TATA CAPITAL", "FB", null, "PL", "DEHRADUN", null, 1250000, new Date(Date.UTC(1899, 11, 30, 12, 22)), "SENT", "LINK SENT"]);
    ws.addRow([]);
    ws.addRow(["AMIT", "ABCDE1111A", 9999999999, "DELHI", "06-11-2026", "SHOURYA KAUSHIK", "HDFC BANK", "PORTRO", 9898989, "PL", "RUDRAPUR", null, "12,50,000", "12:22 PM", "APPROVED", "ROI - 11% PF 9000"]);
    const parsed = parseSheetRows(await xlsxToGrid((await wb.xlsx.writeBuffer()) as ArrayBuffer));
    expect(parsed.rows).toHaveLength(2); // the blank line is skipped
    expect(parsed.rows[0]).toMatchObject({ line: 2, input: { customerName: "AMIT", panNo: "ABCDE1111A", phone: "9999999999", date: "2026-11-06", time: "12:22", branch: "Dehradun", status: "SENT" } });
    expect(parsed.rows[1]).toMatchObject({ line: 4, input: { date: "2026-11-06", amount: 1250000, loginId: "9898989", time: "12:22" } });
  });
});

describe("parseSheetRows", () => {
  const header = ["Customer Name", "Date", "Bank Name", "Amount", "Status"];
  it("reports a missing header or columns", () => {
    expect(parseSheetRows([["a", "b"]]).fatal).toMatch(/header row/);
    expect(parseSheetRows([["Customer Name", "Bank Name"]]).fatal).toMatch(/DATE, STATUS, AMOUNT|DATE, STATUS|STATUS/);
  });
  it("reports errors per row without dropping the good rows", () => {
    const parsed = parseSheetRows([header, ["Amit", "06-11-2026", "HDFC", 100, "SENT"], ["", "06-11-2026", "HDFC", 100, "SENT"], ["Ravi", "31-02-2026", "HDFC", 100, "SENT"], ["Sita", "06-11-2026", "HDFC", "abc", "SENT"]]);
    expect(parsed.rows.map((r) => !!r.input)).toEqual([true, false, false, false]);
    expect(parsed.rows[1].error).toMatch(/Customer name/);
    expect(parsed.rows[2].error).toMatch(/not valid/);
    expect(parsed.rows[3].error).toMatch(/Amount/);
  });
  it("finds the header below a title row", () => {
    const parsed = parseSheetRows([["Daily report"], header, ["Amit", "06-11-2026", "HDFC", 100, "SENT"]]);
    expect(parsed.rows[0]).toMatchObject({ line: 3, input: { customerName: "AMIT" } });
  });
});

describe("date and time parsing", () => {
  it("handles text, serial and ISO dates", () => {
    expect(parseSheetDate("06/11/2026")).toEqual({ value: "2026-11-06" });
    expect(parseSheetDate("6-11-26")).toEqual({ value: "2026-11-06" });
    expect(parseSheetDate("2026-11-06")).toEqual({ value: "2026-11-06" });
    expect(parseSheetDate(46332)).toEqual({ value: "2026-11-06" });
    expect(parseSheetDate("11/25/2026", true)).toEqual({ value: "2026-11-25" });
    expect(parseSheetDate("11/05/2026", true)).toEqual({ value: "2026-11-05" });
    expect(parseSheetDate("11/25/2026")).toHaveProperty("error");
    expect(parseSheetDate("")).toHaveProperty("error");
    expect(parseSheetDate("tomorrow")).toHaveProperty("error");
  });
  it("handles text and fractional times", () => {
    expect(parseSheetTime("1:05 PM")).toEqual({ value: "13:05" });
    expect(parseSheetTime("12:00 AM")).toEqual({ value: "00:00" });
    expect(parseSheetTime(0.5)).toEqual({ value: "12:00" });
    expect(parseSheetTime("")).toEqual({ value: "" });
    expect(parseSheetTime("noon")).toHaveProperty("error");
  });
});

describe("duplicateKey", () => {
  it("matches the same customer, bank and day", () => {
    const a = { customerName: "AMIT", panNo: "ABCDE1111A", bankName: "HDFC", date: "2026-11-06" };
    expect(duplicateKey(a)).toBe(duplicateKey({ ...a, customerName: "AMIT K" }));
    expect(duplicateKey(a)).not.toBe(duplicateKey({ ...a, bankName: "ICICI" }));
  });
});
