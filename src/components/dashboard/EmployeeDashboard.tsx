"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import {
  Clock,
  Calendar,
  FileText,
  Award,
  Bell,
  Download,
  CheckCircle2,
  LogOut,
  LogIn,
  MapPin,
} from "lucide-react";
import { StatCard } from "@/components/ui/StatCard";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Employee, AttendanceRecord, LeaveRequest, AnnouncementItem, Holiday } from "@/lib/types";

export function EmployeeDashboard() {
  const { currentUser } = useAuth();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [todayAttendance, setTodayAttendance] = useState<AttendanceRecord | null>(null);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [isPunching, setIsPunching] = useState(false);

  const today = new Date().toISOString().split("T")[0];

  useEffect(() => {
    async function load() {
      try {
        const empId = currentUser.employeeId;
        if (!empId) return;
        const [empRes, attRes, levRes, annRes, holRes] = await Promise.all([
          fetch(`/api/employees/${empId}`).then((r) => r.json()),
          fetch(`/api/attendance?date=${today}`).then((r) => r.json()),
          fetch(`/api/leaves?employeeId=${empId}`).then((r) => r.json()),
          fetch("/api/announcements").then((r) => r.json()),
          fetch("/api/holidays").then((r) => r.json()),
        ]);

        if (empRes.success) setEmployee(empRes.data);
        if (attRes.success && attRes.data) {
          const rec = attRes.data.find((a: AttendanceRecord) => a.employeeId === empId);
          setTodayAttendance(rec || null);
        }
        if (levRes.success) setLeaves(levRes.data);
        if (annRes.success) setAnnouncements(annRes.data);
        if (holRes.success && holRes.data) {
          const empBranch = currentUser.branch || "Delhi";
          const filtered = (holRes.data as Holiday[]).filter(
            (h) => h.branch === "All" || h.branch === empBranch
          );
          setHolidays(filtered);
        }
      } catch (e) {
        console.error("Employee dashboard load error:", e);
      }
    }
    load();
  }, [currentUser, today]);

  const [punchStatusMessage, setPunchStatusMessage] = useState<string | null>(null);
  const [punchError, setPunchError] = useState<string | null>(null);

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
            setTodayAttendance(data.data);
            setPunchStatusMessage(null);
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
          setPunchError("Location permission denied. Please enable location access in your browser to clock in.");
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

  const hasCheckedIn = !!todayAttendance?.checkIn && todayAttendance.checkIn !== "--";

  // On-demand marked leaves calculation
  const approvedLeaves = leaves.filter((l) => l.status === "Approved");
  const clTaken = approvedLeaves
    .filter((l) => l.leaveType === "Casual Leave")
    .reduce((sum, l) => sum + Number(l.days || 0), 0);
  const slTaken = approvedLeaves
    .filter((l) => l.leaveType === "Sick Leave")
    .reduce((sum, l) => sum + Number(l.days || 0), 0);
  const totalLeavesTaken = clTaken + slTaken;

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Welcome Banner */}
      <div className="hero-banner flex flex-col lg:flex-row lg:items-center justify-between gap-6 p-6 lg:p-8 rounded-3xl bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-700 text-white shadow-md shadow-blue-500/15 relative overflow-hidden">
        <div>
          <div className="flex items-center gap-2">
            <span className="banner-pill px-2.5 py-0.5 rounded-full bg-white/20 text-white text-xs font-semibold backdrop-blur-xs">
              Credit Expert India
            </span>
            <span className="text-xs text-blue-100 font-medium tracking-wide uppercase font-mono">
              Employee Self-Service • {currentUser.department}
            </span>
          </div>
          <h1 className="text-2xl lg:text-3xl font-extrabold text-white mt-2 tracking-tight">
            Welcome back, {currentUser.name}! 👋
          </h1>
          <p className="text-sm text-blue-100 mt-1 max-w-xl">
            You are logged into your employee portal. Manage your attendance, leave applications, view payslips,
            and monitor performance incentives.
          </p>
        </div>

        {/* Live Attendance Clock-In Widget (Clock-In Only) */}
        <div className="p-4 rounded-2xl bg-white/15 backdrop-blur-md border border-white/25 shadow-lg flex flex-col gap-3 min-w-[280px]">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-[11px] text-blue-100 font-semibold uppercase tracking-wider">Today&apos;s Attendance</div>
              <div className="text-sm font-bold text-white mt-0.5">
                {hasCheckedIn ? (
                  <span className="text-emerald-200 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 inline text-emerald-300" />
                    Clocked In: {todayAttendance.checkIn}
                  </span>
                ) : (
                  <span className="text-amber-200">Not clocked in today</span>
                )}
              </div>
            </div>

            <div>
              {!hasCheckedIn ? (
                <button
                  onClick={handleClockIn}
                  disabled={isPunching}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold bg-white text-blue-700 hover:bg-blue-50 shadow-md flex items-center gap-2 transition-all cursor-pointer disabled:opacity-75 disabled:cursor-wait"
                >
                  <MapPin className="w-4 h-4 text-blue-600 animate-pulse" />
                  {isPunching ? "Verifying..." : "Clock In"}
                </button>
              ) : (
                <span className="py-1.5 px-3 rounded-full text-xs font-semibold bg-emerald-500/25 text-emerald-100 border border-emerald-400/40 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {todayAttendance.status}
                </span>
              )}
            </div>
          </div>

          {/* Verification / Location feedback */}
          {hasCheckedIn && todayAttendance.checkInLocationStatus === "VERIFIED" && (
            <div className="text-[11px] text-emerald-100/90 flex items-center gap-1 pt-1 border-t border-white/10">
              <MapPin className="w-3 h-3 text-emerald-300" />
              <span>Location Verified • {todayAttendance.checkInDistanceMeters ?? 0}m from {todayAttendance.checkInOfficeName || "Office"}</span>
            </div>
          )}

          {punchStatusMessage && (
            <div className="text-xs text-blue-100 flex items-center gap-1.5 animate-pulse">
              <span className="w-2 h-2 rounded-full bg-amber-300 animate-ping" />
              {punchStatusMessage}
            </div>
          )}

          {punchError && (
            <div className="text-xs text-rose-200 bg-rose-950/40 border border-rose-500/30 p-2 rounded-lg">
              {punchError}
            </div>
          )}
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Leaves Taken"
          value={`${totalLeavesTaken} Day${totalLeavesTaken === 1 ? "" : "s"}`}
          subtitle={`Casual: ${clTaken}d • Sick: ${slTaken}d (Marked)`}
          trend="neutral"
          color="indigo"
          icon={<Calendar className="w-5 h-5" />}
        />
        <StatCard
          title="October Incentive"
          value="₹8,000"
          subtitle="Customer Success Scheme"
          change="Approved & Included"
          trend="up"
          color="emerald"
          icon={<Award className="w-5 h-5" />}
        />
        <StatCard
          title="Monthly Gross"
          value={employee ? `₹${employee.currentSalary.grossSalary.toLocaleString("en-IN")}` : "₹36,500"}
          subtitle={employee ? `Annual CTC ₹${employee.currentSalary.annualCtc.toLocaleString("en-IN")}` : ""}
          trend="neutral"
          color="purple"
          icon={<FileText className="w-5 h-5" />}
        />
        <StatCard
          title="Working Hours"
          value={todayAttendance ? `${todayAttendance.totalWorkingHours} hrs` : "0 hrs"}
          subtitle="Target: 8.0 hrs full shift"
          trend="neutral"
          color="sky"
          icon={<Clock className="w-5 h-5" />}
        />
      </div>

      {/* Middle Row: Quick Payslip, Leaves, and Announcements */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Latest Payslip Quick View */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-900 text-base">Latest Payslip</h3>
            <Badge variant="success">Paid</Badge>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2.5 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Pay Period</span>
              <span className="font-semibold text-slate-900">October 2026</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Basic + HRA</span>
              <span className="text-slate-700 font-medium">₹31,575</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Incentive / Bonus</span>
              <span className="text-emerald-600 font-semibold">+₹8,000</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Statutory PF & PT</span>
              <span className="text-rose-600 font-semibold">-₹2,000</span>
            </div>
            <div className="flex justify-between pt-2 border-t border-slate-200 font-semibold">
              <span className="text-slate-900">Net Take-Home Pay</span>
              <span className="text-emerald-600 font-bold text-sm">₹42,500</span>
            </div>
          </div>

          <Link href="/payslips">
            <Button variant="outline" size="sm" icon={<Download className="w-4 h-4" />} className="w-full">
              Download Official Payslip (PDF)
            </Button>
          </Link>
        </div>

        {/* My Leaves & Balances */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-900 text-base">My Leave Requests</h3>
            <Link href="/leaves">
              <Button size="sm" variant="secondary" className="text-xs">
                Apply Leave
              </Button>
            </Link>
          </div>

          <div className="space-y-3">
            {leaves.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-6">No recent leave requests</p>
            ) : (
              leaves.map((l) => (
                <div
                  key={l.id}
                  className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between text-xs"
                >
                  <div>
                    <p className="font-semibold text-slate-800">{l.leaveType}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {l.startDate} to {l.endDate} ({l.days} days)
                    </p>
                  </div>
                  <Badge
                    variant={l.status === "Approved" ? "success" : l.status === "Pending" ? "warning" : "danger"}
                  >
                    {l.status}
                  </Badge>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Company Announcements & Holidays */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-600" />
              Upcoming Holidays
            </h3>
            <Link href="/holidays" className="text-xs font-semibold text-blue-600 hover:text-blue-700">
              View all
            </Link>
          </div>

          <div className="space-y-2.5">
            {holidays.slice(0, 3).map((h) => (
              <div
                key={h.id}
                className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-xs flex items-center justify-between"
              >
                <div>
                  <p className="font-semibold text-slate-800">{h.name}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {new Date(h.date).toLocaleDateString("en-IN", { month: "short", day: "numeric", weekday: "short" })}
                  </p>
                </div>
                <span className="text-[10px] font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                  {h.branch}
                </span>
              </div>
            ))}
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
            <span className="text-[11px] text-slate-400">Branch: {currentUser.branch || "Delhi"}</span>
            <span className="text-[10px] text-slate-400 italic">View-only</span>
          </div>
        </div>
      </div>
    </div>
  );
}
