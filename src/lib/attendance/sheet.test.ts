import { describe, it, expect } from "vitest";
import { buildCell, totalsOf, daysOfMonth, type SheetData, type SheetEmployee } from "./sheet";
import type { AttendanceRecord } from "../types";

const emp: SheetEmployee = {
  employeeId: "EMP-0001",
  name: "Test",
  branch: "Delhi",
  department: "Sales",
  dateOfJoining: "2026-11-03",
};

const data: SheetData = {
  month: "2026-11",
  viewAll: true,
  canEdit: false,
  roster: [],
  records: [],
  leaves: [{ employeeId: "EMP-0001", startDate: "2026-11-12", endDate: "2026-11-12", leaveType: "Casual Leave" }],
  holidays: [{ date: "2026-11-10", name: "Test Holiday", branch: "All" }],
};
const today = "2026-11-20";

describe("buildCell precedence", () => {
  it("uses a stored record first", () => {
    const rec = { status: "Present", checkIn: "10:00:00" } as AttendanceRecord;
    expect(buildCell(emp, "2026-11-10", today, data, rec).code).toBe("P");
  });
  it("leaves future days blank", () => {
    expect(buildCell(emp, "2026-11-25", today, data).code).toBe("");
  });
  it("marks days before joining", () => {
    expect(buildCell(emp, "2026-11-02", today, data).title).toBe("Before joining");
  });
  it("shows a branch-wide holiday", () => {
    expect(buildCell(emp, "2026-11-10", today, data).code).toBe("H");
  });
  it("shows Sunday as weekly off", () => {
    expect(buildCell(emp, "2026-11-08", today, data).code).toBe("WO");
  });
  it("shows an approved leave", () => {
    expect(buildCell(emp, "2026-11-12", today, data).code).toBe("L");
  });
  it("falls back to absent", () => {
    const c = buildCell(emp, "2026-11-13", today, data);
    expect(c.code).toBe("A");
    expect(c.derived).toBe(true);
  });
});

describe("totalsOf", () => {
  it("computes attendance percentage with half days at 0.5", () => {
    const cell = (kind: string) => ({ code: "", kind, title: "" }) as never;
    const t = totalsOf([cell("present"), cell("late"), cell("half"), cell("absent")]);
    expect(t.present).toBe(2);
    expect(t.late).toBe(1);
    expect(t.workingDays).toBe(4);
    expect(t.pct).toBe(63); // (2 + 0.5) / 4
  });
});

describe("daysOfMonth", () => {
  it("lists every day", () => {
    expect(daysOfMonth("2026-02")).toHaveLength(28);
    expect(daysOfMonth("2026-11")[29]).toBe("2026-11-30");
  });
});
