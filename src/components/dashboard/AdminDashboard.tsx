"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Users,
  UserCheck,
  CalendarCheck,
  AlertCircle,
  CircleDollarSign,
  Cake,
  FolderArchive,
  ArrowRight,
  FileCheck2,
  CalendarDays,
} from "lucide-react";
import { StatCard } from "@/components/ui/StatCard";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Employee, AttendanceRecord, LeaveRequest, PayrollRun, EmployeeRequestItem, Holiday } from "@/lib/types";

export function AdminDashboard() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [payrollRuns, setPayrollRuns] = useState<PayrollRun[]>([]);
  const [requests, setRequests] = useState<EmployeeRequestItem[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [empRes, attRes, levRes, payRes, reqRes, holRes] = await Promise.all([
          fetch("/api/employees").then((r) => r.json()),
          fetch("/api/attendance").then((r) => r.json()),
          fetch("/api/leaves").then((r) => r.json()),
          fetch("/api/payroll").then((r) => r.json()),
          fetch("/api/requests").then((r) => r.json()),
          fetch("/api/holidays").then((r) => r.json()),
        ]);

        if (empRes.success) setEmployees(empRes.data);
        if (attRes.success) setAttendance(attRes.data);
        if (levRes.success) setLeaves(levRes.data);
        if (payRes.success) setPayrollRuns(payRes.data);
        if (reqRes.success) setRequests(reqRes.data);
        if (holRes.success) setHolidays(holRes.data);
      } catch (err) {
        console.error("Dashboard fetch error:", err);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, []);

  const totalEmployees = employees.length;
  const activeEmployees = employees.filter((e) =>
    ["Active", "Confirmed", "Probation"].includes(e.employment.employmentStatus)
  ).length;

  const presentToday = attendance.filter((a) => a.status === "Present" || a.status === "Work From Home").length;
  const lateToday = attendance.filter((a) => a.lateArrival).length;
  const onLeaveToday = attendance.filter((a) => a.status === "Leave").length;

  const pendingLeaves = leaves.filter((l) => l.status === "Pending");
  const pendingRequests = requests.filter((r) => r.status === "Pending");

  const latestPayroll = payrollRuns[0];

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Top Banner & Quick Actions with Credit Expert India Blue Gradient */}
      <div className="hero-banner flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 lg:p-8 rounded-3xl bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-700 text-white shadow-md shadow-blue-500/15 relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex items-center gap-2">
            <span className="banner-pill px-2.5 py-0.5 rounded-full bg-white/20 text-white text-xs font-semibold backdrop-blur-xs">
              Credit Expert India
            </span>
            <span className="text-xs text-blue-100 font-mono">HR & Operations Command</span>
          </div>
          <h1 className="text-2xl lg:text-3xl font-extrabold text-white mt-2 tracking-tight">
            Workforce Overview & Intelligence
          </h1>
          <p className="text-sm text-blue-100 mt-1 max-w-2xl">
            Real-time tracking of employee attendance, salary structures, statutory compliance, and payroll.
          </p>
        </div>
        <div className="flex items-center gap-3 relative z-10">
          <Link href="/employees">
            <button className="px-4 py-2 rounded-xl text-xs font-semibold bg-white/15 hover:bg-white/25 text-white border border-white/20 transition-all cursor-pointer">
              View All Employees
            </button>
          </Link>
          <Link href="/payroll">
            <button className="btn-banner-white px-4 py-2 rounded-xl text-xs font-semibold bg-white hover:bg-blue-50 text-blue-700 shadow-sm transition-all flex items-center gap-2 cursor-pointer">
              <CircleDollarSign className="w-4 h-4 text-blue-700" />
              <span>Process Payroll</span>
            </button>
          </Link>
        </div>
        <div className="absolute -right-8 -top-8 w-56 h-56 bg-white/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute right-40 -bottom-8 w-44 h-44 bg-blue-400/20 rounded-full blur-2xl pointer-events-none" />
      </div>

      {/* Primary KPI Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Workforce"
          value={totalEmployees}
          subtitle={`${activeEmployees} Active employees`}
          change="+1 this month"
          trend="up"
          color="indigo"
          icon={<Users className="w-5 h-5" />}
        />
        <StatCard
          title="Present Today"
          value={presentToday}
          subtitle={`${lateToday} logged in late`}
          change={`${Math.round((presentToday / (activeEmployees || 1)) * 100)}% attendance rate`}
          trend="up"
          color="emerald"
          icon={<UserCheck className="w-5 h-5" />}
        />
        <StatCard
          title="On Leave Today"
          value={onLeaveToday}
          subtitle={`${pendingLeaves.length} pending requests`}
          change={pendingLeaves.length > 0 ? "Requires review" : "All cleared"}
          trend={pendingLeaves.length > 0 ? "down" : "neutral"}
          color="amber"
          icon={<CalendarCheck className="w-5 h-5" />}
        />
        <StatCard
          title="Active Payroll"
          value={latestPayroll ? `₹${(latestPayroll.totalNet / 100000).toFixed(2)}L` : "₹0"}
          subtitle={latestPayroll ? `${latestPayroll.periodLabel} (${latestPayroll.status})` : "No runs"}
          change="Snapshot ready"
          trend="neutral"
          color="purple"
          icon={<CircleDollarSign className="w-5 h-5" />}
        />
      </div>

      {/* Mid Section: Approvals & Real-Time Attendance */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pending Approvals Widget */}
        <div className="lg:col-span-1 bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-500" />
              Action Required ({pendingLeaves.length + pendingRequests.length})
            </h3>
            <Link href="/leaves" className="text-xs font-semibold text-blue-600 hover:text-blue-700">
              View all
            </Link>
          </div>

          <div className="space-y-3">
            {pendingLeaves.length === 0 && pendingRequests.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-xs">
                <FileCheck2 className="w-8 h-8 mx-auto mb-2 text-emerald-500" />
                All employee approvals and requests are up to date!
              </div>
            ) : (
              <>
                {pendingLeaves.map((l) => (
                  <div
                    key={l.id}
                    className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between text-xs"
                  >
                    <div>
                      <p className="font-semibold text-slate-800">{l.employeeName}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {l.leaveType} • {l.days} day(s) ({l.startDate})
                      </p>
                    </div>
                    <Link href="/leaves">
                      <Button size="sm" variant="outline" className="text-[11px] py-1 px-2.5">
                        Review
                      </Button>
                    </Link>
                  </div>
                ))}
                {pendingRequests.map((r) => (
                  <div
                    key={r.id}
                    className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between text-xs"
                  >
                    <div>
                      <p className="font-semibold text-slate-800">{r.employeeName}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">{r.requestType}</p>
                    </div>
                    <Link href="/requests">
                      <Button size="sm" variant="outline" className="text-[11px] py-1 px-2.5">
                        Action
                      </Button>
                    </Link>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

        {/* Live Attendance Activity Log */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900 text-base">Today&apos;s Attendance Logs</h3>
              <p className="text-xs text-slate-500 mt-0.5">Grace period: 15 mins (Late after 10:15 AM)</p>
            </div>
            <Link href="/attendance" className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1">
              Full Logs <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-slate-500">
                  <th className="pb-3 font-semibold">Employee</th>
                  <th className="pb-3 font-semibold">Check-In</th>
                  <th className="pb-3 font-semibold">Hours</th>
                  <th className="pb-3 font-semibold">Status</th>
                  <th className="pb-3 font-semibold">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {attendance.slice(0, 5).map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 font-medium text-slate-800">
                      <div>{a.employeeName}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{a.employeeId}</div>
                    </td>
                    <td className="py-3 text-slate-600 font-mono">{a.checkIn || "—"}</td>
                    <td className="py-3 text-slate-600">{a.totalWorkingHours} hrs</td>
                    <td className="py-3">
                      <Badge
                        variant={
                          a.status === "Present"
                            ? "success"
                            : a.status === "Late"
                            ? "warning"
                            : a.status === "Work From Home"
                            ? "indigo"
                            : a.status === "Leave"
                            ? "purple"
                            : "danger"
                        }
                      >
                        {a.status}
                      </Badge>
                    </td>
                    <td className="py-3 text-slate-500 text-[11px] truncate max-w-[160px]">
                      {a.remarks || "Standard shift"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Bottom Insights: Payroll Status, Upcoming Holidays, Expiring Docs & Anniversaries */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Payroll Health */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Payroll Health</span>
            <Badge variant="indigo">{latestPayroll?.status || "DRAFT"}</Badge>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Gross Payout</span>
              <span className="font-semibold text-slate-900">₹{latestPayroll?.totalGross.toLocaleString("en-IN")}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Total Statutory Deductions (PF/PT)</span>
              <span className="font-semibold text-rose-600">-₹{latestPayroll?.totalDeductions.toLocaleString("en-IN")}</span>
            </div>
            <div className="flex justify-between text-xs pt-2 border-t border-slate-100">
              <span className="text-slate-700 font-medium">Net Disbursal</span>
              <span className="font-bold text-emerald-600">₹{latestPayroll?.totalNet.toLocaleString("en-IN")}</span>
            </div>
          </div>
          <Link href="/payroll">
            <Button variant="outline" size="sm" className="w-full mt-5">
              Open Payroll Lifecycle
            </Button>
          </Link>
        </div>

        {/* Upcoming Holidays Across Branches */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <CalendarDays className="w-4 h-4 text-blue-600" />
                Branch Holidays
              </span>
              <Badge variant="indigo">{holidays.length} Total</Badge>
            </div>
            <div className="space-y-2.5 text-xs">
              {holidays.slice(0, 3).map((h) => (
                <div key={h.id} className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                  <div className="min-w-0 pr-2">
                    <p className="font-semibold text-slate-800 truncate">{h.name}</p>
                    <p className="text-[11px] text-slate-500">{h.date} • {h.type}</p>
                  </div>
                  <Badge variant={h.branch === "All" ? "indigo" : "info"} className="text-[10px] shrink-0">
                    {h.branch}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
          <Link href="/holidays" className="mt-4">
            <Button variant="outline" size="sm" className="w-full">
              Manage Holidays
            </Button>
          </Link>
        </div>

        {/* Document Expiry Warnings */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <FolderArchive className="w-4 h-4 text-rose-500" />
              Document Expiry Alerts
            </span>
            <Badge variant="danger">1 Alert</Badge>
          </div>
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200/80 text-xs">
            <p className="font-semibold text-rose-800">Sneha Patel (EMP-0012)</p>
            <p className="text-[11px] text-slate-600 mt-0.5">Passport / Visa renewal due by 15 Nov 2026</p>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[10px] text-rose-600 font-medium">29 days remaining</span>
              <Link href="/documents" className="text-[11px] font-semibold text-blue-600 hover:underline">
                View doc
              </Link>
            </div>
          </div>
        </div>

        {/* Culture & Celebrations */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <Cake className="w-4 h-4 text-pink-500" />
              Birthdays & Milestones
            </span>
            <span className="text-xs text-slate-400 font-medium">October 2026</span>
          </div>
          <div className="space-y-2.5 text-xs">
            <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-50 border border-slate-100">
              <div className="w-8 h-8 rounded-full bg-pink-100 text-pink-700 flex items-center justify-center font-bold text-xs">
                AD
              </div>
              <div>
                <p className="font-semibold text-slate-800">Ananya Deshmukh</p>
                <p className="text-[11px] text-slate-500">Birthday • Oct 30th</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-50 border border-slate-100">
              <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs">
                RS
              </div>
              <div>
                <p className="font-semibold text-slate-800">Rahul Sharma</p>
                <p className="text-[11px] text-slate-500">4-Year Work Anniversary • Nov 10th</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
