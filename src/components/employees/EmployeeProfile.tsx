"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Employee,
  AttendanceRecord,
  LeaveRequest,
  EmployeeIncentiveRecord,
  AssetRecord,
  EmployeeDocument,
} from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { SensitiveDataMask } from "@/components/ui/SensitiveDataMask";
import { useAuth } from "@/lib/auth-context";
import {
  Mail,
  Phone,
  MapPin,
  Calendar,
  Building,
  Shield,
  TrendingUp,
  FileText,
  Clock,
  Award,
  Laptop,
  History,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
} from "lucide-react";

interface EmployeeProfileProps {
  employee: Employee;
  attendance: AttendanceRecord[];
  leaves: LeaveRequest[];
  incentives: EmployeeIncentiveRecord[];
  assets: AssetRecord[];
  documents: EmployeeDocument[];
  onRefresh: () => void;
}

export function EmployeeProfile({
  employee,
  attendance,
  leaves,
  incentives,
  assets,
  documents,
  onRefresh,
}: EmployeeProfileProps) {
  const { currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState<
    "overview" | "salary" | "attendance" | "leaves" | "documents" | "incentives" | "assets" | "lifecycle"
  >("overview");

  // Salary Revision Modal State
  const [isRevisionModalOpen, setIsRevisionModalOpen] = useState(false);
  const [newCtc, setNewCtc] = useState(employee.currentSalary.annualCtc);
  const [revisionReason, setRevisionReason] = useState("");
  const [isSubmittingRevision, setIsSubmittingRevision] = useState(false);

  const canEditSalary = ["admin", "hr"].includes(currentUser.role);

  // On-demand marked leaves calculation
  const approvedLeaves = leaves.filter((l) => l.status === "Approved");
  const clTaken = approvedLeaves
    .filter((l) => l.leaveType === "Casual Leave")
    .reduce((sum, l) => sum + Number(l.days || 0), 0);
  const slTaken = approvedLeaves
    .filter((l) => l.leaveType === "Sick Leave")
    .reduce((sum, l) => sum + Number(l.days || 0), 0);
  const totalTaken = clTaken + slTaken;

  const clPending = leaves
    .filter((l) => l.leaveType === "Casual Leave" && l.status === "Pending")
    .reduce((sum, l) => sum + Number(l.days || 0), 0);
  const slPending = leaves
    .filter((l) => l.leaveType === "Sick Leave" && l.status === "Pending")
    .reduce((sum, l) => sum + Number(l.days || 0), 0);

  const handleSalaryRevisionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingRevision(true);
    try {
      const res = await fetch(`/api/employees/${employee.employeeId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newAnnualCtc: Number(newCtc),
          revisionReason,
          actor: { name: currentUser.name, role: currentUser.role },
        }),
      });
      const data = await res.json();
      if (data.success) {
        setIsRevisionModalOpen(false);
        setRevisionReason("");
        onRefresh();
      } else {
        alert(data.error || "Failed to revise salary");
      }
    } catch (e) {
      console.error(e);
      alert("Error saving revision");
    } finally {
      setIsSubmittingRevision(false);
    }
  };

  const tabs = [
    { id: "overview", label: "Overview", icon: <Building className="w-4 h-4" /> },
    { id: "salary", label: "Salary & Revisions", icon: <TrendingUp className="w-4 h-4" /> },
    { id: "attendance", label: "Attendance", icon: <Clock className="w-4 h-4" /> },
    { id: "leaves", label: "Leaves", icon: <Calendar className="w-4 h-4" /> },
    { id: "documents", label: "Documents", icon: <FileText className="w-4 h-4" /> },
    { id: "incentives", label: "Incentives", icon: <Award className="w-4 h-4" /> },
    { id: "assets", label: "Assets", icon: <Laptop className="w-4 h-4" /> },
    { id: "lifecycle", label: "Lifecycle", icon: <History className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Back button */}
      <div>
        <Link
          href="/employees"
          className="inline-flex items-center gap-2 text-xs text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Employee Directory
        </Link>
      </div>

      {/* Hero Header matching Section 28 of PRD */}
      <div className="glass-panel rounded-3xl p-6 lg:p-8 border border-slate-800 relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="flex items-center gap-5">
            <img
              src={employee.personal.avatarUrl}
              alt={employee.personal.fullName}
              className="w-20 h-20 rounded-2xl object-cover border-2 border-indigo-500/40 shadow-xl shadow-indigo-500/10"
            />
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl font-bold text-white tracking-tight">
                  {employee.personal.fullName}
                </h1>
                <Badge variant="indigo" className="font-mono text-xs">
                  {employee.employeeId}
                </Badge>
                <Badge
                  variant={
                    employee.employment.employmentStatus === "Active" ||
                    employee.employment.employmentStatus === "Confirmed"
                      ? "success"
                      : "warning"
                  }
                >
                  {employee.employment.employmentStatus}
                </Badge>
                <span className="inline-flex items-center gap-1 font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200 text-[10px]">
                  <MapPin className="w-2.5 h-2.5 text-blue-500" />
                  {employee.employment.branch || "Delhi"}
                </span>
              </div>
              <p className="text-sm text-slate-300 mt-1 font-medium">
                {employee.employment.designation} • {employee.employment.department}
              </p>
              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 mt-2.5">
                <span className="flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-slate-500" />
                  {employee.personal.workEmail}
                </span>
                <span className="flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-slate-500" />
                  {employee.personal.mobileNumber}
                </span>
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-slate-500" />
                  {employee.employment.workLocation}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {canEditSalary && (
              <Button
                size="sm"
                variant="outline"
                icon={<TrendingUp className="w-4 h-4" />}
                onClick={() => setIsRevisionModalOpen(true)}
              >
                Revise Salary
              </Button>
            )}
            <Link href="/payslips">
              <Button size="sm" icon={<FileText className="w-4 h-4" />}>
                View Payslips
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Navigation Tab Bar */}
      <div className="flex items-center gap-2 overflow-x-auto border-b border-slate-800 pb-2">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                isActive
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === "overview" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Personal Info */}
          <div className="glass-card rounded-2xl p-6 border border-slate-800 space-y-4">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2 border-b border-slate-800 pb-2">
              Personal Information
            </h3>
            <div className="space-y-3 text-xs">
              <div>
                <span className="text-slate-500 block">Parent / Guardian</span>
                <span className="text-slate-200 font-medium">{employee.personal.parentsName || "—"}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Date of Birth & Gender</span>
                <span className="text-slate-200 font-medium">
                  {employee.personal.dob} ({employee.personal.gender})
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Personal Email</span>
                <span className="text-slate-200 font-medium">{employee.personal.personalEmail}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Residential Address</span>
                <span className="text-slate-200 font-medium leading-relaxed">{employee.personal.address}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Emergency Contact</span>
                <span className="text-slate-200 font-medium">
                  {employee.personal.emergencyContact.name} ({employee.personal.emergencyContact.relationship}) -{" "}
                  {employee.personal.emergencyContact.phone}
                </span>
              </div>
            </div>
          </div>

          {/* Employment Info */}
          <div className="glass-card rounded-2xl p-6 border border-slate-800 space-y-4">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2 border-b border-slate-800 pb-2">
              Employment Details
            </h3>
            <div className="space-y-3 text-xs">
              <div>
                <span className="text-slate-500 block">Date of Joining</span>
                <span className="text-slate-200 font-medium">{employee.employment.dateOfJoining}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Assigned Branch</span>
                <span className="text-blue-600 font-semibold">{employee.employment.branch || "Delhi"} Branch</span>
              </div>
              <div>
                <span className="text-slate-500 block">Department & Designation</span>
                <span className="text-slate-200 font-medium">
                  {employee.employment.department} — {employee.employment.designation}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Reporting Manager</span>
                <span className="text-slate-200 font-medium">{employee.employment.reportingManagerName || "None"}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Employment Type & Category</span>
                <span className="text-slate-200 font-medium">
                  {employee.employment.employmentType} ({employee.employment.employeeCategory})
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Probation Period</span>
                <span className="text-slate-200 font-medium">
                  {employee.employment.probationMonths} months (Confirmed:{" "}
                  {employee.employment.confirmationDate || "Pending"})
                </span>
              </div>
            </div>
          </div>

          {/* Statutory & Banking (Masked sensitive fields) */}
          <div className="glass-card rounded-2xl p-6 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-indigo-400" />
                Statutory & Banking
              </h3>
              <Badge variant="indigo" className="text-[10px]">
                RBAC Masked
              </Badge>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <span className="text-slate-500 block">PAN Number</span>
                <SensitiveDataMask value={employee.statutory.pan} type="pan" />
              </div>
              <div>
                <span className="text-slate-500 block">Aadhaar Number</span>
                <SensitiveDataMask value={employee.statutory.aadhaar} type="aadhaar" />
              </div>
              <div>
                <span className="text-slate-500 block">Universal Account Number (UAN)</span>
                <span className="font-mono text-slate-300">{employee.statutory.uan}</span>
              </div>
              <div>
                <span className="text-slate-500 block">PF Account Number</span>
                <span className="font-mono text-slate-300">{employee.statutory.pfAccountNumber}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Bank Account & IFSC</span>
                <div>
                  <SensitiveDataMask value={employee.statutory.bankAccountNumber} type="bank" />
                  <span className="text-[11px] text-slate-400 block mt-0.5">
                    {employee.statutory.bankName} • {employee.statutory.ifscCode}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: SALARY STRUCTURE & VERSIONED HISTORY */}
      {activeTab === "salary" && (
        <div className="space-y-6">
          {/* Current Structure Breakdown Card */}
          <div className="glass-card rounded-2xl p-6 border border-slate-800">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800 gap-3">
              <div>
                <span className="text-xs text-indigo-400 font-semibold uppercase tracking-wider">
                  Active Salary Structure
                </span>
                <h3 className="text-xl font-bold text-white mt-0.5">
                  Annual CTC: ₹{employee.currentSalary.annualCtc.toLocaleString("en-IN")}
                </h3>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-400">Monthly CTC</span>
                <div className="text-lg font-bold text-emerald-400">
                  ₹{employee.currentSalary.monthlyCtc.toLocaleString("en-IN")}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5 text-xs">
              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                <span className="text-slate-400">Basic Salary (50%)</span>
                <p className="text-sm font-bold text-white mt-1">
                  ₹{employee.currentSalary.basic.toLocaleString("en-IN")}
                </p>
                <span className="text-[10px] text-slate-500">PF calculable base</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                <span className="text-slate-400">HRA (50% of Basic)</span>
                <p className="text-sm font-bold text-white mt-1">
                  ₹{employee.currentSalary.hra.toLocaleString("en-IN")}
                </p>
                <span className="text-[10px] text-slate-500">Tax exemption eligible</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                <span className="text-slate-400">Special & Other Allowances</span>
                <p className="text-sm font-bold text-white mt-1">
                  ₹{(employee.currentSalary.specialAllowance + employee.currentSalary.otherAllowance).toLocaleString("en-IN")}
                </p>
                <span className="text-[10px] text-slate-500">Balances monthly gross</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                <span className="text-slate-400">Monthly Gross Salary</span>
                <p className="text-sm font-bold text-indigo-400 mt-1">
                  ₹{employee.currentSalary.grossSalary.toLocaleString("en-IN")}
                </p>
                <span className="text-[10px] text-slate-500">Pre-deductions total</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4 pt-4 border-t border-slate-800/80 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Employer PF Contribution</span>
                <span className="font-semibold text-slate-200">
                  ₹{employee.currentSalary.employerPf.toLocaleString("en-IN")}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Employee PF Deduction</span>
                <span className="font-semibold text-rose-400">
                  ₹{employee.currentSalary.employeePf.toLocaleString("en-IN")}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Professional Tax (PT)</span>
                <span className="font-semibold text-rose-400">
                  ₹{employee.currentSalary.professionalTax}
                </span>
              </div>
            </div>
          </div>

          {/* Versioned Salary History Table (Critical Section 8 from PRD) */}
          <div className="glass-card rounded-2xl p-6 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-white">Immutable Salary Revision History</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Historical salary revisions are permanently preserved and snapshot-audited.
                </p>
              </div>
              <Badge variant="indigo">{employee.salaryHistory.length} Revisions</Badge>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="pb-3 font-medium">Effective Date</th>
                    <th className="pb-3 font-medium">Annual CTC</th>
                    <th className="pb-3 font-medium">Monthly Gross</th>
                    <th className="pb-3 font-medium">Revision Reason</th>
                    <th className="pb-3 font-medium">Authorized By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {employee.salaryHistory.map((rev) => (
                    <tr key={rev.id} className="hover:bg-slate-800/20">
                      <td className="py-3 font-mono text-slate-300">{rev.effectiveFrom}</td>
                      <td className="py-3 font-bold text-white">₹{rev.annualCtc.toLocaleString("en-IN")}</td>
                      <td className="py-3 text-slate-300">
                        ₹{rev.components.grossSalary.toLocaleString("en-IN")}
                      </td>
                      <td className="py-3 text-indigo-300 font-medium">{rev.revisionReason}</td>
                      <td className="py-3 text-slate-400">{rev.updatedBy}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: ATTENDANCE HISTORY */}
      {activeTab === "attendance" && (
        <div className="glass-card rounded-2xl p-6 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-white text-base">Attendance Logs for {employee.personal.fullName}</h3>
            <span className="text-xs text-slate-400">Office hours: 10:00 AM – 7:00 PM</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="pb-3 font-medium">Date</th>
                  <th className="pb-3 font-medium">Check-In</th>
                  <th className="pb-3 font-medium">Check-Out</th>
                  <th className="pb-3 font-medium">Working Hours</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {attendance.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500">
                      No attendance records found for this employee
                    </td>
                  </tr>
                ) : (
                  attendance.map((a) => (
                    <tr key={a.id} className="hover:bg-slate-800/20">
                      <td className="py-3 font-mono text-slate-300">{a.date}</td>
                      <td className="py-3 font-mono text-slate-300">{a.checkIn || "—"}</td>
                      <td className="py-3 font-mono text-slate-300">{a.checkOut || "—"}</td>
                      <td className="py-3 text-slate-300">{a.totalWorkingHours} hrs</td>
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
                      <td className="py-3 text-slate-400">{a.remarks || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: LEAVES */}
      {activeTab === "leaves" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/20">
              <span className="text-xs text-indigo-400 font-medium uppercase tracking-wider">Casual Leave (CL)</span>
              <p className="text-2xl font-bold text-white mt-1">{clTaken} Day{clTaken === 1 ? "" : "s"}</p>
              <span className="text-[11px] text-slate-400">
                {clPending > 0 ? `${clPending}d pending • ` : ""}Marked as taken (No preset limit)
              </span>
            </div>
            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
              <span className="text-xs text-emerald-400 font-medium uppercase tracking-wider">Sick Leave (SL)</span>
              <p className="text-2xl font-bold text-white mt-1">{slTaken} Day{slTaken === 1 ? "" : "s"}</p>
              <span className="text-[11px] text-slate-400">
                {slPending > 0 ? `${slPending}d pending • ` : ""}Marked as taken (No preset limit)
              </span>
            </div>
            <div className="p-4 rounded-2xl bg-purple-500/10 border border-purple-500/20">
              <span className="text-xs text-purple-400 font-medium uppercase tracking-wider">Total Leaves Recorded</span>
              <p className="text-2xl font-bold text-white mt-1">{totalTaken} Day{totalTaken === 1 ? "" : "s"}</p>
              <span className="text-[11px] text-slate-400">On-demand approved records</span>
            </div>
          </div>

          <div className="glass-card rounded-2xl p-6 border border-slate-800 space-y-4">
            <h3 className="font-semibold text-white text-base">Leave Applications & History</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="pb-3 font-medium">Leave Type</th>
                    <th className="pb-3 font-medium">Dates</th>
                    <th className="pb-3 font-medium">Days</th>
                    <th className="pb-3 font-medium">Reason</th>
                    <th className="pb-3 font-medium">Status</th>
                    <th className="pb-3 font-medium">Review Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {leaves.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-slate-500">
                        No leave records
                      </td>
                    </tr>
                  ) : (
                    leaves.map((l) => (
                      <tr key={l.id} className="hover:bg-slate-800/20">
                        <td className="py-3 font-semibold text-slate-200">{l.leaveType}</td>
                        <td className="py-3 font-mono text-slate-300">
                          {l.startDate} to {l.endDate}
                        </td>
                        <td className="py-3 text-slate-300">{l.days}</td>
                        <td className="py-3 text-slate-400">{l.reason}</td>
                        <td className="py-3">
                          <Badge
                            variant={
                              l.status === "Approved" ? "success" : l.status === "Pending" ? "warning" : "danger"
                            }
                          >
                            {l.status}
                          </Badge>
                        </td>
                        <td className="py-3 text-slate-400">{l.reviewNotes || "—"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: DOCUMENTS */}
      {activeTab === "documents" && (
        <div className="glass-card rounded-2xl p-6 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-white text-base">Uploaded Documents & Compliance</h3>
            <Button size="sm" variant="secondary" icon={<FileText className="w-4 h-4" />}>
              Upload Document
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {documents.map((d) => (
              <div
                key={d.id}
                className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex items-start justify-between text-xs hover:border-slate-700 transition-colors"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white">{d.title}</span>
                    <Badge variant={d.status === "Verified" ? "success" : "warning"}>{d.status}</Badge>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">Type: {d.documentType}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">Uploaded on {d.uploadDate} by {d.uploadedBy}</p>
                  {d.expiryDate && (
                    <div className="mt-2 flex items-center gap-1.5 text-rose-400 font-medium">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Expires: {d.expiryDate} (Renewal required)
                    </div>
                  )}
                </div>
                <Button size="sm" variant="outline" className="text-xs py-1 px-2.5">
                  View / Download
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 6: INCENTIVES */}
      {activeTab === "incentives" && (
        <div className="glass-card rounded-2xl p-6 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-white text-base">Incentive Achievements & Integration</h3>
            <span className="text-xs text-emerald-400 font-medium">Linked to Monthly Payroll Engine</span>
          </div>

          <div className="space-y-3">
            {incentives.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-6">No incentive records for this employee</p>
            ) : (
              incentives.map((i) => (
                <div
                  key={i.id}
                  className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between text-xs"
                >
                  <div>
                    <span className="font-semibold text-white text-sm">{i.schemeName}</span>
                    <p className="text-slate-400 text-xs mt-1">
                      Month: {i.month} • Target: {i.target} • Achieved: {i.achievement}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Approved by {i.approvedBy} on {i.approvedDate} (Run Ref: {i.payrollRunId})
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-slate-400 block">Payout Amount</span>
                    <span className="text-lg font-bold text-emerald-400">
                      ₹{i.incentiveAmount.toLocaleString("en-IN")}
                    </span>
                    <Badge variant="success" className="mt-1">
                      {i.status}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 7: ASSETS */}
      {activeTab === "assets" && (
        <div className="glass-card rounded-2xl p-6 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-white text-base">Company Assets Assigned</h3>
            <Badge variant="indigo">{assets.length} Assigned Assets</Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {assets.map((a) => (
              <div
                key={a.id}
                className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex items-start justify-between text-xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white text-sm">{a.model}</span>
                    <Badge variant="indigo" className="font-mono">
                      {a.assetTag}
                    </Badge>
                  </div>
                  <p className="text-slate-400">Serial No: {a.serialNumber}</p>
                  <p className="text-[11px] text-slate-500">Issued on {a.issuedDate || "—"}</p>
                  <p className="text-[11px] text-slate-400 italic mt-1">{a.notes}</p>
                </div>
                <Badge variant={a.status === "Assigned" ? "success" : "warning"}>{a.status}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 8: LIFECYCLE & MILESTONES */}
      {activeTab === "lifecycle" && (
        <div className="glass-card rounded-2xl p-6 border border-slate-800 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-semibold text-white text-base">Employee Lifecycle & Career Path</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Current Operational Status:{" "}
                <span className="font-bold text-indigo-400">{employee.employment.employmentStatus}</span>
              </p>
            </div>
            {(currentUser.role === "admin" || currentUser.role === "hr") && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Transition Status:</span>
                <select
                  value={employee.employment.employmentStatus}
                  onChange={async (e) => {
                    const newStatus = e.target.value;
                    try {
                      await fetch(`/api/onboarding/${employee.employeeId}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "advance_lifecycle", newStatus }),
                      });
                      onRefresh();
                    } catch (err) {
                      console.error("Failed to update status:", err);
                    }
                  }}
                  className="bg-slate-900 border border-slate-700 text-xs rounded-lg px-2.5 py-1.5 text-white font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="Candidate">Candidate</option>
                  <option value="Offer Sent">Offer Sent</option>
                  <option value="Offer Accepted">Offer Accepted</option>
                  <option value="Onboarding">Onboarding</option>
                  <option value="Probation">Probation</option>
                  <option value="Confirmed">Confirmed</option>
                  <option value="Active">Active</option>
                  <option value="On Notice">On Notice</option>
                  <option value="Resigned">Resigned</option>
                  <option value="Terminated">Terminated</option>
                  <option value="Exited">Exited</option>
                </select>
              </div>
            )}
          </div>

          {/* 11-Stage Visual Progress Bar */}
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
            <div className="text-xs font-semibold text-slate-300">11-Stage Lifecycle Pipeline</div>
            <div className="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-11 gap-1 text-[11px] text-center font-medium">
              {[
                "Candidate",
                "Offer Sent",
                "Offer Accepted",
                "Onboarding",
                "Probation",
                "Confirmed",
                "Active",
                "On Notice",
                "Resigned",
                "Terminated",
                "Exited",
              ].map((stage, idx) => {
                const isCurrent = employee.employment.employmentStatus === stage;
                return (
                  <div
                    key={stage}
                    className={`p-2 rounded-lg border transition-all ${
                      isCurrent
                        ? "bg-indigo-600 text-white font-bold border-indigo-400 ring-2 ring-indigo-400/30"
                        : "bg-slate-950/60 text-slate-400 border-slate-800"
                    }`}
                  >
                    <div className="text-[10px] opacity-70 mb-0.5">#{idx + 1}</div>
                    <div className="truncate">{stage}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="relative border-l-2 border-indigo-500/30 ml-4 pl-6 space-y-6 text-xs">
            <div className="relative">
              <div className="absolute -left-[31px] top-0.5 w-4 h-4 rounded-full bg-emerald-500 ring-4 ring-slate-950" />
              <p className="font-semibold text-white">Joined Company</p>
              <p className="text-slate-400 mt-0.5">
                Joined as {employee.employment.designation} on {employee.employment.dateOfJoining} at{" "}
                {employee.employment.branch} Branch
              </p>
            </div>
            <div className="relative">
              <div className="absolute -left-[31px] top-0.5 w-4 h-4 rounded-full bg-emerald-500 ring-4 ring-slate-950" />
              <p className="font-semibold text-white">Probation Review</p>
              <p className="text-slate-400 mt-0.5">
                Confirmation Date: {employee.employment.confirmationDate || "2024-09-15"} (Probation:{" "}
                {employee.employment.probationMonths || 3} months)
              </p>
            </div>
            <div className="relative">
              <div className="absolute -left-[31px] top-0.5 w-4 h-4 rounded-full bg-indigo-500 ring-4 ring-slate-950" />
              <p className="font-semibold text-white">Salary Appraisal & CTC Structure</p>
              <p className="text-slate-400 mt-0.5">
                Annual CTC: ₹{employee.currentSalary.annualCtc.toLocaleString("en-IN")}
              </p>
            </div>
            <div className="relative">
              <div
                className={`absolute -left-[31px] top-0.5 w-4 h-4 rounded-full ring-4 ring-slate-950 ${
                  employee.employment.employmentStatus === "Exited" ||
                  employee.employment.employmentStatus === "Resigned"
                    ? "bg-rose-500"
                    : "bg-slate-700"
                }`}
              />
              <p className="font-semibold text-white">Exit / Full & Final Settlement</p>
              <p className="text-slate-400 mt-0.5">
                {employee.employment.employmentStatus === "Exited"
                  ? "Separation and Full & Final settlement completed."
                  : employee.employment.employmentStatus === "On Notice"
                  ? "Employee is currently serving formal notice period."
                  : employee.employment.employmentStatus === "Resigned"
                  ? "Resignation submitted and pending clearance."
                  : "Active Employee (No resignation or exit clearance)"}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* SALARY REVISION MODAL */}
      <Modal
        isOpen={isRevisionModalOpen}
        onClose={() => setIsRevisionModalOpen(false)}
        title="Revise Employee Salary"
        subtitle="Every salary revision creates a new historical record. Historical records are never overwritten."
        maxWidth="lg"
      >
        <form onSubmit={handleSalaryRevisionSubmit} className="space-y-4">
          <div>
            <span className="text-xs text-slate-400">Current Annual CTC</span>
            <div className="text-base font-bold text-slate-300">
              ₹{employee.currentSalary.annualCtc.toLocaleString("en-IN")}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              New Annual CTC (₹ INR) *
            </label>
            <input
              type="number"
              step="5000"
              required
              value={newCtc}
              onChange={(e) => setNewCtc(Number(e.target.value))}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Revision Reason / Justification *
            </label>
            <input
              type="text"
              required
              value={revisionReason}
              onChange={(e) => setRevisionReason(e.target.value)}
              placeholder="e.g. Annual Appraisal 2026 / Promotion"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-800">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsRevisionModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" isLoading={isSubmittingRevision}>
              Save Salary Revision
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
