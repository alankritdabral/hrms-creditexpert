"use client";

import React, { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { BRANCHES, type LoginSheetEntry } from "@/lib/types";
import { LOGIN_SHEET_PRODUCTS, LOGIN_SHEET_STATUSES, MAX_ENTRIES_PER_REQUEST } from "@/lib/login-sheet";
import { getISTDateString } from "@/lib/attendance/ist-time";

export interface SheetEmployee {
  employeeId: string;
  name: string;
  branch?: string;
}

interface Line {
  key: string;
  bankName: string;
  dsaName: string;
  loginId: string;
  file: string;
  status: string;
  remarks: string;
  insuranceDetails: string;
  amount2: string;
}

interface Shared {
  customerName: string;
  panNo: string;
  phone: string;
  location: string;
  date: string;
  time: string;
  employeeId: string;
  product: string;
  branch: string;
  amount: string;
}

/** What the form submits: one payload per row (new rows carry no id). */
export type EntryPayload = Record<string, string | number | undefined>;

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Row being edited, or null to add new rows. */
  editing: LoginSheetEntry | null;
  employees: SheetEmployee[];
  /** Whether the user may enter rows for other employees. */
  canPickEmployee: boolean;
  self: SheetEmployee;
  bankOptions: string[];
  dsaOptions: string[];
  onSubmit: (rows: EntryPayload[], employeeId: string, editingId: string | null) => Promise<string | null>;
}

const inputCls =
  "w-full text-xs rounded-lg border border-slate-200 px-2.5 py-1.5 bg-white text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500";
const labelCls = "block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1";

function nowIST(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "00";
  return `${get("hour")}:${get("minute")}`;
}

let lineSeq = 0;
const newLine = (over: Partial<Line> = {}): Line => ({
  key: `l${++lineSeq}`,
  bankName: "",
  dsaName: "",
  loginId: "",
  file: "",
  status: "SENT",
  remarks: "",
  insuranceDetails: "",
  amount2: "",
  ...over,
});

function blankShared(self: SheetEmployee): Shared {
  return {
    customerName: "",
    panNo: "",
    phone: "",
    location: "",
    date: getISTDateString(),
    time: nowIST(),
    employeeId: self.employeeId,
    product: "PL",
    branch: self.branch || "",
    amount: "",
  };
}

export function EntryFormModal({ isOpen, onClose, editing, employees, canPickEmployee, self, bankOptions, dsaOptions, onSubmit }: Props) {
  const [shared, setShared] = useState<Shared>(() => blankShared(self));
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Reset the form each time it is opened (blank for a new entry, filled for an edit).
  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    if (editing) {
      setShared({
        customerName: editing.customerName,
        panNo: editing.panNo || "",
        phone: editing.phone || "",
        location: editing.location || "",
        date: editing.date,
        time: editing.time || "",
        employeeId: editing.employeeId,
        product: editing.product || "",
        branch: editing.branch || "",
        amount: String(editing.amount ?? ""),
      });
      setLines([
        newLine({
          bankName: editing.bankName,
          dsaName: editing.dsaName || "",
          loginId: editing.loginId || "",
          file: editing.file || "",
          status: editing.status,
          remarks: editing.remarks || "",
          insuranceDetails: editing.insuranceDetails || "",
          amount2: editing.amount2 !== undefined ? String(editing.amount2) : "",
        }),
      ]);
    } else {
      setShared(blankShared(self));
      setLines([newLine()]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, editing]);

  const setS = <K extends keyof Shared>(k: K, v: Shared[K]) => setShared((p) => ({ ...p, [k]: v }));
  const setLine = (key: string, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const pickEmployee = (employeeId: string) => {
    const emp = employees.find((e) => e.employeeId === employeeId);
    setShared((p) => ({ ...p, employeeId, branch: emp?.branch || p.branch }));
  };

  const empName = employees.find((e) => e.employeeId === shared.employeeId)?.name || self.name;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const rows: EntryPayload[] = lines.map((l) => ({
      customerName: shared.customerName,
      panNo: shared.panNo,
      phone: shared.phone,
      location: shared.location,
      date: shared.date,
      time: shared.time,
      product: shared.product,
      branch: shared.branch,
      amount: shared.amount,
      bankName: l.bankName,
      dsaName: l.dsaName,
      loginId: l.loginId,
      file: l.file,
      status: l.status,
      remarks: l.remarks,
      insuranceDetails: l.insuranceDetails,
      amount2: l.amount2,
    }));
    const err = await onSubmit(rows, shared.employeeId, editing?.id ?? null);
    setSaving(false);
    if (err) setError(err);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editing ? "Edit Login Sheet Row" : "Add to Login Sheet"}
      subtitle={
        editing
          ? `${editing.customerName} — ${editing.bankName}`
          : "Enter the customer once, then add one line for every bank the file was sent to."
      }
      maxWidth="4xl"
    >
      <form onSubmit={submit} className="space-y-5">
        {/* Customer block */}
        <div className="space-y-3">
          <div className="text-xs font-bold text-slate-800">Customer details</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="lg:col-span-2">
              <label className={labelCls}>Customer name *</label>
              <input className={inputCls} required value={shared.customerName} onChange={(e) => setS("customerName", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>PAN no.</label>
              <input className={`${inputCls} uppercase font-mono`} maxLength={10} placeholder="ABCDE1234F" value={shared.panNo} onChange={(e) => setS("panNo", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Number</label>
              <input className={`${inputCls} font-mono`} inputMode="numeric" placeholder="10-digit mobile" value={shared.phone} onChange={(e) => setS("phone", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Location</label>
              <input className={inputCls} value={shared.location} onChange={(e) => setS("location", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Date *</label>
              <input type="date" className={inputCls} required value={shared.date} onChange={(e) => setS("date", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Time</label>
              <input type="time" className={inputCls} value={shared.time} onChange={(e) => setS("time", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Emp name</label>
              {canPickEmployee ? (
                <select className={inputCls} value={shared.employeeId} onChange={(e) => pickEmployee(e.target.value)}>
                  {editing && !employees.some((emp) => emp.employeeId === editing.employeeId) && (
                    <option value={editing.employeeId}>{editing.empName}</option>
                  )}
                  {employees.map((emp) => (
                    <option key={emp.employeeId} value={emp.employeeId}>
                      {emp.name} ({emp.employeeId})
                    </option>
                  ))}
                </select>
              ) : (
                <input className={`${inputCls} bg-slate-50 text-slate-600`} readOnly value={editing?.empName || empName} />
              )}
            </div>
            <div>
              <label className={labelCls}>Product</label>
              <input className={`${inputCls} uppercase`} list="ls-products" value={shared.product} onChange={(e) => setS("product", e.target.value)} />
              <datalist id="ls-products">
                {LOGIN_SHEET_PRODUCTS.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </div>
            <div>
              <label className={labelCls}>Branch</label>
              <select className={inputCls} value={shared.branch} onChange={(e) => setS("branch", e.target.value)}>
                <option value="">—</option>
                {BRANCHES.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Amount (₹) *</label>
              <input className={`${inputCls} font-mono`} type="number" min={0} required value={shared.amount} onChange={(e) => setS("amount", e.target.value)} />
            </div>
          </div>
        </div>

        {/* Bank lines */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs font-bold text-slate-800">{editing ? "Bank & status" : `Banks (${lines.length})`}</div>
            {!editing && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={lines.length >= MAX_ENTRIES_PER_REQUEST}
                onClick={() => setLines((ls) => [...ls, newLine()])}
                icon={<Plus className="w-3.5 h-3.5" />}
              >
                Add another bank
              </Button>
            )}
          </div>

          {lines.map((l, i) => (
            <div key={l.key} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500">{editing ? "Row" : `Bank ${i + 1}`}</span>
                {!editing && lines.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                    className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                    title="Remove this bank"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className={labelCls}>Bank name *</label>
                  <input className={`${inputCls} uppercase`} required list="ls-banks" value={l.bankName} onChange={(e) => setLine(l.key, { bankName: e.target.value })} />
                </div>
                <div>
                  <label className={labelCls}>DSA name</label>
                  <input className={`${inputCls} uppercase`} list="ls-dsas" value={l.dsaName} onChange={(e) => setLine(l.key, { dsaName: e.target.value })} />
                </div>
                <div>
                  <label className={labelCls}>Login ID</label>
                  <input className={`${inputCls} uppercase font-mono`} value={l.loginId} onChange={(e) => setLine(l.key, { loginId: e.target.value })} />
                </div>
                <div>
                  <label className={labelCls}>File</label>
                  <input className={`${inputCls} uppercase`} value={l.file} onChange={(e) => setLine(l.key, { file: e.target.value })} />
                </div>
                <div>
                  <label className={labelCls}>Status *</label>
                  <select className={inputCls} value={l.status} onChange={(e) => setLine(l.key, { status: e.target.value })}>
                    {!(LOGIN_SHEET_STATUSES as readonly string[]).includes(l.status) && <option value={l.status}>{l.status}</option>}
                    {LOGIN_SHEET_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="lg:col-span-2">
                  <label className={labelCls}>Remarks 1</label>
                  <input className={inputCls} placeholder="e.g. ROI - 11% PF 9000" value={l.remarks} onChange={(e) => setLine(l.key, { remarks: e.target.value })} />
                </div>
                <div>
                  <label className={labelCls}>Amount 2 (₹)</label>
                  <input className={`${inputCls} font-mono`} type="number" min={0} value={l.amount2} onChange={(e) => setLine(l.key, { amount2: e.target.value })} />
                </div>
                <div className="sm:col-span-2 lg:col-span-4">
                  <label className={labelCls}>Insurance details</label>
                  <input className={inputCls} placeholder="e.g. 5000 - 5 YEARS" value={l.insuranceDetails} onChange={(e) => setLine(l.key, { insuranceDetails: e.target.value })} />
                </div>
              </div>
            </div>
          ))}
        </div>

        <datalist id="ls-banks">
          {bankOptions.map((b) => (
            <option key={b} value={b} />
          ))}
        </datalist>
        <datalist id="ls-dsas">
          {dsaOptions.map((d) => (
            <option key={d} value={d} />
          ))}
        </datalist>

        {error && (
          <div role="alert" className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-2.5">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" isLoading={saving}>
            {editing ? "Save changes" : lines.length > 1 ? `Add ${lines.length} rows` : "Add row"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
