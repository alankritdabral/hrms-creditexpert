"use client";

import React, { Suspense, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { useAuth } from "@/lib/auth-context";
import { SidebarProvider } from "@/lib/sidebar-context";

function AppShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();

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
    if (pathname === "/register") {
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

  return (
    <SidebarProvider>
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
          <main className="flex-1 p-3.5 sm:p-5 lg:p-8 max-w-7xl w-full mx-auto min-w-0">
            <Suspense
              fallback={
                <div className="py-12 text-center text-slate-500 text-xs font-mono">
                  Loading Credit Expert Workspace...
                </div>
              }
            >
              {children}
            </Suspense>
          </main>
        </div>
      </div>
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
