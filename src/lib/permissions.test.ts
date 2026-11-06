import { describe, it, expect } from "vitest";
import { hasPermission, getRolePermissions, getBranchScope, canRoleAccessSection, sanitizeGrantedPermissions, effectiveRoleGrants, defaultGrantsForRoleName } from "./permissions";

describe("permissions (current behaviour)", () => {
  it("gives admin and hr every permission", () => {
    expect(hasPermission("admin", "payroll:finalize")).toBe(true);
    expect(hasPermission("hr", "salary:manage")).toBe(true);
  });

  it("gives employees only a small set", () => {
    expect(hasPermission("employee", "holidays:view")).toBe(true);
    expect(hasPermission("employee", "employees:view_all")).toBe(false);
  });

  it("gives custom roles the self-service employee set, never manager permissions", () => {
    expect(hasPermission("branch_manager", "holidays:view")).toBe(true);
    expect(hasPermission("branch_manager", "employees:view_all")).toBe(false);
    expect(hasPermission("role-backend-team-1234", "salary:view_all")).toBe(false);
    expect(hasPermission("role-backend-team-1234", "sensitive_data:unmask")).toBe(false);
  });

  it("does not let employees see everyone's logins or incentives", () => {
    expect(hasPermission("employee", "logins:view_all")).toBe(false);
    expect(hasPermission("employee", "incentives:view_all")).toBe(false);
  });
});

describe("getRolePermissions", () => {
  it("returns the employee list for unknown roles", () => {
    expect(getRolePermissions("anything")).toEqual(getRolePermissions("employee"));
  });
});

describe("getBranchScope", () => {
  it("lets admin and hr see all branches", () => {
    expect(getBranchScope("admin")).toHaveLength(3);
    expect(getBranchScope("hr", "Delhi")).toHaveLength(3);
  });
  it("restricts everyone else to their own branch", () => {
    expect(getBranchScope("employee", "Rudrapur")).toEqual(["Rudrapur"]);
    expect(getBranchScope("branch_manager", "Dehradun")).toEqual(["Dehradun"]);
  });
});

describe("canRoleAccessSection", () => {
  it("uses explicit allowed sections when given", () => {
    expect(canRoleAccessSection("branch_manager", "payroll", ["dashboard"])).toBe(false);
    expect(canRoleAccessSection("branch_manager", "dashboard", ["dashboard"])).toBe(true);
  });
  it("hides admin sections from employees", () => {
    expect(canRoleAccessSection("employee", "payroll")).toBe(false);
    expect(canRoleAccessSection("employee", "attendance")).toBe(true);
  });
});

describe("granted permissions on custom roles", () => {
  const backend = { role: "role-backend-team-1234", permissions: ["logins:view_all", "incentives:view_all", "incentives:manage"] as const };

  it("adds the granted permissions on top of self-service", () => {
    const subject = { role: backend.role, permissions: [...backend.permissions] };
    expect(hasPermission(subject, "logins:view_all")).toBe(true);
    expect(hasPermission(subject, "incentives:manage")).toBe(true);
    expect(hasPermission(subject, "logins:manage")).toBe(true);
  });

  it("never grants anything outside the allow-list", () => {
    const subject = { role: backend.role, permissions: ["salary:view_all", "all:manage", "settings:manage", "payroll:finalize"] as never };
    expect(hasPermission(subject, "salary:view_all")).toBe(false);
    expect(hasPermission(subject, "all:manage")).toBe(false);
    expect(hasPermission(subject, "settings:manage")).toBe(false);
    expect(sanitizeGrantedPermissions(["salary:view_all", "logins:view_all", "logins:view_all", 5])).toEqual(["logins:view_all"]);
  });

  it("does not change what a bare role id gets", () => {
    expect(hasPermission(backend.role, "logins:view_all")).toBe(false);
    expect(getRolePermissions({ role: "employee", permissions: ["incentives:manage"] })).toContain("incentives:manage");
  });
});

describe("default grants by role name", () => {
  it("gives a never-configured Backend Team role its defaults, whatever the id or spelling", () => {
    expect(effectiveRoleGrants({ name: "Backend Team" })).toEqual(["logins:view_all", "incentives:view_all", "incentives:manage"]);
    expect(defaultGrantsForRoleName("  backend-team ")).toHaveLength(3);
  });
  it("lets an administrator override the defaults, including with nothing ticked", () => {
    expect(effectiveRoleGrants({ name: "Backend Team", permissions: [] })).toEqual([]);
    expect(effectiveRoleGrants({ name: "Backend Team", permissions: ["logins:view_all"] })).toEqual(["logins:view_all"]);
  });
  it("gives other roles nothing by default", () => {
    expect(effectiveRoleGrants({ name: "Team Lead" })).toEqual([]);
  });
});
