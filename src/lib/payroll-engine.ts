import { SalaryComponent, PayrollItemSnapshot, Employee, AttendanceRecord, EmployeeIncentiveRecord } from "./types";

export function calculateSalaryBreakdown(
  annualCtc: number,
  includePf: boolean = true
): SalaryComponent {
  const monthlyCtc = Math.round(annualCtc / 12);
  
  // Standard Indian Payroll structure:
  // Gross + Employer PF (capped at 1,800/mo) = Monthly CTC
  const employerPf = includePf ? Math.min(1800, Math.round(monthlyCtc * 0.05)) : 0;
  const employerEsic = monthlyCtc <= 21000 ? Math.round(monthlyCtc * 0.0325) : 0;
  
  const grossSalary = monthlyCtc - employerPf - employerEsic;
  
  // Basic is typically 50% of gross
  const basic = Math.round(grossSalary * 0.50);
  // HRA is typically 50% of basic (25% of gross)
  const hra = Math.round(basic * 0.50);
  // Special allowance
  const specialAllowance = Math.round(grossSalary * 0.15);
  // Other allowances balances the gross
  const otherAllowance = Math.max(0, grossSalary - basic - hra - specialAllowance);

  // Employee statutory deductions
  const employeePf = includePf ? employerPf : 0; // Equal employee contribution
  const professionalTax = 0;

  return {
    annualCtc,
    monthlyCtc,
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
  };
}

export function calculateSalaryFromMonthly({
  monthlyAmount,
  salaryBasis = "monthly_gross",
  includePf = true,
}: {
  monthlyAmount: number;
  salaryBasis?: "monthly_gross" | "monthly_ctc";
  includePf?: boolean;
}): SalaryComponent {
  const amount = Math.max(0, Math.round(monthlyAmount));

  if (salaryBasis === "monthly_ctc") {
    return calculateSalaryBreakdown(amount * 12, includePf);
  }

  // Monthly Gross basis:
  // User specifies gross fixed monthly pay
  const grossSalary = amount;
  const basic = Math.round(grossSalary * 0.50);
  const hra = Math.round(basic * 0.50);
  const specialAllowance = Math.round(grossSalary * 0.15);
  const otherAllowance = Math.max(0, grossSalary - basic - hra - specialAllowance);

  // Statutory PF: 12% of basic, capped at ₹1,800/mo
  const employerPf = includePf ? Math.min(1800, Math.round(basic * 0.12)) : 0;
  const employerEsic = grossSalary <= 21000 ? Math.round(grossSalary * 0.0325) : 0;

  const employeePf = includePf ? employerPf : 0;
  const professionalTax = 0;

  const monthlyCtc = grossSalary + employerPf + employerEsic;
  const annualCtc = monthlyCtc * 12;

  return {
    annualCtc,
    monthlyCtc,
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
