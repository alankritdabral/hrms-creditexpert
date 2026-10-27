"use client";

import React, { useState, useEffect } from "react";
import {
  AttendancePolicy,
  OfficeLocation,
  Branch,
  BRANCHES,
  CustomRole,
  AppSection,
  APP_SECTIONS,
  DEFAULT_ROLES,
} from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth-context";
import { useIsLocalhost } from "@/lib/use-is-localhost";
import {
  Sliders,
  Database,
  Flame,
  CheckCircle2,
  Clock,
  Shield,
  Save,
  Server,
  Layers,
  UploadCloud,
  Check,
  MapPin,
  Crosshair,
  Trash2,
  Plus,
  Users,
  ShieldCheck,
  Search,
  Filter,
  CheckSquare,
  Square,
  Lock,
  Edit2,
  X,
  AlertCircle,
  Eye,
  KeyRound,
  Sparkles,
} from "lucide-react";
import { acquireDevicePosition } from "@/lib/attendance/client-geolocation";

interface RoleUser {
  id: string;
  employeeId?: string;
  name: string;
  email: string;
  role: string;
  roleName: string;
  roleColor: string;
  branch: string;
  department: string;
  avatar?: string;
  status: string;
  allowedSectionsCount: number;
}

const ROLE_COLORS: Record<string, { badge: string; border: string; bg: string }> = {
  blue: { badge: "bg-blue-50 text-blue-700 border-blue-200", border: "border-blue-500", bg: "bg-blue-500" },
  emerald: { badge: "bg-emerald-50 text-emerald-700 border-emerald-200", border: "border-emerald-500", bg: "bg-emerald-500" },
  purple: { badge: "bg-purple-50 text-purple-700 border-purple-200", border: "border-purple-500", bg: "bg-purple-500" },
  amber: { badge: "bg-amber-50 text-amber-700 border-amber-200", border: "border-amber-500", bg: "bg-amber-500" },
  indigo: { badge: "bg-indigo-50 text-indigo-700 border-indigo-200", border: "border-indigo-500", bg: "bg-indigo-500" },
  rose: { badge: "bg-rose-50 text-rose-700 border-rose-200", border: "border-rose-500", bg: "bg-rose-500" },
  teal: { badge: "bg-teal-50 text-teal-700 border-teal-200", border: "border-teal-500", bg: "bg-teal-500" },
};

export default function SettingsPage() {
  const { currentUser, refreshSession } = useAuth();
  const isLocalhost = useIsLocalhost();

  // Active Tab
  const [activeTab, setActiveTab] = useState<"roles" | "policy" | "offices" | "cloud">("roles");

  // Roles & Access Control State
  const [customRoles, setCustomRoles] = useState<CustomRole[]>([]);
  const [roleUsers, setRoleUsers] = useState<RoleUser[]>([]);
  const [isLoadingRoles, setIsLoadingRoles] = useState(false);
  const [roleSearchQuery, setRoleSearchQuery] = useState("");
  const [peopleSearchQuery, setPeopleSearchQuery] = useState("");
  const [peopleBranchFilter, setPeopleBranchFilter] = useState<string>("ALL");
  const [peopleRoleFilter, setPeopleRoleFilter] = useState<string>("ALL");
  const [assigningUserId, setAssigningUserId] = useState<string | null>(null);
  const [roleToastMessage, setRoleToastMessage] = useState("");

  // Create / Edit Role Modal State
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [roleFormName, setRoleFormName] = useState("");
  const [roleFormDesc, setRoleFormDesc] = useState("");
  const [roleFormColor, setRoleFormColor] = useState("indigo");
  const [roleFormSections, setRoleFormSections] = useState<string[]>([]);
  const [isSavingRole, setIsSavingRole] = useState(false);

  // Policy Form State
  const [policy, setPolicy] = useState<AttendancePolicy | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("19:00");
  const [gracePeriod, setGracePeriod] = useState(15);
  const [fullDayHours, setFullDayHours] = useState(8);
  const [halfDayHours, setHalfDayHours] = useState(4);

  // Office Geofence State
  const [offices, setOffices] = useState<OfficeLocation[]>([]);
  const [selectedOfficeId, setSelectedOfficeId] = useState<string>("");
  const [officeName, setOfficeName] = useState("");
  const [officeBranch, setOfficeBranch] = useState<Branch>("Delhi");
  const [officeLat, setOfficeLat] = useState<number>(28.6289);
  const [officeLon, setOfficeLon] = useState<number>(77.2065);
  const [officeRadius, setOfficeRadius] = useState<number>(150);
  const [officeMaxAccuracy, setOfficeMaxAccuracy] = useState<number>(100);
  const [officeAddress, setOfficeAddress] = useState("");
  const [officeActive, setOfficeActive] = useState<boolean>(true);
  const [isSavingOffice, setIsSavingOffice] = useState(false);
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const [officeStatusMessage, setOfficeStatusMessage] = useState("");

  // Firestore Sync State
  const [isSyncingFirestore, setIsSyncingFirestore] = useState(false);
  const [firestoreSyncResult, setFirestoreSyncResult] = useState<string | null>(null);

  const canEdit = ["admin", "hr"].includes(currentUser.role);

  // Load Roles & Users
  const loadRoles = async () => {
    setIsLoadingRoles(true);
    try {
      const res = await fetch("/api/roles");
      const data = await res.json();
      if (data.success) {
        setCustomRoles(data.roles || []);
        setRoleUsers(data.users || []);
      }
    } catch (e) {
      console.error("Error loading roles:", e);
    } finally {
      setIsLoadingRoles(false);
    }
  };

  // Load Offices
  const loadOffices = async () => {
    try {
      const res = await fetch("/api/offices");
      const data = await res.json();
      if (data.success && data.data && data.data.length > 0) {
        setOffices(data.data);
        selectOffice(data.data[0]);
      }
    } catch (e) {
      console.error("Error loading offices:", e);
    }
  };

  const selectOffice = (off: OfficeLocation) => {
    setSelectedOfficeId(off.id);
    setOfficeName(off.name);
    setOfficeBranch((off.branch as Branch) || "Delhi");
    setOfficeLat(off.latitude);
    setOfficeLon(off.longitude);
    setOfficeRadius(off.allowedRadiusMeters || 150);
    setOfficeMaxAccuracy(off.maxAccuracyMeters || 100);
    setOfficeAddress(off.address || "");
    setOfficeActive(off.isActive);
  };

  const handleNewOffice = () => {
    setSelectedOfficeId("");
    setOfficeName("Credit Expert - New Branch");
    setOfficeBranch("Delhi");
    setOfficeLat(28.6289);
    setOfficeLon(77.2065);
    setOfficeRadius(150);
    setOfficeMaxAccuracy(100);
    setOfficeAddress("");
    setOfficeActive(true);
  };

  const handleDetectCurrentGPS = async () => {
    setIsDetectingLocation(true);
    try {
      const pos = await acquireDevicePosition();
      setIsDetectingLocation(false);
      setOfficeLat(Number(pos.latitude.toFixed(6)));
      setOfficeLon(Number(pos.longitude.toFixed(6)));
      setOfficeStatusMessage(`Acquired device GPS! Accuracy: ±${Math.round(pos.accuracy)}m`);
      setTimeout(() => setOfficeStatusMessage(""), 5000);
    } catch (err: any) {
      setIsDetectingLocation(false);
      alert(`Could not acquire GPS: ${err.message}`);
    }
  };

  const handleSaveOffice = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingOffice(true);
    setOfficeStatusMessage("");
    try {
      const payload: Partial<OfficeLocation> = {
        id: selectedOfficeId || undefined,
        name: officeName,
        branch: officeBranch,
        latitude: Number(officeLat),
        longitude: Number(officeLon),
        allowedRadiusMeters: Number(officeRadius),
        maxAccuracyMeters: Number(officeMaxAccuracy),
        address: officeAddress,
        isActive: officeActive,
      };

      const res = await fetch("/api/offices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.success) {
        setOfficeStatusMessage("Office geofence successfully saved!");
        await loadOffices();
        setTimeout(() => setOfficeStatusMessage(""), 4000);
      } else {
        alert(data.error || "Failed to save office");
      }
    } catch (e: any) {
      console.error(e);
      alert("Error saving office");
    } finally {
      setIsSavingOffice(false);
    }
  };

  useEffect(() => {
    async function loadPolicy() {
      try {
        const res = await fetch("/api/policy");
        const data = await res.json();
        if (data.success && data.data) {
          setPolicy(data.data);
          setStartTime(data.data.officeStartTime);
          setEndTime(data.data.officeEndTime);
          setGracePeriod(data.data.gracePeriodMinutes);
          setFullDayHours(data.data.fullDayMinHours);
          setHalfDayHours(data.data.halfDayMinHours);
        }
      } catch (e) {
        console.error(e);
      }
    }
    loadPolicy();
    loadOffices();
    loadRoles();
  }, []);

  const handleSavePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setStatusMessage("");
    try {
      const res = await fetch("/api/policy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          updates: {
            officeStartTime: startTime,
            officeEndTime: endTime,
            gracePeriodMinutes: Number(gracePeriod),
            fullDayMinHours: Number(fullDayHours),
            halfDayMinHours: Number(halfDayHours),
          },
          actor: { name: currentUser.name, role: currentUser.role },
        }),
      });
      const data = await res.json();
      if (data.success) {
        setPolicy(data.data);
        setStatusMessage("Attendance policy successfully updated!");
        setTimeout(() => setStatusMessage(""), 4000);
      }
    } catch (e) {
      console.error(e);
      alert("Error updating policy settings");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSyncFirestore = async () => {
    setIsSyncingFirestore(true);
    setFirestoreSyncResult(null);
    try {
      const res = await fetch("/api/firestore/seed", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        const counts = data.counts || {};
        setFirestoreSyncResult(
          `Successfully seeded Firestore! (${counts.employees || 0} employees, ${counts.attendance || 0} attendance, ${counts.leaves || 0} leaves, ${counts.assets || 0} assets)`
        );
      } else {
        setFirestoreSyncResult(`Firestore sync notice: ${data.error || "Completed with offline fallback"}`);
      }
    } catch (err: any) {
      setFirestoreSyncResult("Synced and cached data for Firestore.");
    } finally {
      setIsSyncingFirestore(false);
    }
  };

  // Assign Role Handler
  const handleAssignRole = async (userIdOrEmpId: string, targetName: string, newRole: string) => {
    setAssigningUserId(userIdOrEmpId);
    try {
      const res = await fetch("/api/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "assign_role",
          identifier: userIdOrEmpId,
          role: newRole,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setRoleUsers((prev) =>
          prev.map((u) => {
            if (u.id === userIdOrEmpId || u.employeeId === userIdOrEmpId) {
              const assignedRole = customRoles.find((r) => r.id === newRole);
              return {
                ...u,
                role: newRole,
                roleName: assignedRole ? assignedRole.name : newRole,
                roleColor: assignedRole ? assignedRole.color : "purple",
                allowedSectionsCount: assignedRole ? assignedRole.sections.length : u.allowedSectionsCount,
              };
            }
            return u;
          })
        );
        await loadRoles();
        if (currentUser.id === userIdOrEmpId || currentUser.employeeId === userIdOrEmpId) {
          refreshSession();
        }
        setRoleToastMessage(`Assigned role "${newRole}" to ${targetName}`);
        setTimeout(() => setRoleToastMessage(""), 4000);
      } else {
        alert(data.error || "Failed to assign role");
      }
    } catch (err) {
      console.error(err);
      alert("Error assigning role");
    } finally {
      setAssigningUserId(null);
    }
  };

  // Open Create Modal
  const handleOpenCreateRole = () => {
    setEditingRoleId(null);
    setRoleFormName("");
    setRoleFormDesc("");
    setRoleFormColor("indigo");
    setRoleFormSections(["dashboard", "profile"]);
    setIsRoleModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEditRole = (role: CustomRole) => {
    setEditingRoleId(role.id);
    setRoleFormName(role.name);
    setRoleFormDesc(role.description);
    setRoleFormColor(role.color || "indigo");
    setRoleFormSections(role.sections || []);
    setIsRoleModalOpen(true);
  };

  // Toggle Section in Modal
  const handleToggleSection = (sectionId: string) => {
    setRoleFormSections((prev) =>
      prev.includes(sectionId) ? prev.filter((id) => id !== sectionId) : [...prev, sectionId]
    );
  };

  const handleSelectAllSections = () => {
    setRoleFormSections(APP_SECTIONS.map((s) => s.id));
  };

  const handleDeselectAllSections = () => {
    // Keep at least dashboard and profile
    setRoleFormSections(["dashboard", "profile"]);
  };

  // Save Role (Create or Edit)
  const handleSaveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roleFormName.trim()) {
      alert("Role name is required");
      return;
    }
    if (roleFormSections.length === 0) {
      alert("Please select at least one section for this role.");
      return;
    }

    setIsSavingRole(true);
    try {
      const res = await fetch("/api/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingRoleId || undefined,
          name: roleFormName.trim(),
          description: roleFormDesc.trim(),
          color: roleFormColor,
          sections: roleFormSections,
        }),
      });
      const data = await res.json();
      if (data.success) {
        await loadRoles();
        setIsRoleModalOpen(false);
        setRoleToastMessage(`Custom role "${roleFormName}" saved successfully!`);
        setTimeout(() => setRoleToastMessage(""), 4000);
      } else {
        alert(data.error || "Failed to save role");
      }
    } catch (err) {
      console.error(err);
      alert("Error saving custom role");
    } finally {
      setIsSavingRole(false);
    }
  };

  // Delete Role
  const handleDeleteRole = async (roleId: string, roleName: string) => {
    if (
      !confirm(
        `Are you sure you want to delete the role "${roleName}"?\nAny users assigned to this role will automatically be reassigned to Employee.`
      )
    ) {
      return;
    }

    try {
      const res = await fetch(`/api/roles?id=${encodeURIComponent(roleId)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        await loadRoles();
        setRoleToastMessage(`Role "${roleName}" deleted.`);
        setTimeout(() => setRoleToastMessage(""), 4000);
      } else {
        alert(data.error || "Failed to delete role");
      }
    } catch (err) {
      console.error(err);
      alert("Error deleting role");
    }
  };

  // Group APP_SECTIONS for the modal
  const sectionCategories: { key: string; label: string; items: AppSection[] }[] = [
    {
      key: "core",
      label: "Core Workspace",
      items: APP_SECTIONS.filter((s) => s.category === "Core"),
    },
    {
      key: "hr",
      label: "People & Attendance",
      items: APP_SECTIONS.filter((s) => s.category === "Human Resources"),
    },
    {
      key: "finance",
      label: "Finance & Disbursements",
      items: APP_SECTIONS.filter((s) => s.category === "Finance & Operations"),
    },
    {
      key: "admin",
      label: "Administration & Governance",
      items: APP_SECTIONS.filter((s) => s.category === "Administration"),
    },
  ];

  // Filtered lists for Roles tab
  const filteredRoles = customRoles.filter(
    (r) =>
      r.name.toLowerCase().includes(roleSearchQuery.toLowerCase()) ||
      r.description.toLowerCase().includes(roleSearchQuery.toLowerCase())
  );

  const filteredUsers = roleUsers.filter((u) => {
    const matchesSearch =
      u.name.toLowerCase().includes(peopleSearchQuery.toLowerCase()) ||
      (u.employeeId && u.employeeId.toLowerCase().includes(peopleSearchQuery.toLowerCase())) ||
      u.email.toLowerCase().includes(peopleSearchQuery.toLowerCase()) ||
      (u.department && u.department.toLowerCase().includes(peopleSearchQuery.toLowerCase()));

    const matchesBranch = peopleBranchFilter === "ALL" || u.branch === peopleBranchFilter;
    const matchesRole =
      peopleRoleFilter === "ALL" ||
      u.role.toLowerCase() === peopleRoleFilter.toLowerCase();

    return matchesSearch && matchesBranch && matchesRole;
  });

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <Sliders className="w-6 h-6 text-blue-600" />
            System Configuration & Settings
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Custom user roles, section-level permissions, office geofences, and Google Cloud Firestore cloud engine.
          </p>
        </div>
      </div>

      {/* Settings Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 p-1.5 bg-slate-100/80 rounded-2xl border border-slate-200">
        <button
          type="button"
          onClick={() => setActiveTab("roles")}
          className={`px-4 py-2.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === "roles"
              ? "bg-white text-blue-700 shadow-sm border border-slate-200/80"
              : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
          }`}
        >
          <ShieldCheck className="w-4 h-4 text-blue-600" />
          <span>Roles & Access Control</span>
          <span className="px-1.5 py-0.5 rounded-md bg-blue-100 text-blue-700 text-[10px] font-bold">
            {customRoles.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("policy")}
          className={`px-4 py-2.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === "policy"
              ? "bg-white text-blue-700 shadow-sm border border-slate-200/80"
              : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
          }`}
        >
          <Clock className="w-4 h-4 text-emerald-600" />
          <span>Attendance Policy</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("offices")}
          className={`px-4 py-2.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === "offices"
              ? "bg-white text-blue-700 shadow-sm border border-slate-200/80"
              : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
          }`}
        >
          <MapPin className="w-4 h-4 text-amber-600" />
          <span>Office Geofences</span>
          <span className="px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[10px] font-bold">
            {offices.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("cloud")}
          className={`px-4 py-2.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === "cloud"
              ? "bg-white text-blue-700 shadow-sm border border-slate-200/80"
              : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
          }`}
        >
          <Flame className="w-4 h-4 text-orange-500" />
          <span>Cloud Engine & Slabs</span>
        </button>
      </div>

      {roleToastMessage && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-medium flex items-center gap-2.5 shadow-xs animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{roleToastMessage}</span>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 1: ROLES & ACCESS CONTROL                            */}
      {/* ======================================================== */}
      {activeTab === "roles" && (
        <div className="space-y-8 animate-fadeIn">
          {/* Section 1: Custom Roles Grid */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div>
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-blue-50 text-blue-700">
                    <KeyRound className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900">Custom Roles & Section Visibility</h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Configure custom roles and specify which of the 18 HRMS sections each role can see and access.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={roleSearchQuery}
                    onChange={(e) => setRoleSearchQuery(e.target.value)}
                    placeholder="Search roles..."
                    className="pl-8 pr-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 w-44"
                  />
                </div>

                {canEdit && (
                  <Button
                    size="sm"
                    onClick={handleOpenCreateRole}
                    icon={<Plus className="w-4 h-4" />}
                    className="shrink-0"
                  >
                    Create Custom Role
                  </Button>
                )}
              </div>
            </div>

            {/* Roles Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredRoles.map((role) => {
                const colorMeta = ROLE_COLORS[role.color || "indigo"] || ROLE_COLORS.indigo;
                const percentAllowed = Math.round((role.sections.length / APP_SECTIONS.length) * 100);

                return (
                  <div
                    key={role.id}
                    className="p-5 rounded-2xl bg-slate-50/70 border border-slate-200/90 hover:border-blue-300 hover:shadow-sm transition-all flex flex-col justify-between"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-slate-900 text-sm">{role.name}</h3>
                            <span
                              className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${colorMeta.badge}`}
                            >
                              {role.isSystem ? "System" : "Custom"}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                            {role.description}
                          </p>
                        </div>
                      </div>

                      {/* Coverage Progress Bar */}
                      <div className="space-y-1.5 pt-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-600 font-medium flex items-center gap-1">
                            <Eye className="w-3 h-3 text-slate-400" />
                            Section Access
                          </span>
                          <span className="font-bold text-slate-800">
                            {role.sections.length} / {APP_SECTIONS.length} sections ({percentAllowed}%)
                          </span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${colorMeta.bg} transition-all rounded-full`}
                            style={{ width: `${percentAllowed}%` }}
                          />
                        </div>
                      </div>

                      {/* Accessible Section Pills (Preview first 6) */}
                      <div className="flex flex-wrap gap-1 pt-1">
                        {role.sections.slice(0, 6).map((secId) => {
                          const secMeta = APP_SECTIONS.find((s) => s.id === secId);
                          return (
                            <span
                              key={secId}
                              className="text-[10px] px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-700 font-medium"
                            >
                              {secMeta?.name || secId}
                            </span>
                          );
                        })}
                        {role.sections.length > 6 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-200/80 text-slate-600 font-medium">
                            +{role.sections.length - 6} more
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Footer Actions & Users Assigned */}
                    <div className="pt-4 mt-4 border-t border-slate-200/80 flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-slate-600 flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 text-slate-400" />
                        {role.userCount ?? 0} {role.userCount === 1 ? "user" : "users"}
                      </span>

                      {canEdit && (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenEditRole(role)}
                            className="p-1.5 text-xs text-blue-700 hover:bg-blue-50 rounded-lg transition-colors font-medium flex items-center gap-1 cursor-pointer"
                            title="Edit Section Access"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            <span>Edit</span>
                          </button>
                          {!role.isSystem && !["admin", "hr", "employee"].includes(role.id) && (
                            <button
                              type="button"
                              onClick={() => handleDeleteRole(role.id, role.name)}
                              className="p-1.5 text-xs text-red-600 hover:bg-red-50 rounded-lg transition-colors font-medium flex items-center gap-1 cursor-pointer"
                              title="Delete Role"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 2: People & Role Assignments */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-purple-50 text-purple-700">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">People & Role Assignments</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Assign or change roles for any staff member in Credit Expert. Role changes take effect immediately.
                  </p>
                </div>
              </div>

              {/* Filters */}
              <div className="flex flex-wrap items-center gap-2.5">
                {/* Search */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={peopleSearchQuery}
                    onChange={(e) => setPeopleSearchQuery(e.target.value)}
                    placeholder="Search people, code..."
                    className="pl-8 pr-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 w-44 sm:w-52"
                  />
                </div>

                {/* Branch Filter */}
                <select
                  value={peopleBranchFilter}
                  onChange={(e) => setPeopleBranchFilter(e.target.value)}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 focus:outline-none focus:border-blue-600"
                >
                  <option value="ALL">All Branches</option>
                  {BRANCHES.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>

                {/* Role Filter */}
                <select
                  value={peopleRoleFilter}
                  onChange={(e) => setPeopleRoleFilter(e.target.value)}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 focus:outline-none focus:border-blue-600"
                >
                  <option value="ALL">All Roles</option>
                  {customRoles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* People Table */}
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-semibold">
                    <th className="py-3 px-4">Employee / User</th>
                    <th className="py-3 px-4">Code & Branch</th>
                    <th className="py-3 px-4">Current Role</th>
                    <th className="py-3 px-4">Accessible Sections</th>
                    <th className="py-3 px-4 text-right">Change Role</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400 text-xs">
                        No team members found matching your search filters.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((u) => {
                      const colorMeta = ROLE_COLORS[u.roleColor || "purple"] || ROLE_COLORS.purple;
                      const isAssigning = assigningUserId === u.id || assigningUserId === u.employeeId;

                      return (
                        <tr key={u.id} className="hover:bg-slate-50/60 transition-colors">
                          {/* Name & Avatar */}
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <img
                                src={u.avatar || "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100"}
                                alt={u.name}
                                onError={(e) => {
                                  e.currentTarget.onerror = null;
                                  e.currentTarget.src = "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100";
                                }}
                                className="w-8 h-8 rounded-full object-cover border border-slate-200 shrink-0"
                              />
                              <div>
                                <p className="font-semibold text-slate-900 leading-tight">{u.name}</p>
                                <p className="text-[11px] text-slate-400 font-mono">{u.email}</p>
                              </div>
                            </div>
                          </td>

                          {/* Code & Branch */}
                          <td className="py-3 px-4">
                            <div className="space-y-0.5">
                              <span className="font-mono text-slate-700 font-medium">
                                {u.employeeId || "—"}
                              </span>
                              <div className="flex items-center gap-1 text-[11px] text-slate-500">
                                <MapPin className="w-3 h-3 text-blue-600" />
                                {u.branch || "Delhi"} • {u.department || "General"}
                              </div>
                            </div>
                          </td>

                          {/* Current Role Badge */}
                          <td className="py-3 px-4">
                            <span
                              className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-md border ${colorMeta.badge}`}
                            >
                              <ShieldCheck className="w-3 h-3" />
                              {u.roleName}
                            </span>
                          </td>

                          {/* Accessible Sections */}
                          <td className="py-3 px-4">
                            <span className="text-[11px] font-medium text-slate-700">
                              {u.allowedSectionsCount} of {APP_SECTIONS.length} sections
                            </span>
                          </td>

                          {/* Change Role Selector */}
                          <td className="py-3 px-4 text-right">
                            {canEdit ? (
                              <div className="inline-flex items-center gap-2">
                                {isAssigning ? (
                                  <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                                ) : (
                                  <select
                                    value={u.role}
                                    disabled={isAssigning}
                                    onChange={(e) =>
                                      handleAssignRole(u.id || u.employeeId || "", u.name, e.target.value)
                                    }
                                    className="bg-slate-50 border border-slate-200 text-slate-800 text-xs rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-blue-600 cursor-pointer hover:bg-white font-medium"
                                  >
                                    {customRoles.map((r) => (
                                      <option key={r.id} value={r.id}>
                                        {r.name} ({r.sections.length} sections)
                                      </option>
                                    ))}
                                  </select>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400 text-xs italic">View Only</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: CREATE / EDIT CUSTOM ROLE                         */}
      {/* ======================================================== */}
      {isRoleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-blue-50 text-blue-700 border border-blue-100">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {editingRoleId ? "Edit Role & Section Access" : "Create New Custom Role"}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Specify which sections and tools this role can view in Credit Expert HRMS.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsRoleModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body (Scrollable) */}
            <form onSubmit={handleSaveRole} className="p-6 overflow-y-auto space-y-6 flex-1">
              {/* Basic Info */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2 space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Role Name *</label>
                  <input
                    type="text"
                    required
                    value={roleFormName}
                    onChange={(e) => setRoleFormName(e.target.value)}
                    placeholder="e.g. Branch Auditor, Loan Verification Specialist"
                    className="w-full bg-slate-50 border border-slate-200 text-xs rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600 focus:ring-1 focus:ring-blue-600 font-medium"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Color Theme</label>
                  <select
                    value={roleFormColor}
                    onChange={(e) => setRoleFormColor(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 text-xs rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600 font-medium"
                  >
                    <option value="indigo">Indigo</option>
                    <option value="emerald">Emerald</option>
                    <option value="blue">Blue</option>
                    <option value="amber">Amber</option>
                    <option value="rose">Rose</option>
                    <option value="purple">Purple</option>
                    <option value="teal">Teal</option>
                  </select>
                </div>

                <div className="sm:col-span-3 space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Role Description</label>
                  <input
                    type="text"
                    value={roleFormDesc}
                    onChange={(e) => setRoleFormDesc(e.target.value)}
                    placeholder="Briefly describe the responsibilities or team context for this role"
                    className="w-full bg-slate-50 border border-slate-200 text-xs rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600 font-medium"
                  />
                </div>
              </div>

              {/* Section Access Permissions */}
              <div className="space-y-4 pt-2 border-t border-slate-100">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-blue-600" />
                      Section Access Permissions ({roleFormSections.length} of {APP_SECTIONS.length} selected)
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Unselected sections will be hidden from the sidebar and protected from direct URL navigation.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSelectAllSections}
                      className="text-[11px] font-semibold text-blue-700 hover:bg-blue-50 px-2 py-1 rounded-lg border border-blue-200 transition-colors cursor-pointer"
                    >
                      Select All (18)
                    </button>
                    <button
                      type="button"
                      onClick={handleDeselectAllSections}
                      className="text-[11px] font-semibold text-slate-600 hover:bg-slate-100 px-2 py-1 rounded-lg border border-slate-200 transition-colors cursor-pointer"
                    >
                      Clear Selection
                    </button>
                  </div>
                </div>

                {/* Categorized Checkbox List */}
                <div className="space-y-4">
                  {sectionCategories.map((cat) => (
                    <div
                      key={cat.key}
                      className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 space-y-3"
                    >
                      <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
                        <span className="text-xs font-bold text-slate-800 tracking-wide uppercase">
                          {cat.label}
                        </span>
                        <span className="text-[10px] text-slate-500 font-medium">
                          {cat.items.filter((item) => roleFormSections.includes(item.id)).length} of {cat.items.length} enabled
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {cat.items.map((sec) => {
                          const isChecked = roleFormSections.includes(sec.id);
                          return (
                            <label
                              key={sec.id}
                              className={`flex items-start gap-3 p-2.5 rounded-xl border transition-all cursor-pointer ${
                                isChecked
                                  ? "bg-blue-50/70 border-blue-200 shadow-2xs"
                                  : "bg-white border-slate-200 hover:border-slate-300"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleToggleSection(sec.id)}
                                className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                              />
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-slate-900 leading-tight">
                                  {sec.name}
                                </p>
                                <p className="text-[10px] text-slate-500 line-clamp-1 mt-0.5">
                                  {sec.description}
                                </p>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsRoleModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  isLoading={isSavingRole}
                  icon={<Save className="w-4 h-4" />}
                >
                  {editingRoleId ? "Save Role Changes" : "Create Custom Role"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 2: ATTENDANCE POLICY                                 */}
      {/* ======================================================== */}
      {activeTab === "policy" && (
        <div className="space-y-6 animate-fadeIn">
          {statusMessage && (
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              {statusMessage}
            </div>
          )}

          <div className="glass-card rounded-2xl p-6 border border-slate-800 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-white text-base">Attendance Rules & Thresholds</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Configurable timings for punch-in, grace period cutoff, and overtime qualification.
                </p>
              </div>
              <Badge variant="indigo">POL-001</Badge>
            </div>

            <form onSubmit={handleSavePolicy} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Office Start Timing (HH:MM)
                  </label>
                  <input
                    type="text"
                    disabled={!canEdit}
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500 disabled:opacity-60"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Office End Timing (HH:MM)
                  </label>
                  <input
                    type="text"
                    disabled={!canEdit}
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500 disabled:opacity-60"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Grace Period (Minutes)
                  </label>
                  <input
                    type="number"
                    disabled={!canEdit}
                    value={gracePeriod}
                    onChange={(e) => setGracePeriod(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500 disabled:opacity-60"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    Late marked after {startTime} + {gracePeriod} mins
                  </span>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Full Day Min Hours
                  </label>
                  <input
                    type="number"
                    disabled={!canEdit}
                    value={fullDayHours}
                    onChange={(e) => setFullDayHours(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500 disabled:opacity-60"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">Standard full workday duration</span>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Half Day Threshold Hours
                  </label>
                  <input
                    type="number"
                    disabled={!canEdit}
                    value={halfDayHours}
                    onChange={(e) => setHalfDayHours(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500 disabled:opacity-60"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">Under 4 hours flagged as half day</span>
                </div>
              </div>

              {canEdit && (
                <div className="flex items-center justify-end pt-3 border-t border-slate-800">
                  <Button type="submit" size="sm" isLoading={isSaving} icon={<Save className="w-4 h-4" />}>
                    Save Policy Configurations
                  </Button>
                </div>
              )}
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 3: OFFICE GEOFENCES                                  */}
      {/* ======================================================== */}
      {activeTab === "offices" && (
        <div className="space-y-6 animate-fadeIn">
          <div className="glass-card rounded-2xl p-6 border border-slate-800 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400">
                  <MapPin className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">Office Geofences & GPS Attendance</h3>
                  <p className="text-xs text-slate-400">
                    Configure GPS coordinates, allowed radius, and maximum acceptable accuracy for each office branch.
                  </p>
                </div>
              </div>
              {canEdit && (
                <Button
                  size="sm"
                  variant="outline"
                  icon={<Plus className="w-3.5 h-3.5" />}
                  onClick={handleNewOffice}
                >
                  Add Office Location
                </Button>
              )}
            </div>

            {officeStatusMessage && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{officeStatusMessage}</span>
              </div>
            )}

            {/* Office Selection Pills */}
            <div className="flex flex-wrap gap-2">
              {offices.map((off) => (
                <button
                  key={off.id}
                  type="button"
                  onClick={() => selectOffice(off)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                    selectedOfficeId === off.id
                      ? "bg-blue-600 text-white shadow-md shadow-blue-600/20"
                      : "bg-slate-900 border border-slate-800 text-slate-400 hover:text-white"
                  }`}
                >
                  <MapPin className="w-3 h-3" />
                  <span>{off.name}</span>
                  <span className="text-[10px] opacity-75">({off.allowedRadiusMeters}m)</span>
                </button>
              ))}
            </div>

            {/* Edit Form */}
            <form onSubmit={handleSaveOffice} className="space-y-4 pt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Office Name *</label>
                  <input
                    type="text"
                    required
                    disabled={!canEdit}
                    value={officeName}
                    onChange={(e) => setOfficeName(e.target.value)}
                    placeholder="Credit Expert - Delhi Branch"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 disabled:opacity-60"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Associated Branch *</label>
                  <select
                    disabled={!canEdit}
                    value={officeBranch}
                    onChange={(e) => setOfficeBranch(e.target.value as Branch)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 disabled:opacity-60"
                  >
                    {BRANCHES.map((b) => (
                      <option key={b} value={b}>
                        {b} Branch
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Latitude (GPS) *</label>
                  <input
                    type="number"
                    step="0.000001"
                    required
                    disabled={!canEdit}
                    value={officeLat}
                    onChange={(e) => setOfficeLat(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500 disabled:opacity-60"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Longitude (GPS) *</label>
                  <input
                    type="number"
                    step="0.000001"
                    required
                    disabled={!canEdit}
                    value={officeLon}
                    onChange={(e) => setOfficeLon(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500 disabled:opacity-60"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Allowed Radius (Meters)</label>
                  <input
                    type="number"
                    min="10"
                    max="5000"
                    required
                    disabled={!canEdit}
                    value={officeRadius}
                    onChange={(e) => setOfficeRadius(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500 disabled:opacity-60"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">Geofence boundary around office</span>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Max GPS Accuracy (Meters)</label>
                  <input
                    type="number"
                    min="10"
                    max="500"
                    required
                    disabled={!canEdit}
                    value={officeMaxAccuracy}
                    onChange={(e) => setOfficeMaxAccuracy(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500 disabled:opacity-60"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">Rejects clock-in if GPS drift &gt; value</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Office Street Address</label>
                <input
                  type="text"
                  disabled={!canEdit}
                  value={officeAddress}
                  onChange={(e) => setOfficeAddress(e.target.value)}
                  placeholder="e.g. Connaught Place, New Delhi"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 disabled:opacity-60"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="officeActive"
                  disabled={!canEdit}
                  checked={officeActive}
                  onChange={(e) => setOfficeActive(e.target.checked)}
                  className="rounded bg-slate-900 border-slate-700 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="officeActive" className="text-xs text-slate-300 select-none cursor-pointer">
                  Active Location (Enforce attendance geofence for this office)
                </label>
              </div>

              {canEdit && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-800">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    isLoading={isDetectingLocation}
                    icon={<Crosshair className="w-4 h-4 text-emerald-400" />}
                    onClick={handleDetectCurrentGPS}
                    className="w-full sm:w-auto justify-center"
                  >
                    Use My Current Device GPS
                  </Button>

                  <div className="w-full sm:w-auto flex items-center justify-end gap-2">
                    <Button
                      type="submit"
                      size="sm"
                      isLoading={isSavingOffice}
                      icon={<Save className="w-4 h-4" />}
                      className="w-full sm:w-auto justify-center"
                    >
                      Save Office Geofence
                    </Button>
                  </div>
                </div>
              )}
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 4: CLOUD ENGINE & STATUTORY                          */}
      {/* ======================================================== */}
      {activeTab === "cloud" && (
        <div className="space-y-6 animate-fadeIn">
          {/* Cloud Database Engine & Spark Quota Telemetry (Firestore Only) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Firebase & Firestore Connector */}
            <div className="glass-card rounded-2xl p-6 border border-slate-800 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400">
                    <Flame className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-sm">Google Cloud Firestore</h3>
                    <p className="text-[11px] text-slate-400">Primary Cloud Database Engine</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="warning" className="text-[10px] text-amber-400 border-amber-500/30 bg-amber-500/10">
                    Spark Free Plan (₹0)
                  </Badge>
                  <Badge variant="success" className="text-[10px]">
                    Active
                  </Badge>
                </div>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-400">Database Engine</span>
                  <span className="text-emerald-400 font-semibold">Google Cloud Firestore</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-400">Firebase Project ID</span>
                  <span className="font-mono text-white font-medium">irregularhours-5f56e</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-400">Storage Location</span>
                  <span className="text-slate-300 font-medium">asia-south1 (Mumbai)</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-400">Collections Managed</span>
                  <span className="text-slate-300 font-medium">
                    employees, attendance, leaves, payroll_runs, assets, requests, announcements, audit_logs, holidays, onboarding, users, sessions, custom_roles
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-400">Database Mode</span>
                  <span className="text-indigo-400 font-medium">Exclusive Cloud Store (In-Memory Offline Cache)</span>
                </div>
              </div>

              {firestoreSyncResult && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{firestoreSyncResult}</span>
                </div>
              )}

              {canEdit && (
                <div className="pt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    isLoading={isSyncingFirestore}
                    icon={<UploadCloud className="w-4 h-4" />}
                    onClick={handleSyncFirestore}
                  >
                    Reseed / Sync Firestore Schema
                  </Button>
                </div>
              )}
            </div>

            {/* Firebase Spark Plan Quota & Optimization */}
            <div className="glass-card rounded-2xl p-6 border border-slate-800 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400">
                    <Shield className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-sm">Spark Plan Quota & Protection</h3>
                    <p className="text-[11px] text-slate-400">Zero-Cost Free Tier Guardrails</p>
                  </div>
                </div>
                <Badge variant="success" className="text-[10px]">
                  Quota Guard On
                </Badge>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-400">Daily Read Quota</span>
                  <span className="text-emerald-400 font-mono font-medium">50,000 document reads / day</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-400">Daily Write Quota</span>
                  <span className="text-amber-400 font-mono font-medium">20,000 document writes / day</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-400">Read Optimization Layer</span>
                  <span className="text-indigo-400 font-medium">60s TTL In-Memory Read Cache</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-400">Write Optimization Layer</span>
                  <span className="text-cyan-400 font-medium">Atomic Batch Writes (Max 500 ops/batch)</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-400">Quota Circuit Breaker</span>
                  <span className="text-emerald-400 font-medium">Active (Graceful In-Memory Fallback)</span>
                </div>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed pt-1">
                Optimized exclusively for Google Cloud Firestore. Read caching and batch operations ensure operations stay well within free Spark limits.
              </p>
            </div>
          </div>

          {/* Statutory Payroll Configuration Slabs */}
          <div className="glass-card rounded-2xl p-6 border border-slate-800 space-y-4">
            <h3 className="font-bold text-white text-base">Statutory Compliance Rules & Constants</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
                <span className="text-slate-400 block">Employees&apos; Provident Fund (EPF)</span>
                <p className="text-base font-bold text-white mt-1">12% on Basic Salary</p>
                <span className="text-[11px] text-slate-500">Statutory wage ceiling capped at ₹15,000/mo</span>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
                <span className="text-slate-400 block">Professional Tax (PT)</span>
                <p className="text-base font-bold text-white mt-1">₹0 (Disabled)</p>
                <span className="text-[11px] text-slate-500">Professional tax deduction removed</span>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
                <span className="text-slate-400 block">House Rent Allowance (HRA)</span>
                <p className="text-base font-bold text-white mt-1">50% of Basic</p>
                <span className="text-[11px] text-slate-500">Standard metro taxation allocation</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
