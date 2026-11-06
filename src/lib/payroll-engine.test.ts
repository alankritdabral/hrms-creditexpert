import { describe, it, expect } from "vitest";
import {
  calculateSalaryBreakdown,
  calculateSalaryFromMonthly,
  calculateEmployeePayrollSnapshot,
  numberToIndianCurrencyWords,
  attendanceImpact,
  runAttendanceImpact,
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

  it("counts Absent days as full LOP and ignores Late, Present and Leave", () => {
    const snap = calculateEmployeePayrollSnapshot({
      employee,
      attendanceRecords: [rec("Absent", 1), rec("Absent", 2), rec("Present", 3), rec("Leave", 4), rec("Late", 5)],
      approvedIncentives: [],
    });
    expect(snap.lopDays).toBe(2);
    expect(snap.lopAmount).toBe(2000);
    expect(snap.netSalary).toBe(28000);
    expect(snap).toMatchObject({ absentDays: 2, absentAmount: 2000, halfDayCount: 0, halfDayAmount: 0 });
  });

  it("deducts half a day for each Half Day and splits the impact from absences", () => {
    const snap = calculateEmployeePayrollSnapshot({
      employee,
      attendanceRecords: [rec("Absent", 1), rec("Absent", 2), rec("Half Day", 3), rec("Half Day", 4), rec("Half Day", 5), rec("Present", 6)],
      approvedIncentives: [],
    });
    expect(snap.absentDays).toBe(2);
    expect(snap.absentAmount).toBe(2000);
    expect(snap.halfDayCount).toBe(3);
    expect(snap.halfDayAmount).toBe(1500); // 3 x 0.5 x 1000
    expect(snap.lopDays).toBe(3.5);
    expect(snap.lopAmount).toBe(3500);
    expect(snap.totalDeductions).toBe(3500);
    expect(snap.netSalary).toBe(26500);
  });

  it("rounds the half-day amount once, not per record", () => {
    const odd = { ...employee, currentSalary: { grossSalary: 30030, basic: 30030, employeePf: 0, employerPf: 0 } } as unknown as Employee;
    const snap = calculateEmployeePayrollSnapshot({
      employee: odd,
      attendanceRecords: [rec("Half Day", 1), rec("Half Day", 2), rec("Half Day", 3)],
      approvedIncentives: [],
    });
    // per day = round(30030 / 30) = 1001; 3 x 0.5 x 1001 = 1501.5 -> 1502
    expect(snap.halfDayAmount).toBe(1502);
    expect(snap.lopAmount).toBe(1502);
  });

  it("never lets net pay go below zero", () => {
    const snap = calculateEmployeePayrollSnapshot({
      employee,
      attendanceRecords: Array.from({ length: 40 }, (_, i) => rec("Absent", i)),
      approvedIncentives: [],
    });
    expect(snap.netSalary).toBe(0);
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

describe("attendanceImpact", () => {
  const base = { lopDays: 0, lopAmount: 0 };

  it("returns the stored breakdown and totals", () => {
    const i = attendanceImpact({ ...base, lopDays: 3.5, lopAmount: 3500, absentDays: 2, absentAmount: 2000, halfDayCount: 3, halfDayAmount: 1500 });
    expect(i).toEqual({ absentDays: 2, absentAmount: 2000, halfDayCount: 3, halfDayAmount: 1500, totalAmount: 3500, totalDays: 3.5 });
  });

  it("treats old payroll items without a breakdown as all absence", () => {
    const i = attendanceImpact({ lopDays: 2, lopAmount: 2000 });
    expect(i).toMatchObject({ absentDays: 2, absentAmount: 2000, halfDayCount: 0, halfDayAmount: 0, totalAmount: 2000 });
  });

  it("sums a run", () => {
    const run = runAttendanceImpact([
      { lopDays: 1.5, lopAmount: 1500, absentDays: 1, absentAmount: 1000, halfDayCount: 1, halfDayAmount: 500 },
      { lopDays: 2, lopAmount: 2000 },
    ]);
    expect(run).toMatchObject({ absentAmount: 3000, halfDayAmount: 500, totalAmount: 3500, totalDays: 3.5 });
  });
});
