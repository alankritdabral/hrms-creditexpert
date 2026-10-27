"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useAuth } from "./auth-context";

export interface NotificationItem {
  id: string;
  type:
    | "attendance"
    | "leave"
    | "request"
    | "payroll"
    | "document"
    | "onboarding"
    | "announcement"
    | "login"
    | "holiday";
  title: string;
  desc: string;
  time: string;
  href: string;
  urgent?: boolean;
}

export interface SectionCounts {
  employees: number;
  activeOnboarding: number;
  pendingLeaves: number;
  pendingRequests: number;
  payrollReview: boolean;
  payrollStatus: string | null;
  payrollPeriod: string | null;
  expiringDocs: number;
  announcements: number;
  loginsCount: number;
  totalDisbursals: number;
}

const DEFAULT_COUNTS: SectionCounts = {
  employees: 0,
  activeOnboarding: 0,
  pendingLeaves: 0,
  pendingRequests: 0,
  payrollReview: false,
  payrollStatus: null,
  payrollPeriod: null,
  expiringDocs: 0,
  announcements: 0,
  loginsCount: 0,
  totalDisbursals: 0,
};

interface NotificationsContextType {
  counts: SectionCounts;
  notifications: NotificationItem[];
  unreadCount: number;
  isLoading: boolean;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  refresh: () => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextType | undefined>(undefined);

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [counts, setCounts] = useState<SectionCounts>(DEFAULT_COUNTS);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [readIds, setReadIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load read notifications from localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = localStorage.getItem("hrms_read_notifications");
      if (stored) {
        setReadIds(JSON.parse(stored));
      }
    } catch (e) {
      console.warn("Failed to load read notifications:", e);
    }
  }, []);

  const fetchNotifications = useCallback(async () => {
    if (!isAuthenticated) {
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/notifications");
      const json = await res.json();
      if (json.success && json.data) {
        setCounts(json.data.counts || DEFAULT_COUNTS);
        setNotifications(json.data.notifications || []);
      }
    } catch (e) {
      console.error("Error fetching live notifications:", e);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    fetchNotifications();

    // Poll every 30 seconds for live updates
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const markAsRead = (id: string) => {
    setReadIds((prev) => {
      if (prev.includes(id)) return prev;
      const updated = [...prev, id];
      try {
        localStorage.setItem("hrms_read_notifications", JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });
  };

  const markAllAsRead = () => {
    const allIds = notifications.map((n) => n.id);
    setReadIds(allIds);
    try {
      localStorage.setItem("hrms_read_notifications", JSON.stringify(allIds));
    } catch (e) {}
  };

  const unreadCount = notifications.filter((n) => !readIds.includes(n.id)).length;

  return (
    <NotificationsContext.Provider
      value={{
        counts,
        notifications,
        unreadCount,
        isLoading,
        markAsRead,
        markAllAsRead,
        refresh: fetchNotifications,
      }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error("useNotifications must be used within a NotificationsProvider");
  }
  return context;
}
