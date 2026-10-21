import { SalaryComponent, PayrollItemSnapshot, Employee, AttendanceRecord, EmployeeIncentiveRecord } from "./types";

export function calculateSalaryBreakdown(
  annualCtc: number,
  includePf: boolean = true,
  pfType: "percentage" | "fixed" = "percentage",
  pfValue: number = 12
): SalaryComponent {
  const monthlyCtc = Math.round(annualCtc / 12);
  
  // Calculate PF contribution
  let employerPf = 0;
  if (includePf) {
    if (pfType === "fixed") {
      employerPf = Math.max(0, Math.round(Number(pfValue) || 0));
    } else {
      const pct = typeof pfValue === "number" && !isNaN(pfValue) && pfValue >= 0 ? pfValue : 12;
      // In CTC-first model, basic is estimated at ~45-50% of monthly CTC
      const estimatedBasic = Math.round(monthlyCtc * 0.45);
      employerPf = Math.round(estimatedBasic * (pct / 100));
    }
  }

  const employerEsic = monthlyCtc <= 21000 ? Math.round(monthlyCtc * 0.0325) : 0;
  const grossSalary = Math.max(0, monthlyCtc - employerPf - employerEsic);
  
  // Basic is typically 50% of gross
  const basic = Math.round(grossSalary * 0.50);
  // HRA is typically 50% of basic (25% of gross)
  const hra = Math.round(basic * 0.50);
  // Special allowance
  const specialAllowance = Math.round(grossSalary * 0.15);
  // Other allowances balances the gross
  const otherAllowance = Math.max(0, grossSalary - basic - hra - specialAllowance);

  // Employee statutory deductions: equal to employer PF
  const employeePf = includePf ? employerPf : 0;
  const professionalTax = 0;
  const netSalary = Math.max(0, grossSalary - employeePf);

  return {
    annualCtc,
    monthlyCtc,
    netSalary,
    grossSalary,
    basic,
    hra,
    specialAllowance,
    otherAllowance,
    employerPf,
    employerEsic,
    employeePf,
    professionalTax,
    includePf,
    pfType,
    pfValue,
  };
}

export function calculateSalaryFromMonthly({
  monthlyAmount,
  salaryBasis = "monthly_net",
  includePf = true,
  pfType = "percentage",
  pfValue = 12,
}: {
  monthlyAmount: number;
  salaryBasis?: "monthly_net" | "monthly_gross" | "monthly_ctc";
  includePf?: boolean;
  pfType?: "percentage" | "fixed";
  pfValue?: number;
}): SalaryComponent {
  const amount = Math.max(0, Math.round(monthlyAmount));

  if (salaryBasis === "monthly_ctc") {
    return calculateSalaryBreakdown(amount * 12, includePf, pfType, pfValue);
  }

  let grossSalary = 0;
  let netSalary = 0;
  let employerPf = 0;
  let basic = 0;

  if (salaryBasis === "monthly_net") {
    netSalary = amount;
    if (!includePf) {
      employerPf = 0;
      grossSalary = netSalary;
      basic = Math.round(grossSalary * 0.50);
    } else if (pfType === "fixed") {
      employerPf = Math.max(0, Math.round(Number(pfValue) || 0));
      grossSalary = netSalary + employerPf;
      basic = Math.round(grossSalary * 0.50);
    } else {
      // Percentage mode: PF is pct% of Basic (Basic = 50% of gross)
      // Net = Gross - (0.5 * Gross * pct/100) = Gross * (1 - pct/200)
      const pct = typeof pfValue === "number" && !isNaN(pfValue) && pfValue >= 0 ? pfValue : 12;
      const factor = Math.max(0.01, 1 - pct / 200);
      grossSalary = Math.round(netSalary / factor);
      basic = Math.round(grossSalary * 0.50);
      employerPf = Math.round(basic * (pct / 100));
      netSalary = grossSalary - employerPf;
    }
  } else {
    // monthly_gross basis
    grossSalary = amount;
    basic = Math.round(grossSalary * 0.50);
    if (!includePf) {
      employerPf = 0;
    } else if (pfType === "fixed") {
      employerPf = Math.max(0, Math.round(Number(pfValue) || 0));
    } else {
      const pct = typeof pfValue === "number" && !isNaN(pfValue) && pfValue >= 0 ? pfValue : 12;
      employerPf = Math.round(basic * (pct / 100));
    }
    netSalary = Math.max(0, grossSalary - employerPf);
  }

  const hra = Math.round(basic * 0.50);
  const specialAllowance = Math.round(grossSalary * 0.15);
  const otherAllowance = Math.max(0, grossSalary - basic - hra - specialAllowance);

  const employerEsic = grossSalary <= 21000 ? Math.round(grossSalary * 0.0325) : 0;
  const employeePf = includePf ? employerPf : 0;
  const professionalTax = 0;

  const monthlyCtc = grossSalary + employerPf + employerEsic;
  const annualCtc = monthlyCtc * 12;

  return {
    annualCtc,
    monthlyCtc,
    netSalary,
    grossSalary,
    basic,
    hra,
    specialAllowance,
    otherAllowance,
    employerPf,
    employerEsic,
    employeePf,
    professionalTax,
    includePf,
    pfType,
    pfValue,
  };
}

export function calculateEmployeePayrollSnapshot({
  employee,
  attendanceRecords,
  approvedIncentives,
  bonus = 0,
  otherDeductions = 0,
}: {
  employee: Employee;
  attendanceRecords: AttendanceRecord[];
  approvedIncentives: EmployeeIncentiveRecord[];
  bonus?: number;
  otherDeductions?: number;
}): PayrollItemSnapshot {
  const salary = employee.currentSalary;
  
  // Count unexcused absences (LOP)
  // Present, Leave, Holiday, WFH, Weekend do not count as LOP
  const lopDays = attendanceRecords.filter((a) => a.status === "Absent").length;
  const perDayGross = Math.round(salary.grossSalary / 30);
  const lopAmount = lopDays * perDayGross;

  // Calculate Overtime hours
  const totalOvertimeHours = attendanceRecords.reduce((acc, curr) => acc + (curr.overtimeHours || 0), 0);
  const hourlyRate = Math.round(salary.grossSalary / 200); // 25 days * 8 hrs
  const overtimeAmount = Math.round(totalOvertimeHours * hourlyRate * 1.5);

  // Approved incentives for this employee
  const incentiveAmount = approvedIncentives.reduce((acc, curr) => acc + (curr.incentiveAmount || 0), 0);

  // Gross earnings
  const grossEarnings = salary.grossSalary + overtimeAmount + incentiveAmount + bonus;

  // Deductions
  const totalDeductions = salary.employeePf + salary.professionalTax + lopAmount + otherDeductions;

  // Net Take Home Pay
  const netSalary = Math.max(0, grossEarnings - totalDeductions);

  // Masked sensitive strings
  const panMasked = employee.statutory.pan
    ? `${employee.statutory.pan.slice(0, 2)}•••••${employee.statutory.pan.slice(-2)}`
    : "••••••••••";

  const bankAccountMasked = employee.statutory.bankAccountNumber
    ? `••••••••${employee.statutory.bankAccountNumber.slice(-4)}`
    : "••••••••0000";

  return {
    employeeId: employee.employeeId,
    employeeName: employee.personal.fullName,
    designation: employee.employment.designation,
    department: employee.employment.department,
    bankAccountMasked,
    ifscCode: employee.statutory.ifscCode,
    panMasked,
    basic: salary.basic,
    hra: salary.hra,
    otherAllowance: salary.otherAllowance + salary.specialAllowance,
    overtime: overtimeAmount,
    incentive: incentiveAmount,
    bonus,
    grossEarnings,
    employeePf: salary.employeePf,
    professionalTax: salary.professionalTax,
    lopDays,
    lopAmount,
    otherDeductions,
    totalDeductions,
    netSalary,
    employerPf: salary.employerPf,
    employerEsic: salary.employerEsic,
  };
}

export function numberToIndianCurrencyWords(num: number): string {
  if (num === 0) return "Zero Rupees Only";
  const a = [
    "",
    "One ",
    "Two ",
    "Three ",
    "Four ",
    "Five ",
    "Six ",
    "Seven ",
    "Eight ",
    "Nine ",
    "Ten ",
    "Eleven ",
    "Twelve ",
    "Thirteen ",
    "Fourteen ",
    "Fifteen ",
    "Sixteen ",
    "Seventeen ",
    "Eighteen ",
    "Nineteen ",
  ];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  function inWords(n: number): string {
    if (n < 20) return a[n];
    const digit = n % 10;
    return b[Math.floor(n / 10)] + (digit !== 0 ? " " + a[digit] : " ");
  }

  let str = "";
  let n = Math.floor(num);

  const crore = Math.floor(n / 10000000);
  n %= 10000000;
  const lakh = Math.floor(n / 100000);
  n %= 100000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  const hundred = Math.floor(n / 100);
  n %= 100;

  if (crore > 0) str += inWords(crore) + "Crore ";
  if (lakh > 0) str += inWords(lakh) + "Lakh ";
  if (thousand > 0) str += inWords(thousand) + "Thousand ";
  if (hundred > 0) str += inWords(hundred) + "Hundred ";
  if (n > 0) {
    if (str !== "") str += "and ";
    str += inWords(n);
  }

  return (str.trim() + " Rupees Only").replace(/\s+/g, " ");
}
