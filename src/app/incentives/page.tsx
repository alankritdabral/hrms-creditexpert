"use client";

import React, { useState, useEffect } from "react";
import { IncentiveScheme, EmployeeIncentiveRecord, Employee } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useAuth } from "@/lib/auth-context";
import {
  Award,
  Plus,
  CheckCircle,
  Percent,
  Hash,
  Layers,
  Sparkles,
  TrendingUp,
  Building2,
  Calendar,
  Search,
  ArrowRight,
  Calculator,
  Info,
  DollarSign,
  FileCheck2,
  Edit2,
  Trash2,
  Settings,
  Sliders,
} from "lucide-react";
import Link from "next/link";

export default function IncentivesPage() {
  const { currentUser } = useAuth();
  const [schemes, setSchemes] = useState<IncentiveScheme[]>([]);
  const [incentives, setIncentives] = useState<EmployeeIncentiveRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedMonth, setSelectedMonth] = useState("2026-10");
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Sync / Auto-Fetch State
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncSuccessMessage, setSyncSuccessMessage] = useState<string | null>(null);

  // Manual Add Incentive Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addEmployeeId, setAddEmployeeId] = useState("");
  const [addSchemeId, setAddSchemeId] = useState("");
  const [addTarget, setAddTarget] = useState(10);
  const [addAchievement, setAddAchievement] = useState(15);
  const [addIncentiveAmount, setAddIncentiveAmount] = useState<number | "">("");
  const [addStatus, setAddStatus] = useState<"Approved" | "Pending" | "Rejected">("Approved");
  const [isAdding, setIsAdding] = useState(false);

  // Edit Existing Incentive Modal State
  const [editingRecord, setEditingRecord] = useState<EmployeeIncentiveRecord | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Policy Settings Modal State
  const [isPolicyModalOpen, setIsPolicyModalOpen] = useState(false);
  const [policyHurdleMultiplier, setPolicyHurdleMultiplier] = useState(100);
  const [policyAxisRate, setPolicyAxisRate] = useState(200);
  const [isSavingPolicy, setIsSavingPolicy] = useState(false);

  // Calculation Breakdown Viewer Modal
  const [breakdownModalRecord, setBreakdownModalRecord] = useState<EmployeeIncentiveRecord | null>(null);

  const canManage = ["admin", "hr"].includes(currentUser.role);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [incRes, empRes] = await Promise.all([
        fetch(`/api/incentives?month=${selectedMonth}`).then((r) => r.json()),
        fetch("/api/employees").then((r) => r.json()),
      ]);

      if (incRes.success && incRes.data) {
        setSchemes(incRes.data.schemes || []);
        setIncentives(incRes.data.incentives || []);
        if (incRes.data.schemes?.length > 0 && !addSchemeId) {
          setAddSchemeId(incRes.data.schemes[0].id);
        }
      }
      if (empRes.success && empRes.data) {
        setEmployees(empRes.data);
        if (empRes.data.length > 0 && !addEmployeeId) {
          setAddEmployeeId(empRes.data[0].employeeId);
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
  }, [selectedMonth]);

  // One-click Auto-fetch & Calculate from Logins
  const handleAutoSyncFromLogins = async () => {
    setIsSyncing(true);
    setSyncSuccessMessage(null);
    try {
      const res = await fetch("/api/incentives", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "sync_from_logins",
          month: selectedMonth,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSyncSuccessMessage(`Successfully calculated incentives for ${data.data.length} employees from ${selectedMonth} disbursals!`);
        await loadData();
        setTimeout(() => setSyncSuccessMessage(null), 6000);
      } else {
        alert(data.error || "Failed to calculate incentives from logins");
      }
    } catch (e) {
      console.error(e);
      alert("Error triggering automated incentive calculation");
    } finally {
      setIsSyncing(false);
    }
  };

  // Add New Incentive Record
  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAdding(true);
    const emp = employees.find((e) => e.employeeId === addEmployeeId);
    const scheme = schemes.find((s) => s.id === addSchemeId);
    const amount = addIncentiveAmount !== "" ? Number(addIncentiveAmount) : 5000;

    try {
      const res = await fetch("/api/incentives", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: addEmployeeId,
          employeeName: emp?.personal.fullName || addEmployeeId,
          month: selectedMonth,
          schemeId: addSchemeId,
          schemeName: scheme?.name || "Disbursal Slab Incentive",
          target: Number(addTarget),
          achievement: Number(addAchievement),
          eligibleAmount: amount,
          incentiveAmount: amount,
          status: addStatus,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setIsAddModalOpen(false);
        setAddIncentiveAmount("");
        loadData();
      } else {
        alert(data.error || "Failed to add incentive");
      }
    } catch (e) {
      console.error(e);
      alert("Error recording incentive claim");
    } finally {
      setIsAdding(false);
    }
  };

  // Update Existing Incentive Record
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRecord) return;
    setIsSavingEdit(true);

    try {
      const res = await fetch("/api/incentives", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingRecord.id,
          target: Number(editingRecord.target),
          achievement: Number(editingRecord.achievement),
          incentiveAmount: Number(editingRecord.incentiveAmount),
          eligibleAmount: Number(editingRecord.eligibleAmount || editingRecord.incentiveAmount),
          status: editingRecord.status,
          schemeName: editingRecord.schemeName,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setIsEditModalOpen(false);
        loadData();
      } else {
        alert(data.error || "Failed to update record");
      }
    } catch (e) {
      console.error(e);
      alert("Error updating record");
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Delete Incentive Record
  const handleDeleteRecord = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete the incentive record for ${name}?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/incentives?id=${id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        loadData();
      } else {
        alert(data.error || "Failed to delete record");
      }
    } catch (e) {
      console.error(e);
      alert("Error deleting record");
    }
  };

  // Update Policy Slabs
  const handleSavePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingPolicy(true);
    try {
      const res = await fetch("/api/incentives", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_scheme",
          id: "scheme-disbursal-slab",
          name: "Disbursal Slab Incentive (CreditExpert)",
          type: "slab",
          description: `Hurdle = Salary × ${policyHurdleMultiplier}. Axis Bank: ₹${policyAxisRate}/L. Flat slabs: 15L-26L: ₹200/L, 26L-36L: ₹300/L, 36L-56L: ₹400/L, >56L: ₹500/L.`,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setIsPolicyModalOpen(false);
        loadData();
      }
    } catch (e) {
      console.error(e);
      alert("Error saving policy settings");
    } finally {
      setIsSavingPolicy(false);
    }
  };

  const totalIncentivesDisbursed = incentives
    .filter((i) => i.status === "Approved")
    .reduce((acc, curr) => acc + curr.incentiveAmount, 0);

  const filteredIncentives = incentives.filter((i) => {
    const q = search.toLowerCase();
    return (
      i.employeeName.toLowerCase().includes(q) ||
      i.employeeId.toLowerCase().includes(q) ||
      i.schemeName.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                Incentive & Bonus Management
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Automated loan disbursal incentives with salary hurdle reduction, Axis Bank rate, and flat volume slabs.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
            <Calendar className="w-4 h-4 text-slate-400" />
            <span className="text-xs font-semibold text-slate-600">Month:</span>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-transparent text-xs font-semibold text-slate-900 focus:outline-none cursor-pointer"
            />
          </div>

          <Link href="/logins">
            <Button size="sm" variant="outline" icon={<TrendingUp className="w-4 h-4 text-blue-600" />}>
              View Logins
            </Button>
          </Link>

          {canManage && (
            <>
              <Button
                onClick={handleAutoSyncFromLogins}
                size="sm"
                isLoading={isSyncing}
                icon={<Sparkles className="w-4 h-4 text-amber-500" />}
                className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-xs"
              >
                Auto-Fetch & Calculate
              </Button>
              <Button
                onClick={() => setIsAddModalOpen(true)}
                size="sm"
                icon={<Plus className="w-4 h-4" />}
              >
                + Add Incentive
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Sync Success Banner */}
      {syncSuccessMessage && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between gap-3 animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-semibold">{syncSuccessMessage}</span>
          </div>
          <Link href="/payroll">
            <span className="text-emerald-700 font-bold hover:underline cursor-pointer">
              Go to Payroll Engine →
            </span>
          </Link>
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* FORMULA ARCHITECTURE CARD (WHITE COMPONENT STYLING)                */}
      {/* ----------------------------------------------------------------- */}
      <div className="bg-white rounded-2xl p-6 text-slate-900 border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm tracking-tight text-slate-900">
                CreditExpert Disbursal Incentive Formula Engine
              </h3>
              <p className="text-[11px] text-slate-500">
                Multi-stage logic: Salary hurdle cut $\to$ Axis Bank partner slab $\to$ Flat volume brackets
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="indigo" className="text-[10px] uppercase font-mono tracking-wider">
              Active Policy (100x Hurdle)
            </Badge>
            {canManage && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsPolicyModalOpen(true)}
                icon={<Sliders className="w-3.5 h-3.5" />}
              >
                Edit Policy
              </Button>
            )}
          </div>
        </div>

        {/* 4 Step Explainer Cards (White Theme with Refined Accents) */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
          {/* Step 1 */}
          <div className="bg-rose-50/50 rounded-xl p-4 border border-rose-200/80 space-y-2">
            <div className="font-bold text-rose-900 flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-rose-100 text-rose-800 border border-rose-200 flex items-center justify-center text-[10px] font-bold">
                1
              </span>
              Axis Bank (Salary Exempt)
            </div>
            <p className="text-slate-600 text-[11px] leading-relaxed">
              Axis Bank disbursals are <span className="font-semibold text-rose-800">exempt from the salary cut</span> and earn a direct flat <code className="text-rose-900 font-bold bg-rose-100/80 border border-rose-200 px-1 py-0.5 rounded text-[10px]">₹{policyAxisRate} per ₹1,00,000 (0.2%)</code>.
            </p>
          </div>

          {/* Step 2 */}
          <div className="bg-amber-50/50 rounded-xl p-4 border border-amber-200/80 space-y-2">
            <div className="font-bold text-amber-900 flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 flex items-center justify-center text-[10px] font-bold">
                2
              </span>
              Salary Hurdle on Other Banks
            </div>
            <p className="text-slate-600 text-[11px] leading-relaxed">
              Hurdle = <code className="text-amber-900 font-bold bg-amber-100/80 border border-amber-200 px-1 py-0.5 rounded text-[10px]">Salary × {policyHurdleMultiplier}</code>.
              Subtracted strictly from <span className="font-semibold text-amber-900">other banks apart from Axis</span>.
            </p>
          </div>

          {/* Step 3 */}
          <div className="bg-emerald-50/50 rounded-xl p-4 border border-emerald-200/80 space-y-2">
            <div className="font-bold text-emerald-900 flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center justify-center text-[10px] font-bold">
                3
              </span>
              Flat General Slabs
            </div>
            <p className="text-slate-600 text-[11px] leading-relaxed">
              Remaining other banks balance earns flat slab tier:
              <br />
              <span className="font-medium text-slate-700">• 15L–26L: ₹200/L &nbsp;• 26L–36L: ₹300/L</span>
              <br />
              <span className="font-medium text-slate-700">• 36L–56L: ₹400/L &nbsp;• &gt; 56L: ₹500/L</span>
            </p>
          </div>

          {/* Step 4 */}
          <div className="bg-blue-50/50 rounded-xl p-4 border border-blue-200/80 space-y-2">
            <div className="font-bold text-blue-900 flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-800 border border-blue-200 flex items-center justify-center text-[10px] font-bold">
                4
              </span>
              Total Net Incentive
            </div>
            <p className="text-slate-600 text-[11px] leading-relaxed">
              Net payout = <code className="text-blue-900 font-bold bg-blue-100/80 border border-blue-200 px-1 py-0.5 rounded text-[10px]">Axis Bank + Other Banks Slabs</code>. Automatically syncs with Payroll.
            </p>
          </div>
        </div>
      </div>

      {/* Summary KPI Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Total Approved Incentives
          </span>
          <div className="text-2xl font-bold text-emerald-600 font-mono mt-2">
            ₹{totalIncentivesDisbursed.toLocaleString("en-IN")}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            For period {selectedMonth}
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Eligible Sales Reps
          </span>
          <div className="text-2xl font-bold text-slate-900 mt-2">
            {incentives.filter((i) => i.incentiveAmount > 0).length} of {incentives.length}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Achieved disbursal exceeding salary hurdle
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Logins Data Source
            </span>
            <div className="text-sm font-bold text-slate-900 mt-2 flex items-center gap-1.5">
              <CheckCircle className="w-4 h-4 text-emerald-600" />
              Connected to Logins Hub
            </div>
          </div>
          <Link href="/logins" className="text-xs text-blue-600 font-semibold hover:underline mt-2">
            Update bank disbursals in Logins Hub →
          </Link>
        </div>
      </div>

      {/* Incentive Records Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search employee, ID, scheme..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 bg-slate-50/50"
            />
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span>Showing {filteredIncentives.length} incentive claims</span>
            {canManage && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsAddModalOpen(true)}
                icon={<Plus className="w-3.5 h-3.5" />}
              >
                Add Record
              </Button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs min-w-[950px]">
            <thead>
              <tr className="bg-slate-50/70 border-b border-slate-200/80 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                <th className="py-3.5 px-4">Employee</th>
                <th className="py-3.5 px-4">Scheme</th>
                <th className="py-3.5 px-4">Total Disbursal (Achieved)</th>
                <th className="py-3.5 px-4">Formula Breakdown</th>
                <th className="py-3.5 px-4">Incentive Payout</th>
                <th className="py-3.5 px-4">Approval Status</th>
                <th className="py-3.5 px-4">Payroll Ref</th>
                {canManage && <th className="py-3.5 px-4 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                      <span>Loading incentive records...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredIncentives.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <div className="space-y-3">
                      <div>No incentive records recorded for {selectedMonth} yet.</div>
                      {canManage && (
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            size="sm"
                            onClick={handleAutoSyncFromLogins}
                            icon={<Sparkles className="w-4 h-4" />}
                          >
                            Auto-Calculate from Logins Hub
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setIsAddModalOpen(true)}
                            icon={<Plus className="w-4 h-4" />}
                          >
                            Add Manual Entry
                          </Button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredIncentives.map((i) => {
                  const b = i.calculationBreakdown;
                  return (
                    <tr key={i.id} className="hover:bg-slate-50/60 transition-colors">
                      {/* Employee Column */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-xs shrink-0">
                            {i.employeeName.charAt(0)}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900">{i.employeeName}</div>
                            <div className="text-[10px] text-slate-500 font-mono">{i.employeeId}</div>
                          </div>
                        </div>
                      </td>

                      {/* Scheme */}
                      <td className="py-3 px-4">
                        <span className="font-medium text-slate-800">{i.schemeName}</span>
                      </td>

                      {/* Disbursal Achieved */}
                      <td className="py-3 px-4">
                        <div className="font-mono font-bold text-slate-900">
                          ₹{i.achievement.toLocaleString("en-IN")}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          Target: ₹{i.target.toLocaleString("en-IN")}
                        </div>
                      </td>

                      {/* Formula Breakdown Badge */}
                      <td className="py-3 px-4">
                        {b ? (
                          <button
                            type="button"
                            onClick={() => setBreakdownModalRecord(i)}
                            className="text-left group cursor-pointer p-1 -m-1 rounded-lg hover:bg-blue-50 transition-colors"
                          >
                            <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                              {b.isEligible ? (
                                <>
                                  {b.axisIncentive > 0 && (
                                    <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 font-semibold border border-rose-200">
                                      Axis: +₹{b.axisIncentive.toLocaleString("en-IN")}
                                    </span>
                                  )}
                                  {b.slabIncentive > 0 ? (
                                    <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-semibold border border-blue-200">
                                      Slab ({b.slabRatePerLakh}/L): +₹{b.slabIncentive.toLocaleString("en-IN")}
                                    </span>
                                  ) : (
                                    <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-medium border border-amber-200">
                                      Other Banks: {b.slabBracket}
                                    </span>
                                  )}
                                </>
                              ) : (
                                <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
                                  Hurdle Not Met (₹0 Payout)
                                </span>
                              )}
                              <span className="text-blue-600 group-hover:underline text-[10px] ml-1">
                                View Math →
                              </span>
                            </div>
                          </button>
                        ) : (
                          <span className="text-slate-400 text-[11px] italic">Standard Scheme</span>
                        )}
                      </td>

                      {/* Incentive Payout */}
                      <td className="py-3 px-4">
                        <div className="text-base font-bold text-emerald-600 font-mono">
                          ₹{i.incentiveAmount.toLocaleString("en-IN")}
                        </div>
                        {i.incentiveAmount === 0 && (
                          <span className="text-[10px] text-slate-400">₹0 Hurdle not met</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4">
                        <Badge
                          variant={
                            i.status === "Approved"
                              ? "success"
                              : i.status === "Rejected"
                              ? "danger"
                              : "warning"
                          }
                        >
                          {i.status}
                        </Badge>
                      </td>

                      {/* Payroll Ref */}
                      <td className="py-3 px-4">
                        <Link href="/payroll">
                          <span className="font-mono text-blue-600 hover:underline cursor-pointer">
                            {i.payrollRunId || `PAY-${i.month}`}
                          </span>
                        </Link>
                      </td>

                      {/* Actions */}
                      {canManage && (
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingRecord(i);
                                setIsEditModalOpen(true);
                              }}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                              title="Edit this incentive record"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteRecord(i.id, i.employeeName)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                              title="Delete record"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* MODAL 1: Math Breakdown Drawer/Modal                          */}
      {/* ------------------------------------------------------------- */}
      <Modal
        isOpen={Boolean(breakdownModalRecord)}
        onClose={() => setBreakdownModalRecord(null)}
        title={`Incentive Calculation Math — ${breakdownModalRecord?.employeeName || ""}`}
        subtitle="Complete transparent calculation breakdown based on monthly salary and loan disbursals."
        maxWidth="lg"
      >
        {breakdownModalRecord?.calculationBreakdown && (
          <div className="space-y-5">
            {/* Calculation Card */}
            {(() => {
              const b = breakdownModalRecord.calculationBreakdown!;
              return (
                <div className="space-y-4">
                  {/* Step 1: Axis Bank Disbursal (Salary Exempt) */}
                  <div className="p-4 rounded-xl bg-rose-50/40 border border-rose-200 space-y-2">
                    <div className="text-xs font-bold text-rose-900 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <span className="w-4 h-4 rounded-full bg-rose-700 text-white flex items-center justify-center text-[10px]">1</span>
                        Axis Bank Incentive (Salary Deductions Exempt)
                      </span>
                      <span className="text-[11px] font-semibold text-rose-700">Rate: ₹200 / ₹1,00,000</span>
                    </div>
                    <div className="text-xs text-slate-600 flex justify-between">
                      <span>Total Axis Bank Disbursal:</span>
                      <span className="font-mono font-bold text-slate-900">₹{b.totalAxisDisbursal.toLocaleString("en-IN")}</span>
                    </div>
                    <div className="text-xs text-slate-500 italic">
                      Axis Bank disbursals are evaluated directly without salary deduction.
                    </div>
                    <div className="text-xs text-slate-900 font-semibold flex justify-between pt-1 border-t border-rose-200">
                      <span>Axis Bank Incentive Earned:</span>
                      <span className="font-bold font-mono text-emerald-700">
                        + ₹{b.axisIncentive.toLocaleString("en-IN")}
                      </span>
                    </div>
                  </div>

                  {/* Step 2: Other Banks & Salary Hurdle */}
                  <div className="p-4 rounded-xl bg-amber-50/40 border border-amber-200 space-y-2">
                    <div className="text-xs font-bold text-amber-900 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <span className="w-4 h-4 rounded-full bg-amber-700 text-white flex items-center justify-center text-[10px]">2</span>
                        Other Banks Disbursals & Salary Hurdle (100x)
                      </span>
                      <span className="font-mono text-slate-700">Salary: ₹{b.monthlySalary.toLocaleString("en-IN")}</span>
                    </div>
                    <div className="text-xs text-slate-600 flex justify-between">
                      <span>Disbursals from Other Banks (apart from Axis):</span>
                      <span className="font-bold text-slate-900 font-mono">₹{b.otherBanksDisbursal.toLocaleString("en-IN")}</span>
                    </div>
                    <div className="text-xs text-slate-600 flex justify-between">
                      <span>Salary Hurdle (₹{b.monthlySalary.toLocaleString("en-IN")} × 100):</span>
                      <span className="font-bold text-rose-600 font-mono">- ₹{b.salaryHurdle.toLocaleString("en-IN")}</span>
                    </div>
                    <div className="text-xs font-semibold text-slate-900 flex justify-between pt-1 border-t border-amber-200">
                      <span>Other Banks Balance after Salary Cut:</span>
                      <span className="font-bold font-mono text-blue-700">₹{b.remainingDisbursalForSlabs.toLocaleString("en-IN")}</span>
                    </div>
                  </div>

                  {/* Step 3: Remaining Disbursal Slabs */}
                  <div className="p-4 rounded-xl bg-blue-50/40 border border-blue-200 space-y-2">
                    <div className="text-xs font-bold text-blue-900 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <span className="w-4 h-4 rounded-full bg-blue-700 text-white flex items-center justify-center text-[10px]">3</span>
                        General Disbursal Slabs on Other Banks
                      </span>
                      <span className="text-[11px] font-semibold text-blue-700">Bracket: {b.slabBracket}</span>
                    </div>
                    <div className="text-xs text-slate-600 flex justify-between">
                      <span>Evaluated Other Banks Amount:</span>
                      <span className="font-mono text-slate-900">₹{b.remainingDisbursalForSlabs.toLocaleString("en-IN")}</span>
                    </div>
                    <div className="text-xs text-slate-600 flex justify-between">
                      <span>Applied Flat Rate:</span>
                      <span className="font-mono text-slate-900">₹{b.slabRatePerLakh} per ₹1,00,000</span>
                    </div>
                    <div className="text-xs text-slate-900 font-semibold flex justify-between pt-1 border-t border-blue-200">
                      <span>General Slab Incentive Earned:</span>
                      <span className="font-bold font-mono text-emerald-700">
                        + ₹{b.slabIncentive.toLocaleString("en-IN")}
                      </span>
                    </div>
                  </div>

                  {/* Total Net Payout */}
                  <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-emerald-900 uppercase tracking-wide">
                        Total Net Incentive Payout
                      </span>
                      <p className="text-[11px] text-emerald-700 mt-0.5">
                        Axis Bank (+₹{b.axisIncentive.toLocaleString("en-IN")}) + Other Banks (+₹{b.slabIncentive.toLocaleString("en-IN")})
                      </p>
                    </div>
                    <div className="text-2xl font-bold font-mono text-emerald-800">
                      ₹{b.totalIncentive.toLocaleString("en-IN")}
                    </div>
                  </div>
                </div>
              );
            })()}

            <div className="flex items-center justify-between pt-2">
              <Link href="/logins" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                Edit Disbursals in Logins Hub <ArrowRight className="w-3.5 h-3.5" />
              </Link>
              <Button size="sm" variant="ghost" onClick={() => setBreakdownModalRecord(null)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ------------------------------------------------------------- */}
      {/* MODAL 2: Add New Incentive Entry                              */}
      {/* ------------------------------------------------------------- */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add New Incentive Entry"
        subtitle="Log employee target achievement and assign approved incentive payout."
        maxWidth="md"
      >
        <form onSubmit={handleAddSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Select Employee *</label>
            <select
              value={addEmployeeId}
              onChange={(e) => setAddEmployeeId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-500"
              required
            >
              {employees.map((e) => (
                <option key={e.id} value={e.employeeId}>
                  {e.personal.fullName} ({e.employeeId} - {e.employment.department})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Incentive Scheme *</label>
            <select
              value={addSchemeId}
              onChange={(e) => setAddSchemeId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-500"
            >
              {schemes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.type})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Target Volume (₹)</label>
              <input
                type="number"
                value={addTarget}
                onChange={(e) => setAddTarget(Number(e.target.value))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-blue-500"
                placeholder="e.g. 5000000"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Achieved Disbursal (₹)
              </label>
              <input
                type="number"
                value={addAchievement}
                onChange={(e) => setAddAchievement(Number(e.target.value))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-blue-500"
                placeholder="e.g. 7500000"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Incentive Payout (₹) *
              </label>
              <input
                type="number"
                value={addIncentiveAmount}
                onChange={(e) =>
                  setAddIncentiveAmount(e.target.value ? Number(e.target.value) : "")
                }
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-blue-500 font-bold"
                placeholder="e.g. 15000"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Approval Status</label>
              <select
                value={addStatus}
                onChange={(e) => setAddStatus(e.target.value as any)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-500"
              >
                <option value="Approved">Approved (Ready for Payroll)</option>
                <option value="Pending">Pending Review</option>
                <option value="Rejected">Rejected</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsAddModalOpen(false)}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" isLoading={isAdding} className="w-full sm:w-auto">
              Save & Add Entry
            </Button>
          </div>
        </form>
      </Modal>

      {/* ------------------------------------------------------------- */}
      {/* MODAL 3: Edit Existing Incentive Record                       */}
      {/* ------------------------------------------------------------- */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title={`Edit Incentive — ${editingRecord?.employeeName || ""}`}
        subtitle="Modify verified target, achievement volume, incentive payout, or approval status."
        maxWidth="md"
      >
        {editingRecord && (
          <form onSubmit={handleSaveEdit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Scheme Name</label>
              <input
                type="text"
                value={editingRecord.schemeName}
                onChange={(e) =>
                  setEditingRecord({ ...editingRecord, schemeName: e.target.value })
                }
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Target Volume (₹)</label>
                <input
                  type="number"
                  value={editingRecord.target}
                  onChange={(e) =>
                    setEditingRecord({ ...editingRecord, target: Number(e.target.value) })
                  }
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Achieved Disbursal (₹)
                </label>
                <input
                  type="number"
                  value={editingRecord.achievement}
                  onChange={(e) =>
                    setEditingRecord({ ...editingRecord, achievement: Number(e.target.value) })
                  }
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Incentive Payout (₹) *
                </label>
                <input
                  type="number"
                  value={editingRecord.incentiveAmount}
                  onChange={(e) =>
                    setEditingRecord({ ...editingRecord, incentiveAmount: Number(e.target.value) })
                  }
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 font-mono font-bold focus:outline-none focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
                <select
                  value={editingRecord.status}
                  onChange={(e) =>
                    setEditingRecord({ ...editingRecord, status: e.target.value as any })
                  }
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-500"
                >
                  <option value="Approved">Approved</option>
                  <option value="Pending">Pending</option>
                  <option value="Rejected">Rejected</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-end gap-2 pt-4 border-t border-slate-100">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIsEditModalOpen(false)}
                className="w-full sm:w-auto"
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" isLoading={isSavingEdit} className="w-full sm:w-auto">
                Save Changes
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* ------------------------------------------------------------- */}
      {/* MODAL 4: Edit Policy Rules / Multiplier                       */}
      {/* ------------------------------------------------------------- */}
      <Modal
        isOpen={isPolicyModalOpen}
        onClose={() => setIsPolicyModalOpen(false)}
        title="Configure Disbursal Incentive Policy"
        subtitle="Adjust the enterprise salary hurdle multiplier and Axis Bank partner incentive rate."
        maxWidth="md"
      >
        <form onSubmit={handleSavePolicy} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Salary Hurdle Multiplier
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={policyHurdleMultiplier}
                onChange={(e) => setPolicyHurdleMultiplier(Number(e.target.value))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-blue-500 font-bold"
                placeholder="e.g. 100"
                required
              />
              <span className="text-xs text-slate-500 font-bold shrink-0">x Salary</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              Default is 100x (e.g. ₹15,000 monthly salary becomes ₹15,00,000 disbursal hurdle).
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Axis Bank Rate per Lakh (₹)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={policyAxisRate}
                onChange={(e) => setPolicyAxisRate(Number(e.target.value))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-blue-500 font-bold"
                placeholder="e.g. 200"
                required
              />
              <span className="text-xs text-slate-500 shrink-0">₹ / 1,00,000</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              Default is ₹200 per lakh (0.20%).
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 space-y-1">
            <div className="font-semibold text-slate-800">Flat General Disbursal Slabs:</div>
            <div>• 15 Lakh – 26 Lakh: ₹200 / Lakh</div>
            <div>• 26 Lakh – 36 Lakh: ₹300 / Lakh</div>
            <div>• 36 Lakh – 56 Lakh: ₹400 / Lakh</div>
            <div>• Above 56 Lakh: ₹500 / Lakh</div>
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsPolicyModalOpen(false)}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" isLoading={isSavingPolicy} className="w-full sm:w-auto">
              Save Policy
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
