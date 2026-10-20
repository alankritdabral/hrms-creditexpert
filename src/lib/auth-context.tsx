"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { User, UserRole, Branch, UserSession } from "./types";
import { Permission, hasPermission as checkPerm, getBranchScope } from "./permissions";
import { SEED_USERS } from "./db/seed-data";

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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User>(SEED_USERS[0]);
  const [session, setSession] = useState<UserSession | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [sessionRevokedError, setSessionRevokedError] = useState<string | null>(null);

  // Checks the active session status with the server
  const checkSession = useCallback(async () => {
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

          // If currently inside the application, redirect to login
          if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
            window.location.href = "/login?reason=another_device";
          }
        } else if (res.status === 401) {
          setIsAuthenticated(false);
          setSession(null);
        }
      }
    } catch (e) {
      console.warn("Session check error:", e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkSession();

    // Heartbeat every 12 seconds to instantly catch if user logged in on another device
    const interval = setInterval(checkSession, 12000);

    // Also check immediately when window / tab regains focus
    const onFocus = () => checkSession();
    window.addEventListener("focus", onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [checkSession]);

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);
    setSessionRevokedError(null);
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
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch (e) {
      console.warn("Logout error:", e);
    } finally {
      setIsAuthenticated(false);
      setSession(null);
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
