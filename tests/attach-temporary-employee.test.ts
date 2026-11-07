import { describe, expect, it } from "vitest";
import {
  attachTemporaryEmployee,
  createEmployee,
  createLoginSheetEntries,
  createTemporaryEmployeeByName,
  createUserAccount,
  deleteAllEmployeeLoginData,
  getEmployeeLogins,
  saveEmployeeLogin,
  ConflictError,
  getEmployees,
  getUserAccountByEmployeeId,
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

  async function registeredCopyOf(temp: Awaited<ReturnType<typeof createTemporaryEmployeeByName>>) {
    const { id: _i, employeeId: _e, createdAt: _c, updatedAt: _u, ...rest } = temp;
    return createEmployee({ ...rest, isTemporary: false, employment: { ...rest.employment, employmentStatus: "Active" } }, actor);
  }
  const account = (employeeId: string, email: string) => ({
    uid: `uid-${employeeId}`,
    employeeId,
    email,
    password: "x",
    name: "Person",
    role: "employee" as const,
    branch: "Delhi" as const,
    department: "Sales",
    avatar: "",
    status: "Active" as const,
    createdAt: new Date().toISOString(),
  });

  it("moves the login account of the temporary record onto the registered employee", async () => {
    const temp = await createTemporaryEmployeeByName("Account Mover", "Delhi", actor);
    const real = await registeredCopyOf(temp);
    await createUserAccount(account(temp.employeeId, "account.mover@example.com"));

    const result = await attachTemporaryEmployee(temp.employeeId, real.employeeId, actor);
    expect(result.accountMoved).toBe(true);
    expect((await getUserAccountByEmployeeId(real.employeeId))?.email).toBe("account.mover@example.com");
    expect(await getUserAccountByEmployeeId(temp.employeeId)).toBeNull();
    expect((await getEmployees()).some((e) => e.employeeId === temp.employeeId)).toBe(false);
  });

  it("stays blocked, changing nothing, when both records already have a login account", async () => {
    const temp = await createTemporaryEmployeeByName("Two Accounts", "Delhi", actor);
    const real = await registeredCopyOf(temp);
    await createUserAccount(account(temp.employeeId, "two.a@example.com"));
    await createUserAccount(account(real.employeeId, "two.b@example.com"));

    await expect(attachTemporaryEmployee(temp.employeeId, real.employeeId, actor)).rejects.toBeInstanceOf(ConflictError);
    expect((await getUserAccountByEmployeeId(temp.employeeId))?.email).toBe("two.a@example.com");
    expect((await getEmployees()).some((e) => e.employeeId === temp.employeeId)).toBe(true);
  });

  it("deleteAllEmployeeLoginData removes every month's record and sheet row for that employee only", async () => {
    const a = await createTemporaryEmployeeByName("Wipe Me", "Delhi", actor);
    const b = await createTemporaryEmployeeByName("Keep Me", "Delhi", actor);
    for (const month of ["2098-03", "2098-04"]) {
      await saveEmployeeLogin({ employeeId: a.employeeId, month, loginCommitment: 5 }, actor);
    }
    await createLoginSheetEntries({ employeeId: a.employeeId, empName: "Wipe Me" }, [{ ...row, date: "2098-03-10" }], actor);
    await createLoginSheetEntries({ employeeId: b.employeeId, empName: "Keep Me" }, [{ ...row, date: "2098-03-10" }], actor);

    const result = await deleteAllEmployeeLoginData(a.employeeId, actor);
    expect(result).toEqual({ loginRecords: 2, loginSheetRows: 1 });

    const march = await getEmployeeLogins("2098-03");
    const mine = march.find((l) => l.employeeId === a.employeeId);
    expect(mine?.loginsCount ?? 0).toBe(0);
    expect(mine?.loginCommitment ?? 0).toBe(0);
    expect((await getLoginSheetEntries("2098-03-01", "2098-03-31")).map((r) => r.employeeId)).toEqual([b.employeeId]);
  });
});
