import { describe, it, expect } from "vitest";
import {
  calculateSalaryBreakdown,
  calculateSalaryFromMonthly,
  calculateEmployeePayrollSnapshot,
  numberToIndianCurrencyWords,
} from "./payroll-engine";
import type { Employee, AttendanceRecord, EmployeeIncentiveRecord } from "./types";

describe("calculateSalaryBreakdown", () => {
  it("splits a CTC with 12% PF by default", () => {
    const s = calculateSalaryBreakdown(1200000);
    expect(s.monthlyCtc).toBe(100000);
    expect(s.basic).toBe(89286);
    expect(s.employerPf).toBe(10714);
    expect(s.employeePf).toBe(10714);
    expect(s.netSalary).toBe(78572);
  });

  it("supports a fixed PF amount", () => {
    const s = calculateSalaryBreakdown(1200000, true, "fixed", 1800);
    expect(s.employerPf).toBe(1800);
    expect(s.basic).toBe(98200);
    expect(s.netSalary).toBe(96400);
  });

  it("pays the full CTC when PF is excluded", () => {
    const s = calculateSalaryBreakdown(1200000, false);
    expect(s.basic).toBe(100000);
    expect(s.employeePf).toBe(0);
    expect(s.netSalary).toBe(100000);
  });
});

describe("calculateSalaryFromMonthly", () => {
  it("grosses up a net salary for PF", () => {
    const s = calculateSalaryFromMonthly({ monthlyAmount: 30000, salaryBasis: "monthly_net" });
    expect(s.netSalary).toBe(30000);
    expect(s.basic).toBe(34091);
    expect(s.employerPf).toBe(4091);
    expect(s.monthlyCtc).toBe(38182);
  });

  it("takes a gross salary as basic", () => {
    const s = calculateSalaryFromMonthly({ monthlyAmount: 35000, salaryBasis: "monthly_gross" });
    expect(s.grossSalary).toBe(35000);
    expect(s.employeePf).toBe(4200);
    expect(s.netSalary).toBe(30800);
  });

  it("returns zeros for incentive-only pay", () => {
    const s = calculateSalaryFromMonthly({ monthlyAmount: 99999, salaryBasis: "incentive_only" });
    expect(s.isIncentiveOnly).toBe(true);
    expect(s.grossSalary).toBe(0);
    expect(s.annualCtc).toBe(0);
    expect(s.employeePf).toBe(0);
  });
});

describe("calculateEmployeePayrollSnapshot", () => {
  const employee = {
    employeeId: "EMP-0001",
    personal: { fullName: "Test Person" },
    employment: { designation: "Exec", department: "Sales" },
    statutory: { pan: "ABCDE1234F", bankAccountNumber: "1234567890", ifscCode: "HDFC0000001" },
    currentSalary: { grossSalary: 30000, basic: 30000, employeePf: 0, employerPf: 0 },
  } as unknown as Employee;

  const rec = (status: AttendanceRecord["status"], i: number) =>
    ({ id: `a${i}`, status, overtimeHours: 0 }) as AttendanceRecord;

  it("counts only Absent days as LOP", () => {
    const snap = calculateEmployeePayrollSnapshot({
      employee,
      attendanceRecords: [rec("Absent", 1), rec("Absent", 2), rec("Present", 3), rec("Leave", 4), rec("Late", 5)],
      approvedIncentives: [],
    });
    expect(snap.lopDays).toBe(2);
    expect(snap.lopAmount).toBe(2000);
    expect(snap.netSalary).toBe(28000);
  });

  it("adds approved incentives to gross and net", () => {
    const snap = calculateEmployeePayrollSnapshot({
      employee,
      attendanceRecords: [],
      approvedIncentives: [{ incentiveAmount: 1500 }, { incentiveAmount: 500 }] as EmployeeIncentiveRecord[],
    });
    expect(snap.incentive).toBe(2000);
    expect(snap.grossEarnings).toBe(32000);
    expect(snap.netSalary).toBe(32000);
  });

  it("masks PAN and bank account", () => {
    const snap = calculateEmployeePayrollSnapshot({ employee, attendanceRecords: [], approvedIncentives: [] });
    expect(snap.panMasked).toBe("AB•••••4F");
    expect(snap.bankAccountMasked).toBe("••••••••7890");
  });
});

describe("numberToIndianCurrencyWords", () => {
  it("handles zero, lakhs and mixed amounts", () => {
    expect(numberToIndianCurrencyWords(0)).toBe("Zero Rupees Only");
    expect(numberToIndianCurrencyWords(100000)).toBe("One Lakh Rupees Only");
    expect(numberToIndianCurrencyWords(1234567)).toBe(
      "Twelve Lakh Thirty Four Thousand Five Hundred and Sixty Seven Rupees Only"
    );
  });
});

import { nextPayrollStatus, LOCKED_PAYROLL_STATUSES } from "./payroll-engine";

describe("nextPayrollStatus", () => {
  it("moves forward one stage at a time", () => {
    expect(nextPayrollStatus("CALCULATED")).toBe("HR_REVIEW");
    expect(nextPayrollStatus("APPROVED")).toBe("FINALIZED");
  });
  it("has no stage after PAID or for unknown statuses", () => {
    expect(nextPayrollStatus("PAID")).toBeNull();
    expect(nextPayrollStatus("NOPE" as never)).toBeNull();
  });
  it("treats finalized runs as locked", () => {
    expect(LOCKED_PAYROLL_STATUSES).toContain("FINALIZED");
    expect(LOCKED_PAYROLL_STATUSES).not.toContain("APPROVED");
  });
});
