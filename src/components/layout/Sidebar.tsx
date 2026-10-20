"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  LayoutDashboard,
  Users,
  UserCheck,
  Clock,
  CalendarDays,
  Calendar,
  CircleDollarSign,
  Award,
  FileSpreadsheet,
  FolderLock,
  Laptop,
  HelpCircle,
  Megaphone,
  BarChart3,
  ScrollText,
  Sliders,
  ShieldCheck,
} from "lucide-react";
import { UserRole } from "@/lib/types";

interface NavItem {
  name: string;
  href: string;
  icon: React.ReactNode;
  allowedRoles: UserRole[];
  badge?: string;
  badgeColor?: string;
}

export function Sidebar() {
  const pathname = usePathname();
  const { currentUser } = useAuth();

  const navItems: NavItem[] = [
    {
      name: "Dashboard",
      href: "/dashboard",
      icon: <LayoutDashboard className="w-4 h-4" />,
      allowedRoles: ["admin", "hr", "employee"],
    },
    {
      name: "Employees",
      href: "/employees",
      icon: <Users className="w-4 h-4" />,
      allowedRoles: ["admin", "hr"],
      badge: "5",
    },
    {
      name: "Onboarding",
      href: "/onboarding",
      icon: <UserCheck className="w-4 h-4" />,
      allowedRoles: ["admin", "hr"],
      badge: "3 Active",
      badgeColor: "bg-indigo-50 text-indigo-700 border border-indigo-200",
    },
    {
      name: "Attendance",
      href: "/attendance",
      icon: <Clock className="w-4 h-4" />,
      allowedRoles: ["admin", "hr", "employee"],
    },
    {
      name: "Leave Management",
      href: "/leaves",
      icon: <CalendarDays className="w-4 h-4" />,
      allowedRoles: ["admin", "hr", "employee"],
      badge: "1 Pending",
      badgeColor: "bg-amber-50 text-amber-700 border border-amber-200",
    },
    {
      name: "Holidays",
      href: "/holidays",
      icon: <Calendar className="w-4 h-4" />,
      allowedRoles: ["admin", "hr", "employee"],
      badge: "Branches",
      badgeColor: "bg-sky-50 text-sky-700 border border-sky-200",
    },
    {
      name: "Payroll Engine",
      href: "/payroll",
      icon: <CircleDollarSign className="w-4 h-4" />,
      allowedRoles: ["admin", "hr"],
      badge: "Review",
      badgeColor: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    },
    {
      name: "Incentives",
      href: "/incentives",
      icon: <Award className="w-4 h-4" />,
      allowedRoles: ["admin", "hr"],
    },
    {
      name: "Payslips",
      href: "/payslips",
      icon: <FileSpreadsheet className="w-4 h-4" />,
      allowedRoles: ["admin", "hr", "employee"],
    },
    {
      name: "Documents",
      href: "/documents",
      icon: <FolderLock className="w-4 h-4" />,
      allowedRoles: ["admin", "hr"],
      badge: "Alert",
      badgeColor: "bg-rose-50 text-rose-700 border border-rose-200",
    },
    {
      name: "Assets",
      href: "/assets",
      icon: <Laptop className="w-4 h-4" />,
      allowedRoles: ["admin", "hr"],
    },
    {
      name: "HR Requests",
      href: "/requests",
      icon: <HelpCircle className="w-4 h-4" />,
      allowedRoles: ["admin", "hr", "employee"],
    },
    {
      name: "Announcements",
      href: "/announcements",
      icon: <Megaphone className="w-4 h-4" />,
      allowedRoles: ["admin", "hr", "employee"],
    },
    {
      name: "Reports & Analytics",
      href: "/reports",
      icon: <BarChart3 className="w-4 h-4" />,
      allowedRoles: ["admin", "hr"],
    },
    {
      name: "Audit Logs",
      href: "/audit-logs",
      icon: <ScrollText className="w-4 h-4" />,
      allowedRoles: ["admin", "hr"],
    },
    {
      name: "Policy & Settings",
      href: "/settings",
      icon: <Sliders className="w-4 h-4" />,
      allowedRoles: ["admin", "hr"],
    },
  ];

  const visibleItems = navItems.filter(
    (item) => currentUser.role === "admin" || currentUser.role === "hr" || item.allowedRoles.includes(currentUser.role)
  );

  return (
    <aside className="w-64 bg-white border-r border-slate-200 flex flex-col h-screen sticky top-0 select-none shadow-xs z-20">
      {/* Brand Header with Credit Expert India Official Logo */}
      <div className="h-18 flex items-center px-5 border-b border-slate-100 bg-white">
        <Link href="/dashboard" className="flex items-center gap-3 group">
          <div className="relative h-10 w-auto flex items-center">
            <Image
              src="/img/logo.webp"
              alt="Credit Expert India Logo"
              width={140}
              height={38}
              className="h-8 sm:h-9 w-auto object-contain group-hover:opacity-90 transition-opacity"
              priority
            />
          </div>
          <div>
            <span className="font-extrabold text-[#0a2540] text-sm tracking-tight block leading-tight">
              Credit Expert
            </span>
            <span className="text-[10px] text-blue-600 font-bold tracking-wide uppercase font-mono">
              HRMS Portal
            </span>
          </div>
        </Link>
      </div>

      {/* Navigation list */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        <div className="px-3 pb-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
          Enterprise Modules
        </div>
        {visibleItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all group ${
                isActive
                  ? "sidebar-active bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20 font-semibold"
                  : "text-slate-600 hover:text-blue-700 hover:bg-blue-50/70"
              }`}
            >
              <div className="flex items-center gap-3">
                <span className={`${isActive ? "text-white" : "text-slate-400 group-hover:text-blue-600 transition-colors"}`}>
                  {item.icon}
                </span>
                <span>{item.name}</span>
              </div>
              {item.badge && (
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                    isActive ? "bg-white/20 text-white" : item.badgeColor || "bg-blue-50 text-blue-700 border border-blue-200"
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {/* RBAC footer badge */}
      <div className="p-4 border-t border-slate-100 bg-slate-50/60">
        <div className="p-3 rounded-xl bg-white border border-slate-200 flex items-center gap-3 shadow-xs">
          <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold text-slate-900 truncate">Role-Based Access</p>
            <p className="text-[10px] text-blue-600 font-medium capitalize truncate">
              {currentUser.role.replace("_", " ")} Mode
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}
