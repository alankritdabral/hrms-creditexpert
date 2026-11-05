import { describe, it, expect } from "vitest";
import { generateOtpCode, hashOtp, otpMatches } from "./otp";

describe("otp", () => {
  it("generates 6-digit numeric codes", () => {
    for (let i = 0; i < 200; i++) expect(generateOtpCode()).toMatch(/^[1-9]\d{5}$/);
  });
  it("matches the right code for the right email only", () => {
    const h = hashOtp("123456", "A@x.com");
    expect(otpMatches("123456", "a@x.com", h)).toBe(true);
    expect(otpMatches(" 123456 ", "a@x.com", h)).toBe(true);
    expect(otpMatches("654321", "a@x.com", h)).toBe(false);
    expect(otpMatches("123456", "b@x.com", h)).toBe(false);
  });
  it("never stores the plain code", () => {
    expect(hashOtp("123456", "a@x.com")).not.toContain("123456");
  });
  it("rejects missing or malformed hashes", () => {
    expect(otpMatches("123456", "a@x.com", undefined)).toBe(false);
    expect(otpMatches("123456", "a@x.com", "abc")).toBe(false);
  });
});
