"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { PayrollRun, PayrollStatus, PayrollItemSnapshot } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useAuth } from "@/lib/auth-context";
import { numberToIndianCurrencyWords } from "@/lib/payroll-engine";
import {
  CircleDollarSign,
  Play,
  Lock,
  CheckCircle,
  FileSpreadsheet,
  CheckCheck,
  ShieldAlert,
  Building2,
  Printer,
  Eye,
  AlertCircle,
} from "lucide-react";

export default function PayrollPage() {
  const { currentUser } = useAuth();
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<PayrollRun | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // New Payroll Modal State
  const [isNewRunModalOpen, setIsNewRunModalOpen] = useState(false);
  const [newRunMonth, setNewRunMonth] = useState("2026-10");
  const [newRunLabel, setNewRunLabel] = useState("October 2026");
  const [isCalculating, setIsCalculating] = useState(false);

  // Payslip Modal State
  const [activePayslipItem, setActivePayslipItem] = useState<PayrollItemSnapshot | null>(null);

  // Lifecycle Advance Action
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  const canManagePayroll = ["admin", "hr"].includes(currentUser.role);

  const loadRuns = async () => {
    try {
      const res = await fetch("/api/payroll");
      const data = await res.json();
      if (data.success && data.data) {
        setRuns(data.data);
        if (data.data.length > 0) {
          setSelectedRun(data.data[0]);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRuns();
  }, []);

  const handleCalculatePayroll = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCalculating(true);
    try {
      const res = await fetch("/api/payroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          month: newRunMonth,
          periodLabel: newRunLabel,
          actor: { name: currentUser.name, role: currentUser.role },
        }),
      });
      const data = await res.json();
      if (data.success) {
        setIsNewRunModalOpen(false);
        loadRuns();
        setSelectedRun(data.data);
      } else {
        alert(data.error || "Failed to calculate payroll");
      }
    } catch (e) {
      console.error(e);
      alert("Error initiating payroll calculation");
    } finally {
      setIsCalculating(false);
    }
  };

  const handleAdvanceLifecycle = async (targetStatus: PayrollStatus) => {
    if (!selectedRun) return;
    setIsUpdatingStatus(true);
    try {
      const res = await fetch("/api/payroll", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId: selectedRun.id,
          status: targetStatus,
          actor: { name: currentUser.name, role: currentUser.role },
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSelectedRun(data.data);
        loadRuns();
      } else {
        alert(data.error || "Failed to update lifecycle");
      }
    } catch (e) {
      console.error(e);
      alert("Error updating payroll status");
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const lifecycleStages: { key: PayrollStatus; label: string }[] = [
    { key: "DRAFT", label: "Draft" },
    { key: "ATTENDANCE_LOCKED", label: "Attendance Locked" },
    { key: "CALCULATED", label: "Calculated" },
    { key: "HR_REVIEW", label: "HR Review" },
    { key: "APPROVED", label: "Approved" },
    { key: "FINALIZED", label: "Finalized (Snapshot)" },
    { key: "PAYSLIP_GENERATED", label: "Payslips Ready" },
    { key: "PAID", label: "Disbursed / Paid" },
  ];

  const currentStageIndex = selectedRun
    ? lifecycleStages.findIndex((s) => s.key === selectedRun.status)
    : 0;

  const getNextStage = (status: PayrollStatus): PayrollStatus | null => {
    const sequence: PayrollStatus[] = [
      "DRAFT",
      "ATTENDANCE_LOCKED",
      "CALCULATED",
      "HR_REVIEW",
      "APPROVED",
      "FINALIZED",
      "PAYSLIP_GENERATED",
      "PAID",
    ];
    const idx = sequence.indexOf(status);
    return idx >= 0 && idx < sequence.length - 1 ? sequence[idx + 1] : null;
  };

  const nextStage = selectedRun ? getNextStage(selectedRun.status) : null;

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <CircleDollarSign className="w-6 h-6 text-blue-600" />
            Payroll Engine & Lifecycle Control
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Server-side calculation engine, statutory PF deductions, unexcused absence LOP, and snapshot versioning.
          </p>
        </div>
        {canManagePayroll && (
          <Button
            onClick={() => setIsNewRunModalOpen(true)}
            size="sm"
            icon={<Play className="w-4 h-4" />}
            className="bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/20"
          >
            Compute New Payroll Run
          </Button>
        )}
      </div>

      {/* Runs Selector Tab Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 border-b border-slate-800">
        {runs.map((r) => {
          const isSelected = selectedRun?.id === r.id;
          return (
            <button
              key={r.id}
              onClick={() => setSelectedRun(r)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap cursor-pointer transition-all ${
                isSelected
                  ? "bg-slate-800 text-white border border-slate-700 shadow-md"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
              }`}
            >
              <span className="font-mono">{r.runCode}</span>
              <span>({r.periodLabel})</span>
              <Badge
                variant={
                  r.status === "PAID"
                    ? "success"
                    : r.status === "FINALIZED"
                    ? "indigo"
                    : "warning"
                }
                className="text-[10px]"
              >
                {r.status}
              </Badge>
            </button>
          );
        })}
      </div>

      {selectedRun && (
        <>
          {/* Controlled Lifecycle Stepper (Section 10 of PRD) */}
          <div className="glass-card rounded-2xl p-6 border border-slate-800 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <div>
                <span className="text-xs text-indigo-400 font-semibold uppercase tracking-wider">
                  Lifecycle Workflow Stage
                </span>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <span>{selectedRun.periodLabel}</span>
                  <Badge variant="indigo">{selectedRun.status}</Badge>
                </h3>
              </div>

              {canManagePayroll && nextStage && (
                <Button
                  size="sm"
                  isLoading={isUpdatingStatus}
                  onClick={() => handleAdvanceLifecycle(nextStage)}
                  icon={nextStage === "FINALIZED" ? <Lock className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                  className={nextStage === "FINALIZED" ? "bg-purple-600 hover:bg-purple-500" : "bg-indigo-600"}
                >
                  Advance to: {nextStage.replace("_", " ")}
                </Button>
              )}
            </div>

            {/* Visual Stepper Track */}
            <div className="relative overflow-x-auto pb-2">
              <div className="flex items-center justify-between min-w-[700px]">
                {lifecycleStages.map((stage, idx) => {
                  const isDone = idx < currentStageIndex;
                  const isCurrent = idx === currentStageIndex;
                  return (
                    <div key={stage.key} className="flex-1 flex flex-col items-center relative text-center">
                      {/* Connecting Line */}
                      {idx !== 0 && (
                        <div
                          className={`absolute top-3.5 right-1/2 w-full h-0.5 -z-10 ${
                            idx <= currentStageIndex ? "bg-indigo-500" : "bg-slate-800"
                          }`}
                        />
                      )}

                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                          isDone
                            ? "bg-emerald-500 text-white"
                            : isCurrent
                            ? "bg-indigo-600 text-white ring-4 ring-indigo-500/30 animate-pulse"
                            : "bg-slate-800 text-slate-500 border border-slate-700"
                        }`}
                      >
                        {isDone ? <CheckCircle className="w-4 h-4" /> : idx + 1}
                      </div>

                      <span
                        className={`text-[10px] mt-2 font-medium tracking-tight ${
                          isCurrent
                            ? "text-indigo-400 font-bold"
                            : isDone
                            ? "text-slate-300"
                            : "text-slate-500"
                        }`}
                      >
                        {stage.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {selectedRun.status === "FINALIZED" && (
              <div className="p-3.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-xs text-purple-300 flex items-center gap-2">
                <Lock className="w-4 h-4" />
                <span>
                  <strong>Snapshot Locked:</strong> Finalized on{" "}
                  {selectedRun.finalizedAt ? new Date(selectedRun.finalizedAt).toLocaleDateString() : "today"}. Values
                  cannot be altered by future salary revisions.
                </span>
              </div>
            )}
          </div>

          {/* Key Financial Totals Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="glass-card rounded-2xl p-5 border border-slate-800">
              <span className="text-slate-400 text-xs">Total Employees</span>
              <p className="text-2xl font-bold text-white mt-1">{selectedRun.totalEmployees}</p>
              <span className="text-[11px] text-slate-500">Active roster payroll</span>
            </div>
            <div className="glass-card rounded-2xl p-5 border border-slate-800">
              <span className="text-slate-400 text-xs">Gross Earnings</span>
              <p className="text-2xl font-bold text-indigo-400 mt-1">
                ₹{selectedRun.totalGross.toLocaleString("en-IN")}
              </p>
              <span className="text-[11px] text-slate-500">Basic + HRA + Incentives</span>
            </div>
            <div className="glass-card rounded-2xl p-5 border border-slate-800">
              <span className="text-slate-400 text-xs">Total Deductions</span>
              <p className="text-2xl font-bold text-rose-400 mt-1">
                -₹{selectedRun.totalDeductions.toLocaleString("en-IN")}
              </p>
              <span className="text-[11px] text-slate-500">PF + PT + LOP</span>
            </div>
            <div className="glass-card rounded-2xl p-5 border border-slate-800">
              <span className="text-slate-400 text-xs">Net Disbursement</span>
              <p className="text-2xl font-bold text-emerald-400 mt-1">
                ₹{selectedRun.totalNet.toLocaleString("en-IN")}
              </p>
              <span className="text-[11px] text-slate-500">Total Take-Home Pay</span>
            </div>
          </div>

          {/* Payroll Breakdown Snapshot Table (PRD Section 11) */}
          <div className="glass-card rounded-2xl p-6 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-white text-base">Employee Payroll Breakdown</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Detailed snapshot of earnings, overtime, incentives, statutory PF, and LOP deductions.
                </p>
              </div>
              <Badge variant="indigo">{selectedRun.items.length} Employees</Badge>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="pb-3 font-medium">Employee</th>
                    <th className="pb-3 font-medium">Basic</th>
                    <th className="pb-3 font-medium">HRA</th>
                    <th className="pb-3 font-medium">Incentive</th>
                    <th className="pb-3 font-medium">OT / Bonus</th>
                    <th className="pb-3 font-medium">PF (12%)</th>
                    <th className="pb-3 font-medium">PT</th>
                    <th className="pb-3 font-medium">LOP</th>
                    <th className="pb-3 font-medium font-bold text-white">Net Pay</th>
                    <th className="pb-3 font-medium text-right">Payslip</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {selectedRun.items.map((item) => (
                    <tr key={item.employeeId} className="hover:bg-slate-800/20">
                      <td className="py-3 font-medium text-slate-200">
                        <div>{item.employeeName}</div>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {item.employeeId} • {item.department}
                        </span>
                      </td>
                      <td className="py-3 text-slate-300">₹{item.basic.toLocaleString("en-IN")}</td>
                      <td className="py-3 text-slate-300">₹{item.hra.toLocaleString("en-IN")}</td>
                      <td className="py-3 text-emerald-400 font-medium">
                        {item.incentive > 0 ? `+₹${item.incentive.toLocaleString("en-IN")}` : "—"}
                      </td>
                      <td className="py-3 text-slate-300">
                        {item.overtime > 0 ? `+₹${item.overtime}` : "—"}
                      </td>
                      <td className="py-3 text-rose-400">-₹{item.employeePf}</td>
                      <td className="py-3 text-rose-400">-₹{item.professionalTax}</td>
                      <td className="py-3 text-rose-400">
                        {item.lopAmount > 0 ? `-₹${item.lopAmount} (${item.lopDays}d)` : "₹0"}
                      </td>
                      <td className="py-3 font-bold text-emerald-400 font-mono text-sm">
                        ₹{item.netSalary.toLocaleString("en-IN")}
                      </td>
                      <td className="py-3 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<Eye className="w-3.5 h-3.5" />}
                          onClick={() => setActivePayslipItem(item)}
                          className="text-xs py-1 px-2.5 text-indigo-400 hover:text-white"
                        >
                          Payslip
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Compute New Payroll Modal */}
      <Modal
        isOpen={isNewRunModalOpen}
        onClose={() => setIsNewRunModalOpen(false)}
        title="Compute Server-Side Payroll Run"
        subtitle="The server engine will pull attendance, compute unapproved LOP, fetch approved incentives, calculate statutory PF, and build a provisional snapshot."
        maxWidth="md"
      >
        <form onSubmit={handleCalculatePayroll} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Payroll Period (Month & Year) *
            </label>
            <input
              type="month"
              required
              value={newRunMonth}
              onChange={(e) => {
                setNewRunMonth(e.target.value);
                const [year, month] = e.target.value.split("-");
                const monthName = new Date(Number(year), Number(month) - 1).toLocaleString("en-US", {
                  month: "long",
                });
                setNewRunLabel(`${monthName} ${year}`);
              }}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Period Label *</label>
            <input
              type="text"
              required
              value={newRunLabel}
              onChange={(e) => setNewRunLabel(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-400 space-y-1">
            <span className="font-semibold text-slate-300 block">Automatic Server-Side Logic:</span>
            <p>• Pulls all active employees and active salary structures.</p>
            <p>• Calculates LOP from unexcused absence records.</p>
            <p>• Integrates approved incentives for {newRunMonth}.</p>
            <p>• Computes statutory PF (12%) and PT (₹200).</p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-800">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsNewRunModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" isLoading={isCalculating}>
              Run Calculation Engine
            </Button>
          </div>
        </form>
      </Modal>

      {/* Payslip View Modal (Section 13 of PRD) */}
      <Modal
        isOpen={!!activePayslipItem}
        onClose={() => setActivePayslipItem(null)}
        title="Official Payslip Voucher"
        subtitle={`Payslip Ref: PAY-${selectedRun?.month}-${activePayslipItem?.employeeId}`}
        maxWidth="2xl"
      >
        {activePayslipItem && (
          <div className="space-y-6 text-xs text-slate-200">
            {/* Header info */}
            <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-3">
                  <div className="relative h-10 w-auto flex items-center bg-[#0a2540] px-2 py-1 rounded-lg border border-[#87bfff]/20">
                    <Image
                      src="/img/logo.webp"
                      alt="Credit Expert India Logo"
                      width={120}
                      height={32}
                      className="h-7 w-auto object-contain"
                    />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-sm tracking-tight">CREDIT EXPERT INDIA</h3>
                    <p className="text-[10px] text-[#87bfff]">HR & Payroll Division • Corporate HQ</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-500 font-mono">PAYSLIP FOR</span>
                  <p className="font-bold text-white text-sm">{selectedRun?.periodLabel}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
                <div>
                  <span className="text-slate-500 block">Employee Name</span>
                  <span className="font-semibold text-white">{activePayslipItem.employeeName}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Employee ID</span>
                  <span className="font-mono text-indigo-400">{activePayslipItem.employeeId}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Designation</span>
                  <span className="text-slate-300">{activePayslipItem.designation}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Department</span>
                  <span className="text-slate-300">{activePayslipItem.department}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Bank Account</span>
                  <span className="font-mono text-slate-300">{activePayslipItem.bankAccountMasked}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">IFSC Code</span>
                  <span className="font-mono text-slate-300">{activePayslipItem.ifscCode}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">PAN (Masked)</span>
                  <span className="font-mono text-slate-300">{activePayslipItem.panMasked}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">LOP Days</span>
                  <span className="text-slate-300">{activePayslipItem.lopDays} days</span>
                </div>
              </div>
            </div>

            {/* Earnings & Deductions Split */}
            <div className="grid grid-cols-2 gap-4">
              {/* Earnings */}
              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider block border-b border-slate-800 pb-1.5">
                  Earnings
                </span>
                <div className="flex justify-between">
                  <span className="text-slate-400">Basic Salary</span>
                  <span className="font-mono text-white">₹{activePayslipItem.basic.toLocaleString("en-IN")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">House Rent Allowance (HRA)</span>
                  <span className="font-mono text-white">₹{activePayslipItem.hra.toLocaleString("en-IN")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Special & Other Allowances</span>
                  <span className="font-mono text-white">
                    ₹{activePayslipItem.otherAllowance.toLocaleString("en-IN")}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Approved Incentives</span>
                  <span className="font-mono text-emerald-400">
                    +₹{activePayslipItem.incentive.toLocaleString("en-IN")}
                  </span>
                </div>
                {activePayslipItem.overtime > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Overtime Payout</span>
                    <span className="font-mono text-emerald-400">+₹{activePayslipItem.overtime}</span>
                  </div>
                )}
                <div className="flex justify-between pt-2 border-t border-slate-800 font-bold">
                  <span className="text-white">Gross Earnings</span>
                  <span className="font-mono text-emerald-400">
                    ₹{activePayslipItem.grossEarnings.toLocaleString("en-IN")}
                  </span>
                </div>
              </div>

              {/* Deductions */}
              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                <span className="text-xs font-semibold text-rose-400 uppercase tracking-wider block border-b border-slate-800 pb-1.5">
                  Deductions
                </span>
                <div className="flex justify-between">
                  <span className="text-slate-400">Employee PF (12%)</span>
                  <span className="font-mono text-rose-400">-₹{activePayslipItem.employeePf}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Professional Tax (PT)</span>
                  <span className="font-mono text-rose-400">-₹{activePayslipItem.professionalTax}</span>
                </div>
                {activePayslipItem.lopAmount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Loss of Pay (LOP)</span>
                    <span className="font-mono text-rose-400">-₹{activePayslipItem.lopAmount}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-400">Other Deductions</span>
                  <span className="font-mono text-rose-400">-₹{activePayslipItem.otherDeductions}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-slate-800 font-bold">
                  <span className="text-white">Total Deductions</span>
                  <span className="font-mono text-rose-400">
                    -₹{activePayslipItem.totalDeductions.toLocaleString("en-IN")}
                  </span>
                </div>
              </div>
            </div>

            {/* Net Salary in Words */}
            <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-950/40 via-slate-900 to-slate-900 border border-emerald-500/30 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block">
                  Net Salary Payable
                </span>
                <span className="text-xl font-bold text-emerald-400 font-mono">
                  ₹{activePayslipItem.netSalary.toLocaleString("en-IN")}
                </span>
                <p className="text-[11px] text-slate-400 mt-0.5 italic">
                  {numberToIndianCurrencyWords(activePayslipItem.netSalary)}
                </p>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-500 block">Employer PF (Non-deducted)</span>
                <span className="text-slate-300 font-mono">₹{activePayslipItem.employerPf}</span>
              </div>
            </div>

            {/* Payslip Modal Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-800">
              <Button
                variant="outline"
                size="sm"
                icon={<Printer className="w-4 h-4" />}
                onClick={() => window.print()}
              >
                Print / Save PDF
              </Button>
              <Button size="sm" onClick={() => setActivePayslipItem(null)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
