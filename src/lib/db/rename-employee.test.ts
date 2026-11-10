import { beforeAll, describe, expect, it } from "vitest";
import { isFirestoreConfigured } from "@/lib/firestore-service";
import { attachTemporaryEmployee, createEmployee, createLoginSheetEntries, createTemporaryEmployeeByName, getEmployeeById, getEmployeeRenameDetails, getLoginSheetEntries, renameEmployee } from "./db-adapter";

const actor = { name: "Tester", role: "admin" };

describe("renameEmployee", () => {
  beforeAll(() => {
    if (isFirestoreConfigured()) throw new Error("Refusing to run: Firestore credentials are present in the test environment.");
  });

  it("changes the name everywhere but keeps the employee ID", async () => {
    const emp = await createTemporaryEmployeeByName("Renametest Old", "Dehradun", actor);
    await createLoginSheetEntries(
      { employeeId: emp.employeeId, empName: emp.personal.fullName },
      [{ customerName: "Cust", bankName: "AXIS", date: "2026-11-03", status: "SENT", amount: 100 } as any],
      actor
    );

    const before = await getEmployeeRenameDetails(emp.employeeId);
    expect(before).toMatchObject({ employeeId: emp.employeeId, name: "Renametest Old", branch: "Dehradun", isTemporary: true, loginSheetRows: 1 });

    const result = await renameEmployee(emp.employeeId, "  Renametest   New ", actor);
    expect(result?.loginSheetRows).toBe(1);

    const after = await getEmployeeById(emp.employeeId);
    expect(after?.employeeId).toBe(emp.employeeId);
    expect(after?.personal.fullName).toBe("Renametest New");
    expect(after?.personal.firstName).toBe("Renametest");
    const rows = (await getLoginSheetEntries("2026-11-01", "2026-11-30")).filter((r) => r.employeeId === emp.employeeId);
    expect(rows.map((r) => r.empName)).toEqual(["Renametest New"]);
  });

  it("refuses an unchanged or too-short name and an unknown employee", async () => {
    const emp = await createTemporaryEmployeeByName("Renametest Same", "Delhi", actor);
    await expect(renameEmployee(emp.employeeId, "Renametest Same", actor)).rejects.toThrow(/already/);
    await expect(renameEmployee(emp.employeeId, "A", actor)).rejects.toThrow(/2 to 80/);
    expect(await renameEmployee("EMP-NOPE", "Someone Else", actor)).toBeNull();
  });

  it("merges a temporary employee's login rows into a registered employee, keeping the registered name", async () => {
    const shape = await createTemporaryEmployeeByName("Mergetest Shape", "Delhi", actor);
    const { id: _id, employeeId: _e, createdAt: _c, updatedAt: _u, isTemporary: _t, ...rest } = shape;
    void _id; void _e; void _c; void _u; void _t;
    const registered = await createEmployee({ ...rest, personal: { ...rest.personal, fullName: "Mergetest Registered" } }, actor);
    const temp = await createTemporaryEmployeeByName("Mergetest Temp", "Delhi", actor);
    await createLoginSheetEntries(
      { employeeId: temp.employeeId, empName: temp.personal.fullName },
      [{ customerName: "MergeCust", bankName: "AXIS", date: "2026-11-04", status: "SENT", amount: 100 } as any],
      actor
    );

    const result = await attachTemporaryEmployee(temp.employeeId, registered.employeeId, actor);
    expect(result.loginSheetRows).toBe(1);
    expect(await getEmployeeById(temp.employeeId)).toBeNull();
    expect((await getEmployeeById(registered.employeeId))?.personal.fullName).toBe(registered.personal.fullName);
    const moved = (await getLoginSheetEntries("2026-11-01", "2026-11-30")).find((r) => r.customerName === "MergeCust");
    expect(moved).toMatchObject({ employeeId: registered.employeeId, empName: registered.personal.fullName });
  });
});
