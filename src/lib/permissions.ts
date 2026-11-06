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
 * Extra permissions an administrator may grant to a custom role in Settings. Deliberately a short
 * allow-list: salary, statutory data, payroll and settings are never grantable this way.
 */
export const GRANTABLE_PERMISSIONS: { permission: Permission; label: string; description: string }[] = [
  {
    permission: "logins:view_all",
    label: "View and delete everyone's logins",
    description: "See, edit and delete Logins & Disbursals records and Login Sheet rows of all employees, not just their own.",
  },
  {
    permission: "incentives:view_all",
    label: "View everyone's incentives",
    description: "See incentive records of all employees. Needed to edit them.",
  },
  {
    permission: "incentives:manage",
    label: "Edit and delete incentives",
    description: "Add, edit, delete and re-sync incentive records for any employee.",
  },
];

const GRANTABLE_SET = new Set<string>(GRANTABLE_PERMISSIONS.map((g) => g.permission));

/** Keeps only permissions that may be granted to a custom role; drops anything else. */
export function sanitizeGrantedPermissions(input: unknown): Permission[] {
  if (!Array.isArray(input)) return [];
  return Array.from(new Set(input.filter((p): p is Permission => typeof p === "string" && GRANTABLE_SET.has(p))));
}

/**
 * Who a permission check is for: a bare role id, or a role plus the extra permissions its custom
 * role grants (the shape of an authenticated request or a Caller).
 */
export type PermissionSubject = UserRole | { role: UserRole; permissions?: Permission[] };

function splitSubject(subject: PermissionSubject): { role: UserRole; granted: Permission[] } {
  return typeof subject === "string"
    ? { role: subject, granted: [] }
    : { role: subject.role, granted: sanitizeGrantedPermissions(subject.permissions) };
}

/**
 * Permissions for any role. Admin and HR use their lists; every other role, including the
 * "employee" role and any custom role created in Settings, gets self-service access plus whatever
 * extra (grantable) permissions its custom role carries.
 * (Custom roles otherwise control which sidebar sections are visible, not which people's data the API returns.)
 */
export function getRolePermissions(subject: PermissionSubject): Permission[] {
  const { role, granted } = splitSubject(subject);
  if (role === "admin") return ROLE_PERMISSIONS.admin;
  if (role === "hr") return ROLE_PERMISSIONS.hr;
  return Array.from(new Set([...ROLE_PERMISSIONS.employee, ...granted]));
}

export function hasPermission(subject: PermissionSubject, permission: Permission): boolean {
  if (splitSubject(subject).role === "admin") return true;
  const permissions = getRolePermissions(subject);
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
      "login_sheet",
      "incentives",
      "payslips",
      "requests",
      "announcements",
    ];
    return employeeSections.includes(sectionId);
  }
  return true;
}

