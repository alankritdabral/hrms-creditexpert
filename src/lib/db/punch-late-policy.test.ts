import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { isFirestoreConfigured } from "@/lib/firestore-service";
import { createUserAccount, getAttendanceRecords, punchAttendance, saveCustomRole, updateAttendanceRecord } from "./db-adapter";
import type { UserAccount } from "@/lib/types";

const actor = { name: "Tester", role: "admin" };

// 2026-11-02 is a Monday. IST = UTC + 5:30, so 09:46 IST is 04:16 UTC.
const at = (day: number, istHHmm: string) => {
  const [h, m] = istHHmm.split(":").map(Number);
  vi.setSystemTime(new Date(Date.UTC(2026, 10, day, h - 5, m - 30)));
};

const account = (employeeId: string, role: string): UserAccount => ({
  uid: `uid-${employeeId}`,
  employeeId,
  email: `${employeeId.toLowerCase()}@example.com`,
  password: "x",
  name: employeeId,
  role,
  branch: "Delhi",
  department: "Sales",
  avatar: "",
  status: "Active",
  createdAt: "2026-01-01T00:00:00.000Z",
});

describe("punchAttendance with timing slots", () => {
  beforeAll(() => {
    // These tests write attendance, roles and accounts: they must only ever use the in-memory store.
    if (isFirestoreConfigured()) throw new Error("Refusing to run: Firestore credentials are present in the test environment.");
  });

  beforeEach(async () => {
    vi.useFakeTimers();
    await saveCustomRole({ id: "early-team", name: "Early Team", sections: ["dashboard"], timingSlot: "timing1" });
    await saveCustomRole({ id: "standard-team", name: "Standard Team", sections: ["dashboard"], timingSlot: "timing2" });
  });
  afterEach(() => vi.useRealTimers());

  it("Timing 1: Late, Late, then Half Day from the 3rd late arrival in the week", async () => {
    await createUserAccount(account("EMP-T1A", "early-team"));
    at(2, "09:46");
    expect((await punchAttendance("EMP-T1A", "checkIn", actor)).status).toBe("Late");
    at(3, "09:50");
    expect((await punchAttendance("EMP-T1A", "checkIn", actor)).status).toBe("Late");
    at(4, "09:46");
    const third = await punchAttendance("EMP-T1A", "checkIn", actor);
    expect(third.status).toBe("Half Day");
    expect(third.lateArrival).toBe(true);
    expect(third.remarks).toMatch(/3rd late arrival/);
    at(5, "09:30");
    expect((await punchAttendance("EMP-T1A", "checkIn", actor)).status).toBe("Present");
  });

  it("Timing 1: the count resets on the next Monday", async () => {
    await createUserAccount(account("EMP-T1B", "early-team"));
    for (const d of [2, 3, 4]) {
      at(d, "09:46");
      await punchAttendance("EMP-T1B", "checkIn", actor);
    }
    at(9, "09:46"); // next Monday
    expect((await punchAttendance("EMP-T1B", "checkIn", actor)).status).toBe("Late");
  });

  it("Timing 1: after 10:00 is a Half Day even on the first late arrival", async () => {
    await createUserAccount(account("EMP-T1C", "early-team"));
    at(2, "10:05");
    const rec = await punchAttendance("EMP-T1C", "checkIn", actor);
    expect(rec.status).toBe("Half Day");
    expect(rec.remarks).toMatch(/after 10:00/);
  });

  it("HR excusing a late arrival (set to Present) frees the strike", async () => {
    await createUserAccount(account("EMP-T1D", "early-team"));
    at(2, "09:46");
    const first = await punchAttendance("EMP-T1D", "checkIn", actor);
    at(3, "09:46");
    await punchAttendance("EMP-T1D", "checkIn", actor);
    await updateAttendanceRecord(first.id, { status: "Present" }, actor);
    at(4, "09:46");
    expect((await punchAttendance("EMP-T1D", "checkIn", actor)).status).toBe("Late");
  });

  it("Timing 2 is never a Half Day: on time to 10:15, then Late", async () => {
    await createUserAccount(account("EMP-T2A", "standard-team"));
    at(2, "10:15");
    expect((await punchAttendance("EMP-T2A", "checkIn", actor)).status).toBe("Present");
    for (const d of [3, 4, 5, 6]) {
      at(d, "11:00");
      expect((await punchAttendance("EMP-T2A", "checkIn", actor)).status).toBe("Late");
    }
  });

  it("uses the clocked-in employee's role, not the HR user's", async () => {
    await createUserAccount(account("EMP-T1E", "early-team"));
    at(2, "10:05");
    const rec = await punchAttendance("EMP-T1E", "checkIn", { name: "HR", role: "hr" });
    expect(rec.status).toBe("Half Day");
    expect((await getAttendanceRecords("2026-11-02")).some((r) => r.employeeId === "EMP-T1E")).toBe(true);
  });

  it("an account with no role slot falls back to Timing 2", async () => {
    await createUserAccount(account("EMP-NONE", "employee"));
    at(2, "10:05");
    expect((await punchAttendance("EMP-NONE", "checkIn", actor)).status).toBe("Present");
  });
});
