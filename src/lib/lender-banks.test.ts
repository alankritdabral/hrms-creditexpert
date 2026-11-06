import { describe, expect, it } from "vitest";
import { PRESET_LENDER_BANKS, bankKey, cleanBankName, mergeBankLists } from "./lender-banks";

describe("cleanBankName", () => {
  it("trims, collapses spaces and strips control characters", () => {
    expect(cleanBankName("  Yes   Bank\t\n")).toBe("Yes Bank");
    expect(cleanBankName("Yes\u0000Bank")).toBe("Yes Bank");
  });
  it("rejects blanks, non-strings and over-long names", () => {
    expect(cleanBankName("   ")).toBe("");
    expect(cleanBankName(42)).toBe("");
    expect(cleanBankName(undefined)).toBe("");
    expect(cleanBankName("x".repeat(81))).toBe("");
    expect(cleanBankName("x".repeat(80))).toHaveLength(80);
  });
});

describe("bankKey", () => {
  it("ignores case, spaces and punctuation", () => {
    expect(bankKey("HDFC BANK")).toBe(bankKey("Hdfc  Bank"));
    expect(bankKey("Other Bank / NBFC")).toBe(bankKey("other bank nbfc"));
  });
});

describe("mergeBankLists", () => {
  it("keeps the first spelling and drops case-insensitive duplicates", () => {
    expect(mergeBankLists(["Axis Bank", "HDFC Bank"], ["AXIS BANK", "Yes Bank", "yes bank"])).toEqual([
      "Axis Bank",
      "HDFC Bank",
      "Yes Bank",
    ]);
  });
  it("skips unusable entries", () => {
    expect(mergeBankLists(["", "  ", "Yes Bank"])).toEqual(["Yes Bank"]);
  });
  it("has no duplicates in the built-in list", () => {
    expect(mergeBankLists(PRESET_LENDER_BANKS)).toHaveLength(PRESET_LENDER_BANKS.length);
  });
});
