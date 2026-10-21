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
  Edit2,
  CheckCircle2,
  AlertTriangle,
  UserCheck,
  TrendingUp,
  MapPin,
  ExternalLink,
  ShieldCheck,
  Trash2,
} from "lucide-react";

export default function AttendancePage() {
  const { currentUser } = useAuth();
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [policy, setPolicy] = useState<AttendancePolicy | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>("2026-10-17");
  const [isLoading, setIsLoading] = useState(true);
  const [isClearing, setIsClearing] = useState(false);

  // Punch state
  const [isPunching, setIsPunching] = useState(false);
  const [punchStatusMessage, setPunchStatusMessage] = useState<string | null>(null);
  const [punchError, setPunchError] = useState<string | null>(null);

  // Manual Adjustment Modal State
  const [editingRecord, setEditingRecord] = useState<AttendanceRecord | null>(null);
  const [adjustStatus, setAdjustStatus] = useState<AttendanceStatus>("Present");
  const [adjustCheckIn, setAdjustCheckIn] = useState("");
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

  const handleClockIn = () => {
    setPunchError(null);

    if (!navigator.geolocation) {
      setPunchError("Geolocation is not supported by your browser.");
      return;
    }

    setIsPunching(true);
    setPunchStatusMessage("Accessing device GPS...");

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          setPunchStatusMessage("Verifying office location...");
          const { latitude, longitude, accuracy } = pos.coords;

          const res = await fetch("/api/attendance", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "checkIn",
              latitude,
              longitude,
              accuracy,
            }),
          });

          const data = await res.json();
          if (data.success) {
            setPunchStatusMessage(null);
            loadData();
          } else {
            setPunchError(data.error || "Failed to mark attendance.");
            setPunchStatusMessage(null);
          }
        } catch (e: any) {
          console.error("Punch error:", e);
          setPunchError(e.message || "Failed to mark attendance.");
          setPunchStatusMessage(null);
        } finally {
          setIsPunching(false);
        }
      },
      (err) => {
        setIsPunching(false);
        setPunchStatusMessage(null);
        if (err.code === err.PERMISSION_DENIED) {
          setPunchError("Location permission denied. Please allow location access in your browser to clock in.");
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setPunchError("Location information unavailable. Please turn on device GPS and retry.");
        } else if (err.code === err.TIMEOUT) {
          setPunchError("GPS location request timed out. Please try again.");
        } else {
          setPunchError("Unable to acquire GPS coordinates. Please try again.");
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0,
      }
    );
  };

  const handleOpenAdjust = (rec: AttendanceRecord) => {
    setEditingRecord(rec);
    setAdjustStatus(rec.status);
    setAdjustCheckIn(rec.checkIn || "");
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

  const handleClearAttendance = async () => {
    if (!confirm("Are you sure you want to clear all attendance records? This will delete all attendance records for a fresh start.")) {
      return;
    }
    setIsClearing(true);
    try {
      const res = await fetch("/api/attendance", { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        alert(data.message || "All attendance data cleared!");
        loadData();
      } else {
        alert(data.error || "Failed to clear attendance data");
      }
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setIsClearing(false);
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
            <>
              <Button
                variant="outline"
                size="sm"
                icon={<Sliders className="w-4 h-4" />}
                onClick={() => setIsPolicyModalOpen(true)}
              >
                Configure Policy
              </Button>
              <Button
                variant="danger"
                size="sm"
                isLoading={isClearing}
                icon={<Trash2 className="w-4 h-4" />}
                onClick={handleClearAttendance}
                title="Purge all attendance records for a fresh start"
              >
                Reset Attendance Data
              </Button>
            </>
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

          <div className="flex flex-col gap-2 pt-2">
            {!myRecord?.checkIn ? (
              <Button
                onClick={handleClockIn}
                isLoading={isPunching}
                size="sm"
                icon={<MapPin className="w-4 h-4" />}
                className="w-full bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/20"
              >
                {isPunching ? "Verifying GPS..." : "Clock In Now"}
              </Button>
            ) : (
              <div className="w-full text-center py-2.5 px-3 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-xs text-emerald-200 flex flex-col gap-1 items-center">
                <div className="font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Attendance Recorded ({myRecord.status})
                </div>
                {myRecord.checkInLocationStatus === "VERIFIED" && (
                  <span className="text-[11px] text-emerald-300/90 flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-emerald-400" />
                    Verified • {myRecord.checkInDistanceMeters ?? 0}m from {myRecord.checkInOfficeName || "Office"}
                  </span>
                )}
              </div>
            )}

            {punchStatusMessage && (
              <div className="text-xs text-blue-400 flex items-center justify-center gap-1.5 animate-pulse pt-1">
                <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />
                {punchStatusMessage}
              </div>
            )}

            {punchError && (
              <div className="text-xs text-rose-300 bg-rose-950/40 border border-rose-500/30 p-2 rounded-lg text-center">
                {punchError}
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
                <th className="pb-3 font-medium">Assigned Office</th>
                <th className="pb-3 font-medium">GPS Distance</th>
                <th className="pb-3 font-medium">Verification</th>
                <th className="pb-3 font-medium">Status</th>
                <th className="pb-3 font-medium">Remarks</th>
                <th className="pb-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {attendance.map((rec) => (
                <tr key={rec.id} className="hover:bg-slate-800/20">
                  <td className="py-3 font-medium text-slate-200">
                    <div>{rec.employeeName}</div>
                    <span className="text-[10px] text-slate-500 font-mono">{rec.employeeId}</span>
                  </td>
                  <td className="py-3 font-mono text-slate-300 font-semibold">{rec.checkIn || "—"}</td>
                  <td className="py-3 text-slate-300">{rec.checkInOfficeName || "—"}</td>
                  <td className="py-3 font-mono text-slate-300">
                    {rec.checkInDistanceMeters !== undefined ? `${rec.checkInDistanceMeters}m` : "—"}
                  </td>
                  <td className="py-3">
                    <Badge
                      variant={
                        rec.checkInLocationStatus === "VERIFIED"
                          ? "success"
                          : rec.checkInLocationStatus === "OUTSIDE_RADIUS"
                          ? "danger"
                          : rec.checkInLocationStatus === "LOW_ACCURACY"
                          ? "warning"
                          : "neutral"
                      }
                    >
                      {rec.checkInLocationStatus === "VERIFIED"
                        ? "Verified"
                        : rec.checkInLocationStatus === "OUTSIDE_RADIUS"
                        ? "Outside Area"
                        : rec.checkInLocationStatus === "LOW_ACCURACY"
                        ? "Low GPS"
                        : rec.checkInLocationStatus || "Manual"}
                    </Badge>
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
                  <td className="py-3 text-slate-400 max-w-[180px] truncate">{rec.remarks || "—"}</td>
                  <td className="py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {rec.checkInLatitude !== undefined && rec.checkInLongitude !== undefined && (
                        <a
                          href={`https://www.openstreetmap.org/?mlat=${rec.checkInLatitude}&mlon=${rec.checkInLongitude}#map=18/${rec.checkInLatitude}/${rec.checkInLongitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-400 hover:text-blue-300 bg-blue-950/40 border border-blue-800/40 px-2 py-1 rounded-md transition-colors"
                          title="Inspect GPS location on OpenStreetMap"
                        >
                          <MapPin className="w-3 h-3 text-blue-400" />
                          Map
                        </a>
                      )}
                      {canManage && (
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<Edit2 className="w-3.5 h-3.5" />}
                          onClick={() => handleOpenAdjust(rec)}
                          className="text-xs py-1 px-2.5"
                        >
                          Adjust
                        </Button>
                      )}
                    </div>
                  </td>
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
