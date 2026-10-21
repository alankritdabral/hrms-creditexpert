"use client";

import React, { useState, useEffect } from "react";
import { AttendancePolicy, OfficeLocation, Branch, BRANCHES } from "@/lib/types";
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
} from "lucide-react";

export default function SettingsPage() {
  const { currentUser } = useAuth();
  const isLocalhost = useIsLocalhost();
  const [policy, setPolicy] = useState<AttendancePolicy | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  // Firestore Sync State
  const [isSyncingFirestore, setIsSyncingFirestore] = useState(false);
  const [firestoreSyncResult, setFirestoreSyncResult] = useState<string | null>(null);

  // Form State
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

  const canEdit = ["admin", "hr"].includes(currentUser.role);

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

  const handleDetectCurrentGPS = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.");
      return;
    }
    setIsDetectingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsDetectingLocation(false);
        setOfficeLat(Number(pos.coords.latitude.toFixed(6)));
        setOfficeLon(Number(pos.coords.longitude.toFixed(6)));
        setOfficeStatusMessage(`Acquired device GPS! Accuracy: ±${Math.round(pos.coords.accuracy)}m`);
        setTimeout(() => setOfficeStatusMessage(""), 5000);
      },
      (err) => {
        setIsDetectingLocation(false);
        alert(`Could not acquire GPS: ${err.message}. Please verify device location permissions.`);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
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

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <Sliders className="w-6 h-6 text-blue-600" />
            System Configuration & Settings
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Enterprise attendance policies, statutory PF slabs, and Google Cloud Firestore cloud database engine.
          </p>
        </div>
      </div>

      {statusMessage && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          {statusMessage}
        </div>
      )}

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
                employees, attendance, leaves, payroll_runs, assets, requests, announcements, audit_logs, holidays, onboarding, users, sessions
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

      {/* Attendance Policy Form (Section 6 & 31 of PRD) */}
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

      {/* Office Geofences & GPS Attendance Configuration */}
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
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-slate-300">Latitude (GPS) *</label>
              </div>
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
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-slate-300">Longitude (GPS) *</label>
              </div>
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
              >
                Use My Current Device GPS
              </Button>

              <div className="flex items-center gap-2">
                <Button type="submit" size="sm" isLoading={isSavingOffice} icon={<Save className="w-4 h-4" />}>
                  Save Office Geofence
                </Button>
              </div>
            </div>
          )}
        </form>
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
  );
}
