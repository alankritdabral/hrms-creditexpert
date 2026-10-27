"use client";

import React, { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import {
  Employee,
  AttendanceRecord,
  LeaveRequest,
  EmployeeIncentiveRecord,
  AssetRecord,
  EmployeeDocument,
} from "@/lib/types";
import { calculateSalaryFromMonthly } from "@/lib/payroll-engine";
import { formatISTTime12 } from "@/lib/attendance/ist-time";
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
  Camera,
  UploadCloud,
  ShieldCheck,
  User,
  Image as ImageIcon,
  Trash2,
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
  const { currentUser, updateCurrentUserAvatar, refreshSession } = useAuth();
  const [activeTab, setActiveTab] = useState<
    "overview" | "salary" | "attendance" | "leaves" | "documents" | "incentives" | "assets" | "lifecycle"
  >("overview");

  // Salary Revision Modal State (Simplified: Net Salary & PF)
  const [isRevisionModalOpen, setIsRevisionModalOpen] = useState(false);
  const [salaryBasis, setSalaryBasis] = useState<"monthly_net" | "monthly_gross" | "incentive_only">(
    employee.currentSalary.isIncentiveOnly || (employee.currentSalary.annualCtc === 0 && employee.currentSalary.grossSalary === 0)
      ? "incentive_only"
      : "monthly_net"
  );
  const [monthlyAmount, setMonthlyAmount] = useState<number>(
    employee.currentSalary.isIncentiveOnly
      ? 0
      : employee.currentSalary.netSalary ||
          Math.max(0, employee.currentSalary.grossSalary - (employee.currentSalary.employeePf || 0))
  );
  const [includePf, setIncludePf] = useState<boolean>(
    employee.currentSalary.isIncentiveOnly
      ? false
      : employee.currentSalary.includePf !== undefined
      ? Boolean(employee.currentSalary.includePf)
      : (employee.currentSalary.employeePf ?? 0) > 0
  );
  const [pfType, setPfType] = useState<"percentage" | "fixed">(
    employee.currentSalary.pfType || "percentage"
  );
  const [pfValue, setPfValue] = useState<number>(
    employee.currentSalary.pfValue !== undefined
      ? employee.currentSalary.pfValue
      : (employee.currentSalary.pfType === "fixed"
          ? (employee.currentSalary.employeePf || 1800)
          : 12)
  );
  const [revisionReason, setRevisionReason] = useState("");
  const [isSubmittingRevision, setIsSubmittingRevision] = useState(false);

  // Profile Photo Management State
  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);
  const [photoPreference, setPhotoPreference] = useState<"passport" | "custom">(
    employee.personal.avatarPreference || "passport"
  );
  const [customPhotoUrl, setCustomPhotoUrl] = useState<string>(
    employee.personal.customAvatarUrl || ""
  );
  const [customPhotoFile, setCustomPhotoFile] = useState<File | null>(null);
  const [customPhotoPreview, setCustomPhotoPreview] = useState<string>(
    employee.personal.customAvatarUrl || ""
  );
  const [passportPhotoInputUrl, setPassportPhotoInputUrl] = useState<string>("");
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [photoMessage, setPhotoMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // User Role Management for this employee
  const [employeeRole, setEmployeeRole] = useState<string>("employee");
  const [availableRoles, setAvailableRoles] = useState<{ id: string; name: string }[]>([]);
  const [isUpdatingRole, setIsUpdatingRole] = useState(false);
  const [roleMessage, setRoleMessage] = useState("");

  useEffect(() => {
    async function fetchUserRole() {
      try {
        const res = await fetch("/api/roles");
        const data = await res.json();
        if (data.success) {
          if (data.roles) {
            setAvailableRoles(data.roles.map((r: any) => ({ id: r.id, name: r.name })));
          }
          if (data.users) {
            const userMatch = data.users.find(
              (u: any) =>
                u.employeeId?.toLowerCase() === employee.employeeId.toLowerCase() ||
                (employee.personal.workEmail && u.email?.toLowerCase() === employee.personal.workEmail.toLowerCase())
            );
            if (userMatch) {
              setEmployeeRole(userMatch.role || "employee");
            }
          }
        }
      } catch (e) {
        console.error("Error fetching user role:", e);
      }
    }
    fetchUserRole();
  }, [employee.employeeId, employee.personal.workEmail]);

  const handleRoleChange = async (newRole: string) => {
    setIsUpdatingRole(true);
    setRoleMessage("");
    try {
      const res = await fetch("/api/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "assign_role",
          identifier: employee.employeeId,
          role: newRole,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setEmployeeRole(newRole);
        setRoleMessage("Role updated!");
        if (currentUser.employeeId === employee.employeeId) {
          refreshSession();
        }
        setTimeout(() => setRoleMessage(""), 3000);
      } else {
        alert(data.error || "Failed to update role");
      }
    } catch (e) {
      console.error(e);
      alert("Error updating role");
    } finally {
      setIsUpdatingRole(false);
    }
  };

  // Resolve official passport photo (from documents KYC or personal)
  const passportDoc = documents.find(
    (d) =>
      d.documentType === "photograph" ||
      d.documentType?.toLowerCase().includes("passport") ||
      d.title?.toLowerCase().includes("passport") ||
      d.title?.toLowerCase().includes("photograph") ||
      d.title?.toLowerCase().includes("photo")
  );
  const resolvedPassportPhoto =
    employee.personal.passportPhotoUrl ||
    passportDoc?.fileUrl ||
    (employee.personal.avatarPreference !== "custom" ? employee.personal.avatarUrl : undefined);

  const activePreference = employee.personal.avatarPreference || "passport";
  const displayAvatar =
    activePreference === "custom" && employee.personal.customAvatarUrl
      ? employee.personal.customAvatarUrl
      : resolvedPassportPhoto ||
        employee.personal.avatarUrl ||
        "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150";

  const canEditPhoto =
    currentUser.role === "admin" ||
    currentUser.role === "hr" ||
    currentUser.employeeId === employee.employeeId;

  const handleOpenPhotoModal = () => {
    setPhotoPreference(employee.personal.avatarPreference || "passport");
    setCustomPhotoUrl(employee.personal.customAvatarUrl || "");
    setCustomPhotoPreview(employee.personal.customAvatarUrl || "");
    setCustomPhotoFile(null);
    setPassportPhotoInputUrl("");
    setPhotoMessage(null);
    setIsPhotoModalOpen(true);
  };

  const handleCustomPhotoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setPhotoMessage({ type: "error", text: "Please select an image file (JPG, PNG, or WEBP)." });
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setPhotoMessage({ type: "error", text: "Image file must be under 2 MB in size." });
      return;
    }

    setPhotoMessage(null);
    setCustomPhotoFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      setCustomPhotoPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSavePhotoSettings = async () => {
    setIsUploadingPhoto(true);
    setPhotoMessage(null);

    try {
      let finalCustomUrl = customPhotoUrl;

      // If a new custom file was selected, upload it to /api/upload
      if (photoPreference === "custom" && customPhotoFile) {
        const formData = new FormData();
        formData.append("file", customPhotoFile);
        formData.append("documentType", "photograph");
        formData.append("identifier", employee.employeeId);

        const uploadRes = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });
        const uploadData = await uploadRes.json();
        if (!uploadRes.ok || !uploadData.success) {
          throw new Error(uploadData.error || "Failed to upload image file.");
        }
        finalCustomUrl = uploadData.data.fileUrl;
      }

      let finalPassportUrl = resolvedPassportPhoto || employee.personal.passportPhotoUrl;
      if (passportPhotoInputUrl && passportPhotoInputUrl.trim()) {
        finalPassportUrl = passportPhotoInputUrl.trim();
      }

      const effectiveAvatar =
        photoPreference === "custom" && (finalCustomUrl || customPhotoPreview)
          ? finalCustomUrl || customPhotoPreview
          : finalPassportUrl || displayAvatar;

      const res = await fetch(`/api/employees/${employee.employeeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          avatarPreference: photoPreference,
          customAvatarUrl: finalCustomUrl || (photoPreference === "custom" ? customPhotoPreview : undefined),
          passportPhotoUrl: finalPassportUrl,
          avatarUrl: effectiveAvatar,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to update profile photograph.");
      }

      // If current user is modifying their own avatar, sync immediately
      if (currentUser.employeeId === employee.employeeId) {
        updateCurrentUserAvatar?.(effectiveAvatar);
        refreshSession?.();
      }

      setPhotoMessage({
        type: "success",
        text: `Profile photo updated successfully! Now showing ${
          photoPreference === "passport" ? "Official Passport Photo (Default)" : "Custom Profile Photo"
        }.`,
      });

      onRefresh();

      setTimeout(() => {
        setIsPhotoModalOpen(false);
        setPhotoMessage(null);
      }, 1000);
    } catch (err: any) {
      setPhotoMessage({ type: "error", text: err.message || "Failed to save profile photo preference." });
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const previewComponents = useMemo(() => {
    return calculateSalaryFromMonthly({
      monthlyAmount: salaryBasis === "incentive_only" ? 0 : Number(monthlyAmount) || 0,
      salaryBasis,
      includePf: salaryBasis === "incentive_only" ? false : includePf,
      pfType,
      pfValue: Number(pfValue) || 0,
    });
  }, [monthlyAmount, salaryBasis, includePf, pfType, pfValue]);

  const handleOpenRevisionModal = () => {
    const isCurrentlyIncentive =
      Boolean(employee.currentSalary.isIncentiveOnly) ||
      (employee.currentSalary.annualCtc === 0 && employee.currentSalary.grossSalary === 0);

    if (isCurrentlyIncentive) {
      setSalaryBasis("incentive_only");
      setMonthlyAmount(0);
      setIncludePf(false);
    } else {
      setSalaryBasis("monthly_net");
      setMonthlyAmount(
        employee.currentSalary.netSalary ||
          Math.max(0, employee.currentSalary.grossSalary - (employee.currentSalary.employeePf || 0))
      );
      setIncludePf(
        employee.currentSalary.includePf !== undefined
          ? Boolean(employee.currentSalary.includePf)
          : (employee.currentSalary.employeePf ?? 0) > 0
      );
      setPfType(employee.currentSalary.pfType || "percentage");
      setPfValue(
        employee.currentSalary.pfValue !== undefined
          ? employee.currentSalary.pfValue
          : (employee.currentSalary.pfType === "fixed"
              ? (employee.currentSalary.employeePf || 1800)
              : 12)
      );
    }
    setRevisionReason("");
    setIsRevisionModalOpen(true);
  };

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
    if (salaryBasis !== "incentive_only" && (!monthlyAmount || monthlyAmount <= 0)) {
      alert("Please enter a valid monthly salary amount");
      return;
    }
    if (!revisionReason.trim()) {
      alert("Please provide a revision reason or justification");
      return;
    }

    setIsSubmittingRevision(true);
    try {
      const res = await fetch(`/api/employees/${employee.employeeId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          monthlySalary: salaryBasis === "incentive_only" ? 0 : Number(monthlyAmount),
          salaryBasis,
          includePf: salaryBasis === "incentive_only" ? false : includePf,
          pfType,
          pfValue: salaryBasis === "incentive_only" ? 0 : Number(pfValue) || 0,
          newAnnualCtc: salaryBasis === "incentive_only" ? 0 : previewComponents.annualCtc,
          isIncentiveOnly: salaryBasis === "incentive_only",
          revisionReason: revisionReason.trim(),
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
      <div className="glass-panel rounded-2xl sm:rounded-3xl p-4 sm:p-6 lg:p-8 border border-slate-800 relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 sm:gap-6 relative z-10">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-5">
            <div className="relative group shrink-0">
              <img
                src={displayAvatar}
                alt={employee.personal.fullName}
                className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover border-2 border-indigo-500/40 shadow-xl shadow-indigo-500/10"
              />
              {/* Badge: Passport Photo Default vs Custom */}
              {activePreference === "passport" ? (
                <span
                  title="Official KYC Passport Photo (Company Default)"
                  className="absolute -bottom-2 -left-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full border border-emerald-400/50 shadow flex items-center gap-1 backdrop-blur-xs transition-colors cursor-pointer"
                  onClick={canEditPhoto ? handleOpenPhotoModal : undefined}
                >
                  <ShieldCheck className="w-2.5 h-2.5" /> Passport
                </span>
              ) : (
                <span
                  title="Custom Profile Picture"
                  className="absolute -bottom-2 -left-1 bg-indigo-600 hover:bg-indigo-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full border border-indigo-400/50 shadow flex items-center gap-1 backdrop-blur-xs transition-colors cursor-pointer"
                  onClick={canEditPhoto ? handleOpenPhotoModal : undefined}
                >
                  <User className="w-2.5 h-2.5" /> Custom
                </span>
              )}

              {/* Hover Edit Overlay */}
              {canEditPhoto && (
                <button
                  type="button"
                  onClick={handleOpenPhotoModal}
                  title="Customize profile photo"
                  className="absolute inset-0 bg-slate-950/65 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1 text-white text-[10px] font-semibold backdrop-blur-xs cursor-pointer border border-white/20"
                >
                  <Camera className="w-5 h-5 text-indigo-300" />
                  <span>Edit Photo</span>
                </button>
              )}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
                <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight break-words">
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

                {/* System Role Badge / Dropdown */}
                {currentUser.role === "admin" || currentUser.role === "hr" ? (
                  <div className="inline-flex items-center gap-1.5 bg-slate-900 border border-slate-700/80 rounded-lg px-2 py-0.5 shadow-2xs">
                    <ShieldCheck className="w-3 h-3 text-indigo-400" />
                    <span className="text-[10px] text-slate-400 font-medium">Role:</span>
                    <select
                      value={employeeRole}
                      disabled={isUpdatingRole}
                      onChange={(e) => handleRoleChange(e.target.value)}
                      className="bg-transparent text-[11px] font-bold text-indigo-300 focus:outline-none cursor-pointer"
                    >
                      {availableRoles.length > 0 ? (
                        availableRoles.map((r) => (
                          <option key={r.id} value={r.id} className="bg-slate-900 text-white">
                            {r.name}
                          </option>
                        ))
                      ) : (
                        <>
                          <option value="admin" className="bg-slate-900 text-white">Admin</option>
                          <option value="hr" className="bg-slate-900 text-white">HR</option>
                          <option value="employee" className="bg-slate-900 text-white">Employee</option>
                        </>
                      )}
                    </select>
                    {roleMessage && (
                      <span className="text-[10px] text-emerald-400 font-semibold animate-pulse">
                        ✓
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="inline-flex items-center gap-1 font-semibold text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-200 text-[10px]">
                    <ShieldCheck className="w-2.5 h-2.5 text-indigo-500" />
                    Role: {availableRoles.find((r) => r.id === employeeRole)?.name || employeeRole.toUpperCase()}
                  </span>
                )}
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

          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 w-full md:w-auto">
            {canEditPhoto && (
              <Button
                size="sm"
                variant="outline"
                icon={<Camera className="w-4 h-4 text-indigo-400" />}
                onClick={handleOpenPhotoModal}
                className="border-slate-700 hover:border-indigo-500/50 text-slate-300 hover:text-white flex-1 sm:flex-none justify-center"
              >
                {activePreference === "passport" ? "Profile Photo" : "Photo Settings"}
              </Button>
            )}
            {canEditSalary && (
              <Button
                size="sm"
                variant="outline"
                icon={<TrendingUp className="w-4 h-4" />}
                onClick={handleOpenRevisionModal}
                className="flex-1 sm:flex-none justify-center"
              >
                Revise Salary
              </Button>
            )}
            <Link href="/payslips" className="flex-1 sm:flex-none">
              <Button size="sm" icon={<FileText className="w-4 h-4" />} className="w-full justify-center">
                View Payslips
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Navigation Tab Bar */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar border-b border-slate-800 pb-2 -mx-2 px-2 sm:mx-0 sm:px-0">
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
              <div className="pt-2 border-t border-slate-800/80">
                <span className="text-slate-500 block mb-1">Profile Photo Source</span>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-200 font-medium flex items-center gap-1.5 text-xs">
                    {activePreference === "passport" ? (
                      <>
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>Official Passport (Default)</span>
                      </>
                    ) : (
                      <>
                        <User className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                        <span>Custom Profile Picture</span>
                      </>
                    )}
                  </span>
                  {canEditPhoto && (
                    <button
                      type="button"
                      onClick={handleOpenPhotoModal}
                      className="text-[11px] text-indigo-400 hover:text-indigo-300 underline underline-offset-2 font-medium cursor-pointer"
                    >
                      Change
                    </button>
                  )}
                </div>
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
                <span className="text-slate-500 block">Employment Status</span>
                <span className="text-slate-200 font-medium">
                  {employee.employment.employmentStatus === "Probation" ? "Active" : employee.employment.employmentStatus} • Full-time
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
          {/* Active Salary & PF Card (Simplified: Net Salary & PF Only) */}
          <div className="glass-card rounded-2xl p-6 border border-slate-800 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-5 border-b border-slate-800 gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-indigo-400 font-semibold uppercase tracking-wider">
                    Active Salary & Provident Fund
                  </span>
                  <Badge variant={employee.currentSalary.employeePf > 0 ? "indigo" : "warning"}>
                    {employee.currentSalary.employeePf > 0
                      ? employee.currentSalary.pfType === "fixed"
                        ? `PF Enrolled (Fixed ₹${employee.currentSalary.employeePf.toLocaleString("en-IN")})`
                        : `PF Enrolled (${employee.currentSalary.pfValue ?? 12}%)`
                      : "PF Excluded"}
                  </Badge>
                </div>
                <div className="flex items-baseline gap-2 mt-2">
                  <h3 className="text-3xl font-extrabold text-emerald-400 font-mono">
                    ₹{(employee.currentSalary.netSalary || Math.max(0, employee.currentSalary.grossSalary - employee.currentSalary.employeePf)).toLocaleString("en-IN")}
                    <span className="text-xs font-normal text-slate-400 ml-1.5 font-sans">/ month net in-hand</span>
                  </h3>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Take-home amount credited directly to the employee&apos;s bank account.
                </p>
              </div>

              {canEditSalary && (
                <Button
                  size="sm"
                  variant="primary"
                  icon={<TrendingUp className="w-4 h-4" />}
                  onClick={handleOpenRevisionModal}
                >
                  Revise Salary & PF
                </Button>
              )}
            </div>

            {/* Clean stats: Net Salary, PF, and Gross */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
                <span className="text-slate-400 block font-medium">Net Take-Home Salary</span>
                {employee.currentSalary.isIncentiveOnly || (employee.currentSalary.annualCtc === 0 && employee.currentSalary.grossSalary === 0) ? (
                  <>
                    <p className="text-lg font-bold text-amber-400 flex items-center gap-1.5 mt-0.5">
                      <Award className="w-5 h-5 text-amber-400 shrink-0" />
                      Incentive Only
                    </p>
                    <span className="text-[10px] text-slate-400 block">100% Commission Based</span>
                  </>
                ) : (
                  <>
                    <p className="text-xl font-bold text-emerald-400 font-mono">
                      ₹{(employee.currentSalary.netSalary || Math.max(0, employee.currentSalary.grossSalary - employee.currentSalary.employeePf)).toLocaleString("en-IN")}
                      <span className="text-xs font-normal text-slate-400 ml-1 font-sans">/mo</span>
                    </p>
                    <span className="text-[10px] text-slate-500 block">Credited to bank account</span>
                  </>
                )}
              </div>

              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
                <span className="text-slate-400 block font-medium">Provident Fund (PF)</span>
                {employee.currentSalary.isIncentiveOnly || (employee.currentSalary.annualCtc === 0 && employee.currentSalary.grossSalary === 0) ? (
                  <>
                    <p className="text-xl font-bold font-mono text-slate-400">Exempted</p>
                    <span className="text-[10px] text-slate-500 block">No statutory deductions</span>
                  </>
                ) : (
                  <>
                    <p className={`text-xl font-bold font-mono ${employee.currentSalary.employeePf > 0 ? "text-indigo-300" : "text-slate-400"}`}>
                      {employee.currentSalary.employeePf > 0
                        ? `₹${employee.currentSalary.employeePf.toLocaleString("en-IN")}`
                        : "₹0"}
                      <span className="text-xs font-normal text-slate-400 ml-1 font-sans">
                        {employee.currentSalary.employeePf > 0
                          ? employee.currentSalary.pfType === "fixed"
                            ? "(Fixed)"
                            : `(${employee.currentSalary.pfValue ?? 12}%)`
                          : "(Excluded)"}
                      </span>
                    </p>
                    <span className="text-[10px] text-slate-500 block">
                      {employee.currentSalary.employeePf > 0
                        ? `Employer: +₹${employee.currentSalary.employerPf.toLocaleString("en-IN")}`
                        : "No statutory deductions"}
                    </span>
                  </>
                )}
              </div>

              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
                <span className="text-slate-400 block font-medium">Monthly Gross Pay</span>
                {employee.currentSalary.isIncentiveOnly || (employee.currentSalary.annualCtc === 0 && employee.currentSalary.grossSalary === 0) ? (
                  <>
                    <p className="text-xl font-bold text-white font-mono">
                      ₹0 Base
                    </p>
                    <span className="text-[10px] text-amber-400/90 block">
                      Earnings via Approved Incentives
                    </span>
                  </>
                ) : (
                  <>
                    <p className="text-xl font-bold text-white font-mono">
                      ₹{employee.currentSalary.grossSalary.toLocaleString("en-IN")}
                      <span className="text-xs font-normal text-slate-400 ml-1 font-sans">/mo</span>
                    </p>
                    <span className="text-[10px] text-slate-500 block">
                      Annual CTC: ₹{employee.currentSalary.annualCtc.toLocaleString("en-IN")}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Versioned Salary History Table */}
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

            <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
              <table className="w-full text-left text-xs min-w-[720px]">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="pb-3 font-medium">Effective Date</th>
                    <th className="pb-3 font-medium">Net Take-Home</th>
                    <th className="pb-3 font-medium">Provident Fund (PF)</th>
                    <th className="pb-3 font-medium">Monthly Gross</th>
                    <th className="pb-3 font-medium">Annual CTC</th>
                    <th className="pb-3 font-medium">Revision Reason</th>
                    <th className="pb-3 font-medium">Authorized By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {employee.salaryHistory.map((rev) => {
                    const isIncentive =
                      rev.isIncentiveOnly ||
                      rev.salaryBasis === "incentive_only" ||
                      rev.annualCtc === 0;
                    const hasPf = (rev.components?.employeePf ?? 0) > 0;
                    const netEst =
                      rev.netSalary ||
                      Math.max(
                        0,
                        (rev.components?.grossSalary ?? 0) - (rev.components?.employeePf ?? 0)
                      );
                    const pfBadgeLabel = isIncentive
                      ? "Exempt"
                      : hasPf
                      ? rev.pfType === "fixed"
                        ? `Fixed ₹${(rev.components?.employeePf ?? 0).toLocaleString("en-IN")}`
                        : `${rev.pfValue ?? 12}% (₹${(rev.components?.employeePf ?? 0).toLocaleString("en-IN")})`
                      : "No PF";
                    return (
                      <tr key={rev.id} className="hover:bg-slate-800/20">
                        <td className="py-3 font-mono text-slate-300">{rev.effectiveFrom}</td>
                        <td className="py-3 text-emerald-400 font-bold font-mono">
                          {isIncentive ? (
                            <span className="text-amber-400 font-semibold text-[11px] bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
                              ⚡ Incentive Only
                            </span>
                          ) : (
                            `₹${netEst.toLocaleString("en-IN")}`
                          )}
                        </td>
                        <td className="py-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                              isIncentive
                                ? "bg-slate-800 text-slate-400 border border-slate-700"
                                : hasPf
                                ? "bg-indigo-500/10 text-indigo-300 border border-indigo-500/30"
                                : "bg-slate-800 text-slate-400 border border-slate-700"
                            }`}
                          >
                            {pfBadgeLabel}
                          </span>
                        </td>
                        <td className="py-3 font-semibold text-white font-mono">
                          {isIncentive
                            ? "₹0 Base"
                            : `₹${(rev.components?.grossSalary ?? Math.round(rev.annualCtc / 12)).toLocaleString("en-IN")}`}
                        </td>
                        <td className="py-3 text-slate-300 font-mono">
                          {isIncentive ? "Variable" : `₹${rev.annualCtc.toLocaleString("en-IN")}`}
                        </td>
                        <td className="py-3 text-indigo-300 font-medium">{rev.revisionReason}</td>
                        <td className="py-3 text-slate-400">{rev.updatedBy}</td>
                      </tr>
                    );
                  })}
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

          <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
            <table className="w-full text-left text-xs min-w-[620px]">
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
                      <td className="py-3 font-mono text-slate-300 font-medium">{a.checkIn ? `${formatISTTime12(a.checkIn)} IST` : "—"}</td>
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
            <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
              <table className="w-full text-left text-xs min-w-[640px]">
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

          {documents.length === 0 && !resolvedPassportPhoto ? (
            <div className="py-12 text-center text-slate-500 text-xs">
              <FileText className="w-8 h-8 mx-auto mb-2 text-slate-600" />
              <p>No documents uploaded yet for this employee.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Highlight Official Passport Photograph if on file and not in documents list */}
              {resolvedPassportPhoto &&
                !documents.some(
                  (d) =>
                    d.documentType === "photograph" ||
                    d.title?.toLowerCase().includes("passport")
                ) && (
                  <div className="p-4 rounded-xl bg-slate-900/80 border border-emerald-500/30 flex items-start justify-between text-xs hover:border-emerald-500/50 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-14 rounded-lg overflow-hidden border border-slate-700 shrink-0">
                        <img
                          src={resolvedPassportPhoto}
                          alt="Passport Photo"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-white">Passport Photograph</span>
                          <Badge variant="success">Verified</Badge>
                          <Badge variant="indigo">Default Profile Photo</Badge>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1">Type: photograph</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">Official KYC Identification Document</p>
                      </div>
                    </div>
                    {canEditPhoto && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleOpenPhotoModal}
                        className="text-xs py-1 px-2.5 border-slate-700"
                      >
                        Photo Settings
                      </Button>
                    )}
                  </div>
                )}

              {documents.map((d) => {
                const isPhotoDoc =
                  d.documentType === "photograph" ||
                  d.title?.toLowerCase().includes("passport") ||
                  d.title?.toLowerCase().includes("photo");
                return (
                  <div
                    key={d.id}
                    className={`p-4 rounded-xl bg-slate-900/80 border flex items-start justify-between text-xs transition-colors ${
                      isPhotoDoc ? "border-emerald-500/30 hover:border-emerald-500/50" : "border-slate-800 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {isPhotoDoc && d.fileUrl && (
                        <div className="w-12 h-14 rounded-lg overflow-hidden border border-slate-700 shrink-0">
                          <img src={d.fileUrl} alt={d.title} className="w-full h-full object-cover" />
                        </div>
                      )}
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-white">{d.title}</span>
                          <Badge variant={d.status === "Verified" ? "success" : "warning"}>{d.status}</Badge>
                          {isPhotoDoc && <Badge variant="indigo">Default Profile Photo</Badge>}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1">Type: {d.documentType}</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          Uploaded on {d.uploadDate} by {d.uploadedBy}
                        </p>
                        {d.expiryDate && (
                          <div className="mt-2 flex items-center gap-1.5 text-rose-400 font-medium">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            Expires: {d.expiryDate} (Renewal required)
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isPhotoDoc && canEditPhoto && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleOpenPhotoModal}
                          className="text-xs py-1 px-2 border-slate-700"
                        >
                          Change
                        </Button>
                      )}
                      {d.fileUrl && (
                        <a
                          href={d.fileUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center text-xs text-indigo-400 hover:text-indigo-300 py-1 px-2 border border-slate-700 rounded-lg hover:border-slate-600 transition-colors"
                        >
                          View
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
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
                  <option value="Active">Active</option>
                  <option value="Confirmed">Confirmed</option>
                  <option value="On Notice">On Notice</option>
                  <option value="Resigned">Resigned</option>
                  <option value="Terminated">Terminated</option>
                  <option value="Exited">Exited</option>
                </select>
              </div>
            )}
          </div>

          {/* Lifecycle Progress Pipeline */}
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
            <div className="text-xs font-semibold text-slate-300">Lifecycle Pipeline</div>
            <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-1 text-[11px] text-center font-medium">
              {[
                "Candidate",
                "Offer Sent",
                "Offer Accepted",
                "Onboarding",
                "Active",
                "Confirmed",
                "On Notice",
                "Resigned",
                "Terminated",
                "Exited",
              ].map((stage, idx) => {
                const currentStatus = employee.employment.employmentStatus === "Probation" ? "Active" : employee.employment.employmentStatus;
                const isCurrent = currentStatus === stage;
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
              <p className="font-semibold text-white">Full-Time Status Confirmed</p>
              <p className="text-slate-400 mt-0.5">
                Effective: {employee.employment.dateOfJoining} (Permanent Full-time)
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
        subtitle="Update salary on a monthly basis with optional PF enrollment. Every revision creates an immutable audit trail."
        maxWidth="lg"
      >
        <form onSubmit={handleSalaryRevisionSubmit} className="space-y-4">
          {/* Current Salary Snapshot */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-slate-900/60 rounded-xl border border-slate-800">
            <div>
              <span className="text-[10px] uppercase font-semibold text-slate-400 block">Current Gross</span>
              <span className="text-sm font-bold text-white font-mono">
                ₹{employee.currentSalary.grossSalary.toLocaleString("en-IN")}/mo
              </span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-semibold text-slate-400 block">Current Annual CTC</span>
              <span className="text-sm font-bold text-slate-300 font-mono">
                ₹{employee.currentSalary.annualCtc.toLocaleString("en-IN")}
              </span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-semibold text-slate-400 block">Current PF Status</span>
              <span className={`text-xs font-semibold ${employee.currentSalary.employeePf > 0 ? "text-indigo-400" : "text-amber-400"}`}>
                {employee.currentSalary.employeePf > 0 ? `PF Enrolled (₹${employee.currentSalary.employeePf})` : "PF Excluded"}
              </span>
            </div>
          </div>

          {/* Basis Selector Pills */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Salary Input Mode
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setSalaryBasis("monthly_net")}
                className={`px-3 py-2 rounded-lg text-xs font-medium border text-left transition-all cursor-pointer ${
                  salaryBasis === "monthly_net"
                    ? "bg-emerald-600/20 border-emerald-500 text-white shadow-xs"
                    : "bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-slate-200"
                }`}
              >
                <div className="font-semibold text-emerald-400">Net Salary (In-Hand)</div>
                <div className="text-[10px] opacity-75">Take-home pay credited to bank</div>
              </button>
              <button
                type="button"
                onClick={() => setSalaryBasis("monthly_gross")}
                className={`px-3 py-2 rounded-lg text-xs font-medium border text-left transition-all cursor-pointer ${
                  salaryBasis === "monthly_gross"
                    ? "bg-indigo-600/20 border-indigo-500 text-white shadow-xs"
                    : "bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-slate-200"
                }`}
              >
                <div className="font-semibold text-indigo-300">Monthly Gross Salary</div>
                <div className="text-[10px] opacity-75">Pay before PF deductions</div>
              </button>
              <button
                type="button"
                onClick={() => {
                  setSalaryBasis("incentive_only");
                  setMonthlyAmount(0);
                  setIncludePf(false);
                }}
                className={`px-3 py-2 rounded-lg text-xs font-medium border text-left transition-all cursor-pointer ${
                  salaryBasis === "incentive_only"
                    ? "bg-amber-600/25 border-amber-500 text-white shadow-xs ring-1 ring-amber-500/50"
                    : "bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-slate-200"
                }`}
              >
                <div className="font-semibold text-amber-400 flex items-center gap-1">
                  <Award className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>Incentive Only</span>
                </div>
                <div className="text-[10px] opacity-75">₹0 Base • 100% Commission</div>
              </button>
            </div>
          </div>

          {salaryBasis === "incentive_only" ? (
            /* Dedicated Incentive-Only Banner */
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2.5 animate-fadeIn">
              <div className="flex items-center gap-2 text-amber-400 font-semibold text-xs">
                <Award className="w-4 h-4 shrink-0 text-amber-400" />
                <span>100% Incentive & Commission-Only Compensation</span>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                This employee works on a <strong>pure incentive / commission model</strong> with <strong>₹0 fixed base salary</strong> and <strong>₹0 Annual CTC</strong>. Monthly take-home earnings are dynamically generated from approved performance incentives (e.g. sales targets, loan disbursals) submitted under the <em>Incentives tab</em> and compiled automatically during monthly payroll.
              </p>
              <div className="flex items-center gap-2 pt-1 text-[10px] text-amber-300/90 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0"></span>
                Statutory Provident Fund (PF) is automatically exempted (₹0) with no monthly deductions.
              </div>
            </div>
          ) : (
            <>
              {/* Monthly Amount Input */}
              <div>
                <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-slate-300">
                New {salaryBasis === "monthly_net" ? "Monthly Net Salary (In-Hand)" : "Monthly Gross Salary"} (₹ INR) *
              </label>
              <span className="text-[11px] text-slate-400 font-mono">
                Annual CTC: ₹{previewComponents.annualCtc.toLocaleString("en-IN")}
              </span>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-slate-400 font-mono text-sm">₹</span>
              <input
                type="number"
                step="1"
                min="0"
                required
                value={monthlyAmount === 0 ? "" : monthlyAmount}
                onChange={(e) => {
                  const val = e.target.value;
                  setMonthlyAmount(val === "" ? 0 : Number(val));
                }}
                placeholder={salaryBasis === "monthly_net" ? "e.g. 30000" : "e.g. 35000"}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-8 pr-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>
            {/* Quick adjust helper pills */}
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              <span className="text-[10px] text-slate-400 mr-1">Quick adjust:</span>
              {[-500, -100, +100, +500, +1000].map((adj) => (
                <button
                  key={adj}
                  type="button"
                  onClick={() => setMonthlyAmount((prev) => Math.max(0, (Number(prev) || 0) + adj))}
                  className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors cursor-pointer"
                >
                  {adj > 0 ? `+₹${adj}` : `-₹${Math.abs(adj)}`}
                </button>
              ))}
            </div>
          </div>

          {/* Include PF Card with % or Fixed Number Selector */}
          <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-700/80 space-y-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includePf}
                  onChange={(e) => setIncludePf(e.target.checked)}
                  className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-slate-800 border-slate-600 cursor-pointer"
                />
                <span className="font-semibold text-white text-xs">Include Provident Fund (PF)</span>
              </label>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                  includePf
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                    : "bg-slate-800 text-slate-400 border border-slate-700"
                }`}
              >
                {includePf
                  ? pfType === "percentage"
                    ? `${pfValue}% of Basic (₹${previewComponents.employeePf.toLocaleString("en-IN")}/mo)`
                    : `₹${previewComponents.employeePf.toLocaleString("en-IN")}/mo Fixed`
                  : "PF Excluded (₹0)"}
              </span>
            </div>

            {includePf && (
              <div className="pt-2.5 border-t border-slate-800 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400 font-medium">PF Calculation Basis:</span>
                  <div className="inline-flex rounded-lg bg-slate-800 p-0.5 border border-slate-700">
                    <button
                      type="button"
                      onClick={() => {
                        setPfType("percentage");
                        if (pfType !== "percentage") setPfValue(12);
                      }}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all cursor-pointer ${
                        pfType === "percentage"
                          ? "bg-indigo-600 text-white shadow-xs"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      % Percentage
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPfType("fixed");
                        if (pfType !== "fixed") setPfValue(1800);
                      }}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all cursor-pointer ${
                        pfType === "fixed"
                          ? "bg-indigo-600 text-white shadow-xs"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      ₹ Number (Fixed Amount)
                    </button>
                  </div>
                </div>

                {pfType === "percentage" ? (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[11px] text-slate-300 font-medium">
                        Percentage of Basic Salary (%)
                      </label>
                      <button
                        type="button"
                        onClick={() => setPfValue(12)}
                        className="px-2 py-0.5 rounded text-[10px] bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-slate-700 cursor-pointer transition-colors"
                      >
                        Default: 12%
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        value={pfValue || ""}
                        onChange={(e) => setPfValue(Number(e.target.value))}
                        placeholder="12"
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-3 pr-8 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                      />
                      <span className="absolute right-3 top-2 text-slate-400 font-mono text-xs">%</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1.5">
                      Calculates <strong className="text-white">{pfValue}%</strong> of Basic ={" "}
                      <span className="text-emerald-400 font-mono font-bold">₹{previewComponents.employeePf.toLocaleString("en-IN")}/mo</span>
                      {" "}(employee deduction & matching employer contribution).
                    </p>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[11px] text-slate-300 font-medium">
                        Fixed Monthly PF Amount (₹ Number)
                      </label>
                      <button
                        type="button"
                        onClick={() => setPfValue(1800)}
                        className="px-2 py-0.5 rounded text-[10px] bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-slate-700 cursor-pointer transition-colors"
                      >
                        Statutory Cap: ₹1,800
                      </button>
                    </div>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-slate-400 font-mono text-xs">₹</span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={pfValue === 0 ? "" : pfValue}
                        onChange={(e) => {
                          const val = e.target.value;
                          setPfValue(val === "" ? 0 : Number(val));
                        }}
                        placeholder="1800"
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-7 pr-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1.5">
                      Flat monthly deduction of{" "}
                      <span className="text-emerald-400 font-mono font-bold">₹{previewComponents.employeePf.toLocaleString("en-IN")}/mo</span>
                      {" "}from employee with equal matching employer contribution.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

          {/* Live Preview Card (Clean: Net Salary & PF) */}
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/10 p-3.5 space-y-3 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <span className="text-[10px] uppercase font-semibold text-slate-400 block">
                  Net Salary (In-Hand)
                </span>
                <span className="text-lg font-extrabold text-emerald-400 font-mono">
                  {salaryBasis === "incentive_only" ? (
                    <span className="text-amber-400 text-base flex items-center gap-1.5">
                      <Award className="w-4 h-4 text-amber-400 shrink-0" />
                      Incentive Only
                    </span>
                  ) : (
                    `₹${(previewComponents.netSalary || Math.max(0, previewComponents.grossSalary - previewComponents.employeePf)).toLocaleString("en-IN")}/mo`
                  )}
                </span>
                <span className="text-[10px] text-slate-500 block">
                  {salaryBasis === "incentive_only" ? "Variable monthly payout" : "Bank credit"}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] uppercase font-semibold text-slate-400 block">
                  Provident Fund (PF)
                </span>
                <span className={`text-base font-bold font-mono ${previewComponents.employeePf > 0 ? "text-indigo-300" : "text-slate-400"}`}>
                  {salaryBasis === "incentive_only"
                    ? "Exempted"
                    : previewComponents.employeePf > 0
                    ? `₹${previewComponents.employeePf.toLocaleString("en-IN")}/mo`
                    : "₹0"}
                </span>
                <span className="text-[10px] text-slate-500 block">
                  {salaryBasis === "incentive_only"
                    ? "No deductions"
                    : previewComponents.employeePf > 0
                    ? `Employer: +₹${previewComponents.employerPf.toLocaleString("en-IN")}`
                    : "Excluded"}
                </span>
              </div>
            </div>

            <div className="pt-2.5 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px] text-slate-400">
              <span>
                Monthly Gross:{" "}
                <strong className="text-white font-mono">
                  {salaryBasis === "incentive_only" ? "₹0 Base Pay" : `₹${previewComponents.grossSalary.toLocaleString("en-IN")}`}
                </strong>
              </span>
              <span>
                Annual CTC:{" "}
                <strong className="text-slate-300 font-mono">
                  {salaryBasis === "incentive_only" ? "Pure Variable / Commission" : `₹${previewComponents.annualCtc.toLocaleString("en-IN")}`}
                </strong>
              </span>
            </div>
          </div>

          {/* Revision Reason with Quick Tags */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-slate-300">
                Revision Reason / Justification *
              </label>
            </div>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {[
                "Incentive-Only (Commission Based)",
                "Sales Commission Agreement",
                "Annual Appraisal 2026",
                "Performance Appraisal",
                "Promotion Increment",
                "Market Salary Correction",
              ].map((tag) => (
                <button
                  type="button"
                  key={tag}
                  onClick={() => setRevisionReason(tag)}
                  className="px-2 py-0.5 rounded text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 cursor-pointer transition-colors"
                >
                  {tag}
                </button>
              ))}
            </div>
            <input
              type="text"
              required
              value={revisionReason}
              onChange={(e) => setRevisionReason(e.target.value)}
              placeholder="e.g. Annual Appraisal 2026 / Promotion"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-end gap-2 pt-4 border-t border-slate-800">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsRevisionModalOpen(false)}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" isLoading={isSubmittingRevision} className="w-full sm:w-auto">
              Save Salary Revision
            </Button>
          </div>
        </form>
      </Modal>

      {/* PROFILE PHOTO SETTINGS MODAL */}
      <Modal
        isOpen={isPhotoModalOpen}
        onClose={() => {
          if (!isUploadingPhoto) {
            setIsPhotoModalOpen(false);
            setPhotoMessage(null);
          }
        }}
        title="Profile Photo & Avatar Settings"
      >
        <div className="space-y-5">
          {/* Company Policy Banner */}
          <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-200 flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-white">Default Company Policy</p>
              <p className="text-blue-200/90 leading-relaxed text-[11px]">
                By default, your profile displays your <strong>official passport size photograph</strong> submitted during KYC verification. You can choose to keep your official passport photo or switch to a custom profile picture anytime.
              </p>
            </div>
          </div>

          {/* Feedback message */}
          {photoMessage && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                photoMessage.type === "success"
                  ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
                  : "bg-rose-500/15 border-rose-500/30 text-rose-300"
              }`}
            >
              {photoMessage.type === "success" ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              )}
              <span>{photoMessage.text}</span>
            </div>
          )}

          {/* Dual Selection Options */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* OPTION 1: Official Passport Photo (Company Default) */}
            <div
              onClick={() => setPhotoPreference("passport")}
              className={`cursor-pointer rounded-2xl p-4 border transition-all relative flex flex-col justify-between ${
                photoPreference === "passport"
                  ? "border-emerald-500 bg-emerald-950/20 ring-2 ring-emerald-500/30"
                  : "border-slate-800 bg-slate-900/40 hover:border-slate-700"
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="avatarPreference"
                      id="pref-passport"
                      checked={photoPreference === "passport"}
                      onChange={() => setPhotoPreference("passport")}
                      className="text-emerald-500 focus:ring-emerald-500 cursor-pointer"
                    />
                    <label
                      htmlFor="pref-passport"
                      className="text-xs font-bold text-white cursor-pointer flex items-center gap-1.5"
                    >
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                      Official Passport Photo
                    </label>
                  </div>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Default
                  </span>
                </div>

                <div className="flex items-center gap-3.5 my-3">
                  <div className="w-16 h-20 rounded-lg overflow-hidden border border-slate-700 bg-slate-800 shrink-0 shadow">
                    {resolvedPassportPhoto ? (
                      <img
                        src={resolvedPassportPhoto}
                        alt="Official Passport"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 text-[10px] p-1 text-center">
                        <ImageIcon className="w-5 h-5 mb-1 text-slate-500" />
                        No photo
                      </div>
                    )}
                  </div>
                  <div className="text-[11px] space-y-1">
                    <p className="text-slate-300 font-medium">KYC Verified Document</p>
                    <p className="text-slate-400 text-[10px] leading-relaxed">
                      {resolvedPassportPhoto
                        ? "Verified from onboarding KYC documentation. Used as official ID by default."
                        : "No passport photograph on file yet. You can upload one below."}
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800/80 text-[10px] text-slate-400 flex items-center justify-between">
                <span>Status:</span>
                <span className="text-emerald-400 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  {resolvedPassportPhoto ? "Verified on file" : "Standard Default"}
                </span>
              </div>
            </div>

            {/* OPTION 2: Custom Profile Photo */}
            <div
              onClick={() => setPhotoPreference("custom")}
              className={`cursor-pointer rounded-2xl p-4 border transition-all relative flex flex-col justify-between ${
                photoPreference === "custom"
                  ? "border-indigo-500 bg-indigo-950/20 ring-2 ring-indigo-500/30"
                  : "border-slate-800 bg-slate-900/40 hover:border-slate-700"
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="avatarPreference"
                      id="pref-custom"
                      checked={photoPreference === "custom"}
                      onChange={() => setPhotoPreference("custom")}
                      className="text-indigo-500 focus:ring-indigo-500 cursor-pointer"
                    />
                    <label
                      htmlFor="pref-custom"
                      className="text-xs font-bold text-white cursor-pointer flex items-center gap-1.5"
                    >
                      <User className="w-3.5 h-3.5 text-indigo-400" />
                      Custom Profile Photo
                    </label>
                  </div>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    Employee Choice
                  </span>
                </div>

                <div className="flex items-center gap-3.5 my-3">
                  <div className="w-16 h-20 rounded-lg overflow-hidden border border-slate-700 bg-slate-800 shrink-0 shadow">
                    {customPhotoPreview ? (
                      <img
                        src={customPhotoPreview}
                        alt="Custom Avatar Preview"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 text-[10px] p-1 text-center">
                        <User className="w-6 h-6 mb-1 text-slate-400" />
                        Not set
                      </div>
                    )}
                  </div>
                  <div className="text-[11px] space-y-1">
                    <p className="text-slate-300 font-medium">Personal Avatar</p>
                    <p className="text-slate-400 text-[10px] leading-relaxed">
                      Upload your preferred portrait or friendly workplace picture.
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800/80 text-[10px] text-slate-400 flex items-center justify-between">
                <span>Custom Avatar:</span>
                <span className={customPhotoPreview ? "text-indigo-400 font-semibold" : "text-slate-500"}>
                  {customPhotoPreview ? "Ready to use" : "Upload below"}
                </span>
              </div>
            </div>
          </div>

          {/* Upload Dropzone if Custom is Selected */}
          {photoPreference === "custom" && (
            <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
              <label className="block text-xs font-medium text-slate-200">
                Upload New Custom Profile Picture (JPG, PNG, WEBP — Max 2MB)
              </label>

              <div className="flex flex-col sm:flex-row items-center gap-3">
                <input
                  type="file"
                  id="custom-photo-upload"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleCustomPhotoFileChange}
                  className="hidden"
                />
                <label
                  htmlFor="custom-photo-upload"
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors shadow"
                >
                  <UploadCloud className="w-4 h-4" />
                  {customPhotoPreview ? "Change Photo File" : "Choose Image File"}
                </label>

                {customPhotoFile && (
                  <span className="text-xs text-slate-300 truncate max-w-xs">
                    📁 {customPhotoFile.name} ({(customPhotoFile.size / 1024).toFixed(0)} KB)
                  </span>
                )}

                {customPhotoPreview && (
                  <button
                    type="button"
                    onClick={() => {
                      setCustomPhotoPreview("");
                      setCustomPhotoUrl("");
                      setCustomPhotoFile(null);
                    }}
                    className="text-xs text-rose-400 hover:text-rose-300 underline underline-offset-2 ml-auto"
                  >
                    Remove custom photo
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Live Preview Header */}
          <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <img
                src={
                  photoPreference === "custom" && customPhotoPreview
                    ? customPhotoPreview
                    : resolvedPassportPhoto || employee.personal.avatarUrl || "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150"
                }
                alt="Active Preview"
                className="w-12 h-12 rounded-xl object-cover border-2 border-indigo-500/40 shadow"
              />
              <div>
                <p className="text-xs font-semibold text-white">Active Avatar Preview</p>
                <p className="text-[11px] text-slate-400">
                  {photoPreference === "passport"
                    ? "Will display Official KYC Passport Photo across HRMS"
                    : "Will display Custom Profile Photo across HRMS"}
                </p>
              </div>
            </div>
            <Badge variant={photoPreference === "passport" ? "success" : "indigo"}>
              {photoPreference === "passport" ? "Default Passport" : "Custom Avatar"}
            </Badge>
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-800">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isUploadingPhoto}
              onClick={() => {
                setIsPhotoModalOpen(false);
                setPhotoMessage(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              isLoading={isUploadingPhoto}
              onClick={handleSavePhotoSettings}
              className="bg-indigo-600 hover:bg-indigo-500"
            >
              Save Profile Photo Preference
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
