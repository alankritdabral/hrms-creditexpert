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
  AlertCircle,
  HelpCircle,
} from "lucide-react";
import { StatCard } from "@/components/ui/StatCard";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Employee, AttendanceRecord, LeaveRequest, AnnouncementItem, Holiday, EmployeeIncentiveRecord, PayrollRun } from "@/lib/types";
import {
  acquireDevicePosition,
  GeolocationClientError,
} from "@/lib/attendance/client-geolocation";
import { LocationHelpModal } from "@/components/attendance/LocationHelpModal";
import { formatISTTime12, getISTDateString } from "@/lib/attendance/ist-time";

export function EmployeeDashboard() {
  const { currentUser } = useAuth();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [todayAttendance, setTodayAttendance] = useState<AttendanceRecord | null>(null);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [incentive, setIncentive] = useState<EmployeeIncentiveRecord | null>(null);
  const [latestPayroll, setLatestPayroll] = useState<PayrollRun | null>(null);
  const [isPunching, setIsPunching] = useState(false);

  const today = getISTDateString();

  useEffect(() => {
    async function load() {
      try {
        const empId = currentUser.employeeId;
        if (!empId) return;
        const [empRes, attRes, levRes, annRes, holRes, incRes, payRes] = await Promise.all([
          fetch(`/api/employees/${empId}`).then((r) => r.json()),
          fetch(`/api/attendance?date=${today}`).then((r) => r.json()),
          fetch(`/api/leaves?employeeId=${empId}`).then((r) => r.json()),
          fetch("/api/announcements").then((r) => r.json()),
          fetch("/api/holidays").then((r) => r.json()),
          fetch(`/api/incentives?employeeId=${empId}`).then((r) => r.json()),
          fetch("/api/payroll").then((r) => r.json()),
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
        if (incRes.success && incRes.data?.records) {
          const myInc = (incRes.data.records as EmployeeIncentiveRecord[]).find(
            (r) => r.employeeId === empId
          );
          setIncentive(myInc || null);
        }
        if (payRes.success && payRes.data && payRes.data.length > 0) {
          setLatestPayroll(payRes.data[0]);
        }
      } catch (e) {
        console.error("Employee dashboard load error:", e);
      }
    }
    load();
  }, [currentUser, today]);

  const [punchStatusMessage, setPunchStatusMessage] = useState<string | null>(null);
  const [punchError, setPunchError] = useState<string | null>(null);
  const [showLocationHelp, setShowLocationHelp] = useState(false);
  const [locationHelpTab, setLocationHelpTab] = useState<"android" | "ios" | "http" | "diagnostics">("android");

  const handleClockIn = async () => {
    setPunchError(null);
    setIsPunching(true);
    setPunchStatusMessage("Accessing device GPS...");

    try {
      const pos = await acquireDevicePosition();
      setPunchStatusMessage("Verifying office location...");

      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "checkIn",
          latitude: pos.latitude,
          longitude: pos.longitude,
          accuracy: pos.accuracy,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setTodayAttendance(data.data);
        setPunchStatusMessage(null);
      } else {
        if (
          res.status === 401 ||
          data.code === "UNAUTHENTICATED" ||
          data.error?.toLowerCase().includes("session") ||
          data.error?.toLowerCase().includes("authentication")
        ) {
          setPunchError("Your login session has expired. Please sign in again to clock in.");
        } else {
          setPunchError(data.error || "Failed to mark attendance.");
        }
        setPunchStatusMessage(null);
      }
    } catch (e: unknown) {
      console.error("Punch error:", e);
      setPunchStatusMessage(null);
      if (e instanceof GeolocationClientError) {
        setPunchError(e.message);
        if (e.code === "INSECURE_CONTEXT") {
          setLocationHelpTab("http");
        } else if (e.code === "PERMISSION_DENIED") {
          setLocationHelpTab("android");
        }
      } else {
        const msg = e instanceof Error ? e.message : "Failed to mark attendance.";
        setPunchError(msg);
      }
    } finally {
      setIsPunching(false);
    }
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
  const myPayrollItem = latestPayroll?.items?.find((i) => i.employeeId === currentUser.employeeId);

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Welcome Banner */}
      <div className="hero-banner flex flex-col lg:flex-row lg:items-center justify-between gap-6 p-4 sm:p-6 lg:p-8 rounded-2xl sm:rounded-3xl bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-700 text-white shadow-md shadow-blue-500/15 relative overflow-hidden">
        <div>
          <div className="flex items-center gap-2">
            <span className="banner-pill px-2.5 py-0.5 rounded-full bg-white/20 text-white text-xs font-semibold backdrop-blur-xs">
              Credit Expert India
            </span>
            <span className="text-xs text-blue-100 font-medium tracking-wide uppercase font-mono">
              Employee Self-Service • {currentUser.department}
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-white mt-2 tracking-tight">
            Welcome back, {currentUser.name}! 👋
          </h1>
          <p className="text-xs sm:text-sm text-blue-100 mt-1 max-w-xl">
            You are logged into your employee portal. Manage your attendance, leave applications, view payslips,
            and monitor performance incentives.
          </p>
        </div>

        {/* Live Attendance Clock-In Widget (Clock-In Only) */}
        <div className="p-4 rounded-2xl bg-white/15 backdrop-blur-md border border-white/25 shadow-lg flex flex-col gap-3 w-full lg:w-auto min-w-0 sm:min-w-[280px]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
            <div>
              <div className="text-[11px] text-blue-100 font-semibold uppercase tracking-wider">Today&apos;s Attendance</div>
              <div className="text-sm font-bold text-white mt-0.5">
                {hasCheckedIn ? (
                  <span className="text-emerald-200 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 inline text-emerald-300" />
                    Clocked In: {formatISTTime12(todayAttendance.checkIn)} IST
                  </span>
                ) : (
                  <span className="text-amber-200">Not clocked in today</span>
                )}
              </div>
            </div>

            <div className="w-full sm:w-auto">
              {!hasCheckedIn ? (
                <button
                  onClick={handleClockIn}
                  disabled={isPunching}
                  className="w-full sm:w-auto justify-center px-4 py-2.5 rounded-xl text-xs font-bold bg-white text-blue-700 hover:bg-blue-50 shadow-md flex items-center gap-2 transition-all cursor-pointer disabled:opacity-75 disabled:cursor-wait"
                >
                  <MapPin className="w-4 h-4 text-blue-600 animate-pulse shrink-0" />
                  {isPunching ? "Verifying..." : "Clock In"}
                </button>
              ) : (
                <span className="w-full sm:w-auto justify-center py-2 px-3 rounded-xl text-xs font-bold bg-emerald-500/30 text-emerald-100 border border-emerald-400/50 flex items-center gap-1.5 shadow-xs font-mono">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
                  Clocked In: {formatISTTime12(todayAttendance.checkIn)} IST ({todayAttendance.status})
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
            <div className="text-xs text-rose-200 bg-rose-950/60 border border-rose-500/40 p-3 rounded-xl space-y-2.5 backdrop-blur-xs">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span className="flex-1 leading-relaxed">{punchError}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-rose-500/20">
                {punchError.toLowerCase().includes("session") || punchError.toLowerCase().includes("sign in") ? (
                  <button
                    type="button"
                    onClick={() => {
                      window.location.href = "/login?redirect=/dashboard";
                    }}
                    className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-900 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    Sign In to Continue
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowLocationHelp(true)}
                      className="px-2.5 py-1 bg-white/15 hover:bg-white/25 active:bg-white/30 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <HelpCircle className="w-3.5 h-3.5 text-amber-300" />
                      How to Enable on Mobile
                    </button>
                    <button
                      type="button"
                      onClick={handleClockIn}
                      disabled={isPunching}
                      className="px-2.5 py-1 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                    >
                      {isPunching ? "Retrying..." : "Try Again"}
                    </button>
                  </>
                )}
              </div>
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
          title="Monthly Incentive"
          value={
            incentive
              ? `₹${incentive.incentiveAmount.toLocaleString("en-IN")}`
              : "₹0"
          }
          subtitle={
            incentive
              ? `₹${(incentive.achievement / 100000).toFixed(1)}L Disbursal (${incentive.status})`
              : "Disbursal Linked Engine"
          }
          change={incentive ? `Status: ${incentive.status}` : "CreditExpert Scheme"}
          trend={incentive && incentive.incentiveAmount > 0 ? "up" : "neutral"}
          color="emerald"
          icon={<Award className="w-5 h-5" />}
        />
        <StatCard
          title="Monthly Gross"
          value={
            employee?.currentSalary?.isIncentiveOnly || (employee && employee.currentSalary.grossSalary === 0)
              ? "Incentive Only"
              : employee
              ? `₹${employee.currentSalary.grossSalary.toLocaleString("en-IN")}`
              : "₹36,500"
          }
          subtitle={
            employee?.currentSalary?.isIncentiveOnly || (employee && employee.currentSalary.annualCtc === 0)
              ? "100% Performance Commission"
              : employee
              ? `Annual CTC ₹${employee.currentSalary.annualCtc.toLocaleString("en-IN")}`
              : ""
          }
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
            <Badge variant={latestPayroll?.status === "PAID" ? "success" : "indigo"}>
              {latestPayroll?.status || "PENDING"}
            </Badge>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2.5 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Pay Period</span>
              <span className="font-semibold text-slate-900">
                {latestPayroll?.periodLabel || "Current Month"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Basic + HRA</span>
              <span className="text-slate-700 font-medium">
                {myPayrollItem
                  ? `₹${((myPayrollItem.basic || 0) + (myPayrollItem.hra || 0)).toLocaleString("en-IN")}`
                  : employee?.currentSalary
                  ? `₹${((employee.currentSalary.basic || 0) + (employee.currentSalary.hra || 0)).toLocaleString("en-IN")}`
                  : "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Incentive / Bonus</span>
              <span className="text-emerald-600 font-semibold">
                +{myPayrollItem
                  ? `₹${(myPayrollItem.incentive || 0).toLocaleString("en-IN")}`
                  : incentive
                  ? `₹${incentive.incentiveAmount.toLocaleString("en-IN")}`
                  : "₹0"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Statutory PF & PT</span>
              <span className="text-rose-600 font-semibold">
                -{myPayrollItem
                  ? `₹${((myPayrollItem.employeePf || 0) + (myPayrollItem.professionalTax || 0)).toLocaleString("en-IN")}`
                  : employee?.currentSalary
                  ? `₹${((employee.currentSalary.employeePf || 0) + (employee.currentSalary.professionalTax || 0)).toLocaleString("en-IN")}`
                  : "₹0"}
              </span>
            </div>
            <div className="flex justify-between pt-2 border-t border-slate-200 font-semibold">
              <span className="text-slate-900">Net Take-Home Pay</span>
              <span className="text-emerald-600 font-bold text-sm">
                {myPayrollItem
                  ? `₹${myPayrollItem.netSalary.toLocaleString("en-IN")}`
                  : employee?.currentSalary?.netSalary
                  ? `₹${employee.currentSalary.netSalary.toLocaleString("en-IN")}`
                  : "—"}
              </span>
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

      {/* Mobile Location Permission & Troubleshooting Guide Modal */}
      <LocationHelpModal
        isOpen={showLocationHelp}
        onClose={() => setShowLocationHelp(false)}
        defaultTab={locationHelpTab}
        onPermissionGranted={handleClockIn}
      />
    </div>
  );
}
