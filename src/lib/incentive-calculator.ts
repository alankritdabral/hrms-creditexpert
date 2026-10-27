import { IncentiveCalculationBreakdown } from "./types";

export interface DisbursalSlabConfig {
  min: number;
  max: number;
  ratePerLakh: number;
  label: string;
}

export const DEFAULT_DISBURSAL_SLABS: DisbursalSlabConfig[] = [
  { min: 1500000, max: 2600000, ratePerLakh: 200, label: "15 Lakh - 26 Lakh" },
  { min: 2600001, max: 3600000, ratePerLakh: 300, label: "26 Lakh - 36 Lakh" },
  { min: 3600001, max: 5600000, ratePerLakh: 400, label: "36 Lakh - 56 Lakh" },
  { min: 5600001, max: 999999999, ratePerLakh: 500, label: "> 56 Lakh" },
];

/**
 * Credit Expert India - Sales Disbursal Incentive Calculator
 * 
 * Rules:
 * 1. Axis Bank Disbursal is kept APART from the salary deduction:
 *    Axis Bank incentive rate is flat ₹200 per ₹1,00,000 (0.2%) on total Axis disbursals.
 * 2. Monthly Salary Hurdle = Monthly Salary * hurdleMultiplier (default 100x).
 *    The salary hurdle is subtracted strictly from OTHER BANKS disbursals (apart from Axis Bank):
 *    otherBanksAfterSalary = max(0, otherBanksDisbursal - salaryHurdle)
 * 3. The remaining other banks disbursal is evaluated against the flat General Slabs:
 *    - Below ₹15,00,000: ₹0 (no slab incentive)
 *    - ₹15,00,000 - ₹26,00,000: Flat ₹200 per lakh (0.2%)
 *    - ₹26,00,001 - ₹36,00,000: Flat ₹300 per lakh (0.3%)
 *    - ₹36,00,001 - ₹56,00,000: Flat ₹400 per lakh (0.4%)
 *    - Above ₹56,00,000: Flat ₹500 per lakh (0.5%)
 * 4. Total Incentive = Axis Bank Incentive + General Slab Incentive.
 */
export function calculateDisbursalIncentive({
  monthlySalary,
  totalDisbursal,
  axisBankDisbursal = 0,
  otherBanksDisbursal,
  hurdleMultiplier = 100,
  axisRatePerLakh = 200,
  slabs = DEFAULT_DISBURSAL_SLABS,
}: {
  monthlySalary: number;
  totalDisbursal: number;
  axisBankDisbursal?: number;
  otherBanksDisbursal?: number;
  hurdleMultiplier?: number;
  axisRatePerLakh?: number;
  slabs?: DisbursalSlabConfig[];
}): IncentiveCalculationBreakdown {
  const safeSalary = Math.max(0, Math.round(Number(monthlySalary) || 0));
  const safeAxisDisbursal = Math.max(0, Math.round(Number(axisBankDisbursal) || 0));
  const safeHurdleMultiplier = Math.max(1, Number(hurdleMultiplier) || 100);
  const safeAxisRate = Math.max(0, Number(axisRatePerLakh) || 200);

  // Compute other banks disbursal
  const safeOtherDisbursal =
    otherBanksDisbursal !== undefined
      ? Math.max(0, Math.round(Number(otherBanksDisbursal) || 0))
      : Math.max(0, Math.round(Number(totalDisbursal) || 0) - safeAxisDisbursal);

  const safeTotalDisbursal = Math.max(
    Math.round(Number(totalDisbursal) || 0),
    safeAxisDisbursal + safeOtherDisbursal
  );

  // 1. Axis Bank Incentive (Separated / Protected from salary cut)
  const axisIncentive = Math.round((safeAxisDisbursal / 100000) * safeAxisRate);

  // 2. Salary Hurdle on Other Banks
  const salaryHurdle = safeSalary * safeHurdleMultiplier;
  const disbursalAfterSalary = Math.max(0, safeOtherDisbursal - salaryHurdle);
  const remainingDisbursalForSlabs = disbursalAfterSalary;

  // 3. General Slabs evaluated on remaining other banks
  let slabBracket = "< 15 Lakh";
  let slabRatePerLakh = 0;

  if (remainingDisbursalForSlabs >= 1500000) {
    for (const slab of slabs) {
      if (remainingDisbursalForSlabs >= slab.min && remainingDisbursalForSlabs <= slab.max) {
        slabBracket = slab.label;
        slabRatePerLakh = slab.ratePerLakh;
        break;
      }
    }
  } else if (safeOtherDisbursal === 0) {
    slabBracket = "No Other Banks";
  } else if (safeOtherDisbursal <= salaryHurdle) {
    slabBracket = "Below Salary Hurdle";
  } else {
    slabBracket = "< 15 Lakh (Below Slab Threshold)";
  }

  const slabIncentive = Math.round((remainingDisbursalForSlabs / 100000) * slabRatePerLakh);
  const totalIncentive = axisIncentive + slabIncentive;
  const isEligible = totalIncentive > 0;

  return {
    monthlySalary: safeSalary,
    salaryHurdle,
    totalDisbursal: safeTotalDisbursal,
    isEligible,
    totalAxisDisbursal: safeAxisDisbursal,
    eligibleAxisDisbursal: safeAxisDisbursal,
    axisRatePerLakh: safeAxisRate,
    axisIncentive,
    otherBanksDisbursal: safeOtherDisbursal,
    disbursalAfterSalary,
    remainingDisbursalForSlabs,
    slabBracket,
    slabRatePerLakh,
    slabIncentive,
    totalIncentive,
  };
}
