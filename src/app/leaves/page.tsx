"use client";

import React, { useState, useEffect } from "react";
import { LeaveRequest, LeaveType } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useAuth } from "@/lib/auth-context";
import {
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  XCircle,
  Clock,
  Check,
  X,
  FileText,
  Info,
} from "lucide-react";

export default function LeavesPage() {
  const { currentUser } = useAuth();
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Apply Modal State
  const [isApplyModalOpen, setIsApplyModalOpen] = useState(false);
  const [leaveType, setLeaveType] = useState<LeaveType>("Casual Leave");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [days, setDays] = useState(1);
  const [reason, setReason] = useState("");
  const [isApplying, setIsApplying] = useState(false);

  // Review Modal State
  const [reviewingLeave, setReviewingLeave] = useState<LeaveRequest | null>(null);
  const [reviewAction, setReviewAction] = useState<"Approved" | "Rejected">("Approved");
  const [reviewNotes, setReviewNotes] = useState("");
  const [isReviewing, setIsReviewing] = useState(false);

  const canApprove = ["admin", "hr"].includes(currentUser.role);

  const loadLeaves = async () => {
    try {
      const res = await fetch("/api/leaves");
      const data = await res.json();
      if (data.success) {
        setLeaves(data.data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadLeaves();
  }, []);

  const handleApplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsApplying(true);
    try {
      const res = await fetch("/api/leaves", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: currentUser.employeeId,
          employeeName: currentUser.name,
          department: currentUser.department || "Technology",
          leaveType,
          startDate,
          endDate: endDate || startDate,
          days: Number(days),
          reason,
          actor: { name: currentUser.name, role: currentUser.role },
        }),
      });
      const data = await res.json();
      if (data.success) {
        setIsApplyModalOpen(false);
        setReason("");
        loadLeaves();
      } else {
        alert(data.error || "Failed to submit leave");
      }
    } catch (e) {
      console.error(e);
      alert("Error applying for leave");
    } finally {
      setIsApplying(false);
    }
  };

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewingLeave) return;
    setIsReviewing(true);
    try {
      const res = await fetch("/api/leaves", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leaveId: reviewingLeave.id,
          status: reviewAction,
          reviewNotes,
          actor: { name: currentUser.name, role: currentUser.role },
        }),
      });
      const data = await res.json();
      if (data.success) {
        setReviewingLeave(null);
        setReviewNotes("");
        loadLeaves();
      }
    } catch (e) {
      console.error(e);
      alert("Error updating leave request");
    } finally {
      setIsReviewing(false);
    }
  };

  const pendingLeaves = leaves.filter((l) => l.status === "Pending");
  const pastLeaves = leaves.filter((l) => l.status !== "Pending");

  const relevantLeaves = canApprove
    ? leaves
    : leaves.filter((l) => l.employeeId === currentUser.employeeId);

  const approvedLeaves = relevantLeaves.filter((l) => l.status === "Approved");
  const clTaken = approvedLeaves
    .filter((l) => l.leaveType === "Casual Leave")
    .reduce((sum, l) => sum + Number(l.days || 0), 0);
  const slTaken = approvedLeaves
    .filter((l) => l.leaveType === "Sick Leave")
    .reduce((sum, l) => sum + Number(l.days || 0), 0);
  const totalTaken = clTaken + slTaken;

  const clPending = relevantLeaves
    .filter((l) => l.leaveType === "Casual Leave" && l.status === "Pending")
    .reduce((sum, l) => sum + Number(l.days || 0), 0);
  const slPending = relevantLeaves
    .filter((l) => l.leaveType === "Sick Leave" && l.status === "Pending")
    .reduce((sum, l) => sum + Number(l.days || 0), 0);

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <CalendarDays className="w-6 h-6 text-blue-600" />
            Leave Management & Workflow
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Apply for Casual or Sick leave and manage approvals. Leaves have no predefined limits and are officially marked when taken.
          </p>
        </div>
        <Button
          onClick={() => setIsApplyModalOpen(true)}
          size="sm"
          icon={<CalendarPlus className="w-4 h-4" />}
        >
          Apply for Leave
        </Button>
      </div>

      {/* On-Demand Leave Policy Notice */}
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4 flex items-center justify-between text-xs text-blue-300">
        <div className="flex items-center gap-2.5">
          <Info className="w-4 h-4 text-blue-400 shrink-0" />
          <span>
            <strong>Company Leave Policy:</strong> Employees are eligible for <strong>Casual Leave (CL)</strong> and <strong>Sick Leave (SL)</strong> only (no Earned Leave). There are no predefined quota limits—leaves are officially marked and logged in your employment and payroll record as and when taken upon approval.
          </span>
        </div>
      </div>

      {/* On-Demand Marked Leave Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass-card rounded-2xl p-5 border border-slate-800 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">
              Casual Leave (CL)
            </span>
            <Badge variant="indigo">Marked As Taken</Badge>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-white">{clTaken}</span>
            <span className="text-xs text-slate-400">Day(s) Recorded</span>
          </div>
          <div className="mt-3 text-[11px] text-slate-400 flex items-center justify-between border-t border-slate-800/60 pt-2">
            <span>{clPending > 0 ? `${clPending} Day(s) Awaiting Approval` : "Approved & Recorded"}</span>
            <span className="text-slate-500">No preset limit</span>
          </div>
        </div>

        <div className="glass-card rounded-2xl p-5 border border-slate-800 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
              Sick Leave (SL)
            </span>
            <Badge variant="success">Marked As Taken</Badge>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-white">{slTaken}</span>
            <span className="text-xs text-slate-400">Day(s) Recorded</span>
          </div>
          <div className="mt-3 text-[11px] text-slate-400 flex items-center justify-between border-t border-slate-800/60 pt-2">
            <span>{slPending > 0 ? `${slPending} Day(s) Awaiting Approval` : "Approved & Recorded"}</span>
            <span className="text-slate-500">Medical on-demand</span>
          </div>
        </div>

        <div className="glass-card rounded-2xl p-5 border border-slate-800 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-purple-400 uppercase tracking-wider">
              Total Leaves Taken
            </span>
            <Badge variant="purple">Active Record</Badge>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-white">{totalTaken}</span>
            <span className="text-xs text-slate-400">Total Day(s)</span>
          </div>
          <div className="mt-3 text-[11px] text-slate-400 flex items-center justify-between border-t border-slate-800/60 pt-2">
            <span>{clTaken} CL + {slTaken} SL</span>
            <span className="text-slate-500">Logged on-demand</span>
          </div>
        </div>
      </div>

      {/* Pending Approval Queue for Managers/HR */}
      {canApprove && (
        <div className="glass-card rounded-2xl p-6 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-400" />
              <h2 className="text-base font-bold text-white">Pending Approval Queue</h2>
            </div>
            <Badge variant="warning">{pendingLeaves.length} Awaiting Decision</Badge>
          </div>

          {pendingLeaves.length === 0 ? (
            <p className="text-xs text-slate-500 py-4 text-center">
              All leave applications have been reviewed.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {pendingLeaves.map((req) => (
                <div
                  key={req.id}
                  className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col justify-between text-xs space-y-3"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white text-sm">{req.employeeName}</span>
                      <Badge variant="indigo">{req.department}</Badge>
                    </div>
                    <p className="text-indigo-300 font-semibold mt-1">
                      {req.leaveType} • {req.days} Day(s)
                    </p>
                    <p className="text-slate-400 text-[11px] mt-0.5">
                      Period: {req.startDate} to {req.endDate}
                    </p>
                    <p className="text-slate-300 italic mt-2 bg-slate-950/60 p-2.5 rounded-lg border border-slate-850">
                      &ldquo;{req.reason}&rdquo;
                    </p>
                    <span className="text-[10px] text-slate-500 mt-2 block">
                      Applied on: {req.appliedOn}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
                    <Button
                      size="sm"
                      className="flex-1 bg-emerald-600 hover:bg-emerald-500"
                      icon={<Check className="w-4 h-4" />}
                      onClick={() => {
                        setReviewingLeave(req);
                        setReviewAction("Approved");
                      }}
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      className="flex-1"
                      icon={<X className="w-4 h-4" />}
                      onClick={() => {
                        setReviewingLeave(req);
                        setReviewAction("Rejected");
                      }}
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Leave History Table */}
      <div className="glass-card rounded-2xl p-6 border border-slate-800 space-y-4">
        <h2 className="text-base font-bold text-white">Leave Application History</h2>
        <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
          <table className="w-full text-left text-xs min-w-[700px]">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="pb-3 font-medium">Employee</th>
                <th className="pb-3 font-medium">Leave Type</th>
                <th className="pb-3 font-medium">Dates</th>
                <th className="pb-3 font-medium">Days</th>
                <th className="pb-3 font-medium">Reason</th>
                <th className="pb-3 font-medium">Status</th>
                <th className="pb-3 font-medium">Reviewed By</th>
                <th className="pb-3 font-medium">Review Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {leaves.map((l) => (
                <tr key={l.id} className="hover:bg-slate-800/20">
                  <td className="py-3 font-medium text-slate-200">
                    <div>{l.employeeName}</div>
                    <span className="text-[10px] text-slate-500">{l.department}</span>
                  </td>
                  <td className="py-3 font-semibold text-slate-300">{l.leaveType}</td>
                  <td className="py-3 font-mono text-slate-300">
                    {l.startDate} to {l.endDate}
                  </td>
                  <td className="py-3 text-slate-200">{l.days}</td>
                  <td className="py-3 text-slate-400 truncate max-w-[180px]">{l.reason}</td>
                  <td className="py-3">
                    <Badge
                      variant={
                        l.status === "Approved" ? "success" : l.status === "Pending" ? "warning" : "danger"
                      }
                    >
                      {l.status}
                    </Badge>
                  </td>
                  <td className="py-3 text-slate-400 text-[11px]">{l.reviewedBy || "—"}</td>
                  <td className="py-3 text-slate-400 text-[11px]">{l.reviewNotes || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Apply Leave Modal */}
      <Modal
        isOpen={isApplyModalOpen}
        onClose={() => setIsApplyModalOpen(false)}
        title="Apply for Leave"
        subtitle="Submit a formal leave request. Your reporting manager and HR will be notified for approval."
        maxWidth="md"
      >
        <form onSubmit={handleApplySubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Leave Type *</label>
            <select
              value={leaveType}
              onChange={(e) => setLeaveType(e.target.value as LeaveType)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
            >
              <option value="Casual Leave">Casual Leave (CL)</option>
              <option value="Sick Leave">Sick Leave (SL)</option>
            </select>
            <p className="text-[11px] text-slate-400 mt-1.5 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <span>No predefined quota limits. Leave will be officially marked in your record upon HR approval.</span>
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Start Date *</label>
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">End Date *</label>
              <input
                type="date"
                required
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Number of Working Days *
            </label>
            <input
              type="number"
              min={0.5}
              step={0.5}
              required
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Reason / Justification *
            </label>
            <textarea
              rows={3}
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="State the reason for leave and handover details if applicable..."
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-end gap-2 pt-4 border-t border-slate-800">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsApplyModalOpen(false)}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" isLoading={isApplying} className="w-full sm:w-auto">
              Submit Application
            </Button>
          </div>
        </form>
      </Modal>

      {/* Manager / HR Review Modal */}
      <Modal
        isOpen={!!reviewingLeave}
        onClose={() => setReviewingLeave(null)}
        title={`${reviewAction} Leave Request`}
        subtitle={`Confirm ${reviewAction.toLowerCase()} status for ${reviewingLeave?.employeeName}.`}
        maxWidth="md"
      >
        <form onSubmit={handleReviewSubmit} className="space-y-4">
          <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs space-y-1">
            <p className="font-semibold text-white">{reviewingLeave?.employeeName}</p>
            <p className="text-slate-400">
              {reviewingLeave?.leaveType} ({reviewingLeave?.startDate} to {reviewingLeave?.endDate})
            </p>
            <p className="text-slate-300 italic pt-1">&ldquo;{reviewingLeave?.reason}&rdquo;</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Decision</label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setReviewAction("Approved")}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold border cursor-pointer ${
                  reviewAction === "Approved"
                    ? "bg-emerald-600/20 border-emerald-500 text-emerald-400"
                    : "border-slate-700 text-slate-400 hover:bg-slate-800"
                }`}
              >
                Approve
              </button>
              <button
                type="button"
                onClick={() => setReviewAction("Rejected")}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold border cursor-pointer ${
                  reviewAction === "Rejected"
                    ? "bg-rose-600/20 border-rose-500 text-rose-400"
                    : "border-slate-700 text-slate-400 hover:bg-slate-800"
                }`}
              >
                Reject
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Reviewer Notes / Feedback
            </label>
            <textarea
              rows={2}
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
              placeholder="e.g. Approved. Client handover verified."
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-end gap-2 pt-4 border-t border-slate-800">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setReviewingLeave(null)}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              isLoading={isReviewing}
              className={`w-full sm:w-auto ${reviewAction === "Approved" ? "bg-emerald-600 hover:bg-emerald-500" : "bg-rose-600 hover:bg-rose-500"}`}
            >
              Confirm {reviewAction}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
