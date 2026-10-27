"use client";

import React, { Suspense, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { ShieldAlert, ArrowLeft } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { useAuth } from "@/lib/auth-context";
import { SidebarProvider } from "@/lib/sidebar-context";
import { NotificationsProvider } from "@/lib/notifications-context";
import { APP_SECTIONS } from "@/lib/types";

function AppShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, isLoading, currentUser, canAccessSection } = useAuth();

  const isAuthPage =
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/forgot-password";

  useEffect(() => {
    if (!isLoading && !isAuthenticated && !isAuthPage) {
      router.push(`/login?redirect=${encodeURIComponent(pathname)}`);
    }
  }, [isLoading, isAuthenticated, isAuthPage, pathname, router]);

  if (isAuthPage) {
    if (pathname === "/register" || pathname === "/forgot-password") {
      return <>{children}</>;
    }
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#f0f7ff] via-[#ffffff] to-[#e6f0fa] text-[#0a2540] flex items-center justify-center p-3 sm:p-4">
        <div className="w-full max-w-md">
          {children}
        </div>
      </div>
    );
  }

  // Guard protected routes: do not render children until authentication is verified
  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex flex-col items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-medium text-slate-500 font-mono tracking-wide">
            {isLoading ? "Verifying Credit Expert Workspace..." : "Redirecting to secure login..."}
          </p>
        </div>
      </div>
    );
  }

  const sectionKey = (() => {
    const segment = pathname.split("/").filter(Boolean)[0];
    if (!segment) return "dashboard";
    if (segment === "audit-logs") return "audit_logs";
    return segment;
  })();

  const isKnownSection = APP_SECTIONS.some((s) => s.id === sectionKey);
  const isSectionAllowed = !isKnownSection || canAccessSection(sectionKey);

  return (
    <SidebarProvider>
      <NotificationsProvider>
        <div className="flex min-h-screen bg-[#f8fafc] text-[#0a2540] antialiased">
          {/* Sidebar with Suspense boundary */}
          <Suspense
            fallback={
              <aside className="hidden lg:flex w-64 bg-white border-r border-slate-200 h-screen sticky top-0" />
            }
          >
            <Sidebar />
          </Suspense>

          {/* Main Content Area */}
          <div className="flex-1 flex flex-col min-w-0 w-full overflow-x-hidden">
            <Suspense fallback={<header className="h-16 bg-white border-b border-slate-200" />}>
              <Header />
            </Suspense>
            <main className="flex-1 p-3 sm:p-5 lg:p-8 max-w-7xl w-full mx-auto min-w-0 overflow-x-hidden">
              <Suspense
                fallback={
                  <div className="py-12 text-center text-slate-500 text-xs font-mono">
                    Loading Credit Expert Workspace...
                  </div>
                }
              >
                {!isSectionAllowed ? (
                  <div className="max-w-md mx-auto my-12 bg-white rounded-2xl border border-red-100 p-8 shadow-sm text-center">
                    <div className="w-14 h-14 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center mx-auto mb-4 text-red-600">
                      <ShieldAlert className="w-7 h-7" />
                    </div>
                    <h2 className="text-lg font-bold text-slate-900 mb-2">Access Restricted</h2>
                    <p className="text-xs text-slate-600 mb-6 leading-relaxed">
                      Your current role (<span className="font-semibold text-slate-800">{currentUser.role}</span>) does not have permission to view or manage the <span className="font-semibold text-slate-800">{APP_SECTIONS.find(s => s.id === sectionKey)?.name || sectionKey}</span> section. Please contact your system administrator to adjust your role access.
                    </p>
                    <Link
                      href="/dashboard"
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition-colors shadow-sm cursor-pointer"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      Back to Dashboard
                    </Link>
                  </div>
                ) : (
                  children
                )}
              </Suspense>
            </main>
          </div>
        </div>
      </NotificationsProvider>
    </SidebarProvider>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#f8fafc]" />}>
      <AppShellInner>{children}</AppShellInner>
    </Suspense>
  );
}
