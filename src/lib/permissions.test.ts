import { describe, it, expect } from "vitest";
import { hasPermission, getRolePermissions, getBranchScope, canRoleAccessSection } from "./permissions";

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
