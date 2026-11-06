import { describe, expect, it } from "vitest";
import {
  attachTemporaryEmployee,
  createEmployee,
  createLoginSheetEntries,
  createTemporaryEmployeeByName,
  getEmployees,
  getLoginSheetEntries,
  ValidationError,
} from "@/lib/db/db-adapter";

// No Firestore is configured under vitest, so the adapter uses its in-memory store.
const actor = { name: "Tester", role: "hr" };
const row = { customerName: "AMIT", date: "2099-02-10", bankName: "AXIS BANK", amount: 100000, status: "SENT" };

describe("attachTemporaryEmployee", () => {
  it("moves login sheet rows to the registered employee and removes the temporary record", async () => {
    const temp = await createTemporaryEmployeeByName("Sunil Rawat", "Delhi", actor);
    const { id: _i, employeeId: _e, createdAt: _c, updatedAt: _u, ...rest } = temp;
    const real = await createEmployee({ ...rest, isTemporary: false, employment: { ...rest.employment, employmentStatus: "Active" } }, actor);
    await createLoginSheetEntries({ employeeId: temp.employeeId, empName: "Sunil Rawat" }, [row], actor);

    const result = await attachTemporaryEmployee(temp.employeeId, real.employeeId, actor);
    expect(result.loginSheetRows).toBe(1);

    const rows = (await getLoginSheetEntries("2099-02-01", "2099-02-28")).filter((r) => r.customerName === "AMIT");
    expect(rows.every((r) => r.employeeId === real.employeeId)).toBe(true);
    expect((await getEmployees()).some((e) => e.employeeId === temp.employeeId)).toBe(false);
  });

  it("refuses a source that is not temporary, and attaching to another temporary employee", async () => {
    const a = await createTemporaryEmployeeByName("Temp One", "Delhi", actor);
    const b = await createTemporaryEmployeeByName("Temp Two", "Delhi", actor);
    await expect(attachTemporaryEmployee(a.employeeId, b.employeeId, actor)).rejects.toBeInstanceOf(ValidationError);
    await expect(attachTemporaryEmployee(a.employeeId, a.employeeId, actor)).rejects.toBeInstanceOf(ValidationError);
  });
});
