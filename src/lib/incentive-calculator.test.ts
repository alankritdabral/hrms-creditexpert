import { describe, it, expect } from "vitest";
import { calculateDisbursalIncentive } from "./incentive-calculator";

const L = 100000;

describe("calculateDisbursalIncentive", () => {
  it("pays Axis Bank disbursal at 200 per lakh, outside the hurdle", () => {
    const r = calculateDisbursalIncentive({
      monthlySalary: 15000,
      totalDisbursal: 10 * L,
      axisBankDisbursal: 10 * L,
      otherBanksDisbursal: 0,
    });
    expect(r.axisIncentive).toBe(2000);
    expect(r.slabIncentive).toBe(0);
    expect(r.totalIncentive).toBe(2000);
    expect(r.slabBracket).toBe("No Other Banks");
  });

  it("pays nothing on other banks below the salary hurdle", () => {
    const r = calculateDisbursalIncentive({
      monthlySalary: 15000,
      totalDisbursal: 10 * L,
      otherBanksDisbursal: 10 * L,
    });
    expect(r.salaryHurdle).toBe(15 * L);
    expect(r.totalIncentive).toBe(0);
    expect(r.isEligible).toBe(false);
    expect(r.slabBracket).toBe("Below Salary Hurdle");
  });

  it("applies the first slab after the hurdle", () => {
    const r = calculateDisbursalIncentive({
      monthlySalary: 15000,
      totalDisbursal: 31 * L,
      otherBanksDisbursal: 31 * L,
    });
    expect(r.remainingDisbursalForSlabs).toBe(16 * L);
    expect(r.slabRatePerLakh).toBe(200);
    expect(r.slabIncentive).toBe(3200);
  });

  it("uses the right rate at each slab edge", () => {
    const rate = (other: number) =>
      calculateDisbursalIncentive({ monthlySalary: 0, totalDisbursal: other, otherBanksDisbursal: other })
        .slabRatePerLakh;
    expect(rate(1499999)).toBe(0);
    expect(rate(1500000)).toBe(200);
    expect(rate(2600000)).toBe(200);
    expect(rate(2600001)).toBe(300);
    expect(rate(3600000)).toBe(300);
    expect(rate(3600001)).toBe(400);
    expect(rate(5600000)).toBe(400);
    expect(rate(5600001)).toBe(500);
  });

  it("gives a zero hurdle to a zero salary", () => {
    const r = calculateDisbursalIncentive({
      monthlySalary: 0,
      totalDisbursal: 20 * L,
      otherBanksDisbursal: 20 * L,
    });
    expect(r.salaryHurdle).toBe(0);
    expect(r.slabIncentive).toBe(4000);
  });
});

import { resolveIncentiveSalary, FALLBACK_MONTHLY_SALARY } from "./incentive-calculator";

describe("resolveIncentiveSalary", () => {
  it("uses the employee's gross salary", () => {
    expect(resolveIncentiveSalary({ currentSalary: { grossSalary: 30000 } })).toBe(30000);
    expect(resolveIncentiveSalary({ currentSalary: { grossSalary: 0, basic: 25000 } })).toBe(25000);
  });
  it("gives incentive-only staff a zero hurdle", () => {
    expect(resolveIncentiveSalary({ currentSalary: { grossSalary: 0, basic: 0, isIncentiveOnly: true } })).toBe(0);
    expect(resolveIncentiveSalary({ currentSalary: { grossSalary: 0, basic: 0 } })).toBe(0);
  });
  it("falls back only when there is no employee or salary data", () => {
    expect(resolveIncentiveSalary(null)).toBe(FALLBACK_MONTHLY_SALARY);
    expect(resolveIncentiveSalary({})).toBe(FALLBACK_MONTHLY_SALARY);
  });
  it("pays a zero-salary employee with 20 lakh other-bank disbursal Rs 4,000", () => {
    const r = calculateDisbursalIncentive({
      monthlySalary: resolveIncentiveSalary({ currentSalary: { grossSalary: 0, isIncentiveOnly: true } }),
      totalDisbursal: 20 * L,
      otherBanksDisbursal: 20 * L,
    });
    expect(r.totalIncentive).toBe(4000);
  });
});
