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
  let basic = monthlyCtc;

  if (includePf) {
    if (pfType === "fixed") {
      employerPf = Math.max(0, Math.round(Number(pfValue) || 0));
      basic = Math.max(0, monthlyCtc - employerPf);
    } else {
      const pct = typeof pfValue === "number" && !isNaN(pfValue) && pfValue >= 0 ? pfValue : 12;
      // In CTC-first model: monthlyCtc = basic + employerPf = basic * (1 + pct / 100)
      basic = Math.round(monthlyCtc / (1 + pct / 100));
      employerPf = Math.round(basic * (pct / 100));
    }
  }

  const employerEsic = 0; // No ESIC deductions
  const grossSalary = basic; // Basic pay is the gross pay
  
  // No arbitrary allowance splits - basic pay is the full pay
  const hra = 0;
  const specialAllowance = 0;
  const otherAllowance = 0;

  // Deductions: ONLY PF
  const employeePf = includePf ? employerPf : 0;
  const professionalTax = 0; // No Professional Tax
  const netSalary = Math.max(0, basic - employeePf);

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
  salaryBasis?: "monthly_net" | "monthly_gross" | "monthly_ctc" | "incentive_only";
  includePf?: boolean;
  pfType?: "percentage" | "fixed";
  pfValue?: number;
}): SalaryComponent {
  if (salaryBasis === "incentive_only") {
    return {
      annualCtc: 0,
      monthlyCtc: 0,
      netSalary: 0,
      grossSalary: 0,
      basic: 0,
      hra: 0,
      specialAllowance: 0,
      otherAllowance: 0,
      employerPf: 0,
      employerEsic: 0,
      employeePf: 0,
      professionalTax: 0,
      includePf: false,
      pfType: "percentage",
      pfValue: 0,
      isIncentiveOnly: true,
    };
  }

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
      basic = netSalary;
      grossSalary = basic;
    } else if (pfType === "fixed") {
      employerPf = Math.max(0, Math.round(Number(pfValue) || 0));
      basic = netSalary + employerPf;
      grossSalary = basic;
    } else {
      // Percentage mode: Net = Basic - (Basic * pct / 100) = Basic * (1 - pct / 100)
      const pct = typeof pfValue === "number" && !isNaN(pfValue) && pfValue >= 0 ? pfValue : 12;
      const factor = Math.max(0.01, 1 - pct / 100);
      basic = Math.round(netSalary / factor);
      employerPf = basic - netSalary;
      grossSalary = basic;
    }
  } else {
    // monthly_gross basis: Basic is the gross amount
    grossSalary = amount;
    basic = amount;
    if (!includePf) {
      employerPf = 0;
    } else if (pfType === "fixed") {
      employerPf = Math.max(0, Math.round(Number(pfValue) || 0));
    } else {
      const pct = typeof pfValue === "number" && !isNaN(pfValue) && pfValue >= 0 ? pfValue : 12;
      employerPf = Math.round(basic * (pct / 100));
    }
    netSalary = Math.max(0, basic - employerPf);
  }

  const hra = 0;
  const specialAllowance = 0;
  const otherAllowance = 0;

  const employerEsic = 0;
  const employeePf = includePf ? employerPf : 0;
  const professionalTax = 0;

  const monthlyCtc = grossSalary + employerPf;
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
  const lopDays = attendanceRecords.filter((a) => a.status === "Absent").length;
  const perDayGross = Math.round((salary.grossSalary || salary.basic) / 30);
  const lopAmount = lopDays * perDayGross;

  // Calculate Overtime hours
  const totalOvertimeHours = attendanceRecords.reduce((acc, curr) => acc + (curr.overtimeHours || 0), 0);
  const hourlyRate = Math.round((salary.grossSalary || salary.basic) / 200); // 25 days * 8 hrs
  const overtimeAmount = Math.round(totalOvertimeHours * hourlyRate * 1.5);

  // Approved incentives for this employee
  const incentiveAmount = approvedIncentives.reduce((acc, curr) => acc + (curr.incentiveAmount || 0), 0);

  // Gross earnings: Basic pay + any earned overtime/incentives/bonus
  const grossEarnings = (salary.grossSalary || salary.basic) + overtimeAmount + incentiveAmount + bonus;

  // Deductions: Strictly ONLY employee PF (+ unexcused absence LOP if any)
  const totalDeductions = (salary.employeePf || 0) + lopAmount;

  // Net Take Home Pay: Basic Pay is the Net Pay apart from PF
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
    basic: salary.basic || salary.grossSalary,
    hra: 0,
    otherAllowance: 0,
    overtime: overtimeAmount,
    incentive: incentiveAmount,
    bonus,
    grossEarnings,
    employeePf: salary.employeePf || 0,
    professionalTax: 0,
    lopDays,
    lopAmount,
    otherDeductions: 0,
    totalDeductions,
    netSalary,
    employerPf: salary.employerPf || 0,
    employerEsic: 0,
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
