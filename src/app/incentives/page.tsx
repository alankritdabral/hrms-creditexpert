"use client";

import React, { useState, useEffect } from "react";
import { IncentiveScheme, EmployeeIncentiveRecord, Employee } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useAuth } from "@/lib/auth-context";
import { Award, Plus, CheckCircle, Percent, Hash, Layers } from "lucide-react";

export default function IncentivesPage() {
  const { currentUser } = useAuth();
  const [schemes, setSchemes] = useState<IncentiveScheme[]>([]);
  const [incentives, setIncentives] = useState<EmployeeIncentiveRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedMonth, setSelectedMonth] = useState("2026-10");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Form State
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [selectedSchemeId, setSelectedSchemeId] = useState("");
  const [target, setTarget] = useState(10);
  const [achievement, setAchievement] = useState(15);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canManage = ["admin", "hr"].includes(currentUser.role);

  const loadData = async () => {
    try {
      const [incRes, empRes] = await Promise.all([
        fetch(`/api/incentives?month=${selectedMonth}`).then((r) => r.json()),
        fetch("/api/employees").then((r) => r.json()),
      ]);

      if (incRes.success && incRes.data) {
        setSchemes(incRes.data.schemes || []);
        setIncentives(incRes.data.incentives || []);
        if (incRes.data.schemes?.length > 0) {
          setSelectedSchemeId(incRes.data.schemes[0].id);
        }
      }
      if (empRes.success && empRes.data) {
        setEmployees(empRes.data);
        if (empRes.data.length > 0) {
          setSelectedEmployeeId(empRes.data[0].employeeId);
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

  const calculatePreview = () => {
    const scheme = schemes.find((s) => s.id === selectedSchemeId);
    if (!scheme) return 0;
    if (scheme.type === "fixed") {
      return (scheme.fixedRate || 500) * achievement;
    }
    if (scheme.type === "percentage") {
      return Math.round((achievement * (scheme.percentageRate || 2)) / 100);
    }
    if (scheme.type === "slab" && scheme.slabs) {
      for (const slab of scheme.slabs) {
        if (achievement >= slab.min && achievement <= slab.max) {
          return slab.amount;
        }
      }
    }
    return 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const emp = employees.find((e) => e.employeeId === selectedEmployeeId);
    const scheme = schemes.find((s) => s.id === selectedSchemeId);
    const computedAmount = calculatePreview();

    try {
      const res = await fetch("/api/incentives", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: selectedEmployeeId,
          employeeName: emp?.personal.fullName || selectedEmployeeId,
          month: selectedMonth,
          schemeId: selectedSchemeId,
          schemeName: scheme?.name || "Standard Scheme",
          target: Number(target),
          achievement: Number(achievement),
          eligibleAmount: computedAmount,
          incentiveAmount: computedAmount,
          actor: { name: currentUser.name, role: currentUser.role },
        }),
      });
      const data = await res.json();
      if (data.success) {
        setIsModalOpen(false);
        loadData();
      }
    } catch (e) {
      console.error(e);
      alert("Error recording incentive claim");
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalIncentivesDisbursed = incentives
    .filter((i) => i.status === "Approved")
    .reduce((acc, curr) => acc + curr.incentiveAmount, 0);

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <Award className="w-6 h-6 text-blue-600" />
            Incentive & Bonus Management
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Configurable schemes (Fixed, Percentage, Slab-based) seamlessly integrated into monthly payroll calculations.
          </p>
        </div>
        {canManage && (
          <Button
            onClick={() => setIsModalOpen(true)}
            size="sm"
            icon={<Plus className="w-4 h-4" />}
          >
            Record Employee Incentive
          </Button>
        )}
      </div>

      {/* Active Scheme Cards (Section 12 of PRD) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {schemes.map((s) => (
          <div key={s.id} className="glass-card rounded-2xl p-5 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
                {s.type === "fixed" ? (
                  <Hash className="w-4 h-4" />
                ) : s.type === "percentage" ? (
                  <Percent className="w-4 h-4" />
                ) : (
                  <Layers className="w-4 h-4" />
                )}
              </span>
              <Badge variant="indigo" className="uppercase text-[10px]">
                {s.type}
              </Badge>
            </div>
            <div>
              <h3 className="font-bold text-white text-sm">{s.name}</h3>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">{s.description}</p>
            </div>
            {s.slabs && (
              <div className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-[11px] text-slate-300 space-y-1 font-mono">
                {s.slabs.map((sl, idx) => (
                  <div key={idx} className="flex justify-between">
                    <span>
                      {sl.min}–{sl.max > 100 ? "+" : sl.max} conversions:
                    </span>
                    <span className="text-emerald-400 font-bold">₹{sl.amount.toLocaleString("en-IN")}</span>
                  </div>
                ))}
              </div>
            )}
            {s.fixedRate && (
              <div className="text-emerald-400 font-mono text-xs font-bold">
                Rate: ₹{s.fixedRate.toLocaleString("en-IN")} per conversion
              </div>
            )}
            {s.percentageRate && (
              <div className="text-emerald-400 font-mono text-xs font-bold">
                Rate: {s.percentageRate}% of eligible value
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Filter and Disbursal Summary */}
      <div className="glass-card rounded-2xl p-4 border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-300 font-medium">Month:</span>
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
          />
        </div>
        <div className="text-right">
          <span className="text-xs text-slate-400">Total Approved Incentives: </span>
          <span className="text-base font-bold text-emerald-400 font-mono">
            ₹{totalIncentivesDisbursed.toLocaleString("en-IN")}
          </span>
        </div>
      </div>

      {/* Incentive Records Table */}
      <div className="glass-card rounded-2xl p-6 border border-slate-800 space-y-4">
        <h3 className="font-semibold text-white text-base">Recorded Incentives for {selectedMonth}</h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="pb-3 font-medium">Employee</th>
                <th className="pb-3 font-medium">Scheme</th>
                <th className="pb-3 font-medium">Target</th>
                <th className="pb-3 font-medium">Achieved</th>
                <th className="pb-3 font-medium">Incentive Payout</th>
                <th className="pb-3 font-medium">Approval Status</th>
                <th className="pb-3 font-medium">Approved By</th>
                <th className="pb-3 font-medium">Payroll Ref</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {incentives.map((i) => (
                <tr key={i.id} className="hover:bg-slate-800/20">
                  <td className="py-3 font-medium text-slate-200">
                    <div>{i.employeeName}</div>
                    <span className="text-[10px] text-slate-500 font-mono">{i.employeeId}</span>
                  </td>
                  <td className="py-3 text-slate-300 font-medium">{i.schemeName}</td>
                  <td className="py-3 text-slate-400">{i.target}</td>
                  <td className="py-3 text-slate-200 font-semibold">{i.achievement}</td>
                  <td className="py-3 font-bold text-emerald-400 font-mono">
                    ₹{i.incentiveAmount.toLocaleString("en-IN")}
                  </td>
                  <td className="py-3">
                    <Badge variant={i.status === "Approved" ? "success" : "warning"}>{i.status}</Badge>
                  </td>
                  <td className="py-3 text-slate-400">{i.approvedBy || "Pending"}</td>
                  <td className="py-3 font-mono text-indigo-400">{i.payrollRunId || "PAY-" + i.month}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Record Incentive Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Record Employee Incentive"
        subtitle="Log month-end target achievements and calculate incentive payout based on scheme configuration."
        maxWidth="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Select Employee *</label>
            <select
              value={selectedEmployeeId}
              onChange={(e) => setSelectedEmployeeId(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
            >
              {employees.map((e) => (
                <option key={e.id} value={e.employeeId}>
                  {e.personal.fullName} ({e.employeeId} - {e.employment.department})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Incentive Scheme *</label>
            <select
              value={selectedSchemeId}
              onChange={(e) => setSelectedSchemeId(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
            >
              {schemes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.type})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Assigned Target</label>
              <input
                type="number"
                value={target}
                onChange={(e) => setTarget(Number(e.target.value))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Verified Achievement
              </label>
              <input
                type="number"
                value={achievement}
                onChange={(e) => setAchievement(Number(e.target.value))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between text-xs">
            <span className="text-slate-400">Calculated Payout:</span>
            <span className="text-base font-bold text-emerald-400 font-mono">
              ₹{calculatePreview().toLocaleString("en-IN")}
            </span>
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-800">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" isLoading={isSubmitting}>
              Approve & Record
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
