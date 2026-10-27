"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useSidebar } from "@/lib/sidebar-context";
import {
  Clock,
  Search,
  LogOut,
  MapPin,
  Menu,
} from "lucide-react";

import { getISTLiveTimeWithSeconds } from "@/lib/attendance/ist-time";

export function Header() {
  const { currentUser, logout } = useAuth();
  const { toggleSidebar } = useSidebar();
  const [time, setTime] = useState<string>("");

  useEffect(() => {
    const update = () => {
      setTime(getISTLiveTimeWithSeconds());
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  const roleStyles: Record<string, { label: string; color: string }> = {
    admin: { label: "ADMIN", color: "bg-blue-50 text-blue-700 border-blue-200" },
    hr: { label: "HR", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    employee: { label: "EMPLOYEE", color: "bg-purple-50 text-purple-700 border-purple-200" },
    branch_manager: { label: "BRANCH MGR", color: "bg-amber-50 text-amber-700 border-amber-200" },
    team_lead: { label: "TEAM LEAD", color: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  };

  const cleanRoleName = currentUser.role
    ? currentUser.role.replace(/^role-/, "").replace(/_/g, " ").toUpperCase()
    : "USER";

  const roleMeta =
    roleStyles[currentUser.role] || {
      label: cleanRoleName,
      color: "bg-slate-100 text-slate-800 border-slate-300",
    };

  return (
    <header className="sticky top-0 z-30 h-16 bg-white/95 backdrop-blur-md border-b border-slate-200 flex items-center justify-between px-3 sm:px-6 shadow-xs">
      {/* Left side: Hamburger button on mobile + Mobile Logo + Search */}
      <div className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0 pr-2">
        {/* Mobile Hamburger Menu Toggle Button */}
        <button
          onClick={toggleSidebar}
          aria-label="Toggle navigation menu"
          className="lg:hidden p-2 rounded-xl text-slate-600 hover:text-blue-600 hover:bg-blue-50/80 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-600/30 cursor-pointer shrink-0"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Mobile Brand Mark (shown on < lg) */}
        <Link href="/dashboard" className="flex items-center gap-2 lg:hidden shrink-0">
          <Image
            src="/img/logo.webp"
            alt="Credit Expert"
            width={100}
            height={28}
            className="h-6 sm:h-7 w-auto object-contain"
            priority
          />
        </Link>

        {/* Search Input (visible on md+, compact on sm) */}
        <div className="hidden sm:flex items-center relative flex-1 max-w-xs md:max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Search employees, payroll, assets..."
            className="w-full bg-slate-50 border border-slate-200 text-xs text-slate-800 pl-9 pr-4 py-2 rounded-xl focus:outline-none focus:bg-white focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition-all placeholder:text-slate-400 font-medium"
          />
        </div>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
        {/* Live Clock with IST styling (desktop only) */}
        <div className="hidden xl:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-blue-50/80 border border-blue-100 text-xs font-mono text-blue-700 shadow-xs">
          <Clock className="w-3.5 h-3.5 text-blue-600" />
          <span>{time || "10:00:00 AM"} IST</span>
        </div>


        {/* Authenticated Identity Pill: Role & Branch */}
        <div className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 shadow-2xs">
          <span
            className={`text-[9px] sm:text-[10px] font-bold px-1.5 sm:px-2 py-0.5 rounded-md border ${roleMeta.color}`}
          >
            {roleMeta.label}
          </span>
          <span className="hidden sm:inline text-slate-300">|</span>
          <span className="hidden sm:inline-flex text-[11px] font-semibold text-slate-700 items-center gap-1">
            <MapPin className="w-3 h-3 text-blue-600" />
            {currentUser.branch || "Delhi"}
          </span>
        </div>

        {/* Current User Avatar & Profile */}
        <div className="flex items-center gap-2 pl-1 sm:pl-2 border-l border-slate-200">
          <Link
            href={currentUser.employeeId ? `/employees/${currentUser.employeeId}` : "/employees"}
            title="View profile & photo settings"
            className="flex items-center gap-2 hover:opacity-85 transition-opacity cursor-pointer group"
          >
            <img
              src={currentUser.avatar}
              alt={currentUser.name}
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-full object-cover border-2 border-blue-600/30 group-hover:border-blue-600 shadow-xs shrink-0 transition-colors"
            />
            <div className="hidden lg:block text-left">
              <p className="text-xs font-semibold text-slate-800 leading-tight group-hover:text-blue-600 transition-colors">
                {currentUser.name}
              </p>
              <p className="text-[10px] text-blue-600 font-medium">
                {currentUser.department}
              </p>
            </div>
          </Link>

          {/* Secure Logout Button */}
          <button
            onClick={() => logout()}
            title="Sign out of HRMS"
            aria-label="Sign out"
            className="p-1.5 sm:p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all cursor-pointer border border-transparent hover:border-rose-200 shrink-0"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
