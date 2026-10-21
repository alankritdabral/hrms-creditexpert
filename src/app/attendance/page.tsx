"use client";

import React, { useState, useEffect } from "react";
import { AttendanceRecord, AttendancePolicy, AttendanceStatus } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useAuth } from "@/lib/auth-context";
import {
  Clock,
  Calendar,
  Sliders,
  LogIn,
  LogOut,
  Edit2,
  CheckCircle2,
  AlertTriangle,
  UserCheck,
  TrendingUp,
} from "lucide-react";

export default function AttendancePage() {
  const { currentUser } = useAuth();
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [policy, setPolicy] = useState<AttendancePolicy | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>("2026-10-17");
  const [isLoading, setIsLoading] = useState(true);

  // Punch state
  const [isPunching, setIsPunching] = useState(false);

  // Manual Adjustment Modal State
  const [editingRecord, setEditingRecord] = useState<AttendanceRecord | null>(null);
  const [adjustStatus, setAdjustStatus] = useState<AttendanceStatus>("Present");
  const [adjustCheckIn, setAdjustCheckIn] = useState("");
  const [adjustCheckOut, setAdjustCheckOut] = useState("");
  const [adjustRemarks, setAdjustRemarks] = useState("");
  const [isAdjusting, setIsAdjusting] = useState(false);

  // Policy Modal State
  const [isPolicyModalOpen, setIsPolicyModalOpen] = useState(false);
  const [policyStartTime, setPolicyStartTime] = useState("10:00");
  const [policyEndTime, setPolicyEndTime] = useState("19:00");
  const [policyGrace, setPolicyGrace] = useState(15);
  const [policyMinHours, setPolicyMinHours] = useState(8);
  const [isSavingPolicy, setIsSavingPolicy] = useState(false);

  const canManage = ["admin", "hr"].includes(currentUser.role);

  const loadData = async () => {
    try {
      const [attRes, polRes] = await Promise.all([
        fetch(`/api/attendance${selectedDate ? `?date=${selectedDate}` : ""}`).then((r) => r.json()),
        fetch("/api/policy").then((r) => r.json()),
      ]);
      if (attRes.success) setAttendance(attRes.data);
      if (polRes.success) {
        setPolicy(polRes.data);
        setPolicyStartTime(polRes.data.officeStartTime);
        setPolicyEndTime(polRes.data.officeEndTime);
        setPolicyGrace(polRes.data.gracePeriodMinutes);
        setPolicyMinHours(polRes.data.fullDayMinHours);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedDate]);

  // Current user's attendance for the day
  const myRecord = attendance.find(
    (a) => a.employeeId === currentUser.employeeId
  );

  const handlePunch = async (type: "checkIn" | "checkOut") => {
    setIsPunching(true);
    try {
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: currentUser.employeeId,
          type,
          actor: { name: currentUser.name, role: currentUser.role },
        }),
      });
      const data = await res.json();
      if (data.success) {
        loadData();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsPunching(false);
    }
  };

  const handleOpenAdjust = (rec: AttendanceRecord) => {
    setEditingRecord(rec);
    setAdjustStatus(rec.status);
    setAdjustCheckIn(rec.checkIn || "");
    setAdjustCheckOut(rec.checkOut || "");
    setAdjustRemarks(rec.remarks || "");
  };

  const handleSaveAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRecord) return;
    setIsAdjusting(true);
    try {
      const res = await fetch("/api/attendance", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordId: editingRecord.id,
          updates: {
            status: adjustStatus,
            checkIn: adjustCheckIn,
            checkOut: adjustCheckOut,
            remarks: adjustRemarks,
          },
          actor: { name: currentUser.name, role: currentUser.role },
        }),
      });
      const data = await res.json();
      if (data.success) {
        setEditingRecord(null);
        loadData();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsAdjusting(false);
    }
  };

  const handleSavePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingPolicy(true);
    try {
      const res = await fetch("/api/policy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          updates: {
            officeStartTime: policyStartTime,
            officeEndTime: policyEndTime,
            gracePeriodMinutes: Number(policyGrace),
            fullDayMinHours: Number(policyMinHours),
          },
          actor: { name: currentUser.name, role: currentUser.role },
        }),
      });
      const data = await res.json();
      if (data.success) {
        setPolicy(data.data);
        setIsPolicyModalOpen(false);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSavingPolicy(false);
    }
  };

  const presentCount = attendance.filter((a) => a.status === "Present" || a.status === "Work From Home").length;
  const lateCount = attendance.filter((a) => a.lateArrival).length;
  const overtimeHours = attendance.reduce((acc, curr) => acc + (curr.overtimeHours || 0), 0);

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <Clock className="w-6 h-6 text-blue-600" />
            Attendance Management
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Daily clock-in logs, biometric & web punch, configurable grace period policy, and overtime tracking.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {canManage && (
            <Button
              variant="outline"
              size="sm"
              icon={<Sliders className="w-4 h-4" />}
              onClick={() => setIsPolicyModalOpen(true)}
            >
              Configure Policy
            </Button>
          )}
        </div>
      </div>

      {/* Clock in Banner & Policy Info */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Personal Clock In Card */}
        <div className="glass-card rounded-2xl p-6 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              My Attendance (Today)
            </span>
            <Badge variant="indigo">{currentUser.name}</Badge>
          </div>

          <div className="text-center py-3">
            <div className="text-3xl font-mono font-bold text-slate-900 tracking-wider">
              {myRecord?.checkIn ? myRecord.checkIn : "— : — : —"}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {myRecord?.checkIn
                ? `Clocked in (${myRecord.status})`
                : "Awaiting your morning check-in"}
            </p>
          </div>

          <div className="flex items-center gap-2 pt-2">
            {!myRecord?.checkIn ? (
              <Button
                onClick={() => handlePunch("checkIn")}
                isLoading={isPunching}
                size="sm"
                icon={<LogIn className="w-4 h-4" />}
                className="w-full bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/20"
              >
                Clock In Now
              </Button>
            ) : !myRecord?.checkOut ? (
              <Button
                onClick={() => handlePunch("checkOut")}
                isLoading={isPunching}
                size="sm"
                variant="danger"
                icon={<LogOut className="w-4 h-4" />}
                className="w-full"
              >
                Clock Out (End Shift)
              </Button>
            ) : (
              <div className="w-full text-center py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-emerald-400 font-semibold">
                Shift Finished ({myRecord.totalWorkingHours} hrs)
              </div>
            )}
          </div>
        </div>

        {/* Configured Policy Summary (Section 6 of PRD) */}
        <div className="glass-card rounded-2xl p-6 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Active Company Policy
            </span>
            <span className="text-[10px] text-slate-500 font-mono">Policy ID: POL-01</span>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b border-slate-800">
              <span className="text-slate-400">Office Timings</span>
              <span className="font-semibold text-white">
                {policy?.officeStartTime || "10:00"} AM – {policy?.officeEndTime || "19:00"} PM
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-800">
              <span className="text-slate-400">Grace Period</span>
              <span className="font-semibold text-amber-400">
                {policy?.gracePeriodMinutes || 15} minutes (Late after 10:15 AM)
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-800">
              <span className="text-slate-400">Full Day Minimum</span>
              <span className="font-semibold text-slate-200">
                {policy?.fullDayMinHours || 8} working hours
              </span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-slate-400">Half Day Threshold</span>
              <span className="font-semibold text-slate-200">Less than 4 hours</span>
            </div>
          </div>
        </div>

        {/* Attendance Metrics */}
        <div className="glass-card rounded-2xl p-6 border border-slate-800 space-y-3">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
            Selected Day Stats
          </span>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-slate-500 text-[11px] font-medium">Present / WFH</span>
              <p className="text-xl font-bold text-emerald-600 mt-1">{presentCount}</p>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-slate-500 text-[11px] font-medium">Late Arrivals</span>
              <p className="text-xl font-bold text-amber-600 mt-1">{lateCount}</p>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 col-span-2">
              <span className="text-slate-500 text-[11px] font-medium">Overtime Hours Accrued</span>
              <p className="text-xl font-bold text-blue-600 mt-1">{overtimeHours.toFixed(1)} hrs</p>
            </div>
          </div>
        </div>
      </div>

      {/* Date Picker Filter Bar */}
      <div className="glass-card rounded-2xl p-4 border border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Calendar className="w-4 h-4 text-indigo-400" />
          <span className="text-xs font-medium text-slate-300">View Logs for Date:</span>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
          />
        </div>
        <span className="text-xs text-slate-400">{attendance.length} record(s) on file</span>
      </div>

      {/* Attendance Table */}
      <div className="glass-card rounded-2xl p-6 border border-slate-800 space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="pb-3 font-medium">Employee</th>
                <th className="pb-3 font-medium">Check-In</th>
                <th className="pb-3 font-medium">Check-Out</th>
                <th className="pb-3 font-medium">Total Hours</th>
                <th className="pb-3 font-medium">Overtime</th>
                <th className="pb-3 font-medium">Status</th>
                <th className="pb-3 font-medium">Remarks</th>
                {canManage && <th className="pb-3 font-medium text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {attendance.map((rec) => (
                <tr key={rec.id} className="hover:bg-slate-800/20">
                  <td className="py-3 font-medium text-slate-200">
                    <div>{rec.employeeName}</div>
                    <span className="text-[10px] text-slate-500 font-mono">{rec.employeeId}</span>
                  </td>
                  <td className="py-3 font-mono text-slate-300">{rec.checkIn || "—"}</td>
                  <td className="py-3 font-mono text-slate-300">{rec.checkOut || "—"}</td>
                  <td className="py-3 text-slate-200 font-medium">{rec.totalWorkingHours} hrs</td>
                  <td className="py-3 text-emerald-400 font-mono">
                    {rec.overtimeHours > 0 ? `+${rec.overtimeHours}h` : "—"}
                  </td>
                  <td className="py-3">
                    <Badge
                      variant={
                        rec.status === "Present"
                          ? "success"
                          : rec.status === "Late"
                          ? "warning"
                          : rec.status === "Work From Home"
                          ? "indigo"
                          : rec.status === "Leave"
                          ? "purple"
                          : "danger"
                      }
                    >
                      {rec.status}
                    </Badge>
                  </td>
                  <td className="py-3 text-slate-400">{rec.remarks || "—"}</td>
                  {canManage && (
                    <td className="py-3 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Edit2 className="w-3.5 h-3.5" />}
                        onClick={() => handleOpenAdjust(rec)}
                        className="text-xs py-1 px-2.5"
                      >
                        Adjust
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Manual HR Adjustment Modal */}
      <Modal
        isOpen={!!editingRecord}
        onClose={() => setEditingRecord(null)}
        title="Manual Attendance Adjustment"
        subtitle={`Adjust clock timings or regularization status for ${editingRecord?.employeeName}. All edits are recorded in audit logs.`}
        maxWidth="md"
      >
        <form onSubmit={handleSaveAdjustment} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Status</label>
            <select
              value={adjustStatus}
              onChange={(e) => setAdjustStatus(e.target.value as any)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
            >
              <option value="Present">Present</option>
              <option value="Late">Late</option>
              <option value="Work From Home">Work From Home</option>
              <option value="Half Day">Half Day</option>
              <option value="Absent">Absent (LOP)</option>
              <option value="Leave">Approved Leave</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Check-In Time</label>
              <input
                type="text"
                value={adjustCheckIn}
                onChange={(e) => setAdjustCheckIn(e.target.value)}
                placeholder="10:00:00"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Check-Out Time</label>
              <input
                type="text"
                value={adjustCheckOut}
                onChange={(e) => setAdjustCheckOut(e.target.value)}
                placeholder="19:00:00"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Adjustment Remarks *
            </label>
            <input
              type="text"
              required
              value={adjustRemarks}
              onChange={(e) => setAdjustRemarks(e.target.value)}
              placeholder="e.g. Regularized on client visit approval"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-800">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setEditingRecord(null)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" isLoading={isAdjusting}>
              Save Adjustment
            </Button>
          </div>
        </form>
      </Modal>

      {/* Policy Configuration Modal */}
      <Modal
        isOpen={isPolicyModalOpen}
        onClose={() => setIsPolicyModalOpen(false)}
        title="Attendance Policy Configuration"
        subtitle="Configure company office timings, grace period thresholds, and full day rules without code changes."
        maxWidth="md"
      >
        <form onSubmit={handleSavePolicy} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Office Start Time
              </label>
              <input
                type="text"
                value={policyStartTime}
                onChange={(e) => setPolicyStartTime(e.target.value)}
                placeholder="10:00"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Office End Time
              </label>
              <input
                type="text"
                value={policyEndTime}
                onChange={(e) => setPolicyEndTime(e.target.value)}
                placeholder="19:00"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Grace Period (Minutes)
              </label>
              <input
                type="number"
                value={policyGrace}
                onChange={(e) => setPolicyGrace(Number(e.target.value))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Full Day Min Hours
              </label>
              <input
                type="number"
                value={policyMinHours}
                onChange={(e) => setPolicyMinHours(Number(e.target.value))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-800">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsPolicyModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" isLoading={isSavingPolicy}>
              Update Policy
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
