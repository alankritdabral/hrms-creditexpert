"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  UserCheck,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileText,
  Search,
  Filter,
  Plus,
  ShieldCheck,
  Building2,
  Calendar,
  Mail,
  Phone,
  ArrowRight,
  ExternalLink,
  ChevronRight,
  Sparkles,
  Lock,
  Laptop,
  CreditCard,
  GraduationCap,
  Scale,
  X,
  Check,
  UserPlus,
  Briefcase,
  Layers,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import {
  OnboardingRecord,
  OnboardingChecklistItem,
  Branch,
  BRANCHES,
  EmploymentStatus,
  LIFECYCLE_STAGES,
} from "@/lib/types";

export default function OnboardingPage() {
  const { currentUser } = useAuth();
  const [records, setRecords] = useState<OnboardingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBranch, setSelectedBranch] = useState<Branch | "All">("All");
  const [selectedStatus, setSelectedStatus] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState("");

  // Modal states
  const [activeChecklistRecord, setActiveChecklistRecord] = useState<OnboardingRecord | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [activating, setActivating] = useState(false);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);

  // New onboarding form state
  const [formData, setFormData] = useState({
    candidateName: "",
    email: "",
    phone: "",
    branch: "Delhi" as Branch,
    department: "Risk & Underwriting",
    designation: "",
    joiningDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    annualCtc: 500000,
    notes: "",
  });

  const fetchRecords = async () => {
    try {
      setLoading(true);
      const url = selectedBranch === "All" ? "/api/onboarding" : `/api/onboarding?branch=${selectedBranch}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setRecords(data.data);
      }
    } catch (e) {
      console.error("Failed to fetch onboarding records:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, [selectedBranch]);

  // Filter records
  const filteredRecords = useMemo(() => {
    return records
      .map((record) => {
        const completedCount = record.checklist ? record.checklist.filter((i) => i.completed).length : 0;
        const totalCount = record.checklist ? record.checklist.length : 0;
        const computedPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : record.progressPercentage;
        const computedStatus: OnboardingRecord["status"] =
          computedPct === 100 ? "Completed" : (completedCount > 0 ? "In Progress" : "Pending");
        return {
          ...record,
          progressPercentage: computedPct,
          status: computedStatus,
        };
      })
      .filter((r) => {
        const matchBranch = selectedBranch === "All" || r.branch === selectedBranch;
        const matchStatus = selectedStatus === "All" || r.status.toLowerCase() === selectedStatus.toLowerCase();
        const matchQuery =
          r.candidateName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          r.designation.toLowerCase().includes(searchQuery.toLowerCase()) ||
          r.department.toLowerCase().includes(searchQuery.toLowerCase()) ||
          r.email.toLowerCase().includes(searchQuery.toLowerCase());
        return matchBranch && matchStatus && matchQuery;
      });
  }, [records, selectedBranch, selectedStatus, searchQuery]);

  // Overall Statistics
  const stats = useMemo(() => {
    const total = records.length;
    let completedCount = 0;
    let inProgressCount = 0;
    let totalProgressSum = 0;
    let pendingVerificationCount = 0;

    records.forEach((r) => {
      const done = r.checklist ? r.checklist.filter((item) => item.completed).length : 0;
      const count = r.checklist ? r.checklist.length : 0;
      const pct = count > 0 ? Math.round((done / count) * 100) : (r.progressPercentage || 0);
      totalProgressSum += pct;
      if (pct === 100) {
        completedCount++;
      } else if (done > 0) {
        inProgressCount++;
      }
      if (r.checklist) {
        pendingVerificationCount += r.checklist.filter((item) => item.completed && !item.verified).length;
      }
    });

    const avgProgress = total > 0 ? Math.round(totalProgressSum / total) : 0;

    return { total, inProgress: inProgressCount, completed: completedCount, avgProgress, pendingVerificationCount };
  }, [records]);

  // Toggle checklist item
  const handleToggleChecklist = async (
    recordId: string,
    itemKey: string,
    currentCompleted: boolean,
    currentVerified: boolean,
    mode: "complete" | "verify"
  ) => {
    try {
      const updates =
        mode === "complete"
          ? { completed: !currentCompleted, verified: !currentCompleted ? currentVerified : false }
          : { verified: !currentVerified, completed: true };

      const res = await fetch(`/api/onboarding/${recordId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_checklist",
          itemKey,
          ...updates,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setRecords((prev) => prev.map((r) => (r.id === recordId ? data.data : r)));
        if (activeChecklistRecord?.id === recordId) {
          setActiveChecklistRecord(data.data);
        }
      }
    } catch (e) {
      console.error("Failed to update checklist item:", e);
    }
  };

  // Advance lifecycle status
  const handleAdvanceLifecycle = async (recordId: string, newStatus: EmploymentStatus) => {
    try {
      const res = await fetch(`/api/onboarding/${recordId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "advance_lifecycle",
          newStatus,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setRecords((prev) => prev.map((r) => (r.id === recordId ? data.data : r)));
        if (activeChecklistRecord?.id === recordId) {
          setActiveChecklistRecord(data.data);
        }
        setActionSuccessMessage(`Lifecycle status advanced to '${newStatus}'!`);
        setTimeout(() => setActionSuccessMessage(null), 4000);
      }
    } catch (e) {
      console.error("Failed to advance lifecycle:", e);
    }
  };

  // Activate employee profile
  const handleActivateEmployee = async (recordId: string) => {
    try {
      setActivating(true);
      const res = await fetch(`/api/onboarding/${recordId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "activate_employee" }),
      });
      const data = await res.json();
      if (data.success) {
        setRecords((prev) => prev.map((r) => (r.id === recordId ? data.data.onboarding : r)));
        if (activeChecklistRecord?.id === recordId) {
          setActiveChecklistRecord(data.data.onboarding);
        }
        setActionSuccessMessage(
          `Success! Employee profile activated as ${data.data.employee.employeeId} as Full-time Active.`
        );
        setTimeout(() => setActionSuccessMessage(null), 6000);
      }
    } catch (e) {
      console.error("Failed to activate employee:", e);
    } finally {
      setActivating(false);
    }
  };

  // Create new onboarding
  const handleCreateOnboarding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.candidateName || !formData.email || !formData.designation) {
      alert("Please fill in candidate name, email, and designation.");
      return;
    }
    try {
      setSubmitting(true);
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (data.success) {
        setRecords((prev) => [data.data, ...prev]);
        setIsNewModalOpen(false);
        setFormData({
          candidateName: "",
          email: "",
          phone: "",
          branch: "Delhi",
          department: "Risk & Underwriting",
          designation: "",
          joiningDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
          annualCtc: 500000,
          notes: "",
        });
        setActiveChecklistRecord(data.data);
        setActionSuccessMessage("Onboarding checklist initialized for candidate!");
        setTimeout(() => setActionSuccessMessage(null), 5000);
      } else {
        alert(data.error || "Failed to create onboarding record");
      }
    } catch (err) {
      console.error("Error creating onboarding:", err);
    } finally {
      setSubmitting(false);
    }
  };

  // Category Icon helper
  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "statutory":
        return <CreditCard className="w-4 h-4 text-emerald-600" />;
      case "compliance":
        return <Scale className="w-4 h-4 text-blue-600" />;
      case "documentation":
        return <GraduationCap className="w-4 h-4 text-amber-600" />;
      case "it_setup":
        return <Laptop className="w-4 h-4 text-indigo-600" />;
      case "account":
        return <ShieldCheck className="w-4 h-4 text-sky-600" />;
      default:
        return <FileText className="w-4 h-4 text-slate-600" />;
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Banner / Toast message */}
      {actionSuccessMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-xl flex items-center justify-between shadow-xs animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <span className="text-sm font-medium">{actionSuccessMessage}</span>
          </div>
          <button
            onClick={() => setActionSuccessMessage(null)}
            className="text-emerald-700 hover:text-emerald-900"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 tracking-wide uppercase">
              Operational Lifecycle
            </span>
            <span className="text-xs font-medium text-slate-500">Credit Expert India</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Employee Onboarding & Lifecycle Management
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Candidate onboarding checklist, document verification, IT provisioning, and employee activation.
          </p>
        </div>

        {(currentUser.role === "admin" || currentUser.role === "hr") && (
          <button
            onClick={() => setIsNewModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm shadow-sm transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            New Candidate Onboarding
          </button>
        )}
      </div>

      {/* KPI Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total In Onboarding
            </span>
            <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <UserCheck className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">{stats.inProgress}</span>
            <span className="text-xs text-slate-500">of {stats.total} candidates</span>
          </div>
          <div className="mt-3 text-xs text-blue-700 flex items-center gap-1 font-medium">
            <Clock className="w-3.5 h-3.5" /> Active verification pipelines
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Average Completion
            </span>
            <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">{stats.avgProgress}%</span>
            <span className="text-xs text-slate-500">checklist tasks done</span>
          </div>
          <div className="mt-3 w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${stats.avgProgress}%` }}
            />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Pending HR Verification
            </span>
            <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <AlertCircle className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-amber-600">{stats.pendingVerificationCount}</span>
            <span className="text-xs text-slate-500">uploaded documents</span>
          </div>
          <div className="mt-3 text-xs text-amber-700 flex items-center gap-1 font-medium">
            <ShieldCheck className="w-3.5 h-3.5" /> Requires sign-off
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Ready For Activation
            </span>
            <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <UserPlus className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">
              {stats.completed}
            </span>
            <span className="text-xs text-slate-500">fully cleared</span>
          </div>
          <div className="mt-3 text-xs text-indigo-700 flex items-center gap-1 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5" /> 100% checklist cleared
          </div>
        </div>
      </div>

      {/* Filters and Controls */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Branch Tabs */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg w-full md:w-auto overflow-x-auto">
          <button
            onClick={() => setSelectedBranch("All")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all whitespace-nowrap cursor-pointer ${
              selectedBranch === "All"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            All Branches
          </button>
          {BRANCHES.map((b) => (
            <button
              key={b}
              onClick={() => setSelectedBranch(b)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all whitespace-nowrap cursor-pointer ${
                selectedBranch === b
                  ? "bg-white text-blue-700 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {b}
            </button>
          ))}
        </div>

        {/* Status Filters & Search */}
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search candidate or role..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>

          <div className="flex items-center gap-1.5 w-full sm:w-auto">
            <span className="text-xs text-slate-500 font-medium">Status:</span>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="All">All Statuses</option>
              <option value="In Progress">In Progress</option>
              <option value="Pending">Pending</option>
              <option value="Completed">Completed</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Candidate Onboarding List */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Active Candidates & New Hires</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Showing {filteredRecords.length} onboarding profiles
            </p>
          </div>
        </div>

        {loading ? (
          <div className="py-16 text-center text-slate-500 text-sm">
            <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            Loading onboarding records...
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="py-16 text-center text-slate-500 text-sm">
            <UserCheck className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            No onboarding records matching your criteria.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredRecords.map((record) => {
              const completedCount = record.checklist.filter((i) => i.completed).length;
              const totalCount = record.checklist.length;
              const isFullyDone = record.progressPercentage === 100;

              return (
                <div
                  key={record.id}
                  className="p-4 sm:p-5 hover:bg-slate-50/60 transition-colors flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                >
                  {/* Left: Identity & Info */}
                  <div className="flex items-start gap-4 min-w-[280px]">
                    <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-700 font-bold text-lg flex items-center justify-center shrink-0">
                      {record.candidateName
                        .split(" ")
                        .map((n) => n[0])
                        .join("")}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-slate-900 text-base">{record.candidateName}</h3>
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-slate-100 text-slate-700 border border-slate-200">
                          {record.branch} Branch
                        </span>
                        {record.employeeId && (
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                            {record.employeeId}
                          </span>
                        )}
                        {record.selfRegistered && (
                          <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                            Self-Registered
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-slate-600 mt-0.5 font-medium">
                        {record.designation} • <span className="text-slate-500">{record.department}</span>
                      </p>

                      <div className="flex items-center gap-3 mt-2 text-xs text-slate-500 flex-wrap">
                        <span className="flex items-center gap-1">
                          <Mail className="w-3.5 h-3.5 text-slate-400" />
                          {record.email}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          Joining: {record.joiningDate}
                        </span>
                        <span className="flex items-center gap-1">
                          <Briefcase className="w-3.5 h-3.5 text-slate-400" />
                          HR: {record.assignedHrName}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Middle: Progress & Lifecycle Stage */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-6 lg:min-w-[320px]">
                    {/* Lifecycle pill */}
                    <div className="space-y-1">
                      <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                        Lifecycle Stage
                      </span>
                      <span
                        className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-md border ${
                          record.lifecycleStatus === "Active" || record.lifecycleStatus === "Confirmed"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : record.lifecycleStatus === "Onboarding"
                            ? "bg-blue-50 text-blue-700 border-blue-200"
                            : "bg-amber-50 text-amber-700 border-amber-200"
                        }`}
                      >
                        {record.lifecycleStatus === "Probation" ? "Active" : record.lifecycleStatus}
                      </span>
                    </div>

                    {/* Checklist Progress Bar */}
                    <div className="flex-1 space-y-1.5 min-w-[180px]">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-700">Checklist Progress</span>
                        <span className="font-bold text-slate-900">
                          {record.progressPercentage}% ({completedCount}/{totalCount})
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200">
                        <div
                          className={`h-2 rounded-full transition-all duration-500 ${
                            isFullyDone
                              ? "bg-emerald-500"
                              : record.progressPercentage > 50
                              ? "bg-blue-600"
                              : "bg-amber-500"
                          }`}
                          style={{ width: `${record.progressPercentage}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span>
                          {record.checklist.filter((i) => i.verified).length} verified by HR
                        </span>
                        <span
                          className={`font-medium ${
                            record.status === "Completed" ? "text-emerald-600" : "text-blue-600"
                          }`}
                        >
                          {record.status}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0 w-full lg:w-auto">
                    <button
                      onClick={() => {
                        setActiveChecklistRecord(record);
                        setSelectedCategory("all");
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors cursor-pointer shadow-2xs"
                    >
                      <FileText className="w-3.5 h-3.5 text-blue-600" />
                      View Checklist
                    </button>

                    {/* Transition dropdown for HR/Admin */}
                    {(currentUser.role === "admin" || currentUser.role === "hr") && (
                      <select
                        value={record.lifecycleStatus === "Probation" ? "Active" : record.lifecycleStatus}
                        onChange={(e) => handleAdvanceLifecycle(record.id, e.target.value as EmploymentStatus)}
                        className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 font-medium focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                        title="Change Lifecycle Status"
                      >
                        <option value="Candidate">Candidate</option>
                        <option value="Offer Sent">Offer Sent</option>
                        <option value="Offer Accepted">Offer Accepted</option>
                        <option value="Onboarding">Onboarding</option>
                        <option value="Confirmed">Confirmed</option>
                        <option value="Active">Active</option>
                        <option value="On Notice">On Notice</option>
                        <option value="Resigned">Resigned</option>
                        <option value="Terminated">Terminated</option>
                        <option value="Exited">Exited</option>
                      </select>
                    )}

                    {/* Activation button */}
                    {(currentUser.role === "admin" || currentUser.role === "hr") &&
                      !record.employeeId && (
                        <button
                          onClick={() => handleActivateEmployee(record.id)}
                          disabled={activating}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer shadow-xs ${
                            isFullyDone
                              ? "bg-emerald-600 hover:bg-emerald-700 text-white animate-pulse"
                              : "bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300"
                          }`}
                          title={
                            isFullyDone
                              ? "All checklist items complete! Click to activate permanent employee record."
                              : "Activate employee profile with current onboarding data."
                          }
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                          Activate Employee
                        </button>
                      )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MODAL 1: Interactive Checklist Drawer / Modal */}
      {activeChecklistRecord && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-3xl w-full border border-slate-200 shadow-xl overflow-hidden my-auto max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-2.5rem)] flex flex-col">
            {/* Modal Header */}
            <div className="p-4 sm:p-6 border-b border-slate-100 bg-slate-50/50 flex items-start justify-between shrink-0">
              <div className="space-y-1.5 flex-1 pr-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold uppercase tracking-wider text-blue-700 bg-blue-100/70 px-2.5 py-0.5 rounded-full">
                    Onboarding Checklist
                  </span>
                  <span className="text-xs text-slate-600 font-medium px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200">
                    {activeChecklistRecord.branch} Branch
                  </span>
                  {activeChecklistRecord.employeeId ? (
                    <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono">
                      Emp No: {activeChecklistRecord.employeeId}
                    </span>
                  ) : (
                    <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                      Emp No: Pending Allocation
                    </span>
                  )}
                  {activeChecklistRecord.selfRegistered && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                      Self-Registered
                    </span>
                  )}
                </div>

                <h2 className="text-xl font-bold text-slate-900 mt-1">
                  {activeChecklistRecord.candidateName}
                </h2>

                <p className="text-xs text-slate-600">
                  {activeChecklistRecord.designation} • {activeChecklistRecord.department} • Target Joining:{" "}
                  <span className="font-semibold text-slate-800">{activeChecklistRecord.joiningDate}</span>
                </p>

                {/* Candidate Contact & Employee Credentials */}
                <div className="flex items-center gap-3 pt-1 text-xs flex-wrap">
                  {/* Employee Number Badge */}
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 border border-slate-200 font-semibold font-mono shadow-2xs">
                    <span className="text-slate-500 font-sans font-normal text-[11px]">Emp No:</span>
                    <span className={activeChecklistRecord.employeeId ? "text-emerald-700 font-bold" : "text-amber-700 font-sans font-medium"}>
                      {activeChecklistRecord.employeeId || "Pending Allocation"}
                    </span>
                  </span>

                  {/* Email */}
                  <a
                    href={`mailto:${activeChecklistRecord.email}`}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50/80 hover:bg-blue-100 text-blue-700 border border-blue-200 font-medium transition-colors shadow-2xs"
                    title="Send Email"
                  >
                    <Mail className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    <span>{activeChecklistRecord.email}</span>
                  </a>

                  {/* Phone / Contact Number */}
                  {activeChecklistRecord.phone && (
                    <a
                      href={`tel:${activeChecklistRecord.phone}`}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50/80 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-medium transition-colors shadow-2xs"
                      title="Call Number"
                    >
                      <Phone className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>{activeChecklistRecord.phone}</span>
                    </a>
                  )}
                </div>
              </div>

              <button
                onClick={() => setActiveChecklistRecord(null)}
                className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Checklist Progress Overview Banner */}
            <div className="px-4 sm:px-6 py-3 sm:py-4 bg-white border-b border-slate-100 flex items-center justify-between gap-3 sm:gap-4 flex-wrap shrink-0">
              <div className="flex-1 min-w-[200px]">
                {(() => {
                  const modalCompleted = activeChecklistRecord.checklist ? activeChecklistRecord.checklist.filter((i) => i.completed).length : 0;
                  const modalTotal = activeChecklistRecord.checklist ? activeChecklistRecord.checklist.length : 0;
                  const modalProgress = modalTotal > 0 ? Math.round((modalCompleted / modalTotal) * 100) : 0;
                  return (
                    <>
                      <div className="flex items-center justify-between text-xs mb-1.5 font-semibold">
                        <span className="text-slate-700">Verification Progress</span>
                        <span className="text-blue-700 font-bold">
                          {modalProgress}% Completed ({modalCompleted} of {modalTotal})
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                        <div
                          className={`h-2.5 rounded-full transition-all duration-500 ${
                            modalProgress === 100
                              ? "bg-emerald-500"
                              : "bg-blue-600"
                          }`}
                          style={{ width: `${modalProgress}%` }}
                        />
                      </div>
                    </>
                  );
                })()}
              </div>

              {!activeChecklistRecord.employeeId && (currentUser.role === "admin" || currentUser.role === "hr") && (
                <button
                  onClick={() => handleActivateEmployee(activeChecklistRecord.id)}
                  disabled={activating}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs cursor-pointer flex items-center gap-1.5 transition-colors shrink-0"
                  title="Approve candidate, assign EMP-XXXX ID, and activate portal login"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {activating ? "Activating..." : "Approve & Activate Profile"}
                </button>
              )}
            </div>

            {/* Candidate Profile Details Snapshot Card */}
            <div className="mx-4 sm:mx-6 mt-4 p-3.5 rounded-xl bg-slate-50 border border-slate-200/90 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block">
                  Employee Number / ID
                </span>
                <span className="font-mono font-bold text-slate-900 flex items-center gap-1 mt-0.5">
                  {activeChecklistRecord.employeeId ? (
                    <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      {activeChecklistRecord.employeeId}
                    </span>
                  ) : (
                    <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 font-sans font-medium text-[11px]">
                      Pending Allocation
                    </span>
                  )}
                </span>
              </div>

              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block">
                  Email Address
                </span>
                <a
                  href={`mailto:${activeChecklistRecord.email}`}
                  className="font-medium text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1 mt-0.5 truncate"
                  title={activeChecklistRecord.email}
                >
                  <Mail className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                  <span className="truncate">{activeChecklistRecord.email}</span>
                </a>
              </div>

              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block">
                  Contact Number
                </span>
                {activeChecklistRecord.phone ? (
                  <a
                    href={`tel:${activeChecklistRecord.phone}`}
                    className="font-medium text-slate-800 hover:text-slate-900 hover:underline flex items-center gap-1 mt-0.5"
                  >
                    <Phone className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>{activeChecklistRecord.phone}</span>
                  </a>
                ) : (
                  <span className="text-slate-400 mt-0.5 block">Not provided</span>
                )}
              </div>

              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block">
                  Designation & Branch
                </span>
                <span className="font-medium text-slate-800 flex items-center gap-1 mt-0.5 truncate">
                  <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="truncate">{activeChecklistRecord.designation} ({activeChecklistRecord.branch})</span>
                </span>
              </div>
            </div>

            {/* Candidate Submitted KYC Documents & Details Review */}
            {activeChecklistRecord.kycDocuments && activeChecklistRecord.kycDocuments.length > 0 && (
              <div className="mx-4 sm:mx-6 mt-4 p-4 rounded-xl bg-indigo-50/60 border border-indigo-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-900 flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-indigo-600" />
                    Candidate Self-Submitted KYC Documents (Verified &lt;= 2 MB)
                  </h3>
                  <span className="text-[11px] font-medium text-indigo-700">
                    Stored on Cloudinary
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {activeChecklistRecord.kycDocuments.map((doc, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-lg bg-white border border-indigo-100 shadow-2xs flex items-center justify-between text-xs"
                    >
                      <div className="truncate pr-2">
                        <span className="font-semibold text-slate-800 block truncate">{doc.title}</span>
                        <span className="text-[10px] text-slate-500 capitalize">{doc.type.replace(/_/g, " ")}</span>
                      </div>
                      <a
                        href={doc.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-[11px] flex items-center gap-1 shrink-0 transition-colors"
                      >
                        <ExternalLink className="w-3 h-3" />
                        View File
                      </a>
                    </div>
                  ))}
                </div>

                {activeChecklistRecord.statutoryDetails && (
                  <div className="pt-2 border-t border-indigo-200/60 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div>
                      <span className="text-slate-500 text-[10px] block font-medium">PAN Number</span>
                      <span className="font-mono font-bold text-slate-800">
                        {activeChecklistRecord.statutoryDetails.pan || "N/A"}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px] block font-medium">Aadhaar Number</span>
                      <span className="font-mono font-bold text-slate-800">
                        {activeChecklistRecord.statutoryDetails.aadhaar || "N/A"}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px] block font-medium">Bank Name</span>
                      <span className="font-semibold text-slate-800">
                        {activeChecklistRecord.statutoryDetails.bankName || "N/A"}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px] block font-medium">Account Number</span>
                      <span className="font-mono font-bold text-slate-800">
                        {activeChecklistRecord.statutoryDetails.bankAccountNumber || "N/A"}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Category Filter Tabs */}
            <div className="px-4 sm:px-6 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0">
              {[
                { id: "all", label: `All Items (${activeChecklistRecord.checklist.length})` },
                { id: "statutory", label: `Statutory & Bank (${activeChecklistRecord.checklist.filter((i) => i.category === "statutory").length})` },
                { id: "documentation", label: `Documents (${activeChecklistRecord.checklist.filter((i) => i.category === "documentation").length})` },
              ]
                .filter((cat) => cat.id === "all" || activeChecklistRecord.checklist.some((i) => i.category === cat.id))
                .map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`px-3 py-1 text-xs rounded-md font-medium whitespace-nowrap transition-colors cursor-pointer ${
                      selectedCategory === cat.id
                        ? "bg-blue-600 text-white shadow-2xs"
                        : "bg-white text-slate-600 hover:text-slate-900 border border-slate-200"
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
            </div>

            {/* Checklist Items Scrollable Body */}
            <div className="p-4 sm:p-6 overflow-y-auto overscroll-contain space-y-3 flex-1">
              {activeChecklistRecord.checklist
                .filter((item) => selectedCategory === "all" || item.category === selectedCategory)
                .map((item, index) => (
                  <div
                    key={item.key}
                    className={`p-3.5 rounded-xl border transition-all flex items-start justify-between gap-4 ${
                      item.completed
                        ? item.verified
                          ? "bg-emerald-50/40 border-emerald-200"
                          : "bg-blue-50/30 border-blue-200"
                        : "bg-white border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    {/* Left: Completion Checkbox & Details */}
                    <div className="flex items-start gap-3">
                      <button
                        onClick={() =>
                          handleToggleChecklist(
                            activeChecklistRecord.id,
                            item.key,
                            item.completed,
                            item.verified,
                            "complete"
                          )
                        }
                        className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5 transition-colors cursor-pointer ${
                          item.completed
                            ? "bg-blue-600 text-white"
                            : "border-2 border-slate-300 hover:border-blue-500 bg-white"
                        }`}
                      >
                        {item.completed && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </button>

                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`text-sm font-semibold ${
                              item.completed ? "text-slate-900" : "text-slate-700"
                            }`}
                          >
                            {item.label}
                          </span>
                          <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 flex items-center gap-1">
                            {getCategoryIcon(item.category)}
                            {item.category}
                          </span>
                          {item.required ? (
                            <span className="text-[10px] font-semibold text-rose-600 bg-rose-50 px-1.5 py-0.2 rounded">
                              Required
                            </span>
                          ) : (
                            <span className="text-[10px] font-medium text-slate-400">Optional</span>
                          )}
                        </div>

                        {/* Attribution metadata */}
                        <div className="mt-1 flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                          {item.completed ? (
                            <span className="text-emerald-700 font-medium">
                              ✓ Completed {item.completedBy ? `by ${item.completedBy}` : ""}
                            </span>
                          ) : (
                            <span className="text-amber-700 font-medium">Pending submission</span>
                          )}

                          {item.documentUrl && (
                            <a
                              href={item.documentUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1 underline"
                            >
                              <ExternalLink className="w-3 h-3" />
                              View Document
                            </a>
                          )}

                          {item.verified && (
                            <span className="text-blue-700 font-medium flex items-center gap-1">
                              <ShieldCheck className="w-3.5 h-3.5" />
                              HR Verified {item.verifiedBy ? `by ${item.verifiedBy}` : ""}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: Verification Action Button */}
                    <div className="shrink-0 flex items-center gap-2">
                      {(currentUser.role === "admin" || currentUser.role === "hr") && item.completed && (
                        <button
                          onClick={() =>
                            handleToggleChecklist(
                              activeChecklistRecord.id,
                              item.key,
                              item.completed,
                              item.verified,
                              "verify"
                            )
                          }
                          className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                            item.verified
                              ? "bg-blue-100 text-blue-800 hover:bg-blue-200"
                              : "bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300"
                          }`}
                        >
                          <ShieldCheck className="w-3.5 h-3.5" />
                          {item.verified ? "Verified" : "Mark Verified"}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
            </div>

            {/* Modal Footer */}
            <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
              <span className="text-xs text-slate-500">
                All checklist mutations are strictly recorded in the HRMS immutable audit ledger.
              </span>
              <button
                onClick={() => setActiveChecklistRecord(null)}
                className="w-full sm:w-auto px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-xs font-semibold transition-colors cursor-pointer text-center"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: New Candidate Onboarding Initiation */}
      {isNewModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-xl overflow-hidden my-auto max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-2.5rem)] flex flex-col">
            <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-base font-bold text-slate-900">Initiate Candidate Onboarding</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Generates the standard onboarding checklist and candidate profile.
                </p>
              </div>
              <button
                onClick={() => setIsNewModalOpen(false)}
                className="w-7 h-7 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-600 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateOnboarding} className="p-4 sm:p-6 space-y-4 flex-1 overflow-y-auto overscroll-contain">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Candidate Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Alok Sharma"
                  value={formData.candidateName}
                  onChange={(e) => setFormData({ ...formData, candidateName: e.target.value })}
                  className="w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address *</label>
                  <input
                    type="email"
                    required
                    placeholder="alok.sharma@example.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Mobile Phone *</label>
                  <input
                    type="tel"
                    required
                    placeholder="9876543210"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Branch *</label>
                  <select
                    value={formData.branch}
                    onChange={(e) => setFormData({ ...formData, branch: e.target.value as Branch })}
                    className="w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    {BRANCHES.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Department *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Risk & Underwriting"
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    className="w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Designation *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Senior Credit Analyst"
                    value={formData.designation}
                    onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                    className="w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Target Joining Date *</label>
                  <input
                    type="date"
                    required
                    value={formData.joiningDate}
                    onChange={(e) => setFormData({ ...formData, joiningDate: e.target.value })}
                    className="w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Offered Annual CTC (₹)</label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  placeholder="500000"
                  value={formData.annualCtc || ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFormData({ ...formData, annualCtc: val === "" ? 0 : Number(val) });
                  }}
                  className="w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Internal Notes</label>
                <textarea
                  rows={2}
                  placeholder="Special clauses, pending certificates, equipment requests..."
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex flex-col-reverse sm:flex-row sm:items-center justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsNewModalOpen(false)}
                  className="w-full sm:w-auto justify-center px-4 py-2 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full sm:w-auto justify-center px-4 py-2 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  {submitting ? "Initializing..." : "Initialize Checklist"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
