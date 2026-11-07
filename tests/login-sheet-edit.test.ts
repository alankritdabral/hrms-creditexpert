import { describe, expect, it } from "vitest";
import { LOGIN_SHEET_COLUMNS } from "@/lib/login-sheet";
import {
  SHEET_COLUMNS,
  applyEdits,
  applyPatch,
  cellDraft,
  diffRow,
  parseLooseDate,
  parseLooseTime,
} from "@/lib/login-sheet-edit";
import type { LoginSheetEntry } from "@/lib/types";

const row: LoginSheetEntry = {
  id: "r1",
  employeeId: "EMP-0001",
  empName: "Asha Rawat",
  customerName: "RAHUL VERMA",
  panNo: "ABCDE1234F",
  phone: "9876543210",
  location: "DELHI",
  date: "2026-11-05",
  time: "10:30",
  bankName: "AXIS BANK",
  dsaName: "ACME",
  loginId: "L-1",
  product: "PL",
  branch: "Delhi",
  file: "BACKEND",
  amount: 250000,
  status: "SENT",
  remarks: "call back",
  insuranceDetails: "none",
  amount2: 1000,
  createdAt: "2026-11-05T05:00:00.000Z",
  updatedAt: "2026-11-05T05:00:00.000Z",
};

const owners = [
  { employeeId: "EMP-0001", name: "Asha Rawat" },
  { employeeId: "EMP-0002", name: "Vikram Negi" },
];

describe("sheet columns", () => {
  it("match the table header order", () => {
    expect(SHEET_COLUMNS.map((c) => c.label)).toEqual([...LOGIN_SHEET_COLUMNS]);
  });
});

describe("loose parsing", () => {
  it("reads dd-mm-yyyy, dd/mm/yyyy and dd.mm.yyyy", () => {
    expect(parseLooseDate("5-11-2026")).toBe("2026-11-05");
    expect(parseLooseDate("05/11/2026")).toBe("2026-11-05");
    expect(parseLooseDate("05.11.2026")).toBe("2026-11-05");
  });
  it("leaves other date text for validation to reject", () => {
    expect(parseLooseDate("2026-11-05")).toBe("2026-11-05");
    expect(parseLooseDate("tomorrow")).toBe("tomorrow");
  });
  it("pads and trims times", () => {
    expect(parseLooseTime("9:30")).toBe("09:30");
    expect(parseLooseTime("9.30")).toBe("09:30");
    expect(parseLooseTime("09:30:00")).toBe("09:30");
    expect(parseLooseTime("late")).toBe("late");
  });
});

describe("cellDraft", () => {
  it("shows the date as dd-mm-yyyy and the owner by id", () => {
    expect(cellDraft(row, "date")).toBe("05-11-2026");
    expect(cellDraft(row, "empName")).toBe("EMP-0001");
  });
  it("gives an empty string for an empty optional cell and the plain number for an amount", () => {
    const bare = { ...row, panNo: undefined, amount2: undefined };
    expect(cellDraft(bare, "panNo")).toBe("");
    expect(cellDraft(bare, "amount2")).toBe("");
    expect(cellDraft(row, "amount")).toBe("250000");
  });
});

describe("applyEdits", () => {
  it("applies one edited cell and keeps the rest", () => {
    const r = applyEdits(row, { status: "login" }, owners);
    expect(r.ok && r.value.status).toBe("LOGIN");
    expect(r.ok && r.value.customerName).toBe("RAHUL VERMA");
    expect(r.ok && r.owner).toBeNull();
  });

  it("accepts a typed date and an Indian-formatted amount", () => {
    const r = applyEdits(row, { date: "07-11-2026", amount: "3,00,000" }, owners);
    expect(r.ok && r.value.date).toBe("2026-11-07");
    expect(r.ok && r.value.amount).toBe(300000);
  });

  it("rejects what the API would reject, with its message", () => {
    expect(applyEdits(row, { panNo: "bad" }, owners)).toEqual({ ok: false, error: expect.stringContaining("PAN") });
    expect(applyEdits(row, { phone: "123" }, owners)).toEqual({ ok: false, error: "Mobile number must be 10 digits." });
    expect(applyEdits(row, { customerName: "  " }, owners)).toEqual({ ok: false, error: "Customer name is required." });
    expect(applyEdits(row, { amount: "" }, owners)).toEqual({ ok: false, error: "Amount is required." });
    expect(applyEdits(row, { amount: "-5" }, owners)).toEqual({ ok: false, error: "Amount must be a positive number." });
    expect(applyEdits(row, { time: "25:00" }, owners)).toEqual({ ok: false, error: "Time must be in HH:mm format." });
    expect(applyEdits(row, { branch: "Mumbai" }, owners).ok).toBe(false);
  });

  it("clears an optional cell", () => {
    const r = applyEdits(row, { panNo: "", amount2: "", branch: "" }, owners);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect("panNo" in r.value).toBe(false);
      expect("amount2" in r.value).toBe(false);
      expect("branch" in r.value).toBe(false);
    }
  });

  it("changes the owner by id or by name, and refuses someone not in the list", () => {
    const byId = applyEdits(row, { empName: "EMP-0002" }, owners);
    expect(byId.ok && byId.owner).toEqual({ employeeId: "EMP-0002", empName: "Vikram Negi" });
    const byName = applyEdits(row, { empName: "vikram negi" }, owners);
    expect(byName.ok && byName.owner).toEqual({ employeeId: "EMP-0002", empName: "Vikram Negi" });
    const same = applyEdits(row, { empName: "EMP-0001" }, owners);
    expect(same.ok && same.owner).toBeNull();
    expect(applyEdits(row, { empName: "Nobody" }, owners).ok).toBe(false);
  });

  it("applies several cells of one row together and fails the whole row when one is bad", () => {
    const ok = applyEdits(row, { bankName: "hdfc bank", product: "bl", loginId: "x9" }, owners);
    expect(ok.ok && [ok.value.bankName, ok.value.product, ok.value.loginId]).toEqual(["HDFC BANK", "BL", "X9"]);
    expect(applyEdits(row, { bankName: "HDFC", phone: "1" }, owners).ok).toBe(false);
  });
});

describe("diffRow / applyPatch", () => {
  it("reports no change when the value is the same", () => {
    const r = applyEdits(row, { status: "SENT" }, owners);
    expect(r.ok && diffRow(row, r.value, r.owner)).toBeNull();
  });

  it("lists only what changed, and can undo it", () => {
    const r = applyEdits(row, { status: "disbursed", remarks: "" }, owners);
    if (!r.ok) throw new Error("expected ok");
    const d = diffRow(row, r.value, r.owner)!;
    expect(Object.keys(d.patch).sort()).toEqual(["remarks", "status"]);
    const edited = applyPatch(row, d.patch);
    expect(edited.status).toBe("DISBURSED");
    expect("remarks" in edited).toBe(false);
    expect(applyPatch(edited, d.inverse)).toEqual(row);
  });

  it("carries the new owner and restores the old one", () => {
    const r = applyEdits(row, { empName: "EMP-0002" }, owners);
    if (!r.ok) throw new Error("expected ok");
    const d = diffRow(row, r.value, r.owner)!;
    const edited = applyPatch(row, d.patch);
    expect([edited.employeeId, edited.empName]).toEqual(["EMP-0002", "Vikram Negi"]);
    expect(applyPatch(edited, d.inverse)).toEqual(row);
  });
});
