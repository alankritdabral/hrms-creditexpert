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

// Role timings apply outside Delhi; Delhi has its own branch timing (tested below).
const account = (employeeId: string, role: string, branch: UserAccount["branch"] = "Dehradun"): UserAccount => ({
  uid: `uid-${employeeId}`,
  employeeId,
  email: `${employeeId.toLowerCase()}@example.com`,
  password: "x",
  name: employeeId,
  role,
  branch,
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
  describe("Delhi branch timing (09:50, late after 10:05, half day after 10:20)", () => {
    it("is Present to 10:05, Late 10:06-10:20, Half Day after 10:20", async () => {
      await createUserAccount(account("EMP-D1", "standard-team", "Delhi"));
      await createUserAccount(account("EMP-D2", "standard-team", "Delhi"));
      await createUserAccount(account("EMP-D3", "standard-team", "Delhi"));
      await createUserAccount(account("EMP-D4", "standard-team", "Delhi"));
      at(11, "10:05");
      expect((await punchAttendance("EMP-D1", "checkIn", actor)).status).toBe("Present");
      at(11, "10:06");
      expect((await punchAttendance("EMP-D2", "checkIn", actor)).status).toBe("Late");
      at(11, "10:20");
      expect((await punchAttendance("EMP-D3", "checkIn", actor)).status).toBe("Late");
      at(11, "10:21");
      const half = await punchAttendance("EMP-D4", "checkIn", actor);
      expect(half.status).toBe("Half Day");
      expect(half.remarks).toMatch(/after 10:20/);
    });

    it("Delhi follows the branch timing whatever the role slot is", async () => {
      await createUserAccount(account("EMP-D5", "early-team", "Delhi")); // Timing 1 role: 09:46 would be late
      at(11, "09:46");
      expect((await punchAttendance("EMP-D5", "checkIn", actor)).status).toBe("Present");
    });

    it("keeps the weekly rule: Late, Late, then Half Day on the 3rd late arrival", async () => {
      await createUserAccount(account("EMP-D6", "standard-team", "Delhi"));
      at(11, "10:10");
      expect((await punchAttendance("EMP-D6", "checkIn", actor)).status).toBe("Late");
      at(12, "10:10");
      expect((await punchAttendance("EMP-D6", "checkIn", actor)).status).toBe("Late");
      at(13, "10:10");
      const third = await punchAttendance("EMP-D6", "checkIn", actor);
      expect(third.status).toBe("Half Day");
      expect(third.remarks).toMatch(/3rd late arrival/);
    });

    it("does not count lates before the effective date as strikes", async () => {
      await createUserAccount(account("EMP-D7", "standard-team", "Delhi"));
      // Mon 2 Nov and Tue 3 Nov are before the 2026-11-10 effective date; the weekly count starts at zero.
      at(2, "10:10");
      await punchAttendance("EMP-D7", "checkIn", actor);
      at(3, "10:10");
      await punchAttendance("EMP-D7", "checkIn", actor);
      at(4, "10:10");
      expect((await punchAttendance("EMP-D7", "checkIn", actor)).status).toBe("Late");
    });

    it("an HR clock-in on someone's behalf uses the employee's branch, not HR's", async () => {
      await createUserAccount(account("EMP-D8", "standard-team", "Delhi"));
      at(11, "10:21");
      const rec = await punchAttendance("EMP-D8", "checkIn", { name: "HR", role: "hr" });
      expect(rec.status).toBe("Half Day");
    });
  });
});
