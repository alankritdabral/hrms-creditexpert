import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let currentAuth: any;
vi.mock("@/lib/api-auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-auth")>();
  return { ...actual, authenticateRequest: vi.fn(async () => currentAuth) };
});

import * as sheet from "@/app/api/login-sheet/route";
import * as logins from "@/app/api/logins/route";
import { getEmployeeLoginById } from "@/lib/db/db-adapter";

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
const carol = authFor("employee", "EMP-CAROL", "Carol");

const month = "2099-02";
const req = (url: string, method = "GET", body?: unknown) =>
  new NextRequest(`http://localhost${url}`, { method, body: body ? JSON.stringify(body) : undefined, headers: { "content-type": "application/json" } });

const sheetRow = (over: Record<string, unknown>) => ({
  customerName: "Amit",
  date: `${month}-10`,
  bankName: "Axis Bank",
  amount: 1250000,
  status: "SENT",
  ...over,
});
const recordFor = async (employeeId: string) =>
  ((await (await logins.GET(req(`/api/logins?month=${month}`))).json()).data as any[]).find((r) => r.employeeId === employeeId);

beforeEach(() => {
  currentAuth = admin;
});

describe("Logins & Disbursals pulls from the Login Sheet", () => {
  it("fills files count, banks and disbursals from sheet rows, and stays consistent after a save", async () => {
    currentAuth = carol;
    const created = (
      await (
        await sheet.POST(
          req("/api/login-sheet", "POST", {
            entries: [
              sheetRow({ bankName: "Tata Capital", status: "SENT" }),
              sheetRow({ bankName: "HDFC Bank", status: "APPROVED" }),
              sheetRow({ bankName: "Axis Bank", status: "DISBURSED", amount2: 1200000 }),
              sheetRow({ bankName: "ICICI Bank", status: "DISBURSED", amount: 300000 }),
            ],
          })
        )
      ).json()
    ).data as any[];
    expect(created).toHaveLength(4);

    currentAuth = admin;
    let rec = await recordFor("EMP-CAROL");
    expect(rec).toMatchObject({ employeeName: "Carol", sheetRows: 4, loginsCount: 1, totalDisbursal: 1500000, axisBankDisbursal: 1200000, otherBanksDisbursal: 300000 });
    expect(rec.banks.flatMap((b: any) => b.customers).every((c: any) => c.source === "login-sheet")).toBe(true);

    // The page saves back the combined record it loaded: only the typed fields may end up stored.
    const save = await logins.POST(req("/api/logins", "POST", { ...rec, commitment: 4000000, loginsCount: rec.loginsCount, remarks: "Strong month" }));
    expect((await save.json()).data).toMatchObject({ commitment: 4000000, totalDisbursal: 1500000, loginsCount: 1, sheetRows: 4 });
    const stored = await getEmployeeLoginById(rec.id);
    expect(stored).toMatchObject({ commitment: 4000000, remarks: "Strong month", banks: [], totalDisbursal: 0, loginsCount: 0 });

    // Deleting the sheet rows takes the pulled-in numbers away again; typed values stay.
    for (const r of created) await sheet.DELETE(req(`/api/login-sheet?id=${r.id}`, "DELETE"));
    rec = await recordFor("EMP-CAROL");
    expect(rec).toMatchObject({ commitment: 4000000, remarks: "Strong month", totalDisbursal: 0, loginsCount: 0, sheetRows: 0 });
    expect(rec.banks).toEqual([]);
  });

  it("lets someone delete their last hand-entered bank", async () => {
    currentAuth = admin;
    const base = { employeeId: "EMP-DAN", employeeName: "Dan", month, commitment: 1000000 };
    const withBank = {
      ...base,
      banks: [{ id: "b1", bankName: "HDFC Bank", isAxisBank: false, totalAmount: 0, customers: [{ id: "c1", customerName: "X", amount: 500000, status: "Disbursed", date: `${month}-02` }] }],
    };
    expect((await (await logins.POST(req("/api/logins", "POST", withBank))).json()).data.totalDisbursal).toBe(500000);
    const cleared = (await (await logins.POST(req("/api/logins", "POST", { ...base, banks: [] }))).json()).data;
    expect(cleared).toMatchObject({ banks: [], totalDisbursal: 0 });
    await logins.DELETE(req(`/api/logins?id=login-EMP-DAN-${month}`, "DELETE"));
  });
});
