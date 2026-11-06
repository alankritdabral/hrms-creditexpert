import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Only authentication is faked; permissions, validation and the (in-memory) database are the real code.
let currentAuth: any;
vi.mock("@/lib/api-auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-auth")>();
  return { ...actual, authenticateRequest: vi.fn(async () => currentAuth) };
});

import { GET, POST, PUT, DELETE } from "@/app/api/login-sheet/route";

const authFor = (role: string, employeeId: string, name: string) => ({
  authenticated: true,
  role,
  employeeId,
  branch: "Delhi",
  branchScope: ["Delhi", "Dehradun", "Rudrapur"],
  actor: { name, role, employeeId },
  session: { name, role },
});

const admin = authFor("admin", "ADMIN-1", "Admin User");
const alice = authFor("employee", "EMP-ALICE", "Alice");
const bob = authFor("employee", "EMP-BOB", "Bob");

const url = (qs = "") => `http://localhost/api/login-sheet${qs}`;
const send = (method: string, body?: unknown, qs = "") =>
  new NextRequest(url(qs), { method, body: body ? JSON.stringify(body) : undefined, headers: { "content-type": "application/json" } });

const day = "2099-01-15"; // far-future date so rows never collide with anything else in the in-memory store
const row = (over: Record<string, unknown> = {}) => ({
  customerName: "Amit",
  panNo: "ABCDE1111A",
  phone: "9999999999",
  date: day,
  bankName: "Tata Capital",
  amount: 1250000,
  status: "SENT",
  remarks: "Link sent",
  ...over,
});
const list = async () => (await (await GET(send("GET", undefined, `?from=${day}&to=${day}`))).json()).data as any[];

beforeEach(() => {
  currentAuth = admin;
});

describe("login sheet API", () => {
  it("creates one row per bank for the caller and lists them newest first", async () => {
    currentAuth = alice;
    const res = await POST(send("POST", { entries: [row(), row({ bankName: "HDFC Bank", status: "DISBURSED", amount2: 1200000 })] }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data).toHaveLength(2);
    expect(json.data[0]).toMatchObject({ employeeId: "EMP-ALICE", empName: "Alice", customerName: "AMIT", bankName: "TATA CAPITAL" });

    const rows = await list();
    expect(rows.filter((r) => r.employeeId === "EMP-ALICE")).toHaveLength(2);
    for (const r of rows) await DELETE(send("DELETE", undefined, `?id=${r.id}`));
  });

  it("rejects invalid rows with a message and saves nothing", async () => {
    const res = await POST(send("POST", { entries: [row(), row({ panNo: "ABCD1111A" })] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Row 2: PAN/);
    expect(await list()).toHaveLength(0);
    expect((await POST(send("POST", { entries: [] }))).status).toBe(400);
  });

  it("limits employees to their own rows, for reading, editing and deleting", async () => {
    currentAuth = alice;
    const [mine] = (await (await POST(send("POST", { entries: [row()] }))).json()).data;

    currentAuth = bob;
    expect(await list()).toEqual([]);
    expect((await PUT(send("PUT", { id: mine.id, ...row({ status: "REJECT" }) }))).status).toBe(403);
    expect((await DELETE(send("DELETE", undefined, `?id=${mine.id}`))).status).toBe(403);
    expect((await POST(send("POST", { employeeId: "EMP-ALICE", entries: [row()] }))).status).toBe(403);

    currentAuth = admin;
    expect((await list()).map((r) => r.id)).toContain(mine.id);
    expect((await DELETE(send("DELETE", undefined, `?id=${mine.id}`))).status).toBe(200);
  });

  it("updates a row, and removes an optional field the user cleared", async () => {
    currentAuth = alice;
    const [created] = (await (await POST(send("POST", { entries: [row({ remarks: "Link sent", amount2: 5 })] }))).json()).data;

    const res = await PUT(send("PUT", { id: created.id, ...row({ status: "approved", remarks: "", amount2: "" }) }));
    const updated = (await res.json()).data;
    expect(res.status).toBe(200);
    expect(updated.status).toBe("APPROVED");
    expect(updated).not.toHaveProperty("remarks");
    expect(updated).not.toHaveProperty("amount2");
    expect(updated.employeeId).toBe("EMP-ALICE");
    expect(updated.createdAt).toBe(created.createdAt);

    expect((await PUT(send("PUT", { id: "ls-missing", ...row() }))).status).toBe(404);
    expect((await DELETE(send("DELETE", undefined, `?id=${created.id}`))).status).toBe(200);
    expect((await DELETE(send("DELETE", undefined, `?id=${created.id}`))).status).toBe(404);
  });

  it("validates the date range", async () => {
    expect((await GET(send("GET", undefined, "?from=2026-11-10&to=2026-11-01"))).status).toBe(400);
    expect((await GET(send("GET", undefined, "?from=abc&to=2026-11-01"))).status).toBe(400);
    expect((await GET(send("GET", undefined, "?from=2020-01-01&to=2026-11-01"))).status).toBe(400);
  });

  it("returns 401 without a session", async () => {
    currentAuth = { authenticated: false, status: 401, error: "Not signed in", code: "UNAUTHENTICATED" };
    expect((await GET(send("GET"))).status).toBe(401);
    expect((await POST(send("POST", { entries: [row()] }))).status).toBe(401);
  });
});
