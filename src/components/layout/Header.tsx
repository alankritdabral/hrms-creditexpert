"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { Bell, Clock, Search, AlertTriangle, Cake, CalendarCheck, LogOut, Shield, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/Badge";

export function Header() {
  const { currentUser, logout } = useAuth();
  const [time, setTime] = useState<string>("");
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setTime(
        now.toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
        })
      );
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  const notifications = [
    {
      id: "notif-1",
      icon: <AlertTriangle className="w-4 h-4 text-amber-500" />,
      title: "Document Expiry Alert",
      desc: "Sneha Patel's Passport / Visa expires in 29 days",
      time: "Action required",
      urgent: true,
    },
    {
      id: "notif-2",
      icon: <Cake className="w-4 h-4 text-blue-600" />,
      title: "Upcoming Birthday",
      desc: "Ananya Deshmukh celebrates birthday next week",
      time: "HR Notice",
      urgent: false,
    },
    {
      id: "notif-3",
      icon: <CalendarCheck className="w-4 h-4 text-indigo-600" />,
      title: "Pending Leave Requests",
      desc: "2 leave requests awaiting manager approval",
      time: "Today",
      urgent: false,
    },
  ];

  const roleStyles = {
    admin: { label: "ADMIN", color: "bg-blue-50 text-blue-700 border-blue-200" },
    hr: { label: "HR", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    employee: { label: "EMPLOYEE", color: "bg-purple-50 text-purple-700 border-purple-200" },
  };

  const roleMeta = roleStyles[currentUser.role] || { label: currentUser.role.toUpperCase(), color: "bg-slate-50 text-slate-700 border-slate-200" };

  return (
    <header className="sticky top-0 z-30 h-16 bg-white/95 backdrop-blur-md border-b border-slate-200 flex items-center justify-between px-6 shadow-xs">
      {/* Search Input */}
      <div className="flex items-center gap-3 w-72 sm:w-96">
        <div className="relative w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search employees, payroll, assets..."
            className="w-full bg-slate-50 border border-slate-200 text-xs text-slate-800 pl-9 pr-4 py-2 rounded-xl focus:outline-none focus:bg-white focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition-all placeholder:text-slate-400 font-medium"
          />
        </div>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-4">
        {/* Live Clock with Credit Expert India white and blue styling */}
        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-blue-50/80 border border-blue-100 text-xs font-mono text-blue-700 shadow-xs">
          <Clock className="w-3.5 h-3.5 text-blue-600" />
          <span>{time || "10:00:00 AM"} IST</span>
        </div>

        {/* Notifications Popover */}
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer border border-transparent hover:border-slate-200"
          >
            <Bell className="w-4 h-4" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white" />
          </button>

          {showNotifications && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowNotifications(false)} />
              <div className="absolute right-0 mt-2 w-80 rounded-2xl bg-white border border-slate-200 shadow-xl z-50 p-3 space-y-2">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 px-1">
                  <span className="text-xs font-semibold text-slate-800">Notifications & Alerts</span>
                  <span className="text-[10px] text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full font-medium border border-blue-200">
                    3 New
                  </span>
                </div>
                <div className="space-y-1.5">
                  {notifications.map((n) => (
                    <div
                      key={n.id}
                      className={`p-2.5 rounded-xl border text-xs flex gap-3 transition-colors ${
                        n.urgent
                          ? "bg-amber-50/60 border-amber-200 hover:bg-amber-50"
                          : "bg-slate-50 border-slate-100 hover:bg-blue-50/60"
                      }`}
                    >
                      <div className="mt-0.5">{n.icon}</div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-800">{n.title}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{n.desc}</p>
                        <p className="text-[10px] text-slate-400 mt-1">{n.time}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Authenticated Identity Pill: Role & Branch */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 shadow-2xs">
          <div className="flex items-center gap-1.5">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${roleMeta.color}`}>
              {roleMeta.label}
            </span>
            <span className="text-slate-300">|</span>
            <span className="text-[11px] font-semibold text-slate-700 flex items-center gap-1">
              <MapPin className="w-3 h-3 text-blue-600" />
              {currentUser.branch || "Delhi"}
            </span>
          </div>
        </div>

        {/* Current User Avatar & Profile */}
        <div className="flex items-center gap-2.5 pl-2 border-l border-slate-200">
          <img
            src={currentUser.avatar}
            alt={currentUser.name}
            className="w-8 h-8 rounded-full object-cover border-2 border-blue-600/30 shadow-xs"
          />
          <div className="hidden lg:block text-left">
            <p className="text-xs font-semibold text-slate-800 leading-tight">{currentUser.name}</p>
            <p className="text-[10px] text-blue-600 font-medium">{currentUser.department}</p>
          </div>

          {/* Secure Logout Button */}
          <button
            onClick={() => logout()}
            title="Sign out of HRMS"
            className="ml-1 p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all cursor-pointer border border-transparent hover:border-rose-200"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
