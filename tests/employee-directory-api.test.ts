import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let currentAuth: any;
vi.mock("@/lib/api-auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-auth")>();
  return { ...actual, authenticateRequest: vi.fn(async () => currentAuth) };
});
// Never touch the real database from this test.
vi.mock("@/lib/db/db-adapter", () => ({
  getEmployees: vi.fn(async () => [
    {
      employeeId: "EMP-2",
      personal: { fullName: "Zoya", email: "z@x.com", phone: "9999999999" },
      employment: { branch: "Dehradun" },
      statutory: { pan: "ABCDE1234F" },
      currentSalary: { basic: 1 },
    },
    { employeeId: "EMP-1", personal: { fullName: "Amit" }, employment: { branch: "Delhi" } },
  ]),
}));

import * as route from "@/app/api/employee-directory/route";

const authFor = (role: string, permissions: string[] = []) => ({
  authenticated: true,
  role,
  permissions,
  employeeId: "EMP-9",
  branch: "Delhi",
  branchScope: ["Delhi"],
  actor: { name: "Someone", role, employeeId: "EMP-9" },
  session: { name: "Someone", role },
});
const get = () => route.GET(new NextRequest("http://localhost/api/employee-directory"));

beforeEach(() => {
  currentAuth = authFor("employee");
});

describe("/api/employee-directory", () => {
  it("lets a custom role with logins:view_all see every employee, names only", async () => {
    currentAuth = authFor("role-backend-team-1234", ["logins:view_all"]);
    const json = await (await get()).json();
    expect(json.data).toEqual([
      { employeeId: "EMP-1", name: "Amit", branch: "Delhi" },
      { employeeId: "EMP-2", name: "Zoya", branch: "Dehradun" },
    ]);
    expect(JSON.stringify(json)).not.toMatch(/pan|salary|phone|email/i);
  });

  it("refuses plain employees and custom roles without the permission", async () => {
    expect((await get()).status).toBe(403);
    currentAuth = authFor("role-backend-team-1234");
    expect((await get()).status).toBe(403);
  });

  it("allows admin", async () => {
    currentAuth = authFor("admin");
    expect((await get()).status).toBe(200);
  });
});
