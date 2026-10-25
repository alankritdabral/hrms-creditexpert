"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { User, UserRole, Branch, UserSession } from "./types";
import { Permission, hasPermission as checkPerm, getBranchScope } from "./permissions";

const ANONYMOUS_USER: User = {
  id: "guest",
  name: "Guest",
  email: "",
  role: "employee",
  employeeId: "",
  branch: "Delhi",
  department: "Unassigned",
  avatar: "/img/logo.webp",
};

interface AuthContextType {
  currentUser: User;
  session: UserSession | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  sessionRevokedError: string | null;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  canAccess: (allowedRoles: (UserRole | string)[]) => boolean;
  hasPermission: (permission: Permission) => boolean;
  branchScope: Branch[];
  refreshSession: () => Promise<void>;
  updateCurrentUserAvatar: (avatarUrl: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User>(ANONYMOUS_USER);
  const [session, setSession] = useState<UserSession | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [sessionRevokedError, setSessionRevokedError] = useState<string | null>(null);

  const isCheckingRef = useRef(false);
  const isNavigatingRef = useRef(false);

  // Checks the active session status with the server
  const checkSession = useCallback(async () => {
    if (isNavigatingRef.current || isCheckingRef.current) return;
    isCheckingRef.current = true;

    try {
      const res = await fetch("/api/auth/session");
      const data = await res.json();

      if (res.ok && data.success) {
        setCurrentUser(data.user);
        setSession(data.session);
        setIsAuthenticated(true);
        setSessionRevokedError(null);
      } else {
        // Enforce Single Active Session detection:
        if (data.code === "SESSION_REVOKED") {
          const reasonMsg =
            data.error || "Your session has ended because your account was signed in from another device.";
          setSessionRevokedError(reasonMsg);
          setIsAuthenticated(false);
          setSession(null);
          setCurrentUser(ANONYMOUS_USER);

          // If currently inside the application, redirect to login
          if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
            isNavigatingRef.current = true;
            window.location.href = "/login?reason=another_device";
          }
        } else if (res.status === 401) {
          setIsAuthenticated(false);
          setSession(null);
          setCurrentUser(ANONYMOUS_USER);
        }
      }
    } catch (e: any) {
      // Ignore network abort/cancellation caused by window navigation, unmount, or tab unload
      if (
        isNavigatingRef.current ||
        e?.name === "AbortError" ||
        (e instanceof TypeError && e.message?.toLowerCase().includes("failed to fetch"))
      ) {
        return;
      }
      console.warn("Session check error:", e);
    } finally {
      isCheckingRef.current = false;
      setIsLoading(false);
    }
  }, []);

  // Initial check on mount
  useEffect(() => {
    checkSession();
  }, [checkSession]);

  // Periodic heartbeat & tab focus check only when authenticated and on protected pages
  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    const currentPath = typeof window !== "undefined" ? window.location.pathname : "";
    const isAuthPage =
      currentPath.startsWith("/login") ||
      currentPath.startsWith("/register") ||
      currentPath.startsWith("/forgot-password");

    // Don't poll heartbeat if user is on a public auth page
    if (isAuthPage) {
      return;
    }

    // Heartbeat every 15 seconds to catch if user logged in on another device
    const interval = setInterval(() => {
      if (!isNavigatingRef.current && !isCheckingRef.current) {
        checkSession();
      }
    }, 15000);

    // Also check when window / tab regains focus
    const onFocus = () => {
      if (
        !isNavigatingRef.current &&
        !isCheckingRef.current &&
        typeof document !== "undefined" &&
        document.visibilityState === "visible"
      ) {
        checkSession();
      }
    };

    window.addEventListener("focus", onFocus);
    window.addEventListener("visibilitychange", onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("visibilitychange", onFocus);
    };
  }, [checkSession, isAuthenticated]);

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);
    setSessionRevokedError(null);
    isNavigatingRef.current = false;

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        return { success: false, error: data.error || "Login failed" };
      }

      setCurrentUser(data.user);
      setSession(data.session);
      setIsAuthenticated(true);
      setSessionRevokedError(null);
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message || "Network error" };
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    isNavigatingRef.current = true;
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch (e) {
      console.warn("Logout error:", e);
    } finally {
      setIsAuthenticated(false);
      setSession(null);
      setCurrentUser(ANONYMOUS_USER);
      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
    }
  };

  // Admin and HR have full system access in current version
  const canAccess = (allowedRoles: (UserRole | string)[]) => {
    if (currentUser.role === "admin" || currentUser.role === "hr") return true;
    return allowedRoles.includes(currentUser.role);
  };

  const checkPermission = (permission: Permission) => {
    return checkPerm(currentUser.role, permission);
  };

  const updateCurrentUserAvatar = useCallback((avatarUrl: string) => {
    setCurrentUser((prev) => ({ ...prev, avatar: avatarUrl }));
  }, []);

  const branchScope = getBranchScope(currentUser.role, currentUser.branch);

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        session,
        isAuthenticated,
        isLoading,
        sessionRevokedError,
        login,
        logout,
        canAccess,
        hasPermission: checkPermission,
        branchScope,
        refreshSession: checkSession,
        updateCurrentUserAvatar,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
