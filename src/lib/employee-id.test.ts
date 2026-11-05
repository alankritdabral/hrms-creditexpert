import { describe, it, expect } from "vitest";
import { maxEmployeeNumber, nextEmployeeId, formatEmployeeId } from "./employee-id";

describe("employee ids", () => {
  it("finds the highest number and ignores junk", () => {
    expect(maxEmployeeNumber(["EMP-0001", "EMP-0049", "emp-0012", "PENDING", undefined, "EMP-X"])).toBe(49);
    expect(maxEmployeeNumber([])).toBe(0);
  });
  it("issues the next id", () => {
    expect(nextEmployeeId([])).toBe("EMP-0001");
    expect(nextEmployeeId(["EMP-0049", "EMP-0051"])).toBe("EMP-0052");
  });
  it("pads to four digits but grows past 9999", () => {
    expect(formatEmployeeId(7)).toBe("EMP-0007");
    expect(formatEmployeeId(12345)).toBe("EMP-12345");
  });
});
