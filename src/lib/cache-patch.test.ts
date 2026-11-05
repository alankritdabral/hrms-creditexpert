import { describe, it, expect } from "vitest";
import { patchCachedList, docWithId, matchesFilters } from "./cache-patch";

describe("docWithId", () => {
  it("lets the document ID win over a stored id field", () => {
    expect(docWithId("EMP-0049", { id: "emp-1730000", name: "x" })).toEqual({ id: "EMP-0049", name: "x" });
  });
});

describe("patchCachedList", () => {
  const list = [
    { id: "EMP-0001", name: "a" },
    { id: "EMP-0002", name: "b" },
  ];

  it("updates in place without duplicating, even if data carries another id", () => {
    const next = patchCachedList(list, "EMP-0002", { id: "emp-999", name: "b2" });
    expect(next).toHaveLength(2);
    expect(next[1]).toEqual({ id: "EMP-0002", name: "b2" });
  });
  it("appends new documents", () => {
    expect(patchCachedList(list, "EMP-0003", { name: "c" })).toHaveLength(3);
  });
  it("removes deleted documents and ignores unknown ones", () => {
    expect(patchCachedList(list, "EMP-0001", null)).toEqual([list[1]]);
    expect(patchCachedList(list, "EMP-9999", null)).toBe(list);
  });
  it("keeps filtered lists consistent", () => {
    const filters = [{ field: "month", op: "==" as const, value: "2026-11" }];
    const rows = [{ id: "a", month: "2026-11" }];
    expect(patchCachedList(rows, "b", { month: "2026-10" }, filters)).toHaveLength(1); // does not belong
    expect(patchCachedList(rows, "b", { month: "2026-11" }, filters)).toHaveLength(2); // belongs
    expect(patchCachedList(rows, "a", { month: "2026-10" }, filters)).toHaveLength(0); // moved out
  });
});

describe("matchesFilters", () => {
  it("supports range comparisons and rejects missing fields", () => {
    const f = [{ field: "date", op: ">=" as const, value: "2026-11-01" }, { field: "date", op: "<=" as const, value: "2026-11-30" }];
    expect(matchesFilters({ date: "2026-11-15" }, f)).toBe(true);
    expect(matchesFilters({ date: "2026-12-01" }, f)).toBe(false);
    expect(matchesFilters({}, f)).toBe(false);
  });
});
