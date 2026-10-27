"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useSidebar } from "@/lib/sidebar-context";
import {
  Bell,
  Clock,
  Search,
  AlertTriangle,
  Cake,
  CalendarCheck,
  LogOut,
  MapPin,
  Menu,
  Calendar,
  HelpCircle,
  CircleDollarSign,
  UserCheck,
  TrendingUp,
  Megaphone,
  CheckCheck,
} from "lucide-react";

import { getISTLiveTimeWithSeconds } from "@/lib/attendance/ist-time";
import { useNotifications, NotificationItem } from "@/lib/notifications-context";

function getNotificationIcon(type: NotificationItem["type"]) {
  switch (type) {
    case "attendance":
      return <Clock className="w-4 h-4 text-amber-600" />;
    case "leave":
      return <CalendarCheck className="w-4 h-4 text-emerald-600" />;
    case "request":
      return <HelpCircle className="w-4 h-4 text-blue-600" />;
    case "payroll":
      return <CircleDollarSign className="w-4 h-4 text-indigo-600" />;
    case "document":
      return <AlertTriangle className="w-4 h-4 text-rose-600" />;
    case "onboarding":
      return <UserCheck className="w-4 h-4 text-purple-600" />;
    case "login":
      return <TrendingUp className="w-4 h-4 text-blue-600" />;
    case "announcement":
      return <Megaphone className="w-4 h-4 text-sky-600" />;
    case "holiday":
      return <Calendar className="w-4 h-4 text-teal-600" />;
    default:
      return <Bell className="w-4 h-4 text-slate-500" />;
  }
}

export function Header() {
  const { currentUser, logout } = useAuth();
  const { toggleSidebar } = useSidebar();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const [time, setTime] = useState<string>("");
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    const update = () => {
      setTime(getISTLiveTimeWithSeconds());
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  const roleStyles = {
    admin: { label: "ADMIN", color: "bg-blue-50 text-blue-700 border-blue-200" },
    hr: { label: "HR", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    employee: { label: "EMPLOYEE", color: "bg-purple-50 text-purple-700 border-purple-200" },
  };

  const roleMeta =
    roleStyles[currentUser.role] || {
      label: currentUser.role.toUpperCase(),
      color: "bg-slate-50 text-slate-700 border-slate-200",
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

        {/* Notifications Popover */}
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            aria-label="View notifications"
            className="relative p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer border border-transparent hover:border-slate-200"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 min-w-[14px] h-[14px] px-1 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center ring-2 ring-white">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>

          {showNotifications && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowNotifications(false)}
              />
              <div className="absolute right-0 mt-2 w-[calc(100vw-2rem)] max-w-xs sm:w-80 rounded-2xl bg-white border border-slate-200 shadow-xl z-50 p-3 space-y-2 animate-fadeIn">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 px-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-slate-800">
                      Notifications & Alerts
                    </span>
                    {unreadCount > 0 && (
                      <span className="text-[10px] text-blue-700 bg-blue-50 px-1.5 py-0.2 rounded-full font-bold border border-blue-200">
                        {unreadCount}
                      </span>
                    )}
                  </div>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={markAllAsRead}
                      className="text-[10px] text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1 cursor-pointer"
                    >
                      <CheckCheck className="w-3 h-3" />
                      Mark read
                    </button>
                  )}
                </div>

                <div className="space-y-1.5 max-h-80 overflow-y-auto pr-0.5">
                  {notifications.length === 0 ? (
                    <div className="text-center py-6 text-slate-400 text-xs">
                      No notifications. You&apos;re all caught up!
                    </div>
                  ) : (
                    notifications.map((n) => (
                      <Link
                        key={n.id}
                        href={n.href}
                        onClick={() => {
                          markAsRead(n.id);
                          setShowNotifications(false);
                        }}
                        className={`p-2.5 rounded-xl border text-xs flex gap-2.5 transition-all cursor-pointer block ${
                          n.urgent
                            ? "bg-amber-50/50 border-amber-200 hover:border-amber-300 hover:bg-amber-50"
                            : "bg-slate-50/70 border-slate-150 hover:bg-blue-50/60 hover:border-blue-200"
                        }`}
                      >
                        <div className="mt-0.5 shrink-0 p-1.5 rounded-lg bg-white shadow-2xs border border-slate-100">
                          {getNotificationIcon(n.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <p className="font-semibold text-slate-800 truncate">{n.title}</p>
                            <span className="text-[9px] text-slate-400 font-medium shrink-0">
                              {n.time}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed line-clamp-2">
                            {n.desc}
                          </p>
                        </div>
                      </Link>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
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
