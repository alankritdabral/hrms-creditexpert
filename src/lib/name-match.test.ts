import { describe, expect, it } from "vitest";
import { findSimilarEmployees, nameSimilarity, normalizeName } from "./name-match";

const people = [
  { employeeId: "EMP-1", name: "Ravi Kumar" },
  { employeeId: "EMP-2", name: "Priya Sharma" },
  { employeeId: "EMP-3", name: "Amit Verma" },
];

describe("nameSimilarity", () => {
  it("ignores case, punctuation, titles and word order", () => {
    expect(normalizeName("Mr. KUMAR, Ravi")).toBe(normalizeName("ravi kumar"));
    expect(nameSimilarity("Kumar Ravi", "Ravi Kumar")).toBe(1);
  });
  it("is high for small spelling differences and initials", () => {
    expect(nameSimilarity("Ravi Kumr", "Ravi Kumar")).toBeGreaterThan(0.8);
    expect(nameSimilarity("Ravi K", "Ravi Kumar")).toBeGreaterThan(0.75);
    expect(nameSimilarity("Ravi Kumar Singh", "Ravi Kumar")).toBeGreaterThan(0.75);
  });
  it("is low for different people", () => {
    expect(nameSimilarity("Ravi Kumar", "Amit Verma")).toBeLessThan(0.5);
    expect(nameSimilarity("", "Ravi")).toBe(0);
  });
});

describe("findSimilarEmployees", () => {
  it("finds the registered employee for a slightly different name, best first", () => {
    const found = findSimilarEmployees("Ravi Kumr", people);
    expect(found.map((f) => f.employee.employeeId)).toEqual(["EMP-1"]);
  });
  it("finds nothing for an unrelated name", () => {
    expect(findSimilarEmployees("Zoya Khan", people)).toEqual([]);
  });
});
