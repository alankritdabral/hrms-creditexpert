import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const sent: { email: string; hasRule: boolean }[] = [];
vi.mock("@/lib/email", () => ({
  sendAttendanceReminderEmail: vi.fn(async (email: string, _n: string, _d: string, rule?: unknown) => {
    sent.push({ email, hasRule: !!rule });
    return true;
  }),
}));

import { GET } from "./route";
import { createUserAccount, saveCustomRole, punchAttendance } from "@/lib/db/db-adapter";
import { isFirestoreConfigured } from "@/lib/firestore-service";
import type { UserAccount } from "@/lib/types";

const account = (employeeId: string, role: string, extra: Partial<UserAccount> = {}): UserAccount => ({
  uid: `uid-${employeeId}`,
  employeeId,
  email: `${employeeId.toLowerCase()}@example.com`,
  password: "x",
  name: employeeId,
  role,
  branch: "Dehradun", // role timings apply outside Delhi
  department: "Sales",
  avatar: "",
  status: "Active",
  createdAt: "2026-01-01T00:00:00.000Z",
  ...extra,
});

// The in-memory store also holds the seeded admin (Delhi) and accounts from earlier tests.
const emails = (prefix: string) => sent.map((s) => s.email).filter((e) => e.startsWith(prefix)).sort();

const call = (scope?: string) =>
  GET(new Request(`http://localhost/api/cron/attendance-reminder${scope ? `?scope=${scope}` : ""}`, { headers: { authorization: "Bearer test-secret" } }) as never);

describe("attendance reminder cron", () => {
  beforeAll(() => {
    if (isFirestoreConfigured()) throw new Error("Refusing to run: Firestore credentials are present in the test environment.");
  });
  beforeEach(() => {
    sent.length = 0;
    process.env.CRON_SECRET = "test-secret";
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2026, 10, 2, 4, 15))); // Monday 09:45 IST
  });
  afterEach(() => vi.useRealTimers());

  it("emails only active, unmarked people whose role is on Timing 1", async () => {
    await saveCustomRole({ id: "early", name: "Early", sections: ["dashboard"], timingSlot: "timing1" });
    await saveCustomRole({ id: "standard", name: "Standard", sections: ["dashboard"], timingSlot: "timing2" });
    await createUserAccount(account("EMP-A", "early"));
    await createUserAccount(account("EMP-B", "standard"));
    await createUserAccount(account("EMP-C", "employee")); // no slot -> Timing 2
    await createUserAccount(account("EMP-D", "early", { status: "Suspended" }));
    await createUserAccount(account("EMP-E", "early"));
    vi.setSystemTime(new Date(Date.UTC(2026, 10, 2, 4, 0))); // 09:30 IST, on time
    await punchAttendance("EMP-E", "checkIn", { name: "x", role: "admin" }); // already clocked in
    vi.setSystemTime(new Date(Date.UTC(2026, 10, 2, 4, 15)));

    const res = await call();
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(sent.map((s) => s.email)).toEqual(["emp-a@example.com"]);
    expect(sent[0].hasRule).toBe(true);
  });

  it("scope=delhi mails only unmarked Delhi staff, whatever their role; scope=other skips them", async () => {
    await saveCustomRole({ id: "early", name: "Early", sections: ["dashboard"], timingSlot: "timing1" });
    await createUserAccount(account("EMP-DEL1", "employee", { branch: "Delhi" })); // Timing 2 role, Delhi
    await createUserAccount(account("EMP-DEL2", "early", { branch: "Delhi" })); // Timing 1 role, Delhi
    await createUserAccount(account("EMP-DEL3", "employee", { branch: "Delhi", status: "Suspended" }));
    await createUserAccount(account("EMP-DUN1", "early", { branch: "Dehradun" }));
    await createUserAccount(account("EMP-DUN2", "employee", { branch: "Dehradun" }));
    vi.setSystemTime(new Date(Date.UTC(2026, 10, 2, 4, 30))); // Monday 10:00 IST

    const body = await (await call("delhi")).json();
    expect(body.scope).toBe("delhi");
    expect(emails("emp-")).toEqual(["emp-del1@example.com", "emp-del2@example.com"]);
    expect(sent.every((s) => s.hasRule)).toBe(true);

    sent.length = 0;
    await (await call("other")).json();
    expect(emails("emp-dun")).toEqual(["emp-dun1@example.com"]); // Timing 1 role outside Delhi, not the Timing 2 one
    expect(emails("emp-del")).toEqual([]); // Delhi is only mailed by the delhi run
  });

  it("scope=delhi skips a Delhi person who already clocked in", async () => {
    await createUserAccount(account("EMP-DEL4", "employee", { branch: "Delhi" }));
    await createUserAccount(account("EMP-DEL5", "employee", { branch: "Delhi" }));
    vi.setSystemTime(new Date(Date.UTC(2026, 10, 2, 4, 20))); // 09:50 IST, on time
    await punchAttendance("EMP-DEL4", "checkIn", { name: "x", role: "admin" });
    vi.setSystemTime(new Date(Date.UTC(2026, 10, 2, 4, 30)));

    await (await call("delhi")).json();
    const got = emails("emp-del");
    expect(got).toContain("emp-del5@example.com");
    expect(got).not.toContain("emp-del4@example.com");
  });

  it("rejects a call without the cron secret", async () => {
    const res = await GET(new Request("http://localhost/api/cron/attendance-reminder") as never);
    expect(res.status).toBe(401);
  });
});
