import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let currentAuth: any;
vi.mock("@/lib/api-auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-auth")>();
  return { ...actual, authenticateRequest: vi.fn(async () => currentAuth) };
});
// Never touch the real database from this test.
const remember = vi.fn(async () => ["Yes Bank"]);
vi.mock("@/lib/db/db-adapter", () => ({
  getLenderBanks: vi.fn(async () => ["Axis Bank", "Yes Bank"]),
  rememberLenderBanks: (...args: unknown[]) => remember(...(args as [])),
}));

import * as route from "@/app/api/lender-banks/route";

const authFor = (role: string, permissions: string[] = []) => ({
  authenticated: true,
  role,
  permissions,
  employeeId: "EMP-1",
  branch: "Delhi",
  branchScope: ["Delhi"],
  actor: { name: "Someone", role, employeeId: "EMP-1" },
  session: { name: "Someone", role },
});
const post = (body: unknown) =>
  new NextRequest("http://localhost/api/lender-banks", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });

beforeEach(() => {
  currentAuth = authFor("employee");
  remember.mockClear();
});

describe("/api/lender-banks", () => {
  it("lists the banks for any signed-in user", async () => {
    const json = await (await route.GET(new NextRequest("http://localhost/api/lender-banks"))).json();
    expect(json.data).toEqual(["Axis Bank", "Yes Bank"]);
  });

  it("saves a typed bank name, cleaned", async () => {
    const res = await route.POST(post({ name: "  Yes   Bank " }));
    expect(res.status).toBe(200);
    expect(remember).toHaveBeenCalledWith(["Yes Bank"], "Someone");
  });

  it("rejects blank or over-long names without saving", async () => {
    expect((await route.POST(post({ name: "  " }))).status).toBe(400);
    expect((await route.POST(post({ name: "x".repeat(200) }))).status).toBe(400);
    expect(remember).not.toHaveBeenCalled();
  });

  it("requires a signed-in user with the logins permission", async () => {
    currentAuth = { authenticated: false, status: 401, error: "no", code: "UNAUTHENTICATED" };
    expect((await route.POST(post({ name: "Yes Bank" }))).status).toBe(401);
    expect((await route.GET(new NextRequest("http://localhost/api/lender-banks"))).status).toBe(401);
  });
});
