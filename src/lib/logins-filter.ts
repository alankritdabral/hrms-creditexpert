import type { EmployeeLoginRecord } from "@/lib/types";

export type CustomerStatus = "Disbursed" | "Sanctioned" | "In Process" | "Rejected";
export type AchievementFilter = "all" | "met" | "progress" | "none";
export type LoginsTargetFilter = "all" | "met" | "below";

export interface LoginFilters {
  search: string;
  branch: string; // "" = any
  department: string; // "" = any
  bank: string; // "" = any
  customerStatus: "" | CustomerStatus;
  achievement: AchievementFilter;
  loginsTarget: LoginsTargetFilter;
}

export const EMPTY_LOGIN_FILTERS: LoginFilters = {
  search: "",
  branch: "",
  department: "",
  bank: "",
  customerStatus: "",
  achievement: "all",
  loginsTarget: "all",
};

/** Number of filters (not counting the search box) that are narrowing the list. */
export function activeFilterCount(f: LoginFilters): number {
  return [f.branch, f.department, f.bank, f.customerStatus, f.achievement !== "all" ? "x" : "", f.loginsTarget !== "all" ? "x" : ""].filter(Boolean).length;
}

/** Files target for a record: the saved login commitment, else a default based on the amount commitment. */
export function loginTarget(r: Pick<EmployeeLoginRecord, "loginCommitment" | "commitment">): number {
  return r.loginCommitment ?? (r.commitment >= 10000000 ? 15 : r.commitment >= 5000000 ? 10 : 5);
}

export function achievementOf(r: Pick<EmployeeLoginRecord, "totalDisbursal" | "commitment">): "met" | "progress" | "none" {
  const disbursed = r.totalDisbursal || 0;
  if (disbursed <= 0) return "none";
  if (r.commitment > 0 && disbursed >= r.commitment) return "met";
  return r.commitment > 0 ? "progress" : "met"; // no commitment set: any disbursal counts as achieved
}

export function filterLogins(records: EmployeeLoginRecord[], f: LoginFilters): EmployeeLoginRecord[] {
  const q = f.search.trim().toLowerCase();
  return records.filter((r) => {
    if (q) {
      const hay = [r.employeeName, r.employeeId, r.department, r.branch, r.remarks].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (f.branch && r.branch !== f.branch) return false;
    if (f.department && r.department !== f.department) return false;
    if (f.bank && !(r.banks || []).some((b) => b.bankName === f.bank)) return false;
    if (f.customerStatus && !(r.banks || []).some((b) => b.customers.some((c) => c.status === f.customerStatus))) return false;
    if (f.achievement !== "all" && achievementOf(r) !== f.achievement) return false;
    if (f.loginsTarget !== "all") {
      const met = (r.loginsCount || 0) >= loginTarget(r);
      if ((f.loginsTarget === "met") !== met) return false;
    }
    return true;
  });
}

/** Distinct, sorted values for a filter dropdown. */
export function distinct(values: (string | undefined)[]): string[] {
  return Array.from(new Set(values.filter((v): v is string => !!v))).sort((a, b) => a.localeCompare(b));
}
