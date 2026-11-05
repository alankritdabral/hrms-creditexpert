import { describe, it, expect } from "vitest";
import { getISTDateString, getIST24HourTime, evaluateLateArrivalIST, formatISTTime12 } from "./ist-time";

describe("IST helpers", () => {
  it("rolls the date over at 18:30 UTC", () => {
    expect(getISTDateString(new Date("2026-11-04T18:29:00Z"))).toBe("2026-11-04");
    expect(getISTDateString(new Date("2026-11-04T19:00:00Z"))).toBe("2026-11-05");
  });

  it("formats 24-hour IST time", () => {
    expect(getIST24HourTime(new Date("2026-11-04T04:45:00Z"))).toBe("10:15");
    expect(getIST24HourTime(new Date("2026-11-04T19:00:00Z"))).toBe("00:30");
  });

  it("marks late only after the grace period", () => {
    expect(evaluateLateArrivalIST("10:15")).toBe(false);
    expect(evaluateLateArrivalIST("10:16")).toBe(true);
    expect(evaluateLateArrivalIST("10:30", "10:00", 30)).toBe(false);
  });

  it("formats 12-hour time", () => {
    expect(formatISTTime12("14:30:00")).toBe("02:30 PM");
    expect(formatISTTime12("--")).toBe("—");
  });
});

import { getISTMonthString, addDaysIST, lateCutoffLabel } from "./ist-time";

describe("IST month and date arithmetic", () => {
  it("rolls the month over at IST midnight", () => {
    expect(getISTMonthString(new Date("2026-10-31T19:00:00Z"))).toBe("2026-11");
    expect(getISTMonthString(new Date("2026-10-31T18:00:00Z"))).toBe("2026-10");
  });
  it("adds days across month and year ends", () => {
    expect(addDaysIST("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDaysIST("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysIST("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("labels the late cutoff from the policy", () => {
    expect(lateCutoffLabel()).toBe("10:15 AM");
    expect(lateCutoffLabel("09:30", 30)).toBe("10:00 AM");
    expect(lateCutoffLabel("12:00", 15)).toBe("12:15 PM");
  });
});

import { isSundayDate, leaveWorkingDates } from "./ist-time";

describe("leave working dates", () => {
  it("knows Sundays", () => {
    expect(isSundayDate("2026-11-01")).toBe(true);
    expect(isSundayDate("2026-11-02")).toBe(false);
  });
  it("skips Sundays and holidays across a range", () => {
    // Fri 6 Nov to Tue 10 Nov 2026: Sat 7 and Mon 9 (holiday) are working/skipped accordingly, Sun 8 is off
    expect(leaveWorkingDates("2026-11-06", "2026-11-10", new Set(["2026-11-09"]))).toEqual([
      "2026-11-06",
      "2026-11-07",
      "2026-11-10",
    ]);
  });
  it("returns nothing for a reversed range and caps very long ranges", () => {
    expect(leaveWorkingDates("2026-11-10", "2026-11-06", new Set())).toEqual([]);
    expect(leaveWorkingDates("2026-01-01", "2027-12-31", new Set()).length).toBeLessThanOrEqual(62);
  });
});
