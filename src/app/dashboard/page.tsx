"use client";

import React, { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { AdminDashboard } from "@/components/dashboard/AdminDashboard";
import { EmployeeDashboard } from "@/components/dashboard/EmployeeDashboard";
import { Shield, User } from "lucide-react";

export default function DashboardPage() {
  const { currentUser } = useAuth();
  const [viewMode, setViewMode] = useState<"admin" | "employee">(
    currentUser.role === "employee" ? "employee" : "admin"
  );

  // Auto-switch default mode when active user changes
  React.useEffect(() => {
    setViewMode(currentUser.role === "employee" ? "employee" : "admin");
  }, [currentUser]);

  const canToggleAdmin = currentUser.role !== "employee";

  return (
    <div className="space-y-6">
      {/* View Switcher if user has Admin privileges */}
      {canToggleAdmin && (
        <div className="flex items-center justify-end">
          <div className="inline-flex p-1 rounded-xl bg-slate-900 border border-slate-800 text-xs font-medium">
            <button
              onClick={() => setViewMode("admin")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                viewMode === "admin"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              HR / Admin View
            </button>
            <button
              onClick={() => setViewMode("employee")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                viewMode === "employee"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <User className="w-3.5 h-3.5" />
              Employee Self-Service View
            </button>
          </div>
        </div>
      )}

      {viewMode === "admin" ? <AdminDashboard /> : <EmployeeDashboard />}
    </div>
  );
}
