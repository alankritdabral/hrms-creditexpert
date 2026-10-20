"use client";

import React, { useState, useEffect } from "react";
import { Employee, AttendanceRecord, PayrollRun } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth-context";
import {
  BarChart3,
  Download,
  Users,
  Clock,
  CircleDollarSign,
  PieChart,
  FileSpreadsheet,
} from "lucide-react";

export default function ReportsPage() {
  const { currentUser } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [payrollRuns, setPayrollRuns] = useState<PayrollRun[]>([]);
  const [activeReportTab, setActiveReportTab] = useState<"headcount" | "payroll" | "attendance">(
    "headcount"
  );
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [empRes, attRes, payRes] = await Promise.all([
          fetch("/api/employees").then((r) => r.json()),
          fetch("/api/attendance").then((r) => r.json()),
          fetch("/api/payroll").then((r) => r.json()),
        ]);
        if (empRes.success) setEmployees(empRes.data);
        if (attRes.success) setAttendance(attRes.data);
        if (payRes.success) setPayrollRuns(payRes.data);
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, []);

  // Department Distribution calculation
  const deptMap: Record<string, number> = {};
  employees.forEach((e) => {
    const dept = e.employment.department || "Other";
    deptMap[dept] = (deptMap[dept] || 0) + 1;
  });

  // CSV Export helper
  const exportToCSV = (data: any[], filename: string) => {
    if (!data.length) return;
    const headers = Object.keys(data[0]);
    const csvContent =
      "data:text/csv;charset=utf-8," +
      [
        headers.join(","),
        ...data.map((row) =>
          headers.map((h) => JSON.stringify(row[h] ?? "")).join(",")
        ),
      ].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${filename}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportHeadcountCSV = () => {
    const rows = employees.map((e) => ({
      EmployeeID: e.employeeId,
      Name: e.personal.fullName,
      Department: e.employment.department,
      Designation: e.employment.designation,
      Branch: e.employment.branch || "Delhi",
      Status: e.employment.employmentStatus,
      JoiningDate: e.employment.dateOfJoining,
      AnnualCTC: e.currentSalary.annualCtc,
      WorkEmail: e.personal.workEmail,
    }));
    exportToCSV(rows, `HRMS_Headcount_Report_${new Date().toISOString().split("T")[0]}`);
  };

  const exportPayrollCSV = () => {
    const run = payrollRuns[0];
    if (!run) return;
    const rows = run.items.map((i) => ({
      EmployeeID: i.employeeId,
      Name: i.employeeName,
      Department: i.department,
      Basic: i.basic,
      HRA: i.hra,
      OtherAllowance: i.otherAllowance,
      Incentives: i.incentive,
      Overtime: i.overtime,
      GrossEarnings: i.grossEarnings,
      EmployeePF: i.employeePf,
      ProfessionalTax: i.professionalTax,
      LOPAmount: i.lopAmount,
      TotalDeductions: i.totalDeductions,
      NetSalary: i.netSalary,
      EmployerPF: i.employerPf,
    }));
    exportToCSV(rows, `HRMS_Payroll_${run.runCode}_Report`);
  };

  const exportAttendanceCSV = () => {
    const rows = attendance.map((a) => ({
      EmployeeID: a.employeeId,
      Name: a.employeeName,
      Date: a.date,
      CheckIn: a.checkIn || "",
      CheckOut: a.checkOut || "",
      WorkingHours: a.totalWorkingHours,
      Status: a.status,
      LateArrival: a.lateArrival ? "Yes" : "No",
      OvertimeHours: a.overtimeHours,
      Remarks: a.remarks || "",
    }));
    exportToCSV(rows, `HRMS_Attendance_Report_${new Date().toISOString().split("T")[0]}`);
  };

  const latestPayroll = payrollRuns[0];

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <BarChart3 className="w-6 h-6 text-blue-600" />
            Executive Reports & Analytics
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Headcount breakdown, statutory payroll distributions, attendance patterns, and CSV export.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {activeReportTab === "headcount" && (
            <Button
              size="sm"
              icon={<Download className="w-4 h-4" />}
              onClick={exportHeadcountCSV}
            >
              Export Headcount CSV
            </Button>
          )}
          {activeReportTab === "payroll" && (
            <Button
              size="sm"
              icon={<Download className="w-4 h-4" />}
              onClick={exportPayrollCSV}
            >
              Export Payroll CSV
            </Button>
          )}
          {activeReportTab === "attendance" && (
            <Button
              size="sm"
              icon={<Download className="w-4 h-4" />}
              onClick={exportAttendanceCSV}
            >
              Export Attendance CSV
            </Button>
          )}
        </div>
      </div>

      {/* Report Category Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveReportTab("headcount")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-all ${
            activeReportTab === "headcount"
              ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
          }`}
        >
          <Users className="w-4 h-4" />
          Headcount & Demographics
        </button>
        <button
          onClick={() => setActiveReportTab("payroll")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-all ${
            activeReportTab === "payroll"
              ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
          }`}
        >
          <CircleDollarSign className="w-4 h-4" />
          Payroll & Statutory PF / PT
        </button>
        <button
          onClick={() => setActiveReportTab("attendance")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-all ${
            activeReportTab === "attendance"
              ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
          }`}
        >
          <Clock className="w-4 h-4" />
          Attendance & Overtime
        </button>
      </div>

      {/* TAB 1: HEADCOUNT & DEMOGRAPHICS */}
      {activeReportTab === "headcount" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="glass-card rounded-2xl p-6 border border-slate-800 md:col-span-1 space-y-4">
              <h3 className="font-semibold text-white text-base">Department Distribution</h3>
              <div className="space-y-3">
                {Object.entries(deptMap).map(([dept, count]) => {
                  const pct = Math.round((count / employees.length) * 100);
                  return (
                    <div key={dept} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-300 font-medium">{dept}</span>
                        <span className="text-indigo-400 font-bold">
                          {count} ({pct}%)
                        </span>
                      </div>
                      <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                        <div className="bg-indigo-500 h-full rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="glass-card rounded-2xl p-6 border border-slate-800 md:col-span-2 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-white text-base">Workforce Master Roster</h3>
                <Badge variant="indigo">{employees.length} Total Headcount</Badge>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="pb-3 font-medium">Employee</th>
                      <th className="pb-3 font-medium">Department</th>
                      <th className="pb-3 font-medium">Designation</th>
                      <th className="pb-3 font-medium">Status</th>
                      <th className="pb-3 font-medium">Joined</th>
                      <th className="pb-3 font-medium text-right">Annual CTC</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {employees.map((e) => (
                      <tr key={e.id} className="hover:bg-slate-800/20">
                        <td className="py-2.5 font-medium text-slate-200">
                          <div>{e.personal.fullName}</div>
                          <span className="text-[10px] text-slate-500 font-mono">{e.employeeId}</span>
                        </td>
                        <td className="py-2.5 text-slate-300">{e.employment.department}</td>
                        <td className="py-2.5 text-slate-300">{e.employment.designation}</td>
                        <td className="py-2.5">
                          <Badge variant="success">{e.employment.employmentStatus}</Badge>
                        </td>
                        <td className="py-2.5 text-slate-400 font-mono">
                          {e.employment.dateOfJoining}
                        </td>
                        <td className="py-2.5 text-right font-mono font-bold text-emerald-400">
                          ₹{e.currentSalary.annualCtc.toLocaleString("en-IN")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: PAYROLL & STATUTORY */}
      {activeReportTab === "payroll" && latestPayroll && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="glass-card rounded-2xl p-5 border border-slate-800">
              <span className="text-slate-400 text-xs">Monthly Gross Payroll</span>
              <p className="text-2xl font-bold text-white mt-1">
                ₹{latestPayroll.totalGross.toLocaleString("en-IN")}
              </p>
              <span className="text-[11px] text-slate-500">{latestPayroll.periodLabel}</span>
            </div>
            <div className="glass-card rounded-2xl p-5 border border-slate-800">
              <span className="text-slate-400 text-xs">Statutory Employee PF</span>
              <p className="text-2xl font-bold text-rose-400 mt-1">
                ₹{(latestPayroll.items.reduce((acc, i) => acc + i.employeePf, 0)).toLocaleString("en-IN")}
              </p>
              <span className="text-[11px] text-slate-500">12% standard provident fund</span>
            </div>
            <div className="glass-card rounded-2xl p-5 border border-slate-800">
              <span className="text-slate-400 text-xs">Employer PF Liability</span>
              <p className="text-2xl font-bold text-indigo-400 mt-1">
                ₹{latestPayroll.totalPfEmployer.toLocaleString("en-IN")}
              </p>
              <span className="text-[11px] text-slate-500">Company matching contribution</span>
            </div>
            <div className="glass-card rounded-2xl p-5 border border-slate-800">
              <span className="text-slate-400 text-xs">Net Salary Disbursal</span>
              <p className="text-2xl font-bold text-emerald-400 mt-1">
                ₹{latestPayroll.totalNet.toLocaleString("en-IN")}
              </p>
              <span className="text-[11px] text-slate-500">Direct bank transfer obligation</span>
            </div>
          </div>

          <div className="glass-card rounded-2xl p-6 border border-slate-800 space-y-4">
            <h3 className="font-semibold text-white text-base">Statutory Compliance & Remittance Sheet</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="pb-3 font-medium">Employee</th>
                    <th className="pb-3 font-medium">Gross</th>
                    <th className="pb-3 font-medium">Employee PF</th>
                    <th className="pb-3 font-medium">Employer PF</th>
                    <th className="pb-3 font-medium">Professional Tax</th>
                    <th className="pb-3 font-medium">LOP</th>
                    <th className="pb-3 font-medium text-right font-bold text-white">Net Payout</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {latestPayroll.items.map((i) => (
                    <tr key={i.employeeId} className="hover:bg-slate-800/20">
                      <td className="py-2.5 font-medium text-slate-200">{i.employeeName}</td>
                      <td className="py-2.5 text-slate-300">₹{i.grossEarnings.toLocaleString("en-IN")}</td>
                      <td className="py-2.5 text-rose-400">₹{i.employeePf}</td>
                      <td className="py-2.5 text-indigo-400">₹{i.employerPf}</td>
                      <td className="py-2.5 text-rose-400">₹{i.professionalTax}</td>
                      <td className="py-2.5 text-rose-400">₹{i.lopAmount}</td>
                      <td className="py-2.5 text-right font-bold text-emerald-400 font-mono">
                        ₹{i.netSalary.toLocaleString("en-IN")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: ATTENDANCE & OVERTIME */}
      {activeReportTab === "attendance" && (
        <div className="glass-card rounded-2xl p-6 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-white text-base">Attendance Regularization & Overtime Report</h3>
            <span className="text-xs text-slate-400">Grace period: 15 mins (Cutoff 10:15 AM)</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="pb-3 font-medium">Employee</th>
                  <th className="pb-3 font-medium">Date</th>
                  <th className="pb-3 font-medium">Check-In</th>
                  <th className="pb-3 font-medium">Hours</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium">Late?</th>
                  <th className="pb-3 font-medium">Overtime</th>
                  <th className="pb-3 font-medium">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {attendance.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-800/20">
                    <td className="py-2.5 font-medium text-slate-200">{a.employeeName}</td>
                    <td className="py-2.5 text-slate-300 font-mono">{a.date}</td>
                    <td className="py-2.5 text-slate-300 font-mono">{a.checkIn || "—"}</td>
                    <td className="py-2.5 text-slate-200 font-medium">{a.totalWorkingHours} hrs</td>
                    <td className="py-2.5">
                      <Badge variant="indigo">{a.status}</Badge>
                    </td>
                    <td className="py-2.5 text-slate-300">{a.lateArrival ? "Yes" : "No"}</td>
                    <td className="py-2.5 text-emerald-400 font-mono">
                      {a.overtimeHours > 0 ? `+${a.overtimeHours}h` : "—"}
                    </td>
                    <td className="py-2.5 text-slate-400">{a.remarks || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
