import { describe, expect, it } from "vitest";
import { createTemporaryEmployeeByName, getEmployees } from "@/lib/db/db-adapter";

// With no Firestore configured the adapter uses its in-memory store, so this never touches the real database.
describe("createTemporaryEmployeeByName", () => {
  it("creates a temporary Candidate employee and reuses it for the same name", async () => {
    const actor = { name: "Tester", role: "hr" };
    const first = await createTemporaryEmployeeByName("Ravi  Kumar", "Dehradun", actor);
    expect(first.isTemporary).toBe(true);
    expect(first.personal.fullName).toBe("Ravi Kumar");
    expect(first.employment.employmentStatus).toBe("Candidate");
    expect(first.employment.branch).toBe("Dehradun");

    const again = await createTemporaryEmployeeByName("ravi kumar", "Delhi", actor);
    expect(again.employeeId).toBe(first.employeeId);
    expect((await getEmployees()).filter((e) => e.personal.fullName === "Ravi Kumar")).toHaveLength(1);
  });
});
