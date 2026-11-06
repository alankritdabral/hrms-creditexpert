import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let currentAuth: any;
vi.mock("@/lib/api-auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-auth")>();
  return { ...actual, authenticateRequest: vi.fn(async () => currentAuth) };
});
// Never touch the real database from this test.
const create = vi.fn(async (owner: any, inputs: any[]) => inputs.map((i, n) => ({ ...i, id: `ls-${n}`, employeeId: owner.employeeId, empName: owner.empName })));
const update = vi.fn(async (id: string, input: any, owner: any) => ({ ...input, id, employeeId: owner?.employeeId ?? "EMP-OLD", empName: owner?.empName ?? "Old" }));
const ensureTemp = vi.fn(async (..._args: unknown[]) => null as unknown);
const byName = vi.fn(async (name: string, _branch: unknown, _actor: unknown) => ({ employeeId: "EMP-TEMP-1", personal: { fullName: name } }));
vi.mock("@/lib/db/db-adapter", () => ({
  createTemporaryEmployeeByName: (...a: unknown[]) => byName(...(a as [string, unknown, unknown])),
  ensureTemporaryEmployee: (...a: unknown[]) => ensureTemp(...a),
  getEmployees: vi.fn(async () => [
    { employeeId: "EMP-DEHRADUN", personal: { fullName: "Zoya" }, employment: { branch: "Dehradun" } },
  ]),
  getLoginSheetEntries: vi.fn(async () => []),
  getLoginSheetEntryById: vi.fn(async (id: string) => ({ id, employeeId: "EMP-OLD", empName: "Old", date: "2099-01-01" })),
  createLoginSheetEntries: (...a: unknown[]) => create(...(a as [any, any[]])),
  updateLoginSheetEntry: (...a: unknown[]) => update(...(a as [string, any, any])),
  deleteLoginSheetEntry: vi.fn(async () => true),
}));

import * as sheet from "@/app/api/login-sheet/route";

const authFor = (permissions: string[]) => ({
  authenticated: true,
  role: "role-backend-team-1234",
  permissions,
  employeeId: "EMP-DELHI",
  branch: "Delhi",
  branchScope: ["Delhi"],
  actor: { name: "Backend User", role: "role-backend-team-1234", employeeId: "EMP-DELHI" },
  session: { name: "Backend User", role: "role-backend-team-1234" },
});
const row = { customerName: "Amit", date: "2099-01-10", bankName: "Axis Bank", amount: 100000, status: "SENT" };
const req = (method: string, body: unknown) =>
  new NextRequest("http://localhost/api/login-sheet", { method, body: JSON.stringify(body), headers: { "content-type": "application/json" } });

beforeEach(() => {
  create.mockClear();
  update.mockClear();
  ensureTemp.mockClear();
  byName.mockClear();
});

describe("Login Sheet: custom role with logins:view_all", () => {
  it("can add a row for an employee in another branch", async () => {
    currentAuth = authFor(["logins:view_all"]);
    const res = await sheet.POST(req("POST", { employeeId: "EMP-DEHRADUN", entries: [row] }));
    expect(res.status).toBe(200);
    expect(create.mock.calls[0][0]).toEqual({ employeeId: "EMP-DEHRADUN", empName: "Zoya" });
  });

  it("can reassign an existing row to another employee", async () => {
    currentAuth = authFor(["logins:view_all"]);
    const res = await sheet.PUT(req("PUT", { id: "ls-1", employeeId: "EMP-DEHRADUN", ...row }));
    expect(res.status).toBe(200);
    expect(update.mock.calls[0][2]).toEqual({ employeeId: "EMP-DEHRADUN", empName: "Zoya" });
  });

  it("creates a temporary employee when entering as themselves, but not when entering for someone else", async () => {
    currentAuth = authFor(["logins:view_all"]);
    await sheet.POST(req("POST", { entries: [row] }));
    expect(ensureTemp).toHaveBeenCalledTimes(1);
    expect(ensureTemp.mock.calls[0][0]).toMatchObject({ employeeId: "EMP-DELHI", name: "Backend User", branch: "Delhi" });
    ensureTemp.mockClear();
    await sheet.POST(req("POST", { employeeId: "EMP-DEHRADUN", entries: [row] }));
    expect(ensureTemp).not.toHaveBeenCalled();
  });

  it("can type a new name, which becomes a temporary employee that owns the rows", async () => {
    currentAuth = authFor(["logins:view_all"]);
    const res = await sheet.POST(req("POST", { newEmployeeName: "  Ravi   Kumar ", entries: [{ ...row, branch: "Dehradun" }] }));
    expect(res.status).toBe(200);
    expect(byName).toHaveBeenCalledWith("Ravi Kumar", "Dehradun", expect.objectContaining({ name: "Backend User" }));
    expect(create.mock.calls[0][0]).toEqual({ employeeId: "EMP-TEMP-1", empName: "Ravi Kumar" });
  });

  it("can reassign an existing row to a newly typed name", async () => {
    currentAuth = authFor(["logins:view_all"]);
    const res = await sheet.PUT(req("PUT", { id: "ls-1", employeeId: "", newEmployeeName: "Ravi Kumar", ...row }));
    expect(res.status).toBe(200);
    expect(update.mock.calls[0][2]).toEqual({ employeeId: "EMP-TEMP-1", empName: "Ravi Kumar" });
  });

  it("rejects a typed name that is too short", async () => {
    currentAuth = authFor(["logins:view_all"]);
    expect((await sheet.POST(req("POST", { newEmployeeName: "A", entries: [row] }))).status).toBe(400);
    expect(byName).not.toHaveBeenCalled();
  });

  it("refuses a typed name without logins:view_all", async () => {
    currentAuth = authFor([]);
    expect((await sheet.POST(req("POST", { newEmployeeName: "Ravi Kumar", entries: [row] }))).status).toBe(403);
    expect(byName).not.toHaveBeenCalled();
  });

  it("cannot do either without the permission", async () => {
    currentAuth = authFor([]);
    expect((await sheet.POST(req("POST", { employeeId: "EMP-DEHRADUN", entries: [row] }))).status).toBe(403);
    expect((await sheet.PUT(req("PUT", { id: "ls-1", ...row }))).status).toBe(403);
    expect(create).not.toHaveBeenCalled();
  });
});
