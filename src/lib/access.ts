import { hasPermission, type Permission } from "./permissions";
import type { Branch, Employee, SalaryComponent, UserRole } from "./types";

/**
 * Pure access-control helpers. No database or framework imports, so they stay unit-testable.
 * Authorisation is always by permission, never by role name.
 */
export interface Caller {
  role: UserRole;
  employeeId: string;
  branchScope: Branch[];
}

/** Whether the caller may act on, or read, records belonging to the given employee. */
export function isOwnOrPermitted(caller: Caller, targetEmployeeId: string | undefined, permission: Permission): boolean {
  if (!targetEmployeeId) return true;
  if (targetEmployeeId === caller.employeeId) return true;
  return hasPermission(caller.role, permission);
}

/**
 * Callers holding `viewAllPermission` see every item (optionally limited to their branch scope);
 * everyone else sees only items belonging to themselves.
 */
export function ownOrScoped<T>(
  caller: Caller,
  viewAllPermission: Permission,
  items: T[],
  getEmployeeId: (item: T) => string | undefined,
  getBranch?: (item: T) => Branch | undefined
): T[] {
  if (!hasPermission(caller.role, viewAllPermission)) {
    return items.filter((i) => getEmployeeId(i) === caller.employeeId);
  }
  if (!getBranch) return items;
  return items.filter((i) => {
    const b = getBranch(i);
    return !b || caller.branchScope.includes(b);
  });
}

/** Who an actor is allowed to record something for: others only with the manage permission. */
export function resolveTargetEmployeeId(
  caller: Caller,
  requestedEmployeeId: string | undefined,
  managePermission: Permission
): string {
  if (requestedEmployeeId && requestedEmployeeId !== caller.employeeId && hasPermission(caller.role, managePermission)) {
    return requestedEmployeeId;
  }
  return caller.employeeId;
}

const MASKED_STATUTORY = {
  pan: "••••••••••",
  aadhaar: "••••••••••••",
  uan: "••••••••••••",
  pfAccountNumber: "••••••••••••",
  bankAccountNumber: "••••••••••••",
  ifscCode: "•••••••••••",
};

/**
 * Hides statutory/bank details and salary of other people from callers without the right permission.
 * A person always sees their own record in full.
 */
export function redactEmployee(emp: Employee, caller: Caller): Employee {
  if (emp.employeeId === caller.employeeId) return emp;
  let out = emp;
  if (!hasPermission(caller.role, "sensitive_data:unmask")) {
    out = {
      ...out,
      statutory: { ...MASKED_STATUTORY, bankName: emp.statutory?.bankName || "Confidential" },
    };
  }
  if (!hasPermission(caller.role, "salary:view_all")) {
    out = { ...out, currentSalary: undefined as unknown as SalaryComponent, salaryHistory: [] };
  }
  return out;
}
