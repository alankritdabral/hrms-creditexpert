"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { User, UserRole, Branch, UserSession } from "./types";
import { Permission, hasPermission as checkPerm, getBranchScope, canRoleAccessSection } from "./permissions";

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
  canAccessSection: (sectionId: string) => boolean;
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

  // Intercept client fetch to automatically attach x-session-id redundancy and handle auth drops
  useEffect(() => {
    if (typeof window === "undefined") return;

    const originalFetch = window.fetch;
    const interceptedFetch: typeof window.fetch = async (input, init) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
          ? input.toString()
          : (input as Request).url;

      // Attach x-session-id to all internal /api/ requests if present in localStorage
      if (url.startsWith("/api/") && !url.startsWith("/api/auth/login")) {
        const storedSessionId = localStorage.getItem("hrms_session_id");
        if (storedSessionId) {
          const reqHeaders = new Headers(
            init?.headers ||
              (typeof input === "object" && "headers" in input
                ? (input as Request).headers
                : undefined) ||
              {}
          );
          if (!reqHeaders.has("x-session-id")) {
            reqHeaders.set("x-session-id", storedSessionId);
          }
          init = {
            ...init,
            headers: reqHeaders,
            credentials: init?.credentials || "same-origin",
          };
        }
      }

      const response = await originalFetch(input, init);

      // Handle 401 responses on internal APIs gracefully
      if (response.status === 401 && url.startsWith("/api/") && !url.startsWith("/api/auth/session")) {
        try {
          const clone = response.clone();
          const body = await clone.json();
          if (body?.code === "SESSION_REVOKED") {
            setSessionRevokedError(
              body.error || "Your session has ended because your account was signed in from another device."
            );
            setIsAuthenticated(false);
            setSession(null);
            setCurrentUser(ANONYMOUS_USER);
            localStorage.removeItem("hrms_session_id");
            if (!window.location.pathname.startsWith("/login")) {
              isNavigatingRef.current = true;
              window.location.href = "/login?reason=another_device";
            }
          } else if (body?.code === "SESSION_EXPIRED" || body?.code === "UNAUTHENTICATED") {
            setIsAuthenticated(false);
            setSession(null);
            setCurrentUser(ANONYMOUS_USER);
            localStorage.removeItem("hrms_session_id");
            if (!window.location.pathname.startsWith("/login")) {
              isNavigatingRef.current = true;
              window.location.href = "/login?reason=session_expired";
            }
          }
        } catch {
          // Response body was not JSON or already consumed
        }
      }

      return response;
    };

    window.fetch = interceptedFetch;

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  // Checks the active session status with the server
  const checkSession = useCallback(async () => {
    if (isNavigatingRef.current || isCheckingRef.current) return;
    isCheckingRef.current = true;

    try {
      const cachedSessionId =
        typeof window !== "undefined" ? localStorage.getItem("hrms_session_id") : null;
      const headers: Record<string, string> = {};
      if (cachedSessionId) {
        headers["x-session-id"] = cachedSessionId;
      }

      const res = await fetch("/api/auth/session", { headers });
      const data = await res.json();

      if (res.ok && data.success && data.user) {
        setCurrentUser(data.user);
        setSession(data.session);
        setIsAuthenticated(true);
        setSessionRevokedError(null);
        if (typeof window !== "undefined" && data.session?.sessionId) {
          localStorage.setItem("hrms_session_id", data.session.sessionId);
        }
      } else {
        // Enforce Single Active Session detection:
        if (data.code === "SESSION_REVOKED") {
          const reasonMsg =
            data.error || "Your session has ended because your account was signed in from another device.";
          setSessionRevokedError(reasonMsg);
          setIsAuthenticated(false);
          setSession(null);
          setCurrentUser(ANONYMOUS_USER);
          if (typeof window !== "undefined") {
            localStorage.removeItem("hrms_session_id");
          }

          // If currently inside the application, redirect to login
          if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
            isNavigatingRef.current = true;
            window.location.href = "/login?reason=another_device";
          }
        } else {
          // ANY unauthenticated response (res.status === 401 OR data.authenticated === false)
          setIsAuthenticated(false);
          setSession(null);
          setCurrentUser(ANONYMOUS_USER);
          if (typeof window !== "undefined") {
            localStorage.removeItem("hrms_session_id");
          }
        }
      }
    } catch (e: unknown) {
      // Ignore network abort/cancellation caused by window navigation, unmount, or tab unload
      if (
        isNavigatingRef.current ||
        (e && typeof e === "object" && "name" in e && (e as { name: string }).name === "AbortError") ||
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
    const timer = setTimeout(() => {
      checkSession();
    }, 0);
    return () => clearTimeout(timer);
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
      if (typeof window !== "undefined" && data.session?.sessionId) {
        localStorage.setItem("hrms_session_id", data.session.sessionId);
      }
      return { success: true };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Network error";
      return { success: false, error: msg };
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
        localStorage.removeItem("hrms_session_id");
        window.location.href = "/login";
      }
    }
  };

  // Admin and HR have full system access in current version
  const canAccess = (allowedRoles: (UserRole | string)[]) => {
    if (currentUser.role === "admin" || currentUser.role === "hr") return true;
    return allowedRoles.includes(currentUser.role);
  };

  const canAccessSection = useCallback(
    (sectionId: string): boolean => {
      if (currentUser.role === "admin") return true;
      if (currentUser.allowedSections && currentUser.allowedSections.length > 0) {
        return currentUser.allowedSections.includes(sectionId);
      }
      return canRoleAccessSection(currentUser.role, sectionId, currentUser.allowedSections);
    },
    [currentUser.role, currentUser.allowedSections]
  );

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
        canAccessSection,
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
