import { UserRole, Branch } from "./types";

export type Permission =
  | "all:manage"
  | "employees:view_all"
  | "employees:manage"
  | "attendance:view_all"
  | "attendance:manage"
  | "leaves:view_all"
  | "leaves:manage"
  | "holidays:view"
  | "holidays:manage"
  | "payroll:view"
  | "payroll:manage"
  | "payroll:finalize"
  | "salary:view_all"
  | "salary:manage"
  | "incentives:view_all"
  | "incentives:manage"
  | "assets:view_all"
  | "assets:manage"
  | "documents:view_all"
  | "documents:manage"
  | "requests:view_all"
  | "requests:manage"
  | "announcements:manage"
  | "reports:view"
  | "settings:manage"
  | "audit_logs:view"
  | "onboarding:view_all"
  | "onboarding:manage"
  | "sensitive_data:unmask";

/**
 * Role to Permissions Mapping
 * Architecture is cleanly decoupled:
 * - admin: ALL permissions across all branches
 * - hr: ALL permissions across all branches (currently identical to admin)
 * - employee: self-service access + view holidays
 * 
 * Future-ready: HR permissions can later be scoped or restricted without code rewrites.
 */
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  admin: [
    "all:manage",
    "employees:view_all",
    "employees:manage",
    "attendance:view_all",
    "attendance:manage",
    "leaves:view_all",
    "leaves:manage",
    "holidays:view",
    "holidays:manage",
    "payroll:view",
    "payroll:manage",
    "payroll:finalize",
    "salary:view_all",
    "salary:manage",
    "incentives:view_all",
    "incentives:manage",
    "assets:view_all",
    "assets:manage",
    "documents:view_all",
    "documents:manage",
    "requests:view_all",
    "requests:manage",
    "announcements:manage",
    "reports:view",
    "settings:manage",
    "audit_logs:view",
    "onboarding:view_all",
    "onboarding:manage",
    "sensitive_data:unmask",
  ],
  hr: [
    // Identical full permissions in current version, but kept as a distinct role
    "all:manage",
    "employees:view_all",
    "employees:manage",
    "attendance:view_all",
    "attendance:manage",
    "leaves:view_all",
    "leaves:manage",
    "holidays:view",
    "holidays:manage",
    "payroll:view",
    "payroll:manage",
    "payroll:finalize",
    "salary:view_all",
    "salary:manage",
    "incentives:view_all",
    "incentives:manage",
    "assets:view_all",
    "assets:manage",
    "documents:view_all",
    "documents:manage",
    "requests:view_all",
    "requests:manage",
    "announcements:manage",
    "reports:view",
    "settings:manage",
    "audit_logs:view",
    "onboarding:view_all",
    "onboarding:manage",
    "sensitive_data:unmask",
  ],
  employee: [
    "holidays:view",
  ],
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  const permissions = ROLE_PERMISSIONS[role] || [];
  return permissions.includes("all:manage") || permissions.includes(permission);
}

export function getBranchScope(role: UserRole, userBranch?: Branch): Branch[] {
  if (role === "admin" || role === "hr") {
    return ["Delhi", "Dehradun", "Rudrapur"];
  }
  return userBranch ? [userBranch] : ["Delhi"];
}
