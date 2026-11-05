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
  | "logins:view_all"
  | "logins:manage"
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
    "logins:view_all",
    "logins:manage",
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
    "logins:view_all",
    "logins:manage",
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
  // Self-service only. "logins:manage" lets a person maintain their OWN login records;
  // the API forces the employee ID to the caller's, so it never grants access to others.
  employee: ["holidays:view", "logins:manage"],
};

/**
 * Permissions for any role. Admin and HR use their lists; every other role, including the
 * "employee" role and any custom role created in Settings, gets self-service access only.
 * (Custom roles control which sidebar sections are visible, not which people's data the API returns.)
 */
export function getRolePermissions(role: UserRole): Permission[] {
  if (role === "admin") return ROLE_PERMISSIONS.admin;
  if (role === "hr") return ROLE_PERMISSIONS.hr;
  return ROLE_PERMISSIONS.employee;
}

export function hasPermission(role: UserRole, permission: Permission): boolean {
  if (role === "admin") return true;
  const permissions = getRolePermissions(role);
  return permissions.includes("all:manage") || permissions.includes(permission);
}

export function getBranchScope(role: UserRole, userBranch?: Branch): Branch[] {
  if (role === "admin" || role === "hr") {
    return ["Delhi", "Dehradun", "Rudrapur"];
  }
  return userBranch ? [userBranch] : ["Delhi"];
}

export function canRoleAccessSection(
  roleId: string,
  sectionId: string,
  userAllowedSections?: string[]
): boolean {
  if (roleId === "admin") return true;
  if (userAllowedSections && userAllowedSections.length > 0) {
    return userAllowedSections.includes(sectionId);
  }
  if (roleId === "hr") return true;
  if (roleId === "employee") {
    const employeeSections = [
      "dashboard",
      "profile",
      "attendance",
      "leaves",
      "holidays",
      "logins",
      "incentives",
      "payslips",
      "requests",
      "announcements",
    ];
    return employeeSections.includes(sectionId);
  }
  return true;
}

