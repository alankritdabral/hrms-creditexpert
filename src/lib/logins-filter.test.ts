import { describe, expect, it } from "vitest";
import { EMPTY_LOGIN_FILTERS, achievementOf, activeFilterCount, distinct, filterLogins, loginTarget, type LoginFilters } from "./logins-filter";
import type { EmployeeLoginRecord } from "./types";

const rec = (o: Partial<EmployeeLoginRecord> & { id: string }): EmployeeLoginRecord =>
  ({
    employeeId: o.id.toUpperCase(),
    employeeName: o.id,
    month: "2026-11",
    commitment: 5000000,
    loginsCount: 0,
    totalDisbursal: 0,
    axisBankDisbursal: 0,
    otherBanksDisbursal: 0,
    banks: [],
    lastUpdatedAt: "",
    ...o,
  }) as EmployeeLoginRecord;

const bank = (bankName: string, statuses: ("Disbursed" | "Sanctioned" | "In Process" | "Rejected")[]) => ({
  id: bankName,
  bankName,
  isAxisBank: bankName === "Axis Bank",
  totalAmount: 0,
  customers: statuses.map((status, i) => ({ id: `${bankName}${i}`, customerName: "c", amount: 1, status, date: "2026-11-01" })),
});

const data = [
  rec({ id: "asha", branch: "Delhi", department: "Sales", totalDisbursal: 6000000, loginsCount: 12, banks: [bank("Axis Bank", ["Disbursed"])] }),
  rec({ id: "ravi", branch: "Dehradun", department: "Sales", totalDisbursal: 1000000, loginsCount: 3, banks: [bank("HDFC Bank", ["In Process", "Rejected"])] }),
  rec({ id: "meena", branch: "Delhi", department: "Support", totalDisbursal: 0, loginsCount: 10, remarks: "on leave", banks: [] }),
];
const ids = (f: Partial<LoginFilters>) => filterLogins(data, { ...EMPTY_LOGIN_FILTERS, ...f }).map((r) => r.id);

describe("filterLogins", () => {
  it("returns everything with no filters", () => expect(ids({})).toEqual(["asha", "ravi", "meena"]));
  it("searches name, id, branch, department and remarks", () => {
    expect(ids({ search: "ASHA" })).toEqual(["asha"]);
    expect(ids({ search: "dehradun" })).toEqual(["ravi"]);
    expect(ids({ search: "support" })).toEqual(["meena"]);
    expect(ids({ search: "on leave" })).toEqual(["meena"]);
  });
  it("filters by branch and department", () => {
    expect(ids({ branch: "Delhi" })).toEqual(["asha", "meena"]);
    expect(ids({ branch: "Delhi", department: "Support" })).toEqual(["meena"]);
  });
  it("filters by bank and by customer status", () => {
    expect(ids({ bank: "HDFC Bank" })).toEqual(["ravi"]);
    expect(ids({ customerStatus: "Rejected" })).toEqual(["ravi"]);
    expect(ids({ customerStatus: "Disbursed" })).toEqual(["asha"]);
    expect(ids({ bank: "Axis Bank", customerStatus: "Rejected" })).toEqual([]);
  });
  it("filters by achievement against commitment", () => {
    expect(ids({ achievement: "met" })).toEqual(["asha"]);
    expect(ids({ achievement: "progress" })).toEqual(["ravi"]);
    expect(ids({ achievement: "none" })).toEqual(["meena"]);
  });
  it("filters by logins target (10 files for a 50L commitment)", () => {
    expect(ids({ loginsTarget: "met" })).toEqual(["asha", "meena"]);
    expect(ids({ loginsTarget: "below" })).toEqual(["ravi"]);
  });
});

describe("helpers", () => {
  it("loginTarget uses the saved value, else defaults by commitment", () => {
    expect(loginTarget({ loginCommitment: 7, commitment: 1 })).toBe(7);
    expect(loginTarget({ commitment: 10000000 })).toBe(15);
    expect(loginTarget({ commitment: 5000000 })).toBe(10);
    expect(loginTarget({ commitment: 100 })).toBe(5);
  });
  it("achievementOf", () => {
    expect(achievementOf({ totalDisbursal: 5000000, commitment: 5000000 })).toBe("met");
    expect(achievementOf({ totalDisbursal: 1, commitment: 5000000 })).toBe("progress");
    expect(achievementOf({ totalDisbursal: 0, commitment: 5000000 })).toBe("none");
  });
  it("counts active filters, ignoring search", () => {
    expect(activeFilterCount(EMPTY_LOGIN_FILTERS)).toBe(0);
    expect(activeFilterCount({ ...EMPTY_LOGIN_FILTERS, search: "x", branch: "Delhi", achievement: "met" })).toBe(2);
  });
  it("distinct sorts and drops blanks", () => expect(distinct(["b", undefined, "a", "b", ""])).toEqual(["a", "b"]));
});
