import { describe, it, expect } from "vitest";
import { ownOrScoped, redactEmployee, resolveTargetEmployeeId, isOwnOrPermitted, type Caller } from "./access";
import type { Employee } from "./types";

const admin: Caller = { role: "admin", employeeId: "EMP-0001", branchScope: ["Delhi", "Dehradun", "Rudrapur"] };
const staff: Caller = { role: "employee", employeeId: "EMP-0002", branchScope: ["Delhi"] };
const custom: Caller = { role: "role-backend-team-1234", employeeId: "EMP-0003", branchScope: ["Delhi"] };

const items = [
  { employeeId: "EMP-0001", v: 1 },
  { employeeId: "EMP-0002", v: 2 },
  { employeeId: "EMP-0003", v: 3 },
];

describe("ownOrScoped", () => {
  it("gives view-all callers everything", () => {
    expect(ownOrScoped(admin, "leaves:view_all", items, (i) => i.employeeId)).toHaveLength(3);
  });
  it("limits employees and custom roles to their own records", () => {
    expect(ownOrScoped(staff, "leaves:view_all", items, (i) => i.employeeId)).toEqual([items[1]]);
    expect(ownOrScoped(custom, "leaves:view_all", items, (i) => i.employeeId)).toEqual([items[2]]);
  });
  it("applies branch scope for view-all callers when a branch getter is given", () => {
    const rows = [{ employeeId: "a", branch: "Delhi" as const }, { employeeId: "b", branch: "Rudrapur" as const }];
    const scoped: Caller = { ...admin, branchScope: ["Delhi"] };
    expect(ownOrScoped(scoped, "logins:view_all", rows, (r) => r.employeeId, (r) => r.branch)).toHaveLength(1);
  });
});

describe("resolveTargetEmployeeId", () => {
  it("lets managers act for others", () => {
    expect(resolveTargetEmployeeId(admin, "EMP-0009", "leaves:manage")).toBe("EMP-0009");
  });
  it("forces everyone else to themselves", () => {
    expect(resolveTargetEmployeeId(staff, "EMP-0009", "leaves:manage")).toBe("EMP-0002");
    expect(resolveTargetEmployeeId(custom, undefined, "leaves:manage")).toBe("EMP-0003");
  });
});

describe("isOwnOrPermitted", () => {
  it("allows own records and permitted callers only", () => {
    expect(isOwnOrPermitted(staff, "EMP-0002", "documents:view_all")).toBe(true);
    expect(isOwnOrPermitted(staff, "EMP-0001", "documents:view_all")).toBe(false);
    expect(isOwnOrPermitted(admin, "EMP-0002", "documents:view_all")).toBe(true);
  });
});

describe("redactEmployee", () => {
  const emp = {
    employeeId: "EMP-0001",
    statutory: { pan: "ABCDE1234F", aadhaar: "123412341234", uan: "u", pfAccountNumber: "p", bankAccountNumber: "999", ifscCode: "HDFC0000001", bankName: "HDFC" },
    currentSalary: { grossSalary: 50000 },
    salaryHistory: [{ id: "r1" }],
  } as unknown as Employee;

  it("shows admins everything", () => {
    expect(redactEmployee(emp, admin)).toBe(emp);
  });
  it("hides statutory and salary from employees and custom roles", () => {
    for (const c of [staff, custom]) {
      const r = redactEmployee(emp, c);
      expect(r.statutory.pan).toBe("••••••••••");
      expect(r.statutory.bankAccountNumber).toBe("••••••••••••");
      expect(r.currentSalary).toBeUndefined();
      expect(r.salaryHistory).toEqual([]);
    }
  });
  it("shows people their own record in full", () => {
    const self: Caller = { ...staff, employeeId: "EMP-0001" };
    expect(redactEmployee(emp, self)).toBe(emp);
  });
});
