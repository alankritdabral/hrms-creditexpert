import { describe, it, expect } from "vitest";
import { resolveAttendanceOffice } from "./geolocation";

const offices = [
  { id: "dehradun", branch: "Dehradun", isActive: true },
  { id: "delhi", branch: "Delhi", isActive: true },
  { id: "rudrapur", branch: "Rudrapur", isActive: false },
];

describe("resolveAttendanceOffice", () => {
  it("returns the office matching the employee's branch", () => {
    expect(resolveAttendanceOffice(offices, "Delhi").office?.id).toBe("delhi");
  });

  it("matches branch case-insensitively and ignores whitespace", () => {
    expect(resolveAttendanceOffice(offices, " delhi ").office?.id).toBe("delhi");
  });

  it("does not fall back to another branch's office when none is active for the branch", () => {
    const r = resolveAttendanceOffice(offices, "Rudrapur");
    expect(r.office).toBeUndefined();
    expect(r.error).toMatch(/Rudrapur/);
  });

  it("does not fall back to the first office when Delhi has no office at all", () => {
    const r = resolveAttendanceOffice([offices[0]], "Delhi");
    expect(r.office).toBeUndefined();
    expect(r.error).toMatch(/Delhi/);
  });

  it("errors when the employee has no branch", () => {
    expect(resolveAttendanceOffice(offices, undefined).office).toBeUndefined();
    expect(resolveAttendanceOffice(offices, "").error).toMatch(/no branch/);
  });
});
