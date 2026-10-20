"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import { PayrollRun, PayrollItemSnapshot } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useAuth } from "@/lib/auth-context";
import { numberToIndianCurrencyWords } from "@/lib/payroll-engine";
import { FileSpreadsheet, Printer, Eye, Search } from "lucide-react";

export default function PayslipsPage() {
  const { currentUser } = useAuth();
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [selectedMonth, setSelectedMonth] = useState("2026-10");
  const [activeItem, setActiveItem] = useState<PayrollItemSnapshot | null>(null);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const loadData = async () => {
    try {
      const res = await fetch("/api/payroll");
      const data = await res.json();
      if (data.success && data.data) {
        setRuns(data.data);
        if (data.data.length > 0) {
          setSelectedMonth(data.data[0].month);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const activeRun = runs.find((r) => r.month === selectedMonth) || runs[0];

  const isEmployeeOnly = currentUser.role === "employee";
  let itemsToDisplay = activeRun?.items || [];

  if (isEmployeeOnly) {
    itemsToDisplay = itemsToDisplay.filter((i) => i.employeeId === currentUser.employeeId);
  }

  if (search) {
    itemsToDisplay = itemsToDisplay.filter(
      (i) =>
        i.employeeName.toLowerCase().includes(search.toLowerCase()) ||
        i.employeeId.toLowerCase().includes(search.toLowerCase()) ||
        i.department.toLowerCase().includes(search.toLowerCase())
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <FileSpreadsheet className="w-6 h-6 text-blue-600" />
            Monthly Payslips & Statements
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Official monthly compensation vouchers, statutory earnings and deductions, printable in PDF format.
          </p>
        </div>
      </div>

      {/* Selector & Search */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <span className="text-xs text-slate-600 font-semibold">Select Pay Period:</span>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-blue-600 font-medium"
          >
            {runs.map((r) => (
              <option key={r.id} value={r.month}>
                {r.periodLabel} ({r.runCode})
              </option>
            ))}
          </select>
          <Badge variant="success">{activeRun?.status || "FINALIZED"}</Badge>
        </div>

        {!isEmployeeOnly && (
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search employee payslips..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-blue-600"
            />
          </div>
        )}
      </div>

      {/* Payslips Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {itemsToDisplay.map((item) => (
          <div
            key={item.employeeId}
            className="bg-white rounded-2xl p-5 border border-slate-200 hover:border-blue-300 shadow-xs hover:shadow-md transition-all space-y-4"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">{item.employeeName}</h3>
                <span className="text-[11px] font-mono text-blue-600 font-semibold">{item.employeeId}</span>
                <span className="text-slate-500 text-[11px] block">{item.designation}</span>
              </div>
              <Badge variant="indigo" className="text-[10px]">
                {activeRun?.periodLabel}
              </Badge>
            </div>

            <div className="space-y-1.5 p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Gross Earnings:</span>
                <span className="text-slate-800 font-mono font-medium">₹{item.grossEarnings.toLocaleString("en-IN")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Total Deductions:</span>
                <span className="text-rose-600 font-mono font-medium">-₹{item.totalDeductions.toLocaleString("en-IN")}</span>
              </div>
              <div className="flex justify-between pt-1.5 border-t border-slate-200 font-bold">
                <span className="text-slate-800">Net Take-Home:</span>
                <span className="text-emerald-600 font-mono text-sm">
                  ₹{item.netSalary.toLocaleString("en-IN")}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="w-full text-xs"
                icon={<Eye className="w-3.5 h-3.5" />}
                onClick={() => setActiveItem(item)}
              >
                View Full Payslip
              </Button>
            </div>
          </div>
        ))}
      </div>

      {itemsToDisplay.length === 0 && (
        <div className="py-12 text-center text-slate-500 bg-white rounded-2xl border border-slate-200 shadow-xs text-xs">
          No payslip records found for this period.
        </div>
      )}

      {/* Printable Payslip Modal */}
      <Modal
        isOpen={!!activeItem}
        onClose={() => setActiveItem(null)}
        title="Official Salary Payslip Voucher"
        subtitle={`Period: ${activeRun?.periodLabel} • Ref: PAY-${activeRun?.month}-${activeItem?.employeeId}`}
        maxWidth="2xl"
      >
        {activeItem && (
          <div className="space-y-6 text-xs text-slate-800">
            {/* Header info */}
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <div className="flex items-center gap-3">
                  <div className="relative h-10 w-auto flex items-center bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs">
                    <Image
                      src="/img/logo.webp"
                      alt="Credit Expert India Logo"
                      width={120}
                      height={32}
                      className="h-7 w-auto object-contain"
                    />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm tracking-tight">CREDIT EXPERT INDIA</h3>
                    <p className="text-[10px] text-blue-600 font-medium">HR & Payroll Division • Corporate HQ</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-400 font-mono font-semibold">PAYSLIP FOR</span>
                  <p className="font-bold text-slate-900 text-sm">{activeRun?.periodLabel}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
                <div>
                  <span className="text-slate-500 block">Employee Name</span>
                  <span className="font-semibold text-slate-900">{activeItem.employeeName}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Employee ID</span>
                  <span className="font-mono text-blue-600 font-semibold">{activeItem.employeeId}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Designation</span>
                  <span className="text-slate-700">{activeItem.designation}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Department</span>
                  <span className="text-slate-700">{activeItem.department}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Bank Account</span>
                  <span className="font-mono text-slate-700">{activeItem.bankAccountMasked}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">IFSC Code</span>
                  <span className="font-mono text-slate-700">{activeItem.ifscCode}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">PAN (Masked)</span>
                  <span className="font-mono text-slate-700">{activeItem.panMasked}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">LOP Days</span>
                  <span className="text-slate-700">{activeItem.lopDays} days</span>
                </div>
              </div>
            </div>

            {/* Earnings & Deductions Split */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Earnings */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider block border-b border-slate-200 pb-1.5">
                  Earnings
                </span>
                <div className="flex justify-between">
                  <span className="text-slate-600">Basic Salary</span>
                  <span className="font-mono text-slate-900 font-medium">₹{activeItem.basic.toLocaleString("en-IN")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">House Rent Allowance (HRA)</span>
                  <span className="font-mono text-slate-900 font-medium">₹{activeItem.hra.toLocaleString("en-IN")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Other Allowances</span>
                  <span className="font-mono text-slate-900 font-medium">
                    ₹{activeItem.otherAllowance.toLocaleString("en-IN")}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Incentives</span>
                  <span className="font-mono text-emerald-600 font-semibold">
                    +₹{activeItem.incentive.toLocaleString("en-IN")}
                  </span>
                </div>
                {activeItem.overtime > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-600">Overtime Payout</span>
                    <span className="font-mono text-emerald-600 font-semibold">+₹{activeItem.overtime}</span>
                  </div>
                )}
                <div className="flex justify-between pt-2 border-t border-slate-200 font-bold">
                  <span className="text-slate-900">Gross Earnings</span>
                  <span className="font-mono text-emerald-700">
                    ₹{activeItem.grossEarnings.toLocaleString("en-IN")}
                  </span>
                </div>
              </div>

              {/* Deductions */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <span className="text-xs font-bold text-rose-700 uppercase tracking-wider block border-b border-slate-200 pb-1.5">
                  Deductions
                </span>
                <div className="flex justify-between">
                  <span className="text-slate-600">Employee PF (12%)</span>
                  <span className="font-mono text-rose-600 font-medium">-₹{activeItem.employeePf}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Professional Tax (PT)</span>
                  <span className="font-mono text-rose-600 font-medium">-₹{activeItem.professionalTax}</span>
                </div>
                {activeItem.lopAmount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-600">Loss of Pay (LOP)</span>
                    <span className="font-mono text-rose-600 font-medium">-₹{activeItem.lopAmount}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-600">Other Deductions</span>
                  <span className="font-mono text-rose-600 font-medium">-₹{activeItem.otherDeductions}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-slate-200 font-bold">
                  <span className="text-slate-900">Total Deductions</span>
                  <span className="font-mono text-rose-700">
                    -₹{activeItem.totalDeductions.toLocaleString("en-IN")}
                  </span>
                </div>
              </div>
            </div>

            {/* Net Salary in Words */}
            <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-[10px] text-blue-700 font-semibold uppercase tracking-wider block">
                  Net Payable Amount
                </span>
                <span className="text-2xl font-bold text-emerald-700 font-mono">
                  ₹{activeItem.netSalary.toLocaleString("en-IN")}
                </span>
                <p className="text-[11px] text-slate-600 mt-0.5 italic">
                  {numberToIndianCurrencyWords(activeItem.netSalary)}
                </p>
              </div>
              <div className="sm:text-right">
                <span className="text-[10px] text-slate-500 block">Employer PF (Company contribution)</span>
                <span className="text-slate-800 font-mono font-semibold">₹{activeItem.employerPf}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-200">
              <Button
                variant="outline"
                size="sm"
                icon={<Printer className="w-4 h-4" />}
                onClick={() => window.print()}
              >
                Print / Save PDF
              </Button>
              <Button size="sm" onClick={() => setActiveItem(null)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
