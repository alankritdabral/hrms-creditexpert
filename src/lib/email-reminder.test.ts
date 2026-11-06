import { describe, expect, it } from "vitest";
import { ruleReminderHtml, attendanceLink } from "./email";

const text = (html: string) =>
  [...html.matchAll(/<li>(.*?)<\/li>/g)].map((m) => m[1]);

describe("ruleReminderHtml", () => {
  it("shows exactly the four rule lines for Timing 1", () => {
    const lines = text(ruleReminderHtml({ lateAfter: "09:45", weeklyLateAllowance: 2, hardCutoffTime: "10:00" }));
    expect(lines).toEqual([
      "Clock in by 9:45 AM; arrivals after 9:45 are Late.",
      "You can be late 2 times a week (Mon–Sat). From the 3rd late arrival in a week, every arrival after 9:45 is an automatic Half Day.",
      "Arriving after 10:00 AM is always a Half Day.",
      "A Half Day deducts half a day of salary.",
    ]);
  });

  it("follows the configured values and drops the cutoff line when it is off", () => {
    const lines = text(ruleReminderHtml({ lateAfter: "09:50", weeklyLateAllowance: 1 }));
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe("Clock in by 9:50 AM; arrivals after 9:50 are Late.");
    expect(lines[1]).toContain("late 1 time a week");
    expect(lines[1]).toContain("2nd late arrival");
  });
});

describe("attendanceLink", () => {
  it("prefers NEXT_PUBLIC_APP_URL, trims a trailing slash, and falls back to Vercel then localhost", () => {
    const keep = { a: process.env.NEXT_PUBLIC_APP_URL, v: process.env.VERCEL_PROJECT_PRODUCTION_URL };
    try {
      process.env.NEXT_PUBLIC_APP_URL = "https://hrms.example.com/";
      expect(attendanceLink()).toBe("https://hrms.example.com/attendance");
      delete process.env.NEXT_PUBLIC_APP_URL;
      process.env.VERCEL_PROJECT_PRODUCTION_URL = "hrms.vercel.app";
      expect(attendanceLink()).toBe("https://hrms.vercel.app/attendance");
      delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
      expect(attendanceLink()).toBe("http://localhost:3000/attendance");
    } finally {
      for (const [k, v] of [["NEXT_PUBLIC_APP_URL", keep.a], ["VERCEL_PROJECT_PRODUCTION_URL", keep.v]] as const) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });
});
