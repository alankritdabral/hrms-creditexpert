import { describe, expect, it } from "vitest";
import {
  decideArrivalStatus,
  defaultTimingProfiles,
  getTimingProfiles,
  defaultBranchTimingProfiles,
  getBranchTimingProfile,
  lateAfterOf,
  resolveTimingForEmployee,
  resolveTimingProfile,
  timingSummary,
  validateBranchTimingProfiles,
  validateTimingProfiles,
} from "./late-policy";
import { addMinutesToTime, weekBoundsIST } from "./ist-time";
import type { AttendancePolicy, CustomRole } from "@/lib/types";

const [t1, t2] = defaultTimingProfiles();
const decide = (time: string, profile = t1, prior = 0) =>
  decideArrivalStatus({ punchTimeIST: time, profile, priorLateCountThisWeek: prior });

describe("decideArrivalStatus - Timing 1 (09:30, grace to 09:45)", () => {
  it("is Present up to and including 09:45", () => {
    expect(decide("09:00").status).toBe("Present");
    expect(decide("09:45").status).toBe("Present");
    expect(decide("09:45").lateArrival).toBe(false);
  });

  it("marks the first two late arrivals of the week as Late", () => {
    expect(decide("09:46", t1, 0).status).toBe("Late");
    expect(decide("09:50", t1, 1).status).toBe("Late");
  });

  it("turns the 3rd and later late arrivals into Half Day", () => {
    const third = decide("09:46", t1, 2);
    expect(third.status).toBe("Half Day");
    expect(third.lateArrival).toBe(true);
    expect(third.reason).toMatch(/3rd late arrival/);
    expect(decide("09:46", t1, 5).status).toBe("Half Day");
  });

  it("is Half Day after 10:00 regardless of the weekly count", () => {
    expect(decide("10:00", t1, 0).status).toBe("Late");
    expect(decide("10:01", t1, 0).status).toBe("Half Day");
    expect(decide("10:01", t1, 0).reason).toMatch(/after 10:00/);
  });

  it("a zero allowance makes every late arrival a Half Day", () => {
    const strict = { ...t1, halfDayRules: { weeklyLateAllowance: 0 } };
    expect(decide("09:46", strict, 0).status).toBe("Half Day");
  });
});

describe("decideArrivalStatus - Timing 2 (10:00, grace to 10:15)", () => {
  it("is Present through 10:15 and only Late after, never Half Day", () => {
    expect(decide("10:15", t2).status).toBe("Present");
    expect(decide("10:16", t2, 0).status).toBe("Late");
    expect(decide("11:30", t2, 9).status).toBe("Late");
  });
});

describe("timing profiles and roles", () => {
  const policy = { officeStartTime: "10:30", gracePeriodMinutes: 10 } as AttendancePolicy;
  const roles = [
    { id: "team_lead", timingSlot: "timing1" },
    { id: "employee" },
  ] as CustomRole[];

  it("derives Timing 2 from the legacy single policy when no profiles are stored", () => {
    const profiles = getTimingProfiles(policy);
    expect(profiles[1]).toMatchObject({ id: "timing2", startTime: "10:30", graceMinutes: 10 });
    expect(lateAfterOf(profiles[0])).toBe("09:45");
  });

  it("ignores a malformed legacy start time such as 9.30 and falls back to 10:00", () => {
    const bad = { officeStartTime: "9.30", gracePeriodMinutes: 15 } as AttendancePolicy;
    expect(getTimingProfiles(bad)[1]).toMatchObject({ startTime: "10:00", graceMinutes: 15 });
    expect(lateAfterOf(getTimingProfiles(bad)[1])).toBe("10:15");
  });

  it("uses the slot assigned to the role, and Timing 2 for roles with none or unknown", () => {
    expect(resolveTimingProfile("team_lead", roles, policy).id).toBe("timing1");
    expect(resolveTimingProfile("Team_Lead", roles, policy).id).toBe("timing1");
    expect(resolveTimingProfile("employee", roles, policy).id).toBe("timing2");
    expect(resolveTimingProfile("ghost", roles, policy).id).toBe("timing2");
    expect(resolveTimingProfile(undefined, roles, policy).id).toBe("timing2");
  });

  it("stored values override defaults", () => {
    const stored = { ...policy, timingProfiles: [{ ...t1, startTime: "09:00" }] } as AttendancePolicy;
    expect(getTimingProfiles(stored)[0].startTime).toBe("09:00");
    expect(getTimingProfiles(stored)[1].startTime).toBe("10:30");
  });
});

describe("validateTimingProfiles", () => {
  it("accepts the defaults", () => {
    expect(validateTimingProfiles(defaultTimingProfiles())).toBeNull();
  });
  it("rejects bad input", () => {
    expect(validateTimingProfiles("x")).toBeTruthy();
    expect(validateTimingProfiles([{ ...t1, startTime: "9:30" }])).toBeTruthy();
    expect(validateTimingProfiles([{ ...t1, graceMinutes: -1 }])).toBeTruthy();
    expect(validateTimingProfiles([{ ...t1, halfDayRules: { weeklyLateAllowance: 2, hardCutoffTime: "09:40" } }])).toBeTruthy();
    expect(validateTimingProfiles([{ ...t1, halfDayRules: { weeklyLateAllowance: 1.5 } }])).toBeTruthy();
    expect(validateTimingProfiles([t1, t1])).toBeTruthy();
    expect(validateTimingProfiles([{ ...t1, id: "timing3" }])).toBeTruthy();
  });
});

describe("weekBoundsIST", () => {
  it("returns Monday to Saturday", () => {
    expect(weekBoundsIST("2026-11-04")).toEqual({ start: "2026-11-02", end: "2026-11-07" }); // Wed
    expect(weekBoundsIST("2026-11-02")).toEqual({ start: "2026-11-02", end: "2026-11-07" }); // Mon
    expect(weekBoundsIST("2026-11-07")).toEqual({ start: "2026-11-02", end: "2026-11-07" }); // Sat
  });
  it("puts Sunday in the week that just ended", () => {
    expect(weekBoundsIST("2026-11-08")).toEqual({ start: "2026-11-02", end: "2026-11-07" });
  });
  it("crosses month and year boundaries", () => {
    expect(weekBoundsIST("2026-12-31")).toEqual({ start: "2026-12-28", end: "2027-01-02" });
    expect(weekBoundsIST("2027-03-01")).toEqual({ start: "2027-03-01", end: "2027-03-06" });
  });
});

describe("addMinutesToTime", () => {
  it("adds minutes and clamps at end of day", () => {
    expect(addMinutesToTime("09:30", 15)).toBe("09:45");
    expect(addMinutesToTime("09:50", 20)).toBe("10:10");
    expect(addMinutesToTime("23:50", 30)).toBe("23:59");
  });
  it("does not guess at malformed times", () => {
    expect(addMinutesToTime("9.30", 15)).toBe("--:--");
    expect(addMinutesToTime("", 15)).toBe("--:--");
    expect(addMinutesToTime("25:00", 15)).toBe("--:--");
    expect(addMinutesToTime("09:30", NaN)).toBe("--:--");
  });
});

describe("Delhi branch timing", () => {
  const policy: AttendancePolicy = {
    id: "p", department: "All", officeStartTime: "10:00", officeEndTime: "19:00",
    gracePeriodMinutes: 15, fullDayMinHours: 8, halfDayMinHours: 4, standardBreakHours: 1,
  };
  const delhi = getBranchTimingProfile(policy, "Delhi")!;
  const d = (time: string, prior = 0) => decideArrivalStatus({ punchTimeIST: time, profile: delhi, priorLateCountThisWeek: prior });

  it("defaults to start 09:50, late after 10:05, cutoff 10:20, 2 lates a week", () => {
    expect(delhi.startTime).toBe("09:50");
    expect(lateAfterOf(delhi)).toBe("10:05");
    expect(delhi.halfDayRules).toEqual({ weeklyLateAllowance: 2, hardCutoffTime: "10:20" });
    expect(validateBranchTimingProfiles(defaultBranchTimingProfiles())).toBeNull();
  });

  it("Present to 10:05, Late 10:06 to 10:20, Half Day after 10:20", () => {
    expect(d("10:05").status).toBe("Present");
    expect(d("10:06").status).toBe("Late");
    expect(d("10:20").status).toBe("Late");
    expect(d("10:21").status).toBe("Half Day");
    expect(d("10:21").reason).toMatch(/after 10:20/);
  });

  it("the 3rd late in a week is a Half Day", () => {
    expect(d("10:10", 1).status).toBe("Late");
    expect(d("10:10", 2).status).toBe("Half Day");
  });

  it("overrides the role slot in Delhi only, matching the branch case-insensitively", () => {
    const roles: CustomRole[] = [{ id: "early", name: "Early", sections: [], timingSlot: "timing1" } as unknown as CustomRole];
    expect(resolveTimingForEmployee({ branch: "Delhi", roleId: "early", roles, policy }).startTime).toBe("09:50");
    expect(resolveTimingForEmployee({ branch: " delhi ", roleId: "employee", roles, policy }).startTime).toBe("09:50");
    expect(resolveTimingForEmployee({ branch: "Dehradun", roleId: "early", roles, policy }).startTime).toBe("09:30");
    expect(resolveTimingForEmployee({ branch: "Rudrapur", roleId: "employee", roles, policy }).startTime).toBe("10:00");
    expect(resolveTimingForEmployee({ roleId: "early", roles, policy }).startTime).toBe("09:30");
  });

  it("stored values win over the defaults", () => {
    const custom = { ...policy, branchTimingProfiles: { Delhi: { ...delhi, startTime: "09:40" } } };
    expect(getBranchTimingProfile(custom, "Delhi")?.startTime).toBe("09:40");
    expect(getBranchTimingProfile(custom, "Delhi")?.halfDayRules?.hardCutoffTime).toBe("10:20");
  });

  it("validates branch profiles", () => {
    expect(validateBranchTimingProfiles({ Mumbai: delhi })).toMatch(/Unknown branch/);
    expect(validateBranchTimingProfiles({ Delhi: { ...delhi, startTime: "9.50" } })).toMatch(/HH:mm/);
    expect(validateBranchTimingProfiles({ Delhi: { ...delhi, halfDayRules: { weeklyLateAllowance: 2, hardCutoffTime: "10:00" } } })).toMatch(/cutoff cannot be before/);
    expect(validateBranchTimingProfiles({ Delhi: { ...delhi, effectiveFrom: "next monday" } })).toMatch(/YYYY-MM-DD/);
    expect(validateBranchTimingProfiles([])).toMatch(/object/);
  });

  it("appears in the timing summary", () => {
    expect(timingSummary(policy)).toContain("Delhi branch: late after 10:05, half day after 10:20");
  });
});
